/**
 * 다이어그램 보기 창의 확대·이동 계산. 화면을 모르는 순수 함수다.
 * 그림의 한 점 `p`는 화면의 `(p.x * scale + x, p.y * scale + y)`에 놓인다. `scale` 1이 원래 크기다.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface View {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** 맞춤 때 작은 그림을 이 배율까지만 키운다(너무 작은 그림이 화면을 꽉 채워 흐려지지 않게). */
export const MAX_FIT_SCALE = 4;
/** 이동·확대 뒤에도 그림이 화면 안에 이만큼(px)은 남아 있어야 한다. 완전히 밀려 나가 잃어버리지 않게. */
export const KEEP_VISIBLE = 80;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** mermaid SVG 글자의 `viewBox`에서 그림의 원래 크기를 읽는다. 없거나 이상하면 null. */
export function svgSize(svg: string): Size | null {
  const match = /<svg\b[^>]*?\sviewBox\s*=\s*["']([^"']+)["']/i.exec(svg);
  if (!match) return null;
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [, , width, height] = parts;
  return width > 0 && height > 0 ? { width, height } : null;
}

/** 그림을 창 가운데에 여백을 두고 들어가게 하는 보기. 작은 그림은 `MAX_FIT_SCALE`까지만 키운다. */
export function fitView(content: Size, viewport: Size, padding = 48): View {
  const room = {
    width: Math.max(viewport.width - padding * 2, 1),
    height: Math.max(viewport.height - padding * 2, 1),
  };
  const scale = clamp(Math.min(room.width / content.width, room.height / content.height), MIN_SCALE, MAX_FIT_SCALE);
  return centerAt(content, viewport, scale);
}

/** 그림을 창 가운데에 두는 보기(배율은 그대로 받는다). */
export function centerAt(content: Size, viewport: Size, scale: number): View {
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
  };
}

/** `point`(화면 좌표) 아래의 그림 점이 제자리에 있게 하면서 `factor`배 확대한다. 배율은 범위 안으로 맞춘다. */
export function zoomAt(view: View, factor: number, point: Point): View {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const ratio = scale / view.scale;
  return {
    scale,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  };
}

/** 그림이 화면 안에 `KEEP_VISIBLE`만큼은 걸쳐 있도록 위치를 당겨 놓는다. */
export function constrainView(view: View, content: Size, viewport: Size, keep = KEEP_VISIBLE): View {
  const width = content.width * view.scale;
  const height = content.height * view.scale;
  // 그림이 키 가장자리보다 작으면 keep을 그림 크기로 낮춰 가운데 근처에 머물 수 있게 한다.
  const keepX = Math.min(keep, width);
  const keepY = Math.min(keep, height);
  return {
    scale: view.scale,
    x: clamp(view.x, keepX - width, viewport.width - keepX),
    y: clamp(view.y, keepY - height, viewport.height - keepY),
  };
}

/** 화면에 보이는 배율(%) 글자. */
export function percentLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
