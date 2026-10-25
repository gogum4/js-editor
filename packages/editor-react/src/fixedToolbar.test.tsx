// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createReactExtensions } from "./createReactExtensions";
import { FixedToolbar } from "./hosts/FixedToolbar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let editor: Editor | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  editor?.destroy();
  editor = null;
  root = null;
  document.body.innerHTML = "";
});

function mount(): Editor {
  const element = document.createElement("div");
  const bar = document.createElement("div");
  document.body.append(bar, element);
  editor = new Editor({ element, extensions: createReactExtensions(new Y.Doc()) });
  root = createRoot(bar);
  act(() => root!.render(<FixedToolbar editor={editor} />));
  return editor;
}

const click = (selector: string) => {
  const target = document.querySelector<HTMLElement>(selector);
  expect(target, selector).not.toBeNull();
  act(() => target!.click());
};

describe("FixedToolbar", () => {
  it("서식·블록 단추를 누르면 에디터가 바뀌고 눌림 표시가 따라온다", () => {
    const e = mount();
    e.commands.insertContent("안녕 세계"); // Collaboration이 있어서 content 옵션은 무시된다
    e.commands.selectAll();
    click('[data-mark="bold"]');
    expect(e.isActive("bold")).toBe(true);
    expect(document.querySelector('[data-mark="bold"]')!.getAttribute("aria-pressed")).toBe("true");

    e.commands.setTextSelection(2);
    click('[data-block="bulletList"]');
    expect(e.isActive("bulletList")).toBe(true);
  });

  it("블록 종류 선택으로 제목을 만든다", () => {
    const e = mount();
    const select = document.querySelector<HTMLSelectElement>('[data-action="block-type"]')!;
    expect(select.value).toBe("paragraph");
    act(() => {
      select.value = "heading2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(e.isActive("heading", { level: 2 })).toBe(true);
  });

  it("실행 취소가 입력을 되돌린다", () => {
    const e = mount();
    e.commands.setTextSelection(1);
    e.commands.insertContent("가나다");
    expect(e.getText()).toContain("가나다");
    click('[data-action="undo"]');
    expect(e.getText()).not.toContain("가나다");
  });

  it("삽입 메뉴는 막대에 있는 항목을 뺀 슬래시 항목을 보이고, 고르면 닫힌다", () => {
    const e = mount();
    expect(document.querySelector(".fixed-toolbar-menu")).toBeNull();
    click('[data-action="insert"]');
    expect(document.querySelector('[data-item="table"]')).not.toBeNull();
    // 막대 안(overflow)에 갇히지 않게 화면 좌표로 띄운다
    expect(document.querySelector<HTMLElement>(".fixed-toolbar-menu")!.style.top).not.toBe("");
    expect(document.querySelector('[data-item="bulletList"]')).toBeNull();
    click('[data-item="horizontalRule"]');
    expect(document.querySelector(".fixed-toolbar-menu")).toBeNull();
    expect(JSON.stringify(e.getJSON())).toContain("horizontalRule");
  });

  it("편집할 수 없으면 아무것도 그리지 않는다", () => {
    const e = mount();
    act(() => e.setEditable(false));
    expect(document.querySelector('[data-testid="fixed-toolbar"]')).toBeNull();
  });
});
