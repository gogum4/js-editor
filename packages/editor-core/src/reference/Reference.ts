import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

import { referenceTarget } from "@9um4/editor-schema/reference";
import { portsOf, stringsOf } from "../ports/editorPorts";
import type { ReferenceInfo, ReferenceResolver } from "../ports/types";
import type { NodeViewOptions } from "../ports/ui";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reference: {
      /** 다른 개체를 가리키는 참조 카드를 커서 자리에 끼운다. kind·id가 올바르지 않으면 하지 않는다. */
      insertReference: (kind: string, id: string) => ReturnType;
    };
  }
}

/**
 * 일반 참조 노드(docs/EDITOR-PACKAGE.md §2, P7): 문서에는 다른 개체의 `kind`·`id`만 저장하고, 보여 줄 때 소비자가 주입한 해석기
 * (`EditorPorts.references[kind]`)가 제목·미리 보기를 읽어 카드를 그린다. 원본이 바뀌면(`subscribe`) 카드도 따라 바뀐다.
 * `createCoreExtensions({ reference: true })`로 켠다 — 노드를 더하는 것이므로 본문을 저장하는 소비자는 본문 스키마 버전을 올려야 한다(노트 앱은 켜지 않는다).
 * 기본 화면은 React 없이 DOM으로 그린다. 소비자가 `views.reference`로 바꿀 수 있다.
 */
export const Reference = Node.create<NodeViewOptions>({
  name: "reference",
  addOptions: () => ({ nodeView: null }),
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-kind") ?? "",
        renderHTML: (attributes) => ({ "data-kind": String(attributes.kind ?? "") }),
      },
      id: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-id") ?? "",
        renderHTML: (attributes) => ({ "data-id": String(attributes.id ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-reference]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-reference": "", class: "md-reference" }, HTMLAttributes), `${node.attrs.kind}:${node.attrs.id}`];
  },

  addNodeView() {
    return this.options.nodeView ?? referenceDomView;
  },

  addCommands() {
    return {
      insertReference:
        (kind, id) =>
        ({ commands }) => {
          const target = referenceTarget(kind, id);
          return target === null ? false : commands.insertContent({ type: this.name, attrs: target });
        },
    };
  },
});

type State = "loading" | "ready" | "missing" | "unresolved" | "unknown";

/** 기본 DOM 화면. */
function referenceDomView({ node: initial, editor }: { node: PmNode; editor: Editor }) {
  let node = initial;
  const strings = stringsOf(editor);

  const dom = document.createElement("div");
  dom.className = "md-reference";
  dom.setAttribute("data-reference", "");
  dom.contentEditable = "false";
  const head = document.createElement("div");
  head.className = "md-reference-head";
  const kindEl = document.createElement("span");
  kindEl.className = "md-reference-kind";
  const titleEl = document.createElement("span");
  titleEl.className = "md-reference-title";
  head.append(kindEl, titleEl);
  const descEl = document.createElement("div");
  descEl.className = "md-reference-desc";
  const previewEl = document.createElement("div");
  previewEl.className = "md-reference-preview";
  dom.append(head, descEl, previewEl);

  let token = 0;
  let unsubscribe: (() => void) | null = null;
  let cleanupPreview: (() => void) | null = null;
  let resolver: ReferenceResolver | null = null;

  const clearPreview = () => {
    cleanupPreview?.();
    cleanupPreview = null;
    previewEl.replaceChildren();
  };

  const paint = (state: State, info: ReferenceInfo | null) => {
    const { kind, id } = node.attrs as { kind: string; id: string };
    dom.setAttribute("data-kind", kind);
    dom.setAttribute("data-id", id);
    dom.setAttribute("data-state", state);
    dom.classList.toggle("md-reference-clickable", state === "ready" && typeof resolver?.open === "function");
    kindEl.textContent = kind;
    clearPreview();
    switch (state) {
      case "loading":
        titleEl.textContent = strings.reference.loading;
        descEl.textContent = "";
        break;
      case "ready":
        titleEl.textContent = info?.title ?? id;
        descEl.textContent = info?.description ?? "";
        dom.title = strings.reference.openLabel(info?.title ?? id);
        if (info && resolver?.renderPreview) {
          const cleanup = resolver.renderPreview(info, previewEl);
          if (typeof cleanup === "function") cleanupPreview = cleanup;
        }
        break;
      case "missing":
        titleEl.textContent = id;
        descEl.textContent = strings.reference.missing;
        break;
      case "unresolved":
        titleEl.textContent = id;
        descEl.textContent = strings.reference.unresolved;
        break;
      case "unknown":
        titleEl.textContent = id;
        descEl.textContent = strings.reference.unknownKind(kind);
        break;
    }
  };

  /** 대상의 내용을 (다시) 읽어 그린다. 구독은 건드리지 않는다 — 알림 안에서 다시 구독하면 알림이 끝나지 않을 수 있다. */
  const refresh = () => {
    const mine = ++token;
    const { id } = node.attrs as { id: string };
    if (resolver === null) {
      paint("unknown", null);
      return;
    }
    paint("loading", null);
    resolver.resolve(id).then(
      (info) => {
        if (mine === token) paint(info === null ? "missing" : "ready", info);
      },
      (error) => {
        if (mine !== token) return;
        paint("unresolved", null);
        portsOf(editor).notifier.error(error);
      },
    );
  };

  /** 대상이 정해지거나 바뀌었을 때: 해석기를 찾고, 구독을 새로 하고, 읽는다. */
  const load = () => {
    const { kind, id } = node.attrs as { kind: string; id: string };
    resolver = portsOf(editor).references?.[kind] ?? null;
    unsubscribe?.();
    // 해석기가 알려 주면(원본이 바뀜·삭제됨) 다시 읽는다.
    unsubscribe = resolver?.subscribe?.(id, refresh) ?? null;
    refresh();
  };

  dom.addEventListener("click", () => {
    const { id } = node.attrs as { id: string };
    if (dom.getAttribute("data-state") === "ready") void resolver?.open?.(id);
  });

  load();

  return {
    dom,
    update(next: PmNode) {
      if (next.type !== node.type) return false;
      const changed = next.attrs.kind !== node.attrs.kind || next.attrs.id !== node.attrs.id;
      node = next;
      if (changed) load();
      return true;
    },
    stopEvent: () => false,
    ignoreMutation: () => true,
    destroy() {
      token += 1;
      unsubscribe?.();
      clearPreview();
    },
  };
}
