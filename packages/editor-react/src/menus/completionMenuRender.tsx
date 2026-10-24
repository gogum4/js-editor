import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps } from "@tiptap/suggestion";

import { placeMenu } from "@9um4/editor-core";
import type { SuggestionRender } from "@9um4/editor-core";
import { type CompletionMenuHandle, CompletionMenuList } from "./CompletionMenuList";

/**
 * 코드 블록 자동완성 메뉴를 React로 그리고 커서 옆에 띄운다. `createCoreExtensions({ menus: { codeCompletion } })`로 주입한다.
 * (한글 조합 중 키를 무시하는 일과, 닫힐 때 Ctrl+Space 위치를 비우는 일은 core의 `CodeCompletion`이 이 render를 감싸서 한다.)
 */
export const completionMenuRender: SuggestionRender = () => {
  let renderer: ReactRenderer<CompletionMenuHandle> | null = null;

  return {
    onStart: (props) => {
      renderer = new ReactRenderer(CompletionMenuList, {
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
      requestAnimationFrame(() => {
        if (renderer) placeMenu(renderer.element as HTMLElement, props);
      });
    },
    onKeyDown: (props: SuggestionKeyDownProps) => renderer?.ref?.onKeyDown(props.event) ?? false,
    onExit: () => {
      renderer?.element.remove();
      renderer?.destroy();
      renderer = null;
    },
  };
};
