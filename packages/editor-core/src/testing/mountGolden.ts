// 렌더된 에디터 DOM을 골든으로 고정하는 시험 도구(docs/EDITOR-PACKAGE.md P5-0). happy-dom 환경에서 쓴다.
import type { Editor } from "@tiptap/core";

import { BLOCK_ID_TYPES } from "@9um4/editor-schema/blockId";
import type { PmNode } from "@9um4/editor-schema/pmDoc";

const ID_TYPES: ReadonlySet<string> = new Set(BLOCK_ID_TYPES);

/**
 * 블록 id가 없는 블록에 **정해진** id를 단다. 에디터는 id 없는 블록에 무작위 id를 붙이므로(BlockId), 골든이 흔들리지 않으려면
 * 문서에 미리 모든 id를 줘야 한다.
 */
export function withFixedIds(doc: PmNode): PmNode {
  let n = 0;
  const visit = (node: PmNode): PmNode => {
    const next: PmNode = { ...node };
    if (ID_TYPES.has(node.type) && typeof node.attrs?.id !== "string") {
      n += 1;
      next.attrs = { ...(node.attrs ?? {}), id: `fixed${String(n).padStart(5, "0")}` };
    }
    if (node.content) next.content = node.content.map(visit);
    return next;
  };
  return visit(doc);
}

/**
 * 사람이 읽고 diff를 볼 수 있게 DOM 문자열을 다듬는다: React가 만든 무작위 id(`:r1:`)를 번호로 바꾸고, KaTeX가 만든 긴 수식 HTML을 자리표시로 줄이고
 * (KaTeX 버전이 올라도 골든이 안 깨지게), 이웃한 태그 사이에서 줄을 바꾼다.
 */
export function formatDom(html: string): string {
  const ids = new Map<string, string>();
  return (
    html
      .replace(/:r[0-9a-z]+:/g, (id) => {
        if (!ids.has(id)) ids.set(id, `:r${ids.size}:`);
        return ids.get(id)!;
      })
      .replace(/></g, ">\n<") + "\n"
  );
}

/**
 * KaTeX가 그린 수식 안쪽 마크업을 자리표시로 바꾼 복사본 — KaTeX 버전이 올라가도 골든이 안 깨지게.
 * 블록 수식은 `.katex-display`, 인라인은 `.katex`의 안쪽만 바꾸고 바깥 상자는 남긴다. 수식이 실제로 그려졌는지는 호출하는 시험이 기다려서 확인한다.
 */
export function maskKatex(root: Element): Element {
  const copy = root.cloneNode(true) as Element;
  for (const display of copy.querySelectorAll(".katex-display")) display.innerHTML = "[KaTeX]";
  for (const inline of copy.querySelectorAll(".katex")) inline.innerHTML = "[KaTeX]";
  return copy;
}

/** 마운트된 에디터 본문의 정리된 DOM. */
export function editorDom(editor: Editor): string {
  return formatDom(maskKatex(editor.view.dom).outerHTML);
}
