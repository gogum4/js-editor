import { type Editor, Extension, InputRule, mergeAttributes, Node } from "@tiptap/core";

import {
  CITATION_IN_TEXT_SOURCE,
  citationKeys,
  emojiFromShortcode,
  isSkippedTag,
  normalizeCitationSource,
  normalizeCommentText,
  normalizeTag,
  TAG_BODY_SOURCE,
} from "@gogum4/editor-schema/extras";
import { portsOf, stringsOf } from "../ports/editorPorts";

/** 클릭하면 입력 상자로 바뀌어 글을 고치는 인라인 노드의 공통 화면(React 없이 DOM). 입력이 비면 노드를 지운다. */
function editableChipView(options: {
  className: string;
  show: (value: string) => string;
  read: (node: { attrs: Record<string, unknown> }) => string;
  commit: (input: string) => Record<string, unknown> | null;
  attr: string;
  placeholder: (editor: Editor) => string;
  title?: (editor: Editor) => string;
}) {
  return ({ node: initial, editor, getPos }: { node: { attrs: Record<string, unknown> }; editor: Editor; getPos: () => number | undefined }) => {
    let node = initial;
    const dom = document.createElement("span");
    dom.className = options.className;
    dom.contentEditable = "false";

    const render = () => {
      dom.replaceChildren();
      dom.textContent = options.show(options.read(node));
      if (options.title) dom.title = options.title(editor);
    };

    const edit = () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = `${options.className}-input`;
      input.value = options.read(node);
      input.placeholder = options.placeholder(editor);
      input.size = Math.max(12, input.value.length + 2);
      let done = false;
      const finish = (save: boolean) => {
        if (done) return;
        done = true;
        const pos = getPos();
        if (pos === undefined) return;
        const text = input.value.trim();
        if (!save) {
          render();
          dom.replaceChildren(dom.textContent ?? "");
          editor.commands.focus();
          return;
        }
        if (text === "") {
          editor.view.dispatch(editor.state.tr.delete(pos, pos + 1));
          editor.commands.focus();
          return;
        }
        const next = options.commit(text);
        if (next === null) {
          render();
          return;
        }
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, [options.attr]: next[options.attr] }));
        editor.commands.focus();
      };
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      });
      input.addEventListener("blur", () => finish(true));
      dom.replaceChildren(input);
      queueMicrotask(() => input.focus());
    };

    dom.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey) return;
      if (dom.querySelector("input")) return;
      event.preventDefault();
      edit();
    });
    render();
    return {
      dom,
      update(next: { type: unknown; attrs: Record<string, unknown> }) {
        node = next;
        if (!dom.querySelector("input")) render();
        return true;
      },
      stopEvent: (event: Event) => event.target instanceof HTMLInputElement,
      ignoreMutation: () => true,
    };
  };
}

/** 주석 `%%글%%`: 편집기에서는 흐리게 보이고, 렌더러에서는 숨는다. 클릭해서 고친다. */
export const Comment = Node.create({
  name: "comment",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-text") ?? "",
        renderHTML: (attributes) => ({ "data-text": String(attributes.text ?? "") }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-comment]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes({ "data-comment": "", class: "md-comment" }, HTMLAttributes), `%%${String(node.attrs.text ?? "")}%%`],

  addNodeView() {
    return editableChipView({
      className: "md-comment",
      show: (text) => `%%${text.replace(/\s*\n\s*/g, " ")}%%`,
      read: (node) => String(node.attrs.text ?? ""),
      commit: (input) => {
        const text = normalizeCommentText(input);
        return text === null ? null : { text };
      },
      attr: "text",
      placeholder: (editor) => stringsOf(editor).extras.comment.placeholder,
      title: (editor) => stringsOf(editor).extras.comment.edit,
    });
  },

  addInputRules() {
    return [
      new InputRule({
        find: /%%([^%\n]+)%%$/,
        handler: ({ state, range, match }) => {
          const text = normalizeCommentText(match[1]);
          if (text === null) return null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ text }));
        },
      }),
    ];
  },
});

