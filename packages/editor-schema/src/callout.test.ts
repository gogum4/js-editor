import { describe, expect, it } from "vitest";

import { CALLOUT_META, CALLOUT_TYPES, isCalloutType, normalizeCalloutType, calloutTypeFromName } from "./callout.ts";

describe("callout types", () => {
  it("has the five GitHub-style kinds, each with a label and an icon", () => {
    expect(CALLOUT_TYPES).toEqual(["note", "tip", "important", "warning", "caution"]);
    for (const type of CALLOUT_TYPES) {
      expect(CALLOUT_META[type].label).not.toBe("");
      expect(CALLOUT_META[type].icon).not.toBe("");
    }
  });

  it("recognizes valid kinds only", () => {
    expect(isCalloutType("warning")).toBe(true);
    expect(isCalloutType("WARNING")).toBe(false);
    expect(isCalloutType("danger")).toBe(false);
    expect(isCalloutType(undefined)).toBe(false);
  });

  it("normalizes anything unexpected to a valid kind", () => {
    expect(normalizeCalloutType("tip")).toBe("tip");
    expect(normalizeCalloutType("  CAUTION ")).toBe("caution");
    expect(normalizeCalloutType("danger")).toBe("note");
    expect(normalizeCalloutType("")).toBe("note");
    expect(normalizeCalloutType(null)).toBe("note");
    expect(normalizeCalloutType(42)).toBe("note");
  });
});

describe("calloutTypeFromName", () => {
  it("5종과 Obsidian 별칭을 받고 대소문자는 무시한다", () => {
    expect(calloutTypeFromName("NOTE")).toBe("note");
    expect(calloutTypeFromName("Warning")).toBe("warning");
    expect(calloutTypeFromName("info")).toBe("note");
    expect(calloutTypeFromName("hint")).toBe("tip");
    expect(calloutTypeFromName("danger")).toBe("caution");
  });

  it("모르는 이름은 null이다", () => {
    expect(calloutTypeFromName("foo")).toBeNull();
    expect(calloutTypeFromName("")).toBeNull();
  });
});
