import type { Editor } from "@tiptap/core";

import type { EditorStrings } from "../strings/index";

/** 표 편집 막대의 동작: 이름(사전의 `table.actions` 키), 실행, 지금 할 수 있는지. 표 명령의 타입은 `@tiptap/extension-table`이 에디터에 더한다. */
export interface TableAction {
  key: keyof EditorStrings["table"]["actions"];
  run: (editor: Editor) => boolean;
  can: (editor: Editor) => boolean;
  /** 지우는 동작(붉게 보인다). */
  danger?: boolean;
}

export const TABLE_ACTIONS: ReadonlyArray<TableAction> = [
  { key: "addRowBefore", run: (e) => e.chain().focus().addRowBefore().run(), can: (e) => e.can().addRowBefore() },
  { key: "addRowAfter", run: (e) => e.chain().focus().addRowAfter().run(), can: (e) => e.can().addRowAfter() },
  { key: "addColumnBefore", run: (e) => e.chain().focus().addColumnBefore().run(), can: (e) => e.can().addColumnBefore() },
  { key: "addColumnAfter", run: (e) => e.chain().focus().addColumnAfter().run(), can: (e) => e.can().addColumnAfter() },
  { key: "deleteRow", run: (e) => e.chain().focus().deleteRow().run(), can: (e) => e.can().deleteRow(), danger: true },
  { key: "deleteColumn", run: (e) => e.chain().focus().deleteColumn().run(), can: (e) => e.can().deleteColumn(), danger: true },
  { key: "mergeCells", run: (e) => e.chain().focus().mergeCells().run(), can: (e) => e.can().mergeCells() },
  { key: "splitCell", run: (e) => e.chain().focus().splitCell().run(), can: (e) => e.can().splitCell() },
  { key: "toggleHeaderRow", run: (e) => e.chain().focus().toggleHeaderRow().run(), can: (e) => e.can().toggleHeaderRow() },
  { key: "deleteTable", run: (e) => e.chain().focus().deleteTable().run(), can: (e) => e.can().deleteTable(), danger: true },
];
