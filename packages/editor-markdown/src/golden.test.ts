import { describe, expect, it } from "vitest";

import type { PmNode } from "@9um4/editor-schema/pmDoc";
import { docToMarkdown } from "./markdown.ts";
import { type ImportContext, markdownToDoc } from "./markdownImport.ts";

/**
 * 방언 골든 시험(docs/MARKDOWN-DIALECT.md). `fixtures/<이름>.doc.json`(문서)마다
 *  ① 문서 → Markdown이 `<이름>.md`와 같은지,
 *  ② Markdown → 문서 → Markdown이 제자리인지(고정점),
 *  ③ 손실이 없다고 표시한(`lossless`) 픽스처는 다시 읽은 문서가 원래 문서와 같은지,
 *  ④ 손실이 있는 픽스처는 다시 읽은 모양을 `<이름>.imported.json`으로 고정해 무엇을 잃는지 드러낸다.
 * 의도한 변경이면 `pnpm vitest run -u`로 골든을 갱신하고 diff를 검토한다.
 */

interface Fixture {
  description: string;
  lossless: boolean;
  /** 참이면 블록 id(`^id`)를 남기는 내보내기로 시험하고, 다시 읽은 문서와 id까지 비교한다. */
  blockIds?: boolean;
  losses?: string[];
  doc: PmNode;
}

/** 위키 연결용 시험 사전: 페이지 id ↔ 제목. */
const TITLES: Record<string, string> = { "p-a": "프로젝트 A", "p-b": "회의록" };
const IDS = Object.fromEntries(Object.entries(TITLES).map(([id, title]) => [title, id]));
const ctx: ImportContext = { resolvePage: (target) => IDS[target.trim()] ?? null, resolveImage: () => null };

const toMarkdown = (doc: PmNode, blockIds = false) => docToMarkdown(doc, { pageTitle: (id) => TITLES[id] ?? null, blockIds }).markdown;

/** 비교용: null 속성을 없애고(`keepIds`가 아니면 블록 id도), 마크 순서를 맞추고, 같은 마크가 이어진 글자를 합친다. */
function normalize(node: PmNode, keepIds: boolean): PmNode {
  const out: PmNode = { type: node.type };
  const attrs = Object.fromEntries(Object.entries(node.attrs ?? {}).filter(([key, value]) => value !== null && value !== undefined && (keepIds || key !== "id")));
  if (Object.keys(attrs).length > 0) out.attrs = attrs;
  if (node.content) {
    const merged: PmNode[] = [];
    for (const child of node.content.map((c) => normalize(c, keepIds))) {
      const last = merged[merged.length - 1];
      if (last?.type === "text" && child.type === "text" && JSON.stringify(last.marks) === JSON.stringify(child.marks)) {
        merged[merged.length - 1] = { ...last, text: (last.text ?? "") + (child.text ?? "") };
      } else merged.push(child);
    }
    out.content = merged;
  }
  if (node.marks) out.marks = [...node.marks].sort((x, y) => x.type.localeCompare(y.type));
  if (node.text !== undefined) out.text = node.text;
  return out;
}

// Vitest(Vite)가 픽스처 JSON을 불러온다. 골든 `.md`·`.imported.json`은 `toMatchFileSnapshot`이 읽고 쓴다.
const loaded = import.meta.glob<Fixture>("../fixtures/*.doc.json", { eager: true, import: "default" });
const fixtures = new Map(Object.entries(loaded).map(([path, fixture]) => [/([^/]+)\.doc\.json$/.exec(path)![1]!, fixture]));
const names = [...fixtures.keys()].sort();

describe("Markdown 방언 골든", () => {
  it("픽스처가 있다", () => {
    expect(names.length).toBeGreaterThanOrEqual(12);
  });

  for (const name of names) {
    const fixture = fixtures.get(name)!;

    describe(name, () => {
      const ids = fixture.blockIds === true;
      const markdown = toMarkdown(fixture.doc, ids);

      it("문서 → Markdown이 골든과 같다", async () => {
        await expect(markdown).toMatchFileSnapshot(`../fixtures/${name}.md`);
      });

      const reread = markdownToDoc(markdown, ctx, "").doc;

      it(fixture.lossless ? "Markdown → 문서 → Markdown이 제자리다" : "손실이 있어도 한 번 읽은 뒤에는 제자리다(두 번째부터 안정)", () => {
        const second = toMarkdown(reread, ids);
        if (fixture.lossless) expect(second).toBe(markdown);
        expect(toMarkdown(markdownToDoc(second, ctx, "").doc, ids)).toBe(second);
      });

      if (fixture.lossless) {
        it("손실 없이 다시 읽힌다", () => {
          expect(normalize(reread, ids)).toEqual(normalize(fixture.doc, ids));
        });
      } else {
        it("다시 읽은 모양을 고정한다(잃는 것을 드러낸다)", async () => {
          await expect(JSON.stringify(normalize(reread, ids), null, 2) + "\n").toMatchFileSnapshot(`../fixtures/${name}.imported.json`);
        });
      }
    });
  }
});
