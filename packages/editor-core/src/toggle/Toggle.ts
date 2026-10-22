import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { ToggleView } from "./ToggleView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toggle: {
      /** 지금 문단(선택한 블록들)을 토글로 감싼다. 첫 문단이 토글의 제목 줄이 된다. */
      setToggle: () => ReturnType;
    };
  }
}

/**
 * 접는 블록. **첫 자식은 제목 줄(문단 하나)** 이고 나머지(`block*`)가 접히는 내용이다.
 * 열림 여부는 문서에 저장하지 않는다 — 이 컴퓨터의 설정에 블록 id별로 둔다(`toggleStore`, `@9um4/editor-schema/toggleState`).
 * `/토글`로 만든다. 제목 줄 끝에서 Enter를 치면 내용의 첫 문단이 생긴다.
 */
export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "paragraph block*",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-toggle]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-toggle": "" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },

  addCommands() {
    return {
      setToggle:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
    };
  },
});
