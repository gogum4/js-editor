import type { SuggestionProps } from "@tiptap/suggestion";

import { computeMenuPosition } from "@9um4-utils/editor-schema/menuPosition";

/** 커서 옆에 뜨는 메뉴(`/` 명령, `[[` 페이지 링크)를 화면에 맞는 자리에 놓는다. 크기는 그려진 뒤의 실제 값을 쓴다. */
export function placeMenu<I, S>(element: HTMLElement, props: SuggestionProps<I, S>) {
  const rect = props.clientRect?.();
  if (!rect) return;
  const { width, height } = element.getBoundingClientRect();
  const position = computeMenuPosition(
    rect,
    { width: width || 288, height: height || 120 },
    { width: window.innerWidth, height: window.innerHeight },
  );
  element.style.left = `${position.left}px`;
  element.style.top = `${position.top}px`;
}
