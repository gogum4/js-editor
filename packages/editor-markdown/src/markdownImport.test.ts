import { describe, expect, it } from "vitest";

import { blockIdFromForeign } from "@gogum4/editor-schema/blockId";
import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { docToMarkdown } from "./markdown.ts";
import { finalizeImages, type ImportContext, markdownToDoc, NOTICE, parseFrontmatter } from "./markdownImport.ts";

const PAGES: Record<string, string> = { 프로젝트: "p-project", 회의록: "p-meeting", "폴더/깊은 글": "p-deep" };
const IMAGES = new Set(["assets/a.png", "그림/b.jpg", "docs/c.png"]);

const ctx: ImportContext = {
  resolvePage: (target) => PAGES[target.trim()] ?? null,
  resolveImage: (path) => (IMAGES.has(path) ? path : (IMAGES.has(`assets/${path}`) ? `assets/${path}` : null)),
};
const parse = (md: string, dir = "") => markdownToDoc(md, ctx, dir);
const blocks = (md: string) => parse(md).doc.content ?? [];
const text = (t: string, ...marks: string[]): PmNode => ({ type: "text", text: t, ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}) });
const para = (...content: PmNode[]): PmNode => ({ type: "paragraph", content });

describe("parseFrontmatter", () => {
  it("이 앱이 쓰는 모양(따옴표 문자열, 한 줄 목록)을 읽는다", () => {
    const { data, body } = parseFrontmatter(
      '---\ntitle: "훅: 정리"\ncreated: 2026-01-02T03:04:05.000Z\naliases: ["hooks", "react hooks, 정리"]\nsummary: "한 줄 요약"\n---\n\n본문',
    );
    expect(data).toEqual({ title: "훅: 정리", created: "2026-01-02T03:04:05.000Z", aliases: ["hooks", "react hooks, 정리"], summary: "한 줄 요약" });
    expect(body).toBe("\n본문");
  });

  it("Obsidian 모양(들여쓴 목록, 따옴표 없는 글, 작은따옴표)을 읽는다", () => {
    const { data } = parseFrontmatter("---\naliases:\n  - 하나\n  - 둘\ntags:\n- a\n- b\nstatus: draft\nname: 'it''s'\n---\n본문");
    expect(data).toEqual({ aliases: ["하나", "둘"], tags: ["a", "b"], status: "draft", name: "it's" });
  });

  it("frontmatter가 없거나 닫히지 않으면 본문 전체를 돌려준다", () => {
    expect(parseFrontmatter("그냥 글\n---\n선")).toEqual({ data: {}, body: "그냥 글\n---\n선" });
    expect(parseFrontmatter("---\ntitle: x\n본문").data).toEqual({});
  });

  it("빈 frontmatter와 윈도우 줄바꿈도 읽는다", () => {
    expect(parseFrontmatter("---\n---\n본문")).toEqual({ data: {}, body: "본문" });
    expect(parseFrontmatter("---\r\ntitle: a\r\n---\r\n본문\r\n").data).toEqual({ title: "a" });
  });
});

