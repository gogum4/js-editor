import { describe, expect, it } from "vitest";

import { looksLikeMarkdown } from "./looksLikeMarkdown";

describe("looksLikeMarkdown", () => {
  it("블록 문법이 한 줄이라도 있으면 Markdown이다", () => {
    for (const text of [
      "# 제목\n본문",
      "- 항목",
      "* 항목",
      "1. 하나\n2. 둘",
      "> 인용",
      "> [!NOTE]\n> 내용",
      "```js\nlet a;\n```",
      "$$\nx^2\n$$",
      "<details>\n<summary>토글</summary>\n</details>",
      "본문[^1]\n\n[^1]: 각주",
      "- [ ] 할 일",
    ]) {
      expect(looksLikeMarkdown(text), text).toBe(true);
    }
  });

  it("표(머리글 줄 + 구분 줄)는 Markdown이다", () => {
    expect(looksLikeMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(true);
    expect(looksLikeMarkdown("a | b\n--- | ---\n1 | 2")).toBe(true); // 바깥 세로선이 없어도 GFM 표다
    expect(looksLikeMarkdown("a | b\n그냥 글 | 입니다")).toBe(false); // 구분 줄(---)이 없으면 표가 아니다
  });

  it("강한 인라인 문법이 있으면 Markdown이다", () => {
    for (const text of ["이건 **굵게** 입니다", "~~지움~~", "[글](https://example.com)", "[[페이지]] 참고", "`코드`를 쓰세요"]) {
      expect(looksLikeMarkdown(text), text).toBe(true);
    }
  });

  it("평범한 글은 Markdown이 아니다", () => {
    for (const text of [
      "그냥 한 줄 글",
      "여러 줄\n글입니다\n그냥 글",
      "가격은 $5 이고 $6 입니다",
      "3 * 4 * 5 = 60",
      "*기울임* 이나 _기울임_ 은 신호로 보지 않는다",
      "#해시태그 는 제목이 아니다",
      "-5도까지 내려갑니다",
      "2024.05.01 에 만났다",
      "",
      "   \n  ",
    ]) {
      expect(looksLikeMarkdown(text), text).toBe(false);
    }
  });

  it("주소 하나만 붙여넣으면 아니다 (링크 붙여넣기의 몫)", () => {
    expect(looksLikeMarkdown("https://example.com/a?b=1#c")).toBe(false);
    expect(looksLikeMarkdown("  mailto:a@b.com  ")).toBe(false);
  });

  it("Windows 줄바꿈도 같다", () => {
    expect(looksLikeMarkdown("# 제목\r\n본문")).toBe(true);
  });
});
