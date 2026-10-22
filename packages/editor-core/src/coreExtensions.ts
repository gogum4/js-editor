import type { AnyExtension } from "@tiptap/core";
import type { ImportContext } from "@9um4/editor-markdown";
import Collaboration from "@tiptap/extension-collaboration";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import type * as Y from "yjs";

import { EditorPortsExtension } from "./ports/editorPorts";
import type { EditorPorts } from "./ports/types";
import { koStrings } from "./strings/ko";
import type { EditorStrings } from "./strings/types";
import { CodeCompletion } from "./completion/CodeCompletion";
import { BlockFlash } from "./extensions/BlockFlash";
import { BlockId } from "./extensions/BlockId";
import { Callout } from "./extensions/Callout";
import { CodeBlock } from "./extensions/CodeBlock";
import { TextAlign } from "./extensions/TextAlign";
import { Footnote } from "./footnote/Footnote";
import { MathBlock } from "./math/MathBlock";
import { MathInline } from "./math/MathInline";
import { LinkOpener } from "./extensions/LinkOpener";
import { MarkdownCopy, type MarkdownCopyOptions } from "./extensions/MarkdownCopy";
import { MarkdownPaste } from "./extensions/MarkdownPaste";
import { CodeHighlight } from "./highlight/CodeHighlight";
import { ImageBlock } from "./image/ImageBlock";
import { CORE_SLASH_ITEMS, localizeSlashItems, type SlashItem } from "./lib/slashItems";
import type { SlashHandlers } from "./slash/runSlashCommand";
import { SlashCommand } from "./slash/SlashCommand";
import { Toggle } from "./toggle/Toggle";

export interface CoreExtensionsOptions {
  ports?: EditorPorts;
  /** Markdown 붙여넣기 변환이 위키 링크·이미지를 찾는 방법(노트 앱이 페이지 제목으로 찾아 준다). 비우면 못 찾는 것으로 보고 글자로 둔다. */
  markdown?: Partial<ImportContext>;
  /**
   * 복사할 때 `text/plain`을 Markdown으로 채운다(기본 꺼짐; 켜려면 내보내기 옵션 객체를 준다, 빈 `{}`도 켜짐).
   * Obsidian 같은 일반 텍스트 편집기에 붙여도 문법이 유지되지만, 메모장에 붙이면 `**` 같은 기호가 보인다.
   */
  copyAsMarkdown?: MarkdownCopyOptions;
  /** 화면 글 사전. 기본은 한국어. */
  strings?: EditorStrings;
  /** 슬래시 메뉴 항목을 바꾼다(기본 항목을 받아 앱의 항목을 끼워 넣어 돌려준다). */
  slashItems?: (core: readonly SlashItem[]) => readonly SlashItem[];
  /** 앱이 더한 슬래시 항목의 동작. */
  slashHandlers?: SlashHandlers;
  /** 만든 확장 목록을 마지막으로 바꾼다(앱 확장을 **정해진 자리에** 끼워 넣을 때 쓴다 — 확장 순서는 HTML 읽기 우선순위에 영향을 준다). */
  transform?: (extensions: AnyExtension[]) => AnyExtension[];
}

/**
 * 위키(페이지 링크·페이지 블록·블록 링크 복사)를 **뺀** 에디터 확장 목록: 다른 앱도 쓸 수 있는 부분이다(docs/EDITOR-PACKAGE.md P2).
 * 노트 앱은 `editorExtensions.ts`가 여기에 위키 확장을 끼워 넣는다. `ydoc`를 주면 Yjs 연결(Collaboration)까지 포함한다.
 * Yjs가 없는 소비자(Markdown 한 칸짜리 편집기 등)는 `ydoc`에 null을 주면 된다 — 되돌리기/다시하기는 일반 history가 맡는다.
 * (`null`은 화면 없이 스키마만 읽는 쪽에서도 쓴다. 그때 history는 쓰이지 않을 뿐 스키마에는 영향이 없다.)
 */
export function createCoreExtensions(ydoc: Y.Doc | null, options: CoreExtensionsOptions = {}): AnyExtension[] {
  const strings = options.strings ?? koStrings;
  const localizedItems = localizeSlashItems(CORE_SLASH_ITEMS, strings.slash.items);
  const list: AnyExtension[] = [
    EditorPortsExtension.configure({ ports: options.ports ?? null, strings }),
    // Yjs가 있으면 되돌리기/다시하기는 Yjs UndoManager(Collaboration)가 맡고(ProseMirror history와 함께 쓰면 충돌한다),
    // 없으면 StarterKit의 history를 쓴다. 코드 블록은 아래의 확장 버전을 쓴다.
    StarterKit.configure({
      undoRedo: ydoc ? false : {},
      codeBlock: false,
      link: {
        // 클릭하면 바로 이동하지 않는다. Ctrl/⌘+클릭으로만 연다 (LinkOpener).
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        // `target`을 비워 둔다. TipTap 기본값(_blank)이 남으면 opener 플러그인이 그냥 클릭에도 링크를 연다.
        HTMLAttributes: { target: null, rel: "noopener noreferrer nofollow" },
      },
    }),
    LinkOpener,
    MarkdownPaste.configure({ context: options.markdown ?? {} }),
    MarkdownCopy.configure({ markdown: options.copyAsMarkdown ?? null }),
    BlockId,
    BlockFlash,
    CodeBlock,
    CodeHighlight,
    CodeCompletion,
    Callout,
    TextAlign,
    Toggle,
    // 표: 열 너비 조절(`colwidth`)과 셀 병합(`colspan`·`rowspan`)은 셀 속성으로 저장한다. 셀 안에는 문단만 둔다(목록·표 중첩 없음).
    Table.configure({ resizable: true, cellMinWidth: 60 }),
    TableRow,
    TableHeader.extend({ content: "paragraph+" }),
    TableCell.extend({ content: "paragraph+" }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({
      // 비어 있는 줄에 커서가 있을 때만 안내를 보여 준다.
      placeholder: ({ node }) => {
        if (node.type.name === "heading") return strings.placeholder.heading;
        if (node.type.name === "codeBlock") return "";
        return strings.placeholder.empty;
      },
      showOnlyCurrent: true,
      includeChildren: true,
    }),
    ImageBlock,
    Footnote,
    MathInline,
    MathBlock,
    SlashCommand.configure({ items: options.slashItems?.(localizedItems) ?? localizedItems, handlers: options.slashHandlers ?? {} }),
    ...(ydoc ? [Collaboration.configure({ document: ydoc })] : []),
  ];
  return options.transform ? options.transform(list) : list;
}
