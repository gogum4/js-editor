/**
 * 참조 노드(`reference`)의 속성 규칙. 문서에는 다른 개체를 가리키는 `kind`(종류)와 `id`만 저장하고, 보여 줄 때 소비자가 주입한 해석기가 내용을 읽는다
 * (docs/EDITOR-PACKAGE.md §2·P7). 예: 노트 앱의 `page`, PlanBench의 `table-schema`.
 */

export const REFERENCE_NODE = "reference";

/** 종류 이름: 소문자로 시작하는 소문자·숫자·`-`, 40자까지. */
const KIND = /^[a-z][a-z0-9-]{0,39}$/;

export function normalizeReferenceKind(value: unknown): string | null {
  return typeof value === "string" && KIND.test(value) ? value : null;
}

/** id: 비어 있지 않고 200자 이하이며 제어 문자가 없는 글자. 앞뒤 공백은 올바르지 않은 값으로 본다(조용히 고치지 않는다). */
export function normalizeReferenceId(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value.length > 200) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value) || value !== value.trim()) return null;
  return value;
}

export interface ReferenceTarget {
  kind: string;
  id: string;
}

/** 두 값이 모두 올바를 때만 대상으로 돌려준다. */
export function referenceTarget(kind: unknown, id: unknown): ReferenceTarget | null {
  const k = normalizeReferenceKind(kind);
  const i = normalizeReferenceId(id);
  return k !== null && i !== null ? { kind: k, id: i } : null;
}
