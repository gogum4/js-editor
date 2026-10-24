import type { Editor } from "@tiptap/core";
import { create } from "zustand";

import { collectFootnotes, FOOTNOTE_NODE } from "@9um4/editor-core";
import type { FootnoteEditState } from "@9um4/editor-core";

// 각주 편집 창의 저장소와 여는 함수. zustand는 React를 끌어오므로 화면 쪽 파일이다(core의 확장은 `uiOf(editor).openFootnoteEditor`로 부른다).

export const useFootnoteEditStore = create<{ edit: FootnoteEditState | null }>()(() => ({ edit: null }));

/** 각주 노드의 위치에서 편집 창을 연다. 그 자리에 각주가 없으면 아무 일도 하지 않는다. */
export function openFootnoteEditor(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== FOOTNOTE_NODE) return;
  const number = collectFootnotes(editor.state.doc).findIndex((note) => note.pos === pos) + 1;
  const { left, top, bottom } = editor.view.coordsAtPos(pos);
  useFootnoteEditStore.setState({
    edit: { editor, pos, number: Math.max(number, 1), original: String(node.attrs.text ?? ""), rect: { left, top, bottom } },
  });
}

export function closeFootnoteEditor(): void {
  useFootnoteEditStore.setState({ edit: null });
}
