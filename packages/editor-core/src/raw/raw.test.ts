// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { docToMarkdown } from "@gogum4/editor-markdown";
import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createCoreExtensions } from "../coreExtensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

const BLOCK = '<div class="note">\n원문 HTML\n</div>';
const doc = (...content: unknown[]) => ({ type: "doc", content });
const withRaw = () =>
  doc(
    { type: "paragraph", content: [{ type: "text", text: "문단 " }, { type: "rawInline", attrs: { text: "<kbd>Ctrl</kbd>" } }, { type: "text", text: " 끝" }] },
    { type: "raw", attrs: { text: BLOCK } },
  );

function mount(content: unknown, raw = true): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  editor = new Editor({ element, extensions: createCoreExtensions(new Y.Doc(), { raw }) });
  // Collaboration이 문서를 쥐고 있어서 `content` 옵션은 무시된다 — 마운트한 뒤에 넣는다.
  if (raw) editor.commands.setContent(content as never);
  return editor;
}

const exported = (e: Editor) => docToMarkdown(e.getJSON() as PmNode, { pageTitle: () => null }).markdown;

describe("raw 노드 (core)", () => {
  it("꺼져 있으면(기본) 스키마에 없다", () => {
    const e = mount(doc({ type: "paragraph" }), false);
    expect(e.schema.nodes.raw).toBeUndefined();
    expect(e.schema.nodes.rawInline).toBeUndefined();
  });

  it("켜면 raw·rawInline이 스키마에 있고 원문이 칸에 보인다", () => {
    const e = mount(withRaw());
    expect(e.schema.nodes.raw).toBeDefined();
    const area = e.view.dom.querySelector<HTMLTextAreaElement>("textarea.md-raw-source");
    expect(area?.value).toBe(BLOCK);
    expect(Number(area?.rows)).toBe(3);
    expect(e.view.dom.querySelector("code.md-raw-inline")?.textContent).toBe("<kbd>Ctrl</kbd>");
    expect(exported(e)).toBe(`문단 <kbd>Ctrl</kbd> 끝\n\n${BLOCK}\n`);
  });

  it("칸을 고치고 벗어나면 본문의 원문이 바뀐다", () => {
    const e = mount(withRaw());
    const area = e.view.dom.querySelector<HTMLTextAreaElement>("textarea.md-raw-source")!;
    area.value = "<div>B</div>";
    area.dispatchEvent(new Event("input"));
    area.dispatchEvent(new Event("blur"));
    expect(exported(e)).toBe("문단 <kbd>Ctrl</kbd> 끝\n\n<div>B</div>\n");
  });

  it("원격 변경(Yjs)으로 원문이 바뀌면 칸도 따라간다", () => {
    const e = mount(doc({ type: "raw", attrs: { text: "<p>a</p>" } }));
    e.view.dispatch(e.state.tr.setNodeMarkup(0, undefined, { text: "<p>b</p>" }));
    expect(e.view.dom.querySelector<HTMLTextAreaElement>("textarea.md-raw-source")?.value).toBe("<p>b</p>");
  });

  it("글 중간 원문은 더블클릭해서 고친다", () => {
    const e = mount(withRaw());
    const code = e.view.dom.querySelector("code.md-raw-inline")!;
    code.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = code.querySelector("input")!;
    input.value = "<kbd>Alt</kbd>";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(exported(e)).toBe(`문단 <kbd>Alt</kbd> 끝\n\n${BLOCK}\n`);
  });
});
