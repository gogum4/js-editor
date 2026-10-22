export interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface MenuPosition {
  left: number;
  top: number;
  placement: "below" | "above";
}

const EDGE = 8;

/**
 * 커서(앵커) 근처에 띄우는 메뉴의 위치를 정한다. 기본은 커서 아래이고,
 * 아래에 다 안 들어가는데 위에는 들어가면 위에 띄운다. 어느 쪽도 안 들어가면 아래에 두되 화면 안으로 끌어올린다.
 */
export function computeMenuPosition(
  anchor: AnchorRect,
  menu: Size,
  viewport: Size,
  gap = 6,
): MenuPosition {
  const maxLeft = Math.max(EDGE, viewport.width - menu.width - EDGE);
  const left = Math.min(Math.max(anchor.left, EDGE), maxLeft);

  const below = anchor.bottom + gap;
  const above = anchor.top - gap - menu.height;
  const fitsBelow = below + menu.height <= viewport.height - EDGE;
  const fitsAbove = above >= EDGE;

  if (fitsBelow || !fitsAbove) {
    const maxTop = Math.max(EDGE, viewport.height - menu.height - EDGE);
    return { left, top: Math.min(Math.max(below, EDGE), maxTop), placement: "below" };
  }
  return { left, top: above, placement: "above" };
}
