import { describe, expect, it } from "vitest";

import { firstBlock, newEditor, typeText } from "./testing/typing";

/**
 * Markdown을 **타이핑하는 중에** 서식으로 바뀌는 규칙(docs/MARKDOWN-DIALECT.md). 한 글자씩 쳐서 시험한다.
 * 이 시험은 규칙이 "있는지"를 고정한다 — 설계 문서가 "있을 것으로 보임(미확인)"이라 했던 것들이다.
 */
describe("입력 규칙: 블록", () => {
  const cases: Array<[string, string, ReturnType<typeof firstBlock>]> = [
    ["# ", "제목", { type: "heading", attrs: { level: 1 }, text: "제목" }],
    ["### ", "작은 제목", { type: "heading", attrs: { level: 3 }, text: "작은 제목" }],
    ["- ", "항목", { type: "bulletList", attrs: {}, text: "항목" }],
    ["* ", "항목", { type: "bulletList", attrs: {}, text: "항목" }],
    ["1. ", "항목", { type: "orderedList", attrs: {}, text: "항목" }],
    ["> ", "인용", { type: "blockquote", attrs: {}, text: "인용" }],
    ["[] ", "할 일", { type: "taskList", attrs: {}, text: "할 일" }],
  ];
  for (const [prefix, body, expected] of cases) {
    it(`"${prefix}" 로 시작하면 ${expected.type}이 된다`, () => {
      const editor = newEditor();
      typeText(editor, prefix + body);
      expect(firstBlock(editor)).toMatchObject({ type: expected.type, text: expected.text });
    });
  }

  it("코드 펜스(```언어 + 공백)는 그 언어의 코드 블록이 된다", () => {
    const editor = newEditor();
    typeText(editor, "```ts ");
    expect(firstBlock(editor)).toMatchObject({ type: "codeBlock", attrs: { language: "ts" } });
  });

  it("--- 는 구분선이 된다", () => {
    const editor = newEditor();
    typeText(editor, "---");
    expect(editor.state.doc.firstChild!.type.name).toBe("horizontalRule");
  });
});

describe("입력 규칙: 인라인", () => {
  const marks = (editor: ReturnType<typeof newEditor>) => {
    const out: Array<[string, string[]]> = [];
    editor.state.doc.firstChild!.forEach((child) => out.push([child.text ?? child.type.name, child.marks.map((m) => m.type.name)]));
    return out;
  };

  it("**굵게** *기울임* ~~취소선~~ `코드`", () => {
    const editor = newEditor();
    typeText(editor, "**굵게** ");
    typeText(editor, "*기울임* ");
    typeText(editor, "~~취소선~~ ");
    typeText(editor, "`코드` ");
    expect(marks(editor)).toEqual(
      expect.arrayContaining([
        ["굵게", ["bold"]],
        ["기울임", ["italic"]],
        ["취소선", ["strike"]],
        ["코드", ["code"]],
      ]),
    );
  });

  it("$x^2$ 는 인라인 수식이 된다", () => {
    const editor = newEditor();
    typeText(editor, "값은 $x^2$");
    const types: string[] = [];
    editor.state.doc.firstChild!.forEach((child) => types.push(child.type.name));
    expect(types).toContain("mathInline");
  });
});

describe("입력 규칙: 콜아웃 (> [!NOTE] )", () => {
  it("> 다음 첫 줄에 [!tip] 을 치면 인용이 그 종류의 콜아웃이 된다", () => {
    const editor = newEditor();
    typeText(editor, "> [!tip] ");
    expect(firstBlock(editor)).toMatchObject({ type: "callout", attrs: { type: "tip" }, text: "" });
    typeText(editor, "내용");
    expect(firstBlock(editor)).toMatchObject({ type: "callout", text: "내용" });
  });

  it("대소문자와 Obsidian 별칭도 받는다 ([!WARNING], [!danger] → caution)", () => {
    const upper = newEditor();
    typeText(upper, "> [!WARNING] ");
    expect(firstBlock(upper)).toMatchObject({ type: "callout", attrs: { type: "warning" } });
    const alias = newEditor();
    typeText(alias, "> [!danger] ");
    expect(firstBlock(alias)).toMatchObject({ type: "callout", attrs: { type: "caution" } });
  });

  it("모르는 이름이나 인용 밖에서는 글자로 남는다", () => {
    const unknown = newEditor();
    typeText(unknown, "> [!foo] ");
    expect(firstBlock(unknown)).toMatchObject({ type: "blockquote", text: "[!foo] " });
    const plain = newEditor();
    typeText(plain, "[!note] ");
    expect(firstBlock(plain)).toMatchObject({ type: "paragraph", text: "[!note] " });
  });

  it("인용의 둘째 문단에서는 바뀌지 않는다", () => {
    const editor = newEditor({ type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "앞" }] }, { type: "paragraph" }] }] });
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    typeText(editor, "[!note] ");
    expect(firstBlock(editor).type).toBe("blockquote");
  });
});
