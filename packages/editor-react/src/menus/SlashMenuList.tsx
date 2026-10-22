import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { SlashItem } from "@9um4/editor-core";
import { useEditorStrings } from "../context";

interface SlashMenuListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuHandle {
  /** 메뉴가 처리한 키면 true (에디터에는 전달하지 않는다). */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/** `/` 명령 메뉴의 항목 목록. 키보드(↑↓ Enter Tab)와 마우스로 고를 수 있다. */
export const SlashMenuList = forwardRef<SlashMenuHandle, SlashMenuListProps>(function SlashMenuList(
  { items, command },
  ref,
) {
  const strings = useEditorStrings();
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  // 키보드로 옮길 때만 활성 항목을 보이는 곳으로 스크롤한다. 마우스를 올렸을 때 목록이 밀리면 클릭이 빗나간다.
  const scrollToActive = useRef(false);

  // 검색 결과가 바뀌면 맨 위부터 시작한다.
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

  if (items.length === 0) {
    return (
      <div className="w-72 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-400 shadow-lg">
        {strings.slash.noMatch}
      </div>
    );
  }

  return (
    <div className="w-72 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
      <ul ref={listRef} role="listbox" aria-label={strings.slash.menuLabel} className="max-h-80 overflow-y-auto">
        {items.map((item, index) => (
          <li
            key={item.id}
            role="option"
            aria-selected={index === active}
            data-active={index === active}
            data-slash-id={item.id}
            // 클릭해도 에디터의 포커스가 빠지지 않게 mousedown을 막는다.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActive(index)}
            onClick={() => command(item)}
            className={[
              "flex cursor-pointer flex-col rounded-md px-2.5 py-1.5",
              index === active ? "bg-neutral-100" : "",
            ].join(" ")}
          >
            <span className="text-sm text-neutral-800">{item.label}</span>
            <span className="text-xs text-neutral-400">{item.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
