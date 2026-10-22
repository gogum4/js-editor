import { Schema } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { LANGUAGE_NAMES } from "@9um4/editor-schema/languageData.generated";
import { buildDecorations, MAX_HIGHLIGHT_CHARS, updateDecorations, usedLanguages } from "./decorations";
import { availableLanguageNames, isLanguageLoaded, loadLanguage, lowlight } from "./loader";
import { type HastNode, hastToRanges } from "./ranges";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    codeBlock: { group: "block", content: "text*", attrs: { language: { default: null } }, code: true },
    text: { group: "inline" },
  },
});

const codeDoc = (language: string | null, code: string) =>
  schema.node("doc", null, [
    schema.node("paragraph", null, [schema.text("앞 문단")]),
    schema.node("codeBlock", { language }, code ? [schema.text(code)] : []),
  ]);

const decorationsOf = (doc: ReturnType<typeof codeDoc>) =>
  buildDecorations(doc)
    .find(0, doc.content.size)
    .map((d) => ({
      from: d.from,
      to: d.to,
      className: (d as unknown as { type: { attrs: { class: string } } }).type.attrs.class,
    }));

describe("hastToRanges", () => {
  it("turns nested elements into ranges with joined class names", () => {
    const tree: HastNode[] = [
      { type: "element", properties: { className: ["hljs-keyword"] }, children: [{ type: "text", value: "const" }] },
      { type: "text", value: " " },
      {
        type: "element",
        properties: { className: ["hljs-title", "hljs-function"] },
        children: [{ type: "text", value: "run" }],
      },
    ];
    expect(hastToRanges(tree)).toEqual([
      { from: 0, to: 5, className: "hljs-keyword" },
      { from: 6, to: 9, className: "hljs-title hljs-function" },
    ]);
  });

  it("keeps the offsets right across unstyled text and combines nested classes", () => {
    const tree: HastNode[] = [
      { type: "text", value: "ab" },
      {
        type: "element",
        properties: { className: ["outer"] },
        children: [
          { type: "text", value: "c" },
          { type: "element", properties: { className: ["inner"] }, children: [{ type: "text", value: "de" }] },
        ],
      },
      { type: "text", value: "f" },
    ];
    expect(hastToRanges(tree)).toEqual([
      { from: 2, to: 3, className: "outer" },
      { from: 3, to: 5, className: "outer inner" },
    ]);
  });

  it("measures Korean text by UTF-16 length like ProseMirror does", () => {
    const tree: HastNode[] = [
      { type: "element", properties: { className: ["hljs-string"] }, children: [{ type: "text", value: "'한글'" }] },
    ];
    expect(hastToRanges(tree)).toEqual([{ from: 0, to: 4, className: "hljs-string" }]);
  });

  it("returns nothing for plain text or an empty tree", () => {
    expect(hastToRanges([])).toEqual([]);
    expect(hastToRanges([{ type: "text", value: "no styling" }])).toEqual([]);
  });
});

describe("language loader", () => {
  it("can load every language highlight.js ships, matching the generated language list", () => {
    expect(availableLanguageNames()).toEqual([...LANGUAGE_NAMES].sort());
  });

  it("resolves every generated loader to a language definition (no bundler-specific glob)", async () => {
    const { LANGUAGE_LOADERS } = await import("./languageLoaders.generated");
    const modules = await Promise.all(Object.values(LANGUAGE_LOADERS).map((load) => load()));
    expect(modules).toHaveLength(LANGUAGE_NAMES.length);
    for (const module of modules) expect(typeof module.default).toBe("function");
  });

  it("loads a language only when asked and registers its aliases with it", async () => {
    expect(isLanguageLoaded("typescript")).toBe(false);
    expect(lowlight.registered("typescript")).toBe(false);

    await loadLanguage("typescript");

    expect(isLanguageLoaded("typescript")).toBe(true);
    expect(lowlight.registered("typescript")).toBe(true);
    expect(lowlight.registered("ts")).toBe(true);
    // 한 번 더 불러도 문제없다
    await loadLanguage("typescript");
  });

  it("ignores names it does not know", async () => {
    await loadLanguage("not-a-language");
    expect(isLanguageLoaded("not-a-language")).toBe(false);
  });
});

describe("buildDecorations", () => {
  it("adds no color until the language is loaded", () => {
    expect(isLanguageLoaded("rust")).toBe(false);
    expect(decorationsOf(codeDoc("rust", "fn main() {}"))).toEqual([]);
  });

  it("colors keywords of a loaded language at the right document positions", async () => {
    await loadLanguage("typescript");
    const doc = codeDoc("ts", "const x = 1;"); // 별칭 ts로 써도 된다

    const decorations = decorationsOf(doc);
    const keyword = decorations.find((d) => d.className.includes("hljs-keyword"));

    expect(keyword).toBeDefined();
    // 문서 위치: 앞 문단(글자 4 + 열기/닫기 2 = 6) 다음 코드 블록 안쪽 시작(7)에서 'const' 5글자
    expect(doc.textBetween(keyword!.from, keyword!.to)).toBe("const");
    expect(decorations.some((d) => d.className.includes("hljs-number"))).toBe(true);
  });

  it("does not color a block without a language or with an unknown one", async () => {
    await loadLanguage("typescript");
    expect(decorationsOf(codeDoc(null, "const x = 1;"))).toEqual([]);
    expect(decorationsOf(codeDoc("klingon", "const x = 1;"))).toEqual([]);
  });

  it("skips very large blocks instead of freezing the editor", async () => {
    await loadLanguage("typescript");
    const huge = "const a = 1;\n".repeat(Math.ceil(MAX_HIGHLIGHT_CHARS / 13) + 10);
    expect(decorationsOf(codeDoc("typescript", huge))).toEqual([]);
  });

  it("reuses the result for an unchanged block", async () => {
    await loadLanguage("typescript");
    const doc = codeDoc("typescript", "let y = 2;");
    const first = decorationsOf(doc);
    const second = decorationsOf(doc);
    expect(second).toEqual(first);
  });
});

