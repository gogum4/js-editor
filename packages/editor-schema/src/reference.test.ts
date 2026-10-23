import { describe, expect, it } from "vitest";

import { normalizeReferenceId, normalizeReferenceKind, normalizeReferenceProps, referenceTarget } from "./reference";

describe("참조 노드 속성", () => {
  it("종류는 소문자·숫자·하이픈, 소문자로 시작", () => {
    expect(normalizeReferenceKind("table-schema")).toBe("table-schema");
    expect(normalizeReferenceKind("page")).toBe("page");
    for (const bad of ["", "Page", "1page", "-a", "a b", "a_b", "a".repeat(41), 3, null, undefined]) expect(normalizeReferenceKind(bad)).toBeNull();
  });

  it("id는 비어 있지 않은 한 줄 글자(공백으로 시작·끝나지 않음, 200자 이하)", () => {
    expect(normalizeReferenceId("018f-ab")).toBe("018f-ab");
    expect(normalizeReferenceId("한글 id")).toBe("한글 id");
    for (const bad of ["", " a", "a ", "a\nb", "a\u0000", "a".repeat(201), 1, null]) expect(normalizeReferenceId(bad)).toBeNull();
  });

  it("대상은 둘 다 올바를 때만", () => {
    expect(referenceTarget("page", "x")).toEqual({ kind: "page", id: "x" });
    expect(referenceTarget("Page", "x")).toBeNull();
    expect(referenceTarget("page", "")).toBeNull();
  });

  it("설정(props): 올바른 항목만, 이름순, 없으면 null", () => {
    expect(normalizeReferenceProps({ rows: "5", a: "x" })).toEqual({ a: "x", rows: "5" });
    expect(Object.keys(normalizeReferenceProps({ rows: "5", a: "x" })!)).toEqual(["a", "rows"]);
    expect(normalizeReferenceProps({ "1bad": "x", ok: 3, long: "a".repeat(201), ctl: "a\nb" })).toBeNull();
    for (const bad of [null, undefined, "x", 3, [], {}]) expect(normalizeReferenceProps(bad)).toBeNull();
    expect(referenceTarget("table", "Item", { rows: "5" })).toEqual({ kind: "table", id: "Item", props: { rows: "5" } });
    expect(referenceTarget("table", "Item", {})).toEqual({ kind: "table", id: "Item" });
  });
});
