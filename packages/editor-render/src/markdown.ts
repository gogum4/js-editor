import type { ReactNode } from "react";

import { type Frontmatter, type ImportContext, markdownToDoc, parseFrontmatter } from "@gogum4/editor-markdown";
import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { prepareRender } from "./prepare.ts";
import { renderDoc } from "./render.tsx";
import { collectHeadings, type HeadingInfo } from "./slug.ts";
import type { RenderOptions } from "./types.ts";

export interface RenderMarkdownOptions extends Omit<RenderOptions, "prepared"> {
  /**
   * 위키 링크 `[[이름]]`을 글 id로 해석한다. 모르면 null(글자로 남는다). 해석된 글은 `pageLink` 옵션이 주소로 바꾼다.
   * 기본: 모든 위키 링크를 글자로 둔다.
   */
  resolvePage?: ImportContext["resolvePage"];
  /**
   * Markdown 이미지의 경로를 정한다. 돌려준 경로가 `imageUrl`로 넘어간다. 폴더에 없으면 null(글자로 남는다).
   * 기본: 경로를 그대로 쓴다. `http(s)` 주소의 이미지는 `remoteImages` 옵션(기본 켜짐)이 따로 다룬다.
   */
  resolveImage?: ImportContext["resolveImage"];
  /** `http(s)` 주소의 이미지를 이미지로 보일지(끄면 링크). 기본 켜짐. */
  remoteImages?: boolean;
  /** Markdown 방언. 기본 `obsidian`; 블로그의 `remark-directive` 문법이면 `"blog"`(모르는 디렉티브는 `renderRaw`로 그린다). */
  dialect?: ImportContext["dialect"];
  /** 참조 표기를 참조 노드로 읽을지(`ImportContext.references`). 기본 끔. `renderReference`와 짝이다. */
  references?: ImportContext["references"];
}

export interface RenderedMarkdown {
  /** React 요소. 서버 컴포넌트에서 그대로 반환하면 된다. */
  element: ReactNode;
  /** 글머리의 frontmatter(`---` 사이). 없으면 빈 객체. */
  frontmatter: Frontmatter["data"];
  /** 제목 목록(목차용). `element`의 제목 앵커 id와 같다. */
  headings: HeadingInfo[];
  /** 읽다가 손실·대체가 있었다면 사람이 읽을 안내(예: 찾지 못한 링크). 개발 중 확인용이다. */
  notices: string[];
  /** 변환된 본문 JSON. 다른 렌더러나 검색 색인에 쓸 수 있다. */
  doc: PmNode;
}

/**
 * Markdown 글 하나를 렌더링한다: frontmatter를 떼고 → 본문 JSON으로 바꾸고(편집기와 같은 규칙) → 서버 준비(수식·코드 강조) → React 요소.
 * 서버 컴포넌트에서 쓰도록 만들었다(비동기). 같은 입력은 같은 결과를 낸다.
 *
 * ```tsx
 * const { element, frontmatter, headings } = await renderMarkdown(source);
 * return <article>{element}</article>;
 * ```
 */
export async function renderMarkdown(source: string, options: RenderMarkdownOptions = {}): Promise<RenderedMarkdown> {
  const { resolvePage, resolveImage, remoteImages = true, dialect, references, ...renderOptions } = options;
  const { data, body } = parseFrontmatter(source);
  const context: ImportContext = {
    resolvePage: resolvePage ?? (() => null),
    resolveImage: resolveImage ?? ((path) => path),
    remoteImages,
    ...(dialect !== undefined ? { dialect } : {}),
    ...(references !== undefined ? { references } : {}),
  };
  const { doc, notices } = markdownToDoc(body, context, "");
  const prepared = await prepareRender(doc);
  return {
    element: renderDoc(doc, { ...renderOptions, prepared }),
    frontmatter: data,
    headings: collectHeadings(doc),
    notices: [...notices.entries()].map(([message, count]) => (count > 1 ? `${message} (${count}곳)` : message)),
    doc,
  };
}
