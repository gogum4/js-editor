import { type NodeViewProps, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import {
  CALLOUT_META,
  CALLOUT_TYPES,
  type CalloutType,
  normalizeCalloutType,
} from "@9um4/editor-schema/callout";
import { useEditorStrings } from "../context";

/** 콜아웃 한 개의 화면: 왼쪽 아이콘(누르면 종류 변경)과 오른쪽 본문. */
export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const strings = useEditorStrings();
  const type = normalizeCalloutType(node.attrs.type);
  const [menuOpen, setMenuOpen] = useState(false);
  const iconRef = useRef<HTMLDivElement>(null);

  // 메뉴 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!iconRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const choose = (next: CalloutType) => {
    updateAttributes({ type: next });
    setMenuOpen(false);
  };

  return (
    <NodeViewWrapper className={`callout callout-${type}`} data-callout={type}>
      {/* 아이콘 영역은 편집 대상이 아니다. 누를 때 에디터의 선택이 옮겨 가지 않게 mousedown을 막는다. */}
      <div ref={iconRef} className="callout-icon" contentEditable={false}>
        <button
          type="button"
          aria-label={strings.callout.changeLabel(strings.callout.types[type])}
          title={strings.callout.changeTitle}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {CALLOUT_META[type].icon}
        </button>
        {menuOpen && (
          <div role="menu" className="callout-menu">
            {CALLOUT_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitem"
                aria-current={option === type}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span>{CALLOUT_META[option].icon}</span>
                <span>{strings.callout.types[option]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <NodeViewContent className="callout-content" />
    </NodeViewWrapper>
  );
}
