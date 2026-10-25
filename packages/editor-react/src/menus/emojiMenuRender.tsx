import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";

import { placeMenu } from "@gogum4/editor-core";
import type { SuggestionRender } from "@gogum4/editor-core";
import { type EmojiMenuHandle, EmojiMenuList } from "./EmojiMenuList";

/**
 * 이모지 자동완성 메뉴(`:`)를 React로 그리고 커서 옆에 띄운다. 후보가 없으면 그리지 않는 목록이라 빈 상자가 보이지 않는다.
 * `createCoreExtensions({ menus: { emoji } })`로 주입한다.
 */
export const emojiMenuRender: SuggestionRender = () => {
  let renderer: ReactRenderer<EmojiMenuHandle> | null = null;
  const toProps = (props: { items: unknown[]; command: (item: never) => void; query: string }) => ({ items: props.items, command: props.command, query: props.query });

  return {
    onStart: (props) => {
      renderer = new ReactRenderer(EmojiMenuList, { props: toProps(props), editor: props.editor });
      const element = renderer.element as HTMLElement;
      element.style.position = "fixed";
      element.style.zIndex = "60";
      document.body.appendChild(element);
      placeMenu(element, props);
    },
    onUpdate: (props) => {
      renderer?.updateProps(toProps(props));
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
