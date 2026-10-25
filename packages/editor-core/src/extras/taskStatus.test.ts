// @vitest-environment happy-dom
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createCoreExtensions } from "../coreExtensions";
import { newEditor } from "../testing/typing";

const created: Editor[] = [];
afterEach(() => {
  for (const editor of created.splice(0)) editor.destroy();
});
const taskEditor = (extras: { taskStatus?: boolean }) => {
  const editor = newEditor(undefined, createCoreExtensions(null, { extras }));
  created.push(editor);
  editor.commands.setContent({
    type: "doc",
    content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "할 일" }] }] }] }],
  });
  editor.commands.setTextSelection(4);
  return editor;
};
const firstItem = (editor: Editor) => editor.state.doc.firstChild!.firstChild!;

describe("할 일 상태", () => {
  it("setTaskStatus: 상태를 정하면 완료 표시가 꺼지고, null이면 지워진다", () => {
    const editor = taskEditor({ taskStatus: true });
    expect(editor.commands.setTaskStatus("/")).toBe(true);
    expect(firstItem(editor).attrs).toMatchObject({ status: "/", checked: false });
    expect(editor.commands.setTaskStatus(null)).toBe(true);
    expect(firstItem(editor).attrs.status).toBeNull();
  });

  it("cycleTaskStatus: 없음 → / → > → ? → ! → - → 없음", () => {
    const editor = taskEditor({ taskStatus: true });
    const seen: Array<string | null> = [];
    for (let i = 0; i < 6; i += 1) {
      editor.commands.cycleTaskStatus();
      seen.push(firstItem(editor).attrs.status);
    }
    expect(seen).toEqual(["/", ">", "?", "!", "-", null]);
  });

  it("DOM에 상태가 반영된다 (갱신 포함)", () => {
    const editor = taskEditor({ taskStatus: true });
    editor.commands.setTaskStatus("-");
    const li = editor.view.dom.querySelector("li")!;
    expect(li.getAttribute("data-status")).toBe("cancelled");
    editor.commands.setTaskStatus(null);
    expect(editor.view.dom.querySelector("li")!.getAttribute("data-status")).toBeNull();
  });

  it("꺼져 있으면 status 속성이 스키마에 없다", () => {
    const editor = taskEditor({});
    expect("status" in firstItem(editor).attrs).toBe(false);
  });
});
