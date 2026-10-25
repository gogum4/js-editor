import { describe, expect, it } from "vitest";

import { languageOptions, resolveLanguage, searchLanguages } from "./codeLanguages.ts";
import { LANGUAGE_ALIASES, LANGUAGE_NAMES } from "./languageData.generated.ts";

describe("resolveLanguage", () => {
  it("keeps canonical names and understands the common aliases", () => {
    expect(resolveLanguage("typescript")).toBe("typescript");
    expect(resolveLanguage("ts")).toBe("typescript");
    expect(resolveLanguage("tsx")).toBe("typescript");
    expect(resolveLanguage("js")).toBe("javascript");
    expect(resolveLanguage("py")).toBe("python");
    expect(resolveLanguage("sh")).toBe("bash");
    expect(resolveLanguage("yml")).toBe("yaml");
    expect(resolveLanguage("rs")).toBe("rust");
    expect(resolveLanguage("html")).toBe("xml");
    expect(resolveLanguage("c++")).toBe("cpp");
    expect(resolveLanguage("md")).toBe("markdown");
    expect(resolveLanguage("ps1")).toBe("powershell");
  });

  it("ignores case and surrounding spaces", () => {
    expect(resolveLanguage("  TS ")).toBe("typescript");
    expect(resolveLanguage("Python")).toBe("python");
  });

  it("knows a few extra aliases highlight.js does not define", () => {
    expect(resolveLanguage("vue")).toBe("xml");
    expect(resolveLanguage("json5")).toBe("json");
  });

  it("returns null for unknown, empty or missing input", () => {
    expect(resolveLanguage("not-a-language")).toBeNull();
    expect(resolveLanguage("")).toBeNull();
    expect(resolveLanguage("   ")).toBeNull();
    expect(resolveLanguage(null)).toBeNull();
    expect(resolveLanguage(undefined)).toBeNull();
    // mermaid는 highlight.js 언어가 아니다 (M4.5에서 따로 그린다)
    expect(resolveLanguage("mermaid")).toBeNull();
    expect(resolveLanguage("plot")).toBeNull(); // 수식 그래프도 같다
  });
});

describe("generated language data", () => {
  it("covers the 190+ languages highlight.js ships", () => {
    expect(LANGUAGE_NAMES.length).toBeGreaterThanOrEqual(190);
    expect(LANGUAGE_NAMES).toContain("plaintext");
  });

  it("only points aliases at languages that exist", () => {
    for (const target of Object.values(LANGUAGE_ALIASES)) {
      expect(LANGUAGE_NAMES).toContain(target);
    }
  });

  it("never lets an alias shadow a canonical language name", () => {
    for (const alias of Object.keys(LANGUAGE_ALIASES)) {
      expect(LANGUAGE_NAMES).not.toContain(alias);
    }
  });
});

describe("languageOptions", () => {
  it("lists every language once, popular ones first, the rest alphabetical", () => {
    const options = languageOptions();
    expect(options).toHaveLength(LANGUAGE_NAMES.length + 2); // + mermaid, plot
    expect(new Set(options.map((o) => o.name)).size).toBe(options.length);

    expect(options[0].name).toBe("plaintext");
    expect(options.slice(0, 4).map((o) => o.name)).toEqual([
      "plaintext",
      "javascript",
      "typescript",
      "python",
    ]);
    const rest = options.slice(20).map((o) => o.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
  });

  it("attaches aliases to the language they belong to", () => {
    const ts = languageOptions().find((o) => o.name === "typescript");
    expect(ts?.aliases).toContain("ts");
    expect(ts?.aliases).toContain("tsx");
  });
});

describe("searchLanguages", () => {
  it("returns everything for an empty query", () => {
    expect(searchLanguages("")).toHaveLength(LANGUAGE_NAMES.length + 2);
    expect(searchLanguages("   ")).toHaveLength(LANGUAGE_NAMES.length + 2);
  });

  it("finds a language by name, prefix or alias", () => {
    expect(searchLanguages("rust")[0].name).toBe("rust");
    expect(searchLanguages("pyth")[0].name).toBe("python");
    expect(searchLanguages("ts")[0].name).toBe("typescript"); // 별칭 정확히 일치가 먼저
  });

  it("puts exact matches before prefix matches before substring matches", () => {
    const names = searchLanguages("java").map((o) => o.name);
    expect(names[0]).toBe("java");
    expect(names.indexOf("javascript")).toBeGreaterThan(names.indexOf("java"));
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchLanguages("zzzz-nothing")).toEqual([]);
  });
});
