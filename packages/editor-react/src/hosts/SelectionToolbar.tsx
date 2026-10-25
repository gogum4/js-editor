import type { Editor } from "@tiptap/core";
import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";

import { BACKGROUND_COLOR_PALETTE, TEXT_COLOR_PALETTE } from "@gogum4/editor-schema/extras";
import { useEditorStrings } from "../context";

type Panel = "color" | "abbr" | "link" | null;

/** 막대에 보이는 서식 단추: 스키마에 그 마크가 있어야 보인다. */
const MARK_BUTTONS: ReadonlyArray<{ name: "bold" | "italic" | "strike" | "underline" | "code" | "highlight" | "superscript" | "subscript" | "insert"; face: ReactNode; toggle: string }> = [
  { name: "bold", face: <b>B</b>, toggle: "toggleBold" },
  { name: "italic", face: <i>I</i>, toggle: "toggleItalic" },
  { name: "strike", face: <s>S</s>, toggle: "toggleStrike" },
  { name: "underline", face: <u>U</u>, toggle: "toggleUnderline" },
  { name: "code", face: <code>{"</>"}</code>, toggle: "toggleCode" },
  { name: "highlight", face: <mark>H</mark>, toggle: "toggleHighlight" },
  { name: "superscript", face: <span>x²</span>, toggle: "toggleSuperscript" },
  { name: "subscript", face: <span>x₂</span>, toggle: "toggleSubscript" },
  { name: "insert", face: <ins>+</ins>, toggle: "toggleInsert" },
];

/** 확장이 더한 명령(색·약어·링크 …)은 소비자 쪽 타입에 보이지 않을 수 있어서, 이름으로 부르는 느슨한 체인으로 다룬다. */
type LooseChain = { [command: string]: (...args: unknown[]) => LooseChain } & { run: () => boolean };
const chainOf = (editor: Editor): LooseChain => editor.chain().focus() as unknown as LooseChain;

function runToggle(editor: Editor, command: string): void {
  chainOf(editor)[command]?.().run();
}

/** 선택한 글 위의 화면 좌표(선택의 위쪽 가운데). 선택이 없거나 화면 밖이면 null. */
function selectionAnchor(editor: Editor): { top: number; bottom: number; center: number } | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  try {
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    if (bottom < 0 || top > window.innerHeight) return null;
    return { top, bottom, center: (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2 };
  } catch {
    return null;
  }
}

const hrefOf = (input: string): string => (/^[a-z][a-z0-9+.-]*:/i.test(input) || input.startsWith("/") || input.startsWith("#") ? input : `https://${input}`);

/**
 * 글을 선택하면 그 위에 뜨는 서식 막대: 굵게·기울임·취소선·밑줄·코드, (켜 둔 추가 문법이 있으면) 하이라이트·위/아래 첨자·삽입, 글자색·배경색 팔레트, 약어 설명, 링크.
 * 스키마에 없는 서식의 단추는 보이지 않는다. 눌러도 에디터의 선택이 풀리지 않게 mousedown을 막고, 입력 칸(약어·링크)은 막대 안에서 포커스를 받는다.
 * 표 막대(`TableToolbar`)와 같은 방식으로 에디터 옆에 둔다: `<SelectionToolbar editor={editor} />`.
 */
