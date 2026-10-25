import { describe, expect, it } from "vitest";

import {
  citationKeys,
  colorsFromStyle,
  emojiFromShortcode,
  normalizeAbbrTitle,
  normalizeCitationSource,
  normalizeColor,
  normalizeCommentText,
  normalizeTag,
  replaceEmojiShortcodes,
  TAG_IN_TEXT_SOURCE,
} from "./extras.ts";

describe("색", () => {
  it("#rgb·#rrggbb와 기본 색 이름만 받고 #rrggbb 소문자로 정리한다", () => {
    expect(normalizeColor("#F00")).toBe("#ff0000");
    expect(normalizeColor(" #1A2B3C ")).toBe("#1a2b3c");
    expect(normalizeColor("red")).toBe("#dc2626");
    for (const bad of ["", "#12", "#12345", "#gggggg", "rgb(1,2,3)", "red; x:y", "url(x)", "javascript:1", null, 5]) expect(normalizeColor(bad), String(bad)).toBeNull();
  });

  it("인라인 스타일에서 글자색·배경색만 뽑는다", () => {
    expect(colorsFromStyle("color: #f00; background-color:#ff0")).toEqual({ color: "#ff0000", background: "#ffff00" });
    expect(colorsFromStyle("font-size:30px; background: blue")).toEqual({ color: null, background: "#2563eb" });
    expect(colorsFromStyle("color: expression(alert(1)); background:url(x)")).toEqual({ color: null, background: null });
  });
});

describe("태그", () => {
  it("글자가 하나 이상 있는 이름만 태그다 (숫자만은 아님)", () => {
    expect(normalizeTag("#할일")).toBe("할일");
    expect(normalizeTag("project/web-1")).toBe("project/web-1");
    for (const bad of ["123", "", "a b", "/a", "a/", "x".repeat(101), "#"]) expect(normalizeTag(bad), bad).toBeNull();
  });

  it("글 속에서는 줄 처음이나 공백 뒤의 #만 찾는다", () => {
    const re = new RegExp(TAG_IN_TEXT_SOURCE, "gu");
    expect([..."#a 앞 #b-c, x#d [l](#e) url/#f &#39;".matchAll(re)].map((m) => m[1])).toEqual(["a", "b-c"]);
  });
});

describe("인용", () => {
  it("키를 뽑는다 (중복 없이, 끝 구두점 제외)", () => {
    expect(citationKeys("@smith2020; @doe_2021, p. 3")).toEqual(["smith2020", "doe_2021"]);
    expect(citationKeys("see @a:b.c, and -@d.")).toEqual(["a:b.c", "d"]);
    expect(citationKeys("mail me at a@b.com")).toEqual([]);
  });

  it("@키가 없으면 인용이 아니다", () => {
    expect(normalizeCitationSource("  @smith2020  ")).toBe("@smith2020");
    expect(normalizeCitationSource("그냥 글")).toBeNull();
    expect(normalizeCitationSource("@")).toBeNull();
  });
});

describe("그 밖", () => {
  it("주석에는 %%를 넣을 수 없다", () => {
    expect(normalizeCommentText("  메모\n\n\n둘째 ")).toBe("메모\n둘째");
    expect(normalizeCommentText("a %% b")).toBeNull();
    expect(normalizeCommentText("  ")).toBeNull();
  });

  it("약어 설명은 한 줄", () => {
    expect(normalizeAbbrTitle(" Hyper \n Text ")).toBe("Hyper Text");
    expect(normalizeAbbrTitle("")).toBeNull();
  });

  it("이모지 단축 코드", () => {
    expect(emojiFromShortcode("smile")).toBe("😄");
    expect(emojiFromShortcode("+1")).toBe("👍");
    expect(emojiFromShortcode("nope")).toBeNull();
    expect(replaceEmojiShortcodes("좋아 :smile: 그리고 :+1: 시간 10:30:45 와 :nope: 그대로")).toBe("좋아 😄 그리고 👍 시간 10:30:45 와 :nope: 그대로");
  });
});
