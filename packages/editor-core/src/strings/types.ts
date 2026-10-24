import type { CalloutType } from "@9um4/editor-schema/callout";
import type { WordKind } from "../completion/words";

/**
 * 에디터 화면의 글(메뉴·툴팁·안내). 기본은 한국어(`koStrings`)이고 영어(`enStrings`)도 있다.
 * 다른 언어는 `EditorStrings`를 채워 `createCoreExtensions({ strings })`와 `EditorPortsProvider`에 준다.
 * 개발자용 콘솔 경고(`console.warn`)와 위키 계층(페이지 링크·페이지 블록)의 글은 여기에 없다.
 */
export interface EditorStrings {
  placeholder: { heading: string; empty: string };
  slash: {
    menuLabel: string;
    noMatch: string;
    /** 항목 id → 이름·설명. 없는 항목은 기본(한국어) 글을 쓴다. */
    items: Readonly<Record<string, { label: string; description: string }>>;
  };
  completion: { label: string; kinds: Readonly<Record<WordKind, string>> };
  callout: { changeLabel: (current: string) => string; changeTitle: string; types: Readonly<Record<CalloutType, string>> };
  codeBlock: { show: string; hide: string; copy: string; copied: string; copyFailed: string };
  /** 에디터가 모르는 문법을 원문 그대로 담는 상자(`raw`·`rawInline` 노드, 기본 꺼짐). */
  raw: { blockLabel: string; sourceLabel: string; inlineTitle: string; directiveLabel: string };
  languagePicker: {
    title: string;
    plainText: string;
    searchPlaceholder: string;
    searchLabel: string;
    empty: string;
    listLabel: string;
    matches: (count: number) => string;
    total: (count: number) => string;
  };
  mermaid: {
    syntaxError: string;
    enlargeTitle: string;
    enlargeLabel: string;
    emptyError: string;
    empty: string;
    loading: string;
    viewer: { fitShort: string; label: string; hint: string; zoomOut: string; zoomIn: string; fit: string; actualSize: string; close: string; diagram: string };
  };
  /** 참조 노드(다른 개체를 가리키는 카드). */
  reference: { loading: string; missing: string; unresolved: string; unknownKind: (kind: string) => string; openLabel: (title: string) => string };
  footnote: {
    heading: string;
    empty: string;
    refEmptyTitle: string;
    editorLabel: (number: number) => string;
    editorPlaceholder: string;
    editorHint: string;
    delete: string;
  };
  image: {
    alt: string;
    loading: string;
    failed: string;
    toolbarLabel: string;
    align: { left: { label: string; title: string }; center: { label: string; title: string }; right: { label: string; title: string } };
    widthFull: string;
    widthPercent: (percent: number) => string;
    originalSize: string;
    originalShort: string;
    resizeLeft: string;
    resizeRight: string;
    rejected: (fileName: string, reason: string) => string;
    /** 파일 이름이 없을 때 안내에 쓰는 말. */
    fallbackName: string;
    unsupportedType: string;
    emptyFile: string;
    tooLarge: (megabytes: number) => string;
  };
  math: {
    latexCompletionLabel: string;
    latexCompletionHint: string;
    latexInsertedTitle: string;
    blockLabel: string;
    inlineLabel: string;
    blockTitle: string;
    inlineTitle: string;
    preview: string;
    saveHintBlock: string;
    saveHintInline: string;
    completionHint: string;
    placeholder: string;
    libraryError: string;
    delete: string;
  };
  table: {
    toolbar: string;
    actions: Readonly<Record<"addRowBefore" | "addRowAfter" | "addColumnBefore" | "addColumnAfter" | "deleteRow" | "deleteColumn" | "mergeCells" | "splitCell" | "toggleHeaderRow" | "deleteTable", { label: string; title: string }>>;
  };
  toggle: { expandLabel: string; collapseLabel: string; expandTitle: string; collapseTitle: string };
}
