import { describe, expect, it } from "vitest";

import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { docToMarkdown } from "./markdown.ts";
import { type ImportContext, markdownToDoc } from "./markdownImport.ts";

const base: ImportContext = { resolvePage: () => null, resolveImage: () => null };
const on: ImportContext = { ...base, embeds: true };
const blocks = (md: string, ctx: ImportContext = on, dialect?: "obsidian" | "gfm") => markdownToDoc(md, { ...ctx, ...(dialect ? { dialect } : {}) }, "").doc.content ?? [];
const embed = (provider: string, url: string, extra: Record<string, unknown> = {}): PmNode => ({ type: "embed", attrs: { provider, url, ...extra } });
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const out = (...content: PmNode[]) => docToMarkdown(doc(...content), { pageTitle: () => null });

describe("임베드 읽기 (![](주소))", () => {
  it("지원하는 주소의 이미지 문법은 임베드 블록이 된다 (주소는 정규화)", () => {
    expect(blocks("![](https://youtu.be/dQw4w9WgXcQ?si=x)")).toEqual([embed("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")]);
    expect(blocks("![](https://twitter.com/jack/status/20)")).toEqual([embed("x", "https://x.com/jack/status/20")]);
    expect(blocks("![설명](https://soundcloud.com/a/b)")).toEqual([embed("soundcloud", "https://soundcloud.com/a/b")]);
  });

  it("크기: |너비 와 |너비x높이 (Obsidian 표기)", () => {
    expect(blocks("![|500](https://youtu.be/dQw4w9WgXcQ)")).toEqual([embed("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { width: 500 })]);
    expect(blocks("![|500x300](https://youtu.be/dQw4w9WgXcQ)")).toEqual([embed("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { width: 500, height: 300 })]);
    // 범위 밖의 크기는 버린다.
    expect(blocks("![|9](https://youtu.be/dQw4w9WgXcQ)")).toEqual([embed("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")]);
  });

  it("문장 가운데에 있으면 문단을 갈라 블록으로 만든다", () => {
    const [a, b, c] = blocks("앞 ![](https://youtu.be/dQw4w9WgXcQ) 뒤");
    expect(a).toMatchObject({ type: "paragraph" });
    expect(b?.type).toBe("embed");
    expect(c).toMatchObject({ type: "paragraph" });
  });

  it("꺼져 있으면(기본) 일반 이미지로 본다", () => {
    expect(blocks("![](https://youtu.be/dQw4w9WgXcQ)", base).some((n) => n.type === "embed")).toBe(false);
  });

  it("지원하지 않는 주소의 이미지는 임베드가 아니다", () => {
    expect(blocks("![](https://example.com/a.png)").some((n) => n.type === "embed")).toBe(false);
  });

  it("GFM 방언은 크기 표기를 읽지 않는다", () => {
    expect(blocks("![|500](https://youtu.be/dQw4w9WgXcQ)", on, "gfm")).toEqual([embed("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")]);
  });
});

describe("임베드 쓰기", () => {
  it("![](주소)로 내보낸다", () => {
    expect(out(embed("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).markdown).toBe("![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n");
  });

  it("크기는 너비가 있을 때만 |너비 · |너비x높이", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    expect(out(embed("youtube", url, { width: 500 })).markdown).toBe(`![|500](${url})\n`);
    expect(out(embed("youtube", url, { width: 500, height: 300 })).markdown).toBe(`![|500x300](${url})\n`);
    expect(out(embed("youtube", url, { height: 300 })).markdown).toBe(`![](${url})\n`);
  });

  it("주소가 없거나 올바르지 않으면 내보내지 않는다", () => {
    expect(out(embed("", "")).markdown).toBe("");
    const bad = out(embed("youtube", "https://evil.com/x"));
    expect(bad.markdown).toBe("");
    expect(bad.notices.join("\n")).toContain("올바르지 않은 임베드");
  });

  it("공급자와 주소가 어긋난 값은 거절한다", () => {
    expect(out(embed("x", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).markdown).toBe("");
  });
});

describe("임베드 왕복", () => {
  it("쓰고 다시 읽으면 같다 (모든 공급자·크기 포함)", () => {
    const cases = [
      embed("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", { width: 640, height: 360 }),
      embed("x", "https://x.com/jack/status/20"),
      embed("instagram", "https://www.instagram.com/p/Cabc_123/", { width: 400 }),
      embed("pinterest", "https://www.pinterest.com/pin/123/"),
      embed("soundcloud", "https://soundcloud.com/a/b"),
    ];
    for (const node of cases) {
      const markdown = out(node).markdown;
      expect(blocks(markdown), markdown).toEqual([node]);
    }
  });
});
