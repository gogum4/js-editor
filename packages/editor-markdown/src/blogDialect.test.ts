import { describe, expect, it } from "vitest";

import { docToMarkdown } from "./markdown.ts";
import { markdownToDoc, type ImportContext } from "./markdownImport.ts";
import { scanDirectiveLines } from "./rawDirectives.ts";

const ctx: ImportContext = { resolvePage: () => null, resolveImage: () => null, remoteImages: true, dialect: "blog" };
const noPages = { pageTitle: () => null, dialect: "blog" as const };

const parse = (md: string) => markdownToDoc(md, ctx, "").doc;
const roundTrip = (md: string) => docToMarkdown(parse(md), noPages).markdown;
const types = (md: string) => parse(md).content?.map((n) => n.type);

describe("scanDirectiveLines", () => {
  it("가장 최근에 연 컨테이너부터 닫고, 짝 없는 줄은 건드리지 않는다", () => {
    const roles = scanDirectiveLines([":::a", ":::b", "x", ":::", ":::", ":::", "::img{a=1}", ":::c"]);
    expect(roles.map((r) => r.kind)).toEqual(["open", "open", "close", "close", "raw", "raw"]);
    expect(roles.map((r) => r.line)).toEqual([0, 1, 3, 4, 6, 7]);
  });
});

