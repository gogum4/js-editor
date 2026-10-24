// 시험 도구: 화면(DOM) 없이 에디터의 타이핑·붙여넣기·플러그인 상태를 흉내 낸다. 소비자의 시험에서도 쓸 수 있게 `@9um4/editor-core/testing`으로 공개한다.
import { type AnyExtension, Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { createCoreExtensions } from "../coreExtensions";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** 화면 없이 쓰는 시험용 에디터(위키 없는 core 확장; `extensions`를 주면 그 목록). */
export function newEditor(content: object = EMPTY_DOC, extensions: AnyExtension[] = createCoreExtensions(null)): Editor {
  return new Editor({ extensions, content });
}

/**
 * 글자를 하나씩 쳐 넣는다. 브라우저의 입력처럼 먼저 `handleTextInput`(입력 규칙이 여기서 동작한다)에 맡기고,
 * 처리되지 않으면 그대로 글자를 넣는다. 입력 규칙은 이렇게 한 글자씩 칠 때만 동작하므로 \`insertContent\`로는 시험할 수 없다.
 */
export function typeText(editor: Editor, text: string): void {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const insert = () => editor.state.tr.insertText(ch, from, to);
    // 화면이 없는 에디터는 상태에 플러그인이 없고 view가 `someProp`을 지원하지 않아서, 확장이 만든 플러그인의 `handleTextInput`을 순서대로 직접 부른다(ProseMirror가 하는 일과 같다).
    let handled = false;
    for (const plugin of editor.extensionManager.plugins) {
      const handle = plugin.props.handleTextInput;
      if (handle && handle.call(plugin, editor.view, from, to, ch, insert)) {
        handled = true;
        break;
      }
    }
    if (!handled) editor.view.dispatch(insert());
  }
}

/** 첫 블록의 모양을 사람이 읽기 쉽게: 종류(속성)와 글자. */
export function firstBlock(editor: Editor): { type: string; attrs: Record<string, unknown>; text: string } {
  const node = editor.state.doc.firstChild!;
  const attrs = Object.fromEntries(Object.entries(node.attrs).filter(([key, value]) => key !== "id" && value !== null));
  return { type: node.type.name, attrs, text: node.textContent };
}

/**
 * 붙여넣기를 흉내 낸다: 확장이 만든 플러그인의 `handlePaste`를 순서대로 부른다(처리됐으면 true).
 * 처리되지 않으면 아무것도 넣지 않는다 — 기본 붙여넣기는 ProseMirror의 몫이라 여기서 흉내 내지 않는다.
 */
export function pasteText(editor: Editor, text: string, html = ""): boolean {
  const event = { clipboardData: { getData: (type: string) => (type === "text/plain" ? text : type === "text/html" ? html : "") } } as unknown as ClipboardEvent;
  for (const plugin of editor.extensionManager.plugins) {
    const handle = plugin.props.handlePaste;
    if (handle && handle.call(plugin, editor.view, event, Slice.empty)) return true;
  }
  return false;
}

/**
 * 확장의 플러그인이 **실제로 붙은** 상태(화면 없는 `Editor`의 `state`에는 플러그인이 없다)와, 그 상태만 아는 가짜 view.
 * 플러그인 상태(예: "방금 붙인 것")까지 시험할 때 쓴다.
 */
export function liveState(editor: Editor) {
  let state = EditorState.create({ schema: editor.schema, doc: editor.state.doc, plugins: editor.extensionManager.plugins });
  const view = {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  } as unknown as EditorView;
  const text = (node = state.doc) => {
    const out: string[] = [];
    node.forEach((child) => out.push(child.textContent));
    return out;
  };
  const types = () => {
    const out: string[] = [];
    state.doc.forEach((child) => out.push(child.type.name));
    return out;
  };
  return {
    view,
    get state() {
      return state;
    },
    select: (pos: number) => view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos))),
    paste(plain: string, html = ""): boolean {
      const event = { clipboardData: { getData: (type: string) => (type === "text/plain" ? plain : type === "text/html" ? html : "") } } as unknown as ClipboardEvent;
      for (const plugin of state.plugins) {
        const handle = plugin.props.handlePaste;
        if (handle && handle.call(plugin, view, event, Slice.empty)) return true;
      }
      return false;
    },
    texts: () => text(),
    types,
  };
}
