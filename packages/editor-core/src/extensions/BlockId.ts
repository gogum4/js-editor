import { Extension } from "@tiptap/core";
import type { Node as PmNodeType, Slice } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceAroundStep, ReplaceStep, type Step, type StepMap } from "@tiptap/pm/transform";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { BLOCK_ID_TYPES, generateBlockId, isBlockIdType } from "@9um4-utils/editor-schema/blockId";

/**
 * 블록 id(`attrs.id`)를 붙이고 지킨다.
 * - 블록이 새로 생기는 편집(Enter로 나누기, 붙여넣기, 블록 종류 바꾸기, `/` 메뉴, 되돌리기 …) 뒤에,
 *   **바뀐 자리의** id 없는 블록에 새 id를 붙이고, 다른 블록과 id가 겹치면 겹친 쪽에 새 id를 준다(복사해 붙인 블록).
 * - 글자만 바뀌는 입력은 검사하지 않는다(블록이 생기지 않으므로 비용이 없다).
 * - 다른 기기에서 온 변경(Yjs 원격 변경)이나 문서를 처음 불러올 때의 변경에는 붙이지 않는다.
 *   그래서 **열어 보기만 한 문서는 바뀌지 않는다**(저장도 일어나지 않는다).
 * - 나뉜 블록(Enter)은 `keepOnSplit: false`라 새 쪽이 id 없이 시작해 새 id를 받는다. 원래 블록의 id는 그대로다.
 */

function sliceHasBlocks(slice: Slice): boolean {
  let found = false;
  slice.content.forEach((child) => {
    if (child.isBlock) found = true;
  });
  return found;
}

function stepIntroducesBlocks(step: Step): boolean {
  return (step instanceof ReplaceStep || step instanceof ReplaceAroundStep) && sliceHasBlocks(step.slice);
}

/** 이 트랜잭션이 블록을 새로 만들 수 있는지(그래서 id를 확인해야 하는지). */
export function transactionIntroducesBlocks(tr: Transaction): boolean {
  if (!tr.docChanged) return false;
  if ((tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin) return false;
  return tr.steps.some(stepIntroducesBlocks);
}

/** 트랜잭션들이 바꾼 자리를 마지막 문서의 좌표로 돌려준다. */
function changedRanges(transactions: readonly Transaction[]): Array<[number, number]> {
  const maps: StepMap[] = transactions.flatMap((tr) => tr.mapping.maps as StepMap[]);
  const ranges: Array<[number, number]> = [];
  maps.forEach((map, index) => {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      let from = newStart;
      let to = newEnd;
      for (const later of maps.slice(index + 1)) {
        from = later.map(from, -1);
        to = later.map(to, 1);
      }
      ranges.push([from, to]);
    });
  });
  return ranges;
}

/**
 * 문서에서 id를 고쳐야 할 블록을 찾아 새 id를 붙이는 트랜잭션을 만든다. 고칠 것이 없으면 null.
 * 붙이는 곳은 `transactions`가 바꾼 자리(와 겹치는 블록)로 한정한다 — id가 없는 옛 블록 수천 개를 Enter 한 번에
 * 모두 바꾸지 않으려는 것이다(옛 문서는 시작할 때 한 번에 붙인다).
 */
export function blockIdTransaction(state: EditorState, transactions: readonly Transaction[]): Transaction | null {
  if (!transactions.some(transactionIntroducesBlocks)) return null;
  const ranges = changedRanges(transactions);
  const touched = (pos: number, node: PmNodeType) => ranges.some(([from, to]) => pos < to && pos + node.nodeSize > from);

  // 문서 순서대로 모은다: id가 없는 블록은 바뀐 자리에 있을 때만 고치고, 같은 id를 가진 블록들은 한 곳만 id를 지킨다.
  const fixes: number[] = [];
  const byId = new Map<string, Array<{ pos: number; touched: boolean }>>();
  state.doc.descendants((node, pos) => {
    if (!isBlockIdType(node.type.name)) return true;
    const here = touched(pos, node);
    const id = node.attrs.id as unknown;
    if (typeof id !== "string" || id === "") {
      if (here) fixes.push(pos);
    } else {
      (byId.get(id) ?? byId.set(id, []).get(id)!).push({ pos, touched: here });
    }
    return true;
  });
  for (const [, holders] of byId) {
    if (holders.length < 2) continue;
    // 바뀌지 않은 쪽(원래 블록)이 id를 지키고 복사해 붙인 쪽이 새 id를 받는다. 모두 바뀌었거나 모두 그대로면 앞쪽이 지킨다.
    const keeper = holders.find((h) => !h.touched) ?? holders[0]!;
    for (const holder of holders) if (holder !== keeper) fixes.push(holder.pos);
  }
  if (fixes.length === 0) return null;

  const used = new Set<string>(byId.keys());
  const tr = state.tr;
  for (const pos of [...new Set(fixes)].sort((a, b) => a - b)) {
    let id = generateBlockId();
    while (used.has(id)) id = generateBlockId();
    used.add(id);
    tr.setNodeAttribute(pos, "id", id);
  }
  return tr;
}

export function blockIdPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey("blockId"),
    appendTransaction: (transactions, _oldState, newState) => blockIdTransaction(newState, transactions),
  });
}

export const BlockId = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_ID_TYPES],
        attributes: {
          id: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"),
            renderHTML: (attributes: Record<string, unknown>) => (attributes.id ? { "data-block-id": attributes.id } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [blockIdPlugin()];
  },
});
