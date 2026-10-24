import { describe, expect, it } from "vitest";

import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { docToMarkdown } from "./markdown.ts";
import { type ImportContext, markdownToDoc } from "./markdownImport.ts";

/**
 * 무작위로 만든 문서(콜아웃·임베드·들여쓰기·제목·문단·목록·인용·코드 …)를 Markdown으로 내보냈다가 다시 읽는 속성 시험.
 * ① 다시 읽은 문서는 처음 문서와 같고(왕복), ② 그 문서를 또 내보내면 같은 글이다(멱등). 시드가 고정이라 같은 입력이 항상 나온다.
 */

/** 기본 300개. 더 오래 돌려 보려면 `FUZZ_SEEDS=20000 pnpm vitest run …`. */
const SEEDS = Number(process.env.FUZZ_SEEDS ?? 300);
const ctx: ImportContext = { resolvePage: () => null, resolveImage: () => null, embeds: true, indent: true };

/** mulberry32: 시드로 재현되는 난수. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ["가나다", "hello", "한글 단어", "x", "중요한 글", "메모", "A b C", "둘째 줄", "100%", "a-b"];
const CALLOUTS = ["note", "tip", "important", "warning", "caution", "info", "danger", "rocket", "my-kind_2", "success"];
const EMBEDS: Array<[string, string]> = [
  ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ["x", "https://x.com/jack/status/20"],
  ["instagram", "https://www.instagram.com/p/Cabc_123/"],
  ["pinterest", "https://www.pinterest.com/pin/123456/"],
  ["soundcloud", "https://soundcloud.com/artist/track-name"],
];

function build(seed: number): PmNode {
  const r = rng(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(r() * items.length)]!;
  const text = (): PmNode => ({ type: "text", text: pick(WORDS) });
  const marked = (): PmNode[] => {
    const t = text();
    const style = r();
    if (style < 0.2) return [{ ...t, marks: [{ type: "bold" }] }];
    if (style < 0.3) return [{ ...t, marks: [{ type: "italic" }] }];
    return [t];
  };
  const paragraph = (extra: Record<string, unknown> = {}): PmNode => {
    const indent = r() < 0.4 ? 1 + Math.floor(r() * 8) : null;
    return { type: "paragraph", ...(indent !== null || Object.keys(extra).length > 0 ? { attrs: { ...(indent !== null ? { indent } : {}), ...extra } } : {}), content: marked() };
  };
  const block = (depth: number): PmNode => {
    const roll = r();
    if (roll < 0.28) return paragraph();
    if (roll < 0.4) {
      const indent = r() < 0.4 ? 1 + Math.floor(r() * 8) : null;
      return { type: "heading", attrs: { level: 1 + Math.floor(r() * 6), ...(indent !== null ? { indent } : {}) }, content: [text()] };
    }
    if (roll < 0.52) {
      const [provider, url] = pick(EMBEDS);
      const width = r() < 0.4 ? 100 + Math.floor(r() * 1900) : null;
      const height = width !== null && r() < 0.5 ? 100 + Math.floor(r() * 1900) : null;
      return { type: "embed", attrs: { provider, url, ...(width !== null ? { width } : {}), ...(height !== null ? { height } : {}) } };
    }
    if (roll < 0.66 && depth < 2) {
      return { type: "callout", attrs: { type: pick(CALLOUTS) }, content: [paragraph({ indent: null }), ...(r() < 0.3 ? [paragraph({ indent: null })] : [])].map(stripIndent) };
    }
    if (roll < 0.76 && depth < 2) return { type: "blockquote", content: [stripIndent(paragraph())] };
    if (roll < 0.86) {
      const items = 1 + Math.floor(r() * 3);
      return { type: "bulletList", content: Array.from({ length: items }, () => ({ type: "listItem", content: [stripIndent(paragraph())] })) };
    }
    if (roll < 0.93) {
      const language = pick(["ts", "", "py"]);
      return { type: "codeBlock", ...(language !== "" ? { attrs: { language } } : {}), content: [{ type: "text", text: pick(["const a = 1;", "print(1)", "x"]) }] };
    }
    return { type: "horizontalRule" };
  };
  const count = 1 + Math.floor(r() * 7);
  return { type: "doc", content: Array.from({ length: count }, () => block(0)) };
}

/** 목록·인용·콜아웃 안의 문단은 들여쓰지 않는다(편집기도 그렇게 막는다). */
function stripIndent(node: PmNode): PmNode {
  if (!node.attrs || !("indent" in node.attrs)) return node;
  const { indent: _indent, ...rest } = node.attrs;
  return { ...node, ...(Object.keys(rest).length > 0 ? { attrs: rest } : { attrs: undefined }) } as PmNode;
}

/** 비교용으로 값이 null·undefined인 속성을 지운다(예: 문단의 attrs: {}). */
function canon(node: PmNode): unknown {
  const attrs = Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([, v]) => v !== null && v !== undefined));
  return {
    type: node.type,
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.marks ? { marks: node.marks } : {}),
    ...(node.content ? { content: node.content.map(canon) } : {}),
  };
}

const exportMd = (doc: PmNode) => docToMarkdown(doc, { pageTitle: () => null }).markdown;

describe("Markdown 왕복 속성 시험 (시드 고정, 300개)", () => {
  it("내보냈다 다시 읽으면 같은 문서가 되고, 또 내보내면 같은 글이다", () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const doc = build(seed);
      const markdown = exportMd(doc);
      const reread = markdownToDoc(markdown, ctx, "").doc;
      const again = exportMd(reread);
      if (again !== markdown) failures.push(`seed ${seed}: 멱등이 아니다\n--- 첫 번째\n${markdown}\n--- 두 번째\n${again}`);
      else if (JSON.stringify(canon(reread)) !== JSON.stringify(canon(doc))) failures.push(`seed ${seed}: 왕복이 다르다\n${markdown}\n기대 ${JSON.stringify(canon(doc))}\n실제 ${JSON.stringify(canon(reread))}`);
      if (failures.length >= 3) break;
    }
    expect(failures.join("\n=====\n")).toBe("");
  });
});
