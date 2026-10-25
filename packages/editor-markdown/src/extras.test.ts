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

describe("같은 글 안의 위치와 블록 임베드", () => {
  const base = { ...ctx, extras: undefined, anchors: true };
  it("[[#제목]]은 selfPage로 풀고, selfPage가 없으면 글자로 남는다", () => {
    const on = markdownToDoc("[[#제목]] [[#^abcdefghij]]", { ...base, selfPage: "나" }, "");
    expect(on.doc.content![0]!.content!.filter((n) => n.type === "pageLink").map((n) => n.attrs)).toEqual([{ pageId: "나", heading: "제목" }, { pageId: "나", blockId: "abcdefghij" }]);
    const off = markdownToDoc("[[#제목]]", base, "");
    expect(off.doc.content![0]!.content![0]!.type).toBe("text");
  });

  it("![[노트#^블록]]은 blockId가 있는 임베드이고, blockIds를 켜면 같은 글로 내보낸다", () => {
    const { doc } = markdownToDoc("![[노트#^abcdefghij]]", base, "");
    expect(doc.content![0]).toEqual({ type: "pageBlock", attrs: { pageId: "노트", mode: "embed", blockId: "abcdefghij" } });
    const out = docToMarkdown(doc, { pageTitle: (id) => id, blockIds: true });
    expect(out.markdown).toBe("![[노트#^abcdefghij]]\n");
  });
});

describe("추가 문법 옵션", () => {
  it("tags.skipHexColors: 16진 색 모양은 글자로 두고, 다른 태그는 그대로 태그", () => {
    const skip: ImportContext = { ...ctx, extras: { ...all, tags: { skipHexColors: true } } };
    expect(inline("#fff #bad? #ff00aa #할일", skip).filter((node) => node.type === "tag").map((node) => node.attrs!.name)).toEqual(["할일"]);
    // 내보낼 때도 같은 규칙: 16진 모양은 이스케이프하지 않고, 진짜 태그 모양 글자는 이스케이프한다.
    expect(docToMarkdown({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "#fff 와 #할일" }] }] }, { pageTitle: () => null, extras: skip.extras }).markdown).toBe("#fff 와 \\#할일\n");
    expect(roundTrip("색 #fff 와 #할일\n", skip)).toBe("색 #fff 와 #할일\n");
  });

  const abbrDoc = (...parts: Array<[string, string | null]>) => ({
    type: "doc",
    content: [{ type: "paragraph", content: parts.map(([text, title]) => (title === null ? { type: "text", text } : { type: "text", text, marks: [{ type: "abbr", attrs: { title } }] })) }],
  });
  const definitions = (doc: object) => docToMarkdown(doc as never, { pageTitle: () => null, extras: all, abbrStyle: "definitions" }).markdown;

  it("abbrStyle definitions: 글은 그대로 두고 문서 끝에 정의를 모으며, 다시 읽으면 같다", () => {
    const doc = abbrDoc(["HTML", "Hyper Text"], [" 과 ", null], ["CSS", "Cascading"], [" 그리고 ", null], ["HTML", "Hyper Text"]);
    const md = definitions(doc);
    expect(md).toBe("HTML 과 CSS 그리고 HTML\n\n*[HTML]: Hyper Text\n*[CSS]: Cascading\n");
    expect(JSON.stringify(markdownToDoc(md, ctx, "").doc.content![0]!.content!.filter((node) => node.marks).length)).toBe("3");
  });

  it("abbrStyle definitions: 정의가 다른 낱말·마크 없는 같은 낱말이 있으면 <abbr>로 내보낸다", () => {
    expect(definitions(abbrDoc(["HTML", "하나"], [" ", null], ["HTML", "둘"]))).toContain('<abbr title="하나">HTML</abbr>');
    const mixed = definitions(abbrDoc(["HTML", "Hyper Text"], [" 그리고 HTML 일반", null]));
    expect(mixed).toContain("<abbr");
    expect(mixed).not.toContain("*[HTML]");
  });

  it("정의 목록의 설명은 줄바꿈이 있어도 되고, 한 줄 설명과 똑같이 왕복한다", () => {
    const md = "용어\n: 첫 줄\n    둘째 줄\n: 다른 설명\n";
    const [list] = blocks(md);
    expect(list!.content![1]!.content).toEqual([{ type: "text", text: "첫 줄" }, { type: "hardBreak" }, { type: "text", text: "둘째 줄" }]);
    expect(roundTrip(md)).toBe(md);
  });
});

