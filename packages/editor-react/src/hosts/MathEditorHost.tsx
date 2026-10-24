import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  commandEdit,
  commandQuery,
  deletePairEdit,
  type Edit,
  MAX_AUTO_CANDIDATES,
  MAX_MANUAL_CANDIDATES,
  openPairEdit,
  shouldAutoOpen,
  skipCloserEdit,
  suggest,
  tabJump,
} from "@gogum4/editor-core";
import type { LatexCommand } from "@gogum4/editor-core";
import { MAX_LATEX_CHARS } from "@gogum4/editor-core";
import { useMathHtml } from "../hooks/useMathHtml";
import { computeMenuPosition } from "@gogum4/editor-schema/menuPosition";
import { LatexCompletionMenu } from "../menus/LatexCompletionMenu";
import { type MathEditState, setMathLatex } from "@gogum4/editor-core";
import { closeMathEditor, useMathEditStore } from "../stores/mathEditStore";
import { useEditorStrings } from "../context";

const WIDTH = 420;
/** 후보 목록(설명 칸 포함)이 차지하는 높이. 아래에 이만큼 자리가 없으면 위에 띄운다. */
const MENU_HEIGHT = 300;

/** 후보를 닫은 자리를 기억하는 키(같은 `\글자`에서는 다시 열지 않는다). */
const queryKey = (start: number, prefix: string) => `${start}:${prefix}`;

/**
 * 입력창의 글자를 바꾼다. 되돌리기(Ctrl+Z) 기록이 남도록 가능하면 브라우저의 입력 명령(`insertText`)을 쓰고,
 * 안 되면 직접 바꾸고 `input` 이벤트를 보낸다. 끝난 뒤 커서를 `edit.caret`에 둔다.
 */
