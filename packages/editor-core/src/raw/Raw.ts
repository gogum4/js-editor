import { mergeAttributes, Node } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

import { stringsOf } from "../ports/editorPorts";

/**
 * 에디터가 모르는 Markdown 문법(디렉티브: `::youtube{…}`, `:::fold … :::`, `:postlink[글]{…}`)을 **원문 그대로** 담는 노드(docs/EDITOR-PACKAGE.md P6-1).
 * 내보낼 때 한 글자도 바꾸지 않는다. Markdown이 원본인 소비자(블로그)를 위한 것이라 `createCoreExtensions({ raw: true })`로 켠 때만 스키마에 들어간다
 * — 노트 앱은 켜지 않는다(켜면 본문 스키마 버전을 올려야 한다). 화면은 React 없이 DOM으로 그린다: 회색 상자 안의 원문을 그 자리에서 고친다.
 */

/** 입력이 멈춘 뒤 이만큼 기다렸다가 본문에 반영한다(글자마다 되돌리기 단계가 쌓이지 않게). 칸을 벗어나면 바로 반영한다. */
const COMMIT_DELAY_MS = 400;

/** 원문을 바꾼다. 위치는 반영하는 시점에 다시 물어본다(그사이 문서가 움직였을 수 있다). */
function commitText(editor: Editor, getPos: () => number | undefined, node: PmNode, text: string): void {
  const pos = getPos();
  if (typeof pos !== "number" || text === node.attrs.text) return;
  if (editor.state.doc.nodeAt(pos)?.type !== node.type) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, text }));
}

export const Raw = Node.create({
  name: "raw",
  group: "block",
  atom: true,
  draggable: true,
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
    return [{ tag: "div[data-raw]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-raw": "", class: "md-raw" }, HTMLAttributes), String(node.attrs.text ?? "")];
  },

  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial;
      const strings = stringsOf(editor).raw;
      const dom = document.createElement("div");
      dom.className = "md-raw";
      dom.setAttribute("data-raw", "");
      dom.contentEditable = "false";
      const label = document.createElement("div");
      label.className = "md-raw-label";
      label.textContent = strings.blockLabel;
      const area = document.createElement("textarea");
      area.className = "md-raw-source";
      area.spellcheck = false;
      area.setAttribute("aria-label", strings.sourceLabel);
      area.value = String(node.attrs.text ?? "");
      const fit = () => {
        area.rows = Math.max(1, area.value.split("\n").length);
      };
      fit();
      dom.append(label, area);

      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        commitText(editor, getPos, node, area.value);
      };
      area.addEventListener("input", () => {
        fit();
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(flush, COMMIT_DELAY_MS);
      });
      area.addEventListener("blur", flush);

      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          // 내가 쓰는 중이 아닐 때(원격 변경·되돌리기)만 칸을 새 값으로 맞춘다.
          if (document.activeElement !== area && area.value !== next.attrs.text) {
            area.value = String(next.attrs.text ?? "");
            fit();
          }
          return true;
        },
        // 칸 안의 키 입력·마우스는 에디터가 처리하지 않는다.
        stopEvent: (event) => event.target === area,
        ignoreMutation: () => true,
        destroy: () => {
          if (timer !== null) {
            clearTimeout(timer);
            flush();
          }
        },
      };
    };
  },
});

/** 글 중간의 모르는 디렉티브(`:postlink[글]{slug}`): 회색 글자로 원문을 보이고 더블클릭하면 그 자리에서 고친다. */
export const RawInline = Node.create({
  name: "rawInline",
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
    return [{ tag: "code[data-raw-inline]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["code", mergeAttributes({ "data-raw-inline": "", class: "md-raw-inline" }, HTMLAttributes), String(node.attrs.text ?? "")];
  },

  addNodeView() {
    return ({ node: initial, editor, getPos }) => {
      let node = initial;
      const strings = stringsOf(editor).raw;
      const dom = document.createElement("code");
      dom.className = "md-raw-inline";
      dom.setAttribute("data-raw-inline", "");
      dom.title = strings.inlineTitle;
      const show = () => {
        dom.textContent = String(node.attrs.text ?? "");
      };
      show();

      let input: HTMLInputElement | null = null;
      const finish = (save: boolean) => {
        if (input === null) return;
        const value = input.value.replace(/\n/g, " ");
        input = null;
        dom.contentEditable = "false";
        if (save && value !== "") commitText(editor, getPos, node, value);
        show();
      };
      dom.addEventListener("dblclick", () => {
        if (input !== null) return;
        input = document.createElement("input");
        input.className = "md-raw-inline-input";
        input.spellcheck = false;
        input.setAttribute("aria-label", strings.sourceLabel);
        input.value = String(node.attrs.text ?? "");
        input.size = Math.max(4, input.value.length);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") finish(true);
          else if (event.key === "Escape") finish(false);
        });
        input.addEventListener("blur", () => finish(true));
        dom.textContent = "";
        dom.appendChild(input);
        input.focus();
      });

      return {
        dom,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          if (input === null) show();
          return true;
        },
        stopEvent: (event) => input !== null && event.target === input,
        ignoreMutation: () => true,
      };
    };
  },
});
