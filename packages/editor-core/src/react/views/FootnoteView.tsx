import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";

import { openFootnoteEditor } from "../stores/footnoteEditStore";
import { useEditorStrings } from "../context";

/**
 * 문장 안의 각주 번호. 번호 글자는 CSS 카운터가 문서 순서대로 붙인다(`.footnote-ref::after`).
 * 누르면 에디터 바깥의 편집 창이 열린다. 마우스를 올리면 내용이 말풍선(title)으로 보인다.
 */
export function FootnoteView({ node, editor, getPos, selected }: NodeViewProps) {
  const strings = useEditorStrings().footnote;
  const text = String(node.attrs.text ?? "");
  return (
    <NodeViewWrapper
      as="sup"
      className={["footnote-ref", selected ? "is-selected" : ""].filter(Boolean).join(" ")}
      data-footnote=""
      title={text === "" ? strings.refEmptyTitle : text}
      contentEditable={false}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        const pos = getPos();
        if (typeof pos === "number") openFootnoteEditor(editor, pos);
      }}
    />
  );
}
