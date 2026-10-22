// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createReactExtensions } from "./react/createReactExtensions";

/**
 * 실제 Yjs(Collaboration)와 화면에 붙은 에디터에서 Ctrl+Z가 기대대로 동작하는지 시험한다.
 * 화면 없는 시험(`markdownPaste.test.ts`)은 Yjs가 없어서, 우선순위 충돌(Yjs 되돌리기가 Ctrl+Z를 먼저 가져감)을 잡지 못했다.
 */

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

function mount(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  editor = new Editor({ element, extensions: createReactExtensions(new Y.Doc()) });
  return editor;
}

function paste(e: Editor, text: string): boolean {
  const event = { clipboardData: { getData: (type: string) => (type === "text/plain" ? text : "") } } as unknown as ClipboardEvent;
  return Boolean(e.view.someProp("handlePaste", (handle) => handle(e.view, event, Slice.empty)));
}

function ctrlZ(e: Editor): boolean {
  const event = new KeyboardEvent("keydown", { key: "z", code: "KeyZ", ctrlKey: true, bubbles: true, cancelable: true });
  return Boolean(e.view.someProp("handleKeyDown", (handle) => handle(e.view, event)));
}

const types = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.forEach((node) => out.push(node.type.name));
  return out;
};
const texts = (e: Editor) => {
  const out: string[] = [];
  e.state.doc.forEach((node) => out.push(node.textContent));
  return out;
};
const nonEmpty = (lines: string[]) => lines.filter((line) => line !== "");

describe("Markdown 붙여넣기 + Yjs Ctrl+Z (실제 환경)", () => {
  it("붙여넣으면 서식으로 바뀐다", () => {
    const e = mount();
    expect(paste(e, "# 제목\n\n- 항목")).toBe(true);
    expect(types(e)).toEqual(expect.arrayContaining(["heading", "bulletList"]));
  });

  it("첫 Ctrl+Z는 원문으로, 두 번째 Ctrl+Z는 붙여넣기 전으로 돌아간다", () => {
    const e = mount();
    paste(e, "# 제목\n\n- 항목");
    expect(ctrlZ(e)).toBe(true);
    expect(types(e).every((t) => t === "paragraph")).toBe(true);
    expect(nonEmpty(texts(e))).toEqual(["# 제목", "- 항목"]);

    expect(ctrlZ(e)).toBe(true);
    expect(nonEmpty(texts(e))).toEqual([]);
    expect(types(e).every((t) => t === "paragraph")).toBe(true);
  });

  it("앞선 입력과 한 단계로 합쳐지지 않는다 (입력 직후 붙여넣어도 앞 글이 남는다)", () => {
    const e = mount();
    e.commands.insertContent("앞 글");
    paste(e, "**굵게**");
    expect(ctrlZ(e)).toBe(true); // 원문으로
    expect(texts(e).join("")).toContain("앞 글");
    expect(texts(e).join("")).toContain("**굵게**");
    expect(ctrlZ(e)).toBe(true); // 붙여넣기 전으로
    expect(texts(e).join("")).toBe("앞 글");
  });

  it("붙여넣은 뒤 다른 편집을 하면 Ctrl+Z는 보통의 되돌리기다", () => {
    const e = mount();
    paste(e, "# 제목");
    e.commands.insertContent("추가");
    expect(ctrlZ(e)).toBe(true);
    // 원문으로 바꿔 넣지 않는다 — 보통의 되돌리기라서 "# 제목"이라는 글자가 생기지 않는다. (Yjs는 500ms 안의 편집을 한 단계로 묶어 붙여넣기까지 함께 취소한다.)
    expect(texts(e).join("")).not.toContain("# 제목");
  });
});
