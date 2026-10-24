// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { isMermaidLanguage, peekMermaid, renderMermaid, summarizeMermaidError } from "./renderer";

const calls = vi.hoisted(() => ({ render: 0, parse: 0 }));
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    parse: async (source: string) => {
      calls.parse++;
      if (source.includes("BAD")) throw new Error("Parse error");
    },
    render: async (_id: string, source: string) => {
      calls.render++;
      return { svg: `<svg>${source}</svg>` };
    },
  },
}));

describe("isMermaidLanguage", () => {
  it("matches mermaid regardless of case and spaces", () => {
    expect(isMermaidLanguage("mermaid")).toBe(true);
    expect(isMermaidLanguage(" Mermaid ")).toBe(true);
  });

  it("rejects other or missing languages", () => {
    expect(isMermaidLanguage("typescript")).toBe(false);
    expect(isMermaidLanguage("")).toBe(false);
    expect(isMermaidLanguage(null)).toBe(false);
    expect(isMermaidLanguage(undefined)).toBe(false);
  });
});

describe("summarizeMermaidError", () => {
  it("keeps only the first lines and drops blank ones", () => {
    const error = new Error("Parse error on line 2:\n\n...A-->\n----^\nExpecting X\nmore\nmore");
    expect(summarizeMermaidError(error, 3)).toBe("Parse error on line 2:\n...A-->\n----^");
  });

  it("accepts non-Error values and falls back for empty ones", () => {
    expect(summarizeMermaidError("boom")).toBe("boom");
    expect(summarizeMermaidError(new Error(""))).toBe("");
  });
});

describe("그림 기억", () => {
  it("같은 소스는 한 번만 그리고, 다시 부르면 바로 돌려준다", async () => {
    expect(peekMermaid("graph TD\nA-->B")).toBeNull();
    const first = await renderMermaid("graph TD\nA-->B");
    expect(first).toEqual({ ok: true, svg: "<svg>graph TD\nA-->B</svg>" });
    expect(peekMermaid("graph TD\nA-->B")).toEqual(first);
    const before = calls.render;
    expect(await renderMermaid("graph TD\nA-->B")).toEqual(first);
    expect(calls.render).toBe(before);
  });

  it("문법 오류는 기억하지 않는다(고치면 다시 그려야 하므로)", async () => {
    expect((await renderMermaid("BAD")).ok).toBe(false);
    expect(peekMermaid("BAD")).toBeNull();
  });

  it("오래 안 쓴 그림부터 버린다", async () => {
    for (let i = 0; i < 70; i++) await renderMermaid(`graph TD\nN${i}-->M`);
    expect(peekMermaid("graph TD\nN0-->M")).toBeNull();
    expect(peekMermaid("graph TD\nN69-->M")).not.toBeNull();
  });
});
