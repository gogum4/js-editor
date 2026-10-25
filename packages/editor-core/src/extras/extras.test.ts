// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { createCoreExtensions } from "../coreExtensions";
import { runSlashCommand } from "../slash/runSlashCommand";
import { newEditor, typeText } from "../testing/typing";

const all = { marks: true, abbr: true, comments: true, tags: true, citations: true, definitions: true, toc: true, emoji: true } as const;
const editorWith = (extras = all) => newEditor(undefined, createCoreExtensions(null, { extras }));
const inline = (editor: ReturnType<typeof newEditor>) => {
  const out: Array<string | [string, string[]]> = [];
  editor.state.doc.firstChild!.forEach((child) => out.push(child.isText ? [child.text!, child.marks.map((mark) => mark.type.name)] : `${child.type.name}:${JSON.stringify(child.attrs)}`));
  return out;
};

describe("추가 문법: 입력 규칙", () => {
  it("==글==은 하이라이트, ++글++은 삽입, ^글^은 위첨자", () => {
    const editor = editorWith();
    typeText(editor, "==강조== ");
    typeText(editor, "++추가++ ");
    typeText(editor, "x^2^");
    expect(inline(editor)).toEqual([["강조", ["highlight"]], [" ", []], ["추가", ["insert"]], [" x", []], ["2", ["superscript"]]]);
  });

  it("%%메모%%는 주석, #태그 + 공백은 태그, [@키]는 인용", () => {
    const editor = editorWith();
    typeText(editor, "%%메모%%");
    typeText(editor, " #할일/오늘 ");
    typeText(editor, "[@smith2020]");
    expect(inline(editor)).toEqual([`comment:{"text":"메모"}`, [" ", []], `tag:{"name":"할일/오늘"}`, [" ", []], `citation:{"source":"@smith2020"}`]);
  });

  it(":smile:은 이모지, 모르는 이름과 시간 표기는 그대로", () => {
    const editor = editorWith();
    typeText(editor, ":smile: 10:30:45 :nope:");
    expect(editor.state.doc.firstChild!.textContent).toBe("😄 10:30:45 :nope:");
  });

  it("켜지 않은 문법은 입력 규칙도 스키마도 없다", () => {
    const plain = newEditor();
    typeText(plain, "==x== %%y%% #z ");
    expect(plain.state.doc.firstChild!.textContent).toBe("==x== %%y%% #z ");
    expect(plain.schema.marks.highlight).toBeUndefined();
    expect(plain.schema.nodes.comment).toBeUndefined();
    expect(plain.schema.nodes.toc).toBeUndefined();
  });
});

describe("추가 문법: 명령", () => {
  it("글자색·배경색은 올바른 색만 받는다", () => {
    const editor = editorWith();
    typeText(editor, "색");
    editor.commands.selectAll();
    expect(editor.commands.setTextColor("#f00")).toBe(true);
    expect(editor.commands.setBackgroundColor("blue")).toBe(true);
    expect(editor.commands.setTextColor("url(x)")).toBe(false);
    expect(inline(editor)).toEqual([["색", ["textColor", "backgroundColor"]]]);
    expect(editor.state.doc.firstChild!.firstChild!.marks[0]!.attrs.color).toBe("#ff0000");
    editor.commands.unsetTextColor();
    expect(inline(editor)).toEqual([["색", ["backgroundColor"]]]);
  });

  it("약어는 설명이 있어야 한다", () => {
    const editor = editorWith();
    typeText(editor, "HTML");
    editor.commands.selectAll();
    expect(editor.commands.setAbbr(" ")).toBe(false);
    expect(editor.commands.setAbbr("Hyper Text Markup Language")).toBe(true);
    expect(editor.state.doc.firstChild!.firstChild!.marks[0]!.attrs.title).toBe("Hyper Text Markup Language");
  });

  it("위첨자와 아래첨자는 함께 걸리지 않는다", () => {
    const editor = editorWith();
    typeText(editor, "x");
    editor.commands.selectAll();
    editor.commands.toggleSuperscript();
    editor.commands.toggleSubscript();
    expect(inline(editor)).toEqual([["x", ["subscript"]]]);
  });
});

describe("추가 문법: 슬래시 명령", () => {
  // 실제 메뉴처럼 `/글자`를 친 뒤 그 범위를 지우며 실행한다.
  const run = (editor: ReturnType<typeof newEditor>, id: string) => {
    typeText(editor, "/x");
    return runSlashCommand(editor, { from: 1, to: 3 }, id);
  };

  it("목차·정의 목록 블록을 끼운다", () => {
    for (const [id, type] of [["toc", "toc"], ["definitionList", "definitionList"]] as const) {
      const editor = editorWith();
      expect(run(editor, id)).toBe(true);
      const types: string[] = [];
      editor.state.doc.forEach((node) => types.push(node.type.name));
      expect(types).toContain(type);
    }
  });

  it("주석·인용 항목은 인라인 노드를 끼운다", () => {
    for (const [id, type] of [["comment", "comment"], ["citation", "citation"]] as const) {
      const editor = editorWith();
      expect(run(editor, id)).toBe(true);
      expect(inline(editor).some((entry) => typeof entry === "string" && entry.startsWith(`${type}:`))).toBe(true);
    }
  });

  it("글자색 항목은 이어서 쓰는 글에 색을 건다", () => {
    const editor = editorWith();
    run(editor, "color-red");
    typeText(editor, "빨강");
    expect(inline(editor)).toEqual([["빨강", ["textColor"]]]);
  });

  it("켜지 않으면 항목이 메뉴에 없다 (extras 없음 → 항목 없음)", async () => {
    const { extraSlashItems } = await import("../lib/slashItems");
    expect(extraSlashItems(undefined)).toEqual([]);
    expect(extraSlashItems({ toc: true }).map((item) => item.id)).toEqual(["toc"]);
    expect(extraSlashItems(all).length).toBeGreaterThan(20);
  });
});

describe("추가 문법: 정의 목록의 Enter", () => {
  it("용어에서 Enter를 치면 아래에 설명이 생긴다", () => {
    const editor = editorWith();
    editor.commands.insertDefinitionList();
    // 첫 용어 안으로
    editor.commands.setTextSelection(2);
    typeText(editor, "용어");
    const doc = () => editor.state.doc.firstChild!;
    expect(doc().type.name).toBe("definitionList");
    expect(doc().child(0).textContent).toBe("용어");
  });
});

describe("추가 문법: 정의 목록 합치기", () => {
  it("이웃한 정의 목록은 하나로 합쳐진다", () => {
    const list = (term: string) => ({ type: "definitionList", content: [{ type: "definitionTerm", content: [{ type: "text", text: term }] }, { type: "definitionDetail", content: [{ type: "text", text: "설명" }] }] });
    const editor = editorWith();
    editor.commands.setContent({ type: "doc", content: [list("가"), list("나"), { type: "paragraph" }] });
    // 내용을 바꾸는 입력이 한 번 일어나야 플러그인이 동작한다.
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    typeText(editor, "x");
    const types: string[] = [];
    editor.state.doc.forEach((node) => types.push(`${node.type.name}:${node.childCount}`));
    expect(types).toEqual(["definitionList:4", "paragraph:1"]);
  });
});