describe("코드 블록 메타", () => {
  const roundTripMd = (md: string) => docToMarkdown(markdownToDoc(md, { ...ctx, extras: undefined }, "").doc, { pageTitle: () => null }).markdown;

  it("언어 뒤 글을 meta로 보존하고 같은 글로 내보낸다", () => {
    const md = '```ts title="a.ts" {2,4}\nconst a = 1;\n```\n';
    const { doc } = markdownToDoc(md, { ...ctx, extras: undefined }, "");
    expect(doc.content![0]!.attrs).toEqual({ language: "ts", meta: 'title="a.ts" {2,4}' });
    expect(roundTripMd(md)).toBe(md);
  });

  it("언어 없이 메타만 있는 펜스", () => {
    const { doc } = markdownToDoc("```{2}\nx\n```\n", { ...ctx, extras: undefined }, "");
    expect(doc.content![0]!.attrs).toEqual({ meta: "{2}" });
    expect(roundTripMd("```{2}\nx\n```\n")).toBe("```{2}\nx\n```\n");
  });

  it("메타가 없으면 속성을 만들지 않는다", () => {
    expect(markdownToDoc("```ts\nx\n```\n", { ...ctx, extras: undefined }, "").doc.content![0]!.attrs).toEqual({ language: "ts" });
  });
});

describe("이미지 캡션", () => {
  const withImage = { ...ctx, extras: undefined, resolveImage: (p: string) => p };

  it('![alt](src "캡션")의 title을 caption으로 보존하고 같은 글로 내보낸다', () => {
    const { doc } = markdownToDoc('![그림](a.png "첫 번째 그림")\n', withImage, "");
    expect(doc.content![0]).toEqual({ type: "image", attrs: { importPath: "a.png", alt: "그림", caption: "첫 번째 그림" } });
  });

  it("title이 없으면 속성을 만들지 않는다", () => {
    expect(markdownToDoc("![그림](a.png)\n", withImage, "").doc.content![0]!.attrs).toEqual({ importPath: "a.png", alt: "그림" });
  });

  it("내보낼 때 큰따옴표를 이스케이프한다", () => {
    const hash = "a".repeat(64);
    const out = docToMarkdown({ type: "doc", content: [{ type: "image", attrs: { hash, mime: "image/png", alt: "x", caption: '그는 "안녕"' } }] }, { pageTitle: () => null, assetPath: () => "a.png" });
    expect(out.markdown).toBe('![x](a.png "그는 \\"안녕\\"")\n');
  });
});

describe("키보드 키 <kbd>", () => {
  const withKbd = { ...ctx, extras: { kbd: true } };
  it("kbd를 켜면 마크로 읽고 같은 태그로 내보낸다", () => {
    const { doc } = markdownToDoc("누르기 <kbd>Ctrl</kbd>+<kbd>C</kbd>\n", withKbd, "");
    const nodes = doc.content![0]!.content!;
    expect(nodes.filter((n) => n.marks?.some((m) => m.type === "kbd")).map((n) => n.text)).toEqual(["Ctrl", "C"]);
    expect(docToMarkdown(doc, { pageTitle: () => null, extras: withKbd.extras }).markdown).toBe("누르기 <kbd>Ctrl</kbd>+<kbd>C</kbd>\n");
  });

  it("꺼져 있으면 읽지 않는다", () => {
    const { doc } = markdownToDoc("<kbd>Ctrl</kbd>\n", { ...ctx, extras: undefined }, "");
    expect(JSON.stringify(doc)).not.toContain('"kbd"');
  });
});