describe("블로그 방언 가져오기", () => {
  it("이름만 있는 콜아웃은 콜아웃 노드가 되고 다섯 종류가 짝지어진다", () => {
    for (const [name, type] of [["note", "note"], ["info", "important"], ["tip", "tip"], ["warning", "warning"], ["danger", "caution"]]) {
      const doc = parse(`:::${name}\n내용\n:::\n`);
      expect(doc.content?.[0]).toMatchObject({ type: "callout", attrs: { type } });
      expect(roundTrip(`:::${name}\n내용\n:::\n`)).toBe(`:::${name}\n내용\n:::\n`);
    }
  });

  it("제목이 있는 콜아웃·indent·fold는 여는 줄 원문을 간직한 directive이고 안쪽을 고칠 수 있다", () => {
    const source = ":::note[제목]\n안쪽 *글*\n:::\n\n:::indent{n=2}\n들여쓴 글\n:::\n\n:::fold{h=2}\n접힘\n:::\n";
    const doc = parse(source);
    expect(doc.content?.map((n) => n.type)).toEqual(["directive", "directive", "directive"]);
    expect(doc.content?.[0]?.attrs?.head).toBe(":::note[제목]");
    expect(JSON.stringify(doc.content?.[0]?.content)).toContain("안쪽");
    expect(roundTrip(source)).toBe(source);
  });

  it("중첩한 컨테이너도 구조로 읽고 왕복한다", () => {
    const source = ":::indent{n=1}\n:::note\n중첩\n:::\n\n끝 문단\n:::\n"; // 닫는 줄 뒤에는 빈 줄을 쓴다(정규화)
    const doc = parse(source);
    const outer = doc.content?.[0];
    expect(outer?.type).toBe("directive");
    expect(outer?.content?.map((n) => n.type)).toEqual(["callout", "paragraph"]);
    expect(roundTrip(source)).toBe(source);
  });

  it("center·right는 안쪽 문단의 정렬이 되고, 이어지는 같은 정렬은 한 컨테이너로 내보낸다", () => {
    const doc = parse(":::center\n가운데 하나\n\n가운데 둘\n:::\n\n:::right\n오른쪽\n:::\n");
    expect(doc.content?.map((n) => [n.type, n.attrs?.textAlign])).toEqual([["paragraph", "center"], ["paragraph", "center"], ["paragraph", "right"]]);
    expect(roundTrip(":::center\n가운데 하나\n\n가운데 둘\n:::\n\n:::right\n오른쪽\n:::\n")).toBe(":::center\n가운데 하나\n\n가운데 둘\n:::\n\n:::right\n오른쪽\n:::\n");
  });

  it("center 안에 목록 같은 블록이 있으면 정렬로 바꾸지 않고 directive로 둔다", () => {
    const source = ":::center\n- 항목\n:::\n";
    expect(types(source)).toEqual(["directive"]);
    expect(roundTrip(source)).toBe(source);
  });

  it("한 줄짜리·글 중간 디렉티브는 원문 그대로", () => {
    const source = "앞 :postlink[글]{slug=a-b} 뒤\n\n::youtube{id=abc123 w=450 h=250}\n\n::post{slug=my-post}\n\n::series{id=3}\n\n::x[https://x.com/a/b?c=1]\n";
    expect(roundTrip(source)).toBe(source);
  });

  it("닫히지 않은 컨테이너와 짝 없는 닫는 줄도 글자를 잃지 않는다", () => {
    expect(roundTrip(":::note\n내용\n")).toBe(":::note\n\n내용\n");
    expect(roundTrip("문단\n\n:::\n")).toContain("문단");
  });

  it("문단 안의 줄바꿈 한 개는 하드 브레이크가 아니라 글자 속 줄바꿈이다 (블로그는 공백으로 그린다)", () => {
    const source = "첫 줄\n둘째 줄\n셋째 줄\n";
    const doc = parse(source);
    expect(JSON.stringify(doc)).not.toContain("hardBreak");
    expect(roundTrip(source)).toBe(source);
  });

  it("명시적 줄바꿈(백슬래시)은 하드 브레이크로 남는다", () => {
    const source = "앞\\\n뒤\n";
    expect(JSON.stringify(parse(source))).toContain("hardBreak");
    expect(roundTrip(source)).toBe(source);
  });

  it("한 줄짜리 $$…$$ 는 원문 그대로, 여러 줄 $$ 는 블록 수식", () => {
    expect(roundTrip("$$y=Wx+b$$\n")).toBe("$$y=Wx+b$$\n");
    expect(types("$$y=Wx+b$$\n")).toEqual(["raw"]);
    expect(types("$$\ny=Wx+b\n$$\n")).toEqual(["mathBlock"]);
    expect(roundTrip("$$\ny=Wx+b\n$$\n")).toBe("$$\ny=Wx+b\n$$\n");
  });

  it("열 정렬이 있는 표는 원문 그대로, 없는 표는 표 노드", () => {
    const aligned = "| a | b |\n| :--- | ---: |\n| 1 | 2 |\n";
    expect(types(aligned)).toEqual(["raw"]);
    expect(roundTrip(aligned)).toBe(aligned);
    expect(types("| a | b |\n| --- | --- |\n| 1 | 2 |\n")).toEqual(["table"]);
  });

  it("블로그에 없는 문법은 글자로 둔다: [[위키]], 줄 끝 ^id, > [!NOTE]", () => {
    const doc = parse("[[위키]] 글 ^abc\n\n> [!NOTE]\n> 인용\n");
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "blockquote"]);
    expect(JSON.stringify(doc)).toContain("^abc");
    expect(JSON.stringify(doc)).not.toContain("pageLink");
    expect(JSON.stringify(doc)).not.toContain("callout");
  });

  it("HTML 블록은 원문 그대로 보존한다", () => {
    const source = "<div class=\"x\">\n<b>굵게</b>\n</div>\n";
    expect(types(source)).toEqual(["raw"]);
    expect(roundTrip(source)).toBe(source);
  });

  it("이미지는 원문 그대로의 rawInline이다 (주소의 ?w= 크기와 링크 속 이미지 포함)", () => {
    const source = "![설명|300](https://example.com/a.png) 글 ![b](/img/3?w=50%25)\n\n[![c](/img/4)](https://example.com)\n";
    const doc = parse(source);
    expect(JSON.stringify(doc)).not.toContain('"image"');
    expect(JSON.stringify(doc)).not.toContain('"width"');
    expect(roundTrip(source)).toBe(source);
  });

  it("인라인 HTML은 원문 그대로의 rawInline이다", () => {
    const source = "앞 <u>밑줄</u> 뒤\n";
    expect(roundTrip(source)).toBe(source);
  });

  it("내보내기: 블로그에 없는 서식은 풀어서 쓰고 안내한다", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "justify" }, content: [{ type: "text", text: "양쪽" }] },
        { type: "toggle", content: [{ type: "paragraph", content: [{ type: "text", text: "제목" }] }, { type: "paragraph", content: [{ type: "text", text: "속" }] }] },
      ],
    };
    const { markdown, notices } = docToMarkdown(doc, noPages);
    expect(markdown).toBe("양쪽\n\n**제목**\n\n속\n");
    expect(notices.join("\n")).toContain("토글");
    expect(notices.join("\n")).toContain("양쪽 정렬");
  });

  it("옵션을 주지 않으면(obsidian) 이전과 같다", () => {
    const md = docToMarkdown({ type: "doc", content: [{ type: "callout", attrs: { type: "note" }, content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }] }, { pageTitle: () => null }).markdown;
    expect(md).toBe("> [!NOTE]\n> a\n");
  });

  it("두 번째 왕복은 같다(멱등)", () => {
    const source = "문단\n둘째 줄\n\n:::indent{n=1}\n:::note\n중첩 :postlink[a]{slug=b}\n:::\n:::\n\n::youtube{id=x}\n\n:::center\n가운데\n:::\n";
    const once = roundTrip(source);
    expect(roundTrip(once)).toBe(once);
  });
});
