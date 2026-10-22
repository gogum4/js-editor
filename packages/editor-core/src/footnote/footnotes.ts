import type { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep, ReplaceAroundStep, ReplaceStep } from "@tiptap/pm/transform";

/** 문서에 든 각주 하나: 노드의 위치와 내용. 번호는 문서 순서(0부터의 인덱스 + 1)다. */
export interface FootnoteInfo {
  pos: number;
  text: string;
}

export const FOOTNOTE_NODE = "footnote";

/** 문서의 각주들을 문서 순서대로 모은다. */
export function collectFootnotes(doc: ProseMirrorNode): FootnoteInfo[] {
  const notes: FootnoteInfo[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === FOOTNOTE_NODE) notes.push({ pos, text: String(node.attrs.text ?? "") });
    return true;
  });
  return notes;
}

function fragmentHasFootnote(fragment: Fragment): boolean {
  let found = false;
  fragment.descendants((node) => {
    if (node.type.name === FOOTNOTE_NODE) found = true;
    return !found;
  });
  return found;
}

/**
 * 이 트랜잭션이 각주를 더하거나 지우거나 고쳤을 수 있는지. 글자 입력처럼 각주와 상관없는 편집에서는 문서 전체를 다시 훑지 않으려는 용도다.
 * 알 수 없는 종류의 단계는 안전하게 "그럴 수 있다"로 본다.
 */
export function transactionMayChangeFootnotes(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  return tr.steps.some((step, index) => {
    if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) {
      if (fragmentHasFootnote(step.slice.content)) return true;
      // 지워지는 범위에 각주가 있었는지는 그 단계를 적용하기 전의 문서에서 본다.
      let removed = false;
      tr.docs[index]!.nodesBetween(step.from, step.to, (node) => {
        if (node.type.name === FOOTNOTE_NODE) removed = true;
        return !removed;
      });
      return removed;
    }
    // 서식(굵게 등)만 바꾸는 단계는 각주와 상관없다.
    return !(step instanceof AddMarkStep || step instanceof RemoveMarkStep);
  });
}