describe("블록", () => {
  it("문단과 제목", () => {
    expect(blocks("# 큰 제목\n\n본문 하나\n\n## 작은 제목")).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [text("큰 제목")] },
      para(text("본문 하나")),
      { type: "heading", attrs: { level: 2 }, content: [text("작은 제목")] },
    ]);
  });

  it("굵게·기울임·취소선·인라인 코드·링크 서식과 이스케이프", () => {
    const [p] = blocks("a **b** *c* ~~d~~ `e` \\*f\\* [g](https://x.io)");
    expect(p).toEqual(
      para(
        text("a "),
        text("b", "bold"),
        text(" "),
        text("c", "italic"),
        text(" "),
        text("d", "strike"),
        text(" "),
        text("e", "code"),
        text(" *f* "),
        { type: "text", text: "g", marks: [{ type: "link", attrs: { href: "https://x.io" } }] },
      ),
    );
  });

  it("<u>는 밑줄, <br>·줄 끝 \\ 는 줄바꿈, 문단 안의 줄바꿈도 줄바꿈으로 둔다", () => {
    expect(blocks("<u>밑줄</u> 끝")[0]).toEqual(para(text("밑줄", "underline"), text(" 끝")));
    expect(blocks("가<br>나")[0]).toEqual(para(text("가"), { type: "hardBreak" }, text("나")));
    expect(blocks("가\\\n나")[0]).toEqual(para(text("가"), { type: "hardBreak" }, text("나")));
    expect(blocks("가\n나")[0]).toEqual(para(text("가"), { type: "hardBreak" }, text("나")));
  });

  it("HTML 엔티티를 글자로 풀어 쓴다", () => {
    expect(blocks("a &amp; b &lt;c&gt;")[0]).toEqual(para(text("a & b <c>")));
  });

  it("목록(순서·중첩)과 할 일", () => {
    const [bullet, ordered, tasks] = blocks("- 하나\n  - 안쪽\n- 둘\n\n3. 셋\n4. 넷\n\n- [ ] 할 일\n- [x] 끝낸 일");
    expect(bullet).toEqual({
      type: "bulletList",
      content: [
        { type: "listItem", content: [para(text("하나")), { type: "bulletList", content: [{ type: "listItem", content: [para(text("안쪽"))] }] }] },
        { type: "listItem", content: [para(text("둘"))] },
      ],
    });
    expect(ordered).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
    expect(tasks).toEqual({
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { checked: false }, content: [para(text("할 일"))] },
        { type: "taskItem", attrs: { checked: true }, content: [para(text("끝낸 일"))] },
      ],
    });
  });

  it("인용과 콜아웃(종류 이름·제목 줄)", () => {
    expect(blocks("> 인용\n> 둘째 줄")[0]).toMatchObject({ type: "blockquote" });
    expect(blocks("> [!WARNING]\n> 조심")[0]).toEqual({ type: "callout", attrs: { type: "warning" }, content: [para(text("조심"))] });
    // Obsidian의 다른 종류 이름은 가까운 종류로, 제목 줄은 굵은 문단으로.
    const info = blocks("> [!info] 알아 두기\n> 내용")[0]!;
    expect(info).toEqual({ type: "callout", attrs: { type: "note" }, content: [para(text("알아 두기", "bold")), para(text("내용"))] });
    expect(blocks("> [!tip]")[0]).toEqual({ type: "callout", attrs: { type: "tip" }, content: [{ type: "paragraph" }] });
  });

  it("코드 블록(언어)과 구분선", () => {
    expect(blocks("```ts\nconst a = 1;\n```\n\n---")).toEqual([
      { type: "codeBlock", attrs: { language: "ts" }, content: [text("const a = 1;")] },
      { type: "horizontalRule" },
    ]);
    expect(blocks("```\n$a_b$ [[프로젝트]]\n```")[0]).toEqual({ type: "codeBlock", content: [text("$a_b$ [[프로젝트]]")] });
  });

  it("표(머리글 줄, 셀 안의 <br>)", () => {
    const [table] = blocks("| 이름 | 값 |\n|---|---|\n| a | b<br>c |");
    expect(table).toEqual({
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", content: [para(text("이름"))] }, { type: "tableHeader", content: [para(text("값"))] }] },
        { type: "tableRow", content: [{ type: "tableCell", content: [para(text("a"))] }, { type: "tableCell", content: [para(text("b"), { type: "hardBreak" }, text("c"))] }] },
      ],
    });
  });

  it("<div align>은 안쪽 문단·제목·이미지에 정렬 속성을 달고, left·알 수 없는 값은 달지 않는다", () => {
    const out = blocks('<div align="center">\n\n## 제목\n\n본문\n\n</div>\n\n<div align="left">\n\n왼쪽\n\n</div>');
    expect(out[0]).toMatchObject({ type: "heading", attrs: { level: 2, textAlign: "center" } });
    expect(out[1]).toEqual({ type: "paragraph", attrs: { textAlign: "center" }, content: [text("본문")] });
    expect(out[2]).toEqual(para(text("왼쪽")));
  });

  it("<details><summary>는 토글이 된다(제목은 Markdown, 본문은 블록)", () => {
    const [toggle] = blocks("<details>\n<summary>**열기**</summary>\n\n안쪽 글\n\n- 목록\n\n</details>");
    expect(toggle).toMatchObject({ type: "toggle" });
    expect(toggle!.content![0]).toEqual(para(text("열기", "bold")));
    expect(toggle!.content![1]).toEqual(para(text("안쪽 글")));
    expect(toggle!.content![2]).toMatchObject({ type: "bulletList" });
    // 본문이 없는 토글
    expect(blocks("<details>\n<summary>빈 토글</summary>\n</details>")[0]).toEqual({ type: "toggle", content: [para(text("빈 토글"))] });
  });

  it("지원하지 않는 HTML은 글자만 남기고 안내한다", () => {
    const r = parse('<center>가운데</center>\n\n<!-- 주석 -->\n\n끝');
    expect(r.doc.content).toEqual([para(text("가운데")), para(text("끝"))]);
    expect(r.notices.get(NOTICE.unsupportedHtml)).toBe(1);
  });

  it("빈 글은 빈 문단 하나가 든 문서", () => {
    expect(parse("").doc).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("링크·수식·각주", () => {
  it("[[위키 링크]]는 페이지 링크, [[이름|표시]]·[[이름#제목]]은 그 페이지로, [[이름#^블록]]은 블록 링크로", () => {
    const r = parse("보라 [[프로젝트]] 와 [[회의록|회의]] 와 [[폴더/깊은 글#^abc0123456]] 와 [[프로젝트#소개]]");
    expect(r.doc.content![0]).toEqual(
      para(
        text("보라 "),
        { type: "pageLink", attrs: { pageId: "p-project" } },
        text(" 와 "),
        { type: "pageLink", attrs: { pageId: "p-meeting", label: "회의" } },
        text(" 와 "),
        { type: "pageLink", attrs: { pageId: "p-deep", blockId: "abc0123456" } },
        text(" 와 "),
        { type: "pageLink", attrs: { pageId: "p-project" } },
      ),
    );
    // 제목 위치 링크만 위치를 잃는다(블록 링크는 잃지 않는다).
    expect(r.notices.get(NOTICE.anchorLink)).toBe(1);
  });

  it("찾지 못한 위키 링크는 글자로 두고 안내한다", () => {
    const r = parse("[[없는 글]] 와 [[없는 글2]]");
    expect(r.doc.content![0]).toEqual(para(text("[[없는 글]]"), text(" 와 "), text("[[없는 글2]]")).content ? { type: "paragraph", content: [text("[[없는 글]] 와 [[없는 글2]]")] } : null);
    expect(r.notices.get(NOTICE.unresolvedLink)).toBe(2);
  });

  it("위키 링크 안의 _ 와 * 가 서식으로 읽히지 않는다", () => {
    const r = parse("[[snake_case_name]] 와 **굵게**");
    expect(r.doc.content![0]).toEqual(para(text("[[snake_case_name]] 와 "), text("굵게", "bold")));
  });

  it("[글](다른글.md)는 가져온 페이지를 가리키면 페이지 링크, 아니면 글자만", () => {
    expect(blocks("[보기](프로젝트.md#h) 끝")[0]).toEqual(para({ type: "pageLink", attrs: { pageId: "p-project" } }, text(" 끝")));
    const r = parse("[보기](없음.md)");
    expect(r.doc.content![0]).toEqual(para(text("보기")));
    expect(r.notices.get(NOTICE.relativeLink)).toBe(1);
  });

  it("![[페이지]]는 페이지 임베드, ![[이미지.png|너비]]는 이미지", () => {
    const [embed, image] = blocks("![[회의록]]\n\n![[a.png|200]]");
    expect(embed).toEqual({ type: "pageBlock", attrs: { pageId: "p-meeting", mode: "embed" } });
    expect(image).toEqual({ type: "image", attrs: { importPath: "assets/a.png", alt: "", width: 200 } });
    expect(blocks("![[없는]]")[0]).toEqual(para(text("![[없는]]")));
  });

  it("인라인 수식은 LaTeX를 그대로(_·* 포함) 두고, 돈 액수는 수식이 아니다", () => {
    expect(blocks("식 $a_b + c_d * e$ 끝")[0]).toEqual(para(text("식 "), { type: "mathInline", attrs: { latex: "a_b + c_d * e" } }, text(" 끝")));
    expect(blocks("$5 와 $6")[0]).toEqual(para(text("$5 와 $6")));
    expect(blocks("`$a_b$`")[0]).toEqual(para(text("$a_b$", "code")));
  });

  it("블록 수식($$ … $$ 한 줄·여러 줄)", () => {
    expect(blocks("$$x_1 + x_2$$")[0]).toEqual({ type: "mathBlock", attrs: { latex: "x_1 + x_2" } });
    expect(blocks("앞\n\n$$\n\\frac{a}{b}\n= c_d\n$$\n\n뒤")).toEqual([para(text("앞")), { type: "mathBlock", attrs: { latex: "\\frac{a}{b}\n= c_d" } }, para(text("뒤"))]);
    // 닫히지 않은 $$는 글자
    expect(blocks("$$ 열리기만")[0]).toMatchObject({ type: "paragraph" });
  });

  it("각주 참조는 노드로, 정의는 문서 끝에서 떼어 내용을 채운다(이어지는 줄 포함)", () => {
    const r = parse("본문[^1] 그리고[^note]\n\n[^1]: 첫 각주\n[^note]: 둘째\n    이어지는 줄");
    expect(r.doc.content).toEqual([para(text("본문"), { type: "footnote", attrs: { text: "첫 각주" } }, text(" 그리고"), { type: "footnote", attrs: { text: "둘째\n이어지는 줄" } })]);
    // 정의가 없는 참조는 글자
    expect(blocks("끝[^없음]")[0]).toEqual(para(text("끝[^없음]")));
  });
});

describe("이미지", () => {
  it("![설명|너비](경로)는 이미지 노드(폴더 기준 해석), 이미지 목록에 담긴다", () => {
    const r = parse("![그림|300](assets/a.png)\n\n앞 ![x](그림/b.jpg) 뒤");
    expect(r.doc.content).toEqual([
      { type: "image", attrs: { importPath: "assets/a.png", alt: "그림", width: 300 } },
      para(text("앞 ")),
      { type: "image", attrs: { importPath: "그림/b.jpg", alt: "x" } },
      para(text(" 뒤")),
    ]);
    expect(r.images.sort()).toEqual(["assets/a.png", "그림/b.jpg"]);
  });

  it("인터넷 주소는 링크로, 폴더에 없는 이미지는 글자로 두고 안내한다", () => {
    const r = parse("![로고](https://x.io/a.png)\n\n![없음](없는.png)");
    expect(r.doc.content![0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "로고", marks: [{ type: "link", attrs: { href: "https://x.io/a.png" } }] }] });
    expect(r.doc.content![1]).toEqual(para(text("![없음](없는.png)")));
    expect(r.notices.get(NOTICE.remoteImage)).toBe(1);
    expect(r.notices.get(NOTICE.missingImage)).toBe(1);
    expect(r.images).toEqual([]);
  });

  it("finalizeImages: 저장된 이미지는 해시·형식을 채우고, 못 저장한 것은 글자 문단으로", () => {
    const { doc } = parse("![a](assets/a.png)\n\n![b|120](그림/b.jpg)");
    const { doc: done, missing } = finalizeImages(doc, new Map([["assets/a.png", { hash: "h".repeat(64), mime: "image/png" }], ["그림/b.jpg", null]]));
    expect(done.content![0]).toEqual({ type: "image", attrs: { alt: "a", hash: "h".repeat(64), mime: "image/png" } });
    expect(done.content![1]).toEqual(para(text("![b](그림/b.jpg)")));
    expect(missing).toBe(1);
  });
});

