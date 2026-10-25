import { type Editor, Mark, markInputRule, mergeAttributes } from "@tiptap/core";

import { colorsFromStyle, normalizeAbbrTitle, normalizeColor } from "@gogum4/editor-schema/extras";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    extraMarks: {
      toggleHighlight: () => ReturnType;
      toggleSuperscript: () => ReturnType;
      toggleSubscript: () => ReturnType;
      toggleInsert: () => ReturnType;
      /** 글자색을 정한다(#rgb·#rrggbb나 기본 색 이름). 올바르지 않은 색이면 아무것도 하지 않는다. 선택이 없으면 이어서 칠 글자에 적용된다. */
      setTextColor: (color: string) => ReturnType;
      unsetTextColor: () => ReturnType;
      setBackgroundColor: (color: string) => ReturnType;
      unsetBackgroundColor: () => ReturnType;
      /** 선택한 글자를 약어로 만든다(마우스를 올리면 설명이 보인다). */
      setAbbr: (title: string) => ReturnType;
      unsetAbbr: () => ReturnType;
      toggleKbd: () => ReturnType;
    };
  }
}

/** 형광펜: `==글==`. 서식 안의 서식(굵게 등)과 함께 쓸 수 있다. */
export const Highlight = Mark.create({
  name: "highlight",
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ HTMLAttributes }) => ["mark", mergeAttributes({ class: "md-highlight" }, HTMLAttributes), 0],
  addCommands() {
    return { toggleHighlight: () => ({ commands }) => commands.toggleMark(this.name) };
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-h": () => this.editor.commands.toggleHighlight() };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(==(?![\s=])([^=\n]*[^\s=])==)$/, type: this.type })];
  },
});

export const Superscript = Mark.create({
  name: "superscript",
  excludes: "subscript",
  // 각주 번호도 `sup`이라 구별한다.
  parseHTML: () => [{ tag: "sup:not([data-footnote])" }],
  renderHTML: ({ HTMLAttributes }) => ["sup", mergeAttributes({ class: "md-sup" }, HTMLAttributes), 0],
  addCommands() {
    return { toggleSuperscript: () => ({ commands }) => commands.toggleMark(this.name) };
  },
  addKeyboardShortcuts() {
    return { "Mod-.": () => this.editor.commands.toggleSuperscript() };
  },
  addInputRules() {
    // Pandoc 표기 `x^2^`: 공백 없는 글만.
    return [markInputRule({ find: /(\^([^\s^]+)\^)$/, type: this.type })];
  },
});

export const Subscript = Mark.create({
  name: "subscript",
  excludes: "superscript",
  parseHTML: () => [{ tag: "sub" }],
  renderHTML: ({ HTMLAttributes }) => ["sub", mergeAttributes({ class: "md-sub" }, HTMLAttributes), 0],
  addCommands() {
    return { toggleSubscript: () => ({ commands }) => commands.toggleMark(this.name) };
  },
  addKeyboardShortcuts() {
    return { "Mod-,": () => this.editor.commands.toggleSubscript() };
  },
});

/** 키보드 키: `<kbd>Ctrl</kbd>`. 코드 마크와 달리 다른 서식과 함께 쓸 수 있다. */
export const Kbd = Mark.create({
  name: "kbd",
  parseHTML: () => [{ tag: "kbd" }],
  renderHTML: ({ HTMLAttributes }) => ["kbd", mergeAttributes({ class: "md-kbd" }, HTMLAttributes), 0],
  addCommands() {
    return { toggleKbd: () => ({ commands }) => commands.toggleMark(this.name) };
  },
});

/** 삽입(밑줄과 다른 "추가된 글"): `++글++`·`<ins>`. */
export const Insert = Mark.create({
  name: "insert",
  parseHTML: () => [{ tag: "ins" }],
  renderHTML: ({ HTMLAttributes }) => ["ins", mergeAttributes({ class: "md-ins" }, HTMLAttributes), 0],
  addCommands() {
    return { toggleInsert: () => ({ commands }) => commands.toggleMark(this.name) };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(\+\+(?![\s+])([^+\n]*[^\s+])\+\+)$/, type: this.type })];
  },
});

/** 글자색: `<span style="color:#rrggbb">`. 색은 정리된 #rrggbb만 저장한다. */
export const TextColor = Mark.create({
  name: "textColor",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => colorsFromStyle(element.getAttribute("style") ?? "").color,
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span", getAttrs: (element) => (colorsFromStyle(element.getAttribute("style") ?? "").color === null ? false : null) }];
  },
  renderHTML({ mark }) {
    const color = normalizeColor(mark.attrs.color);
    return ["span", color === null ? {} : { style: `color: ${color}`, "data-text-color": color }, 0];
  },
  addCommands() {
    return {
      setTextColor: (color) => ({ commands }) => (normalizeColor(color) === null ? false : commands.setMark(this.name, { color: normalizeColor(color) })),
      unsetTextColor: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

/** 배경색: `<span style="background-color:#rrggbb">`. */
export const BackgroundColor = Mark.create({
  name: "backgroundColor",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => colorsFromStyle(element.getAttribute("style") ?? "").background,
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span", getAttrs: (element) => (colorsFromStyle(element.getAttribute("style") ?? "").background === null ? false : null) }];
  },
  renderHTML({ mark }) {
    const color = normalizeColor(mark.attrs.color);
    return ["span", color === null ? {} : { style: `background-color: ${color}`, "data-background-color": color }, 0];
  },
  addCommands() {
    return {
      setBackgroundColor: (color) => ({ commands }) => (normalizeColor(color) === null ? false : commands.setMark(this.name, { color: normalizeColor(color) })),
      unsetBackgroundColor: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

/** 약어: `<abbr title="설명">`. 문서의 `*[HTML]: 설명` 정의는 가져올 때 이 마크로 바뀐다. */
export const Abbr = Mark.create({
  name: "abbr",
  inclusive: false,
  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (element) => normalizeAbbrTitle(element.getAttribute("title")) ?? "",
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML: () => [{ tag: "abbr" }],
  renderHTML({ mark }) {
    const title = normalizeAbbrTitle(mark.attrs.title);
    return ["abbr", mergeAttributes({ class: "md-abbr" }, title === null ? {} : { title }), 0];
  },
  addCommands() {
    return {
      setAbbr: (title) => ({ commands }) => (normalizeAbbrTitle(title) === null ? false : commands.setMark(this.name, { title: normalizeAbbrTitle(title) })),
      unsetAbbr: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

/** 편집기에서 지금 선택에 마크가 걸려 있는지. */
export function isMarkActive(editor: Editor, name: string): boolean {
  return editor.isActive(name);
}
