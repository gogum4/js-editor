// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { createCoreExtensions } from "../coreExtensions";
import { memoryPorts } from "../ports/memory";
import type { ReferenceInfo, ReferenceResolver } from "../ports/types";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mount(references: Record<string, ReferenceResolver> | undefined, doc: unknown, enabled = true): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const ports = memoryPorts(references ? { references } : {});
  editor = new Editor({ element, extensions: createCoreExtensions(new Y.Doc(), { ports, reference: enabled }) });
  if (enabled) editor.commands.setContent(doc as never);
  return editor;
}

const doc = (kind: string, id: string) => ({ type: "doc", content: [{ type: "reference", attrs: { kind, id } }, { type: "paragraph" }] });
const card = () => document.querySelector<HTMLElement>(".md-reference")!;

describe("참조 노드 (core)", () => {
  it("꺼져 있으면(기본) 스키마에 없다", () => {
    expect(mount(undefined, null, false).schema.nodes.reference).toBeUndefined();
  });

  it("해석기가 읽은 제목·설명·미리 보기를 카드에 그린다", async () => {
    const cleanup = vi.fn();
    const resolver: ReferenceResolver = {
      resolve: async (id) => ({ title: `스키마 ${id}`, description: "열 3개", preview: { columns: ["a", "b", "c"] } }),
      renderPreview: (info: ReferenceInfo, container) => {
        container.textContent = (info.preview as { columns: string[] }).columns.join("|");
        return cleanup;
      },
    };
    mount({ "table-schema": resolver }, doc("table-schema", "t1"));
    expect(card().getAttribute("data-state")).toBe("loading");
    await flush();
    expect(card().getAttribute("data-state")).toBe("ready");
    expect(card().querySelector(".md-reference-title")?.textContent).toBe("스키마 t1");
    expect(card().querySelector(".md-reference-desc")?.textContent).toBe("열 3개");
    expect(card().querySelector(".md-reference-preview")?.textContent).toBe("a|b|c");
    editor!.destroy();
    expect(cleanup).toHaveBeenCalled();
  });

  it("해석기가 null이면 삭제됨, 거절하면 불러오지 못함, 종류를 모르면 알 수 없는 참조", async () => {
    const error = vi.fn();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const ports = memoryPorts({
      notifier: { notice: () => {}, error },
      references: { gone: { resolve: async () => null }, broken: { resolve: () => Promise.reject(new Error("boom")) } },
    });
    editor = new Editor({ element, extensions: createCoreExtensions(new Y.Doc(), { ports, reference: true }) });
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "reference", attrs: { kind: "gone", id: "a" } },
        { type: "reference", attrs: { kind: "broken", id: "b" } },
        { type: "reference", attrs: { kind: "nobody", id: "c" } },
        { type: "paragraph" },
      ],
    });
    await flush();
    const states = [...document.querySelectorAll(".md-reference")].map((el) => el.getAttribute("data-state"));
    expect(states).toEqual(["missing", "unresolved", "unknown"]);
    expect(document.querySelectorAll(".md-reference-desc")[2]?.textContent).toContain("nobody");
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("subscribe 알림으로 다시 읽고, 카드를 누르면 열고, 지워지면 구독을 해제한다", async () => {
    let title = "처음";
    let notify: () => void = () => {};
    const unsubscribe = vi.fn();
    const open = vi.fn();
    mount(
      {
        page: {
          resolve: async () => ({ title }),
          open,
          subscribe: (_id, listener) => {
            notify = listener;
            return unsubscribe;
          },
        },
      },
      doc("page", "p1"),
    );
    await flush();
    expect(card().querySelector(".md-reference-title")?.textContent).toBe("처음");
    title = "바뀜";
    notify();
    await flush();
    expect(card().querySelector(".md-reference-title")?.textContent).toBe("바뀜");
    card().click();
    expect(open).toHaveBeenCalledWith("p1");
    editor!.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("속성이 바뀌면 새 대상을 읽는다 (이전 응답은 버린다)", async () => {
    const resolve = vi.fn(async (id: string) => ({ title: `제목 ${id}` }));
    mount({ page: { resolve } }, doc("page", "a"));
    await flush();
    editor!.view.dispatch(editor!.state.tr.setNodeMarkup(0, undefined, { kind: "page", id: "b" }));
    await flush();
    expect(resolve).toHaveBeenCalledWith("b");
    expect(card().querySelector(".md-reference-title")?.textContent).toBe("제목 b");
  });

  it("insertReference는 올바른 kind·id만 끼운다", () => {
    mount(undefined, doc("page", "a"));
    expect(editor!.commands.insertReference("Bad Kind", "x")).toBe(false);
    expect(editor!.commands.insertReference("page", "")).toBe(false);
    expect(editor!.commands.insertReference("page", "z")).toBe(true);
    expect(JSON.stringify(editor!.getJSON())).toContain('"id":"z"');
  });
});
