import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";

import { stringsOf } from "../ports/editorPorts";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    extraBlocks: {
      /** 목차 블록을 끼운다. */
      insertToc: () => ReturnType;
      /** 용어 하나와 설명 하나가 든 정의 목록을 끼운다. */
      insertDefinitionList: () => ReturnType;
    };
  }
}

/** 정의 목록: 용어(`definitionTerm`) 다음에 설명(`definitionDetail`)이 하나 이상. */
export const DefinitionList = Node.create({
  name: "definitionList",
  group: "block",
  content: "(definitionTerm definitionDetail+)+",
  defining: true,
  parseHTML: () => [{ tag: "dl" }],
  renderHTML: ({ HTMLAttributes }) => ["dl", mergeAttributes({ class: "md-dl" }, HTMLAttributes), 0],

  addCommands() {
    return {
      insertDefinitionList:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [
              { type: "definitionTerm" },
              { type: "definitionDetail" },
            ],
          }),
    };
  },

  // 정의 목록 둘이 바로 이어지면 Markdown에서는 구별되지 않아 한 목록으로 읽힌다 — 편집기에서도 하나로 합쳐 화면과 파일이 같게 한다.
  addProseMirrorPlugins() {
    const name = this.name;
    return [
      new Plugin({
        key: new PluginKey("definitionListMerge"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          // 이웃한 정의 목록 사이의 자리(두 목록 사이의 위치)를 모은다. 문서 루트의 내용은 0에서, 다른 노드의 내용은 그 노드 시작 + 1에서 시작한다.
          const boundaries: number[] = [];
          const scan = (parent: PmNode, base: number) => {
            parent.forEach((child, offset, index) => {
              if (index > 0 && child.type.name === name && parent.child(index - 1).type.name === name) boundaries.push(base + offset);
            });
          };
          scan(newState.doc, 0);
          newState.doc.descendants((node, pos) => {
            scan(node, pos + 1);
          });
          const unique = [...new Set(boundaries)].filter((pos) => canJoin(newState.doc, pos)).sort((a, b) => b - a);
          if (unique.length === 0) return null;
          const tr = newState.tr;
          for (const pos of unique) tr.join(pos);
          return tr;
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    const inside = (editor: Editor, names: readonly string[]) => names.includes(editor.state.selection.$from.parent.type.name);
    return {
      // 용어에서 Enter: 바로 아래에 설명을 만든다.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        if (inside(editor, ["definitionTerm"])) {
          const after = $from.after();
          const detail = editor.schema.nodes.definitionDetail!.create();
          const tr = editor.state.tr.insert(after, detail);
          // 이미 설명이 이어지면 그 앞에 새 설명을 끼운 것이므로 커서는 새 설명으로.
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
          editor.view.dispatch(tr.scrollIntoView());
          return true;
        }
        // 빈 설명에서 Enter: 목록을 빠져나와 아래에 빈 문단을 만든다(설명이 하나뿐이면 목록 안에 남긴다).
        if (inside(editor, ["definitionDetail"]) && $from.parent.content.size === 0) {
          const list = $from.node($from.depth - 1);
          if (list.type.name !== this.name) return false;
          const listEnd = $from.after($from.depth - 1);
          const tr = editor.state.tr.delete($from.before(), $from.after());
          const insertAt = tr.mapping.map(listEnd);
          tr.insert(insertAt, editor.schema.nodes.paragraph!.create());
          tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
          editor.view.dispatch(tr.scrollIntoView());
          return true;
        }
        return false;
      },
    };
  },
});

export const DefinitionTerm = Node.create({
  name: "definitionTerm",
  content: "inline*",
  defining: true,
  parseHTML: () => [{ tag: "dt" }],
  renderHTML: ({ HTMLAttributes }) => ["dt", mergeAttributes({ class: "md-dt" }, HTMLAttributes), 0],
});

export const DefinitionDetail = Node.create({
  name: "definitionDetail",
  content: "inline*",
  defining: true,
  parseHTML: () => [{ tag: "dd" }],
  renderHTML: ({ HTMLAttributes }) => ["dd", mergeAttributes({ class: "md-dd" }, HTMLAttributes), 0],
});

interface HeadingInfo {
  level: number;
  text: string;
  pos: number;
}

function headingsOf(doc: PmNode): HeadingInfo[] {
  const list: HeadingInfo[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim() !== "") list.push({ level: Number(node.attrs.level) || 1, text: node.textContent.trim(), pos });
    return node.type.name !== "heading";
  });
  return list;
}

/** 목차 `[toc]`: 저장하는 것은 자리뿐이고, 목록은 문서의 제목들로 그때그때 그려진다. 항목을 누르면 그 제목으로 이동한다. */
export const Toc = Node.create({
  name: "toc",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML: () => [{ tag: "nav[data-toc]" }],
  renderHTML: ({ HTMLAttributes }) => ["nav", mergeAttributes({ "data-toc": "", class: "md-toc" }, HTMLAttributes)],

  addCommands() {
    return { insertToc: () => ({ commands }) => commands.insertContent({ type: this.name }) };
  },

  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("nav");
      dom.className = "md-toc";
      dom.setAttribute("data-toc", "");
      dom.contentEditable = "false";

      const render = () => {
        const strings = stringsOf(editor).extras.toc;
        dom.replaceChildren();
        const title = document.createElement("p");
        title.className = "md-toc-title";
        title.textContent = strings.title;
        dom.append(title);
        const headings = headingsOf(editor.state.doc);
        if (headings.length === 0) {
          const empty = document.createElement("p");
          empty.className = "md-toc-empty";
          empty.textContent = strings.empty;
          dom.append(empty);
          return;
        }
        const top = Math.min(...headings.map((heading) => heading.level));
        const list = document.createElement("ul");
        for (const heading of headings) {
          const item = document.createElement("li");
          item.style.marginLeft = `${(heading.level - top) * 1.1}em`;
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = heading.text;
          button.title = strings.jump;
          button.addEventListener("mousedown", (event) => event.preventDefault());
          button.addEventListener("click", () => {
            const found = headingsOf(editor.state.doc).find((candidate) => candidate.text === heading.text && candidate.level === heading.level);
            if (!found) return;
            editor.chain().focus().setTextSelection(found.pos + 1).scrollIntoView().run();
          });
          item.append(button);
          list.append(item);
        }
        dom.append(list);
      };

      // 제목이 바뀌면 다시 그린다(글자 입력마다 문서를 훑지 않도록 제목 목록이 달라졌을 때만).
      let last = "";
      const refresh = () => {
        const signature = JSON.stringify(headingsOf(editor.state.doc).map((heading) => [heading.level, heading.text]));
        if (signature === last) return;
        last = signature;
        render();
      };
      editor.on("update", refresh);
      refresh();
      return {
        dom,
        destroy: () => editor.off("update", refresh),
        stopEvent: (event: Event) => event.target instanceof HTMLElement && event.target.tagName === "BUTTON",
        ignoreMutation: () => true,
      };
    };
  },
});
