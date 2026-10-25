import { describe, expect, it } from "vitest";

import { docToMarkdown } from "./markdown.ts";
import { type ImportContext, markdownToDoc } from "./markdownImport.ts";

const all = { marks: true, abbr: true, comments: true, tags: true, citations: true, definitions: true, toc: true, emoji: true } as const;
const ctx: ImportContext = { resolvePage: (target) => target, resolveImage: () => null, extras: all };
const blocks = (md: string, context: ImportContext = ctx) => markdownToDoc(md, context, "").doc.content ?? [];
const inline = (md: string, context: ImportContext = ctx) => blocks(md, context)[0]?.content ?? [];
const roundTrip = (md: string, context: ImportContext = ctx) => docToMarkdown(markdownToDoc(md, context, "").doc, { pageTitle: (id) => id, extras: context.extras }).markdown;
const marked = (text: string, ...types: string[]) => ({ type: "text", text, marks: types.map((type) => ({ type })) });

describe("추가 문법: 마크", () => {
  it("==하이라이트==·^위첨자^·++삽입++·<sub>를 읽는다", () => {
    expect(inline("a ==강조== b")).toEqual([{ type: "text", text: "a " }, marked("강조", "highlight"), { type: "text", text: " b" }]);
    expect(inline("x^2^")).toEqual([{ type: "text", text: "x" }, marked("2", "superscript")]);
    expect(inline("++추가++")).toEqual([marked("추가", "insert")]);
    expect(inline("H<sub>2</sub>O")).toEqual([{ type: "text", text: "H" }, marked("2", "subscript"), { type: "text", text: "O" }]);
    expect(inline("<mark>m</mark><sup>s</sup><ins>i</ins>")).toEqual([marked("m", "highlight"), marked("s", "superscript"), marked("i", "insert")]);
  });

  it("굵게 안의 하이라이트처럼 겹쳐 써도 된다", () => {
    expect(inline("**==둘==**")).toEqual([{ type: "text", text: "둘", marks: [{ type: "bold" }, { type: "highlight" }] }]);
  });

  it("글자색·배경색은 <span style>에서, 올바른 색만", () => {
    expect(inline('<span style="color:#f00">빨강</span>')).toEqual([{ type: "text", text: "빨강", marks: [{ type: "textColor", attrs: { color: "#ff0000" } }] }]);
    expect(inline('<span style="color: blue; background-color: #ffff00">둘</span>')).toEqual([
      { type: "text", text: "둘", marks: [{ type: "textColor", attrs: { color: "#2563eb" } }, { type: "backgroundColor", attrs: { color: "#ffff00" } }] },
    ]);
    // 알 수 없는 스타일은 무시하고 글자만 남는다
    expect(inline('<span style="font-size:99px;color:expression(1)">글</span>')).toEqual([{ type: "text", text: "글" }]);
  });

  it("코드 안의 기호는 건드리지 않는다", () => {
    expect(inline("`==x== ^y^ ++z++`")).toEqual([{ type: "text", text: "==x== ^y^ ++z++", marks: [{ type: "code" }] }]);
  });

  it("켜지 않으면 글자다", () => {
    const off: ImportContext = { resolvePage: () => null, resolveImage: () => null };
    expect(inline("a ==b== c", off)).toEqual([{ type: "text", text: "a ==b== c" }]);
  });

  it("내보내기와 왕복: ==, <sup>, <sub>, <ins>, <span style>", () => {
    const md = "a ==강조== b x<sup>2</sup> H<sub>2</sub>O <ins>추가</ins> <span style=\"color: #ff0000\">빨강</span>\n";
    expect(roundTrip(md)).toBe(md);
  });
});

describe("추가 문법: 약어", () => {
  it("정의 줄은 글에서 빠지고 낱말에 약어 마크가 달린다", () => {
    const content = blocks("HTML 문서와 xHTML\n\n*[HTML]: Hyper Text Markup Language");
    expect(content).toHaveLength(1);
    expect(content[0]!.content).toEqual([
      { type: "text", text: "HTML", marks: [{ type: "abbr", attrs: { title: "Hyper Text Markup Language" } }] },
      { type: "text", text: " 문서와 xHTML" },
    ]);
  });

  it("<abbr title>도 읽고 <abbr>로 내보낸다", () => {
    const md = '<abbr title="Hyper Text">HTML</abbr> 문서\n';
    expect(inline(md)[0]).toEqual({ type: "text", text: "HTML", marks: [{ type: "abbr", attrs: { title: "Hyper Text" } }] });
    expect(roundTrip(md)).toBe(md);
  });
});

