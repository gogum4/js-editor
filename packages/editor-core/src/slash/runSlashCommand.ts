import type { ChainedCommands, Editor, Range } from "@tiptap/core";

import { type CalloutType, isCalloutType } from "@gogum4/editor-schema/callout";
import { openImagePicker } from "../image/insertImages";
import { findEmptyMathBlock } from "../math/mathEdit";
import { uiOf } from "../ports/editorPorts";

/** 앱이 더한 슬래시 항목의 동작. `chain`은 입력한 `/검색어`를 이미 지운 상태다. */
export type SlashHandlers = Record<string, (editor: Editor, chain: ChainedCommands) => boolean>;

/**
 * `/` 메뉴에서 고른 항목대로 블록을 만든다.
 * 먼저 입력한 `/검색어`를 지우고, 그 줄을 항목에 맞는 블록으로 바꾼다.
 * 알 수 없는 id면 아무것도 바꾸지 않고 false를 돌려준다.
 */
export function runSlashCommand(editor: Editor, range: Range, id: string, handlers: SlashHandlers = {}): boolean {
  const chain = editor.chain().focus().deleteRange(range);

  // 앱이 더한 항목(페이지 링크·동기화 블록 등)은 앱이 만든 동작으로 처리한다.
  const custom = handlers[id];
  if (custom) return custom(editor, chain);

  const heading = /^heading([1-6])$/.exec(id);
  if (heading) {
    return chain.setHeading({ level: Number(heading[1]) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  }

  if (id.startsWith("callout-")) {
    const type = id.slice("callout-".length);
    if (!isCalloutType(type)) return false;
    return chain.setCallout(type as CalloutType).run();
  }

  switch (id) {
    case "paragraph":
      return chain.setParagraph().run();
    case "bulletList":
      return chain.toggleBulletList().run();
    case "orderedList":
      return chain.toggleOrderedList().run();
    case "taskList":
      return chain.toggleTaskList().run();
    case "blockquote":
      return chain.toggleBlockquote().run();
    case "codeBlock":
      return chain.setCodeBlock().run();
    case "table":
      // 3×3, 맨 윗줄이 머리글인 표. 표 안(셀)에서는 만들 수 없다(셀에는 문단만 들어간다).
      return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    case "toggle":
      return chain.setToggle().run();
    case "horizontalRule":
      return chain.setHorizontalRule().run();
    case "alignLeft":
      return chain.setTextAlign("left").run();
    case "alignCenter":
      return chain.setTextAlign("center").run();
    case "alignRight":
      return chain.setTextAlign("right").run();
    case "alignJustify":
      return chain.setTextAlign("justify").run();
    case "image": {
      // `/이미지`를 지운 뒤 파일 고르는 창을 연다. 고른 이미지는 커서 자리에 끼운다.
      const ok = chain.run();
      if (ok) openImagePicker(editor);
      return ok;
    }
    case "embed":
      // 주소를 적는 빈 카드를 끼운다(카드가 입력 상자를 보여 주고 포커스를 받는다).
      return chain.insertEmptyEmbed().run();
    case "mathBlock": {
      // 빈 수식 블록을 끼우고 LaTeX를 적는 창을 연다(내용 없이 닫으면 지워진다).
      const ok = chain.insertContent({ type: "mathBlock", attrs: { latex: "" } }).run();
      if (ok) {
        const pos = findEmptyMathBlock(editor);
        if (pos !== null) uiOf(editor).openMathEditor(editor, pos);
      }
      return ok;
    }
    case "mathInline": {
      const ok = chain.insertContent({ type: "mathInline", attrs: { latex: "" } }).run();
      if (ok) uiOf(editor).openMathEditor(editor, editor.state.selection.from - 1);
      return ok;
    }
    case "footnote": {
      // 커서 자리에 빈 각주를 끼우고 내용을 적는 창을 연다(내용 없이 닫으면 지워진다).
      const ok = chain.insertContent({ type: "footnote", attrs: { text: "" } }).run();
      if (ok) uiOf(editor).openFootnoteEditor(editor, editor.state.selection.from - 1);
      return ok;
    }
    default:
      return false;
  }
}
