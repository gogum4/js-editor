import { type Editor, Extension } from "@tiptap/core";
import { Fragment, type Node as PmNode, Slice } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, Selection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { yUndoPluginKey } from "@tiptap/y-tiptap";

import { type ImportContext, markdownToDoc } from "@gogum4/editor-markdown";
import { blockKey } from "@gogum4/editor-schema/blockId";
import type { PmNode as PmJson } from "@gogum4/editor-schema/pmDoc";
import { looksLikeMarkdown } from "../markdown/looksLikeMarkdown";

/** 방금 변환해 붙인 것의 기록. 문서가 바뀌거나 선택이 옮겨 가면 사라진다. */
export interface PendingPaste {
  /** 붙여넣기 전의 선택 범위(붙여넣기가 바꾼 자리). */
  selFrom: number;
  selTo: number;
  /** 붙여넣기 전의 문서. 표준 되돌리기가 정확히 이 문서로 돌렸는지 확인하는 데 쓴다. */
  before: PmNode;
  /** 붙여넣은 원문. */
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
 * 붙여넣기를 표준 되돌리기로 취소한 **뒤의** 상태에서, 취소된 자리에 원문(일반 텍스트)을 넣는 트랜잭션.
 * 되돌린 문서가 붙여넣기 전 문서와 다르면(되돌리기가 다른 것까지 되돌렸거나 덜 되돌렸다면) null — 엉뚱한 자리에 글을 넣지 않는다.
 */
export function markdownPasteRawInsert(stateAfterUndo: EditorState, pending: PendingPaste): Transaction | null {
  // 블록 id는 되돌리기 뒤에 다시 매겨질 수 있어서 id와 null 속성을 뺀 모양으로 비교한다.
  if (blockKey(stateAfterUndo.doc.toJSON() as PmJson) !== blockKey(pending.before.toJSON() as PmJson)) return null;
  const tr = stateAfterUndo.tr.replaceRange(pending.selFrom, pending.selTo, plainSlice(stateAfterUndo, pending.raw));
  // 커서는 넣은 글의 끝에 둔다.
  const end = tr.mapping.map(pending.selTo, 1);
  return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size)), -1)).setMeta(markdownPasteKey, null).scrollIntoView();
}

/**
 * 방금 변환해 붙인 것을 취소하고 붙여넣은 원문(일반 텍스트)을 대신 넣는다. 방금 붙인 게 없거나 되돌릴 수 없으면 false(보통의 되돌리기로 넘어간다).
 * 붙여넣기는 표준 되돌리기로 취소하므로, 원문 삽입은 되돌리기 기록에 새 단계로 남고 그 다음 Ctrl+Z가 붙여넣기 전으로 돌아간다.
 *
 * TipTap 명령(`addCommands`)으로 만들면 안 된다: 명령이 끝난 뒤 `CommandManager`가 명령 시작 시점의 상태로 만든 트랜잭션을 디스패치하는데,
 * 그 사이 되돌리기와 원문 삽입이 문서를 바꿔서 "mismatched transaction" 오류가 난다. 그래서 일반 함수다.
 */
export function revertMarkdownPaste(editor: Editor): boolean {
  const pending = markdownPasteKey.getState(editor.state);
  if (!pending) return false;
  // 1) 표준 되돌리기로 붙여넣기를 취소한다 (Yjs는 관찰자가 문서를 바로 갱신한다).
  if (typeof editor.commands.undo !== "function" || !editor.commands.undo()) return false;
  // 2) 되돌려진 상태에서 원문을 새 편집으로 넣는다. 되돌린 문서가 예상과 다르면 넣지 않는다(이미 되돌렸으니 true).
  const tr = markdownPasteRawInsert(editor.state, pending);
  if (tr) editor.view.dispatch(tr);
  return true;
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
 * 붙여넣기가 앞선 입력과 한 되돌리기 단계로 합쳐지지 않게 단계를 끊는다. 합쳐지면 되돌릴 때 앞선 입력까지 사라져
 * 원문을 넣을 자리가 어긋난다. ProseMirror history(`closeHistory`)와 Yjs UndoManager 둘 다 처리한다.
 */
function closeUndoGroup(state: EditorState, tr: Transaction): Transaction {
  yUndoPluginKey.getState(state)?.undoManager?.stopCapturing();
  return tr.setMeta("closeHistory", true);
}

/**
 * Markdown 텍스트를 붙여넣으면 서식으로 바꾼다 (docs/MARKDOWN-DIALECT.md).
 * - 클립보드에 HTML이 없고(`text/plain`만 있고) 글이 Markdown처럼 보일 때만 바꾼다. 에디터 안에서 복사한 것·웹 페이지처럼 HTML이 있으면 건드리지 않는다.
 * - Ctrl+Shift+V(일반 텍스트로 붙여넣기)와 코드 블록·인라인 코드 안에서는 바꾸지 않는다.
 * - 바꾼 직후 **첫 Ctrl+Z는 원문(일반 텍스트)으로 되돌리고**, 두 번째 Ctrl+Z가 붙여넣기 전으로 돌아간다.
 *   첫 단계는 표준 되돌리기로 붙여넣기를 취소한 뒤 원문을 새 편집으로 넣는 것이다 — 그래서 되돌리기 기록은 `[원문 삽입]`만 남는다
 *   (원문으로 "바꿔 넣는" 편집을 기록에 더하면 두 번째 Ctrl+Z가 변환된 내용을 되살린다).
 * - 변환 중 오류가 나거나 스키마에 맞지 않으면 기본 붙여넣기로 넘어간다(글을 잃지 않는다).
 */
export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
  name: "markdownPaste",
  // Collaboration(우선순위 1000)의 Ctrl+Z보다 먼저 받아야 한다. TipTap은 우선순위가 같으면 **나중에 등록된** 확장의 단축키를 먼저 실행하므로
  // (Collaboration은 목록 맨 뒤) 같은 값으로는 진다. 값을 바꾸면 `markdownPaste.test.ts`의 우선순위 시험이 알려 준다.
  priority: 1100,

  addOptions: () => ({ context: {} }),

  addKeyboardShortcuts() {
    return { "Mod-z": () => revertMarkdownPaste(this.editor) };
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
            // 붙여넣기 직후 다른 플러그인이 덧붙이는 트랜잭션(블록 id 부여, 끝 문단 보장 등)은 같은 동작의 일부다.
            if (tr.getMeta("appendedTransaction") && value) return value;
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
            const { $from, from, to } = view.state.selection;
            if ($from.parent.type.spec.code || $from.marks().some((mark) => mark.type.name === "code")) return false;
            try {
              const { doc: json } = markdownToDoc(raw, context, "");
              const doc = view.state.schema.nodeFromJSON(json);
              doc.check();
              const before = view.state.doc;
              const tr = closeUndoGroup(view.state, view.state.tr.replaceSelection(convertedSlice(doc)).scrollIntoView());
              view.dispatch(tr.setMeta("paste", true).setMeta("uiEvent", "paste").setMeta(markdownPasteKey, { selFrom: from, selTo: to, before, raw }));
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
