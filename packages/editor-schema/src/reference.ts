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

/** 참조에 딸린 설정(예: PlanBench의 `{{table:이름 rows=5}}`의 `rows`). 이름은 `[A-Za-z][\w-]*`, 값은 한 줄 글자(200자 이하), 최대 20개. */
export type ReferenceProps = Readonly<Record<string, string>>;

const PROP_NAME = /^[A-Za-z][\w-]*$/;

/** 올바른 설정만 남긴다. 하나도 없거나 올바르지 않으면(배열·객체가 아님 등) null. 이름을 정렬해서 같은 값은 같은 모양이 되게 한다. */
export function normalizeReferenceProps(value: unknown): ReferenceProps | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    // eslint-disable-next-line no-control-regex
    .filter(([k, v]) => PROP_NAME.test(k) && typeof v === "string" && v.length <= 200 && !/[\u0000-\u001f\u007f]/.test(v))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, 20) as Array<[string, string]>;
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

export interface ReferenceTarget {
  kind: string;
  id: string;
  /** 없으면 설정 없음. */
  props?: ReferenceProps;
}

/** 두 값이 모두 올바를 때만 대상으로 돌려준다. 설정(`props`)은 올바른 것만 붙는다. */
export function referenceTarget(kind: unknown, id: unknown, props?: unknown): ReferenceTarget | null {
  const k = normalizeReferenceKind(kind);
  const i = normalizeReferenceId(id);
  if (k === null || i === null) return null;
  const p = normalizeReferenceProps(props);
  return p === null ? { kind: k, id: i } : { kind: k, id: i, props: p };
}
