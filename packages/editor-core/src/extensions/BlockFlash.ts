import { Extension } from "@tiptap/core";
import type { Node as PmNodeType } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * 블록 링크로 이동했을 때 그 블록을 잠깐 강조한다. DOM에 클래스를 직접 달면 ProseMirror가 블록을 다시 그릴 때 지워지므로
 * (실제 앱에서 확인) 플러그인 상태의 블록 id를 장식(`block-flash` 클래스)으로 그린다. 문서는 바꾸지 않는다(저장·버전에 영향 없음).
 */
export const blockFlashKey = new PluginKey<string | null>("blockFlash");

/** 문서에서 `attrs.id`가 같은 블록의 자리와 노드. 없으면 null. */
export function findBlockById(doc: PmNodeType, id: string): { pos: number; node: PmNodeType } | null {
  let found: { pos: number; node: PmNodeType } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.id === id) {
      found = { pos, node };
      return false;
    }
    return true;
  });
  return found;
}

export const BlockFlash = Extension.create({
  name: "blockFlash",

  addProseMirrorPlugins() {
    return [
      new Plugin<string | null>({
        key: blockFlashKey,
        state: {
          init: () => null,
          apply: (tr, value) => {
            const meta = tr.getMeta(blockFlashKey) as string | null | undefined;
            return meta === undefined ? value : meta;
          },
        },
        props: {
          decorations(state) {
            const id = blockFlashKey.getState(state);
            if (!id) return null;
            const hit = findBlockById(state.doc, id);
            return hit ? DecorationSet.create(state.doc, [Decoration.node(hit.pos, hit.pos + hit.node.nodeSize, { class: "block-flash" })]) : null;
          },
        },
      }),
    ];
  },
});
