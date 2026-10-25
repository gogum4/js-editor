import { type NodeViewProps, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import {
  CALLOUT_TITLE_MAX,
  CALLOUT_TYPES,
  type CalloutType,
  calloutMeta,
  normalizeCalloutFold,
  normalizeCalloutTitle,
  normalizeCalloutType,
} from "@gogum4/editor-schema/callout";
import { useEditorPorts, useEditorStrings } from "../context";

/** 콜아웃 한 개의 화면: 왼쪽 아이콘(누르면 종류 변경)과 오른쪽 본문. */
export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const strings = useEditorStrings();
  const { calloutIcons } = useEditorPorts();
  const type = normalizeCalloutType(node.attrs.type);
  const title = normalizeCalloutTitle(node.attrs.title);
  const fold = normalizeCalloutFold(node.attrs.fold);
  // 제목 입력칸은 제목이 있거나 접을 수 있을 때 보인다. 제목을 막 넣은 빈 칸도 보이도록 따로 기억한다.
  const [titleOpen, setTitleOpen] = useState(false);
  const hasTitleField = title !== null || titleOpen;
  const showHead = hasTitleField || fold !== null;
  // 접은 상태는 화면에만 있는 값이다(문서의 `fold`는 처음 상태가 아니라 "접을 수 있는가"와 기본 상태).
  const [collapsed, setCollapsed] = useState(fold === "-");
  useEffect(() => setCollapsed(fold === "-"), [fold]);
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

  const setFold = (next: "+" | "-" | null) => {
    updateAttributes({ fold: next });
    setMenuOpen(false);
  };

  const toggleTitle = () => {
    if (hasTitleField) {
      updateAttributes({ title: null });
      setTitleOpen(false);
    } else {
      setTitleOpen(true);
    }
    setMenuOpen(false);
  };

  // 글: 사전에 있으면 사전, 없으면(Obsidian 이름·사용자 이름) 정해진 글이나 이름 그대로.
  const labelOf = (kind: CalloutType) => strings.callout.types[kind] ?? calloutMeta(kind).label;
  // 메뉴에는 기본 5종을 보이고, 지금 종류가 그 밖의 이름(Obsidian 이름·사용자 이름)이면 그것도 맨 아래에 보인다. 다른 이름은 `> [!이름] ` 입력이나 Markdown으로 정한다.
  const options: CalloutType[] = [...CALLOUT_TYPES];
  if (!options.includes(type)) options.push(type);

  return (
    <NodeViewWrapper className={`callout callout-${type}`} data-callout={type} data-callout-fold={fold ?? undefined} data-collapsed={fold !== null && collapsed ? "true" : undefined}>
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
            <div className="callout-menu-sep" role="separator" />
            <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={toggleTitle}>
              <span>{hasTitleField ? "✕" : "T"}</span>
              <span>{hasTitleField ? strings.callout.removeTitle : strings.callout.addTitle}</span>
            </button>
            {([[null, strings.callout.foldNone], ["+", strings.callout.foldOpen], ["-", strings.callout.foldClosed]] as const).map(([value, label]) => (
              <button key={String(value)} type="button" role="menuitem" aria-current={fold === value} onMouseDown={(event) => event.preventDefault()} onClick={() => setFold(value)}>
                <span>{value === null ? "▪" : value === "+" ? "▾" : "▸"}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="callout-main">
        {showHead && (
          // 제목 줄은 편집 대상이 아니라 입력칸이다. 누를 때 에디터의 선택이 옮겨 가지 않게 mousedown은 입력칸이 직접 받는다.
          <div className="callout-head" contentEditable={false}>
            {fold !== null && (
              <button
                type="button"
                className="callout-fold-toggle"
                aria-expanded={!collapsed}
                aria-label={strings.callout.toggleFold}
                title={strings.callout.toggleFold}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setCollapsed((current) => !current)}
              >
                {collapsed ? "▸" : "▾"}
              </button>
            )}
            <input
              className="callout-title-input"
              value={node.attrs.title ?? ""}
              placeholder={strings.callout.titlePlaceholder}
              maxLength={CALLOUT_TITLE_MAX}
              onChange={(event) => updateAttributes({ title: event.target.value === "" ? null : event.target.value })}
            />
          </div>
        )}
        <NodeViewContent className="callout-content" />
      </div>
    </NodeViewWrapper>
  );
}
