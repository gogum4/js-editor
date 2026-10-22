import { describe, expect, it } from "vitest";

import {
  clampImageWidth,
  IMAGE_WIDTH_PRESETS,
  imageLayout,
  matchingPreset,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_WIDTH,
  normalizeImageWidth,
  presetWidth,
  resizedWidth,
} from "./imageLayout";

describe("normalizeImageWidth", () => {
  it("범위 안의 숫자는 반올림해서 쓰고, 문자열 숫자도 받는다(HTML 속성)", () => {
    expect(normalizeImageWidth(320)).toBe(320);
    expect(normalizeImageWidth(320.6)).toBe(321);
    expect(normalizeImageWidth("480")).toBe(480);
  });

  it("숫자가 아니거나 범위를 벗어나면 null(원본 크기)", () => {
    expect(normalizeImageWidth(null)).toBeNull();
    expect(normalizeImageWidth(undefined)).toBeNull();
    expect(normalizeImageWidth("")).toBeNull();
    expect(normalizeImageWidth("abc")).toBeNull();
    expect(normalizeImageWidth(NaN)).toBeNull();
    expect(normalizeImageWidth(Infinity)).toBeNull();
    expect(normalizeImageWidth(MIN_IMAGE_WIDTH - 1)).toBeNull();
    expect(normalizeImageWidth(MAX_IMAGE_WIDTH + 1)).toBeNull();
    expect(normalizeImageWidth(MIN_IMAGE_WIDTH)).toBe(MIN_IMAGE_WIDTH);
    expect(normalizeImageWidth(MAX_IMAGE_WIDTH)).toBe(MAX_IMAGE_WIDTH);
  });
});

describe("imageLayout", () => {
  it("속성이 없으면 원본 크기·왼쪽이다", () => {
    expect(imageLayout(undefined)).toEqual({ width: null, align: "left" });
    expect(imageLayout({ hash: "x" })).toEqual({ width: null, align: "left" });
  });

  it("너비와 정렬을 꺼낸다. 양쪽 맞춤과 알 수 없는 값은 왼쪽이다", () => {
    expect(imageLayout({ width: 300, textAlign: "center" })).toEqual({ width: 300, align: "center" });
    expect(imageLayout({ width: "250", textAlign: "right" })).toEqual({ width: 250, align: "right" });
    expect(imageLayout({ textAlign: "justify" }).align).toBe("left");
    expect(imageLayout({ textAlign: "weird" }).align).toBe("left");
  });
});

describe("크기 계산", () => {
  it("clampImageWidth는 최소와 칸 너비 사이로 맞춘다", () => {
    expect(clampImageWidth(10, 600)).toBe(MIN_IMAGE_WIDTH);
    expect(clampImageWidth(300.4, 600)).toBe(300);
    expect(clampImageWidth(900, 600)).toBe(600);
    // 칸이 최소보다 좁으면 칸에 맞춘다.
    expect(clampImageWidth(100, 30)).toBe(30);
  });

  it("presetWidth는 칸 너비의 비율이다", () => {
    expect(presetWidth(50, 600)).toBe(300);
    expect(presetWidth(25, 600)).toBe(150);
    expect(presetWidth(100, 600)).toBe(600);
    expect(presetWidth(25, 100)).toBe(MIN_IMAGE_WIDTH);
  });

  it("resizedWidth: 오른쪽 손잡이는 오른쪽으로 끌면 커지고 왼쪽 손잡이는 반대다", () => {
    expect(resizedWidth(200, 50, "right", "left", 600)).toBe(250);
    expect(resizedWidth(200, 50, "left", "right", 600)).toBe(150);
    expect(resizedWidth(200, -50, "left", "right", 600)).toBe(250);
  });

  it("resizedWidth: 가운데 정렬은 양쪽으로 자라서 두 배로 변한다", () => {
    expect(resizedWidth(200, 50, "right", "center", 600)).toBe(300);
    expect(resizedWidth(200, -50, "right", "center", 600)).toBe(100);
  });

  it("resizedWidth는 범위를 넘지 않는다", () => {
    expect(resizedWidth(200, 5000, "right", "left", 600)).toBe(600);
    expect(resizedWidth(200, -5000, "right", "left", 600)).toBe(MIN_IMAGE_WIDTH);
  });

  it("matchingPreset은 1% 안으로 맞는 단축 값을 찾는다", () => {
    for (const percent of IMAGE_WIDTH_PRESETS) expect(matchingPreset(presetWidth(percent, 640), 640)).toBe(percent);
    expect(matchingPreset(333, 640)).toBeNull();
    expect(matchingPreset(null, 640)).toBeNull();
    expect(matchingPreset(300, 0)).toBeNull();
  });
});
