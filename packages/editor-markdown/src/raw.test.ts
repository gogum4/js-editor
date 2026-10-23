import { describe, expect, it } from "vitest";

import { docToMarkdown } from "./markdown.ts";
import { markdownToDoc, type ImportContext } from "./markdownImport.ts";
import { findRawBlocks } from "./rawDirectives.ts";

const ctx: ImportContext = { resolvePage: () => null, resolveImage: () => null, rawDirectives: true };
const noPages = { pageTitle: () => null };

const roundTrip = (markdown: string, context: ImportContext = ctx) =>
  docToMarkdown(markdownToDoc(markdown, context, "").doc, noPages).markdown;

describe("findRawBlocks", () => {
  it("한 줄짜리 디렉티브와 컨테이너를 찾는다", () => {
    const lines = ["문단", "", "::youtube{id=abc}", "", ":::note[제목]", "안쪽", ":::", "끝"];
    expect(findRawBlocks(lines)).toEqual([
      { start: 2, end: 3, text: "::youtube{id=abc}" },
      { start: 4, end: 7, text: ":::note[제목]\n안쪽\n:::" },
    ]);
  });

  it("중첩된 컨테이너는 바깥 것 하나가 한 구간이다", () => {
    const lines = ["::::fold{h=1}", ":::indent{n=1}", "안", ":::", "::::"].map((l) => l);
    // 닫는 줄은 콜론 수와 상관없이 짝으로 센다.
    expect(findRawBlocks(lines)).toEqual([{ start: 0, end: 5, text: lines.join("\n") }]);
  });

  it("코드 울타리 안은 건드리지 않는다", () => {
    const lines = ["```md", "::youtube{id=x}", ":::note", ":::", "```"];
    expect(findRawBlocks(lines)).toEqual([]);
  });

  it("컨테이너 안의 코드 울타리 속 닫는 줄은 닫는 줄이 아니다", () => {
    const lines = [":::note", "```", ":::", "```", ":::"];
    expect(findRawBlocks(lines)).toEqual([{ start: 0, end: 5, text: lines.join("\n") }]);
  });

  it("닫히지 않은 컨테이너는 여는 줄 한 줄만 구간으로 삼는다", () => {
    expect(findRawBlocks([":::note", "내용"])).toEqual([{ start: 0, end: 1, text: ":::note" }]);
  });

  it("이름 없는 `:::`나 일반 글은 디렉티브가 아니다", () => {
    expect(findRawBlocks([":::", "::: 설명", "::", "http://x"])).toEqual([]);
  });
});

describe("raw 노드 왕복", () => {
  it("블록 디렉티브가 raw 노드가 되고 원문 그대로 나온다", () => {
    const source = [
      "앞 문단",
      "",
      ":::note[제목]",
      "안쪽 *줄* 하나",
      "안쪽 줄 둘",
      ":::",
      "",
      "::youtube{id=\"a_b\" start=3}",
      "",
      "뒤 문단",
      "",
    ].join("\n");
    const { doc } = markdownToDoc(source, ctx, "");
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "raw", "raw", "paragraph"]);
    expect(doc.content?.[1]?.attrs?.text).toBe(":::note[제목]\n안쪽 *줄* 하나\n안쪽 줄 둘\n:::");
    expect(roundTrip(source)).toBe(source);
  });

  it("글 중간 디렉티브가 rawInline이 되고 앞뒤 서식은 그대로다", () => {
    const source = "앞선 :postlink[게시물]{slug=server-computer-buy}에서 **굵게** 했다.\n";
    const { doc } = markdownToDoc(source, ctx, "");
    const kinds = doc.content?.[0]?.content?.map((n) => n.type);
    expect(kinds).toContain("rawInline");
    expect(roundTrip(source)).toBe(source);
  });

  it("raw 안의 글자는 이스케이프·변환되지 않는다", () => {
    const source = ":::fold{h=\"a*b_c [x] \\\\ $y$\"}\n* 목록 같은 줄\n| 표 | 같은 |\n[[위키]] ^id\n:::\n";
    expect(roundTrip(source)).toBe(source);
  });

  it("코드 안의 디렉티브 글자는 그대로 코드다", () => {
    const source = "`:postlink[a]{b}`\n\n```\n::youtube{id=x}\n```\n";
    const { doc } = markdownToDoc(source, ctx, "");
    expect(JSON.stringify(doc)).not.toContain("raw");
    expect(roundTrip(source)).toBe(source);
  });

  it("시각·URL·이모티콘 같은 콜론 글자는 디렉티브가 아니다", () => {
    const source = "10:30 에 a:b 와 [링크](https://example.com/a:b) 로 가요 :)\n";
    const { doc } = markdownToDoc(source, ctx, "");
    expect(JSON.stringify(doc)).not.toContain("raw");
    expect(roundTrip(source)).toBe(source);
  });

  it("옵션을 끄면(기본) 일반 글자로 읽는다 — 노드가 생기지 않는다", () => {
    const { doc } = markdownToDoc("::youtube{id=x}\n\n:postlink[a]{b}\n", { ...ctx, rawDirectives: false }, "");
    expect(JSON.stringify(doc)).not.toContain('"raw');
  });

  it("두 번째 왕복도 같다(멱등)", () => {
    const source = "문단\n\n:::indent{n=1}\n:::note\n중첩\n:::\n:::\n\n끝 :a[b]{c}\n";
    const once = roundTrip(source);
    expect(roundTrip(once)).toBe(once);
  });

  it("내보내기: 빈 원문의 raw 노드는 내보내지 않는다", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }, { type: "raw", attrs: { text: "" } }] };
    expect(docToMarkdown(doc, noPages).markdown).toBe("a\n");
  });
});
