import type { ReactNode } from "react";

/** lowlight가 돌려주는 hast 트리의 필요한 부분(글자와 `class`가 있는 요소). */
export interface HastText {
  type: "text";
  value: string;
}
export interface HastElement {
  type: "element";
  tagName: string;
  properties?: { className?: readonly string[] };
  children: HastChild[];
}
export type HastChild = HastText | HastElement;

/** 강조된 코드의 hast 노드들을 React 요소로 바꾼다 (`<span class="hljs-keyword">` …). */
export function hastToReact(nodes: readonly HastChild[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.value;
    const className = node.properties?.className?.join(" ");
    const Tag = node.tagName as "span";
    return (
      <Tag key={index} className={className === "" ? undefined : className}>
        {hastToReact(node.children)}
      </Tag>
    );
  });
}