describe("할 일 상태", () => {
  const withStatus = { ...ctx, extras: { taskStatus: true } };
  const md = "- [ ] 일반\n- [x] 끝\n- [/] 진행 중 *강조*\n- [-] 취소\n- [>] 미룸\n- [?] 질문\n- [!] 중요\n";

  it("[/] [-] [>] [?] [!]를 status로 읽고 같은 글로 내보낸다", () => {
    const { doc } = markdownToDoc(md, withStatus, "");
    const items = doc.content![0]!.content!;
    expect(items.map((i) => [i.attrs!.checked, i.attrs!.status ?? null])).toEqual([[false, null], [true, null], [false, "/"], [false, "-"], [false, ">"], [false, "?"], [false, "!"]]);
    // 표시를 떼고 남은 글에 서식이 살아 있다.
    expect(items[2]!.content![0]!.content).toEqual([{ type: "text", text: "진행 중 " }, { type: "text", text: "강조", marks: [{ type: "italic" }] }]);
    expect(docToMarkdown(doc, { pageTitle: () => null, extras: withStatus.extras }).markdown).toBe(md);
  });

  it("꺼져 있으면 일반 목록의 글자로 남는다", () => {
    const { doc } = markdownToDoc("- [/] 진행 중\n", { ...ctx, extras: undefined }, "");
    expect(doc.content![0]!.type).toBe("bulletList");
  });

  it("상태 문법을 끈 채 내보내면 상태 없는 항목", () => {
    const { doc } = markdownToDoc("- [/] 진행 중\n", withStatus, "");
    expect(docToMarkdown(doc, { pageTitle: () => null }).markdown).toBe("- [ ] 진행 중\n");
  });
});

describe("서술형 인용과 참고문헌", () => {
  const cite = { ...ctx, extras: { citations: { narrative: true, bibliography: true } } };
  const roundtrip = (md: string) => docToMarkdown(markdownToDoc(md, cite, "").doc, { pageTitle: () => null, extras: cite.extras }).markdown;

  it("@키를 서술형 인용으로 읽고 같은 글로 내보낸다", () => {
    const { doc } = markdownToDoc("보면 @smith2020 는 말한다. 또 (@lee19).\n", cite, "");
    const cites = doc.content![0]!.content!.filter((n) => n.type === "citation");
    expect(cites.map((n) => n.attrs)).toEqual([{ source: "@smith2020", narrative: true }, { source: "@lee19", narrative: true }]);
    expect(roundtrip("보면 @smith2020 는 말한다. 또 (@lee19).\n")).toBe("보면 @smith2020 는 말한다. 또 (@lee19).\n");
  });

  it("끝의 구두점은 키가 아니다", () => {
    const { doc } = markdownToDoc("@smith2020.\n", cite, "");
    expect(doc.content![0]!.content!.map((n) => n.type === "citation" ? n.attrs!.source : n.text)).toEqual(["@smith2020", "."]);
  });

  it("이메일·글자 속 @는 인용이 아니고, 글자 @키는 이스케이프해 왕복한다", () => {
    expect(JSON.stringify(markdownToDoc("a@b.com\n", cite, "").doc)).not.toContain("citation");
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "메일 @someone 에게" }] }] };
    const md = docToMarkdown(doc, { pageTitle: () => null, extras: cite.extras }).markdown;
    expect(md).toBe("메일 \\@someone 에게\n");
    expect(JSON.stringify(markdownToDoc(md, cite, "").doc)).not.toContain("citation");
  });

  it("괄호형 [@키]는 그대로 괄호형이다", () => {
    expect(markdownToDoc("[@a1; @b2]\n", cite, "").doc.content![0]!.content![0]!.attrs).toEqual({ source: "@a1; @b2" });
    expect(roundtrip("[@a1; @b2]\n")).toBe("[@a1; @b2]\n");
  });

  it("narrative를 끄면 @키는 글자", () => {
    expect(JSON.stringify(markdownToDoc("@smith2020\n", { ...ctx, extras: { citations: true } }, "").doc)).not.toContain("citation");
  });

  it("[bibliography] 줄은 참고문헌 블록이고, 켜지 않으면 글자", () => {
    expect(markdownToDoc("글\n\n[bibliography]\n", cite, "").doc.content!.map((n) => n.type)).toEqual(["paragraph", "bibliography"]);
    expect(roundtrip("글\n\n[bibliography]\n")).toBe("글\n\n[bibliography]\n");
    expect(markdownToDoc("[bibliography]\n", { ...ctx, extras: { citations: true } }, "").doc.content![0]!.type).toBe("paragraph");
  });
});
