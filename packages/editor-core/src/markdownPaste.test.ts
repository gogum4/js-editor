import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { createCoreExtensions } from "./coreExtensions";
import Collaboration from "@tiptap/extension-collaboration";
import { TextSelection } from "@tiptap/pm/state";

import { MarkdownPaste, markdownPasteKey, markdownPasteRawInsert } from "./extensions/MarkdownPaste";
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

  /** 표준 되돌리기가 한 일을 흉내 낸다: 문서를 붙여넣기 전 문서로 되돌린다(플러그인 상태는 그대로 쓰도록 먼저 읽어 둔다). */
  function pasteAndUndo(s: ReturnType<typeof live>, raw: string) {
    const before = s.state.doc;
    expect(s.paste(raw)).toBe(true);
    const pending = markdownPasteKey.getState(s.state)!;
    expect(pending).not.toBeNull();
    s.view.dispatch(s.state.tr.replaceWith(0, s.state.doc.content.size, before.content));
    return pending;
  }

  it("붙여넣기를 취소한 자리에 원문(일반 텍스트)을 넣는다", () => {
    const s = live();
    const pending = pasteAndUndo(s, "# 제목\n- 항목");
    const tr = markdownPasteRawInsert(s.state, pending);
    expect(tr).not.toBeNull();
    s.view.dispatch(tr!);
    expect(s.types().every((t) => t === "paragraph")).toBe(true);
    // 끝에는 에디터가 두는 빈 문단이 하나 더 있을 수 있다.
    expect(s.texts().filter((line, index, all) => line !== "" || index < all.length - 1)).toEqual(["# 제목", "- 항목"]);
    expect(markdownPasteKey.getState(s.state)).toBeNull();
  });

  it("문단 안에 붙인 인라인 Markdown도 같은 자리에 원문으로 돌아온다 (앞뒤 글을 건드리지 않는다)", () => {
    const s = live(onePara("앞 뒤"));
    s.select(3);
    const pending = pasteAndUndo(s, "**굵게**");
    s.view.dispatch(markdownPasteRawInsert(s.state, pending)!);
    expect(s.texts()).toEqual(["앞 **굵게**뒤"]);
  });

  it("글을 선택한 채 붙였다면 취소 뒤 원문이 그 선택을 다시 대신한다", () => {
    const s = live(onePara("지울 글 남길 글"));
    s.select(1);
    s.view.dispatch(s.state.tr.setSelection(TextSelection.create(s.state.doc, 1, 6))); // "지울 글 "
    const pending = pasteAndUndo(s, "**굵게** ");
    expect(s.texts()).toEqual(["지울 글 남길 글"]);
    s.view.dispatch(markdownPasteRawInsert(s.state, pending)!);
    expect(s.texts()).toEqual(["**굵게** 남길 글"]);
  });

  it("되돌린 문서가 붙여넣기 전 문서와 다르면 원문을 넣지 않는다", () => {
    const s = live(onePara("앞 뒤"));
    s.select(3);
    s.paste("**굵게**");
    const pending = markdownPasteKey.getState(s.state)!;
    // 되돌리기가 덜 됐다(붙여넣은 채 그대로).
    expect(markdownPasteRawInsert(s.state, pending)).toBeNull();
  });

  it("붙인 뒤 다른 편집을 하면 더는 되돌릴 원문이 없다", () => {
    const s = live();
    s.paste("# 제목");
    s.view.dispatch(s.state.tr.insertText("추가"));
    expect(markdownPasteKey.getState(s.state)).toBeNull();
  });

  it("붙인 뒤 커서를 옮겨도 더는 되돌릴 원문이 없다", () => {
    const s = live();
    s.paste("# 제목\n\n본문");
    s.select(1);
    expect(markdownPasteKey.getState(s.state)).toBeNull();
  });

  it("붙여넣은 직후 다른 플러그인이 덧붙이는 트랜잭션(블록 id 등)이 있어도 기록이 남는다", () => {
    const s = live();
    s.paste("# 제목\n\n본문");
    expect(markdownPasteKey.getState(s.state)).not.toBeNull();
  });
});

describe("Ctrl+Z 우선순위", () => {
  it("Collaboration(Yjs 되돌리기)보다 높아서 Ctrl+Z를 먼저 받는다", () => {
    // TipTap은 우선순위가 같으면 나중에 등록된 확장의 단축키를 먼저 실행한다. Collaboration은 목록 맨 뒤라서 같은 값이면 진다 (실제 앱에서 확인된 문제).
    expect(MarkdownPaste.config.priority ?? 100).toBeGreaterThan(Collaboration.config.priority ?? 100);
  });

});
