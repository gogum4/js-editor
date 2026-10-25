import type { Editor } from "@tiptap/core";
import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";

import { runSlashCommand, type SlashHandlers, type SlashItem } from "@gogum4/editor-core";
import { useEditorStrings } from "../context";

/** 서식 막대의 글자 서식 단추: 스키마에 그 마크가 있어야 보인다. */
const MARKS: ReadonlyArray<{ name: "bold" | "italic" | "strike" | "underline" | "code"; face: ReactNode; toggle: string }> = [
  { name: "bold", face: <b>B</b>, toggle: "toggleBold" },
  { name: "italic", face: <i>I</i>, toggle: "toggleItalic" },
  { name: "strike", face: <s>S</s>, toggle: "toggleStrike" },
  { name: "underline", face: <u>U</u>, toggle: "toggleUnderline" },
  { name: "code", face: <code>{"</>"}</code>, toggle: "toggleCode" },
];

/** 막대에 바로 놓는 블록(슬래시 항목 id). 나머지는 "삽입" 메뉴에 들어간다. */
const BLOCK_BUTTONS: ReadonlyArray<{ id: string; face: string; node: string }> = [
  { id: "bulletList", face: "•", node: "bulletList" },
  { id: "orderedList", face: "1.", node: "orderedList" },
  { id: "taskList", face: "☑", node: "taskList" },
  { id: "blockquote", face: "❝", node: "blockquote" },
];

/** 블록 종류 선택에 들어가는 항목. */
const BLOCK_TYPES = ["paragraph", "heading1", "heading2", "heading3"] as const;
const IN_BAR = new Set<string>([...BLOCK_TYPES, ...BLOCK_BUTTONS.map((button) => button.id)]);

type LooseChain = { [command: string]: (...args: unknown[]) => LooseChain } & { run: () => boolean };
const chainOf = (editor: Editor): LooseChain => editor.chain().focus() as unknown as LooseChain;

/** `/` 메뉴 확장이 가진 항목과 앱의 동작. 막대는 슬래시 메뉴와 **같은 항목·같은 동작**을 쓴다(앱이 더한 항목도 그대로 보인다). */
function slashConfig(editor: Editor): { items: readonly SlashItem[]; handlers: SlashHandlers } | null {
  const extension = editor.extensionManager.extensions.find((candidate) => candidate.name === "slashCommand");
  const options = extension?.options as { items?: readonly SlashItem[]; handlers?: SlashHandlers } | undefined;
  return options?.items ? { items: options.items, handlers: options.handlers ?? {} } : null;
}

/** 지금 커서가 있는 블록의 종류(블록 종류 선택의 값). */
function currentBlockType(editor: Editor): string {
  for (let level = 1; level <= 3; level += 1) if (editor.isActive("heading", { level })) return `heading${level}`;
  return editor.isActive("paragraph") ? "paragraph" : "";
}

/**
 * 에디터 위에 늘 보이는 서식 막대: 실행 취소·다시 실행, 블록 종류(본문·제목 1~3), 굵게·기울임·취소선·밑줄·코드, 목록·체크리스트·인용, "삽입" 메뉴.
 * "삽입"은 `/` 메뉴의 나머지 항목(표·이미지·코드 블록·수식·콜아웃 …, 앱이 더한 항목 포함)을 마우스로 고르게 한다 — 슬래시 메뉴를 모르는 사람을 위한 것이다.
 * 스키마에 없는 서식·블록의 단추는 보이지 않는다. 눌러도 에디터의 선택이 풀리지 않게 mousedown을 막는다(블록 종류 선택만 포커스를 받는다).
 * 에디터 바로 위에 둔다: `<FixedToolbar editor={editor} />`. 위치는 `position: sticky`라 스크롤하는 칸 안에서 위에 붙는다.
 */
