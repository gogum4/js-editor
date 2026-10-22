import { describe, expect, it } from "vitest";

import {
  centerAt,
  constrainView,
  fitView,
  MAX_FIT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  percentLabel,
  svgSize,
  zoomAt,
} from "./viewerMath";

describe("svgSize", () => {
  it("reads the size from the viewBox of a mermaid svg", () => {
    expect(svgSize('<svg id="m1" width="100%" viewBox="0 0 168.5 258" style="max-width: 168.5px;"><g/></svg>')).toEqual({
      width: 168.5,
      height: 258,
    });
    expect(svgSize("<svg viewBox='-8, -8, 300, 120'></svg>")).toEqual({ width: 300, height: 120 });
  });

  it("returns null without a usable viewBox", () => {
    expect(svgSize("<svg width='10'></svg>")).toBeNull();
    expect(svgSize('<svg viewBox="0 0 0 10"></svg>')).toBeNull();
    expect(svgSize('<svg viewBox="a b c d"></svg>')).toBeNull();
    expect(svgSize('<svg viewBox="0 0 10"></svg>')).toBeNull();
    expect(svgSize("")).toBeNull();
  });
});

describe("fitView", () => {
  const viewport = { width: 1000, height: 700 };

  it("scales a large diagram down to fit with padding and centers it", () => {
    const view = fitView({ width: 2000, height: 600 }, viewport, 50);
    expect(view.scale).toBeCloseTo(0.45); // (1000 - 100) / 2000
    expect(view.x).toBeCloseTo(50);
    expect(view.y).toBeCloseTo((700 - 600 * 0.45) / 2);
  });

  it("enlarges a small diagram, but not beyond the fit cap", () => {
    const view = fitView({ width: 100, height: 50 }, viewport, 50);
    expect(view.scale).toBe(MAX_FIT_SCALE);
    expect(view.x).toBeCloseTo((1000 - 100 * MAX_FIT_SCALE) / 2);
  });

  it("copes with a tiny viewport", () => {
    expect(fitView({ width: 100, height: 100 }, { width: 10, height: 10 }).scale).toBeGreaterThanOrEqual(MIN_SCALE);
  });
});

describe("centerAt", () => {
  it("centers the content at the given scale", () => {
    expect(centerAt({ width: 200, height: 100 }, { width: 1000, height: 600 }, 1)).toEqual({ scale: 1, x: 400, y: 250 });
  });
});

describe("zoomAt", () => {
  it("keeps the content point under the cursor in place", () => {
    const view = { scale: 1, x: 100, y: 50 };
    const point = { x: 300, y: 250 };
    const next = zoomAt(view, 2, point);
    // 그림 점 (200, 200)이 화면 (300, 250)에 있었다. 확대한 뒤에도 같은 자리.
    expect(next.scale).toBe(2);
    expect(200 * next.scale + next.x).toBeCloseTo(300);
    expect(200 * next.scale + next.y).toBeCloseTo(250);
  });

  it("clamps the scale to the allowed range", () => {
    expect(zoomAt({ scale: 7, x: 0, y: 0 }, 10, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 0.2, x: 0, y: 0 }, 0.001, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });

  it("does not move when the scale is already at the limit", () => {
    const view = { scale: MAX_SCALE, x: 12, y: 34 };
    expect(zoomAt(view, 2, { x: 500, y: 500 })).toEqual(view);
  });
});

describe("constrainView", () => {
  const content = { width: 400, height: 300 };
  const viewport = { width: 1000, height: 600 };

  it("leaves a view that is well inside alone", () => {
    const view = { scale: 1, x: 100, y: 100 };
    expect(constrainView(view, content, viewport)).toEqual(view);
  });

  it("keeps a margin of the content on screen when dragged away", () => {
    expect(constrainView({ scale: 1, x: 5000, y: -5000 }, content, viewport, 80)).toEqual({
      scale: 1,
      x: 1000 - 80,
      y: 80 - 300,
    });
    expect(constrainView({ scale: 1, x: -5000, y: 5000 }, content, viewport, 80)).toEqual({
      scale: 1,
      x: 80 - 400,
      y: 600 - 80,
    });
  });

  it("uses the content size as the margin for tiny content", () => {
    const tiny = { width: 20, height: 20 };
    expect(constrainView({ scale: 1, x: 5000, y: 0 }, tiny, viewport, 80).x).toBe(1000 - 20);
  });
});

describe("percentLabel", () => {
  it("formats the scale as a rounded percentage", () => {
    expect(percentLabel(1)).toBe("100%");
    expect(percentLabel(0.4567)).toBe("46%");
    expect(percentLabel(2.5)).toBe("250%");
  });
});
