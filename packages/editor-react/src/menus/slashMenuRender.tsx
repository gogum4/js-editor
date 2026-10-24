import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";

import { placeMenu } from "@gogum4/editor-core";
import type { SuggestionRender } from "@gogum4/editor-core";
import { type SlashMenuHandle, SlashMenuList } from "./SlashMenuList";

/**
 * `/` 명령 메뉴를 React로 그리고 커서 옆에 띄운다. 키 입력은 메뉴가 먼저 받고, 한글 조합 중의 키는 건드리지 않는다.
 * `createCoreExtensions({ menus: { slash } })`로 주입한다.
 */
export const slashMenuRender: SuggestionRender = () => {
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
};
