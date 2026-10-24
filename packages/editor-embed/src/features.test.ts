import { CORE_SLASH_ITEMS } from "@gogum4/editor-core";
import { describe, expect, it } from "vitest";

import { allowedSlashItems } from "./features.ts";
import { DEFAULT_FEATURES, FEATURES } from "./protocol.ts";

describe("allowedSlashItems", () => {
  it("기본 기능: 문단·제목 1~3·목록·할 일·인용·코드·구분선만", () => {
    const ids = allowedSlashItems(CORE_SLASH_ITEMS, DEFAULT_FEATURES).map((i) => i.id);
    expect(ids).toEqual(["paragraph", "heading1", "heading2", "heading3", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock", "horizontalRule"]);
  });

  it("이미지·토글·정렬은 어느 기능으로도 열리지 않는다", () => {
    const ids = new Set(allowedSlashItems(CORE_SLASH_ITEMS, FEATURES).map((i) => i.id));
    for (const id of ["image", "toggle", "alignLeft", "alignCenter", "alignRight", "alignJustify"]) expect(ids.has(id)).toBe(false);
  });

  it("모든 기능 이름이 코어에 실제로 있는 항목을 가리킨다", () => {
    const core = new Set(CORE_SLASH_ITEMS.map((i) => i.id));
    for (const item of allowedSlashItems(CORE_SLASH_ITEMS, FEATURES)) expect(core.has(item.id)).toBe(true);
    expect(allowedSlashItems(CORE_SLASH_ITEMS, FEATURES).length).toBeGreaterThan(10);
  });
});
