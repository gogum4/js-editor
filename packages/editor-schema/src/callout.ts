/**
 * 콜아웃 종류. 이름은 `> [!이름]`의 이름(Obsidian과 같다)이라 **아무 이름이나** 쓸 수 있다.
 * 기본 5종은 GitHub 알림(`> [!NOTE]` …)과 같아서 Markdown으로 내보낼 때 대문자로 대응하고, 그 밖의 이름은 소문자 그대로 내보낸다.
 * 모양(아이콘·글)은 `calloutMeta`가 정한다 — 기본 5종과 Obsidian 이름은 정해진 아이콘이 있고, 모르는 이름은 소비자가 준 아이콘 표나 기본 아이콘을 쓴다.
 */
export const CALLOUT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;

/** 콜아웃 종류 이름. 위 5종 말고도 `NAME` 꼴이면 모두 올바르다. */
export type CalloutType = string;

export const DEFAULT_CALLOUT_TYPE = "note";

/** 종류 이름: 소문자로 시작하는 소문자·숫자·`_`·`-`, 32자까지. */
const NAME = /^[a-z][a-z0-9_-]{0,31}$/;

export interface CalloutMeta {
  label: string;
  icon: string;
}

export const CALLOUT_META: Readonly<Record<(typeof CALLOUT_TYPES)[number], CalloutMeta>> = {
  note: { label: "정보", icon: "ℹ️" },
  tip: { label: "팁", icon: "💡" },
  important: { label: "중요", icon: "❗" },
  warning: { label: "경고", icon: "⚠️" },
  caution: { label: "주의", icon: "🚫" },
};

/** 기본 5종 밖에서, Obsidian이 기본으로 주는 이름들. 이름을 그대로 보존하고 모양만 정한다. */
export const CALLOUT_PRESET_META: Readonly<Record<string, CalloutMeta>> = {
  info: { label: "정보", icon: "ℹ️" },
  abstract: { label: "요약", icon: "📋" },
  todo: { label: "할 일", icon: "☑️" },
  success: { label: "성공", icon: "✅" },
  question: { label: "질문", icon: "❓" },
  failure: { label: "실패", icon: "❌" },
  danger: { label: "위험", icon: "⚡" },
  bug: { label: "버그", icon: "🐛" },
  example: { label: "예시", icon: "📑" },
  quote: { label: "인용", icon: "💬" },
};

/** 아이콘을 모르는 이름이 쓰는 기본 아이콘. */
export const DEFAULT_CALLOUT_ICON = "📝";

/** 소비자가 정하는 종류별 아이콘 표(이모지나 짧은 글). 기본 종류의 아이콘도 이 표로 바꿀 수 있다. */
export type CalloutIcons = Readonly<Record<string, string>>;

export function isCalloutType(value: unknown): value is CalloutType {
  return typeof value === "string" && NAME.test(value);
}

/** 기본 5종인가(Markdown으로 내보낼 때 GitHub 알림 이름으로 쓰는 종류). */
export function isBuiltinCalloutType(value: unknown): value is (typeof CALLOUT_TYPES)[number] {
  return typeof value === "string" && (CALLOUT_TYPES as readonly string[]).includes(value);
}

/** 저장된 값이나 HTML 속성이 이상해도 항상 유효한 종류로 돌려준다 (대소문자·앞뒤 공백은 무시). */
export function normalizeCalloutType(value: unknown): CalloutType {
  const lowered = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isCalloutType(lowered) ? lowered : DEFAULT_CALLOUT_TYPE;
}

/** 콜아웃 이름(`NOTE`, `info`, `Warning`, `rocket` …)을 종류로(대소문자는 무시). 이름으로 쓸 수 없는 글자면 null. */
export function calloutTypeFromName(name: string): CalloutType | null {
  const lowered = name.trim().toLowerCase();
  return isCalloutType(lowered) ? lowered : null;
}

/** 종류의 모양. 기본 5종·Obsidian 이름은 정해진 값이고, 모르는 이름은 이름을 글로, 아이콘은 `icons`에서 찾고 없으면 기본 아이콘. `icons`는 정해진 아이콘도 덮는다. */
export function calloutMeta(type: CalloutType, icons?: CalloutIcons): CalloutMeta {
  const known = isBuiltinCalloutType(type) ? CALLOUT_META[type] : CALLOUT_PRESET_META[type];
  const icon = icons?.[type] ?? known?.icon ?? DEFAULT_CALLOUT_ICON;
  return { label: known?.label ?? type, icon };
}