/** 태그 `#태그`: 글자가 아니라 한 덩어리. 띄어쓰기를 치면 `#이름`이 태그가 된다. */
export const Tag = Node.create<{ skipHexColors: boolean }>({
  name: "tag",
  addOptions: () => ({ skipHexColors: false }),
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: "",
        parseHTML: (element) => normalizeTag(element.getAttribute("data-tag")) ?? "",
        renderHTML: (attributes) => ({ "data-tag": String(attributes.name ?? "") }),
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-tag]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["span", mergeAttributes({ class: "md-tag" }, HTMLAttributes), `#${String(node.attrs.name ?? "")}`],

  addInputRules() {
    return [
      new InputRule({
        find: new RegExp(`(?:^|\\s)#(${TAG_BODY_SOURCE})\\s$`, "u"),
        handler: ({ state, range, match }) => {
          const name = normalizeTag(match[1]);
          if (name === null || isSkippedTag(name, { tags: { skipHexColors: this.options.skipHexColors } })) return null;
          // 앞의 공백은 남기고 `#이름`만 태그로 바꾼다. 방금 친 공백은 태그 뒤에 남긴다.
          const start = range.from + match[0].indexOf("#");
          state.tr.replaceWith(start, range.to, [this.type.create({ name }), state.schema.text(" ")]);
        },
      }),
    ];
  },
});

/** 인용 `[@citekey]`(Pandoc/Zotero). 칩에는 원문이나 소비자가 해석한 글(Smith 2020)이 보이고, Ctrl/⌘+클릭으로 원본을 연다. */
export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: "",
        parseHTML: (element) => normalizeCitationSource(element.getAttribute("data-citation")) ?? "",
        renderHTML: (attributes) => ({ "data-citation": String(attributes.source ?? "") }),
      },
    };
  },
  parseHTML: () => [{ tag: "cite[data-citation]" }],
  renderHTML: ({ node, HTMLAttributes }) => ["cite", mergeAttributes({ class: "md-citation" }, HTMLAttributes), `[${String(node.attrs.source ?? "")}]`],

  addNodeView() {
    const editor = this.editor;
    const view = editableChipView({
      className: "md-citation",
      show: (source) => `[${source}]`,
      read: (node) => String(node.attrs.source ?? ""),
      commit: (input) => {
        const source = normalizeCitationSource(input);
        return source === null ? null : { source };
      },
      attr: "source",
      placeholder: (e) => stringsOf(e).extras.citation.placeholder,
      title: (e) => stringsOf(e).extras.citation.edit,
    });
    return (props) => {
      const result = view(props);
      const dom = result.dom as HTMLElement;
      const source = () => String(props.node.attrs.source ?? "");
      // 소비자가 키를 사람이 읽는 글로 풀어 주면 칩에 그 글을 보인다.
      const label = portsOf(editor).citations?.label;
      if (label) {
        void label(citationKeys(source()))
          .then((text) => {
            if (text && !dom.querySelector("input")) dom.textContent = `[${text}]`;
          })
          .catch(() => {});
      }
      // Ctrl/⌘+클릭: 첫 키의 원본을 연다. 그냥 클릭은 고치기(editableChipView).
      dom.addEventListener(
        "click",
        (event) => {
          const open = portsOf(editor).citations?.open;
          if (!(event.ctrlKey || event.metaKey) || !open) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const key = citationKeys(source())[0];
          if (key) void open(key);
        },
        true,
      );
      return result;
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: new RegExp(`${CITATION_IN_TEXT_SOURCE}$`),
        handler: ({ state, range, match }) => {
          const source = normalizeCitationSource(match[1]);
          if (source === null) return null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ source }));
        },
      }),
    ];
  },
});

/** 이모지 단축 코드: `:smile:`을 치면 😄으로 바뀐다(모르는 이름은 그대로). 이모지는 그냥 글자라 스키마에 노드를 더하지 않고 입력 규칙만 쓴다. */
export const EmojiShortcodes = Extension.create({
  name: "emojiShortcodes",
  addInputRules() {
    return [
      new InputRule({
        find: /(?<![\w:]):([a-z0-9_+-]{1,40}):$/i,
        handler: ({ state, range, match }) => {
          const emoji = emojiFromShortcode(match[1] ?? "");
          if (emoji === null) return null;
          state.tr.insertText(emoji, range.from, range.to);
        },
      }),
    ];
  },
});
