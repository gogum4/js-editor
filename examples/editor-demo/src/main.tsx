import { Editor, getSchema } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { createRoot } from "react-dom/client";
import * as Y from "yjs";

import { memoryPorts, type AssetStore } from "@9um4/editor-core";
import { createReactExtensions, EditorPortsProvider, FootnoteEditorHost, MathEditorHost, TableToolbar } from "@9um4/editor-react";
import { DEMO_DOC } from "./demoDoc";

/**
 * 노트 앱 없이 에디터 패키지만으로 편집기를 띄운다. 이미지는 브라우저에서 그린 작은 PNG, 설정 저장소·링크 열기는 메모리/기록용이다.
 * `?collab=1`이면 실제 Yjs 문서(Collaboration)를 쓴다 — 노트 앱이 쓰는 경로다. 시각·동작 시험이 두 경로를 다 확인한다.
 */

async function samplePng(): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 80;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3b82f6";
  ctx.fillRect(0, 0, 160, 80);
  ctx.fillStyle = "#fff";
  ctx.fillRect(20, 20, 40, 40);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

const assets: AssetStore = {
  put: async () => ({ hash: "b".repeat(64), mime: "image/png" }),
  get: () => samplePng(),
};

const opened: string[] = [];
const ports = memoryPorts({
  assets,
  links: {
    open: async (url) => {
      opened.push(url);
    },
  },
});

const params = new URLSearchParams(window.location.search);
const collab = params.has("collab");
// `?raw=1`이면 모르는 문법을 원문 그대로 담는 `raw` 노드를 켜고 끝에 예를 붙인다(동작 시험 전용; 기준 스타일에는 영향이 없다).
const raw = params.has("raw");
const doc = raw
  ? {
      ...DEMO_DOC,
      content: [
        ...DEMO_DOC.content,
        { type: "raw", attrs: { text: ":::fold{h=1}\n안쪽 줄\n:::" } },
        { type: "paragraph", content: [{ type: "text", text: "앞 " }, { type: "rawInline", attrs: { text: ":postlink[글]{slug=a}" } }, { type: "text", text: " 뒤" }] },
      ],
    }
  : DEMO_DOC;
const ydoc = collab ? new Y.Doc() : null;
const extensions = createReactExtensions(ydoc, { ports, raw });
if (ydoc) prosemirrorJSONToYXmlFragment(getSchema(extensions), doc, ydoc.getXmlFragment("default"));

const editor = new Editor({
  extensions,
  ...(ydoc ? {} : { content: doc }),
  editorProps: { attributes: { class: "md-editor", "aria-label": "본문" } },
});

(window as unknown as { __demo: unknown }).__demo = { editor, ydoc, opened };

createRoot(document.getElementById("root")!).render(
  <EditorPortsProvider ports={ports}>
    <EditorContent editor={editor} />
    <TableToolbar editor={editor} />
    <MathEditorHost />
    <FootnoteEditorHost />
  </EditorPortsProvider>,
);
