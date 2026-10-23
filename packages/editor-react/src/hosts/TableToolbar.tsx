import type { Editor } from "@tiptap/core";
import { useEffect, useReducer } from "react";

import { useEditorStrings } from "../context";
import { TABLE_ACTIONS } from "@9um4-utils/editor-core";

/** 커서(또는 선택)가 놓인 표의 DOM 요소. 표 밖이면 null. */
function currentTable(editor: Editor): HTMLTableElement | null {
  const node = editor.view.domAtPos(editor.state.selection.from).node;
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  return element?.closest("table") ?? null;
}

/**
 * 표 안에 커서가 있을 때 표 위에 뜨는 편집 막대: 행·열 추가와 삭제, 셀 병합과 분할, 머리글 행, 표 삭제.
 * 셀 병합은 셀을 끌어서 여러 개 고른 뒤에 쓴다. 열 너비는 열 경계를 끌어서 바꾼다(막대 없이도 된다).
 * 눌러도 에디터의 선택이 풀리지 않게 mousedown을 막는다.
 */
export function TableToolbar({ editor }: { editor: Editor | null }) {
  const strings = useEditorStrings().table;
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    // 스크롤이나 창 크기가 바뀌면 표 위치가 달라진다.
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
    };
  }, [editor]);

  if (!editor || !editor.isEditable || !editor.isActive("table")) return null;
  const table = currentTable(editor);
  if (!table) return null;
  const rect = table.getBoundingClientRect();
  // 표가 화면 밖에 있으면 막대도 숨긴다.
  if (rect.bottom < 0 || rect.top > window.innerHeight) return null;

  const TOOLBAR_HEIGHT = 34;
  const top = rect.top - TOOLBAR_HEIGHT - 6 >= 8 ? rect.top - TOOLBAR_HEIGHT - 6 : Math.min(rect.bottom + 6, window.innerHeight - TOOLBAR_HEIGHT - 8);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 560));

  return (
    <div
      role="toolbar"
      aria-label={strings.toolbar}
      data-testid="table-toolbar"
      className="table-toolbar"
      style={{ position: "fixed", top, left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {TABLE_ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          title={strings.actions[action.key].title}
          disabled={!action.can(editor)}
          data-table-action={action.key}
          className={action.danger ? "is-danger" : undefined}
          onClick={() => action.run(editor)}
        >
          {strings.actions[action.key].label}
        </button>
      ))}
    </div>
  );
}
