import type { Editor, NodeViewRenderer } from "@tiptap/core";
import type { SuggestionOptions } from "@tiptap/suggestion";

/**
 * 화면(뷰·메뉴·편집 창)을 core 밖에서 주입받는 접점 (docs/EDITOR-PACKAGE.md P5).
 * core의 확장은 스키마·명령·입력 규칙만 알고, 어떻게 그릴지는 `createCoreExtensions({ views, menus, ui })`로 받는다.
 * 주입하지 않으면 노드는 `renderHTML`의 기본 렌더로 그려지고, 메뉴와 편집 창은 뜨지 않는다 — React가 아닌 소비자도 core를 쓸 수 있다.
 */

/** 노드 확장이 받는 옵션: 노드 뷰(React 등)를 주입한다. 없으면 기본 렌더. */
export interface NodeViewOptions {
  nodeView: NodeViewRenderer | null;
}

/** 노드 이름별 뷰. 키는 확장 이름과 같다. */
export interface EditorViews {
  callout?: NodeViewRenderer;
  codeBlock?: NodeViewRenderer;
  image?: NodeViewRenderer;
  footnote?: NodeViewRenderer;
  toggle?: NodeViewRenderer;
  mathInline?: NodeViewRenderer;
  mathBlock?: NodeViewRenderer;
}

/** `@tiptap/suggestion`의 `render`(메뉴를 띄우고 갱신하고 닫는 훅 묶음). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SuggestionRender = NonNullable<SuggestionOptions<any, any>["render"]>;

export interface EditorMenus {
  /** `/` 명령 메뉴. */
  slash?: SuggestionRender;
  /** 코드 블록 자동완성 메뉴. */
  codeCompletion?: SuggestionRender;
}

/** 편집 창을 여는 접점(수식·각주). 창 자체는 소비자가 그린다. */
export interface EditorUi {
  openMathEditor(editor: Editor, pos: number): void;
  openFootnoteEditor(editor: Editor, pos: number): void;
}

/** 편집 창이 없는 소비자의 기본값: 아무것도 열지 않는다. */
export const noUi: EditorUi = {
  openMathEditor: () => {},
  openFootnoteEditor: () => {},
};
