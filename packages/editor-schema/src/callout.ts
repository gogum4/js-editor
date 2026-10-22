/** 콜아웃 종류. GitHub 알림(`> [!NOTE]` …)과 같은 5종이라 Markdown으로 내보낼 때 그대로 대응한다. */
export const CALLOUT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

export const DEFAULT_CALLOUT_TYPE: CalloutType = "note";

export const CALLOUT_META: Readonly<Record<CalloutType, { label: string; icon: string }>> = {
  note: { label: "정보", icon: "ℹ️" },
  tip: { label: "팁", icon: "💡" },
  important: { label: "중요", icon: "❗" },
  warning: { label: "경고", icon: "⚠️" },
  caution: { label: "주의", icon: "🚫" },
};

export function isCalloutType(value: unknown): value is CalloutType {
  return typeof value === "string" && (CALLOUT_TYPES as readonly string[]).includes(value);
}

/** 저장된 값이나 HTML 속성이 이상해도 항상 유효한 종류로 돌려준다 (대소문자는 무시). */
export function normalizeCalloutType(value: unknown): CalloutType {
  const lowered = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isCalloutType(lowered) ? lowered : DEFAULT_CALLOUT_TYPE;
}

/** Obsidian 등 다른 도구의 콜아웃 이름을 이 앱의 5종으로 옮기는 표. */
const CALLOUT_ALIASES: Readonly<Record<string, CalloutType>> = {
  info: "note", abstract: "note", summary: "note", todo: "note", question: "note", quote: "note", example: "note",
  hint: "tip", success: "tip", check: "tip", done: "tip",
  attention: "warning",
  failure: "caution", fail: "caution", missing: "caution", danger: "caution", error: "caution", bug: "caution",
};

/** 콜아웃 이름(`NOTE`, `info`, `Warning` …)을 이 앱의 5종 가운데 하나로. 모르는 이름이면 null (대소문자는 무시). */
export function calloutTypeFromName(name: string): CalloutType | null {
  const lowered = name.trim().toLowerCase();
  if (isCalloutType(lowered)) return lowered;
  return CALLOUT_ALIASES[lowered] ?? null;
}
