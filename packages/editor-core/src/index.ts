/**
 * 에디터 코어의 공개 API (docs/EDITOR-PACKAGE.md). 앱은 이 파일에 있는 것만 가져다 쓴다.
 * 위키 계층(페이지 링크·페이지 블록·동기화)과 문서 저장은 여기에 없고 앱이 `createCoreExtensions`의 주입 지점으로 붙인다.
 */

// 확장 목록
export { type CoreExtensionsOptions, createCoreExtensions } from "./coreExtensions";
export { type MarkdownCopyOptions, sliceToMarkdown } from "./extensions/MarkdownCopy";
export { blockFlashKey, findBlockById } from "./extensions/BlockFlash";
export { blockIdPlugin, blockIdTransaction, transactionIntroducesBlocks } from "./extensions/BlockId";

// 화면에 필요한 순수 도구 (React 화면은 `@gogum4/editor-react`)
export { placeMenu } from "./menuPlace";

// 슬래시 메뉴
export { CORE_SLASH_ITEMS, filterSlashItems, localizeSlashItems, type SlashItem } from "./lib/slashItems";
export { runSlashCommand, type SlashHandlers } from "./slash/runSlashCommand";

// 포트(앱이 에디터에 연결해 주는 것)
export { EditorPortsExtension, portsOf, stringsOf, uiOf } from "./ports/editorPorts";
export { type EditorMenus, type EditorUi, type EditorViews, type NodeViewOptions, noUi, type SuggestionRender } from "./ports/ui";
export { browserUrlOpener, consoleNotifier, memoryKeyValue, memoryPorts, noAssets } from "./ports/memory";
export type { AssetStore, EditorPorts, KeyValueStore, Notifier, ReferenceInfo, ReferenceResolver, StoredAsset, UrlOpener } from "./ports/types";

// 화면 글 사전
export { enStrings, type EditorStrings, koStrings } from "./strings/index";

// `@gogum4/editor-react`가 쓰는 내부 (수식·각주 편집, 수식 렌더 로더, 자동완성 계산, mermaid 도구, 이미지 캐시)
export type { Candidate } from "./completion/words";
export { Raw, RawInline } from "./raw/Raw";
export { Reference } from "./reference/Reference";
export { applyEmbedInput, Embed } from "./embed/Embed";
export { EmojiSuggest } from "./extras/EmojiSuggest";
export type { EmojiSuggestion } from "./extras/EmojiSuggest";
export { setFootnoteText } from "./footnote/footnoteEdit";
export type { FootnoteEditState } from "./footnote/footnoteEdit";
export { FOOTNOTE_NODE, collectFootnotes } from "./footnote/footnotes";
export { assetCacheFor } from "./image/assetCache";
export { MAX_AUTO_CANDIDATES, MAX_MANUAL_CANDIDATES, commandEdit, commandQuery, deletePairEdit, insertPreview, openPairEdit, shouldAutoOpen, skipCloserEdit, suggest, tabJump } from "./lib/latexAssist";
export type { Edit } from "./lib/latexAssist";
export type { LatexCommand } from "./lib/latexCommands";
export { MAX_LATEX_CHARS, loadKatex, mathError, renderMathHtml } from "./lib/math";
export { MATH_BLOCK_NODE, isMathNode, setMathLatex } from "./math/mathEdit";
export type { MathEditState } from "./math/mathEdit";
export { hasUsedMermaid, isMermaidLanguage, peekMermaid, preloadMermaid, renderMermaid } from "./mermaid/renderer";
export type { MermaidResult } from "./mermaid/renderer";
export { centerAt, constrainView, fitView, percentLabel, svgSize, zoomAt } from "./mermaid/viewerMath";
export type { Size, View } from "./mermaid/viewerMath";
export { TABLE_ACTIONS } from "./table/tableActions";
export type { TableAction } from "./table/tableActions";
