import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps } from "@tiptap/suggestion";

import { CORE_SLASH_ITEMS, filterSlashItems, type SlashItem } from "../lib/slashItems";
import { placeMenu } from "../menuPlace";
import { runSlashCommand, type SlashHandlers } from "./runSlashCommand";
import { SlashMenuList, type SlashMenuHandle } from "./SlashMenuList";

export const slashMenuKey = new PluginKey("slashCommand");

/**
 * 줄 맨 앞이나 공백 뒤에서 `/`를 입력하면 명령 메뉴가 뜬다. 계속 입력하면 이름과 다른 이름(한글·영문)으로 걸러지고,
 * ↑↓/Enter/Tab으로 고르거나 Esc로 닫는다. 코드 블록 안에서는 뜨지 않는다.
 */
export const SlashCommand = Extension.create<{ items: readonly SlashItem[]; handlers: SlashHandlers }>({
  name: "slashCommand",

  addOptions: () => ({ items: CORE_SLASH_ITEMS, handlers: {} }),

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
        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle> | null = null;

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenuList, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              const element = renderer.element as HTMLElement;
              element.style.position = "fixed";
              element.style.zIndex = "60";
              document.body.appendChild(element);
              placeMenu(element, props);
            },
            onUpdate: (props) => {
              renderer?.updateProps({ items: props.items, command: props.command });
              // 항목 수가 달라지면 크기도 달라지므로 다시 그린 뒤에 자리를 잡는다.
              requestAnimationFrame(() => {
                if (renderer) placeMenu(renderer.element as HTMLElement, props);
              });
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.isComposing || props.event.keyCode === 229) return false;
              return renderer?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: () => {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
