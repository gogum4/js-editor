import { Extension } from "@tiptap/core";

import { MAX_INDENT, normalizeIndent } from "@gogum4/editor-schema/indent";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** 선택한 문단·제목의 들여쓰기를 한 단계 늘린다(최대 8단계). 들여쓸 블록이 없으면 하지 않는다. */
      increaseIndent: () => ReturnType;
      /** 한 단계 줄인다. 이미 들여쓰지 않았으면 하지 않는다. */
      decreaseIndent: () => ReturnType;
      /** 단계를 정한다(null이면 들여쓰기를 푼다). */
      setIndent: (level: number | null) => ReturnType;
    };
  }
}

/** 들여쓰기를 둘 수 있는 블록. */
const INDENTABLE = new Set(["paragraph", "heading"]);
/** 안의 문단은 들여쓰지 않는다: 목록은 Tab이 중첩이고, 표 셀은 Tab이 칸 이동이다. */
const NOT_IN = new Set(["listItem", "taskItem", "tableCell", "tableHeader"]);

/**
 * 문단·제목별 들여쓰기(`indent` 속성, 1~8단계). 한 단계는 2em이고 문단마다 단계가 달라도 된다(1단계 다음에 3단계).
 * 단축키는 Tab(늘리기)·Shift+Tab(줄이기)이다 — 목록·표·코드 블록의 Tab이 먼저 처리하고, 그 밖의 문단·제목에서 동작한다.
 * 들여쓰지 않은 것은 속성을 저장하지 않는다. `createCoreExtensions({ indent: true })`로 켠다 — 속성을 더하는 것이므로
 * 본문을 저장하는 소비자는 본문 스키마 버전을 올려야 한다(노트 앱은 켜지 않는다).
 */
export const Indent = Extension.create({
  name: "indent",
  // 목록(sinkListItem)·표(칸 이동)·코드 블록의 Tab 처리가 먼저 돌게 낮은 우선순위로 둔다.
  priority: 50,

  addGlobalAttributes() {
    return [
      {
        types: [...INDENTABLE],
        attributes: {
          indent: {
            default: null,
            parseHTML: (element) => normalizeIndent(element.getAttribute("data-indent")),
            renderHTML: (attributes) => {
              const level = normalizeIndent(attributes.indent);
              return level === null ? {} : { "data-indent": String(level), style: `margin-left: ${level * 2}em` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const change =
      (next: (current: number | null) => number | null) =>
      () =>
      ({ state, tr, dispatch }: { state: import("@tiptap/pm/state").EditorState; tr: import("@tiptap/pm/state").Transaction; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void }) => {
        let changed = false;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent) => {
          if (!INDENTABLE.has(node.type.name)) return true;
          if (parent && NOT_IN.has(parent.type.name)) return false;
          const current = normalizeIndent(node.attrs.indent);
          const after = next(current);
          if (after !== current) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: after });
            changed = true;
          }
          return false;
        });
        if (changed) dispatch?.(tr);
        return changed;
      };
    return {
      increaseIndent: change((current) => Math.min(MAX_INDENT, (current ?? 0) + 1)),
      decreaseIndent: change((current) => (current === null || current <= 1 ? null : current - 1)),
      setIndent: (level) => change(() => normalizeIndent(level))(),
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.increaseIndent(),
      "Shift-Tab": () => this.editor.commands.decreaseIndent(),
    };
  },
});
