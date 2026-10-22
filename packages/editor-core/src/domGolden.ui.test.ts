// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PmNode } from "@9um4/editor-schema/pmDoc";
import { CompletionMenuList } from "./completion/CompletionMenuList";
import { createCoreExtensions } from "./coreExtensions";
import { MermaidViewer } from "./extensions/MermaidViewer";
import { FootnoteEditorHost } from "./footnote/FootnoteEditorHost";
import { openFootnoteEditor } from "./footnote/footnoteEdit";
import type { LatexCommand } from "./lib/latexCommands";
import { LatexCompletionMenu } from "./math/LatexCompletionMenu";
import { MathEditorHost } from "./math/MathEditorHost";
import { openMathEditor } from "./math/mathEdit";
import { EditorPortsProvider } from "./ports/context";
import { memoryPorts } from "./ports/memory";
import { TableToolbar } from "./table/TableToolbar";
import { formatDom, maskKatex, withFixedIds } from "./testing/mountGolden";

/**
 * 메뉴·편집 창·막대 DOM 골든 (P5-0; `domGolden.test.ts`의 짝). 분리 뒤에도 같은 골든 파일과 비교된다.
 * 위치(left/top)는 happy-dom이 계산하지 못해 0으로 나오므로 값 자체는 의미가 없고, DOM 구조·클래스·접근성 속성이 고정된다.
 */

vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), parse: vi.fn(async () => true), render: vi.fn(async (id: string) => ({ svg: `<svg id="${id}"></svg>` })) } }));

const t = (text: string): PmNode => ({ type: "text", text });
const p = (...content: PmNode[]): PmNode => ({ type: "paragraph", content });

let root: Root | null = null;
let editor: Editor | null = null;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  editor?.destroy();
  root = null;
  editor = null;
  document.body.innerHTML = "";
});

async function mount(content: PmNode, extra?: ReactNode): Promise<Editor> {
  const ports = memoryPorts();
  const container = document.createElement("div");
  document.body.appendChild(container);
  editor = new Editor({ extensions: createCoreExtensions(null, { ports }), content: withFixedIds(content) });
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(EditorPortsProvider, { ports, children: [createElement(EditorContent, { key: "c", editor }), extra] }));
  });
  return editor;
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 30))));

describe("DOM 골든: 메뉴·편집 창", () => {
  it("슬래시 메뉴 (/ 를 치면 뜬다)", async () => {
    const e = await mount({ type: "doc", content: [p()] });
    await act(async () => {
      e.view.dispatch(e.state.tr.insertText("/"));
    });
    await settle();
    const menu = document.querySelector('[role="listbox"][aria-label="명령 메뉴"]');
    expect(menu).not.toBeNull();
    await expect(formatDom(menu!.parentElement!.outerHTML)).toMatchFileSnapshot("./__golden__/slash-menu.html");
  });

  it("슬래시 메뉴에 검색어를 치면 걸러진 목록", async () => {
    const e = await mount({ type: "doc", content: [p()] });
    for (const ch of "/제목") {
      await act(async () => {
        e.view.dispatch(e.state.tr.insertText(ch));
      });
    }
    await settle();
    const menu = document.querySelector('[role="listbox"][aria-label="명령 메뉴"]');
    await expect(formatDom(menu!.parentElement!.outerHTML)).toMatchFileSnapshot("./__golden__/slash-menu-filtered.html");
  });

  it("수식 편집 창 (인라인)", async () => {
    const e = await mount({ type: "doc", content: [p(t("수식 "), { type: "mathInline", attrs: { latex: "x^2" } }), p(t("끝"))] }, createElement(MathEditorHost, { key: "m" }));
    await act(async () => openMathEditor(e, 4));
    await settle();
    const card = document.querySelector('[data-testid="math-editor"]');
    expect(card).not.toBeNull();
    await expect(formatDom(maskKatex(card!).outerHTML)).toMatchFileSnapshot("./__golden__/math-editor.html");
  });

  it("각주 편집 창", async () => {
    const e = await mount({ type: "doc", content: [p(t("글"), { type: "footnote", attrs: { text: "각주" } }), p(t("끝"))] }, createElement(FootnoteEditorHost, { key: "f" }));
    await act(async () => openFootnoteEditor(e, 2));
    await settle();
    const card = document.querySelector('[data-testid="footnote-editor"]');
    expect(card).not.toBeNull();
    await expect(formatDom(card!.outerHTML)).toMatchFileSnapshot("./__golden__/footnote-editor.html");
  });

  it("표 편집 막대 (표 안에 커서)", async () => {
    const e = await mount(
      { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [p(t("가"))] }, { type: "tableHeader", content: [p(t("나"))] }] }] }, p(t("끝"))] },
      createElement(TableToolbar, { key: "tb", editor: null }),
    );
    // editor를 prop으로 넘기려면 마운트 뒤에 다시 그린다.
    await act(async () => {
      e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 4)));
      root!.render(createElement(EditorPortsProvider, { ports: memoryPorts(), children: [createElement(EditorContent, { key: "c", editor: e }), createElement(TableToolbar, { key: "tb", editor: e })] }));
    });
    await settle();
    const bar = document.querySelector('[data-testid="table-toolbar"]');
    expect(bar).not.toBeNull();
    await expect(formatDom(bar!.outerHTML)).toMatchFileSnapshot("./__golden__/table-toolbar.html");
  });
});

describe("DOM 골든: 조각 (속성으로 그려지는 것)", () => {
  it("코드 자동완성 메뉴", async () => {
    const html = renderToStaticMarkup(
      createElement(CompletionMenuList, {
        items: [
          { word: "const", kind: "keyword" },
          { word: "console", kind: "builtin" },
          { word: "constant", kind: "word" },
        ],
        command: () => {},
      }),
    );
    await expect(formatDom(html)).toMatchFileSnapshot("./__golden__/completion-menu.html");
  });

  it("LaTeX 명령 자동완성 메뉴", async () => {
    const items: LatexCommand[] = [
      { name: "frac", kind: "구조", desc: "분수", insert: "\\frac{$0}{}", example: "\\frac{a}{b}" },
      { name: "sqrt", kind: "구조", desc: "제곱근", insert: "\\sqrt{$0}", example: "\\sqrt{x}" },
    ] as LatexCommand[];
    const html = renderToStaticMarkup(createElement(LatexCompletionMenu, { items, active: 1, above: false, onPick: () => {}, onHover: () => {} }));
    await expect(formatDom(html)).toMatchFileSnapshot("./__golden__/latex-menu.html");
  });

  it("mermaid 크게 보기 (포털이라 실제로 마운트한다)", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(EditorPortsProvider, { ports: memoryPorts(), children: createElement(MermaidViewer, { svg: '<svg width="100" height="50"></svg>', onClose: () => {} }) }));
    });
    await settle();
    await expect(formatDom(document.body.innerHTML)).toMatchFileSnapshot("./__golden__/mermaid-viewer.html");
  });
});
