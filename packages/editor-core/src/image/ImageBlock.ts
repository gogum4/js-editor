import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { normalizeImageWidth } from "@9um4-utils/editor-schema/imageLayout";
import { insertImageFiles } from "./insertImages";
import type { NodeViewOptions } from "../ports/ui";

/**
 * 첨부 이미지 블록. **이미지 바이트는 저장소(`assets`)에 있고 본문에는 내용의 해시(`hash`)와 형식(`mime`), 대체 글자(`alt`)만** 들어간다.
 * **너비(`width`, px)** 는 있을 때만 저장한다(높이는 비율대로 정해진다). **정렬**은 문단과 같은 `textAlign` 속성(TextAlign 확장)이 맡는다.
 * 한 덩어리(atom)라서 커서가 안으로 들어가지 않고, 선택하고 Backspace로 지우거나 끌어서 옮긴다.
 * 이미지 파일을 붙여넣거나 끌어다 놓으면 저장소에 넣고 이 블록으로 끼운다.
 */
export const ImageBlock = Node.create<NodeViewOptions>({
  name: "image",

  // 노드 뷰는 소비자가 주입한다(`createCoreExtensions({ views })`). 없으면 renderHTML 기본 렌더.
  addOptions: () => ({ nodeView: null }),
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      hash: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-hash") ?? "",
        renderHTML: (attributes) => ({ "data-hash": attributes.hash }),
      },
      mime: {
        default: "image/png",
        parseHTML: (element) => element.getAttribute("data-mime") ?? "image/png",
        renderHTML: (attributes) => ({ "data-mime": attributes.mime }),
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("alt") ?? "",
        renderHTML: (attributes) => (attributes.alt ? { alt: attributes.alt } : {}),
      },
      width: {
        default: null,
        parseHTML: (element) => normalizeImageWidth(element.getAttribute("width")),
        renderHTML: (attributes) => {
          const width = normalizeImageWidth(attributes.width);
          return width === null ? {} : { width };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-hash]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return this.options.nodeView;
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const imageFiles = (list: FileList | null | undefined) =>
      [...(list ?? [])].filter((file) => file.type.startsWith("image/"));

    return [
      new Plugin({
        key: new PluginKey("imageFiles"),
        props: {
          // 이미지를 붙여넣으면(스크린샷 등) 저장소에 넣고 끼운다. 글자도 함께 들어 있으면(웹 페이지·문서에서 복사) 그쪽을 따른다.
          handlePaste: (_view, event) => {
            const files = imageFiles(event.clipboardData?.files);
            if (files.length === 0) return false;
            if (event.clipboardData?.getData("text/plain")) return false;
            event.preventDefault();
            void insertImageFiles(editor, files);
            return true;
          },
        },
        // 이미지 파일을 끌어다 놓으면 놓은 자리에 끼운다. ProseMirror의 handleDrop이 아니라 DOM에 직접 붙이는 이유:
        // 사이드바 트리의 react-dnd가 파일 드롭을 캡처 단계에서 먼저 preventDefault해 버려서,
        // ProseMirror는 "이미 처리된 이벤트"로 보고 무시한다.
        view: (editorView) => {
          const onDrop = (event: DragEvent) => {
            const files = imageFiles(event.dataTransfer?.files);
            if (files.length === 0) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const at = editorView.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            void insertImageFiles(editor, files, at);
          };
          editorView.dom.addEventListener("drop", onDrop, true);
          return { destroy: () => editorView.dom.removeEventListener("drop", onDrop, true) };
        },
      }),
    ];
  },
});
