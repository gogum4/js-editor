import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { useEditorStrings } from "../context";
import type { Candidate } from "@gogum4/editor-core";

interface CompletionMenuListProps {
  items: Candidate[];
  command: (item: Candidate) => void;
}

export interface CompletionMenuHandle {
  /** 메뉴가 처리한 키면 true (에디터에는 전달하지 않는다). */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** 코드 블록 자동완성 후보 목록. 키보드(↑↓ Enter Tab)와 마우스로 고를 수 있다. */
export const CompletionMenuList = forwardRef<CompletionMenuHandle, CompletionMenuListProps>(function CompletionMenuList(
  { items, command },
  ref,
) {
  const strings = useEditorStrings();
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  // 키보드로 옮길 때만 활성 항목을 보이는 곳으로 스크롤한다(마우스를 올렸을 때 목록이 밀리면 클릭이 빗나간다).
  const scrollToActive = useRef(false);

  // 후보가 바뀌면 맨 위부터 시작한다.
  useEffect(() => {
    setActive(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [items]);

  useEffect(() => {
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    listRef.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
  }, [active]);

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
    <div className="md-menu md-menu-completion">
      <ul ref={listRef} role="listbox" aria-label={strings.completion.label} className="md-menu-list">
        {items.map((item, index) => (
          <li
            key={item.word}
            role="option"
            aria-selected={index === active}
            data-active={index === active}
            data-completion-word={item.word}
            // 클릭해도 에디터의 포커스가 빠지지 않게 mousedown을 막는다.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActive(index)}
            onClick={() => command(item)}
            className="md-menu-item"
          >
            <span className="md-menu-label md-menu-label-mono">{item.word}</span>
            <span className="md-menu-desc">{strings.completion.kinds[item.kind]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
