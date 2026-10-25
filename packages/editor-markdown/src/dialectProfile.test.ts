import { describe, expect, it } from "vitest";

import { docToMarkdown } from "./markdown.ts";
import { type ImportContext, markdownToDoc } from "./markdownImport.ts";

/** obsidian 방언에 항목 몇 개를 덮어써서(블로그: 콜아웃은 읽고 이미지·HTML은 원문으로 보존) 방언 둘의 조합을 만든다. */
const base: ImportContext = { resolvePage: () => null, resolveImage: () => null };
const blog: ImportContext = { ...base, profile: { rawEmbeds: true, keepAnyHref: true, mdLinksToPages: false } };

const blocks = (md: string, ctx: ImportContext) => markdownToDoc(md, ctx, "").doc.content ?? [];
const roundTrip = (md: string, ctx: ImportContext) => docToMarkdown(markdownToDoc(md, ctx, "").doc, { pageTitle: () => null }).markdown;

describe("방언 항목 덮어쓰기 (profile)", () => {
  it("덮어쓰지 않으면 방언 그대로다", () => {
    expect(blocks("![](/images/1/a.png)", base)[0]).toMatchObject({ type: "paragraph", content: [{ type: "text", text: "![](/images/1/a.png)" }] });
  });

  it("rawEmbeds를 켜면 이미지가 원문으로 보존되고 왕복해도 그대로다", () => {
    const md = "앞 ![alt](/images/1/a.png?w=300) 뒤\n\n![](/images/2/b.png)\n";
    const content = blocks(md, blog);
    expect(JSON.stringify(content)).toContain('"rawInline"');
    expect(roundTrip(md, blog)).toBe(md);
  });

  it("콜아웃·수식은 obsidian대로 읽는다 (gfm이었다면 글자)", () => {
    const content = blocks("> [!tip] 제목\n> 본문\n\n$$\nx\n$$\n", blog);
    expect(content[0]).toMatchObject({ type: "callout", attrs: { type: "tip" } });
    expect(JSON.stringify(content)).toContain("mathBlock");
  });

  it("HTML 래퍼와 열 정렬 표는 원문으로 보존된다", () => {
    const md = "<details>\n<summary>요약</summary>\n\n본문\n\n</details>\n\n| a | b |\n| :-: | - |\n| 1 | 2 |\n";
    const content = blocks(md, blog);
    expect(content.some((node) => node.type === "raw")).toBe(true);
    expect(roundTrip(md, blog)).toContain("| :-: | - |");
  });

  it("keepAnyHref: 상대 경로 링크의 주소를 그대로 보존한다", () => {
    expect(roundTrip("[글](/my-post) [문서](other.md)\n", blog)).toBe("[글](/my-post) [문서](other.md)\n");
  });
});
