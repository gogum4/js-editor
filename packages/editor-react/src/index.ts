"use client";

/**
 * 에디터 React 화면의 공개 API (docs/EDITOR-PACKAGE.md P5). 앱은 이 파일에 있는 것만 가져다 쓴다.
 * 에디터는 브라우저 안에서만 동작하므로 이 모듈 전체가 클라이언트 모듈이다(Next.js App Router의 `"use client"`).
 */

// 확장 목록: core에 React 뷰·메뉴·편집 창을 채워 준 것
export { createReactExtensions, reactMenus, reactUi, reactViews } from "./createReactExtensions";

// 컨텍스트: 화면이 쓰는 포트와 글 사전
export { EditorPortsProvider, useEditorPorts, useEditorStrings } from "./context";

// 화면 조각
export { AssetImage } from "./views/AssetImage";
export { FootnoteEditorHost } from "./hosts/FootnoteEditorHost";
export { MathEditorHost } from "./hosts/MathEditorHost";
export { TableToolbar } from "./hosts/TableToolbar";
export { useMathHtml } from "./hooks/useMathHtml";
