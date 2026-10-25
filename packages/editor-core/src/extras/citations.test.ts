// @vitest-environment happy-dom
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createCoreExtensions } from "../coreExtensions";
import { newEditor, typeText } from "../testing/typing";

const created: Editor[] = [];
afterEach(() => {
  for (const editor of created.splice(0)) editor.destroy();
});
const editorWith = (extras: object, ports?: object) => {
  const editor = newEditor(undefined, createCoreExtensions(null, { extras, ...(ports ? { ports } : {}) } as never));
  created.push(editor);
  return editor;
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("서술형 인용", () => {
  it("@키 + 공백은 서술형 칩이 되고, 켜지 않으면 글자", () => {
    const on = editorWith({ citations: { narrative: true } });
    typeText(on, "보면 @smith2020 ");
    const kinds: string[] = [];
    on.state.doc.firstChild!.forEach((n) => kinds.push(n.type.name === "citation" ? `cite:${JSON.stringify(n.attrs)}` : n.text!));
    expect(kinds).toEqual(["보면 ", 'cite:{"source":"@smith2020","narrative":true}', " "]);

    const off = editorWith({ citations: true });
    typeText(off, "보면 @smith2020 ");
    expect(off.state.doc.firstChild!.textContent).toBe("보면 @smith2020 ");
  });

  it("끝에 구두점이 붙은 키·이메일은 바꾸지 않는다", () => {
    const editor = editorWith({ citations: { narrative: true } });
    typeText(editor, "a@b.com ");
    expect(JSON.stringify(editor.getJSON())).not.toContain("citation");
  });
});

describe("참고문헌 블록", () => {
  it("인용된 키를 처음 나온 순서로 포트의 글과 함께 그린다", async () => {
    const entries = async (keys: readonly string[]) => keys.map((k) => (k === "a1" ? "Alpha. (2020)." : null));
    const editor = editorWith({ citations: { bibliography: true } }, { citations: { entries } });
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "citation", attrs: { source: "@b2; @a1" } }, { type: "citation", attrs: { source: "@a1" } }] },
        { type: "bibliography" },
      ],
    });
    await tick();
    const items = [...editor.view.dom.querySelectorAll(".md-bibliography li")].map((li) => [li.getAttribute("data-key"), li.textContent]);
    expect(items).toEqual([["b2", "@b2"], ["a1", "Alpha. (2020)."]]);
  });

  it("꺼져 있으면 블록 노드가 없다", () => {
    expect(editorWith({ citations: true }).schema.nodes.bibliography).toBeUndefined();
  });
});
