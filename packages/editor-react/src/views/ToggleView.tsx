import { type NodeViewProps, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect } from "react";
import { useStore } from "zustand";

import { useEditorPorts, useEditorStrings } from "../context";
import { toggleStoreFor } from "../stores/toggleStore";

/**
 * 토글 블록의 화면: 왼쪽 화살표로 열고 닫는다. 닫으면 제목 줄(첫 문단)만 남기고 나머지는 CSS로 숨긴다.
 * 열림 상태는 문서가 아니라 이 컴퓨터의 설정에 있다(`toggleStore`). 블록 id가 아직 없으면(방금 만든 직후 한순간) 열린 채로 둔다.
 */
export function ToggleView({ node, editor, getPos }: NodeViewProps) {
  const id = typeof node.attrs.id === "string" ? node.attrs.id : null;
  const strings = useEditorStrings().toggle;
  const store = toggleStoreFor(useEditorPorts().keyValue);
  const closed = useStore(store, (s) => id !== null && s.closed.includes(id));
  const load = useStore(store, (s) => s.load);
  const setOpen = useStore(store, (s) => s.setOpen);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = () => {
    if (id === null) return;
    if (!closed) {
      // 닫으면 숨겨지는 내용 안에 커서가 있을 수 있다. 보이지 않는 곳에 커서가 남지 않게 제목 줄 끝으로 옮긴다.
      const pos = getPos();
      const title = node.firstChild;
      if (typeof pos === "number" && title) {
        const titleEnd = pos + title.nodeSize;
        const { from } = editor.state.selection;
        if (from > titleEnd && from < pos + node.nodeSize) editor.commands.setTextSelection(titleEnd);
      }
    }
    setOpen(id, closed);
  };

  return (
    <NodeViewWrapper className="toggle-block" data-open={closed ? "false" : "true"}>
      <button
        type="button"
        contentEditable={false}
        className="toggle-arrow"
        aria-expanded={!closed}
        aria-label={closed ? strings.expandLabel : strings.collapseLabel}
        title={closed ? strings.expandTitle : strings.collapseTitle}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        ▸
      </button>
      <NodeViewContent className="toggle-body" />
    </NodeViewWrapper>
  );
}
