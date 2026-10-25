import { describe, expect, it } from "vitest";

import { normalizeCodeMeta, parseCodeMeta } from "./codeMeta";

describe("parseCodeMeta", () => {
  it("제목·강조 줄·줄 번호를 푼다", () => {
    expect(parseCodeMeta('title="a.ts" {2,4-6} showLineNumbers')).toEqual({ title: "a.ts", lines: [2, 4, 5, 6], showLineNumbers: true });
    expect(parseCodeMeta("title='src/한글.ts'")).toMatchObject({ title: "src/한글.ts" });
    expect(parseCodeMeta("ln")).toMatchObject({ showLineNumbers: true });
  });

  it("모르는 글·잘못된 값은 무시한다", () => {
    expect(parseCodeMeta("foo bar")).toEqual({ title: null, lines: [], showLineNumbers: false });
    expect(parseCodeMeta('title=""')).toMatchObject({ title: null });
    expect(parseCodeMeta("{3,5-}")).toMatchObject({ lines: [3] });
    expect(parseCodeMeta(null)).toEqual({ title: null, lines: [], showLineNumbers: false });
    expect(parseCodeMeta("lnx")).toMatchObject({ showLineNumbers: false });
  });

  it("줄은 겹침 없이 정렬되고 크기에 상한이 있다", () => {
    expect(parseCodeMeta("{3,1-3}").lines).toEqual([1, 2, 3]);
    expect(parseCodeMeta("{1-99999999}").lines).toHaveLength(2000);
  });
});

describe("normalizeCodeMeta", () => {
  it("공백을 정리하고 비면 null", () => {
    expect(normalizeCodeMeta("  a \n b ")).toBe("a b");
    expect(normalizeCodeMeta("   ")).toBeNull();
    expect(normalizeCodeMeta(3)).toBeNull();
  });
});
