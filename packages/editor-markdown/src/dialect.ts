/**
 * Markdown 방언. `obsidian`(기본)은 노트 앱이 쓰는 모양(위키 링크·`^id`·`> [!NOTE]` 콜아웃·`<details>`·`<div align>`)이고,
 * `blog`는 블로그의 `remark-directive` 문법(`:::note`·`:::center`·`::youtube{…}`·`:postlink[…]{…}`)이다(docs/MARKDOWN-DIALECT.md, P6-2).
 * 블로그 방언은 모르는 디렉티브를 원문 그대로 보존한다(`rawDirectives`가 함께 켜진 것으로 본다).
 */
export type MarkdownDialect = "obsidian" | "blog" | "gfm";

/**
 * 방언이 켜고 끄는 문법의 묶음(P7b). 가져오기·내보내기 코드는 방언 이름이 아니라 이 플래그를 본다.
 * - `obsidian`: 노트 앱·Obsidian. 위키 링크(`#위치`·`![[임베드]]` 포함)·`^id`·콜아웃·수식·각주·이미지 크기·`<details>`/`<div align>`.
 * - `blog`: 블로그(remark-directive). 위키 링크·`^id`·콜아웃이 없고 디렉티브·수식·각주가 있다. 줄바꿈 한 개는 공백(`softBreak`).
 * - `gfm`: 일반 GFM 문서(PlanBench의 `markdown-it`: `html:false`, `breaks:true`). 위키 링크(`[[대상|표시]]`)만 있고 콜아웃·`^id`·수식·각주·HTML 변환은 없다.
 */
export interface DialectProfile {
  /** `[[대상|표시]]`를 위키 링크로 읽는다. */
  wikiLinks: boolean;
  /** 위키 링크의 `#위치`와 `![[임베드]]`를 읽는다. */
  wikiExtras: boolean;
  /** 줄 끝의 `^id`를 블록 id로 읽는다. */
  blockIds: boolean;
  /** `> [!NOTE]`를 콜아웃으로 읽는다. */
  callouts: boolean;
  /** `$…$`·`$$…$$` 수식. */
  math: boolean;
  /** `[^1]` 각주. */
  footnotes: boolean;
  /** 이미지 `![설명|너비](경로)`의 너비. */
  imageWidth: boolean;
  /** 이미지·링크 속 이미지·HTML·열 정렬 표처럼 에디터에 대응 노드가 없는 것을 원문(`raw`·`rawInline`)으로 둔다(켜지 않으면 변환·가공한다). */
  rawEmbeds: boolean;
  /** `remark-directive` 디렉티브(컨테이너는 구조로, 나머지는 원문으로). */
  directives: boolean;
  /** 문단 안의 줄바꿈 한 개를 `softBreak`로(끄면 눈에 보이는 줄바꿈 `hardBreak`). */
  softBreaks: boolean;
}

const OBSIDIAN: DialectProfile = { wikiLinks: true, wikiExtras: true, blockIds: true, callouts: true, math: true, footnotes: true, imageWidth: true, rawEmbeds: false, directives: false, softBreaks: false };
const PROFILES: Readonly<Record<MarkdownDialect, DialectProfile>> = {
  obsidian: OBSIDIAN,
  blog: { ...OBSIDIAN, wikiLinks: false, wikiExtras: false, blockIds: false, callouts: false, imageWidth: false, rawEmbeds: true, directives: true, softBreaks: true },
  gfm: { ...OBSIDIAN, wikiExtras: false, blockIds: false, callouts: false, math: false, footnotes: false, imageWidth: false, rawEmbeds: true },
};

export function profileOf(dialect: MarkdownDialect | undefined): DialectProfile {
  return PROFILES[dialect ?? "obsidian"];
}

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
