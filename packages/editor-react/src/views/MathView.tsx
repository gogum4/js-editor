import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";

import { useMathHtml } from "../hooks/useMathHtml";
import { openMathEditor } from "../stores/mathEditStore";
import { useEditorStrings } from "../context";

/** 수식을 그린 HTML 또는 자리표시·오류. 인라인과 블록이 함께 쓴다. */
function MathBody({ latex, display }: { latex: string; display: boolean }) {
  const strings = useEditorStrings();
  const { html, error } = useMathHtml(latex, display);
  if (latex.trim() === "") return <span className="math-placeholder">{strings.math.placeholder}</span>;
  if (html === null) return <span className="math-placeholder">…</span>;
  return (
    <>
      <span className="math-rendered" dangerouslySetInnerHTML={{ __html: html }} />
      {error && (
        <span className="math-error" role="note">
          {display ? ` ${error}` : ""}
        </span>
      )}
    </>
  );
}

/** 문장 안의 수식(`$x^2$`). 누르면 에디터 바깥의 편집 창이 열린다. */
export function MathInlineView({ node, editor, getPos, selected }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? "");
  return (
    <NodeViewWrapper
      as="span"
      className={["math-inline", selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      data-math-inline=""
      title={latex}
      contentEditable={false}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        const pos = getPos();
        if (typeof pos === "number") openMathEditor(editor, pos);
      }}
    >
      <MathBody latex={latex} display={false} />
    </NodeViewWrapper>
  );
}

/** 한 줄을 차지하는 큰 수식(`$$ … $$`). 누르면 편집 창이 열린다. */
export function MathBlockView({ node, editor, getPos, selected }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? "");
  return (
    <NodeViewWrapper
      className={["math-block", selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      data-math-block=""
      contentEditable={false}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        const pos = getPos();
        if (typeof pos === "number") openMathEditor(editor, pos);
      }}
    >
      <MathBody latex={latex} display />
    </NodeViewWrapper>
  );
}
