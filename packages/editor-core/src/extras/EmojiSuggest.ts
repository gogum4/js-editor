import { type Editor, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";

import { type EmojiMatch, searchEmoji } from "@gogum4/editor-schema/extras";
import { portsOf } from "../ports/editorPorts";
import type { SuggestionRender } from "../ports/ui";

/** 메뉴 항목. `recent`는 최근에 쓴 이모지를 보이는 중(`:`만 쳤고 쓴 기록이 있음)이라는 표시다 — 기록이 없어 기본 제안이면 없다. */
export type EmojiSuggestion = EmojiMatch & { recent?: boolean };

export const emojiMenuKey = new PluginKey("emojiSuggest");

const RECENT_KEY = "emoji.recent";
const RECENT_MAX = 12;
const MENU_SIZE = 8;

/** 편집기마다 최근 쓴 이모지(이름, 최근 것이 앞). 저장소(`keyValue`)에서 처음 한 번 읽고 이후에는 메모리의 것을 쓴다. */
const recents = new WeakMap<Editor, string[]>();

async function loadRecent(editor: Editor): Promise<string[]> {
  const cached = recents.get(editor);
  if (cached) return cached;
  let list: string[] = [];
  try {
    const stored = await portsOf(editor).keyValue.get(RECENT_KEY);
    const parsed: unknown = stored === null ? [] : JSON.parse(stored);
    list = Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string").slice(0, RECENT_MAX) : [];
  } catch {
    list = [];
  }
  recents.set(editor, list);
  return list;
}

async function remember(editor: Editor, name: string): Promise<void> {
  const list = [name, ...(await loadRecent(editor)).filter((other) => other !== name)].slice(0, RECENT_MAX);
  recents.set(editor, list);
  try {
    await portsOf(editor).keyValue.set(RECENT_KEY, JSON.stringify(list));
  } catch {
    // 저장하지 못해도 이번 편집기에서는 메모리의 최근 목록을 쓴다.
  }
}

/**
 * 이모지 자동완성: 줄 맨 앞이나 공백 뒤에서 `:`를 치면 후보가 뜬다.
 * - `:`만 치면 **최근에 쓴 이모지**(없으면 기본 제안), 글자를 두 자 이상 이어 치면 이름·한국어·영어 동의어로 찾은 후보(`:웃음`, `:thumbs`, `:rocket`).
 *   한 글자(`:3`, `:)`)는 시간 표기나 이모티콘과 헷갈려서 띄우지 않는다.
 * - ↑↓/Enter/Tab으로 고르면 `:글자`가 이모지로 바뀌고 최근 목록의 맨 앞에 올라간다. Esc로 닫는다. 코드 블록·인라인 코드 안에서는 뜨지 않는다.
 * - `:smile:`을 끝까지 치면 입력 규칙(`EmojiShortcodes`)이 바로 바꾼다. 메뉴를 어떻게 그릴지는 소비자가 주입한다(`menus.emoji`; 없으면 메뉴가 뜨지 않는다).
 */
export const EmojiSuggest = Extension.create<{ render: SuggestionRender | null }>({
  name: "emojiSuggest",
  addOptions: () => ({ render: null }),

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      Suggestion<EmojiSuggestion, EmojiSuggestion>({
        editor,
        pluginKey: emojiMenuKey,
        char: ":",
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return !$from.parent.type.spec.code && !$from.marks().some((mark) => mark.type.name === "code");
        },
        items: async ({ query }) => {
          if (query.length === 1) return [];
          const recent = await loadRecent(editor);
          const found = searchEmoji(query, MENU_SIZE, recent);
          return query === "" && recent.length > 0 ? found.map((match) => ({ ...match, recent: true })) : found;
        },
        command: ({ editor: current, range, props }) => {
          current.chain().focus().insertContentAt(range, props.emoji).run();
          void remember(current, props.name);
        },
        render: this.options.render ?? undefined,
      }),
    ];
  },
});
