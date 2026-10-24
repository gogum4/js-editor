import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

import { detectEmbed, EMBED_DEFAULT_SIZE, EMBED_IFRAME_ALLOW, embedSource, isEmbedProvider, normalizeEmbedSize, normalizeEmbedTarget } from "@gogum4/editor-schema/embed";
import { portsOf, stringsOf } from "../ports/editorPorts";
import type { NodeViewOptions } from "../ports/ui";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      /** 주소로 임베드를 커서 자리에 끼운다. 지원하지 않는 주소면 하지 않는다. */
      insertEmbed: (url: string) => ReturnType;
      /** 주소를 적는 빈 임베드 카드를 끼운다(`/임베드`). */
      insertEmptyEmbed: () => ReturnType;
    };
  }
}

/**
 * 외부 임베드 노드(영상·게시물): 문서에는 정규화한 원래 주소(`url`)와 공급자(`provider`), 선택 크기(`width`·`height`)만 저장한다.
 * 주소 하나로 공급자를 알아내고(`detectEmbed`), 허용한 도메인의 iframe만 그린다(`embedSource`). `createCoreExtensions({ embed: true })`로 켠다 —
 * 노드를 더하는 것이므로 본문을 저장하는 소비자는 본문 스키마 버전을 올려야 한다(노트 앱은 켜지 않는다). 기본 화면은 React 없이 DOM으로 그린다.
 * `url`이 비어 있으면 주소를 적는 입력 상자가 보인다(`/임베드`가 이 상태로 끼운다).
 */
export const Embed = Node.create<NodeViewOptions>({
  name: "embed",
  addOptions: () => ({ nodeView: null }),
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-provider") ?? "",
        renderHTML: (attributes) => (isEmbedProvider(attributes.provider) ? { "data-provider": attributes.provider } : {}),
      },
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-url") ?? "",
        renderHTML: (attributes) => ({ "data-url": String(attributes.url ?? "") }),
      },
      width: {
        default: null,
        parseHTML: (element) => normalizeEmbedSize(element.getAttribute("data-width")),
        renderHTML: (attributes) => {
          const width = normalizeEmbedSize(attributes.width);
          return width === null ? {} : { "data-width": String(width) };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => normalizeEmbedSize(element.getAttribute("data-height")),
        renderHTML: (attributes) => {
          const height = normalizeEmbedSize(attributes.height);
          return height === null ? {} : { "data-height": String(height) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-embed]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-embed": "", class: "md-embed" }, HTMLAttributes), String(node.attrs.url ?? "")];
  },

  addNodeView() {
    return this.options.nodeView ?? embedDomView;
  },

  addCommands() {
    return {
      insertEmbed:
        (url) =>
        ({ commands }) => {
          const target = detectEmbed(url);
          return target === null ? false : commands.insertContent({ type: this.name, attrs: { provider: target.provider, url: target.url } });
        },
      insertEmptyEmbed:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { provider: "", url: "" } }),
    };
  },
});

/** 입력 글을 받아들이는 방법: 외부 공급자면 그 노드로, 소비자의 참조 대상이면 참조 노드로 바꾼다. 둘 다 아니면 false. */
export function applyEmbedInput(editor: Editor, pos: number, input: string): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "embed") return false;
  const target = detectEmbed(input);
  if (target !== null) {
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, provider: target.provider, url: target.url }));
    return true;
  }
  const reference = portsOf(editor).parseEmbedInput?.(input.trim()) ?? null;
  const referenceType = editor.schema.nodes.reference;
  if (reference !== null && referenceType) {
    const attrs = { kind: reference.kind, id: reference.id, props: reference.props ?? null };
    editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, referenceType.create(attrs)));
    return true;
  }
  return false;
}

/** 기본 DOM 화면: 주소가 있으면 iframe과 작은 줄(원본 열기·주소 바꾸기), 없거나 바꾸는 중이면 주소 입력 상자. */
function embedDomView({ node: initial, editor, getPos }: { node: PmNode; editor: Editor; getPos: () => number | undefined }) {
  let node = initial;
  const strings = stringsOf(editor).embed;

  const dom = document.createElement("div");
  dom.className = "md-embed";
  dom.setAttribute("data-embed", "");
  dom.contentEditable = "false";

  let editing = false;

  const render = () => {
    dom.replaceChildren();
    const target = normalizeEmbedTarget(node.attrs.provider, node.attrs.url);
    dom.setAttribute("data-provider", target?.provider ?? "");
    dom.setAttribute("data-url", String(node.attrs.url ?? ""));
    if (target === null || editing) {
      dom.setAttribute("data-state", "input");
      renderInput(target === null ? "" : target.url);
      return;
    }
    dom.setAttribute("data-state", "ready");
    const src = embedSource(target);
    const defaults = EMBED_DEFAULT_SIZE[target.provider];
    const width = normalizeEmbedSize(node.attrs.width) ?? defaults.width;
    const height = normalizeEmbedSize(node.attrs.height);
    const frame = document.createElement("div");
    frame.className = "md-embed-frame";
    frame.style.width = `${width}px`;
    frame.style.maxWidth = "100%";
    if (height === null && defaults.aspect) frame.style.aspectRatio = `${defaults.width} / ${defaults.height}`;
    else frame.style.height = `${height ?? defaults.height}px`;
    if (src !== null) {
      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.title = strings.frameTitle(target.provider);
      iframe.loading = "lazy";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-presentation");
      iframe.setAttribute("allow", EMBED_IFRAME_ALLOW[target.provider]);
      iframe.allowFullscreen = target.provider === "youtube";
      frame.append(iframe);
    }
    const bar = document.createElement("div");
    bar.className = "md-embed-bar";
    const open = document.createElement("a");
    open.href = target.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer nofollow";
    open.textContent = strings.open;
    const change = document.createElement("button");
    change.type = "button";
    change.textContent = strings.edit;
    change.addEventListener("click", () => {
      editing = true;
      render();
    });
    bar.append(open, change);
    dom.append(frame, bar);
  };

  const renderInput = (value: string) => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "md-embed-input";
    input.placeholder = strings.placeholder;
    input.value = value;
    input.setAttribute("aria-label", strings.placeholder);
    const message = document.createElement("div");
    message.className = "md-embed-message";
    message.setAttribute("role", "status");

    const commit = () => {
      const text = input.value.trim();
      const pos = getPos();
      if (text === "" || pos === undefined) return;
      if (applyEmbedInput(editor, pos, text)) {
        editing = false;
        return;
      }
      message.textContent = strings.invalid;
    };
    const cancel = () => {
      const pos = getPos();
      if (pos === undefined) return;
      editing = false;
      // 아직 주소가 없던 카드는 지우고, 바꾸던 카드는 그대로 둔다.
      if (normalizeEmbedTarget(node.attrs.provider, node.attrs.url) === null) {
        editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
        editor.commands.focus();
      } else render();
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener("input", () => {
      message.textContent = "";
    });
    dom.append(input, message);
    // 방금 끼운 빈 카드는 바로 적을 수 있게 포커스를 준다.
    queueMicrotask(() => {
      if (dom.isConnected) input.focus();
    });
  };

  render();

  return {
    dom,
    update(next: PmNode) {
      if (next.type !== node.type) return false;
      node = next;
      editing = false;
      render();
      return true;
    },
    // 입력 상자의 키·붙여넣기는 에디터가 가로채지 않는다.
    stopEvent: (event: Event) => event.target instanceof HTMLElement && (event.target.tagName === "INPUT" || event.target.tagName === "BUTTON" || event.target.tagName === "A"),
    ignoreMutation: () => true,
  };
}
