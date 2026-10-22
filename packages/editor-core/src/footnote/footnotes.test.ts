import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { collectFootnotes, transactionMayChangeFootnotes } from "./footnotes";
import { createCoreExtensions } from "../coreExtensions";

// 에디터를 화면 없이 만들어 트랜잭션을 시험한다(노드 환경이라 DOM이 없어서 `element`를 주지 않는다).
function editorWith(content: object): Editor {
  return new Editor({ extensions: createCoreExtensions(null), content });
}
const p = (...content: object[]) => ({ type: "paragraph", content });
const text = (value: string) => ({ type: "text", text: value });
const note = (value: string) => ({ type: "footnote", attrs: { text: value } });

describe("collectFootnotes", () => {
  it("각주를 문서 순서대로, 위치와 내용과 함께 모은다", () => {
    const editor = editorWith({ type: "doc", content: [p(text("가"), note("첫째"), text("나")), p(note("둘째"))] });
    const notes = collectFootnotes(editor.state.doc);
    expect(notes.map((n) => n.text)).toEqual(["첫째", "둘째"]);
    expect(notes[0]!.pos).toBeLessThan(notes[1]!.pos);
    expect(editor.state.doc.nodeAt(notes[0]!.pos)?.type.name).toBe("footnote");
    editor.destroy();
  });

  it("각주가 없으면 빈 목록이다", () => {
    const editor = editorWith({ type: "doc", content: [p(text("글"))] });
    expect(collectFootnotes(editor.state.doc)).toEqual([]);
    editor.destroy();
  });

  it("중첩된 목록 안의 각주도 찾는다", () => {
    const editor = editorWith({
      type: "doc",
      content: [{ type: "bulletList", content: [{ type: "listItem", content: [p(text("항목"), note("안쪽"))] }] }],
    });
    expect(collectFootnotes(editor.state.doc).map((n) => n.text)).toEqual(["안쪽"]);
    editor.destroy();
  });
});

describe("transactionMayChangeFootnotes", () => {
  const base = () => editorWith({ type: "doc", content: [p(text("앞 "), note("a"), text(" 뒤"))] });

  it("글자 입력은 각주와 상관없다", () => {
    const editor = base();
    const tr = editor.state.tr.insertText("새 글", 2);
    expect(transactionMayChangeFootnotes(tr)).toBe(false);
    editor.destroy();
  });

  it("각주를 끼우거나 지우거나 내용을 고치면 상관있다", () => {
    const editor = base();
    const notePos = collectFootnotes(editor.state.doc)[0]!.pos;
    const insert = editor.state.tr.insert(2, editor.schema.nodes.footnote!.create({ text: "b" }));
    expect(transactionMayChangeFootnotes(insert)).toBe(true);
    const remove = editor.state.tr.delete(notePos, notePos + 1);
    expect(transactionMayChangeFootnotes(remove)).toBe(true);
    const edit = editor.state.tr.setNodeMarkup(notePos, undefined, { text: "바뀜" });
    expect(transactionMayChangeFootnotes(edit)).toBe(true);
    editor.destroy();
  });

  it("각주가 든 범위를 통째로 지우는 편집도 상관있다", () => {
    const editor = base();
    const tr = editor.state.tr.delete(1, editor.state.doc.content.size - 1);
    expect(transactionMayChangeFootnotes(tr)).toBe(true);
    editor.destroy();
  });

  it("서식만 바꾸거나 아무것도 안 바꾸면 상관없다", () => {
    const editor = base();
    expect(transactionMayChangeFootnotes(editor.state.tr.addMark(1, 3, editor.schema.marks.bold!.create()))).toBe(false);
    expect(transactionMayChangeFootnotes(editor.state.tr)).toBe(false);
    editor.destroy();
  });
});
