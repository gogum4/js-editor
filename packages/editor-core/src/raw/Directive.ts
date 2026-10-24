import { mergeAttributes, Node } from "@tiptap/core";

import { isContainerOpener } from "@gogum4/editor-markdown";
import { stringsOf } from "../ports/editorPorts";

/**
 * 컨테이너 디렉티브(블로그 방언의 `:::indent{n=1}` … `:::`처럼 에디터가 구조를 모르는 것): 안쪽 블록은 평소처럼 고치고,
 * 여는 줄(`head`)은 원문 그대로 간직해서 내보낸다(docs/EDITOR-PACKAGE.md P6-2). `createCoreExtensions({ raw: true })`로 켠다.
 * 화면은 React 없이 DOM: 위쪽에 여는 줄을 입력칸으로 보이고 아래에 안쪽 내용이 온다. 여는 줄을 컨테이너 문법에 맞지 않게 고치면 되돌린다.
 */
export const Directive = Node.create({
  name: "directive",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      head: {
        default: ":::indent",
        parseHTML: (element) => element.getAttribute("data-head") ?? ":::indent",
        renderHTML: (attributes) => ({ "data-head": String(attributes.head ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-directive]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-directive": "", class: "md-directive" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial;
      const strings = stringsOf(editor).raw;
      const dom = document.createElement("div");
      dom.className = "md-directive";
      dom.setAttribute("data-directive", "");
      const bar = document.createElement("div");
      bar.className = "md-directive-head";
      bar.contentEditable = "false";
      const input = document.createElement("input");
      input.className = "md-directive-input";
      input.spellcheck = false;
      input.setAttribute("aria-label", strings.directiveLabel);
      input.value = String(node.attrs.head ?? "");
      bar.appendChild(input);
      const contentDOM = document.createElement("div");
      contentDOM.className = "md-directive-body";
      dom.append(bar, contentDOM);

      const commit = () => {
        const value = input.value.trim();
        const pos = getPos();
        if (!isContainerOpener(value) || typeof pos !== "number") {
          input.value = String(node.attrs.head ?? ""); // 문법에 맞지 않으면 되돌린다
          return;
        }
        if (value !== node.attrs.head) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, head: value }));
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") input.value = String(node.attrs.head ?? "");
      });

      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          if (document.activeElement !== input) input.value = String(next.attrs.head ?? "");
          return true;
        },
        stopEvent: (event) => event.target === input,
        ignoreMutation: (mutation) => bar.contains(mutation.target),
      };
    };
  },
});
