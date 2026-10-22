import hljs from "highlight.js/lib/core";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import { describe, expect, it } from "vitest";

import { buildCandidates, type Candidate, currentWord, extractKeywords, manualWord, mermaidWords } from "./words";

const kw = (...entries: [string, Candidate["kind"]][]): Candidate[] => entries.map(([word, kind]) => ({ word, kind }));
const words = (list: Candidate[]) => list.map((c) => c.word);

describe("extractKeywords", () => {
  it("reads string keywords", () => {
    expect(extractKeywords({ keywords: "if else|0 while" })).toEqual(
      kw(["if", "keyword"], ["else", "keyword"], ["while", "keyword"]),
    );
  });

  it("reads kinds from object keywords and skips $pattern and unknown kinds", () => {
    const result = extractKeywords({
      keywords: { $pattern: /x/, keyword: "const let", literal: ["true", "false"], built_in: "console", type: "string", odd: "nope" },
    });
    expect(result).toEqual(
      kw(["const", "keyword"], ["let", "keyword"], ["true", "literal"], ["false", "literal"], ["console", "builtin"], ["string", "type"]),
    );
  });

  it("drops words that are not plain identifiers or are too short", () => {
    expect(words(extractKeywords({ keywords: "a ok a.b ::x if-then" }))).toEqual(["ok"]);
  });

  it("keeps the first kind of a repeated word and tolerates missing keywords", () => {
    expect(extractKeywords({ keywords: { keyword: "this", built_in: "this" } })).toEqual(kw(["this", "keyword"]));
    expect(extractKeywords(undefined)).toEqual([]);
    expect(extractKeywords({})).toEqual([]);
  });

  it("works on real highlight.js languages", () => {
    const ts = extractKeywords(typescript(hljs));
    expect(ts).toContainEqual({ word: "function", kind: "keyword" });
    expect(ts).toContainEqual({ word: "console", kind: "keyword" }); // variable.language
    expect(ts).toContainEqual({ word: "Promise", kind: "builtin" });
    expect(ts).toContainEqual({ word: "true", kind: "literal" });

    const py = extractKeywords(python(hljs));
    expect(words(py)).toEqual(expect.arrayContaining(["def", "import", "print", "None"]));

    expect(words(extractKeywords(sql(hljs)))).toContain("select");
    expect(words(extractKeywords(dockerfile(hljs)))).toContain("from");
  });
});

describe("currentWord", () => {
  it("finds the word before the cursor", () => {
    expect(currentWord("const foo", 9)).toEqual({ start: 6, prefix: "foo", afterDot: false });
    expect(currentWord("a\nret", 5)).toEqual({ start: 2, prefix: "ret", afterDot: false });
  });

  it("notes member access", () => {
    expect(currentWord("obj.fo", 6)).toEqual({ start: 4, prefix: "fo", afterDot: true });
  });

  it("returns null in the middle of a word, after non-word characters, or for numbers", () => {
    expect(currentWord("foobar", 3)).toBeNull();
    expect(currentWord("foo ", 4)).toBeNull();
    expect(currentWord("", 0)).toBeNull();
    expect(currentWord("12ab", 4)).toBeNull();
    expect(currentWord("한글", 2)).toBeNull();
  });

  it("allows the cursor right before a non-word character", () => {
    expect(currentWord("fo()", 2)).toEqual({ start: 0, prefix: "fo", afterDot: false });
  });
});

describe("buildCandidates", () => {
  const keywords = kw(["function", "keyword"], ["finally", "keyword"], ["false", "literal"], ["Function", "builtin"], ["fs", "builtin"]);
  const run = (text: string, offset = text.length) => buildCandidates({ text, offset, keywords });

  it("needs at least two characters", () => {
    expect(run("f")).toEqual([]);
    expect(words(run("fu"))).toEqual(["function", "Function"]);
  });

  it("lists matches case-insensitively with exact-case matches first, then by kind and name", () => {
    expect(words(run("fi"))).toEqual(["finally"]);
    expect(words(run("Fu"))).toEqual(["Function", "function"]);
    expect(words(run("fa"))).toEqual(["false"]);
  });

  it("includes words from the block, ahead of keywords, but not the word being typed", () => {
    const text = "const fuzzy = 1\nfu";
    expect(words(run(text))).toEqual(["fuzzy", "function", "Function"]);
    expect(words(run("fuzz"))).toEqual([]);
  });

  it("leaves out a candidate identical to what is typed", () => {
    expect(words(run("function"))).toEqual([]);
    expect(words(run("FUNCTION"))).toEqual([]); // 대소문자만 다른 것도 뺀다
    expect(words(run("functions function\nfunction"))).toEqual(["functions"]);
  });

  it("offers only block words after a dot", () => {
    expect(words(run("let fuzzy\nobj.fu"))).toEqual(["fuzzy"]);
  });

  it("does not complete in the middle of a word", () => {
    expect(run("function", 3)).toEqual([]);
  });

  it("respects the limit", () => {
    const many = kw(...Array.from({ length: 20 }, (_, i): [string, "keyword"] => [`item${String(i).padStart(2, "0")}`, "keyword"]));
    expect(buildCandidates({ text: "it", offset: 2, keywords: many, limit: 5 })).toHaveLength(5);
  });
});

