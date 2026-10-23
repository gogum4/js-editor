import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PmNode } from "@9um4-utils/editor-schema/pmDoc";
import { prepareRender, renderDoc } from "./index.ts";

// CSS 원문을 문자열로 읽는다(Vite의 ?raw).
const css = import.meta.glob<string>("../styles/*.css", { query: "?raw", import: "default", eager: true });
const renderCss = css["../styles/render.css"] ?? "";
const highlightCss = css["../styles/highlight.css"] ?? "";
const katexCss = css["../styles/katex.css"] ?? "";

// 렌더러가 내는 class마다 스타일이 있는지 지킨다(클래스를 더하고 CSS를 잊는 일을 막는다).
const fixtures = import.meta.glob<{ doc: PmNode }>("../../editor-markdown/fixtures/*.doc.json", { eager: true, import: "default" });

const extra: PmNode = {
  type: "doc",
  content: [
    { type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: "graph TD;A-->B" }] },
    { type: "image", attrs: { hash: "a".repeat(64), mime: "image/png", alt: "그림" } },
    { type: "pageBlock", attrs: { pageId: "x", mode: "card" } },
    { type: "paragraph", content: [{ type: "pageLink", attrs: { pageId: "x" } }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "끝" }] }] }] },
  ],
};

// 라이브러리가 붙이는 이름(스타일은 그쪽 CSS 몫)이거나 글자 수식용 보조 이름.
const NOT_OURS = (name: string) => name.startsWith("hljs") || name.startsWith("language-") || name.startsWith("katex") || name === "md-doc";

describe("스타일 파일", () => {
  it("렌더러가 내는 모든 class에 스타일이 있다", async () => {
    const classes = new Set<string>();
    const docs = [...Object.values(fixtures).map((f) => f.doc), extra];
    for (const doc of docs) {
      const prepared = await prepareRender(doc);
      // KaTeX가 만든 수식 HTML 안의 class는 그쪽 CSS 몫이라, 수식 HTML을 자리표시로 바꿔 우리 쪽 상자(math-inline, math-block)의 class만 본다.
      const stubbed = { ...prepared, math: new Map([...prepared.math].map(([key]) => [key, "<i>m</i>"])) };
      const html = renderToStaticMarkup(renderDoc(doc, { prepared: stubbed, pageLink: () => ({ href: "/x", title: "x" }) }));
      for (const match of html.matchAll(/class="([^"]+)"/g)) for (const name of match[1]!.split(/\s+/)) if (!NOT_OURS(name)) classes.add(name);
    }
    const all = renderCss + highlightCss;
    const missing = [...classes].filter((name) => !all.includes(`.${name}`));
    expect(missing).toEqual([]);
  });

  it("색은 CSS 변수이고 어두운 테마 규칙이 있다", () => {
    expect(renderCss).toContain("prefers-color-scheme: dark");
    expect(renderCss).toContain('[data-theme="dark"]');
    expect(renderCss).toContain("var(--md-fg)");
    expect(highlightCss).toContain("prefers-color-scheme: dark");
  });

  it("KaTeX CSS 재노출이 katex 패키지를 가리킨다", () => {
    expect(katexCss).toContain("katex/dist/katex.min.css");
  });
});
