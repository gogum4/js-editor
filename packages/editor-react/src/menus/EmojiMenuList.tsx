import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { EmojiSuggestion } from "@gogum4/editor-core";
import { useEditorStrings } from "../context";

interface EmojiMenuListProps {
  items: EmojiSuggestion[];
  command: (item: EmojiSuggestion) => void;
  /** `:` 뒤에 친 글자. 비어 있으면 제안(최근에 쓴 이모지, 없으면 기본 제안)을 보이는 중이다. */
  query: string;
}

export interface EmojiMenuHandle {
  /** 메뉴가 처리한 키면 true (에디터에는 전달하지 않는다). */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** 이모지 자동완성 메뉴: 이모지와 `:이름:`을 한 줄씩. ↑↓ Enter Tab과 마우스로 고른다. 후보가 없으면 아무것도 그리지 않는다(`:`가 글자일 수 있다). */
export const EmojiMenuList = forwardRef<EmojiMenuHandle, EmojiMenuListProps>(function EmojiMenuList({ items, command, query }, ref) {
  const strings = useEditorStrings().extras.emojiMenu;
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const scrollToActive = useRef(false);

  useEffect(() => {
    setActive(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [items]);

  useEffect(() => {
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    listRef.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      // 한글 조합 중의 키는 입력기의 것이다. 메뉴가 가로채지 않는다.
      if (event.isComposing || event.keyCode === 229) return false;
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        scrollToActive.current = true;
        setActive((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        scrollToActive.current = true;
        setActive((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[active];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;

  return (
    <div className="md-menu md-menu-emoji">
      {query === "" && <div className="md-menu-heading">{items[0]?.recent ? strings.recent : strings.suggested}</div>}
      <ul ref={listRef} role="listbox" aria-label={strings.label} className="md-menu-list">
        {items.map((item, index) => (
          <li
            key={item.name}
            role="option"
            aria-selected={index === active}
            data-active={index === active}
            data-emoji-name={item.name}
            // 클릭해도 에디터의 포커스가 빠지지 않게 mousedown을 막는다.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActive(index)}
            onClick={() => command(item)}
            className="md-menu-item"
          >
            <span className="md-menu-emoji-char">{item.emoji}</span>
            <span className="md-menu-label md-menu-label-mono">:{item.name}:</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
