/**
 * 읽기 전용 렌더링의 공개 API (docs/EDITOR-PACKAGE.md P4).
 * 본문 JSON(`PmNode`) → React 요소. Markdown은 `@9um4/editor-markdown`의 `markdownToDoc`으로 먼저 본문 JSON으로 바꾼다.
 */
export { collectHeadings, type HeadingInfo, slugify, textOf } from "./slug.ts";
export { enRenderStrings, koRenderStrings, type RenderStrings } from "./strings.ts";
export { MermaidDiagram, type MermaidDiagramProps } from "./client/MermaidDiagram.tsx";
export { prepareRender } from "./prepare.ts";
export { renderDoc } from "./render.tsx";
export type { ImageSource, PageReference, Prepared, RenderOptions } from "./types.ts";
export { codeKey, mathKey } from "./types.ts";
