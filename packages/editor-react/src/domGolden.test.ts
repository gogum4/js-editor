// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PmNode } from "@9um4-utils/editor-schema/pmDoc";
import { createReactExtensions } from "./createReactExtensions";
import { EditorPortsProvider } from "./context";
import { memoryPorts } from "@9um4-utils/editor-core";
import type { AssetStore } from "@9um4-utils/editor-core";
import { editorDom, formatDom, withFixedIds } from "@9um4-utils/editor-core/testing";

/**
 * 뷰·메뉴·편집 창 DOM 골든. P5(`editor-react` 분리)가 화면을 한 글자도 바꾸지 않았다는 것을 지키는 안전망이다.
 * 이 시험은 분리 전에 만들어졌고, 분리 뒤에도 같은 골든 파일과 비교된다(시험 파일만 `editor-react`로 옮긴다).
 * 의도한 변경이면 \`pnpm vitest run -u\`로 갱신하고 diff를 검토한다.
 *
 * 한계: happy-dom은 레이아웃(위치·크기)을 계산하지 않는다. DOM 구조와 클래스만 고정된다.
 */

// mermaid는 모의한다(실제 라이브러리를 부르지 않고 정해진 SVG를 준다).
const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(async () => true),
  render: vi.fn(async (id: string) => ({ svg: `<svg id="${id}" data-mock="mermaid"></svg>` })),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

const t = (text: string, ...marks: Array<string | { type: string; attrs: Record<string, unknown> }>): PmNode => ({
  type: "text",
  text,
  ...(marks.length ? { marks: marks.map((m) => (typeof m === "string" ? { type: m } : m)) } : {}),
});
const p = (...content: PmNode[]): PmNode => ({ type: "paragraph", content });

const HASH = "a".repeat(64);

const DOC: PmNode = withFixedIds({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [t("제목")] },
    p(t("굵게", "bold"), t(" "), t("기울임", "italic"), t(" "), t("코드", "code"), t(" "), t("밑줄", "underline"), t(" "), t("취소", "strike"), t(" "), t("링크", { type: "link", attrs: { href: "https://example.com" } })),
    { type: "bulletList", content: [{ type: "listItem", content: [p(t("글머리"))] }] },
    { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(t("셋째"))] }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("끝낸 일"))] }, { type: "taskItem", attrs: { checked: false }, content: [p(t("할 일"))] }] },
    { type: "blockquote", content: [p(t("인용"))] },
    { type: "callout", attrs: { type: "tip" }, content: [p(t("팁 콜아웃"))] },
    { type: "callout", attrs: { type: "warning" }, content: [p(t("경고 콜아웃"))] },
    { type: "codeBlock", attrs: { language: "ts" }, content: [t("const a: number = 1;")] },
    { type: "codeBlock", attrs: { language: null }, content: [t("언어 없는 코드")] },
    { type: "codeBlock", attrs: { language: "mermaid" }, content: [t("graph TD;A-->B")] },
    { type: "image", attrs: { hash: HASH, mime: "image/png", alt: "그림", width: 200, textAlign: "center" } },
    { type: "table", content: [
      { type: "tableRow", content: [{ type: "tableHeader", content: [p(t("머리"))] }, { type: "tableHeader", content: [p(t("글"))] }] },
      { type: "tableRow", content: [{ type: "tableCell", content: [p(t("1"))] }, { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(t("2"))] }] },
    ] },
    { type: "toggle", content: [p(t("토글 제목")), p(t("접힌 내용"))] },
    p(t("수식 "), { type: "mathInline", attrs: { latex: "E=mc^2" } }, t(" 와 각주"), { type: "footnote", attrs: { text: "첫 각주" } }, t(" 둘"), { type: "footnote", attrs: { text: "둘째 각주" } }),
    { type: "mathBlock", attrs: { latex: "\\frac{a}{b}" } },
    { type: "horizontalRule" },
    p(t("끝")),
  ],
});

/** 이미지는 영원히 오지 않는 저장소(불러오는 중 상태로 고정). 설정 저장소는 비어 있음(토글은 모두 열림). */
const neverAssets: AssetStore = { put: () => new Promise(() => {}), get: () => new Promise(() => {}) };

let root: Root | null = null;
let editor: Editor | null = null;
let container: HTMLElement;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => root?.unmount());
  editor?.destroy();
  root = null;
  editor = null;
  document.body.innerHTML = "";
});

/** 비동기로 도착하는 것(코드 강조, 수식, mermaid)이 끝날 때까지 기다린다. */
async function settled(predicate: () => boolean) {
  for (let i = 0; i < 60 && !predicate(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

async function mount(content: object = DOC): Promise<Editor> {
  const ports = memoryPorts({ assets: neverAssets });
  editor = new Editor({ extensions: createReactExtensions(null, { ports }), content });
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(EditorPortsProvider, { ports, children: createElement(EditorContent, { editor }) }));
  });
  return editor;
}

describe("DOM 골든: 노드 뷰", () => {
  it("모든 노드가 든 문서를 마운트한 본문 DOM", async () => {
    const e = await mount();
    await settled(() => {
      const html = e.view.dom.outerHTML;
      return html.includes("hljs-keyword") && html.includes("data-mock=\"mermaid\"") && html.includes("class=\"katex\"");
    });
    await expect(editorDom(e)).toMatchFileSnapshot("./__golden__/editor-dom.html");
  });

  it("토글을 닫으면 속성이 바뀐다", async () => {
    const e = await mount({ type: "doc", content: [withFixedIds({ type: "toggle", content: [p(t("제목")), p(t("내용"))] }), p(t("끝"))].map((n) => withFixedIds(n)) });
    const arrow = e.view.dom.querySelector<HTMLButtonElement>(".toggle-arrow")!;
    await act(async () => arrow.click());
    await expect(formatDom(e.view.dom.querySelector(".toggle-block")!.outerHTML)).toMatchFileSnapshot("./__golden__/toggle-closed.html");
  });
});