describe("이 앱이 내보낸 Markdown을 다시 읽는다(왕복)", () => {
  const titles: Record<string, string> = { "p-project": "프로젝트", "p-meeting": "회의록" };
  const roundTrip = (doc: PmNode): PmNode => {
    const exported = docToMarkdown(doc, { pageTitle: (id) => titles[id] ?? null, assetPath: (hash, mime) => `assets/${hash.slice(0, 1)}.${mime.split("/")[1]}` });
    return markdownToDoc(exported.markdown, { resolvePage: (t) => PAGES[t] ?? null, resolveImage: (p) => (p === "assets/a.png" ? p : null) }, "").doc;
  };
  const strip = (node: PmNode): PmNode => JSON.parse(JSON.stringify(node, (k, v) => (k === "id" || (k === "textAlign" && v === null) ? undefined : v)));
  const p = (...c: PmNode[]): PmNode => ({ type: "paragraph", content: c });

  it("서식·링크·수식·목록·콜아웃·코드·표·토글이 같은 내용으로 돌아온다", () => {
    const original: PmNode = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("제목")] },
        p(text("가 "), text("굵게", "bold"), text(" "), text("기울임", "italic"), { type: "pageLink", attrs: { pageId: "p-project" } }, { type: "mathInline", attrs: { latex: "a_b" } }),
        { type: "bulletList", content: [{ type: "listItem", content: [p(text("하나"))] }, { type: "listItem", content: [p(text("둘"))] }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(text("끝"))] }] },
        { type: "callout", attrs: { type: "tip" }, content: [p(text("팁 내용"))] },
        { type: "codeBlock", attrs: { language: "ts" }, content: [text("const a = 1;")] },
        { type: "mathBlock", attrs: { latex: "x_1+x_2" } },
        { type: "horizontalRule" },
        { type: "toggle", content: [p(text("토글 제목")), p(text("안쪽"))] },
        { type: "pageBlock", attrs: { pageId: "p-meeting", mode: "embed" } },
      ],
    };
    expect(strip(roundTrip(original))).toEqual(strip(original));
  });

  it("정렬과 이미지 크기도 돌아온다", () => {
    const original: PmNode = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "center" }, content: [text("가운데")] },
        { type: "heading", attrs: { level: 1, textAlign: "right" }, content: [text("오른쪽 제목")] },
        { type: "image", attrs: { hash: "a".repeat(64), mime: "image/png", alt: "그림", width: 320, textAlign: "center" } },
      ],
    };
    const back = roundTrip(original).content!;
    expect(back[0]).toMatchObject({ type: "paragraph", attrs: { textAlign: "center" } });
    expect(back[1]).toMatchObject({ type: "heading", attrs: { level: 1, textAlign: "right" } });
    expect(back[2]).toEqual({ type: "image", attrs: { importPath: "assets/a.png", alt: "그림", width: 320, textAlign: "center" } });
  });
});

