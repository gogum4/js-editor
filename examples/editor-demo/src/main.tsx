import { Editor, getSchema } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { prosemirrorJSONToYXmlFragment } from "@tiptap/y-tiptap";
import { createRoot } from "react-dom/client";
import * as Y from "yjs";

import { memoryPorts, type AssetStore, type ReferenceResolver } from "@gogum4/editor-core";
import { createReactExtensions, EditorPortsProvider, FootnoteEditorHost, MathEditorHost, TableToolbar } from "@gogum4/editor-react";
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

/**
 * `?ref=1`: PlanBench의 "표 스키마 미리 보기"를 흉내 낸 참조 종류(`table-schema`). 문서에는 id만 있고 카드의 제목·열 목록은 이 저장소에서 읽는다 —
 * 코어는 스키마의 모양을 모르고, 미리 보기는 해석기의 `renderPreview`가 DOM으로 그린다(동작 시험 전용).
 */
interface DemoSchema {
  title: string;
  columns: string[];
}
const schemas = new Map<string, DemoSchema>([["monster", { title: "몬스터", columns: ["이름", "체력", "공격력"] }]]);
const schemaListeners = new Map<string, Set<() => void>>();
const notifySchema = (id: string) => [...(schemaListeners.get(id) ?? [])].forEach((listener) => listener());
const schemaResolver: ReferenceResolver = {
  resolve: async (id) => {
    const schema = schemas.get(id);
    return schema ? { title: schema.title, description: `열 ${schema.columns.length}개`, preview: schema.columns } : null;
  },
  open: (id) => {
    opened.push(`schema:${id}`);
  },
  subscribe: (id, listener) => {
    const set = schemaListeners.get(id) ?? new Set();
    set.add(listener);
    schemaListeners.set(id, set);
    return () => set.delete(listener);
  },
  renderPreview: (info, container) => {
    const table = document.createElement("table");
    table.className = "demo-schema-preview";
    const row = table.insertRow();
    for (const column of info.preview as string[]) row.insertCell().textContent = column;
    container.appendChild(table);
    return () => table.remove();
  },
};

const ports = memoryPorts({
  references: { "table-schema": schemaResolver },
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
const ref = params.has("ref");
const withRefs = (base: typeof DEMO_DOC) =>
  ref
    ? {
        ...base,
        content: [
          ...(base.content ?? []),
          { type: "reference", attrs: { kind: "table-schema", id: "monster" } },
          { type: "reference", attrs: { kind: "table-schema", id: "gone" } },
          { type: "reference", attrs: { kind: "unknown-kind", id: "x" } },
        ],
      }
    : base;
const doc = withRefs(raw
  ? {
      ...DEMO_DOC,
      content: [
        ...(DEMO_DOC.content ?? []),
        { type: "raw", attrs: { text: ":::fold{h=1}\n안쪽 줄\n:::" } },
        { type: "paragraph", content: [{ type: "text", text: "앞 " }, { type: "rawInline", attrs: { text: ":postlink[글]{slug=a}" } }, { type: "text", text: " 뒤" }] },
      ],
    }
  : DEMO_DOC);
const ydoc = collab ? new Y.Doc() : null;
const extensions = createReactExtensions(ydoc, { ports, raw, reference: ref });
if (ydoc) prosemirrorJSONToYXmlFragment(getSchema(extensions), doc, ydoc.getXmlFragment("default"));

const editor = new Editor({
  extensions,
  ...(ydoc ? {} : { content: doc }),
  editorProps: { attributes: { class: "md-editor", "aria-label": "본문" } },
});

(window as unknown as { __demo: unknown }).__demo = {
  editor,
  ydoc,
  opened,
  /** 동작 시험용: 가짜 표 스키마를 바꾸거나(`null`이면 지움) 알린다. */
  setSchema: (id: string, schema: DemoSchema | null) => {
    if (schema === null) schemas.delete(id);
    else schemas.set(id, schema);
    notifySchema(id);
  },
};

createRoot(document.getElementById("root")!).render(
  <EditorPortsProvider ports={ports}>
    <EditorContent editor={editor} />
    <TableToolbar editor={editor} />
    <MathEditorHost />
    <FootnoteEditorHost />
  </EditorPortsProvider>,
);
