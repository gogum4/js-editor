import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { resolveLanguage } from "@9um4-utils/editor-schema/codeLanguages";
import { isLanguageLoaded, lowlight } from "./loader";
import { type HastNode, type HighlightRange, hastToRanges } from "./ranges";

/** 이보다 긴 코드 블록은 색을 입히지 않는다 (아주 큰 붙여넣기에서 입력이 느려지는 것을 막는다). */
export const MAX_HIGHLIGHT_CHARS = 100_000;

// ProseMirror 노드는 바뀌지 않는 값이라, 같은 노드(= 내용·언어가 같은 블록)는 결과를 다시 쓴다.
const rangeCache = new WeakMap<ProseMirrorNode, HighlightRange[]>();

function rangesFor(node: ProseMirrorNode, language: string): HighlightRange[] {
  const cached = rangeCache.get(node);
  if (cached) return cached;

  let ranges: HighlightRange[] = [];
  try {
    const tree = lowlight.highlight(language, node.textContent);
    ranges = hastToRanges(tree.children as HastNode[]);
  } catch (error) {
    console.warn("구문 강조에 실패했어요", error);
  }
  rangeCache.set(node, ranges);
  return ranges;
}

/** 코드 블록 하나의 구문 강조 장식. 색을 입힐 수 없는 블록(언어 모름·미로드·너무 큼)은 빈 목록이다. */
function blockDecorations(node: ProseMirrorNode, pos: number): Decoration[] {
  const language = resolveLanguage(node.attrs.language as string | null);
  if (!language || !isLanguageLoaded(language) || node.textContent.length > MAX_HIGHLIGHT_CHARS) return [];
  const start = pos + 1; // 블록 안쪽 시작
  return rangesFor(node, language).map((range) =>
    Decoration.inline(start + range.from, start + range.to, { class: range.className }),
  );
}

/** 문서 안의 모든 코드 블록에 구문 강조 장식을 만든다. 아직 불러오지 못한 언어는 색 없이 둔다. */
export function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return true;
    decorations.push(...blockDecorations(node, pos));
    return false; // 코드 블록 안쪽은 더 볼 필요가 없다
  });

  return DecorationSet.create(doc, decorations);
}

/**
 * 글자 하나를 칠 때마다 문서 전체의 장식을 새로 만들면 문서가 클수록 입력이 느려진다
 * (코드 블록 400개가 든 6000블록 문서에서 한 글자에 약 100ms였다).
 * 그래서 이전 장식을 이번 변경에 맞게 옮기고, **바뀐 구간에 닿는 코드 블록만** 다시 만든다.
 * 결과는 `buildDecorations(tr.doc)`와 같아야 한다 (시험에서 무작위 편집으로 견준다).
 */
export function updateDecorations(previous: DecorationSet, tr: Transaction): DecorationSet {
  const doc = tr.doc;
  let set = previous.map(tr.mapping, doc);

  // 변경된 구간을 최종 문서 좌표로 모은다.
  const maps = tr.mapping.maps;
  const changed: Array<[number, number]> = [];
  maps.forEach((map, index) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      let from = newStart;
      let to = newEnd;
      for (let next = index + 1; next < maps.length; next++) {
        from = maps[next].map(from, -1);
        to = maps[next].map(to, 1);
      }
      changed.push([from, to]);
    });
  });

  // 그 구간에 닿는 코드 블록들 (경계에서 닿는 것까지 넉넉히 본다).
  const blocks = new Map<number, ProseMirrorNode>();
  for (const [from, to] of changed) {
    doc.nodesBetween(Math.max(0, from - 1), Math.min(doc.content.size, to + 1), (node, pos) => {
      if (node.type.name !== "codeBlock") return true;
      blocks.set(pos, node);
      return false;
    });
  }

  for (const [pos, node] of blocks) {
    set = set.remove(set.find(pos, pos + node.nodeSize));
    set = set.add(doc, blockDecorations(node, pos));
  }
  return set;
}

/** 문서에서 쓰는 코드 블록 언어(정식 이름)를 모은다. */
export function usedLanguages(doc: ProseMirrorNode): Set<string> {
  const used = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name !== "codeBlock") return true;
    const language = resolveLanguage(node.attrs.language as string | null);
    if (language) used.add(language);
    return false;
  });
  return used;
}
