import { renderToStaticMarkup } from "react-dom/server";

import type { PmNode } from "@9um4-utils/editor-schema/pmDoc";
import { type RenderedMarkdown, renderMarkdown, type RenderMarkdownOptions } from "./markdown.ts";
import { renderDoc } from "./render.tsx";
import type { RenderOptions } from "./types.ts";

/**
 * HTML 문자열 출력(RSS, 이메일, 정적 파일 등). `react-dom/server`를 쓰기 때문에 **별도 진입점**(`@9um4-utils/editor-render/html`)이다 —
 * Next.js 서버 컴포넌트에서 `react-dom/server`를 가져오면 오류이므로 요소(`renderDoc`/`renderMarkdown`)와 섞지 않는다.
 */
export function renderDocToHtml(doc: PmNode, options?: RenderOptions): string {
  return renderToStaticMarkup(renderDoc(doc, options));
}

/** Markdown → HTML 문자열. `renderMarkdown`과 같은 옵션. */
export async function renderMarkdownToHtml(source: string, options?: RenderMarkdownOptions): Promise<Omit<RenderedMarkdown, "element"> & { html: string }> {
  const { element, ...rest } = await renderMarkdown(source, options);
  return { ...rest, html: renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]) };
}
