import { describe, expect, it } from "vitest";

import { docToMarkdown } from "./markdown.ts";
import { markdownToDoc, type ImportContext } from "./markdownImport.ts";

/** PlanBench처럼 위키 링크의 대상을 글자 그대로 `pageId`로 쓰는 소비자(해석은 나중에 인덱스로 한다). */
const ctx: ImportContext = { resolvePage: (target) => target, resolveImage: () => null, dialect: "gfm" };
const out = { pageTitle: (id: string) => id, dialect: "gfm" as const };

const parse = (md: string) => markdownToDoc(md, ctx, "").doc;
const roundTrip = (md: string) => docToMarkdown(parse(md), out).markdown;
const kinds = (md: string) => JSON.stringify(parse(md));

describe("gfm 방언", () => {
  it("위키 링크는 대상 글자를 pageId로, 표시 글자는 label로 보존하고 그대로 돌려준다", () => {
    const source = "[[강화 시스템]]과 [[폴더/문서|표시 글자]]와 [[table:Item]]와 [[a|b|c]]\n";
    const doc = parse(source);
    const links = doc.content![0]!.content!.filter((n) => n.type === "pageLink").map((n) => n.attrs);
    expect(links).toEqual([{ pageId: "강화 시스템" }, { pageId: "폴더/문서", label: "표시 글자" }, { pageId: "table:Item" }, { pageId: "a", label: "b|c" }]);
    expect(roundTrip(source)).toBe(source);
  });

  it("`#위치`·`^id`·`![[임베드]]`는 이 방언에 없어서 글자다 (대상의 `#`은 이름의 일부)", () => {
    const doc = parse("[[문서#제목]] 와 ![[이미지]] ^abc\n");
    const json = JSON.stringify(doc);
    expect(json).toContain('"pageId":"문서#제목"');
    expect(json).toContain("![");
    expect(json).toContain("^abc");
    expect(json).not.toContain("blockId");
  });

  it("콜아웃·수식·각주는 읽지 않는다: 글자(인용)로 남는다", () => {
    const source = "> [!NOTE]\n> 인용\n\n$x_1 + y_2$ 와 $$z$$ 와 [^1]\n\n[^1]: 각주처럼 보임\n";
    const json = kinds(source);
    for (const word of ["callout", "mathInline", "mathBlock", '"footnote"']) expect(json, word).not.toContain(word);
    // 글자는 그대로 보인다(`_`·`[` 앞의 `\\`는 렌더 결과가 같은 이스케이프 정규화).
    const again = roundTrip(source);
    expect(again).toContain("$x\\_1 + y\\_2$");
    expect(again).toContain("$$z$$");
  });

  it("줄바꿈 한 개는 눈에 보이는 줄바꿈(hardBreak)이고 백슬래시 없이 돌아온다", () => {
    const source = "첫 줄\n둘째 줄\n셋째 줄\n";
    expect(JSON.stringify(parse(source))).toContain("hardBreak");
    expect(roundTrip(source)).toBe(source);
  });

  it("HTML·이미지·열 정렬 표는 원문으로 보존한다 (PlanBench는 HTML을 글자로 보인다)", () => {
    const source = "<div>글자로 보임</div>\n\n![로고](https://example.com/a.png) 와 <br> 와 <u>x</u>\n\n| a | b |\n| :-- | --: |\n| 1 | 2 |\n";
    const doc = parse(source);
    expect(JSON.stringify(doc)).not.toContain('"image"');
    expect(doc.content!.map((n) => n.type)).toEqual(["raw", "paragraph", "raw"]);
    expect(roundTrip(source)).toBe(source);
  });

  it("GFM의 표·할 일·취소선은 그대로 읽는다", () => {
    const source = "| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- [ ] 할 일\n- [x] 끝\n\n~~지움~~\n";
    expect(roundTrip(source)).toBe(source);
    expect(parse(source).content!.map((n) => n.type)).toEqual(["table", "taskList", "paragraph"]);
  });

  it("두 번째 왕복은 같다(멱등)", () => {
    const source = "# 제목\n\n[[링크|표시]]와 글\n둘째 줄\n\n```\n[[코드 안]]\n```\n";
    const once = roundTrip(source);
    expect(roundTrip(once)).toBe(once);
    expect(once).toContain("```\n[[코드 안]]\n```");
  });

  it("obsidian 방언은 이전과 같다(위키 링크는 해석된 것만 노드, 콜아웃 읽음)", () => {
    const o: ImportContext = { resolvePage: () => null, resolveImage: () => null };
    expect(JSON.stringify(markdownToDoc("> [!NOTE]\n> a\n", o, "").doc)).toContain("callout");
  });
});
