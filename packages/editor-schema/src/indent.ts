/**
 * 문단·제목의 들여쓰기. 블록마다 `indent`(1~8단계)로 저장하고, 없으면(null) 들여쓰지 않은 것이다 — 그래서 들여쓰지 않은 문서는 저장되는 모양이 예전과 같다.
 * Markdown에는 한 단계를 `&emsp;` 두 개(약 두 글자)로 줄 맨 앞에 쓴다(탭·공백은 코드 블록이 되거나 사라지므로 쓸 수 없다).
 */
export const MAX_INDENT = 8;

/** 한 단계의 Markdown 폭: `&emsp;` 몇 개인가. */
export const EMSP_PER_LEVEL = 2;

/** 저장된 값이나 HTML 속성을 들여쓰기 단계로 바꾼다. 1~8의 정수만 받고(글자 숫자도), 그 밖이면 null(들여쓰지 않음). */
export function normalizeIndent(value: unknown): number | null {
  const n = typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_INDENT ? n : null;
}

/** 줄 맨 앞의 들여쓰기 문자(`&emsp;`와 U+2003 EM SPACE)의 개수를 단계로: 두 개가 한 단계, 홀수는 올림. */
export function indentFromLeadingSpaces(count: number): number | null {
  return count <= 0 ? null : normalizeIndent(Math.min(MAX_INDENT, Math.ceil(count / EMSP_PER_LEVEL)));
}

/** Markdown 줄 맨 앞에 쓸 `&emsp;`들(단계가 없으면 빈 글자). */
export function indentPrefix(indent: unknown): string {
  const level = normalizeIndent(indent);
  return level === null ? "" : "&emsp;".repeat(level * EMSP_PER_LEVEL);
}
