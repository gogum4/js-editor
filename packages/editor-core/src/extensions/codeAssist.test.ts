import { describe, expect, it } from "vitest";

import { enterEdit, indentUnit, shouldDeletePair, typedCharAction } from "./codeAssist";

describe("typedCharAction: opening characters", () => {
  it("inserts a pair at the end of text, before whitespace and before a closer", () => {
    expect(typedCharAction("", 0, 0, "(")).toEqual({ kind: "pair", open: "(", close: ")" });
    expect(typedCharAction("a ", 1, 1, "[")).toEqual({ kind: "pair", open: "[", close: "]" });
    expect(typedCharAction("a\nb", 1, 1, "{")).toEqual({ kind: "pair", open: "{", close: "}" });
    expect(typedCharAction("f()", 2, 2, "[")).toEqual({ kind: "pair", open: "[", close: "]" });
  });

  it("does not pair when a word follows the cursor", () => {
    expect(typedCharAction("abc", 0, 0, "(")).toBeNull();
    expect(typedCharAction("한글", 0, 0, '"')).toBeNull();
  });

  it("pairs quotes after punctuation or spaces but not after a word or the same quote", () => {
    expect(typedCharAction("x = ", 4, 4, '"')).toEqual({ kind: "pair", open: '"', close: '"' });
    expect(typedCharAction("f(", 2, 2, "'")).toEqual({ kind: "pair", open: "'", close: "'" });
    expect(typedCharAction("don", 3, 3, "'")).toBeNull();
    expect(typedCharAction("한글", 2, 2, "'")).toBeNull();
    expect(typedCharAction("''", 2, 2, "'")).toBeNull();
  });

  it("ignores characters that are not pairs", () => {
    expect(typedCharAction("", 0, 0, "a")).toBeNull();
    expect(typedCharAction("", 0, 0, "<")).toBeNull();
  });
});

describe("typedCharAction: closing characters", () => {
  it("steps over the same closer that is right after the cursor", () => {
    expect(typedCharAction("()", 1, 1, ")")).toEqual({ kind: "skip" });
    expect(typedCharAction("[]", 1, 1, "]")).toEqual({ kind: "skip" });
    expect(typedCharAction('""', 1, 1, '"')).toEqual({ kind: "skip" });
  });

  it("types a closer normally otherwise", () => {
    expect(typedCharAction("(", 1, 1, ")")).toBeNull();
    expect(typedCharAction("(a)", 1, 1, ")")).toBeNull();
  });
});

describe("typedCharAction: selection", () => {
  it("wraps a selection with any of the five pairs", () => {
    expect(typedCharAction("abc", 0, 3, "(")).toEqual({ kind: "wrap", open: "(", close: ")" });
    expect(typedCharAction("abc", 1, 2, '"')).toEqual({ kind: "wrap", open: '"', close: '"' });
    expect(typedCharAction("a\nb", 0, 3, "{")).toEqual({ kind: "wrap", open: "{", close: "}" });
  });

  it("replaces a selection normally for other characters and closers", () => {
    expect(typedCharAction("abc", 0, 3, "x")).toBeNull();
    expect(typedCharAction("abc", 0, 3, ")")).toBeNull();
  });
});

describe("shouldDeletePair", () => {
  it("is true only between an empty pair", () => {
    expect(shouldDeletePair("()", 1)).toBe(true);
    expect(shouldDeletePair("[]", 1)).toBe(true);
    expect(shouldDeletePair("{}", 1)).toBe(true);
    expect(shouldDeletePair('""', 1)).toBe(true);
    expect(shouldDeletePair("''", 1)).toBe(true);
    expect(shouldDeletePair("(a)", 1)).toBe(false);
    expect(shouldDeletePair("(]", 1)).toBe(false);
    expect(shouldDeletePair("()", 0)).toBe(false);
    expect(shouldDeletePair("", 0)).toBe(false);
  });

  it("is false at the end of the text after a character that is not an opener", () => {
    expect(shouldDeletePair("abc", 3)).toBe(false);
    expect(shouldDeletePair("a", 1)).toBe(false);
    expect(shouldDeletePair("x\n", 2)).toBe(false);
    expect(shouldDeletePair("a b", 1)).toBe(false);
    expect(shouldDeletePair("toString", 8)).toBe(false); // 상속된 속성 이름과 겹쳐도 안전해야 한다
  });

  it("is false for an opener at the very end (nothing to delete after it)", () => {
    expect(shouldDeletePair("(", 1)).toBe(false);
  });
});

describe("indentUnit", () => {
  it("uses a tab for tab-indented lines and for blocks without space indentation", () => {
    expect(indentUnit("a\n\tb", "\t")).toBe("\t");
    expect(indentUnit("a\nb", "")).toBe("\t");
  });

  it("follows the narrowest space indentation of the block", () => {
    expect(indentUnit("a\n  b\n    c", "  ")).toBe("  ");
    expect(indentUnit("a\n    b\n        c", "")).toBe("    ");
  });
});

describe("enterEdit", () => {
  it("keeps the indentation of the current line", () => {
    expect(enterEdit("\tfoo", 4, 4)).toEqual({ insert: "\n\t", cursor: 2 });
    expect(enterEdit("foo", 3, 3)).toEqual({ insert: "\n", cursor: 1 });
    expect(enterEdit("a\n  bar", 7, 7)).toEqual({ insert: "\n  ", cursor: 3 });
  });

  it("indents one more level after an opener at the end of the line", () => {
    expect(enterEdit("if (x) {", 8, 8)).toEqual({ insert: "\n\t", cursor: 2 });
    expect(enterEdit("\tf(", 3, 3)).toEqual({ insert: "\n\t\t", cursor: 3 });
    expect(enterEdit("a\n  b\n  c [", 11, 11)).toEqual({ insert: "\n    ", cursor: 5 });
  });

  it("opens a block between a pair and moves the closer to its own line", () => {
    expect(enterEdit("f() {}", 5, 5)).toEqual({ insert: "\n\t\n", cursor: 2 });
    expect(enterEdit("\tx = [", 6, 6)).toEqual({ insert: "\n\t\t", cursor: 3 });
    expect(enterEdit("\tx = []", 6, 6)).toEqual({ insert: "\n\t\t\n\t", cursor: 3 });
  });

  it("only indents when the closer is not right after the cursor", () => {
    expect(enterEdit("{ }", 1, 1)).toEqual({ insert: "\n\t", cursor: 2 });
  });

  it("carries the text after the cursor to the new line untouched", () => {
    const edit = enterEdit("\tab", 2, 2);
    expect(edit).toEqual({ insert: "\n\t", cursor: 2 });
  });
});
