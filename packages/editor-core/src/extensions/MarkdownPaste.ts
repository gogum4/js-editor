import { Extension } from "@tiptap/core";
import { type Node as PmNode, Fragment, Slice } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { type ImportContext, markdownToDoc } from "@9um4/editor-markdown";
import { looksLikeMarkdown } from "../markdown/looksLikeMarkdown";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markdownPaste: {
      /** 방금 Markdown으로 변환해 붙인 것을 붙여넣은 원문(일반 텍스트)으로 되돌린다. 방금 붙인 게 없으면 false. */
      revertMarkdownPaste: () => ReturnType;
    };
  }
}

/** 원문으로 되돌리는 트랜잭션. 방금 변환해 붙인 것이 없으면 null. */
export function markdownPasteRevert(state: EditorState): Transaction | null {
  const pending = markdownPasteKey.getState(state);
  if (!pending) return null;
  return state.tr.replaceRange(pending.from, pending.to, plainSlice(state, pending.raw)).setMeta(markdownPasteKey, null).scrollIntoView();
}

/** 방금 변환해 붙인 구간과 그 원문. 문서가 바뀌거나 선택이 옮겨 가면 사라진다. */
interface PendingPaste {
  from: number;
  to: number;
  raw: string;
}

export const markdownPasteKey = new PluginKey<PendingPaste | null>("markdownPaste");

export interface MarkdownPasteOptions {
  /** 위키 링크·이미지를 어디서 찾는지. 비워 두면 못 찾는 것으로 보고 글자로 둔다. */
  context: Partial<ImportContext>;
}

const NO_PAGE_OR_IMAGE: ImportContext = { resolvePage: () => null, resolveImage: () => null };

/** 일반 텍스트 붙여넣기와 같은 모양(줄마다 문단)의 조각. */
function plainSlice(state: EditorState, text: string): Slice {
  const { schema } = state;
  const lines = text.split(/(?:\r\n?|\n)+/);
  if (lines.length === 1) return new Slice(Fragment.from(schema.text(lines[0] ?? "")), 0, 0);
  const paragraphs = lines.map((line) => schema.nodes.paragraph!.create(null, line === "" ? undefined : schema.text(line)));
  return new Slice(Fragment.from(paragraphs), 1, 1);
}

/**
 * Ctrl+Shift+V(일반 텍스트로 붙여넣기)인지. prosemirror-view가 기록해 두는 값이라 공개 API가 아니다 —
 * 읽을 수 없으면(화면 없는 에디터 등) 일반 붙여넣기가 아닌 것으로 본다.
 */
function plainPasteRequested(view: EditorView): boolean {
  try {
    return Boolean((view as unknown as { input?: { shiftKey?: boolean } }).input?.shiftKey);
  } catch {
    return false;
  }
}

/** 변환한 문서를 붙여넣을 조각으로. 문단 하나뿐이면 지금 문단 안에 이어 붙고, 아니면 앞뒤 문단과 열린 채로 이어진다. */
function convertedSlice(doc: PmNode): Slice {
  const first = doc.firstChild;
  if (doc.childCount === 1 && first?.type.name === "paragraph") return new Slice(first.content, 0, 0);
  const open = (node: PmNode | null | undefined) => (node?.isTextblock ? 1 : 0);
  return new Slice(doc.content, open(doc.firstChild), open(doc.lastChild));
}

/**
 * Markdown 텍스트를 붙여넣으면 서식으로 바꾼다 (docs/MARKDOWN-DIALECT.md).
 * - 클립보드에 HTML이 없고(`text/plain`만 있고) 글이 Markdown처럼 보일 때만 바꾼다. 에디터 안에서 복사한 것·웹 페이지처럼 HTML이 있으면 건드리지 않는다.
 * - Ctrl+Shift+V(일반 텍스트로 붙여넣기)와 코드 블록·인라인 코드 안에서는 바꾸지 않는다.
 * - 바꾼 직후 **첫 Ctrl+Z는 원문(일반 텍스트)으로 되돌리고**, 두 번째 Ctrl+Z가 붙여넣기 자체를 취소한다.
 * - 변환 중 오류가 나거나 스키마에 맞지 않으면 기본 붙여넣기로 넘어간다(글을 잃지 않는다).
 */
export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
  name: "markdownPaste",
  // Collaboration의 되돌리기보다 먼저 Ctrl+Z를 받아야 한다.
  priority: 1000,

  addOptions: () => ({ context: {} }),

  addCommands() {
    return {
      revertMarkdownPaste:
        () =>
        ({ state, dispatch }) => {
          const tr = markdownPasteRevert(state);
          if (!tr) return false;
          dispatch?.(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return { "Mod-z": () => this.editor.commands.revertMarkdownPaste() };
  },

  addProseMirrorPlugins() {
    const context: ImportContext = { ...NO_PAGE_OR_IMAGE, ...this.options.context };
    return [
      new Plugin<PendingPaste | null>({
        key: markdownPasteKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(markdownPasteKey) as PendingPaste | null | undefined;
            if (meta !== undefined) return meta;
            // 붙여넣기 직후 다른 플러그인이 덧붙이는 트랜잭션(블록 id 부여, 끝 문단 보장 등)은 같은 동작의 일부라서 위치만 맞춘다.
            if (tr.getMeta("appendedTransaction") && value) return { ...value, from: tr.mapping.map(value.from), to: tr.mapping.map(value.to, -1) };
            // 다른 편집이나 선택 이동이 있으면 "방금 붙인 것"이 아니다.
            return tr.docChanged || tr.selectionSet ? null : value;
          },
        },
        props: {
          handlePaste(view: EditorView, event: ClipboardEvent) {
            const data = event.clipboardData;
            if (!data || data.getData("text/html") !== "") return false;
            if (plainPasteRequested(view)) return false;
            const raw = data.getData("text/plain");
            if (!looksLikeMarkdown(raw)) return false;
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code || $from.marks().some((mark) => mark.type.name === "code")) return false;
            try {
              const { doc: json } = markdownToDoc(raw, context, "");
              const doc = view.state.schema.nodeFromJSON(json);
              doc.check();
              const from = view.state.selection.from;
              const tr = view.state.tr.replaceSelection(convertedSlice(doc)).scrollIntoView();
              // 바뀐 구간(원문으로 되돌릴 때 바꿔 넣을 곳).
              let start = Infinity;
              let end = -Infinity;
              tr.mapping.maps.forEach((map) =>
                map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                  start = Math.min(start, newStart);
                  end = Math.max(end, newEnd);
                }),
              );
              if (start === Infinity) return false;
              view.dispatch(tr.setMeta("paste", true).setMeta("uiEvent", "paste").setMeta(markdownPasteKey, { from: Math.min(start, from), to: end, raw }));
              return true;
            } catch {
              return false;
            }
          },
        },
      }),
    ];
  },
});
