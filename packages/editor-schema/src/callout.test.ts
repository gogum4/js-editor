import { describe, expect, it } from "vitest";

import {
  CALLOUT_META,
  CALLOUT_PRESET_META,
  CALLOUT_TYPES,
  DEFAULT_CALLOUT_ICON,
  calloutMeta,
  calloutTypeFromName,
  isBuiltinCalloutType,
  isCalloutType,
  normalizeCalloutType,
} from "./callout.ts";

describe("callout types", () => {
  it("has the five GitHub-style kinds, each with a label and an icon", () => {
    expect(CALLOUT_TYPES).toEqual(["note", "tip", "important", "warning", "caution"]);
    for (const type of CALLOUT_TYPES) {
      expect(CALLOUT_META[type].label).not.toBe("");
      expect(CALLOUT_META[type].icon).not.toBe("");
    }
  });

  it("accepts any well-formed name, not only the five", () => {
    expect(isCalloutType("warning")).toBe(true);
    expect(isCalloutType("danger")).toBe(true);
    expect(isCalloutType("my-kind_2")).toBe(true);
    expect(isCalloutType("WARNING")).toBe(false);
    expect(isCalloutType("1st")).toBe(false);
    expect(isCalloutType("a b")).toBe(false);
    expect(isCalloutType("x".repeat(33))).toBe(false);
    expect(isCalloutType(undefined)).toBe(false);
  });

  it("knows which names are the built-in five", () => {
    expect(isBuiltinCalloutType("tip")).toBe(true);
    expect(isBuiltinCalloutType("danger")).toBe(false);
  });

  it("normalizes anything unexpected to a valid kind and keeps custom names", () => {
    expect(normalizeCalloutType("tip")).toBe("tip");
    expect(normalizeCalloutType("  CAUTION ")).toBe("caution");
    expect(normalizeCalloutType("danger")).toBe("danger");
    expect(normalizeCalloutType("Rocket")).toBe("rocket");
    expect(normalizeCalloutType("")).toBe("note");
    expect(normalizeCalloutType("not valid!")).toBe("note");
    expect(normalizeCalloutType(null)).toBe("note");
    expect(normalizeCalloutType(42)).toBe("note");
  });
});

describe("calloutTypeFromName", () => {
  it("이름을 그대로 종류로 쓰고 대소문자는 무시한다(별칭으로 합치지 않는다)", () => {
    expect(calloutTypeFromName("NOTE")).toBe("note");
    expect(calloutTypeFromName("Warning")).toBe("warning");
    expect(calloutTypeFromName("info")).toBe("info");
    expect(calloutTypeFromName("hint")).toBe("hint");
    expect(calloutTypeFromName("rocket")).toBe("rocket");
  });

  it("이름으로 쓸 수 없으면 null이다", () => {
    expect(calloutTypeFromName("")).toBeNull();
    expect(calloutTypeFromName("a b")).toBeNull();
    expect(calloutTypeFromName("1st")).toBeNull();
  });
});

describe("calloutMeta", () => {
  it("기본 5종과 Obsidian 이름은 정해진 모양이다", () => {
    expect(calloutMeta("tip")).toEqual(CALLOUT_META.tip);
    expect(calloutMeta("danger")).toEqual(CALLOUT_PRESET_META.danger);
  });

  it("모르는 이름은 이름을 글로, 아이콘은 표에서 찾고 없으면 기본 아이콘이다", () => {
    expect(calloutMeta("rocket")).toEqual({ label: "rocket", icon: DEFAULT_CALLOUT_ICON });
    expect(calloutMeta("rocket", { rocket: "🚀" })).toEqual({ label: "rocket", icon: "🚀" });
  });

  it("아이콘 표는 정해진 아이콘도 덮는다", () => {
    expect(calloutMeta("tip", { tip: "✨" }).icon).toBe("✨");
    expect(calloutMeta("tip", { tip: "✨" }).label).toBe(CALLOUT_META.tip.label);
  });
});
