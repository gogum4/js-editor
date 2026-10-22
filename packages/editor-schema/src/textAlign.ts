/**
 * 문단 정렬. 정렬은 문단·제목마다 `textAlign` 속성으로 저장한다.
 * **왼쪽은 기본이라 속성을 두지 않는다**(null). 그래서 정렬하지 않은 문서는 저장되는 모양이 예전과 똑같다.
 */
export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;

export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

/** 저장되는(왼쪽이 아닌) 정렬. */
export type StoredAlignment = Exclude<TextAlignment, "left">;

export const ALIGNMENT_LABEL: Readonly<Record<TextAlignment, string>> = {
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
  justify: "양쪽",
};

export function isTextAlignment(value: unknown): value is TextAlignment {
  return typeof value === "string" && (TEXT_ALIGNMENTS as readonly string[]).includes(value);
}

/** 저장된 값이나 HTML 스타일을 저장할 정렬로 바꾼다. 왼쪽(기본)이나 알 수 없는 값은 null(속성 없음). */
export function normalizeTextAlign(value: unknown): StoredAlignment | null {
  const lowered = typeof value === "string" ? value.trim().toLowerCase() : "";
  return lowered === "center" || lowered === "right" || lowered === "justify" ? lowered : null;
}

/** 블록(문단·제목)의 정렬 이름: 속성이 없으면 왼쪽. */
export function alignmentOf(attrs: Record<string, unknown> | undefined): TextAlignment {
  return normalizeTextAlign(attrs?.textAlign) ?? "left";
}
