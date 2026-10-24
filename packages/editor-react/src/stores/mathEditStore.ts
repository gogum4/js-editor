import type { Editor } from "@tiptap/core";
import { create } from "zustand";

import { isMathNode, MATH_BLOCK_NODE, type MathEditState } from "@gogum4/editor-core";

// 수식 편집 창의 저장소와 여는 함수. zustand는 React를 끌어오므로 화면 쪽 파일이다(core의 확장은 `uiOf(editor).openMathEditor`로 부른다).

export const useMathEditStore = create<{ edit: MathEditState | null }>()(() => ({ edit: null }));

/** 수식 노드의 위치에서 편집 창을 연다. 그 자리에 수식이 없으면 아무 일도 하지 않는다. */
export function openMathEditor(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || !isMathNode(node.type.name)) return;
  const { left, top, bottom } = editor.view.coordsAtPos(pos);
  useMathEditStore.setState({
    edit: {
      editor,
      pos,
      display: node.type.name === MATH_BLOCK_NODE,
      original: String(node.attrs.latex ?? ""),
      rect: { left, top, bottom },
    },
  });
}

export function closeMathEditor(): void {
  useMathEditStore.setState({ edit: null });
}
