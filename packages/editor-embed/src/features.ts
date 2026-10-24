import type { SlashItem } from "@9um4/editor-core";

import type { Feature } from "./protocol.ts";

/** 기능 묶음 → 그 기능이 여는 `/` 메뉴 항목 id. 문단은 항상 있다. 이미지·토글·정렬은 일정 설명에 쓰지 않아 어느 묶음에도 없다. */
export const FEATURE_ITEMS: Readonly<Record<Feature, readonly string[]>> = {
  heading: ["heading1", "heading2", "heading3"],
  list: ["bulletList", "orderedList"],
  task: ["taskList"],
  quote: ["blockquote"],
  code: ["codeBlock"],
  divider: ["horizontalRule"],
  table: ["table"],
  math: ["mathBlock", "mathInline"],
  callout: ["callout-note", "callout-tip", "callout-important", "callout-warning", "callout-caution"],
  footnote: ["footnote"],
};

/** 허용한 기능의 항목만 남긴다(코어의 기본 항목 순서를 지킨다). */
export function allowedSlashItems(core: readonly SlashItem[], features: readonly Feature[]): SlashItem[] {
  const allowed = new Set<string>(["paragraph", ...features.flatMap((feature) => FEATURE_ITEMS[feature])]);
  return core.filter((item) => allowed.has(item.id));
}