describe("원격 이미지 (읽기 전용 렌더링용 옵션)", () => {
  const remote: ImportContext = { ...ctx, remoteImages: true };
  const md = "![로고|120](https://example.com/a.png)";

  it("기본은 링크로 두고 안내한다 (노트 앱의 가져오기)", () => {
    const r = markdownToDoc("![로고](https://example.com/a.png)", ctx, "");
    expect(r.doc.content![0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "로고", marks: [{ type: "link", attrs: { href: "https://example.com/a.png" } }] }] });
    expect(r.notices.get(NOTICE.remoteImage)).toBe(1);
  });

  it("remoteImages를 켜면 이미지 노드가 된다 (저장소에 넣을 이미지 목록에는 들지 않는다)", () => {
    const r = markdownToDoc(md, remote, "");
    expect(r.doc.content![0]).toEqual({ type: "image", attrs: { importPath: "https://example.com/a.png", alt: "로고", remote: true, width: 120 } });
    expect(r.images).toEqual([]);
    expect(r.notices.get(NOTICE.remoteImage)).toBeUndefined();
  });

  it("javascript: 같은 http(s)가 아닌 주소는 켜도 이미지가 되지 않는다", () => {
    const r = markdownToDoc("![x](javascript:alert(1))", remote, "");
    expect(JSON.stringify(r.doc)).not.toContain('"type":"image"');
  });
});

