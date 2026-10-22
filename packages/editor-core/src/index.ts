/**
 * 에디터 코어의 공개 API (docs/EDITOR-PACKAGE.md). 앱은 이 파일에 있는 것만 가져다 쓴다.
 * 위키 계층(페이지 링크·페이지 블록·동기화)과 문서 저장은 여기에 없고 앱이 `createCoreExtensions`의 주입 지점으로 붙인다.
 */

// 확장 목록
export { type CoreExtensionsOptions, createCoreExtensions } from "./coreExtensions";
export { type MarkdownCopyOptions, sliceToMarkdown } from "./extensions/MarkdownCopy";
export { blockFlashKey, findBlockById } from "./extensions/BlockFlash";
export { blockIdPlugin, blockIdTransaction, transactionIntroducesBlocks } from "./extensions/BlockId";

// 화면(편집 창·막대·이미지)
export { FootnoteEditorHost } from "./footnote/FootnoteEditorHost";
export { AssetImage } from "./image/AssetImage";
export { MathEditorHost } from "./math/MathEditorHost";
export { placeMenu } from "./menuPlace";
export { TableToolbar } from "./table/TableToolbar";
export { useMathHtml } from "./lib/math";

// 슬래시 메뉴
export { CORE_SLASH_ITEMS, filterSlashItems, localizeSlashItems, type SlashItem } from "./lib/slashItems";
export type { SlashHandlers } from "./slash/runSlashCommand";

// 포트(앱이 에디터에 연결해 주는 것)
export { EditorPortsProvider, useEditorPorts, useEditorStrings } from "./ports/context";
export { EditorPortsExtension, portsOf, stringsOf } from "./ports/editorPorts";
export { browserUrlOpener, consoleNotifier, memoryKeyValue, memoryPorts, noAssets } from "./ports/memory";
export type { AssetStore, EditorPorts, KeyValueStore, Notifier, StoredAsset, UrlOpener } from "./ports/types";

// 화면 글 사전
export { enStrings, type EditorStrings, koStrings } from "./strings";
