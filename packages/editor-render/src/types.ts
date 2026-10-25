import type { ReactNode } from "react";

import type { CalloutIcons } from "@gogum4/editor-schema/callout";
import type { HastChild } from "./highlight.tsx";
import type { RenderStrings } from "./strings.ts";

/** 서버 준비 단계(`prepareRender`)의 결과: 비동기로만 얻을 수 있는 것(수식 HTML, 코드 강조)을 미리 모아 둔다. 렌더 자체는 동기다. */
export interface Prepared {
  /** `수식키(display, latex)` → KaTeX가 만든 HTML. */
  math: ReadonlyMap<string, string>;
  /** `코드키(language, code)` → 강조된 hast 노드들. */
  code: ReadonlyMap<string, readonly HastChild[]>;
}

export const mathKey = (display: boolean, latex: string) => `${display ? "block" : "inline"}\u0000${latex}`;
export const codeKey = (language: string, code: string) => `${language}\u0000${code}`;

export interface ImageSource {
  /** 이 앱의 저장소 이미지(해시·형식). 블로그 글에서는 보통 없다. */
  hash: string | null;
  mime: string | null;
  /** Markdown의 이미지 경로나 `http(s)` 주소. */
  path: string | null;
  alt: string;
  width: number | null;
  /** `http(s)` 주소의 이미지인지. */
  remote: boolean;
}

export interface PageReference {
  href: string;
  title: string;
}

export interface RenderOptions {
  /** 서버 준비 결과. 없으면 수식은 LaTeX 원문, 코드는 강조 없이 보인다. */
  prepared?: Prepared;
  /**
   * 이미지 주소를 정한다. 돌려준 값이 없으면(null) 이미지 자리에 대체 글이 보인다.
   * 기본: 원격 주소와 `/`·`./`로 시작하는 경로는 그대로, 저장소 해시는 null.
   */
  imageUrl?: (image: ImageSource) => string | null;
  /** 콜아웃 종류별 아이콘 표(이모지나 짧은 글). 아이콘을 모르는 종류(`> [!rocket]`)의 아이콘을 정하거나 기본 종류의 아이콘을 바꾼다. */
  calloutIcons?: CalloutIcons;
  /**
   * Bluesky 핸들 → DID 표(소문자 핸들). 핸들 주소의 Bluesky 임베드는 DID를 알아야 그릴 수 있어서(`embed.bsky.app`이 DID만 받는다), 서버에서 그리는 소비자가 미리 알아내 넘긴다.
   * 모르는 핸들의 임베드는 원본 링크만 그린다.
   */
  blueskyDids?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  /** 태그(`#태그`)를 어디로 이을지. 없거나 null이면 링크 없이 `#태그` 글자만 보인다. */
  tagHref?: (name: string) => string | null;
  /**
   * 인용(`[@키]`)의 표시 글: 키들(`keys`)과 원문(`source`)을 받아 사람이 읽는 글(예: "Smith 2020")을 돌려준다. 없거나 null이면 `[원문]`이 보인다.
   */
  citationLabel?: (keys: readonly string[], source: string, narrative?: boolean) => string | null;
  /** 참고문헌 목록(`[bibliography]`)의 한 줄 글: 키 → 글(모르는 키는 null이라 `@키`가 보인다). 없으면 목록 블록은 그려지지 않는다. */
  bibliographyEntry?: (key: string) => string | null;
  /** 인용 키의 링크(예: Zotero의 `zotero://select/items/…`나 참고 문헌 목록의 앵커). 없거나 null이면 링크 없이 보인다. 첫 키에 걸린다. */
  citationHref?: (key: string) => string | null;
  /** 주석(`%%글%%`)을 흐린 글로 보일지. 기본 꺼짐 — 주석은 독자에게 보이지 않는다. */
  showComments?: boolean;
  /** 페이지 링크(`[[…]]`)를 어디로 이을지. 없거나 null이면 링크 없이 글자만 보인다. */
  pageLink?: (pageId: string) => PageReference | null;
  /** 블록 id를 앵커(`id="^id"`)로 남길지. 블록 링크(`#^id`)가 같은 글 안에서 동작하게 하려면 켠다. 기본 꺼짐. */
  blockAnchors?: boolean;
  /** 제목에 앵커 id를 달지. 기본 켜짐. */
  headingIds?: boolean;
  /** mermaid 테마(브라우저에서 그릴 때). 기본 `default`. */
  mermaidTheme?: "default" | "dark" | "neutral" | "forest";
  /**
   * 참조 노드(`reference`)를 그린다. 대상 정보는 소비자가 서버에서 미리 읽어 두고 여기서 요소를 돌려준다(렌더는 동기다).
   * `undefined`를 돌려주면 대체 표시(종류·id만 적은 상자), `null`이면 아무것도 그리지 않는다. 옵션이 없으면 대체 표시다.
   */
  renderReference?: (target: { kind: string; id: string; props: Readonly<Record<string, string>> | null }) => ReactNode | undefined;
  /**
   * 에디터에 대응 노드가 없는 Markdown 조각의 원문(`raw` 블록, `rawInline`: HTML 등)을 그린다. `undefined`를 돌려주면 원문을 그대로 보이고,
   * `null`이면 아무것도 그리지 않는다. 옵션이 없으면 원문을 보인다.
   */
  renderRaw?: (text: string, inline: boolean) => ReactNode | undefined;
  strings?: RenderStrings;
  /** 바깥 `<div>`의 class에 더할 이름. 기본 클래스는 `md-doc`. */
  className?: string;
}
