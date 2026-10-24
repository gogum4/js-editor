import { type NodeViewProps, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import {
  CALLOUT_PRESET_META,
  CALLOUT_TYPES,
  type CalloutType,
  calloutMeta,
  normalizeCalloutType,
} from "@gogum4/editor-schema/callout";
import { useEditorPorts, useEditorStrings } from "../context";

/** 콜아웃 한 개의 화면: 왼쪽 아이콘(누르면 종류 변경)과 오른쪽 본문. */
export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const strings = useEditorStrings();
  const { calloutIcons } = useEditorPorts();
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

  // 글: 사전에 있으면 사전, 없으면(Obsidian 이름·사용자 이름) 정해진 글이나 이름 그대로.
  const labelOf = (kind: CalloutType) => strings.callout.types[kind] ?? calloutMeta(kind).label;
  // 메뉴에는 기본 5종과 Obsidian 이름을 보이고, 지금 종류가 그 밖의 이름이면 그것도 맨 아래에 보인다.
  const options: CalloutType[] = [...CALLOUT_TYPES, ...Object.keys(CALLOUT_PRESET_META)];
  if (!options.includes(type)) options.push(type);

  return (
    <NodeViewWrapper className={`callout callout-${type}`} data-callout={type}>
      {/* 아이콘 영역은 편집 대상이 아니다. 누를 때 에디터의 선택이 옮겨 가지 않게 mousedown을 막는다. */}
      <div ref={iconRef} className="callout-icon" contentEditable={false}>
        <button
          type="button"
          aria-label={strings.callout.changeLabel(labelOf(type))}
          title={strings.callout.changeTitle}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {calloutMeta(type, calloutIcons).icon}
        </button>
        {menuOpen && (
          <div role="menu" className="callout-menu">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitem"
                aria-current={option === type}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span>{calloutMeta(option, calloutIcons).icon}</span>
                <span>{labelOf(option)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <NodeViewContent className="callout-content" />
    </NodeViewWrapper>
  );
}
