import { describe, expect, it } from "vitest";

import {
  allEmoji,
  citationKeys,
  DEFAULT_EMOJI_SUGGESTIONS,
  EMOJI_KEYWORDS,
  colorsFromStyle,
  emojiFromShortcode,
  normalizeAbbrTitle,
  normalizeCitationSource,
  normalizeColor,
  normalizeCommentText,
  normalizeTag,
  replaceEmojiShortcodes,
  searchEmoji,
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

describe("이모지 검색(자동완성)", () => {
  const names = (query: string, limit = 8, recent: string[] = []) => searchEmoji(query, limit, recent).map((match) => match.name);

  it("이름이 같은 것이 먼저, 그다음 이름이 그것으로 시작하는 것", () => {
    expect(names("smile")[0]).toBe("smile");
    expect(names("thumbs")).toEqual(["thumbsup", "thumbsdown"]);
    expect(names("rock")[0]).toBe("rocket");
  });

  it("한국어·영어 동의어로 찾는다", () => {
    expect(names("웃음")).toContain("smile");
    expect(names("하트")).toEqual(expect.arrayContaining(["heart", "orange_heart", "blue_heart"]));
    expect(names("좋아요")).toEqual(expect.arrayContaining(["+1", "thumbsup"]));
    expect(names("축하")[0]).toBe("tada");
    expect(names("celebrate")).toContain("tada");
    expect(names("로켓")).toEqual(["rocket"]);
    expect(names("체크")).toEqual(expect.arrayContaining(["white_check_mark", "heavy_check_mark"]));
  });

  it("밑줄·콜론·대소문자는 무시한다", () => {
    expect(names("HEART_EYES")).toEqual(names("hearteyes"));
    expect(names(":sunglas")[0]).toBe("sunglasses");
    expect(names("thumbs up")[0]).toBe("thumbsup");
  });

  it("이름 앞쪽 일치 → 동의어 앞쪽 일치 → 이름에 포함 → 동의어에 포함 순서", () => {
    // "cat": 이름 cat(0), 이름 앞쪽 일치 없음. "star"는 star(0)·star2(1)·star_struck(1)이 이름에, 동의어에 starting 같은 것은 없다.
    expect(names("star")[0]).toBe("star");
    expect(names("star")).toEqual(expect.arrayContaining(["star2", "star_struck"]));
    // "light"는 이름에 포함(flashlight)과 동의어에 포함(sunny? no) — 이름 포함이 먼저 나온다.
    expect(names("light")).toContain("flashlight");
  });

  it("같은 등급에서는 최근에 쓴 것이 먼저다", () => {
    // 이름이 정확히 같은 것(heart)은 최근보다 앞선다. "hea"처럼 모두 앞쪽 일치인 같은 등급에서만 최근 순서가 이긴다.
    expect(names("heart", 3, ["blue_heart"])[0]).toBe("heart");
    expect(names("hea", 3, [])[0]).toBe("heart");
    expect(names("hea", 3, ["heart_eyes"])[0]).toBe("heart_eyes");
  });

  it("글자가 비면 최근(없으면 기본 제안), 개수 제한을 지킨다", () => {
    expect(names("", 3, ["fire", "tada", "joy", "heart"])).toEqual(["fire", "tada", "joy"]);
    expect(names("")).toEqual(DEFAULT_EMOJI_SUGGESTIONS.slice(0, 8));
    expect(names("a", 5).length).toBe(5);
    expect(names("", 8, ["없는이름", "fire"])).toEqual(["fire"]);
  });

  it("못 찾으면 빈 목록", () => {
    expect(names("zzzzqqq")).toEqual([]);
  });

  it("동의어 표와 기본 제안의 이름은 모두 실제 이모지 이름이다 (오타 방지)", () => {
    const known = new Set(allEmoji().map((match) => match.name));
    for (const name of Object.keys(EMOJI_KEYWORDS)) expect(known.has(name), name).toBe(true);
    for (const name of DEFAULT_EMOJI_SUGGESTIONS) expect(known.has(name), name).toBe(true);
  });
});
