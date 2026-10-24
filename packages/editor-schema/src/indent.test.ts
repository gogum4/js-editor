import { describe, expect, it } from "vitest";

import { indentFromLeadingSpaces, indentPrefix, MAX_INDENT, normalizeIndent } from "./indent.ts";

describe("indent", () => {
  it("1~8의 정수만 단계로 받는다 (글자 숫자도)", () => {
    expect(normalizeIndent(3)).toBe(3);
    expect(normalizeIndent("3")).toBe(3);
    for (const bad of [0, -1, 9, 1.5, "x", "", null, undefined, "100"]) expect(normalizeIndent(bad), String(bad)).toBeNull();
  });

  it("앞의 들여쓰기 문자 개수를 단계로 (두 개 = 1단계, 홀수는 올림, 상한 8)", () => {
    expect(indentFromLeadingSpaces(0)).toBeNull();
    expect(indentFromLeadingSpaces(1)).toBe(1);
    expect(indentFromLeadingSpaces(2)).toBe(1);
    expect(indentFromLeadingSpaces(3)).toBe(2);
    expect(indentFromLeadingSpaces(6)).toBe(3);
    expect(indentFromLeadingSpaces(999)).toBe(MAX_INDENT);
  });

  it("Markdown 접두는 단계 × 2개의 &emsp;", () => {
    expect(indentPrefix(null)).toBe("");
    expect(indentPrefix(1)).toBe("&emsp;&emsp;");
    expect(indentPrefix(3)).toBe("&emsp;".repeat(6));
    expect(indentPrefix(99)).toBe("");
  });
});