describe("블록 id (`^id`)", () => {
  const first = (md: string) => blocks(md)[0]!;

  it("문단·제목의 줄 끝 ^id는 글자에서 빠지고 블록 id가 된다", () => {
    expect(first("문단 글 ^abc0123456")).toEqual({ type: "paragraph", attrs: { id: "abc0123456" }, content: [text("문단 글")] });
    expect(first("## 제목 ^head000001")).toMatchObject({ type: "heading", attrs: { level: 2, id: "head000001" }, content: [text("제목")] });
    expect(first("여러 줄\n문단 ^abc0123456").content).toEqual([text("여러 줄"), { type: "hardBreak" }, text("문단")]);
  });

  it("자기 줄에 홀로 있는 ^id는 바로 앞 블록(코드·수식·표)의 id다", () => {
    const md = ["```js", "x", "```", "", "^code000001", "", "| a |", "|---|", "| 1 |", "", "^tabl000001", "", "$$", "y", "$$", "", "^math000001"].join("\n");
    const b = blocks(md);
    expect(b.map((n) => [n.type, n.attrs?.id])).toEqual([
      ["codeBlock", "code000001"],
      ["table", "tabl000001"],
      ["mathBlock", "math000001"],
    ]);
  });

  it("목록 항목·인용·콜아웃 안 문단의 ^id도 읽는다", () => {
    const list = first("- 항목 ^item000001");
    expect(list.content![0]!.content![0]).toMatchObject({ type: "paragraph", attrs: { id: "item000001" } });
    expect(first("> 인용 ^quot000001").content![0]).toMatchObject({ type: "paragraph", attrs: { id: "quot000001" } });
    expect(first("> [!NOTE]\n> 콜아웃 ^call000001").content![0]).toMatchObject({ type: "paragraph", attrs: { id: "call000001" } });
  });

  it("우리 모양이 아닌 id(Obsidian의 ^my-id)는 글자에서 정해지는 id가 되고, 링크도 같은 id를 가리킨다", () => {
    const id = blockIdFromForeign("my-quote");
    expect(first("글 ^my-quote").attrs?.id).toBe(id);
    expect(first("[[프로젝트#^my-quote]]").content![0]).toEqual({ type: "pageLink", attrs: { pageId: "p-project", blockId: id } });
  });

  it("지수 표기(x ^2)나 숫자뿐인 ^123은 id가 아니다", () => {
    expect(first("x ^2")).toEqual(para(text("x ^2")));
    expect(first("값 ^123")).toEqual(para(text("값 ^123")));
  });

  it("코드 안의 ^id는 그대로 둔다", () => {
    expect(blocks("```\n코드 ^abc0123456\n```")[0]).toMatchObject({ type: "codeBlock", content: [text("코드 ^abc0123456")] });
    expect(first("`코드 ^abc0123456`").content![0]).toMatchObject({ text: "코드 ^abc0123456", marks: [{ type: "code" }] });
  });

  it("id를 가질 수 없는 블록 뒤의 홀로 있는 ^id는 무시한다 (글자를 잃지 않는다)", () => {
    expect(blocks("^abc0123456")).toEqual([{ type: "paragraph" }]);
  });
});
