import type { Editor } from "@tiptap/core";

export const MATH_INLINE_NODE = "mathInline";
export const MATH_BLOCK_NODE = "mathBlock";

export const isMathNode = (name: string) => name === MATH_INLINE_NODE || name === MATH_BLOCK_NODE;

/**
 * 열려 있는 수식 편집 창의 상태(저장소는 화면 쪽 `mathEditStore.ts`). 입력창은 에디터 바깥(`MathEditorHost`)에 그려서 한글 조합이 에디터 안의 중첩 편집과 섞이지 않게 한다
 * (각주 창과 같은 방식).
 */
export interface MathEditState {
  editor: Editor;
  /** 수식 노드의 위치. */
  pos: number;
  /** 인라인 수식(한 줄)인지 블록 수식(여러 줄 가능)인지. */
  display: boolean;
  /** 열 때의 LaTeX. 비어 있으면 방금 만든 수식이다. */
  original: string;
  rect: { left: number; top: number; bottom: number };
}

/** 수식의 LaTeX를 바꾼다. 빈 글자면 수식을 지운다. 그 자리에 수식이 없으면 false. */
export function setMathLatex(editor: Editor, pos: number, latex: string): boolean {
  const next = latex.trim();
  return editor
    .chain()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node || !isMathNode(node.type.name)) return false;
      if (next === "") tr.delete(pos, pos + node.nodeSize);
      else if (node.attrs.latex !== next) tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex: next });
      return true;
    })
    .run();
}

/**
 * 방금 끼운 빈 수식(블록)의 위치: 커서에서 가장 가까운 빈 `mathBlock`. 슬래시 명령이 끼운 직후 편집 창을 열 때 쓴다
 * (블록 노드는 끼운 뒤 커서가 어디로 가는지가 상황마다 달라서 위치를 직접 찾는다).
 */
export function findEmptyMathBlock(editor: Editor): number | null {
  const head = editor.state.selection.head;
  let best: { pos: number; distance: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === MATH_BLOCK_NODE && String(node.attrs.latex ?? "") === "") {
      const distance = Math.abs(pos - head);
      if (!best || distance < best.distance) best = { pos, distance };
    }
    return true;
  });
  return best ? (best as { pos: number }).pos : null;
}
