import { describe, expect, it } from "vitest";

import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { docToMarkdown } from "./markdown.ts";
import { type ImportContext, markdownToDoc } from "./markdownImport.ts";

const on: ImportContext = { resolvePage: () => null, resolveImage: () => null, indent: true };
const off: ImportContext = { resolvePage: () => null, resolveImage: () => null };
const blocks = (md: string, ctx: ImportContext = on) => markdownToDoc(md, ctx, "").doc.content ?? [];
const text = (t: string, ...marks: string[]): PmNode => ({ type: "text", text: t, ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}) });
const para = (indent: number | null, ...content: PmNode[]): PmNode => ({ type: "paragraph", ...(indent !== null ? { attrs: { indent } } : {}), content });
const heading = (level: number, indent: number | null, ...content: PmNode[]): PmNode => ({ type: "heading", attrs: { level, ...(indent !== null ? { indent } : {}) }, content });
const out = (...content: PmNode[]) => docToMarkdown({ type: "doc", content }, { pageTitle: () => null }).markdown;

describe("들여쓰기 읽기 (&emsp;)", () => {
  it("맨 앞의 &emsp; 두 개가 한 단계 (홀수는 올림)", () => {
    expect(blocks("&emsp;&emsp;한 단계")).toEqual([para(1, text("한 단계"))]);
    expect(blocks("&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;세 단계")).toEqual([para(3, text("세 단계"))]);
    expect(blocks("&emsp;한 칸")).toEqual([para(1, text("한 칸"))]);
  });

  it("문단마다 단계가 달라도 된다 (1단계 다음에 3단계)", () => {
    expect(blocks("&emsp;&emsp;하나\n\n&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;셋")).toEqual([para(1, text("하나")), para(3, text("셋"))]);
  });

  it("제목도 읽는다", () => {
    expect(blocks("## &emsp;&emsp;제목")).toEqual([heading(2, 1, text("제목"))]);
  });

  it("EM SPACE 글자 자체도 읽는다", () => {
    const em = String.fromCharCode(0x2003);
    expect(blocks(`${em}${em}글`)).toEqual([para(1, text("글"))]);
  });

  it("글 가운데의 &emsp;는 들여쓰기가 아니다", () => {
    expect(blocks("가&emsp;나")).toEqual([para(null, text("가&emsp;나"))]);
  });

  it("옵션이 꺼져 있으면(기본) 글자로 둔다", () => {
    expect(blocks("&emsp;&emsp;글", off)).toEqual([para(null, text("&emsp;&emsp;글"))]);
  });

  it("상한(8단계)을 넘으면 8단계로", () => {
    expect(blocks("&emsp;".repeat(40) + "글")).toEqual([para(8, text("글"))]);
  });
});

describe("들여쓰기 쓰기", () => {
  it("문단과 제목 앞에 &emsp;를 단계 × 2개 쓴다", () => {
    expect(out(para(1, text("글")))).toBe("&emsp;&emsp;글\n");
    expect(out(para(3, text("글")))).toBe(`${"&emsp;".repeat(6)}글\n`);
    expect(out(heading(2, 1, text("제목")))).toBe("## &emsp;&emsp;제목\n");
    expect(out(para(null, text("글")))).toBe("글\n");
  });

  it("쓰고 다시 읽으면 같다", () => {
    const nodes = [para(1, text("가")), para(3, text("나")), heading(3, 2, text("다")), para(null, text("라"))];
    expect(blocks(out(...nodes))).toEqual(nodes);
  });
});
