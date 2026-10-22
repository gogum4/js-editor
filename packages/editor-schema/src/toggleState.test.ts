import { describe, expect, it } from "vitest";

import { MAX_CLOSED_TOGGLES, parseClosedToggles, serializeClosedToggles, withToggleOpen } from "./toggleState";

describe("parseClosedToggles", () => {
  it("저장된 JSON 목록을 읽는다", () => {
    expect(parseClosedToggles('["a","b"]')).toEqual(["a", "b"]);
  });

  it("없거나 이상한 값은 빈 목록이다", () => {
    expect(parseClosedToggles(null)).toEqual([]);
    expect(parseClosedToggles("")).toEqual([]);
    expect(parseClosedToggles("not json")).toEqual([]);
    expect(parseClosedToggles('{"a":1}')).toEqual([]);
  });

  it("문자열이 아닌 항목과 빈 문자열은 버리고 중복은 한 번만 둔다", () => {
    expect(parseClosedToggles('["a",1,null,"","a","b"]')).toEqual(["a", "b"]);
  });

  it("한도를 넘으면 최근 것(뒤쪽)만 남긴다", () => {
    const many = Array.from({ length: MAX_CLOSED_TOGGLES + 5 }, (_, i) => "id" + i);
    const parsed = parseClosedToggles(JSON.stringify(many));
    expect(parsed).toHaveLength(MAX_CLOSED_TOGGLES);
    expect(parsed[parsed.length - 1]).toBe("id" + (MAX_CLOSED_TOGGLES + 4));
  });
});

describe("withToggleOpen / serializeClosedToggles", () => {
  it("닫으면 목록 끝에 더하고, 열면 뺀다", () => {
    expect(withToggleOpen(["a"], "b", false)).toEqual(["a", "b"]);
    expect(withToggleOpen(["a", "b"], "a", true)).toEqual(["b"]);
  });

  it("이미 그 상태면 그대로이고, 다시 닫으면 가장 최근으로 옮긴다", () => {
    expect(withToggleOpen(["a"], "b", true)).toEqual(["a"]);
    expect(withToggleOpen(["a", "b"], "a", false)).toEqual(["b", "a"]);
  });

  it("한도를 넘으면 오래 전에 닫은 것부터 잊는다", () => {
    const full = Array.from({ length: MAX_CLOSED_TOGGLES }, (_, i) => "id" + i);
    const next = withToggleOpen(full, "new", false);
    expect(next).toHaveLength(MAX_CLOSED_TOGGLES);
    expect(next[0]).toBe("id1");
    expect(next[next.length - 1]).toBe("new");
  });

  it("직렬화한 것을 다시 읽으면 같다", () => {
    expect(parseClosedToggles(serializeClosedToggles(["a", "b"]))).toEqual(["a", "b"]);
  });
});
