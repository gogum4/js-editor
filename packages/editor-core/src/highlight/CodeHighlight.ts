import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";

import { buildDecorations, updateDecorations, usedLanguages } from "./decorations";
import { isLanguageLoaded, loadLanguage } from "./loader";

const highlightKey = new PluginKey<DecorationSet>("codeHighlight");

/**
 * 코드 블록 구문 강조. 색은 문서를 바꾸지 않는 **장식**으로만 입힌다 (저장되는 내용에 영향 없음).
 * 문서에서 쓰는 언어를 지켜보다가 아직 안 불러온 언어가 있으면 불러오고, 끝나면 장식을 다시 만든다.
 */
export const CodeHighlight = Extension.create({
  name: "codeHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: highlightKey,
        state: {
          init: (_, state) => buildDecorations(state.doc),
          apply(tr, previous) {
            // 언어를 불러온 뒤 다시 그리라는 신호(meta)가 오면 전부 다시 만든다.
            if (tr.getMeta(highlightKey)) return buildDecorations(tr.doc);
            // 문서가 바뀌었으면 바뀐 구간의 코드 블록만 다시 만든다 (큰 문서에서 입력이 느려지지 않게).
            if (tr.docChanged) return updateDecorations(previous, tr);
            return previous.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => highlightKey.getState(state),
        },
        view(initialView) {
          const ensureLanguages = (view: typeof initialView) => {
            for (const language of usedLanguages(view.state.doc)) {
              if (isLanguageLoaded(language)) continue;
              void loadLanguage(language).then(() => {
                if (view.isDestroyed || !isLanguageLoaded(language)) return;
                // 문서는 그대로 두고 장식만 다시 그리게 한다 (저장 대상이 아니다).
                view.dispatch(view.state.tr.setMeta(highlightKey, true));
              });
            }
          };

          ensureLanguages(initialView);
          return {
            update(view, previousState) {
              if (view.state.doc !== previousState.doc) ensureLanguages(view);
            },
          };
        },
      }),
    ];
  },
});
