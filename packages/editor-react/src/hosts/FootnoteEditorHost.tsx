import { useLayoutEffect, useRef } from "react";

import { computeMenuPosition } from "@9um4/editor-schema/menuPosition";
import { type FootnoteEditState, setFootnoteText } from "@9um4/editor-core";
import { closeFootnoteEditor, useFootnoteEditStore } from "../stores/footnoteEditStore";
import { useEditorStrings } from "../context";

const WIDTH = 320;

/**
 * 각주 내용을 고치는 작은 창 (앱 전체에서 하나). Enter 또는 바깥을 누르면 저장, Shift+Enter는 줄바꿈, Esc는 취소.
 * 내용을 비우고 확정하면 각주가 지워지고, 방금 만든 각주를 Esc로 닫아도 지워진다. **한글 조합 중의 Enter·Esc는 입력기의 키라서 무시한다.**
 */
export function FootnoteEditorHost() {
  const edit = useFootnoteEditStore((s) => s.edit);
  return edit ? <FootnoteEditor key={`${edit.pos}:${edit.original}`} edit={edit} /> : null;
}

function FootnoteEditor({ edit }: { edit: FootnoteEditState }) {
  const strings = useEditorStrings().footnote;
  const cardRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // 확정·취소는 한 번만 일어난다(Enter 뒤에 이어지는 blur로 두 번 저장되지 않게).
  const finished = useRef(false);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    const position = computeMenuPosition(edit.rect, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
    card.style.visibility = "visible";
    areaRef.current?.focus();
    areaRef.current?.setSelectionRange(areaRef.current.value.length, areaRef.current.value.length);
  }, [edit]);

  const finish = (apply: () => void) => {
    if (finished.current) return;
    finished.current = true;
    apply();
    closeFootnoteEditor();
    edit.editor.commands.focus();
  };

  const commit = (value: string) => finish(() => void setFootnoteText(edit.editor, edit.pos, value));
  // 방금 만든(내용이 빈) 각주를 취소하면 지운다. 이미 내용이 있던 각주는 그대로 둔다.
  const cancel = () => finish(() => void (edit.original === "" ? setFootnoteText(edit.editor, edit.pos, "") : undefined));
  const remove = () => finish(() => void setFootnoteText(edit.editor, edit.pos, ""));

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={strings.editorLabel(edit.number)}
      data-testid="footnote-editor"
      style={{ position: "fixed", left: 0, top: 0, width: WIDTH, zIndex: 70, visibility: "hidden" }}
      className="rounded-lg border border-neutral-200 bg-white p-3 shadow-lg"
    >
      <p className="mb-1.5 text-xs font-medium text-neutral-500">{strings.editorLabel(edit.number)}</p>
      <textarea
        ref={areaRef}
        defaultValue={edit.original}
        rows={3}
        maxLength={2000}
        placeholder={strings.editorPlaceholder}
        aria-label={strings.editorPlaceholder}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit(e.currentTarget.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="w-full resize-none rounded border border-neutral-200 px-2 py-1 text-sm text-neutral-800 outline-none focus:border-neutral-400"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
        <span>{strings.editorHint}</span>
        <button
          type="button"
          // 눌러도 입력창의 포커스가 빠지지 않게(blur로 먼저 저장되지 않게) mousedown을 막는다.
          onMouseDown={(e) => e.preventDefault()}
          onClick={remove}
          className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
        >
          {strings.delete}
        </button>
      </div>
    </div>
  );
}
