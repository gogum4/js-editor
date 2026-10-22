import { Extension } from "@tiptap/core";
import type { ResolvedPos } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps } from "@tiptap/suggestion";

import type { SuggestionRender } from "../ports/ui";
import { cachedKeywords, completionLanguage, ensureKeywords } from "./keywordStore";
import { buildCandidates, type Candidate, currentWord, manualWord, MAX_MANUAL_CANDIDATES, MIN_PREFIX } from "./words";

export const codeCompletionKey = new PluginKey("codeCompletion");

/** 코드 블록 안에서 후보 메뉴가 열려 있는지. 열려 있으면 Tab·Enter·↑↓는 메뉴의 것이다. */
export function isCompletionOpen(state: EditorState): boolean {
  return (codeCompletionKey.getState(state) as { active?: boolean } | undefined)?.active === true;
}

/**
 * 코드 블록에서 단어를 두 글자 이상 치면 그 언어의 예약어와 블록 안의 단어로 후보 메뉴를 띄운다.
 * mermaid 블록은 직접 쓴 목록(다이어그램 종류와 종류별 말)을 쓴다. 언어를 모르거나 일반 텍스트면 뜨지 않는다.
 * ↑↓/Enter/Tab으로 고르고 Esc로 닫는다. **Ctrl+Space**로는 글자 수와 상관없이(빈 단어여도) 언제든 후보를 연다.
 */
export const CodeCompletion = Extension.create<{ render: SuggestionRender | null }>({
  name: "codeCompletion",

  addOptions: () => ({ render: null }),

  // 메뉴가 열려 있을 때 Tab·Enter를 코드 블록의 들여쓰기보다 먼저 받도록 가장 앞에 둔다.
  priority: 1000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    const requested = new Set<string>();

    /** 예약어를 불러오는 동안은 블록 안의 단어만 낸다. 다 불러오면 한 번 다시 계산시킨다. */
    const keywordsFor = (language: ReturnType<typeof completionLanguage>): Candidate[] => {
      if (!language || language.kind !== "hljs") return [];
      const cached = cachedKeywords(language.name);
      if (cached) return cached;
      if (!requested.has(language.name)) {
        requested.add(language.name);
        void ensureKeywords(language.name).then(() => {
          if (editor.isDestroyed) return;
          editor.view.dispatch(editor.state.tr.setMeta(codeCompletionKey, "keywords-loaded"));
        });
      }
      return [];
    };

    /** Ctrl+Space로 부른 단어의 시작 위치(문서 기준). 단어를 벗어나거나 메뉴가 닫히면 비운다. */
    let manualFrom: number | null = null;

    /** 커서 자리의 후보와 바꿀 범위. 후보가 없으면 null. */
    const matchAt = ($pos: ResolvedPos): { range: { from: number; to: number }; prefix: string; items: Candidate[] } | null => {
      if ($pos.parent.type.name !== "codeBlock") return null;
      const language = completionLanguage($pos.parent.attrs.language as string | null);
      if (!language) return null;
      const text = $pos.parent.textContent;
      const offset = $pos.parentOffset;
      const mermaid = language.kind === "mermaid";

      // 수동 호출 중이면 그 단어를 계속 따라간다. 단어 글자가 아닌 것을 치거나 앞으로 벗어나면 끝낸다.
      if (manualFrom !== null) {
        const startOffset = manualFrom - $pos.start();
        const word = startOffset >= 0 && startOffset <= offset ? manualWord(text.slice(0, offset), offset) : null;
        if (word && word.start === startOffset) {
          const items = buildCandidates({ text, offset, keywords: keywordsFor(language), mermaid, word, limit: MAX_MANUAL_CANDIDATES });
          return items.length > 0 ? { range: { from: $pos.pos - word.prefix.length, to: $pos.pos }, prefix: word.prefix, items } : null;
        }
        manualFrom = null;
      }

      // 후보를 띄울 단어가 아니면 예약어를 불러오지도 않는다.
      const word = currentWord(text, offset);
      if (!word || word.prefix.length < MIN_PREFIX) return null;
      const items = buildCandidates({ text, offset, keywords: keywordsFor(language), mermaid });
      return items.length > 0 ? { range: { from: $pos.pos - word.prefix.length, to: $pos.pos }, prefix: word.prefix, items } : null;
    };

    return [
      Suggestion<Candidate, Candidate>({
        editor,
        pluginKey: codeCompletionKey,
        char: "",
        // 후보가 하나도 없으면 매치가 없는 것으로 해서, 메뉴가 열린 것으로 치지 않는다(Tab·Enter는 원래 동작).
        findSuggestionMatch: ({ $position }) => {
          const match = matchAt($position);
          return match ? { range: match.range, query: match.prefix, text: match.prefix } : null;
        },
        items: () => matchAt(editor.state.selection.$from)?.items ?? [],
        command: ({ editor: e, range, props }) => {
          e.view.dispatch(e.state.tr.insertText(props.word, range.from, range.to));
        },
        // 메뉴를 어떻게 그릴지는 소비자가 주입한다(`createCoreExtensions({ menus: { codeCompletion } })`). 없으면 메뉴가 뜨지 않는다.
        // 닫힐 때 Ctrl+Space로 부른 단어 위치를 비우는 일은 core의 몫이라 주입된 render를 감싼다.
        render: () => {
          const inner = this.options.render?.();
          return {
            onStart: (props) => inner?.onStart?.(props),
            onUpdate: (props) => inner?.onUpdate?.(props),
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.isComposing || props.event.keyCode === 229) return false;
              return inner?.onKeyDown?.(props) ?? false;
            },
            onExit: (props) => {
              manualFrom = null;
              inner?.onExit?.(props);
            },
          };
        },
      }),

      // 커서가 코드 블록에 들어오면 그 언어의 예약어를 미리 불러 둔다(처음 후보가 뜰 때 기다리지 않게).
      new Plugin({
        view: () => ({
          update: (view) => {
            const { $from } = view.state.selection;
            if ($from.parent.type.name !== "codeBlock") return;
            keywordsFor(completionLanguage($from.parent.attrs.language as string | null));
          },
        }),
      }),

      // Ctrl+Space: 글자 수와 상관없이(빈 단어여도) 지금 자리의 후보를 연다.
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            const isCtrlSpace =
              event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && (event.key === " " || event.code === "Space");
            if (!isCtrlSpace || event.isComposing || event.keyCode === 229) return false;

            const { $from, empty } = view.state.selection;
            if (!empty || $from.parent.type.name !== "codeBlock") return false;
            if (!completionLanguage($from.parent.attrs.language as string | null)) return false;
            const word = manualWord($from.parent.textContent, $from.parentOffset);
            if (!word) return false;

            const from = $from.pos - word.prefix.length;
            const open = () => {
              if (editor.isDestroyed) return;
              manualFrom = from;
              // 다시 계산시켜 메뉴를 연다.
              view.dispatch(view.state.tr.setMeta(codeCompletionKey, "manual"));
            };
            // 예약어를 아직 못 불러왔으면 불러온 뒤에 연다(열린 뒤에는 목록이 다시 그려지지 않는다).
            const language = completionLanguage($from.parent.attrs.language as string | null);
            if (language?.kind === "hljs" && !cachedKeywords(language.name)) void ensureKeywords(language.name).then(open);
            else open();
            return true;
          },
        },
      }),
    ];
  },
});
