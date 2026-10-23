/**
 * Markdown 방언. `obsidian`(기본)은 노트 앱이 쓰는 모양(위키 링크·`^id`·`> [!NOTE]` 콜아웃·`<details>`·`<div align>`)이고,
 * `blog`는 블로그의 `remark-directive` 문법(`:::note`·`:::center`·`::youtube{…}`·`:postlink[…]{…}`)이다(docs/MARKDOWN-DIALECT.md, P6-2).
 * 블로그 방언은 모르는 디렉티브를 원문 그대로 보존한다(`rawDirectives`가 함께 켜진 것으로 본다).
 */
export type MarkdownDialect = "obsidian" | "blog";

/** 블로그 콜아웃 이름 ↔ 에디터 콜아웃 종류(다섯 종류가 일대일로 짝지어진다). */
export const BLOG_CALLOUT_TO_TYPE: Readonly<Record<string, string>> = {
  note: "note",
  info: "important",
  tip: "tip",
  warning: "warning",
  danger: "caution",
};

export const TYPE_TO_BLOG_CALLOUT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(BLOG_CALLOUT_TO_TYPE).map(([blog, type]) => [type, blog]),
);
