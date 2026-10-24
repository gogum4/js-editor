// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createCoreExtensions } from "../coreExtensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

const p = (text: string, indent?: number) => ({ type: "paragraph", ...(indent ? { attrs: { indent } } : {}), content: [{ type: "text", text }] });

function mount(doc: unknown, indent = true): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  editor = new Editor({ element, extensions: createCoreExtensions(new Y.Doc(), { indent }) });
  editor.commands.setContent(doc as never);
  return editor;
}

const indentsOf = (e: Editor) => (e.getJSON().content ?? []).map((n) => (n.attrs as { indent?: number | null } | undefined)?.indent ?? null);
const tab = (e: Editor, shift = false) => {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
  e.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("들여쓰기 (core)", () => {
  it("꺼져 있으면(기본) 속성이 없고 Tab도 가로채지 않는다", () => {
    const e = mount({ type: "doc", content: [p("글")] }, false);
    expect(e.schema.nodes.paragraph?.spec.attrs).not.toHaveProperty("indent");
    e.commands.setTextSelection(2);
    expect(tab(e)).toBe(false);
  });

  it("Tab으로 한 단계씩 늘리고 Shift+Tab으로 줄인다", () => {
    const e = mount({ type: "doc", content: [p("글")] });
    e.commands.setTextSelection(2);
    expect(tab(e)).toBe(true);
    expect(indentsOf(e)).toEqual([1]);
    tab(e);
    tab(e);
    expect(indentsOf(e)).toEqual([3]);
    tab(e, true);
    expect(indentsOf(e)).toEqual([2]);
    tab(e, true);
    tab(e, true);
    expect(indentsOf(e)).toEqual([null]);
    // 이미 들여쓰지 않았으면 Shift+Tab은 아무 일도 하지 않는다.
    expect(tab(e, true)).toBe(false);
  });

  it("상한(8단계)에서 멈춘다", () => {
    const e = mount({ type: "doc", content: [p("글", 8)] });
    e.commands.setTextSelection(2);
    expect(e.commands.increaseIndent()).toBe(false);
    expect(indentsOf(e)).toEqual([8]);
  });

  it("문단마다 단계가 따로다 (1단계 다음에 3단계)", () => {
    const e = mount({ type: "doc", content: [p("가"), p("나")] });
    e.commands.setTextSelection(2);
    e.commands.increaseIndent();
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    e.commands.setIndent(3);
    expect(indentsOf(e)).toEqual([1, 3]);
  });

  it("여러 문단을 선택하면 모두 한 단계씩 바뀐다", () => {
    const e = mount({ type: "doc", content: [p("가", 1), p("나"), p("다", 2)] });
    e.commands.selectAll();
    e.commands.increaseIndent();
    expect(indentsOf(e)).toEqual([2, 1, 3]);
  });

  it("제목도 들여쓴다", () => {
    const e = mount({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "제목" }] }] });
    e.commands.setTextSelection(2);
    e.commands.increaseIndent();
    expect(e.getJSON().content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2, indent: 1 } });
  });

  it("목록 항목 안의 Tab은 들여쓰기가 아니라 목록 중첩이 맡는다", () => {
    const list = {
      type: "bulletList",
      content: [
        { type: "listItem", content: [p("하나")] },
        { type: "listItem", content: [p("둘")] },
      ],
    };
    const e = mount({ type: "doc", content: [list] });
    let at = 0;
    e.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === "둘") at = pos + 1;
    });
    e.commands.setTextSelection(at);
    expect(tab(e)).toBe(true);
    expect(JSON.stringify(e.getJSON())).not.toMatch(/"indent":\d/);
    // 둘째 항목이 첫 항목 아래로 들어갔다(최상위 항목은 하나만 남는다).
    expect(e.getJSON().content?.[0]?.content?.length).toBe(1);
  });

  it("HTML로 복사해도 단계가 살아 있다", () => {
    const e = mount({ type: "doc", content: [p("글", 3)] });
    const html = e.getHTML();
    expect(html).toContain('data-indent="3"');
    expect(html).toContain("margin-left: 6em");
    expect(indentsOf(mount(html))).toEqual([3]);
  });
});
