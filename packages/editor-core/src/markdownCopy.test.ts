import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { createCoreExtensions } from "./coreExtensions";
import { liveState } from "./testing/typing";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "제목" }] },
    { type: "paragraph", content: [{ type: "text", text: "앞 " }, { type: "text", text: "굵게", marks: [{ type: "bold" }] }, { type: "text", text: " 뒤" }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "항목" }] }] }] },
    { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "a_b *c*" }] },
  ],
};

function copyText(copyAsMarkdown: object | undefined, select: (size: number) => [number, number]): string | undefined {
  const editor = new Editor({ extensions: createCoreExtensions(null, { copyAsMarkdown }), content: doc });
  const s = liveState(editor);
  const [from, to] = select(s.state.doc.content.size);
  s.view.dispatch(s.state.tr.setSelection(TextSelection.create(s.state.doc, from, to)));
  const slice = s.state.doc.slice(from, to);
  for (const plugin of s.state.plugins) {
    const serialize = plugin.props.clipboardTextSerializer;
    if (serialize) return serialize.call(plugin, slice, s.view);
  }
  return undefined;
}

describe("복사 시 Markdown (옵션)", () => {
  it("기본은 꺼져 있다 (기본 직렬화기만 있고 우리 것은 없다)", () => {
    const editor = new Editor({ extensions: createCoreExtensions(null), content: doc });
    const s = liveState(editor);
    const markdownCopy = s.state.plugins.find((p) => p.props.clipboardTextSerializer && String((p as unknown as { key: string }).key).includes("markdownCopy"));
    expect(markdownCopy).toBeUndefined();
  });

  it("켜면 여러 블록을 Markdown으로 만든다", () => {
    const text = copyText({}, (size) => [0, size]);
    expect(text).toContain("## 제목");
    expect(text).toContain("앞 **굵게** 뒤");
    expect(text).toContain("- 항목");
    expect(text).toContain("```js\na_b *c*\n```");
  });

  it("문단 안의 글 일부만 골라도 서식이 유지된다", () => {
    // 제목(1+2+1=4) 다음 문단: 시작 5, "앞 " 2글자 뒤부터 "굵게"까지 = 7~9
    const text = copyText({}, () => [7, 9]);
    expect(text).toBe("**굵게**");
  });

  it("코드 블록 안의 글을 복사하면 코드 그대로다 (이스케이프 없음)", () => {
    const editor = new Editor({ extensions: createCoreExtensions(null, { copyAsMarkdown: {} }), content: doc });
    const s = liveState(editor);
    const size = s.state.doc.content.size;
    // 마지막 코드 블록 안쪽 전체
    const from = size - "a_b *c*".length - 1;
    const to = size - 1;
    s.view.dispatch(s.state.tr.setSelection(TextSelection.create(s.state.doc, from, to)));
    const slice = s.state.doc.slice(from, to);
    const plugin = s.state.plugins.find((p) => p.props.clipboardTextSerializer)!;
    expect(plugin.props.clipboardTextSerializer!.call(plugin, slice, s.view)).toBe("a_b *c*");
  });

});