describe("추가 문법: 주석·태그·인용·인라인 각주", () => {
  it("%%주석%%은 인라인 노드, 여러 줄이면 자기 문단", () => {
    expect(inline("앞 %%메모%% 뒤")).toEqual([{ type: "text", text: "앞 " }, { type: "comment", attrs: { text: "메모" } }, { type: "text", text: " 뒤" }]);
    expect(blocks("앞\n\n%%\n첫 줄\n둘째 줄\n%%\n\n뒤").map((block) => block.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(blocks("%%\n첫 줄\n둘째 줄\n%%")[0]!.content).toEqual([{ type: "comment", attrs: { text: "첫 줄\n둘째 줄" } }]);
  });

  it("닫히지 않은 %%·빈 주석·코드 안은 글자다", () => {
    expect(inline("a %% b")).toEqual([{ type: "text", text: "a %% b" }]);
    expect(inline("a %%%% b")).toEqual([{ type: "text", text: "a %%%% b" }]);
    expect(inline("`%%x%%`")).toEqual([{ type: "text", text: "%%x%%", marks: [{ type: "code" }] }]);
  });

  it("#태그는 줄 처음이나 공백 뒤에서만, 글자가 있어야 한다", () => {
    expect(inline("#할일 과 #a/b 와 #123 과 url/#x [링크](#앵커)").filter((node) => node.type === "tag").map((node) => `#${node.attrs!.name}`)).toEqual(["#할일", "#a/b"]);
  });

  it("[@citekey] 인용 (여러 키·접두 글), 링크·각주와 구별", () => {
    expect(inline("보라 [@smith2020; @doe2021, p. 3]")[1]).toEqual({ type: "citation", attrs: { source: "@smith2020; @doe2021, p. 3" } });
    expect(inline("[see @doe]")[0]).toEqual({ type: "citation", attrs: { source: "see @doe" } });
    expect(inline("[@a](http://x.com) [메일 a@b.com]").some((node) => node.type === "citation")).toBe(false);
  });

  it("^[인라인 각주]는 각주 노드", () => {
    expect(inline("글^[각주 내용] 계속")).toEqual([{ type: "text", text: "글" }, { type: "footnote", attrs: { text: "각주 내용" } }, { type: "text", text: " 계속" }]);
  });

  it("내보내기와 왕복", () => {
    const md = "앞 %%메모%% #태그 [@smith2020] 뒤\n";
    expect(roundTrip(md)).toBe(md);
    expect(roundTrip("\\#글자 그대로")).toBe("\\#글자 그대로\n");
  });
});

describe("추가 문법: 정의 목록·목차·이모지", () => {
  it("용어 다음 줄의 : 설명", () => {
    const md = "사과\n: 빨간 과일\n: 맛있다\n\n바나나\n: 노란 과일\n";
    const [list] = blocks(md);
    expect(list!.type).toBe("definitionList");
    expect(list!.content!.map((node) => node.type)).toEqual(["definitionTerm", "definitionDetail", "definitionDetail", "definitionTerm", "definitionDetail"]);
    expect(list!.content![0]!.content).toEqual([{ type: "text", text: "사과" }]);
    expect(roundTrip(md)).toBe(md);
  });

  it("보통 문단과 구별하고, 목록·인용 안에서는 정의 목록이 아니다", () => {
    expect(blocks("그냥 문단\n\n: 콜론으로 시작").map((block) => block.type)).toEqual(["paragraph", "paragraph"]);
    expect(blocks("- 항목\n  : 설명")[0]!.type).toBe("bulletList");
  });

  it("[toc]는 목차 블록", () => {
    expect(blocks("[toc]\n\n## 제목").map((block) => block.type)).toEqual(["toc", "heading"]);
    expect(roundTrip("[toc]\n\n## 제목")).toBe("[toc]\n\n## 제목\n");
  });

  it(":smile:은 이모지 글자로 (코드 안과 시간 표기는 그대로)", () => {
    expect(inline("좋아 :smile: 10:30:45 `:smile:`")).toEqual([{ type: "text", text: "좋아 😄 10:30:45 " }, { type: "text", text: ":smile:", marks: [{ type: "code" }] }]);
  });
});

describe("페이지 링크의 제목 위치 (anchors)", () => {
  it("anchors를 켜면 heading 속성으로 보존하고, 끄면 위치를 버리고 안내한다", () => {
    const on = markdownToDoc("[[노트#제목|별칭]]", { ...ctx, extras: undefined, anchors: true }, "");
    expect(on.doc.content![0]!.content![0]).toEqual({ type: "pageLink", attrs: { pageId: "노트", heading: "제목", label: "별칭" } });
    expect(on.notices.size).toBe(0);
    const off = markdownToDoc("[[노트#제목]]", { ...ctx, extras: undefined }, "");
    expect(off.doc.content![0]!.content![0]).toEqual({ type: "pageLink", attrs: { pageId: "노트" } });
    expect(off.notices.size).toBe(1);
  });

  it("![[노트#제목]]은 heading이 있는 페이지 임베드", () => {
    const { doc } = markdownToDoc("![[노트#제목]]", { ...ctx, extras: undefined, anchors: true }, "");
    expect(doc.content![0]).toEqual({ type: "pageBlock", attrs: { pageId: "노트", mode: "embed", heading: "제목" } });
  });
});