function applyToArea(area: HTMLTextAreaElement, edit: Edit): void {
  area.focus();
  if (edit.insert === "" && edit.from === edit.to) {
    area.setSelectionRange(edit.caret, edit.caret);
    return;
  }
  area.setSelectionRange(edit.from, edit.to);
  const done = edit.insert !== "" && document.execCommand("insertText", false, edit.insert);
  if (!done) {
    area.setRangeText(edit.insert, edit.from, edit.to, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
  area.setSelectionRange(edit.caret, edit.caret);
}

/**
 * 수식을 고치는 창 (앱 전체에서 하나): 위에 LaTeX를 적고 아래에 바로 그려 본다.
 * 인라인 수식은 Enter로, 블록 수식은 Ctrl/⌘+Enter로 저장하고(블록은 Enter가 줄바꿈), 바깥을 누르면 저장, Esc는 취소한다.
 * 내용을 비우고 확정하거나 방금 만든 수식을 Esc로 닫으면 수식이 지워진다. **한글 조합 중의 Enter·Esc는 입력기의 키라서 무시한다.**
 *
 * 입력 보조: `\`와 두 글자(한글 낱말은 한 글자)를 치면 LaTeX 명령 후보와 설명이 뜨고(Ctrl+Space는 전체 목록),
 * 후보가 열려 있을 때는 ↑↓ Enter/Tab Esc가 후보 목록의 키다. `{ ( [`는 짝을 같이 넣고, Tab은 닫는 괄호를 건너뛴다.
 */
export function MathEditorHost() {
  const edit = useMathEditStore((s) => s.edit);
  return edit ? <MathEditor key={`${edit.pos}:${edit.original}`} edit={edit} /> : null;
}

function MathEditor({ edit }: { edit: MathEditState }) {
  const strings = useEditorStrings().math;
  const cardRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const finished = useRef(false);
  const [draft, setDraft] = useState(edit.original);
  const { html, error } = useMathHtml(draft, edit.display);

  // 입력 보조 상태: 커서(선택) 위치, Ctrl+Space로 연 목록인지, 닫은 자리, 활성 후보, 목록을 위에 띄울지.
  const [sel, setSel] = useState({ start: edit.original.length, end: edit.original.length });
  const [manual, setManual] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);

  const query = sel.start === sel.end ? commandQuery(draft, sel.start) : null;
  const wantsMenu = query !== null && (manual || shouldAutoOpen(query)) && dismissed !== queryKey(query.start, query.prefix);
  const candidates: LatexCommand[] = wantsMenu ? suggest(query.prefix, manual ? MAX_MANUAL_CANDIDATES : MAX_AUTO_CANDIDATES) : [];
  // 후보가 하나뿐이고 이미 그 이름을 다 쳤으면 더 완성할 것이 없다(Enter가 저장이 되게 연다).
  const complete = candidates.length === 1 && query !== null && candidates[0]!.name === query.prefix;
  const items = complete ? [] : candidates;
  const menuOpen = items.length > 0;

  // 같은 조각을 고치는 동안 활성 후보를 유지하고, 조각이 바뀌면 맨 위부터 시작한다.
  useEffect(() => {
    setActive(0);
  }, [query?.start, query?.prefix, manual]);
  // 목록이 사라지면 Ctrl+Space로 연 상태도 끝낸다.
  useEffect(() => {
    if (query === null) setManual(false);
  }, [query]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    const position = computeMenuPosition(edit.rect, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
    card.style.visibility = "visible";
    const area = areaRef.current;
    if (area) {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    }
    // 처음 한 번만 자리를 잡는다(그림이 바뀔 때마다 창이 움직이지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 목록이 열릴 때 아래에 자리가 모자라면 위에 띄운다.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const area = areaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setAbove(below < MENU_HEIGHT && rect.top > below);
  }, [menuOpen]);

  const finish = (apply: () => void) => {
    if (finished.current) return;
    finished.current = true;
    apply();
    closeMathEditor();
    edit.editor.commands.focus();
  };
  const commit = (value: string) => finish(() => void setMathLatex(edit.editor, edit.pos, value));
  // 방금 만든(내용이 빈) 수식을 취소하면 지운다. 이미 내용이 있던 수식은 그대로 둔다.
  const cancel = () => finish(() => void (edit.original === "" ? setMathLatex(edit.editor, edit.pos, "") : undefined));
  const remove = () => finish(() => void setMathLatex(edit.editor, edit.pos, ""));

  /** 글자를 바꾸고 화면 상태(커서)를 맞춘다. */
  const apply = (area: HTMLTextAreaElement, change: Edit) => {
    applyToArea(area, change);
    setSel({ start: change.caret, end: change.caret });
  };

  /** 고른 후보를 `\조각` 자리에 넣는다. 넣은 뒤 같은 이름이 남아도 목록이 다시 열리지 않게 닫은 자리로 적어 둔다. */
  const pick = (command: LatexCommand) => {
    const area = areaRef.current;
    if (!area) return;
    const current = commandQuery(area.value, area.selectionStart);
    if (!current) return;
    const change = commandEdit(current, command);
    apply(area, change);
    const after = commandQuery(area.value.slice(0, change.from) + change.insert + area.value.slice(change.to), change.caret);
    setDismissed(after ? queryKey(after.start, after.prefix) : null);
    setManual(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const area = e.currentTarget;

    if (menuOpen && query) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const chosen = items[active];
        if (chosen) pick(chosen);
        return;
      }
      if (e.key === "Escape") {
        // 목록만 닫는다(창은 그대로).
        e.preventDefault();
        setDismissed(queryKey(query.start, query.prefix));
        setManual(false);
        return;
      }
    }

    // Ctrl+Space: 전체 목록. 커서 앞에 `\`가 없으면 하나 넣고 시작한다.
    if (e.ctrlKey && e.key === " " && area.selectionStart === area.selectionEnd) {
      e.preventDefault();
      if (!commandQuery(area.value, area.selectionStart)) {
        apply(area, { from: area.selectionStart, to: area.selectionStart, insert: "\\", caret: area.selectionStart + 1 });
      }
      setDismissed(null);
      setManual(true);
      return;
    }

    if (e.key === "Enter" && (edit.display ? e.ctrlKey || e.metaKey : !e.shiftKey)) {
      e.preventDefault();
      commit(area.value);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const { selectionStart: start, selectionEnd: end, value } = area;
    let change: Edit | null = null;
    if (e.key === "{" || e.key === "(" || e.key === "[") change = openPairEdit(value, start, end, e.key);
    else if (e.key === "}" || e.key === ")" || e.key === "]") change = skipCloserEdit(value, start, end, e.key);
    else if (e.key === "Backspace") change = deletePairEdit(value, start, end);
    else if (e.key === "Tab" && !e.shiftKey && start === end) {
      const to = tabJump(value, start);
      if (to !== null) change = { from: start, to: start, insert: "", caret: to };
    }
    if (change) {
      e.preventDefault();
      apply(area, change);
    }
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={edit.display ? strings.blockLabel : strings.inlineLabel}
      data-testid="math-editor"
      style={{ position: "fixed", left: 0, top: 0, width: WIDTH, zIndex: 70, visibility: "hidden" }}
      className="md-card"
    >
      <p className="md-card-title">{edit.display ? strings.blockTitle : strings.inlineTitle}</p>
      <div className="md-card-anchor">
        <textarea
          ref={areaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSel({ start: e.target.selectionStart, end: e.target.selectionEnd });
          }}
          onSelect={(e) => setSel({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
          rows={edit.display ? 4 : 2}
          maxLength={MAX_LATEX_CHARS}
          spellCheck={false}
          placeholder={edit.display ? "\\int_0^1 x^2\\,dx" : "x^2 + y^2"}
          aria-label="LaTeX"
          aria-autocomplete="list"
          aria-expanded={menuOpen}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          className="md-card-textarea md-card-textarea-mono"
        />
        {menuOpen && <LatexCompletionMenu items={items} active={active} above={above} onPick={pick} onHover={setActive} />}
      </div>
      <div
        data-testid="math-preview"
        className="md-math-preview"
      >
        {draft.trim() === "" ? (
          <span className="md-math-preview-note">{strings.preview}</span>
        ) : html === null ? (
          <span className="md-math-preview-note">…</span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
      {error && <p className="md-card-error">{error}</p>}
      <div className="md-card-footer">
        <span>
          {edit.display ? strings.saveHintBlock : strings.saveHintInline} · \ {strings.completionHint}
        </span>
        <button
          type="button"
          // 눌러도 입력창의 포커스가 빠지지 않게(blur로 먼저 저장되지 않게) mousedown을 막는다.
          onMouseDown={(e) => e.preventDefault()}
          onClick={remove}
          className="md-card-delete"
        >
          {strings.delete}
        </button>
      </div>
    </div>
  );
}
