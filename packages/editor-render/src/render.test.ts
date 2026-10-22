import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PmNode } from "@9um4/editor-schema/pmDoc";
import { collectHeadings, enRenderStrings, renderDoc, slugify } from "./index";
import type { RenderOptions } from "./types";

const t = (text: string, ...marks: Array<string | { type: string; attrs: Record<string, unknown> }>): PmNode => ({
  type: "text",
  text,
  ...(marks.length ? { marks: marks.map((m) => (typeof m === "string" ? { type: m } : m)) } : {}),
});
const p = (...content: PmNode[]): PmNode => ({ type: "paragraph", content });
const h = (level: number, text: string): PmNode => ({ type: "heading", attrs: { level }, content: [t(text)] });
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const html = (d: PmNode, options?: RenderOptions) => renderToStaticMarkup(renderDoc(d, options));

describe("안전", () => {
  it("글자는 HTML로 이스케이프된다", () => {
    const out = html(doc(p(t('<script>alert("x")</script> & <b>'))));
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("열면 안 되는 링크(javascript:, data:)는 링크 없이 글자만 남는다", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<b>", "vbscript:x", " JaVaScRiPt:x"]) {
      const out = html(doc(p(t("누르기", { type: "link", attrs: { href } }))));
      expect(out, href).not.toContain("<a");
      expect(out, href).toContain("누르기");
    }
  });

  it("http(s)·mailto 링크는 rel=noopener noreferrer nofollow로 나온다", () => {
    const out = html(doc(p(t("링크", { type: "link", attrs: { href: "https://example.com" } }))));
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("이미지는 기본으로 원격 주소와 /·./ 경로만 쓰고, 저장소 해시는 주소를 모르니 대체 글을 보인다", () => {
    const remote = html(doc({ type: "image", attrs: { importPath: "https://example.com/a.png", alt: "로고", remote: true, width: 120 } }));
    expect(remote).toContain('src="https://example.com/a.png"');
    expect(remote).toContain('width="120"');
    const relative = html(doc({ type: "image", attrs: { importPath: "./a.png", alt: "" } }));
    expect(relative).toContain('src="./a.png"');
    const stored = html(doc({ type: "image", attrs: { hash: "a".repeat(64), mime: "image/png", alt: "그림" } }));
    expect(stored).not.toContain("<img");
    expect(stored).toContain("image-missing");
    // javascript: 같은 경로는 이미지 주소로 쓰지 않는다.
    const evil = html(doc({ type: "image", attrs: { importPath: "javascript:alert(1)", alt: "x" } }));
    expect(evil).not.toContain("<img");
  });

  it("imageUrl로 주소를 정할 수 있다 (저장소 해시를 CDN 주소로)", () => {
    const out = html(doc({ type: "image", attrs: { hash: "ab".repeat(32), mime: "image/png", alt: "그림" } }), {
      imageUrl: (image) => (image.hash ? `https://cdn.example.com/${image.hash.slice(0, 8)}.png` : null),
    });
    expect(out).toContain('src="https://cdn.example.com/abababab.png"');
  });
});

describe("제목 앵커와 목차", () => {
  it("앵커 id가 겹치지 않고 목차(collectHeadings)와 같다", () => {
    const d = doc(h(1, "소개"), h(2, "같은 제목"), h(2, "같은 제목"), h(3, "Hello, World!"), h(2, ""));
    const ids = collectHeadings(d).map((x) => x.id);
    expect(ids).toEqual(["소개", "같은-제목", "같은-제목-2", "hello-world", "section"]);
    const out = html(d);
    for (const id of ids) expect(out).toContain(`id="${id}"`);
  });

  it("중첩된 제목(콜아웃·토글 안)도 순서대로 같은 id를 받는다", () => {
    const d = doc(h(2, "앞"), { type: "callout", attrs: { type: "note" }, content: [h(3, "안쪽")] }, { type: "toggle", content: [h(3, "토글 제목"), p(t("내용"))] }, h(2, "뒤"));
    const ids = collectHeadings(d).map((x) => x.id);
    expect(ids).toEqual(["앞", "안쪽", "토글-제목", "뒤"]);
    const out = html(d);
    expect(out).toContain('id="앞"');
    expect(out).toContain('id="안쪽"');
    expect(out).toContain('id="뒤"');
  });

  it("headingIds를 끄면 id를 달지 않는다", () => {
    expect(html(doc(h(1, "제목")), { headingIds: false })).not.toContain("id=");
  });

  it("slugify: 모든 언어의 글자·숫자만 남기고 공백은 -로 잇는다", () => {
    expect(slugify("  A  B--C  ")).toBe("a-b-c");
    expect(slugify("가 나! 다?")).toBe("가-나-다");
    expect(slugify("!!!")).toBe("section");
  });
});

describe("내용", () => {
  it("각주 번호는 문서에 나온 순서이고 빈 각주는 건너뛴다", () => {
    const d = doc(
      p(t("가"), { type: "footnote", attrs: { text: "하나" } }),
      { type: "blockquote", content: [p(t("나"), { type: "footnote", attrs: { text: "" } }, { type: "footnote", attrs: { text: "둘" } })] },
    );
    const out = html(d);
    expect(out).toContain('id="fn-1"');
    expect(out).toContain('id="fn-2"');
    expect(out).not.toContain('id="fn-3"');
    expect(out.indexOf("하나")).toBeLessThan(out.indexOf("둘"));
  });

  it("빈 문단은 나오지 않는다", () => {
    expect(html(doc({ type: "paragraph" }, p(t("글"))))).toBe('<div class="md-doc"><p>글</p></div>');
  });

  it("페이지 링크는 해석기가 알 때만 링크가 되고, 블록 링크는 #^id가 붙는다", () => {
    const link = { type: "pageLink", attrs: { pageId: "x", blockId: "para000001" } } as PmNode;
    const d = doc(p(link));
    expect(html(d)).toBe('<div class="md-doc"></div>'); // 못 찾은 링크만 든 문단은 사라진다
    const out = html(d, { pageLink: (id) => (id === "x" ? { href: "/posts/x", title: "글" } : null) });
    expect(out).toContain('href="/posts/x#^para000001"');
  });

  it("영어 문구를 고를 수 있다", () => {
    const out = html(doc({ type: "callout", attrs: { type: "warning" }, content: [p(t("조심"))] }, p(t("가"), { type: "footnote", attrs: { text: "주" } })), { strings: enRenderStrings });
    expect(out).toContain('aria-label="Warning"');
    expect(out).toContain('aria-label="Footnotes"');
  });

  it("className을 더할 수 있다", () => {
    expect(html(doc(p(t("글"))), { className: "prose" })).toContain('class="md-doc prose"');
  });

  it("같은 문서는 같은 HTML을 낸다 (렌더가 상태를 남기지 않는다)", () => {
    const d = doc(h(1, "제목"), p(t("가"), { type: "footnote", attrs: { text: "주" } }));
    expect(html(d)).toBe(html(d));
  });
});
