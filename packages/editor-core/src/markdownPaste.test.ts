import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createCoreExtensions } from "./coreExtensions";
import { markdownPasteRevert } from "./extensions/MarkdownPaste";
import { liveState, newEditor, pasteText } from "./testing/typing";

const types = (editor: ReturnType<typeof newEditor>) => {
  const out: string[] = [];
  editor.state.doc.forEach((node) => out.push(node.type.name));
  return out;
};
const texts = (editor: ReturnType<typeof newEditor>) => {
  const out: string[] = [];
  editor.state.doc.forEach((node) => out.push(node.textContent));
  return out;
};

describe("Markdown 붙여넣기 변환", () => {
  it("Markdown 텍스트를 붙이면 서식으로 바뀐다", () => {
    const editor = newEditor();
    expect(pasteText(editor, "# 제목\n\n- 하나\n- 둘\n\n> [!TIP]\n> 팁")).toBe(true);
    expect(types(editor)).toEqual(expect.arrayContaining(["heading", "bulletList", "callout"]));
  });

  it("한 줄짜리 인라인 Markdown은 지금 문단 안에 이어 붙는다", () => {
    const editor = newEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "앞 뒤" }] }] });
    editor.commands.setTextSelection(3);
    expect(pasteText(editor, "**굵게**")).toBe(true);
    expect(types(editor)).toEqual(["paragraph"]);
    const parts: Array<[string, string[]]> = [];
    editor.state.doc.firstChild!.forEach((child) => parts.push([child.text ?? "", child.marks.map((m) => m.type.name)]));
    expect(parts).toEqual([["앞 ", []], ["굵게", ["bold"]], ["뒤", []]]);
  });

  it("HTML이 같이 있으면(에디터 안 복사·웹 페이지) 건드리지 않는다", () => {
    const editor = newEditor();
    expect(pasteText(editor, "# 제목", "<h1>제목</h1>")).toBe(false);
    expect(texts(editor)).toEqual([""]);
  });

  it("Markdown처럼 보이지 않는 글은 건드리지 않는다", () => {
    const editor = newEditor();
    expect(pasteText(editor, "그냥 글입니다\n두 줄")).toBe(false);
    expect(pasteText(editor, "https://example.com/a")).toBe(false);
  });

  it("코드 블록 안에서는 건드리지 않는다", () => {
    const editor = newEditor({ type: "doc", content: [{ type: "codeBlock", content: [{ type: "text", text: "x" }] }] });
    editor.commands.setTextSelection(2);
    expect(pasteText(editor, "# 제목")).toBe(false);
  });

  it("못 찾은 위키 링크는 글자로 남는다", () => {
    const editor = newEditor();
    expect(pasteText(editor, "[[없는 글]] 참고")).toBe(true);
    expect(texts(editor).join("")).toContain("[[없는 글]]");
  });

  it("스키마에 없는 노드가 나오면(해석기가 페이지를 찾았는데 이 에디터에 pageLink가 없을 때) 기본 붙여넣기로 넘어간다", () => {
    const editor = new Editor({ extensions: createCoreExtensions(null, { markdown: { resolvePage: () => "p-1" } }), content: { type: "doc", content: [{ type: "paragraph" }] } });
    expect(pasteText(editor, "[[프로젝트]] 참고")).toBe(false);
    expect(texts(editor)).toEqual([""]);
  });
});

describe("원문으로 되돌리기 (첫 번째 Ctrl+Z)", () => {
  const live = (content?: object) => liveState(newEditor(content));
  const onePara = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

  it("방금 붙인 것을 원문(일반 텍스트)으로 되돌리고, 한 번 더는 할 게 없다", () => {
    const s = live();
    expect(s.paste("# 제목\n- 항목")).toBe(true);
    expect(s.types()).toContain("heading");
    const tr = markdownPasteRevert(s.state);
    expect(tr).not.toBeNull();
    s.view.dispatch(tr!);
    expect(s.types().every((t) => t === "paragraph")).toBe(true);
    // 끝에는 에디터가 두는 빈 문단이 하나 더 있을 수 있다(붙여넣기 직후 "끝 문단 보장" 플러그인이 넣는다).
    expect(s.texts().filter((line, index, all) => line !== "" || index < all.length - 1)).toEqual(["# 제목", "- 항목"]);
    expect(markdownPasteRevert(s.state)).toBeNull();
  });

  it("붙인 뒤 다른 편집을 하면 더는 되돌릴 원문이 없다", () => {
    const s = live();
    s.paste("# 제목");
    s.view.dispatch(s.state.tr.insertText("추가"));
    expect(markdownPasteRevert(s.state)).toBeNull();
  });

  it("붙인 뒤 커서를 옮겨도 더는 되돌릴 원문이 없다", () => {
    const s = live();
    s.paste("# 제목\n\n본문");
    s.select(1);
    expect(markdownPasteRevert(s.state)).toBeNull();
  });

  it("앞뒤 글을 건드리지 않는다", () => {
    const s = live(onePara("앞 뒤"));
    s.select(3);
    s.paste("**굵게**");
    expect(s.texts()).toEqual(["앞 굵게뒤"]);
    s.view.dispatch(markdownPasteRevert(s.state)!);
    expect(s.texts()).toEqual(["앞 **굵게**뒤"]);
  });

  it("원문으로 되돌린 뒤에는 처음 상태로 붙여넣기를 다시 변환할 수 있다", () => {
    const s = live();
    s.paste("# 제목");
    s.view.dispatch(markdownPasteRevert(s.state)!);
    expect(s.paste("# 또")).toBe(true);
    expect(s.types()).toContain("heading");
  });
});
