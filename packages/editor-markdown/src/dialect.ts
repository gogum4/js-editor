/**
 * Markdown 방언. `obsidian`(기본)은 Obsidian 호환 문법(위키 링크·`![[임베드]]`·`^id`·`> [!종류]` 콜아웃·`<details>`·`<div align>`·`![](주소)` 임베드)이고,
 * `gfm`은 일반 GFM 문서다(docs/MARKDOWN-DIALECT.md).
 */
export type MarkdownDialect = "obsidian" | "gfm";

/**
 * 방언이 켜고 끄는 문법의 묶음(P7b). 가져오기·내보내기 코드는 방언 이름이 아니라 이 플래그를 본다.
 * - `obsidian`: 노트 앱·Obsidian. 위키 링크(`#위치`·`![[임베드]]` 포함)·`^id`·콜아웃·수식·각주·이미지 크기·`<details>`/`<div align>`.
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
  /** 상대 경로의 `.md` 링크(`[글](다른글.md)`)를 페이지 링크로 바꾼다(끄면 일반 링크로 둔다). */
  mdLinksToPages: boolean;
  /** 열어도 안전한지(`http(s)`·`mailto`·`tel`) 따지지 않고 링크의 주소를 그대로 보존한다(상대 경로·`obsidian://` 등; `javascript:`·`vbscript:`·`file:`·`data:`는 제외). 글 원본을 잃지 않으려는 방언이 켠다. */
  keepAnyHref: boolean;
  /** `~글~`(물결표 하나)를 취소선으로 읽는다(GFM·remark-gfm은 읽고, `markdown-it`은 `~~`만 읽는다). 끄면 홀로 있는 `~`는 글자다. */
  singleTildeStrike: boolean;
}

const OBSIDIAN: DialectProfile = { wikiLinks: true, wikiExtras: true, blockIds: true, callouts: true, math: true, footnotes: true, imageWidth: true, rawEmbeds: false, mdLinksToPages: true, keepAnyHref: false, singleTildeStrike: true };
const PROFILES: Readonly<Record<MarkdownDialect, DialectProfile>> = {
  obsidian: OBSIDIAN,
  gfm: { ...OBSIDIAN, wikiExtras: false, blockIds: false, callouts: false, math: false, footnotes: false, imageWidth: false, rawEmbeds: true, mdLinksToPages: false, keepAnyHref: true, singleTildeStrike: false },
};

export function profileOf(dialect: MarkdownDialect | undefined): DialectProfile {
  return PROFILES[dialect ?? "obsidian"];
}
