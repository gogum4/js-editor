import { describe, expect, it } from "vitest";

import { type CodeEdit, computeIndentEdits } from "./codeIndent";

/** 수정을 실제로 적용해 결과 글자를 본다. 뒤에서부터 적용한다. */
const apply = (text: string, edits: CodeEdit[]) =>
  [...edits].reverse().reduce((t, e) => t.slice(0, e.pos) + e.insert + t.slice(e.pos + e.remove), text);

const indent = (text: string, start: number, end = start) => apply(text, computeIndentEdits(text, start, end, false));
const outdent = (text: string, start: number, end = start) => apply(text, computeIndentEdits(text, start, end, true));

describe("Tab", () => {
  it("inserts a tab at the cursor", () => {
    expect(indent("ab", 1)).toBe("a\tb");
  });

  it("replaces a selection within one line with a tab", () => {
    expect(indent("abcd", 1, 3)).toBe("a\td");
  });

  it("indents every line touched by a multi-line selection", () => {
    expect(indent("a\nb\nc", 0, 5)).toBe("\ta\n\tb\n\tc");
    expect(indent("a\nb\nc", 1, 3)).toBe("\ta\n\tb\nc");
  });

  it("skips the last line when the selection ends at its very start", () => {
    expect(indent("a\nb\nc", 0, 4)).toBe("\ta\n\tb\nc");
  });

  it("does not add a tab to blank lines", () => {
    expect(indent("a\n\nb", 0, 4)).toBe("\ta\n\n\tb");
  });
});

describe("Shift+Tab", () => {
  it("removes one leading tab from the cursor line", () => {
    expect(outdent("\t\ta", 3)).toBe("\ta");
  });

  it("removes up to 4 leading spaces", () => {
    expect(outdent("      a", 7)).toBe("  a");
    expect(outdent("  a", 3)).toBe("a");
  });

  it("does nothing on a line without indentation", () => {
    expect(computeIndentEdits("a", 1, 1, true)).toEqual([]);
  });

  it("outdents every selected line", () => {
    expect(outdent("\ta\n\tb\nc", 0, 7)).toBe("a\nb\nc");
  });

  it("only touches the cursor line when nothing is selected", () => {
    expect(outdent("\ta\n\tb", 4)).toBe("\ta\nb");
  });
});