describe("mermaid words", () => {
  const run = (text: string, offset = text.length) => buildCandidates({ text, offset, keywords: [], mermaid: true });

  it("suggests diagram types and directions on the first line", () => {
    expect(words(run("seq"))).toEqual(["sequenceDiagram"]);
    expect(words(run("flowchart T"))).toEqual([]); // 한 글자는 후보를 띄우지 않는다
    expect(words(run("flowchart TD"))).toEqual([]);
    expect(words(run("graph L"))).toEqual([]);
    expect(words(run("state"))).toEqual(["stateDiagram", "stateDiagram-v2"]);
  });

  it("skips %% comments when finding the header", () => {
    expect(words(run("%% 메모\nflowch"))).toEqual(["flowchart"]);
  });

  it("suggests the words of the diagram named on the first line", () => {
    expect(words(run("flowchart TD\n  subg"))).toEqual(["subgraph"]);
    expect(words(run("sequenceDiagram\n  part"))).toEqual(["participant"]);
    expect(words(run("sequenceDiagram\n  Note ov"))).toEqual(["over"]);
    expect(words(run("graph LR\n  sub"))).toEqual(["subgraph"]);
    expect(words(run("stateDiagram-v2\n  fo"))).toEqual(["fork"]);
    expect(words(run("gantt\n  sec"))).toEqual(["section"]);
  });

  it("offers common words and block words for any diagram, and nothing diagram-specific for unknown ones", () => {
    expect(words(run("pie\n  tit"))).toEqual(["title"]);
    expect(words(run("flowchart TD\n  Start --> End\n  Sta"))).toEqual(["Start"]);
    expect(words(run("unknownThing\n  subg"))).toEqual([]);
  });

  it("returns types only while the cursor is on the header line", () => {
    const text = "flowchart TD\n  A --> B";
    expect(mermaidWords(text, 5).some((c) => c.word === "sequenceDiagram")).toBe(true);
    expect(mermaidWords(text, 16).some((c) => c.word === "sequenceDiagram")).toBe(false);
    expect(mermaidWords("", 0).some((c) => c.word === "gantt")).toBe(true);
  });
});

describe("manual trigger (Ctrl+Space)", () => {
  const keywords = kw(["function", "keyword"], ["const", "keyword"], ["Promise", "builtin"], ["true", "literal"]);

  it("finds the word before the cursor even when it is empty or the cursor is inside a word", () => {
    expect(manualWord("const ", 6)).toEqual({ start: 6, prefix: "", afterDot: false });
    expect(manualWord("const fo", 8)).toEqual({ start: 6, prefix: "fo", afterDot: false });
    expect(manualWord("foobar", 3)).toEqual({ start: 0, prefix: "foo", afterDot: false });
    expect(manualWord("obj.", 4)).toEqual({ start: 4, prefix: "", afterDot: true });
    expect(manualWord("12", 2)).toBeNull();
  });

  it("lists everything for an empty word, blocks words first", () => {
    const text = "let counter = 1\n";
    const word = manualWord(text, text.length)!;
    expect(words(buildCandidates({ text, offset: text.length, keywords, word }))).toEqual([
      "counter",
      "let",
      "const",
      "function",
      "true",
      "Promise",
    ]);
  });

  it("works with a single typed letter and respects the limit", () => {
    const word = manualWord("c", 1)!;
    expect(words(buildCandidates({ text: "c", offset: 1, keywords, word }))).toEqual(["const"]);
    expect(buildCandidates({ text: "", offset: 0, keywords, word: manualWord("", 0)!, limit: 2 })).toHaveLength(2);
  });

  it("offers only block words after a dot even when called by hand", () => {
    const text = "let counter\nobj.";
    expect(words(buildCandidates({ text, offset: text.length, keywords, word: manualWord(text, text.length)! }))).toEqual(["counter", "let", "obj"]);
  });

  it("lists the diagram types for mermaid on an empty block", () => {
    const list = buildCandidates({ text: "", offset: 0, keywords: [], mermaid: true, word: manualWord("", 0)!, limit: 100 });
    expect(words(list)).toEqual(expect.arrayContaining(["flowchart", "sequenceDiagram", "TD"]));
  });
});
