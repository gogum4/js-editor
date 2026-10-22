// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaidMock }));

import { MermaidDiagram } from "./MermaidDiagram.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  mermaidMock.initialize.mockReset();
  mermaidMock.parse.mockReset().mockResolvedValue(true);
  mermaidMock.render.mockReset().mockImplementation(async (id: string) => ({ svg: `<svg id="${id}"><g/></svg>` }));
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function mount(source: string, theme?: "dark") {
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(MermaidDiagram, { source, theme }));
  });
  // 동적 import와 render()의 비동기 작업이 끝나도록 기다린다.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("MermaidDiagram", () => {
  it("서버 출력은 소스를 담은 <pre class=mermaid>이다 (JS가 꺼져도 소스가 보인다)", () => {
    expect(renderToStaticMarkup(createElement(MermaidDiagram, { source: "graph TD;A-->B" }))).toBe('<pre class="mermaid">graph TD;A--&gt;B</pre>');
  });

  it("브라우저에서 mermaid가 그린 SVG로 바뀐다 (securityLevel strict)", async () => {
    await mount("graph TD;A-->B", "dark");
    expect(container.querySelector(".mermaid-diagram svg")).not.toBeNull();
    expect(container.querySelector("pre.mermaid")).toBeNull();
    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: "strict", theme: "dark" }));
    expect(mermaidMock.render.mock.calls[0]![0]).toMatch(/^mermaid-[a-zA-Z0-9]+$/);
  });

  it("문법이 틀리면(parse 실패) 소스가 그대로 남고 그림을 그리지 않는다", async () => {
    mermaidMock.parse.mockRejectedValue(new Error("Parse error"));
    await mount("not a diagram");
    expect(container.querySelector("pre.mermaid")?.textContent).toBe("not a diagram");
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it("render가 실패해도 소스가 남는다", async () => {
    mermaidMock.render.mockRejectedValue(new Error("boom"));
    await mount("graph TD;A-->B");
    expect(container.querySelector("pre.mermaid")).not.toBeNull();
  });
});
