import { describe, expect, it } from "vitest";

import { computeMenuPosition } from "./menuPosition.ts";

const viewport = { width: 1000, height: 700 };
const menu = { width: 300, height: 320 };

describe("computeMenuPosition", () => {
  it("opens below the cursor when there is room", () => {
    const pos = computeMenuPosition({ left: 200, top: 100, bottom: 124 }, menu, viewport);
    expect(pos).toEqual({ left: 200, top: 130, placement: "below" });
  });

  it("opens above the cursor when it does not fit below but fits above", () => {
    const pos = computeMenuPosition({ left: 200, top: 600, bottom: 624 }, menu, viewport);
    expect(pos.placement).toBe("above");
    expect(pos.top).toBe(600 - 6 - 320);
  });

  it("keeps the menu inside the window horizontally", () => {
    expect(computeMenuPosition({ left: 950, top: 100, bottom: 124 }, menu, viewport).left).toBe(692);
    expect(computeMenuPosition({ left: -40, top: 100, bottom: 124 }, menu, viewport).left).toBe(8);
  });

  it("falls back to below, pulled inside the window, when neither side fits", () => {
    const small = { width: 1000, height: 400 };
    const pos = computeMenuPosition({ left: 100, top: 200, bottom: 224 }, menu, small);
    expect(pos.placement).toBe("below");
    expect(pos.top).toBe(400 - 320 - 8);
  });

  it("never returns a negative position even in a tiny window", () => {
    const tiny = { width: 200, height: 200 };
    const pos = computeMenuPosition({ left: 50, top: 50, bottom: 70 }, menu, tiny);
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
  });
});
