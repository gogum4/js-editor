import { Editor } from "@tiptap/core";

import { createCoreExtensions } from "../coreExtensions";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** 화면 없이 쓰는 시험용 에디터(위키 없는 core 확장). */
export function newEditor(content: object = EMPTY_DOC): Editor {
  return new Editor({ extensions: createCoreExtensions(null), content });
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