describe("usedLanguages", () => {
  it("collects the canonical names of the languages used by code blocks", () => {
    const doc = schema.node("doc", null, [
      schema.node("codeBlock", { language: "ts" }, [schema.text("a")]),
      schema.node("codeBlock", { language: "py" }, [schema.text("b")]),
      schema.node("codeBlock", { language: "typescript" }, [schema.text("c")]),
      schema.node("codeBlock", { language: null }, [schema.text("d")]),
      schema.node("codeBlock", { language: "nope" }, [schema.text("e")]),
    ]);
    expect([...usedLanguages(doc)].sort()).toEqual(["python", "typescript"]);
  });
});

describe("updateDecorations (바뀐 코드 블록만 다시 만들기)", () => {
  type Deco = { from: number; to: number; className: string };
  type DecoSet = ReturnType<typeof buildDecorations>;
  const listOf = (set: DecoSet, size: number): Deco[] =>
    set
      .find(0, size)
      .map((d) => ({
        from: d.from,
        to: d.to,
        className: (d as unknown as { type: { attrs: { class: string } } }).type.attrs.class,
      }))
      .sort((a, b) => a.from - b.from || a.to - b.to || a.className.localeCompare(b.className));

  /** 같은 결과가 나오는지: 전체를 새로 만든 것과 견준다. */
  const sameAsRebuild = (previous: DecoSet, tr: Transaction): DecoSet => {
    const incremental = updateDecorations(previous, tr);
    expect(listOf(incremental, tr.doc.content.size)).toEqual(listOf(buildDecorations(tr.doc), tr.doc.content.size));
    return incremental;
  };

  const makeDoc = () =>
    schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("머리 문단")]),
      schema.node("codeBlock", { language: "typescript" }, [schema.text("const a: number = 1;\nlet b = 'x';")]),
      schema.node("paragraph", null, [schema.text("가운데 문단")]),
      schema.node("codeBlock", { language: "python" }, [schema.text("def f(x):\n    return x + 1")]),
      schema.node("codeBlock", { language: "unknown-lang" }, [schema.text("그냥 글자")]),
      schema.node("paragraph", null, [schema.text("꼬리")]),
    ]);

  it("글자를 넣고 지우고 나누고 언어를 바꿔도 전체를 새로 만든 것과 같다 (무작위 편집 300번)", async () => {
    await Promise.all([loadLanguage("typescript"), loadLanguage("python")]);
    let state = EditorState.create({ doc: makeDoc() });
    let decorations = buildDecorations(state.doc);
    // 고정 시드의 간단한 난수 (시험이 매번 같게)
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const snippets = ["x", "const ", "\n", "def ", "return", "'", "(", ")", "한글", "1"];
    let applied = 0;

    for (let step = 0; step < 300; step++) {
      const size = state.doc.content.size;
      let tr = state.tr;
      const kind = rand(5);
      const pos = Math.max(1, Math.min(size - 1, rand(size)));
      try {
        if (kind <= 1) tr = tr.insertText(snippets[rand(snippets.length)] ?? "x", pos);
        else if (kind === 2) tr = tr.delete(Math.max(1, pos - rand(4)), pos);
        else if (kind === 3) tr = tr.split(pos);
        else {
          // 언어 바꾸기 (코드 블록이면)
          const $pos = state.doc.resolve(pos);
          for (let depth = $pos.depth; depth > 0; depth--) {
            if ($pos.node(depth).type.name === "codeBlock") {
              tr = tr.setNodeMarkup($pos.before(depth), undefined, { language: ["typescript", "python", null][rand(3)] });
              break;
            }
          }
        }
      } catch {
        continue; // 스키마에 맞지 않는 편집은 건너뛴다
      }
      if (!tr.docChanged) continue;
      decorations = sameAsRebuild(decorations, tr);
      state = state.apply(tr);
      applied += 1;
    }
    expect(applied).toBeGreaterThan(150);
  });

  it("코드 블록을 통째로 지우거나 붙여넣거나 여러 단계로 바꿔도 같다", async () => {
    await loadLanguage("typescript");
    const state = EditorState.create({ doc: makeDoc() });
    const base = buildDecorations(state.doc);
    const first = state.doc.child(0).nodeSize;
    const block = state.doc.child(1);

    sameAsRebuild(base, state.tr.delete(first, first + block.nodeSize));
    sameAsRebuild(base, state.tr.insert(state.doc.content.size, block));
    const multi = state.tr.insertText("앞", 1);
    multi.delete(first + 4, first + 9);
    multi.insert(multi.doc.content.size, block);
    sameAsRebuild(base, multi);
  });

  it("바뀌지 않은 코드 블록의 장식은 그대로 옮겨 쓴다(위치만 밀린다)", async () => {
    await loadLanguage("typescript");
    const state = EditorState.create({ doc: makeDoc() });
    const base = buildDecorations(state.doc);
    const tr = state.tr.insertText("!", 1); // 머리 문단에 글자 하나
    const next = updateDecorations(base, tr);
    const before = listOf(base, state.doc.content.size);
    const after = listOf(next, tr.doc.content.size);
    expect(after.map((d) => [d.from - 1, d.to - 1, d.className])).toEqual(before.map((d) => [d.from, d.to, d.className]));
  });
});