export function SelectionToolbar({ editor }: { editor: Editor | null }) {
  const strings = useEditorStrings().selection;
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState("");
  const [inside, setInside] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      setPanel(null);
      refresh();
    };
    editor.on("selectionUpdate", onSelection);
    editor.on("transaction", refresh);
    editor.on("focus", refresh);
    editor.on("blur", refresh);
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      editor.off("selectionUpdate", onSelection);
      editor.off("transaction", refresh);
      editor.off("focus", refresh);
      editor.off("blur", refresh);
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
    };
  }, [editor]);

  if (!editor || !editor.isEditable) return null;
  // 코드 블록·수식 안, 또는 에디터와 막대 어디에도 포커스가 없으면 숨긴다.
  if (editor.isActive("codeBlock") || (!editor.isFocused && !inside)) return null;
  // 글 선택에서만 뜬다: 카드·이미지 같은 노드 선택(`node`)과 표의 셀 선택(`$anchorCell`)에는 자기 화면이 있다.
  const selection = editor.state.selection as unknown as { node?: unknown; $anchorCell?: unknown };
  if (selection.node !== undefined || selection.$anchorCell !== undefined) return null;
  const anchor = selectionAnchor(editor);
  if (anchor === null) return null;

  const marks = editor.schema.marks;
  const has = (name: string) => marks[name] !== undefined;
  const TOOLBAR_HEIGHT = 36;
  const top = anchor.top - TOOLBAR_HEIGHT - 8 >= 8 ? anchor.top - TOOLBAR_HEIGHT - 8 : Math.min(anchor.bottom + 8, window.innerHeight - TOOLBAR_HEIGHT - 8);
  const left = Math.max(8, Math.min(anchor.center - 160, window.innerWidth - 340));

  const open = (next: Panel, initial = "") => {
    setPanel((current) => (current === next ? null : next));
    setText(initial);
  };
  const close = () => {
    setPanel(null);
    editor.chain().focus().run();
  };
  const applyColor = (kind: "text" | "background", color: string | null) => {
    const chain = chainOf(editor);
    if (kind === "text") (color === null ? chain.unsetTextColor!() : chain.setTextColor!(color)).run();
    else (color === null ? chain.unsetBackgroundColor!() : chain.setBackgroundColor!(color)).run();
  };

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={strings.toolbar}
      data-testid="selection-toolbar"
      className="selection-toolbar"
      style={{ position: "fixed", top, left }}
      onFocus={() => setInside(true)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setInside(false);
      }}
      // 단추를 눌러도 에디터의 선택이 풀리지 않게 한다(입력 칸은 포커스를 받아야 하므로 제외).
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
    >
      <div className="selection-toolbar-row">
        {MARK_BUTTONS.filter((button) => has(button.name)).map((button) => (
          <button
            key={button.name}
            type="button"
            title={strings.marks[button.name]}
            aria-label={strings.marks[button.name]}
            aria-pressed={editor.isActive(button.name)}
            data-mark={button.name}
            onClick={() => runToggle(editor, button.toggle)}
          >
            {button.face}
          </button>
        ))}
        {has("textColor") && (
          <button type="button" title={strings.textColor} aria-label={strings.textColor} aria-expanded={panel === "color"} data-panel="color" onClick={() => open("color")}>
            <span className="selection-toolbar-color" style={{ color: editor.getAttributes("textColor").color ?? undefined }}>A</span>
          </button>
        )}
        {has("abbr") && (
          <button type="button" title={strings.abbr} aria-label={strings.abbr} aria-pressed={editor.isActive("abbr")} data-panel="abbr" onClick={() => open("abbr", editor.getAttributes("abbr").title ?? "")}>
            <abbr>Ab</abbr>
          </button>
        )}
        {has("link") && (
          <button type="button" title={strings.link} aria-label={strings.link} aria-pressed={editor.isActive("link")} data-panel="link" onClick={() => open("link", editor.getAttributes("link").href ?? "")}>
            🔗
          </button>
        )}
      </div>
      {panel === "color" && (
        <div className="selection-toolbar-panel" data-panel-body="color">
          {(
            [
              ["text", strings.textColor, TEXT_COLOR_PALETTE],
              ["background", strings.backgroundColor, BACKGROUND_COLOR_PALETTE],
            ] as const
          ).map(([kind, label, palette]) => (
            <div key={kind} className="selection-toolbar-swatches" role="group" aria-label={label}>
              <span className="selection-toolbar-label">{label}</span>
              {Object.entries(palette).map(([name, value]) => (
                <button key={name} type="button" className="selection-toolbar-swatch" title={`${label} · ${strings.colors[name] ?? name}`} aria-label={`${label} · ${strings.colors[name] ?? name}`} data-color={name} data-kind={kind} style={{ background: value }} onClick={() => applyColor(kind, value)} />
              ))}
              <button type="button" className="selection-toolbar-clear" title={`${label} · ${strings.clearColor}`} aria-label={`${label} · ${strings.clearColor}`} data-kind={kind} data-color="none" onClick={() => applyColor(kind, null)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {(panel === "abbr" || panel === "link") && (
        <form
          className="selection-toolbar-panel selection-toolbar-form"
          data-panel-body={panel}
          onSubmit={(event) => {
            event.preventDefault();
            const value = text.trim();
            if (panel === "abbr") {
              (value === "" ? chainOf(editor).extendMarkRange!("abbr").unsetAbbr!() : chainOf(editor).setAbbr!(value)).run();
            } else if (value === "") {
              chainOf(editor).extendMarkRange!("link").unsetLink!().run();
            } else {
              chainOf(editor).extendMarkRange!("link").setLink!({ href: hrefOf(value) }).run();
            }
            close();
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={panel === "abbr" ? strings.abbrPlaceholder : strings.linkPlaceholder}
            aria-label={panel === "abbr" ? strings.abbr : strings.link}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
          />
          <button type="submit">{strings.apply}</button>
        </form>
      )}
    </div>
  );
}
