import CodeBlockBase, { type CodeBlockOptions } from "@tiptap/extension-code-block";
import { Plugin, TextSelection } from "@tiptap/pm/state";

import { normalizeCodeMeta } from "@gogum4/editor-schema/codeMeta";
import { enterEdit, shouldDeletePair, typedCharAction } from "./codeAssist";
import { isCompletionOpen } from "../completion/CodeCompletion";
import { computeIndentEdits } from "./codeIndent";
import type { NodeViewOptions } from "../ports/ui";

/**
 * 기본 코드 블록에 언어 선택·복사 막대(`CodeBlockView`)를 붙이고, 코드를 쓰기 편하게 한 것:
 * Tab 들여쓰기, 괄호·따옴표 자동 닫기, Enter 자동 들여쓰기.
 * 색은 문서와 별개의 장식으로 입히므로(`CodeHighlight`) 저장되는 내용은 기본 코드 블록과 같다.
 */
export const CodeBlock = CodeBlockBase.extend<CodeBlockOptions & NodeViewOptions>({
  // 목록·할 일 안에 코드 블록이 있어도 그쪽의 Tab(항목 들여쓰기)보다 먼저 받는다.
  priority: 200,

  // 노드 뷰는 소비자가 주입한다(`createCoreExtensions({ views })`). 없으면 renderHTML 기본 렌더.
  addOptions() {
    return { ...(this.parent?.() as CodeBlockOptions), nodeView: null };
  },

  addNodeView() {
    return this.options.nodeView;
  },

  // 펜스의 언어 뒤 글(`title="a.ts" {2,4}`)을 원문 그대로 둔다. 뜻은 `parseCodeMeta`가 푼다.
  addAttributes() {
    return {
      ...this.parent?.(),
      meta: {
        default: null,
        parseHTML: (element: HTMLElement) => normalizeCodeMeta(element.getAttribute("data-meta")),
        renderHTML: (attributes: Record<string, unknown>) => {
          const meta = normalizeCodeMeta(attributes.meta);
          return meta === null ? {} : { "data-meta": meta };
        },
      },
    };
  },

  addKeyboardShortcuts() {
    const base = this.parent?.() ?? {};

    /** 커서나 선택이 코드 블록 하나 안에 있으면 그 블록 글자와 선택(블록 기준 오프셋)을 돌려준다. */
    const inCodeBlock = () => {
      const { state, view } = this.editor;
      const { $from, $to, from, to } = state.selection;
      // 한글 조합 중의 키는 입력기의 것이므로 건드리지 않는다.
      if (view.composing) return null;
      if ($from.parent.type.name !== this.name || !$from.sameParent($to)) return null;
      const blockStart = $from.start();
      return { text: $from.parent.textContent, from, to, start: from - blockStart, end: to - blockStart };
    };

    const indent = (outdent: boolean) => () => {
      const block = inCodeBlock();
      if (!block) return false;
      // 자동완성 메뉴가 열려 있으면 Tab은 메뉴가 고르는 키다.
      if (!outdent && isCompletionOpen(this.editor.state)) return false;

      const { state, view } = this.editor;
      const blockStart = block.from - block.start;
      const edits = computeIndentEdits(block.text, block.start, block.end, outdent);
      if (edits.length > 0) {
        const tr = state.tr;
        // 뒤에서부터 적용해야 앞쪽 수정의 위치가 밀리지 않는다.
        for (const edit of [...edits].reverse()) {
          const pos = blockStart + edit.pos;
          if (edit.insert) tr.replaceWith(pos, pos + edit.remove, state.schema.text(edit.insert));
          else tr.delete(pos, pos + edit.remove);
        }
        view.dispatch(tr.scrollIntoView());
      }
      // 고칠 게 없어도(예: 이미 맨 앞인 줄에서 Shift+Tab) true로 막아, 포커스가 에디터 밖으로 빠지지 않게 한다.
      return true;
    };

    return {
      ...base,
      Tab: indent(false),
      "Shift-Tab": indent(true),

      // 세 번 Enter로 블록을 빠져나가는 기본 동작을 먼저 본 뒤, 앞 줄의 들여쓰기를 이어 간다.
      Enter: (props) => {
        if (isCompletionOpen(this.editor.state)) return false;
        if (base.Enter?.(props)) return true;
        const block = inCodeBlock();
        if (!block) return false;

        const { state, view } = this.editor;
        const edit = enterEdit(block.text, block.start, block.end);
        const tr = state.tr.insertText(edit.insert, block.from, block.to);
        tr.setSelection(TextSelection.create(tr.doc, block.from + edit.cursor));
        view.dispatch(tr.scrollIntoView());
        return true;
      },

      // 메뉴가 열려 있을 때의 ↑↓는 메뉴가 쓴다(기본 동작은 블록 끝에서 아래로 빠져나가는 것).
      ArrowDown: (props) => (isCompletionOpen(this.editor.state) ? false : (base.ArrowDown?.(props) ?? false)),
      ArrowUp: (props) => (isCompletionOpen(this.editor.state) ? false : (base.ArrowUp?.(props) ?? false)),

      // 아무것도 안 든 짝 `()` 사이에서 지우면 둘 다 지운다. 그 밖에는 기본 동작(빈 블록 지우기 등).
      Backspace: (props) => {
        const block = inCodeBlock();
        if (block && block.start === block.end && shouldDeletePair(block.text, block.start)) {
          const { state, view } = this.editor;
          view.dispatch(state.tr.delete(block.from - 1, block.from + 1));
          return true;
        }
        return base.Backspace?.(props) ?? false;
      },
    };
  },

  addProseMirrorPlugins() {
    const name = this.name;
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          // 괄호·따옴표를 칠 때: 짝을 함께 넣고, 선택을 감싸고, 이미 있는 닫는 글자는 넘어간다.
          handleTextInput(view, from, to, text) {
            // 한 글자씩 직접 친 것만 다룬다. 붙여넣기나 한글 조합 중의 입력은 그대로 둔다.
            if (text.length !== 1 || view.composing) return false;

            const { doc } = view.state;
            const $from = doc.resolve(from);
            if ($from.parent.type.name !== name || !$from.sameParent(doc.resolve(to))) return false;

            const blockStart = $from.start();
            const action = typedCharAction($from.parent.textContent, from - blockStart, to - blockStart, text);
            if (!action) return false;

            const tr = view.state.tr;
            if (action.kind === "skip") {
              tr.setSelection(TextSelection.create(doc, from + 1));
            } else if (action.kind === "pair") {
              tr.insertText(action.open + action.close, from, to);
              tr.setSelection(TextSelection.create(tr.doc, from + 1));
            } else {
              // 닫는 글자를 먼저 넣어야 앞쪽 위치가 밀리지 않는다. 감싼 뒤에도 같은 글자가 선택돼 있게 한다.
              tr.insertText(action.close, to);
              tr.insertText(action.open, from);
              tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1));
            }
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
