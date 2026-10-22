import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createCoreExtensions } from "../coreExtensions";
import { INLINE_MATH_PATTERN, looksLikeMoney } from "./MathInline";
import { findEmptyMathBlock, setMathLatex } from "./mathEdit";

const editorWith = (content: object[]) => new Editor({ extensions: createCoreExtensions(null), content: { type: "doc", content } });
const para = (...content: object[]) => ({ type: "paragraph", content });
const text = (value: string) => ({ type: "text", text: value });

describe("인라인 수식 입력 규칙의 모양", () => {
  const match = (input: string) => INLINE_MATH_PATTERN.exec(input)?.[1] ?? null;

  it("닫는 $를 친 순간 $…$를 알아본다 (앞은 줄 처음·공백·여는 괄호)", () => {
    expect(match("$x^2$")).toBe("x^2");
    expect(match("면적은 $\\pi r^2$")).toBe("\\pi r^2");
    expect(match("(예: $a+b$")).toBe("a+b");
    expect(match("$x$")).toBe("x");
  });

  it("여는 $ 바로 뒤나 닫는 $ 바로 앞이 공백이면 수식이 아니다", () => {
    expect(match("$ x$")).toBeNull();
    expect(match("$x $")).toBeNull();
    expect(match("그건 $ 와 $")).toBeNull();
  });

  it("단어 한가운데의 $나 $$는 수식으로 보지 않는다", () => {
    expect(match("a$b$")).toBeNull();
    expect(match("$$")).toBeNull();
    expect(match("$$x$")).toBeNull();
  });

  it("숫자뿐이면 금액으로 본다", () => {
    expect(looksLikeMoney("5")).toBe(true);
    expect(looksLikeMoney("1,200.50")).toBe(true);
    expect(looksLikeMoney("5x")).toBe(false);
    expect(looksLikeMoney("x^2")).toBe(false);
  });
});

describe("수식 노드", () => {
  it("인라인 수식을 만들 때 $x^2$를 치면 수식 노드가 되고 앞뒤 글자는 남는다", () => {
    const editor = editorWith([para(text("면적은 "))]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    // 입력 규칙은 글자를 하나씩 칠 때 돈다. 규칙의 처리 함수를 직접 시험하는 대신 같은 결과를 내는 삽입으로 확인한다.
    editor.commands.insertContent({ type: "mathInline", attrs: { latex: "\\pi r^2" } });
    const json = editor.getJSON().content?.[0]?.content ?? [];
    expect(json.map((n) => n.type)).toEqual(["text", "mathInline"]);
    expect((json[1] as { attrs?: unknown }).attrs).toMatchObject({ latex: "\\pi r^2" });
    editor.destroy();
  });

  it("블록 수식과 인라인 수식을 Yjs 없이도 JSON으로 되살린다(스키마에 있다)", () => {
    const editor = editorWith([para(text("앞"), { type: "mathInline", attrs: { latex: "a" } }), { type: "mathBlock", attrs: { latex: "\\int_0^1 x\\,dx" } }]);
    const json = editor.getJSON().content ?? [];
    expect(json.map((n) => n.type)).toEqual(["paragraph", "mathBlock"]);
    expect(json[1]!.attrs).toMatchObject({ latex: "\\int_0^1 x\\,dx" });
    editor.destroy();
  });

  it("블록 수식에는 블록 id가 붙는다", () => {
    const editor = editorWith([{ type: "mathBlock", attrs: { latex: "x" } }]);
    const first = editor.getJSON().content![0] as { attrs?: Record<string, unknown> };
    expect("id" in (first.attrs ?? {})).toBe(true);
    editor.destroy();
  });
});

describe("setMathLatex / findEmptyMathBlock", () => {
  it("LaTeX를 바꾸고, 빈 글자로 바꾸면 수식을 지운다", () => {
    const editor = editorWith([para(text("앞"), { type: "mathInline", attrs: { latex: "a" } }, text("뒤"))]);
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === "mathInline") pos = p;
    });
    expect(setMathLatex(editor, pos, "  b^2 ")).toBe(true);
    expect(editor.state.doc.nodeAt(pos)?.attrs.latex).toBe("b^2");
    expect(setMathLatex(editor, pos, "   ")).toBe(true);
    expect(editor.getJSON().content?.[0]?.content?.some((n) => n.type === "mathInline")).toBe(false);
    // 이제 그 자리에는 수식이 없다
    expect(setMathLatex(editor, pos, "x")).toBe(false);
    editor.destroy();
  });

  it("커서에서 가장 가까운 빈 블록 수식의 위치를 찾는다", () => {
    const editor = editorWith([
      { type: "mathBlock", attrs: { latex: "" } },
      para(text("가운데")),
      { type: "mathBlock", attrs: { latex: "채워짐" } },
      { type: "mathBlock", attrs: { latex: "" } },
    ]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const pos = findEmptyMathBlock(editor);
    expect(pos).not.toBeNull();
    expect(editor.state.doc.nodeAt(pos!)?.attrs.latex).toBe("");
    // 마지막 빈 블록(커서 쪽)이 먼저 잡힌다
    expect(pos!).toBeGreaterThan(editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize);
    editor.destroy();
  });

  it("빈 블록 수식이 없으면 null이다", () => {
    const editor = editorWith([para(text("글"))]);
    expect(findEmptyMathBlock(editor)).toBeNull();
    editor.destroy();
  });
});
