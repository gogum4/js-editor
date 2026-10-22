import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { type CalloutType, calloutTypeFromName, DEFAULT_CALLOUT_TYPE, normalizeCalloutType } from "@9um4/editor-schema/callout";
import { CalloutView } from "./CalloutView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** 지금 블록을 콜아웃으로 감싼다. 이미 콜아웃 안이면 종류만 바꾼다. */
      setCallout: (type?: CalloutType) => ReturnType;
    };
  }
}

/** 색과 아이콘이 있는 강조 블록. 안에는 다른 블록(문단, 목록 등)을 넣을 수 있다. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: {
        default: DEFAULT_CALLOUT_TYPE,
        parseHTML: (element) => normalizeCalloutType(element.getAttribute("data-callout")),
        renderHTML: (attributes) => ({ "data-callout": normalizeCalloutType(attributes.type) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ class: "callout" }, HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  /**
   * Markdown처럼 `> `로 인용을 만든 뒤 첫 줄에 `[!NOTE] `(종류 이름 뒤에 공백)를 치면 그 인용이 콜아웃이 된다.
   * 인용 안 **첫 문단의 맨 앞**에서만 동작한다. 모르는 이름이나 다른 자리에서는 아무것도 하지 않는다(글자 그대로 남는다).
   */
  addInputRules() {
    return [
      new InputRule({
        find: /^\[!([A-Za-z]+)\]\s$/,
        handler: ({ state, range, match }) => {
          const type = calloutTypeFromName(match[1] ?? "");
          if (type === null) return null;
          const $from = state.doc.resolve(range.from);
          const depth = $from.depth;
          if (depth < 2 || $from.parent.type.name !== "paragraph") return null;
          if ($from.node(depth - 1).type.name !== "blockquote" || $from.index(depth - 1) !== 0) return null;
          state.tr.delete(range.from, range.to).setNodeMarkup($from.before(depth - 1), this.type, { type });
        },
      }),
    ];
  },

  addCommands() {
    return {
      setCallout:
        (type = DEFAULT_CALLOUT_TYPE) =>
        ({ state, commands }) => {
          // 콜아웃 안에서는 겹쳐 만들지 않고 종류만 바꾼다.
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === this.name) {
              return commands.updateAttributes(this.name, { type });
            }
          }
          return commands.wrapIn(this.name, { type });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // 콜아웃 맨 앞에서 Backspace를 누르면 첫 블록을 콜아웃 밖으로 꺼낸다 (콜아웃을 풀어 일반 글로).
      Backspace: ({ editor }) => {
        const { empty, $from } = editor.state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        const inCallout = $from.depth >= 2 && $from.node($from.depth - 1).type.name === this.name;
        const isFirstBlock = inCallout && $from.index($from.depth - 1) === 0;
        return isFirstBlock ? editor.commands.lift(this.name) : false;
      },
    };
  },
});