export function FixedToolbar({ editor }: { editor: Editor | null }) {
  const strings = useEditorStrings();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    editor.on("update", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
      editor.off("update", refresh);
    };
  }, [editor]);

  // 메뉴 밖을 누르거나 Esc를 누르면 닫는다.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!editor || !editor.isEditable) return null;

  const config = slashConfig(editor);
  const labelOf = (item: SlashItem) => strings.slash.items[item.id]?.label ?? item.label;
  const itemById = (id: string) => config?.items.find((item) => item.id === id);
  const run = (id: string) => {
    if (!config) return;
    // 줄에 입력한 `/검색어`가 없으므로 지울 범위는 비어 있다.
    const { from } = editor.state.selection;
    runSlashCommand(editor, { from, to: from }, id, config.handlers);
  };
  const hasMark = (name: string) => editor.schema.marks[name] !== undefined;
  const hasNode = (name: string) => editor.schema.nodes[name] !== undefined;
  const inCode = editor.isActive("codeBlock");
  const blockTypes = BLOCK_TYPES.filter((id) => itemById(id));
  const blockValue = currentBlockType(editor);
  const insertItems = (config?.items ?? []).filter((item) => !IN_BAR.has(item.id));

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={strings.fixed.toolbar}
      data-testid="fixed-toolbar"
      className="fixed-toolbar"
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLSelectElement)) event.preventDefault();
      }}
    >
      <button type="button" title={strings.fixed.undo} aria-label={strings.fixed.undo} data-action="undo" onClick={() => chainOf(editor).undo?.().run()}>
        ↶
      </button>
      <button type="button" title={strings.fixed.redo} aria-label={strings.fixed.redo} data-action="redo" onClick={() => chainOf(editor).redo?.().run()}>
        ↷
      </button>
      <span className="fixed-toolbar-sep" aria-hidden />
      {blockTypes.length > 0 && (
        <select
          aria-label={strings.fixed.blockType}
          data-action="block-type"
          value={blockValue}
          disabled={inCode}
          onChange={(event) => {
            run(event.target.value);
            editor.commands.focus();
          }}
        >
          {blockValue === "" && <option value="" />}
          {blockTypes.map((id) => (
            <option key={id} value={id}>
              {labelOf(itemById(id)!)}
            </option>
          ))}
        </select>
      )}
      <span className="fixed-toolbar-sep" aria-hidden />
      {MARKS.filter((mark) => hasMark(mark.name)).map((mark) => (
        <button
          key={mark.name}
          type="button"
          title={strings.selection.marks[mark.name]}
          aria-label={strings.selection.marks[mark.name]}
          aria-pressed={editor.isActive(mark.name)}
          disabled={inCode && mark.name !== "code"}
          data-mark={mark.name}
          onClick={() => chainOf(editor)[mark.toggle]?.().run()}
        >
          {mark.face}
        </button>
      ))}
      <span className="fixed-toolbar-sep" aria-hidden />
      {BLOCK_BUTTONS.filter((button) => hasNode(button.node) && itemById(button.id)).map((button) => (
        <button
          key={button.id}
          type="button"
          title={labelOf(itemById(button.id)!)}
          aria-label={labelOf(itemById(button.id)!)}
          aria-pressed={editor.isActive(button.node)}
          data-block={button.id}
          onClick={() => run(button.id)}
        >
          {button.face}
        </button>
      ))}
      {insertItems.length > 0 && (
        <div className="fixed-toolbar-insert">
          <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} data-action="insert" onClick={() => setMenuOpen((open) => !open)}>
            + {strings.fixed.insert}
          </button>
          {menuOpen && (
            <ul role="menu" aria-label={strings.fixed.insertMenu} className="fixed-toolbar-menu">
              {insertItems.map((item) => (
                <li key={item.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    data-item={item.id}
                    title={strings.slash.items[item.id]?.description ?? item.description}
                    onClick={() => {
                      setMenuOpen(false);
                      run(item.id);
                    }}
                  >
                    {labelOf(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
