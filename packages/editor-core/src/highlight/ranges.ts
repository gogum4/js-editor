/** lowlight가 돌려주는 hast 트리를 "이 글자 구간에 이 클래스를 입힌다" 목록으로 바꾼다. */

/** hast 노드 중 우리가 쓰는 부분만 담은 모양 (텍스트 `value`, 요소의 `className`과 `children`). */
export interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: string | string[] };
  children?: readonly HastNode[];
}

export interface HighlightRange {
  /** 코드 텍스트(블록의 `textContent`) 안에서의 시작·끝 위치. */
  from: number;
  to: number;
  className: string;
}

function classNames(node: HastNode): string[] {
  const value = node.properties?.className;
  if (!value) return [];
  return Array.isArray(value) ? value : value.split(/\s+/).filter(Boolean);
}

/**
 * 글자 하나하나(텍스트 조각)마다 감싸고 있는 요소들의 클래스를 모아 범위를 만든다.
 * 중첩된 요소는 클래스를 공백으로 이어 붙인다 (예: `hljs-title hljs-function`).
 * 클래스가 없는 글자는 범위를 만들지 않는다.
 */
export function hastToRanges(children: readonly HastNode[]): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  let offset = 0;

  const visit = (nodes: readonly HastNode[], inherited: string[]) => {
    for (const node of nodes) {
      if (node.type === "text") {
        const length = node.value?.length ?? 0;
        if (length > 0 && inherited.length > 0) {
          ranges.push({ from: offset, to: offset + length, className: inherited.join(" ") });
        }
        offset += length;
      } else if (node.children) {
        visit(node.children, node.type === "element" ? [...inherited, ...classNames(node)] : inherited);
      }
    }
  };

  visit(children, []);
  return ranges;
}
