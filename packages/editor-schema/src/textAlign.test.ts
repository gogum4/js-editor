import { describe, expect, it } from "vitest";

import { ALIGNMENT_LABEL, alignmentOf, isTextAlignment, normalizeTextAlign, TEXT_ALIGNMENTS } from "./textAlign";

describe("normalizeTextAlign", () => {
  it("가운데·오른쪽·양쪽은 그대로, 대소문자와 공백은 무시한다", () => {
    expect(normalizeTextAlign("center")).toBe("center");
    expect(normalizeTextAlign(" Right ")).toBe("right");
    expect(normalizeTextAlign("JUSTIFY")).toBe("justify");
  });

  it("왼쪽(기본)과 알 수 없는 값은 속성 없음(null)이다", () => {
    expect(normalizeTextAlign("left")).toBeNull();
    expect(normalizeTextAlign("")).toBeNull();
    expect(normalizeTextAlign("start")).toBeNull();
    expect(normalizeTextAlign(null)).toBeNull();
    expect(normalizeTextAlign(undefined)).toBeNull();
    expect(normalizeTextAlign(3)).toBeNull();
  });
});

describe("alignmentOf / isTextAlignment / 이름", () => {
  it("속성이 없으면 왼쪽이다", () => {
    expect(alignmentOf(undefined)).toBe("left");
    expect(alignmentOf({})).toBe("left");
    expect(alignmentOf({ textAlign: "center" })).toBe("center");
    expect(alignmentOf({ textAlign: "weird" })).toBe("left");
  });

  it("네 가지 모두 이름이 있다", () => {
    for (const alignment of TEXT_ALIGNMENTS) {
      expect(isTextAlignment(alignment)).toBe(true);
      expect(ALIGNMENT_LABEL[alignment]).not.toBe("");
    }
    expect(isTextAlignment("middle")).toBe(false);
  });
});
