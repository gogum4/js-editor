import { ReactNodeViewRenderer } from "@tiptap/react";
import type * as Y from "yjs";

import { type CoreExtensionsOptions, createCoreExtensions } from "@gogum4/editor-core";
import type { EditorMenus, EditorUi, EditorViews } from "@gogum4/editor-core";
import { completionMenuRender } from "./menus/completionMenuRender";
import { slashMenuRender } from "./menus/slashMenuRender";
import { openFootnoteEditor } from "./stores/footnoteEditStore";
import { openMathEditor } from "./stores/mathEditStore";
import { CalloutView } from "./views/CalloutView";
import { CodeBlockView } from "./views/CodeBlockView";
import { FootnoteView } from "./views/FootnoteView";
import { ImageView } from "./views/ImageView";
import { MathBlockView, MathInlineView } from "./views/MathView";
import { ToggleView } from "./views/ToggleView";

/** React로 그리는 노드 뷰 일체. */
export const reactViews: EditorViews = {
  callout: ReactNodeViewRenderer(CalloutView),
  codeBlock: ReactNodeViewRenderer(CodeBlockView),
  image: ReactNodeViewRenderer(ImageView),
  footnote: ReactNodeViewRenderer(FootnoteView, { as: "sup" }),
  toggle: ReactNodeViewRenderer(ToggleView),
  mathInline: ReactNodeViewRenderer(MathInlineView, { as: "span" }),
  mathBlock: ReactNodeViewRenderer(MathBlockView),
};

/** React로 그리는 메뉴 일체. */
export const reactMenus: EditorMenus = {
  slash: slashMenuRender,
  codeCompletion: completionMenuRender,
};

/** 수식·각주 편집 창은 `MathEditorHost`·`FootnoteEditorHost`가 저장소를 보고 그린다 — 여는 쪽은 저장소를 채운다. */
export const reactUi: EditorUi = { openMathEditor, openFootnoteEditor };

/**
 * `createCoreExtensions`에 React 뷰·메뉴·편집 창을 채워 준 확장 목록. React를 쓰는 소비자(노트 앱, 데모)가 이것을 쓰고,
 * 필요하면 `views`·`menus`·`ui`로 일부만 바꿀 수 있다.
 */
export function createReactExtensions(ydoc: Y.Doc | null, options: CoreExtensionsOptions = {}) {
  return createCoreExtensions(ydoc, {
    ...options,
    views: { ...reactViews, ...options.views },
    menus: { ...reactMenus, ...options.menus },
    ui: options.ui ?? reactUi,
  });
}
