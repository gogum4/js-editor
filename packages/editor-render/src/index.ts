/**
 * 읽기 전용 렌더링의 공개 API (docs/EDITOR-PACKAGE.md P4).
 * 본문 JSON(`PmNode`) → React 요소. Markdown은 `@9um4/editor-markdown`의 `markdownToDoc`으로 먼저 본문 JSON으로 바꾼다.
 */
export { collectHeadings, type HeadingInfo, slugify, textOf } from "./slug";
export { enRenderStrings, koRenderStrings, type RenderStrings } from "./strings";
export { renderDoc } from "./render";
export type { ImageSource, PageReference, Prepared, RenderOptions } from "./types";
export { codeKey, mathKey } from "./types";
