import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";

import { CORE_SLASH_ITEMS, filterSlashItems, type SlashItem } from "../lib/slashItems";
import { runSlashCommand, type SlashHandlers } from "./runSlashCommand";
import type { SuggestionRender } from "../ports/ui";

export const slashMenuKey = new PluginKey("slashCommand");

/**
 * 줄 맨 앞이나 공백 뒤에서 `/`를 입력하면 명령 메뉴가 뜬다. 계속 입력하면 이름과 다른 이름(한글·영문)으로 걸러지고,
 * ↑↓/Enter/Tab으로 고르거나 Esc로 닫는다. 코드 블록 안에서는 뜨지 않는다.
 */
export const SlashCommand = Extension.create<{ items: readonly SlashItem[]; handlers: SlashHandlers; render: SuggestionRender | null }>({
  name: "slashCommand",

  addOptions: () => ({ items: CORE_SLASH_ITEMS, handlers: {}, render: null }),

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashMenuKey,
        char: "/",
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterSlashItems(query, this.options.items),
        command: ({ editor, range, props }) => {
          runSlashCommand(editor, range, props.id, this.options.handlers);
        },
        // 메뉴를 어떻게 그릴지는 소비자가 주입한다(`createCoreExtensions({ menus: { slash } })`). 없으면 메뉴가 뜨지 않는다.
        render: this.options.render ?? undefined,
      }),
    ];
  },
});
