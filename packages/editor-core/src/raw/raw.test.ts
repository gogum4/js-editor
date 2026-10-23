// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { docToMarkdown, markdownToDoc } from "@9um4/editor-markdown";
import type { PmNode } from "@9um4/editor-schema/pmDoc";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createCoreExtensions } from "../coreExtensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

const context = { resolvePage: () => null, resolveImage: () => null, rawDirectives: true };

function mount(markdown: string, raw = true): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const { doc } = markdownToDoc(markdown, context, "");
  editor = new Editor({ element, extensions: createCoreExtensions(new Y.Doc(), { raw }) });
  // Collaboration이 문서를 쥐고 있어서 `content` 옵션은 무시된다 — 마운트한 뒤에 넣는다.
  if (raw) editor.commands.setContent(doc);
  return editor;
}

const exported = (e: Editor) => docToMarkdown(e.getJSON() as PmNode, { pageTitle: () => null }).markdown;

describe("raw 노드 (core)", () => {
  it("꺼져 있으면(기본) 스키마에 없다", () => {
    const e = mount("", false);
    expect(e.schema.nodes.raw).toBeUndefined();
    expect(e.schema.nodes.rawInline).toBeUndefined();
  });

  it("켜면 raw·rawInline이 스키마에 있고 원문이 칸에 보인다", () => {
    const source = "문단 :postlink[글]{slug=a} 끝\n\n:::fold{h=1}\n안쪽\n:::\n";
    const e = mount(source);
    expect(e.schema.nodes.raw).toBeDefined();
    const area = e.view.dom.querySelector<HTMLTextAreaElement>("textarea.md-raw-source");
    expect(area?.value).toBe(":::fold{h=1}\n안쪽\n:::");
    expect(Number(area?.rows)).toBe(3);
    expect(e.view.dom.querySelector("code.md-raw-inline")?.textContent).toBe(":postlink[글]{slug=a}");
    expect(exported(e)).toBe(source);
  });

  it("칸을 고치고 벗어나면 본문의 원문이 바뀐다", () => {
    const e = mount(":::note\nA\n:::\n");
    const area = e.view.dom.querySelector<HTMLTextAreaElement>("textarea.md-raw-source")!;
    area.value = ":::note[제목]\nB\n:::";
    area.dispatchEvent(new Event("input"));
    area.dispatchEvent(new Event("blur"));
    expect(exported(e)).toBe(":::note[제목]\nB\n:::\n");
  });

  it("원격 변경(Yjs)으로 원문이 바뀌면 칸도 따라간다", () => {
    const e = mount("::youtube{id=a}\n");
    e.view.dispatch(e.state.tr.setNodeMarkup(0, undefined, { text: "::youtube{id=b}" }));
    expect(e.view.dom.querySelector<HTMLTextAreaElement>("textarea.md-raw-source")?.value).toBe("::youtube{id=b}");
  });

  it("글 중간 디렉티브는 더블클릭해서 고친다", () => {
    const e = mount("앞 :postlink[a]{b} 뒤\n");
    const code = e.view.dom.querySelector("code.md-raw-inline")!;
    code.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = code.querySelector("input")!;
    input.value = ":postlink[c]{d}";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(exported(e)).toBe("앞 :postlink[c]{d} 뒤\n");
  });

  it("붙여넣은 Markdown의 디렉티브도 raw로 읽는다", () => {
    const e = mount("");
    const event = { clipboardData: { getData: (type: string) => (type === "text/plain" ? "# 제목\n\n::youtube{id=x}\n" : "") } } as unknown as ClipboardEvent;
    const handled = Boolean(e.view.someProp("handlePaste", (handle) => handle(e.view, event, Slice.empty)));
    expect(handled).toBe(true);
    expect(e.getJSON().content?.map((n) => n.type)).toContain("raw");
  });
});
