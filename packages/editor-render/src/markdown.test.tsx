import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderMarkdownToHtml, renderDocToHtml } from "./html.ts";
import { renderMarkdown } from "./index.ts";

const POST = `---
title: "첫 글"
tags: [a, b]
---

# 소개

본문 **굵게** 와 $E=mc^2$ 와 각주[^1].

> [!TIP]
> 팁

\`\`\`ts
const a = 1;
\`\`\`

\`\`\`mermaid
graph TD;A-->B
\`\`\`

![로고](https://example.com/logo.png) ![사진](images/photo.jpg)

[^1]: 각주 내용

## 다음 단계

[[다른 글]] 과 [[없는 글]]
`;

describe("renderMarkdown", () => {
  it("frontmatter·목차·요소를 한 번에 돌려준다", async () => {
    const result = await renderMarkdown(POST, {
      resolvePage: (name) => (name === "다른 글" ? "post-2" : null),
      pageLink: (id) => (id === "post-2" ? { href: "/posts/2", title: "다른 글" } : null),
    });
    expect(result.frontmatter).toEqual({ title: "첫 글", tags: ["a", "b"] });
    expect(result.headings).toEqual([
      { level: 1, text: "소개", id: "소개" },
      { level: 2, text: "다음 단계", id: "다음-단계" },
    ]);
    const html = renderToStaticMarkup(result.element as never);
    expect(html).toContain('<h1 id="소개">소개</h1>');
    expect(html).toContain("<strong>굵게</strong>");
    expect(html).toContain('class="katex"'); // 서버에서 그린 수식
    expect(html).toContain("hljs-keyword"); // 서버에서 강조한 코드
    expect(html).toContain('<pre class="mermaid">graph TD;A--&gt;B</pre>');
    expect(html).toContain("callout-tip");
    expect(html).toContain('id="fn-1"');
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain('src="images/photo.jpg"');
    expect(html).toContain('href="/posts/2"');
    expect(html).toContain("[[없는 글]]"); // 못 찾은 위키 링크는 글자로 남는다
    expect(result.notices.some((n) => n.includes("링크"))).toBe(true);
  });

  it("frontmatter가 없는 글도 된다", async () => {
    const result = await renderMarkdown("그냥 글");
    expect(result.frontmatter).toEqual({});
    expect(renderToStaticMarkup(result.element as never)).toContain("<p>그냥 글</p>");
  });

  it("remoteImages를 끄면 원격 이미지는 링크가 된다", async () => {
    const result = await renderMarkdown("![로고](https://example.com/logo.png)", { remoteImages: false });
    const html = renderToStaticMarkup(result.element as never);
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://example.com/logo.png"');
  });

  it("resolveImage로 이미지 경로를 바꾸거나 막을 수 있다", async () => {
    const result = await renderMarkdown("![a](a.png) ![b](b.png)", { resolveImage: (path) => (path === "a.png" ? `/assets/${path}` : null) });
    const html = renderToStaticMarkup(result.element as never);
    expect(html).toContain('src="/assets/a.png"');
    expect(html).not.toContain("b.png\"");
  });

  it("글 안의 스크립트·위험한 링크는 실행되지 않는다", async () => {
    const result = await renderMarkdown("<script>alert(1)</script>\n\n[x](javascript:alert(1)) ![y](javascript:alert(2))");
    const html = renderToStaticMarkup(result.element as never);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });

  it("같은 입력은 같은 결과를 낸다", async () => {
    const a = renderToStaticMarkup((await renderMarkdown(POST)).element as never);
    const b = renderToStaticMarkup((await renderMarkdown(POST)).element as never);
    expect(a).toBe(b);
  });
});

describe("HTML 문자열 진입점", () => {
  it("renderMarkdownToHtml: 같은 결과를 문자열로", async () => {
    const { html, headings, frontmatter } = await renderMarkdownToHtml(POST);
    expect(html.startsWith('<div class="md-doc">')).toBe(true);
    expect(headings).toHaveLength(2);
    expect(frontmatter.title).toBe("첫 글");
  });

  it("renderDocToHtml: 본문 JSON을 문자열로", () => {
    expect(renderDocToHtml({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "글" }] }] })).toBe('<div class="md-doc"><p>글</p></div>');
  });
});

describe("방언·참조 (P7)", () => {
  it("콜아웃(아무 이름·아이콘 표)·임베드·들여쓰기를 읽어 그린다", async () => {
    const source = "> [!rocket] 출시\n> 내용\n\n![|480](https://youtu.be/dQw4w9WgXcQ)\n\n&emsp;&emsp;들여쓴 글\n";
    const { element, doc } = await renderMarkdown(source, { calloutIcons: { rocket: "🚀" } });
    const out = renderToStaticMarkup(element as never);
    expect(out).toContain("callout-rocket");
    expect(out).toContain("🚀");
    expect(out).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(out).toContain("width:480px");
    expect(out).toContain("margin-left:2em");
    expect(doc.content?.map((n) => n.type)).toEqual(["callout", "embed", "paragraph"]);
  });

  it("embeds·indent를 끄면 일반 이미지·글자로 본다", async () => {
    const { doc } = await renderMarkdown("![](https://youtu.be/dQw4w9WgXcQ)\n\n&emsp;글\n", { embeds: false, indent: false });
    expect(doc.content?.some((n) => n.type === "embed")).toBe(false);
    expect(JSON.stringify(doc)).not.toContain('"indent"');
  });

  it("일반 GFM 방언의 HTML은 renderRaw로 그린다", async () => {
    const { element } = await renderMarkdown("<div>원문</div>\n", { dialect: "gfm", renderRaw: (text) => <em data-x>{text}</em> });
    expect(renderToStaticMarkup(element as never)).toContain('<em data-x="true">&lt;div&gt;원문&lt;/div&gt;</em>');
  });

  it("참조 표기를 켜면 참조 노드가 되고 renderReference가 그린다", async () => {
    const { element, doc } = await renderMarkdown("::ref{kind=table-schema id=t1}\n", { references: true, renderReference: ({ id }) => <b>{id}</b> });
    expect(doc.content?.[0]?.type).toBe("reference");
    expect(renderToStaticMarkup(element as never)).toContain("<b>t1</b>");
  });
});
