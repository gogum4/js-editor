import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { FootnoteView } from "./FootnoteView";
import { openFootnoteEditor } from "./footnoteEdit";
import { collectFootnotes, transactionMayChangeFootnotes } from "./footnotes";
import { stringsOf } from "../ports/editorPorts";

const listKey = new PluginKey<string[]>("footnoteList");

/**
 * 각주: 문장 안에 번호(위첨자)로 보이는 인라인 노드. 내용은 **평문 문자열**(`text`)이고, 번호는 문서 순서로 정해져서(CSS 카운터)
 * 앞에 각주를 끼우거나 지우면 번호가 저절로 바뀐다. 페이지 맨 끝에 각주들이 목록으로 모여 보인다(저장되는 것이 아니라 그려지는 것).
 * 내용은 번호를 눌러 열리는 입력 창에서 고친다. `/각주`로 만든다. 미주는 같은 기능으로 본다(페이지 끝에 모인다).
 */
export const Footnote = Node.create({
  name: "footnote",
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

  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes({ "data-footnote": "", class: "footnote-ref" }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView, { as: "sup" });
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const strings = () => stringsOf(editor).footnote;

    /** 페이지 끝의 각주 목록. 항목을 누르면 그 각주의 편집 창이 열린다(위치는 누를 때의 문서에서 순서로 찾는다). */
    const buildList = (view: EditorView, texts: string[]) => {
      const section = document.createElement("section");
      section.className = "footnote-list";
      section.contentEditable = "false";
      section.setAttribute("data-footnote-list", "");
      const heading = document.createElement("p");
      heading.className = "footnote-list-title";
      heading.textContent = strings().heading;
      const list = document.createElement("ol");
      texts.forEach((text, index) => {
        const item = document.createElement("li");
        item.textContent = text === "" ? strings().empty : text;
        item.addEventListener("click", () => {
          const current = collectFootnotes(view.state.doc)[index];
          if (current) openFootnoteEditor(editor, current.pos);
        });
        list.appendChild(item);
      });
      section.append(heading, list);
      return section;
    };

    return [
      new Plugin<string[]>({
        key: listKey,
        state: {
          init: (_config, state) => collectFootnotes(state.doc).map((note) => note.text),
          // 각주와 상관없는 편집(글자 입력 등)에서는 문서를 다시 훑지 않고 이전 목록을 그대로 쓴다.
          apply: (tr, previous, _oldState, newState) =>
            transactionMayChangeFootnotes(tr) ? collectFootnotes(newState.doc).map((note) => note.text) : previous,
        },
        props: {
          decorations: (state) => {
            const texts = listKey.getState(state);
            if (!texts || texts.length === 0) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(state.doc.content.size, (view) => buildList(view, texts), {
                side: 1,
                ignoreSelection: true,
                // 내용이 같으면 같은 DOM을 다시 쓴다.
                key: `footnotes:${texts.join("\u0000")}`,
              }),
            ]);
          },
        },
      }),
    ];
  },
});
