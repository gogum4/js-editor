import { normalizeTextAlign } from "./textAlign.ts";

/**
 * 이미지 블록의 크기와 정렬(순수 규칙).
 * - 크기는 **너비(px)만** 저장하고 높이는 화면이 비율대로 정한다(`height: auto`). 그래서 비율은 항상 지켜진다. 너비가 없으면 원본 크기다(칸보다 크면 칸에 맞춘다).
 * - 정렬은 문단과 같은 `textAlign` 속성을 쓴다. 이미지는 왼쪽(기본)·가운데·오른쪽만 있고 양쪽 맞춤은 왼쪽으로 본다.
 */

/** 너비를 줄일 수 있는 최소값(px). 손잡이가 가려지지 않을 만큼. */
export const MIN_IMAGE_WIDTH = 48;
/** 저장할 수 있는 최대 너비(px). 터무니없는 값이 들어와도 화면이 깨지지 않게 막는다. */
export const MAX_IMAGE_WIDTH = 4000;

export type ImageAlign = "left" | "center" | "right";

/** 크기 단축 버튼: 칸 너비에 대한 비율. */
export const IMAGE_WIDTH_PRESETS = [25, 50, 75, 100] as const;

/** 저장된 값을 너비(px)로. 숫자가 아니거나 범위를 벗어나면 null(원본 크기). */
export function normalizeImageWidth(value: unknown): number | null {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded < MIN_IMAGE_WIDTH || rounded > MAX_IMAGE_WIDTH ? null : rounded;
}

/** 이미지 블록 속성에서 화면에 쓸 너비와 정렬을 꺼낸다. */
export function imageLayout(attrs: Record<string, unknown> | undefined): { width: number | null; align: ImageAlign } {
  const stored = normalizeTextAlign(attrs?.textAlign);
  return { width: normalizeImageWidth(attrs?.width), align: stored === "center" || stored === "right" ? stored : "left" };
}

/** 끌어서 정한 너비를 범위(최소·칸 너비) 안으로 맞춘다. 칸이 최소보다 좁으면 칸에 맞춘다. */
export function clampImageWidth(width: number, container: number): number {
  const max = Math.max(1, Math.floor(container));
  return Math.round(Math.min(Math.max(width, Math.min(MIN_IMAGE_WIDTH, max)), max));
}

/** 칸 너비의 `percent`%에 해당하는 너비(px). */
export function presetWidth(percent: number, container: number): number {
  return clampImageWidth((container * percent) / 100, container);
}

/**
 * 모서리 손잡이를 `dx`(px)만큼 끌었을 때의 새 너비. 오른쪽 손잡이는 오른쪽으로 끌면 커지고 왼쪽 손잡이는 반대다.
 * 가운데 정렬은 양쪽으로 함께 자라므로 같은 거리를 끌어도 두 배로 변한다.
 */
export function resizedWidth(start: number, dx: number, side: "left" | "right", align: ImageAlign, container: number): number {
  const delta = (side === "right" ? dx : -dx) * (align === "center" ? 2 : 1);
  return clampImageWidth(start + delta, container);
}

/** 지금 너비가 칸 너비의 몇 %쯤인지(눌린 단축 버튼 표시용). 어느 단축 값과도 1% 안으로 맞지 않으면 null. */
export function matchingPreset(width: number | null, container: number): number | null {
  if (width === null || container <= 0) return null;
  const percent = (width / container) * 100;
  return IMAGE_WIDTH_PRESETS.find((p) => Math.abs(percent - p) <= 1) ?? null;
}
