import { TaskItem } from "@tiptap/extension-list";

import { nextTaskStatus, normalizeTaskStatus, TASK_STATUSES, type TaskStatus } from "@gogum4/editor-schema/extras";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    taskStatus: {
      /** 커서(또는 선택)가 있는 할 일 항목들의 상태를 정한다. null이면 상태를 지운다. 상태가 있는 항목은 완료 표시를 끈다. */
      setTaskStatus: (status: TaskStatus | null) => ReturnType;
      /** 상태를 돌려 가며 바꾼다(없음 → 진행 중 → 미룸 → 질문 → 중요 → 취소 → 없음). */
      cycleTaskStatus: () => ReturnType;
    };
  }
}

/**
 * 상태가 있는 할 일 항목: 완료 여부(`checked`) 말고 `status` 한 글자(`/` 진행 중 · `-` 취소 · `>` 미룸 · `?` 질문 · `!` 중요)를 더 가진다.
 * 상태를 바꾸는 방법: 체크 상자를 **Alt+클릭**하거나 단축키 Ctrl/⌘+Alt+Enter(돌려 가며), 슬래시 명령 대신 명령 \`setTaskStatus\`.
 * Markdown은 \`- [/] 글\`이다(Obsidian 테마·Tasks 플러그인과 같다).
 */
export const TaskItemStatus = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      status: {
        default: null,
        parseHTML: (element: HTMLElement) => normalizeTaskStatus(element.getAttribute("data-status-char")),
        renderHTML: (attributes: Record<string, unknown>) => {
          const status = normalizeTaskStatus(attributes.status);
          return status === null ? {} : { "data-status-char": status, "data-status": TASK_STATUSES[status] };
        },
      },
    };
  },

  addCommands() {
    const apply = (decide: (current: unknown) => TaskStatus | null) => () => ({ state, tr, dispatch }: { state: import("@tiptap/pm/state").EditorState; tr: import("@tiptap/pm/state").Transaction; dispatch?: (tr: import("@tiptap/pm/state").Transaction) => void }) => {
      const type = state.schema.nodes[this.name];
      if (!type) return false;
      const targets: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type === type) targets.push({ pos, attrs: node.attrs });
      });
      if (targets.length === 0) return false;
      if (dispatch) {
        // 선택한 항목이 여럿이면 첫 항목의 다음 상태를 모두에게 적용한다(항목마다 따로 돌리면 뒤섞인다).
        const next = decide(targets[0]!.attrs.status);
        for (const { pos, attrs } of targets) tr.setNodeMarkup(pos, undefined, { ...attrs, status: next, checked: next !== null ? false : attrs.checked });
        dispatch(tr);
      }
      return true;
    };
    return {
      setTaskStatus: (status: TaskStatus | null) => apply(() => status)(),
      cycleTaskStatus: () => apply(nextTaskStatus)(),
    };
  },

  addKeyboardShortcuts() {
    return { ...this.parent?.(), "Mod-Alt-Enter": () => this.editor.commands.cycleTaskStatus() };
  },

  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return (props) => {
      const view = parent(props);
      const dom = view.dom as HTMLElement;
      const reflect = (status: unknown) => {
        const value = normalizeTaskStatus(status);
        if (value === null) {
          delete dom.dataset.status;
          delete dom.dataset.statusChar;
        } else {
          dom.dataset.status = TASK_STATUSES[value];
          dom.dataset.statusChar = value;
        }
      };
      reflect(props.node.attrs.status);

      // Alt+클릭: 체크 상태는 건드리지 않고 상태만 돌린다. 캡처 단계에서 가로채 기본 체크 토글(change)이 일어나지 않게 한다.
      dom.addEventListener(
        "click",
        (event) => {
          if (!event.altKey || !(event.target instanceof HTMLInputElement) || !props.editor.isEditable) return;
          event.preventDefault();
          event.stopPropagation();
          const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
          if (typeof pos !== "number") return;
          props.editor
            .chain()
            .command(({ tr }) => {
              const node = tr.doc.nodeAt(pos);
              if (!node) return false;
              const next = nextTaskStatus(node.attrs.status);
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, status: next, checked: next !== null ? false : node.attrs.checked });
              return true;
            })
            .run();
        },
        true,
      );

      const update = view.update?.bind(view);
      return {
        ...view,
        dom: view.dom,
        contentDOM: view.contentDOM,
        update: (node, decorations, innerDecorations) => {
          const ok = update ? update(node, decorations, innerDecorations) : node.type === props.node.type;
          if (ok) reflect(node.attrs.status);
          return ok;
        },
      };
    };
  },
});
