import { describe, expect, it } from "vitest";

import { CALLOUT_META, CALLOUT_TYPES, isCalloutType, normalizeCalloutType } from "./callout.ts";

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
