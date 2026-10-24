import { CALLOUT_TYPES } from "@gogum4/editor-schema/callout";
import { describe, expect, it } from "vitest";

import { CORE_SLASH_ITEMS, filterSlashItems } from "../lib/slashItems";
import { createCoreExtensions } from "../coreExtensions";
import { enStrings, koStrings } from "./index";

/** 사전 안의 모든 글(함수는 예시 인자로 불러서)을 모은다. */
function collect(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return [[path, String((value as (...a: unknown[]) => unknown)(1, "x"))]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => collect(v, path ? `${path}.${k}` : k));
  return [];
}

describe("글 사전", () => {
  it("영어 사전은 한국어 사전과 같은 키를 가진다 (슬래시 항목은 기본 항목 전체)", () => {
    const keys = (s: object) => collect(s).map(([k]) => k).filter((k) => !k.startsWith("slash.items."));
    expect(keys(enStrings)).toEqual(keys(koStrings));
    const ids = CORE_SLASH_ITEMS.map((item) => item.id);
    expect(Object.keys(enStrings.slash.items).sort()).toEqual([...ids].sort());
  });

  it("비어 있는 글이 없고, 영어 사전에는 한글이 없다", () => {
    for (const [path, text] of collect(koStrings)) expect(text, path).not.toBe("");
    for (const [path, text] of collect(enStrings)) {
      expect(text, path).not.toBe("");
      expect(/[가-힣]/.test(text), `${path}: ${text}`).toBe(false);
    }
  });

  it("영어 콜아웃 이름이 모든 종류에 있다", () => {
    for (const type of CALLOUT_TYPES) expect(enStrings.callout.types[type]).toBeTruthy();
  });

  it("영어로 만든 슬래시 항목은 영어 이름이고 한국어로도 찾을 수 있다", () => {
    const list = createCoreExtensions(null, { strings: enStrings });
    const slash = list.find((e) => e.name === "slashCommand");
    const items = (slash?.options as { items: typeof CORE_SLASH_ITEMS }).items;
    expect(items.find((i) => i.id === "heading1")?.label).toBe("Heading 1");
    expect(filterSlashItems("제목", items).map((i) => i.id)).toContain("heading1");
    expect(filterSlashItems("heading", items).map((i) => i.id)).toContain("heading1");
  });
});
