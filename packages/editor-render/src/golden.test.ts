import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PmNode } from "@9um4/editor-schema/pmDoc";
import { renderDoc } from "./render";
import type { RenderOptions } from "./types";

/**
 * HTML 골든(docs/EDITOR-PACKAGE.md P4). `@9um4/editor-markdown`의 Markdown 골든 픽스처(본문 JSON)를 그대로 렌더해
 * `fixtures/<이름>.html`과 비교한다 — 같은 문서가 Markdown으로도, HTML로도 같은 규칙으로 고정된다.
 * 의도한 변경이면 `pnpm vitest run packages/editor-render -u`로 갱신하고 diff를 검토한다.
 */

interface Fixture {
  description: string;
  blockIds?: boolean;
  doc: PmNode;
}

// 다른 패키지의 픽스처를 읽는 시험 전용 경로다(소스 import가 아니다).
const loaded = import.meta.glob<Fixture>("../../editor-markdown/fixtures/*.doc.json", { eager: true, import: "default" });
const fixtures = new Map(Object.entries(loaded).map(([path, fixture]) => [/([^/]+)\.doc\.json$/.exec(path)![1]!, fixture]));

const TITLES: Record<string, string> = { "p-a": "프로젝트 A", "p-b": "회의록" };

const optionsFor = (fixture: Fixture): RenderOptions => ({
  pageLink: (id) => (TITLES[id] ? { href: `/pages/${id}`, title: TITLES[id] } : null),
  blockAnchors: fixture.blockIds === true,
});

/** 골든을 읽기 쉽게: 이웃한 태그 사이에서 줄을 바꾼다. */
const format = (html: string) => html.replace(/></g, ">\n<") + "\n";

describe("HTML 골든", () => {
  it("픽스처가 있다", () => {
    expect(fixtures.size).toBeGreaterThanOrEqual(15);
  });

  for (const [name, fixture] of [...fixtures].sort(([a], [b]) => a.localeCompare(b))) {
    it(name, async () => {
      const html = format(renderToStaticMarkup(renderDoc(fixture.doc, optionsFor(fixture))));
      await expect(html).toMatchFileSnapshot(`../fixtures/${name}.html`);
    });
  }
});
