import { describe, expect, it } from "vitest";

import { docToMarkdown } from "./markdown.ts";
import { markdownToDoc, type ImportContext } from "./markdownImport.ts";
import { formatReference, parseReferenceLine } from "./referenceDirective.ts";

const base: ImportContext = { resolvePage: () => null, resolveImage: () => null };
const noPages = { pageTitle: () => null };

describe("참조 기본 표기", () => {
  it("한 줄을 읽고 쓴다", () => {
    expect(parseReferenceLine("::ref{kind=table-schema id=abc}")).toEqual({ kind: "table-schema", id: "abc" });
    expect(parseReferenceLine('::ref{kind=page id="두 단어 \\"x\\""}')).toEqual({ kind: "page", id: '두 단어 "x"' });
    expect(formatReference("page", "a b")).toBe('::ref{kind=page id="a b"}');
    expect(formatReference("page", 'q"r')).toBe('::ref{kind=page id="q\\"r"}');
    expect(parseReferenceLine(formatReference("page", 'q"r')!)).toEqual({ kind: "page", id: 'q"r' });
  });

  it("올바르지 않으면 읽지도 쓰지도 않는다", () => {
    expect(parseReferenceLine("::ref{kind=Bad id=x}")).toBeNull();
    expect(parseReferenceLine("::ref{kind=page}")).toBeNull();
    expect(parseReferenceLine("글 ::ref{kind=page id=x}")).toBeNull();
    expect(formatReference("Bad", "x")).toBeNull();
  });
});

describe("참조 노드 왕복", () => {
  const source = "앞 문단\n\n::ref{kind=table-schema id=abc}\n\n뒤 문단\n";

  it("켜면 reference 노드가 되고 기본 표기로 돌아온다", () => {
    const { doc } = markdownToDoc(source, { ...base, references: true }, "");
    expect(doc.content?.map((n) => n.type)).toEqual(["paragraph", "reference", "paragraph"]);
    expect(doc.content?.[1]?.attrs).toEqual({ kind: "table-schema", id: "abc" });
    expect(docToMarkdown(doc, noPages).markdown).toBe(source);
  });

  it("끄면(기본) 글자로 읽는다", () => {
    const { doc } = markdownToDoc(source, base, "");
    expect(JSON.stringify(doc)).not.toContain("reference");
  });

  it("코드 울타리 안의 표기는 노드가 되지 않는다", () => {
    const { doc } = markdownToDoc("```\n::ref{kind=page id=x}\n```\n", { ...base, references: true }, "");
    expect(doc.content?.map((n) => n.type)).toEqual(["codeBlock"]);
  });

  it("블로그 방언에서도 구조 노드로 읽는다", () => {
    const { doc } = markdownToDoc(source, { ...base, dialect: "blog", references: true }, "");
    expect(doc.content?.[1]?.type).toBe("reference");
    expect(docToMarkdown(doc, { ...noPages, dialect: "blog" }).markdown).toBe(source);
  });

  it("사용자 정의 표기: 가져오기 함수와 내보내기 toMarkdown이 짝이다", () => {
    const parse = (line: string) => {
      const m = /^!\[\[schema:([^\]]+)\]\]$/.exec(line);
      return m ? { kind: "table-schema", id: m[1]! } : null;
    };
    const mine = "문단\n\n![[schema:몬스터]]\n";
    const { doc } = markdownToDoc(mine, { ...base, references: parse }, "");
    expect(doc.content?.[1]?.attrs).toEqual({ kind: "table-schema", id: "몬스터" });
    const out = docToMarkdown(doc, { ...noPages, references: { toMarkdown: (kind, id) => (kind === "table-schema" ? `![[schema:${id}]]` : undefined) } });
    expect(out.markdown).toBe(mine);
  });

  it("toMarkdown이 null이면 내보내지 않고 안내한다", () => {
    const { doc } = markdownToDoc(source, { ...base, references: true }, "");
    const out = docToMarkdown(doc, { ...noPages, references: { toMarkdown: () => null } });
    expect(out.markdown).toBe("앞 문단\n\n뒤 문단\n");
    expect(out.notices.join("\n")).toContain("table-schema");
  });

  it("올바르지 않은 속성의 노드는 내보내지 않고 안내한다", () => {
    const out = docToMarkdown({ type: "doc", content: [{ type: "reference", attrs: { kind: "X", id: "" } }] }, noPages);
    expect(out.markdown).toBe("");
    expect(out.notices.length).toBe(1);
  });
});
