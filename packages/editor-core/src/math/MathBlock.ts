import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { findEmptyMathBlock, openMathEditor } from "./mathEdit";
import { MathBlockView } from "./MathView";

/**
 * 한 줄을 차지하는 LaTeX 수식(`$$ … $$`). 본문에는 LaTeX 글자(`latex`)만 저장한다. 한 덩어리(atom)라서 선택하고 Backspace로 지우거나
 * 끌어서 옮기고, 누르면 편집 창이 열린다. 줄 맨 앞에서 `$$`와 공백을 치거나 `/수식`으로 만든다.
 */
export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex") ?? "",
        renderHTML: (attributes) => ({ "data-latex": String(attributes.latex ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-math-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-math-block": "" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },

  addInputRules() {
    const editor = this.editor;
    return [
      new InputRule({
        // 줄 맨 앞의 `$$`와 공백
        find: /^\$\$\s$/,
        handler: ({ chain, range }) => {
          chain().deleteRange(range).insertContent({ type: "mathBlock", attrs: { latex: "" } }).run();
          // 끼운 빈 수식의 편집 창을 연다(입력 규칙이 끝난 뒤에 위치를 찾는다).
          setTimeout(() => {
            const pos = findEmptyMathBlock(editor);
            if (pos !== null) openMathEditor(editor, pos);
          }, 0);
        },
      }),
    ];
  },
});
