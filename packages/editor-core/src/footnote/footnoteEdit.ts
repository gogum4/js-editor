import type { Editor } from "@tiptap/core";

import { FOOTNOTE_NODE } from "./footnotes";

/** 열려 있는 각주 편집 창의 상태(저장소는 화면 쪽 `footnoteEditStore.ts`). 입력창은 에디터 바깥(`FootnoteEditorHost`)에 그려서 한글 조합이 에디터 안의 중첩 편집과 섞이지 않게 한다. */
export interface FootnoteEditState {
  editor: Editor;
  /** 각주 노드의 위치. */
  pos: number;
  /** 문서 순서의 번호(1부터). */
  number: number;
  /** 열 때의 내용. 빈 글자면 방금 만든 각주다. */
  original: string;
  rect: { left: number; top: number; bottom: number };
}

/** 각주의 내용을 바꾼다. 빈 글자면 각주를 지운다. 그 자리에 각주가 없으면 false. */
export function setFootnoteText(editor: Editor, pos: number, text: string): boolean {
  const next = text.trim();
  return editor
    .chain()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node || node.type.name !== FOOTNOTE_NODE) return false;
      if (next === "") tr.delete(pos, pos + node.nodeSize);
      else if (node.attrs.text !== next) tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: next });
      return true;
    })
    .run();
}
