import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { MathInlineView } from "./MathView";

/** 닫는 `$`를 치는 순간 `$…$`를 인라인 수식으로 바꾼다. 여는 `$` 바로 뒤와 닫는 `$` 바로 앞은 공백이 아니어야 한다(문장 속 `$`와 구별). */
export const INLINE_MATH_PATTERN = /(?:^|[\s(])\$([^$\s](?:[^$\n]*[^$\s])?)\$$/;

/** 숫자·쉼표·점만 있으면 수식이 아니라 금액(`$5 … $10$`)으로 본다. */
export function looksLikeMoney(text: string): boolean {
  return /^[\d.,]+$/.test(text);
}

/**
 * 문장 안의 LaTeX 수식. 본문에는 **LaTeX 글자(`latex`)만** 저장하고 그림은 KaTeX가 그때그때 그린다.
 * 한 덩어리(atom)라서 커서가 안으로 들어가지 않고, 누르면 에디터 바깥의 편집 창이 열린다. `$x^2$`를 치거나 `/인라인수식`으로 만든다.
 */
export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
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
    return [{ tag: "span[data-math-inline]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-math-inline": "" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView, { as: "span" });
  },

  addInputRules() {
    const type = this.type;
    return [
      new InputRule({
        find: INLINE_MATH_PATTERN,
        handler: ({ state, range, match }) => {
          const latex = match[1] ?? "";
          if (latex === "" || looksLikeMoney(latex)) return null;
          // 맞춘 글자 앞의 공백·여는 괄호는 남기고 `$…$`만 수식으로 바꾼다.
          const start = range.from + match[0].indexOf("$");
          state.tr.replaceWith(start, range.to, type.create({ latex }));
        },
      }),
    ];
  },
});
