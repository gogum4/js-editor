import { Extension } from "@tiptap/core";

import { normalizeTextAlign, type TextAlignment } from "@9um4-utils/editor-schema/textAlign";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textAlign: {
      /** 지금 문단(선택한 문단들)의 정렬을 바꾼다. 왼쪽은 기본이라 속성을 없앤다. */
      setTextAlign: (alignment: TextAlignment) => ReturnType;
      /** 정렬을 풀어 왼쪽(기본)으로 되돌린다. */
      unsetTextAlign: () => ReturnType;
    };
  }
}

/** 정렬을 둘 수 있는 블록. 목록·인용·콜아웃 안의 문단도 문단이라 포함된다. 이미지도 같은 `textAlign` 속성을 쓴다(양쪽 맞춤은 이미지에는 없다). */
const ALIGNABLE = ["paragraph", "heading", "image"];

/**
 * 문단별 정렬(왼쪽·가운데·오른쪽·양쪽). 문단과 제목에 `textAlign` 속성을 더하고 인라인 `text-align` 스타일로 그린다.
 * 단축키는 Ctrl/⌘+Shift+L(왼쪽)·E(가운데)·R(오른쪽)·J(양쪽)이고, `/정렬`로도 고른다. 이미지 블록을 선택하고 누르면 이미지가 정렬된다.
 * 왼쪽(기본)은 속성을 저장하지 않는다. 엔터로 문단을 나누면 새 문단도 같은 정렬을 이어받는다.
 */
export const TextAlign = Extension.create({
  name: "textAlign",

  addGlobalAttributes() {
    return [
      {
        types: ALIGNABLE,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element) => normalizeTextAlign(element.style.textAlign),
            renderHTML: (attributes) => {
              const alignment = normalizeTextAlign(attributes.textAlign);
              return alignment === null ? {} : { style: `text-align: ${alignment}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const apply =
      (alignment: TextAlignment | null) =>
      ({ commands }: { commands: { updateAttributes: (type: string, attrs: Record<string, unknown>) => boolean } }) =>
        ALIGNABLE.map((type) =>
          // 이미지는 양쪽 맞춤이 없으므로 건드리지 않는다(선택한 이미지에 Ctrl+Shift+J를 눌러도 그대로).
          type === "image" && alignment === "justify" ? true : commands.updateAttributes(type, { textAlign: alignment === "left" ? null : alignment }),
        ).every(Boolean);
    return {
      setTextAlign: (alignment) => apply(alignment),
      unsetTextAlign: () => apply(null),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-Shift-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-Shift-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-Shift-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
});
