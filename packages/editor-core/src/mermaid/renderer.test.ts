import { describe, expect, it } from "vitest";

import { isMermaidLanguage, summarizeMermaidError } from "./renderer";

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
