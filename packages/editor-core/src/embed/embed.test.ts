// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createCoreExtensions } from "../coreExtensions";
import { memoryPorts } from "../ports/memory";
import type { EditorPorts } from "../ports/types";
import { runSlashCommand } from "../slash/runSlashCommand";
import { filterSlashItems } from "../lib/slashItems";
import { koStrings } from "../strings";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

function mount(options: { embed?: boolean; reference?: boolean; ports?: Partial<EditorPorts>; doc?: unknown } = {}): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const ports = { ...memoryPorts(), ...options.ports };
  editor = new Editor({
    element,
    extensions: createCoreExtensions(new Y.Doc(), { ports, embed: options.embed ?? true, reference: options.reference ?? false }),
  });
  if (options.doc) editor.commands.setContent(options.doc as never);
  return editor;
}

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const embedDoc = (attrs: Record<string, unknown>) => ({ type: "doc", content: [{ type: "embed", attrs }, { type: "paragraph" }] });
const card = () => document.querySelector<HTMLElement>(".md-embed")!;
const typeInto = (input: HTMLInputElement, text: string, key = "Enter") => {
  input.value = text;
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
};

describe("임베드 노드 (core)", () => {
  it("꺼져 있으면(기본) 스키마에도 슬래시 메뉴에도 없다", () => {
    const off = mount({ embed: false });
    expect(off.schema.nodes.embed).toBeUndefined();
  });

  it("켜면 노드와 /임베드 항목이 생긴다", () => {
    const on = mount();
    expect(on.schema.nodes.embed).toBeDefined();
    const items = createCoreExtensions(null, { embed: true });
    expect(items.length).toBeGreaterThan(0);
  });

  it("주소가 있으면 허용한 도메인의 iframe을 그린다 (sandbox·referrer 정책 포함)", () => {
    mount({ doc: embedDoc({ provider: "youtube", url: YT }) });
    const frame = card().querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(card().getAttribute("data-state")).toBe("ready");
    expect(card().querySelector("a")?.getAttribute("href")).toBe(YT);
  });

  it("올바르지 않은 주소는 iframe을 만들지 않고 입력 상자를 보인다", () => {
    mount({ doc: embedDoc({ provider: "youtube", url: "https://evil.com/x" }) });
    expect(card().querySelector("iframe")).toBeNull();
    expect(card().querySelector("input")).not.toBeNull();
  });

  it("크기를 따른다", () => {
    mount({ doc: embedDoc({ provider: "x", url: "https://x.com/jack/status/20", width: 400, height: 300 }) });
    const frame = card().querySelector<HTMLElement>(".md-embed-frame")!;
    expect(frame.style.width).toContain("400px");
    expect(frame.style.height).toBe("300px");
  });

  it("빈 카드에 지원하는 주소를 적고 Enter를 누르면 임베드가 된다", () => {
    const e = mount({ doc: embedDoc({ provider: "", url: "" }) });
    const input = card().querySelector<HTMLInputElement>("input")!;
    typeInto(input, "https://youtu.be/dQw4w9WgXcQ");
    expect(e.getJSON().content?.[0]).toMatchObject({ type: "embed", attrs: { provider: "youtube", url: YT } });
    expect(card().querySelector("iframe")).not.toBeNull();
  });

  it("지원하지 않는 주소는 안내만 보이고 카드는 그대로다", () => {
    const e = mount({ doc: embedDoc({ provider: "", url: "" }) });
    typeInto(card().querySelector<HTMLInputElement>("input")!, "https://example.com/video");
    expect(card().querySelector(".md-embed-message")?.textContent).toBe(koStrings.embed.invalid);
    expect(e.getJSON().content?.[0]).toMatchObject({ type: "embed", attrs: { url: "" } });
  });

  it("빈 카드에서 Esc를 누르면 카드가 지워진다", () => {
    const e = mount({ doc: embedDoc({ provider: "", url: "" }) });
    typeInto(card().querySelector<HTMLInputElement>("input")!, "", "Escape");
    expect(e.getJSON().content?.some((n) => n.type === "embed")).toBe(false);
  });

  it("소비자가 알아보는 주소(우리 글 등)는 참조 노드가 된다", () => {
    const e = mount({
      reference: true,
      ports: { parseEmbedInput: (input) => (input === "https://blog.example/posts/hello" ? { kind: "post", id: "hello" } : null) },
      doc: embedDoc({ provider: "", url: "" }),
    });
    typeInto(card().querySelector<HTMLInputElement>("input")!, "https://blog.example/posts/hello");
    expect(e.getJSON().content?.[0]).toMatchObject({ type: "reference", attrs: { kind: "post", id: "hello" } });
  });

  it("참조 노드를 켜지 않았으면 소비자가 알아본 주소도 받지 않는다", () => {
    const e = mount({ reference: false, ports: { parseEmbedInput: () => ({ kind: "post", id: "hello" }) }, doc: embedDoc({ provider: "", url: "" }) });
    typeInto(card().querySelector<HTMLInputElement>("input")!, "https://blog.example/posts/hello");
    expect(e.getJSON().content?.[0]).toMatchObject({ type: "embed" });
    expect(card().querySelector(".md-embed-message")?.textContent).toBe(koStrings.embed.invalid);
  });

  it("/임베드가 빈 카드를 끼운다", () => {
    const e = mount({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "/임베드" }] }] } });
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    expect(runSlashCommand(e, { from: 1, to: 6 }, "embed")).toBe(true);
    expect(e.getJSON().content?.some((n) => n.type === "embed" && n.attrs?.url === "")).toBe(true);
    // 슬래시 검색으로도 찾는다.
    expect(filterSlashItems("youtube", [{ id: "embed", label: "임베드", description: "", keywords: ["embed", "youtube"] }]).map((i) => i.id)).toEqual(["embed"]);
  });

  it("HTML로 복사·붙여넣기해도 속성이 살아 있다", () => {
    const e = mount({ doc: embedDoc({ provider: "youtube", url: YT, width: 500 }) });
    const html = e.getHTML();
    expect(html).toContain('data-provider="youtube"');
    expect(html).toContain('data-width="500"');
    const copy = mount({ doc: html });
    expect(copy.getJSON().content?.[0]).toMatchObject({ type: "embed", attrs: { provider: "youtube", url: YT, width: 500 } });
  });
});
