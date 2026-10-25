/**
 * 서지 정보(CSL JSON)를 읽고 인용 칩·참고문헌 목록의 글로 바꾸는 순수 함수들.
 * Zotero의 "내보내기 → CSL JSON"(Better BibTeX라면 인용 키가 `id`)이 입력이다. 표기는 APA 7에 가깝게 단순화한 것이고,
 * 완전한 CSL 스타일 엔진은 아니다(소비자가 `citeproc` 같은 것을 쓰고 싶으면 포트의 `label`·`entries`를 직접 구현한다).
 */

export interface CslName {
  family?: string;
  given?: string;
  /** 단체 저자나 한 덩어리 이름. */
  literal?: string;
}

export interface CslItem {
  id: string;
  type?: string;
  title?: string;
  author?: CslName[];
  editor?: CslName[];
  issued?: { "date-parts"?: Array<Array<number | string>>; raw?: string; literal?: string };
  "container-title"?: string;
  publisher?: string;
  volume?: string | number;
  issue?: string | number;
  page?: string;
  DOI?: string;
  URL?: string;
}

const MAX_ITEMS = 20000;

/** CSL JSON 글을 키 → 항목으로. 배열이나 `{ items: [...] }` 둘 다 받고, 모양이 틀린 항목은 건너뛴다. 아예 읽을 수 없으면 null. */
export function parseCslJson(text: string): Map<string, CslItem> | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : null;
  if (list === null) return null;
  const out = new Map<string, CslItem>();
  for (const raw of list.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as CslItem;
    const id = typeof item.id === "string" ? item.id : typeof item.id === "number" ? String(item.id) : "";
    if (id !== "" && !out.has(id)) out.set(id, { ...item, id });
  }
  return out;
}

const text = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : typeof value === "number" ? String(value) : "");

function family(name: CslName): string {
  return text(name.literal) || text(name.family) || text(name.given);
}

/** 발행 연도(없으면 null). */
export function cslYear(item: CslItem): string | null {
  const part = item.issued?.["date-parts"]?.[0]?.[0];
  if (part !== undefined && /^\d{1,4}$/.test(String(part))) return String(part);
  const raw = text(item.issued?.raw) || text(item.issued?.literal);
  return /\b(\d{4})\b/.exec(raw)?.[1] ?? null;
}

function people(item: CslItem): CslName[] {
  return (item.author?.length ? item.author : item.editor) ?? [];
}

/** 본문 인용에 쓰는 저자 부분: 1명 "Smith", 2명 "Smith & Lee", 3명 이상 "Smith et al."(저자가 없으면 제목 앞부분). */
export function cslAuthorLabel(item: CslItem): string {
  const names = people(item).map(family).filter((n) => n !== "");
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  if (names.length > 2) return `${names[0]} et al.`;
  const title = text(item.title);
  return title.length > 30 ? `${title.slice(0, 30).trimEnd()}…` : title;
}

/** 인용 한 건의 글. 괄호형(`[@key]`)은 "Smith 2020", 서술형(`@key`)은 "Smith (2020)". 연도가 없으면 "n.d.". */
export function cslLabel(item: CslItem, narrative: boolean): string {
  const author = cslAuthorLabel(item);
  const year = cslYear(item) ?? "n.d.";
  return narrative ? `${author} (${year})` : `${author} ${year}`;
}

/** 인용 키들의 글. 괄호형은 "Smith 2020; Lee 2019", 서술형은 "Smith (2020), Lee (2019)". 모르는 키가 하나라도 있으면 null(원문을 그대로 보인다). */
export function cslLabelForKeys(lookup: (key: string) => CslItem | undefined, keys: readonly string[], narrative = false): string | null {
  if (keys.length === 0) return null;
  const parts: string[] = [];
  for (const key of keys) {
    const item = lookup(key);
    if (!item) return null;
    parts.push(cslLabel(item, narrative));
  }
  return parts.join(narrative ? ", " : "; ");
}

function initials(given: string): string {
  return given
    .split(/[\s.]+/)
    .filter((part) => part !== "")
    .map((part) => `${part.slice(0, 1).toUpperCase()}.`)
    .join(" ");
}

function listName(name: CslName): string {
  if (name.literal) return text(name.literal);
  const last = text(name.family);
  const given = initials(text(name.given));
  return last === "" ? given : given === "" ? last : `${last}, ${given}`;
}

function authorList(names: readonly CslName[]): string {
  const list = names.map(listName).filter((n) => n !== "");
  if (list.length <= 1) return list[0] ?? "";
  if (list.length <= 20) return `${list.slice(0, -1).join(", ")}, & ${list[list.length - 1]}`;
  return `${list.slice(0, 19).join(", ")}, … ${list[list.length - 1]}`;
}

const stripDot = (s: string) => s.replace(/[.\s]+$/, "");

/**
 * 참고문헌 목록의 한 줄(평문). APA 7을 단순화한 모양: `저자. (연도). 제목. 출처, 권(호), 쪽. 주소`.
 * 항목이 없는 키는 호출하는 쪽이 키 그대로 보인다.
 */
export function cslEntry(item: CslItem): string {
  const parts: string[] = [];
  const authors = authorList(people(item));
  const year = cslYear(item) ?? "n.d.";
  const title = stripDot(text(item.title));
  const container = stripDot(text(item["container-title"]));
  parts.push(authors !== "" ? `${stripDot(authors)}. (${year}).` : `(${year}).`);
  if (title !== "") parts.push(`${title}.`);
  if (container !== "") {
    const volume = text(item.volume);
    const issue = text(item.issue);
    const page = text(item.page).replace(/-+/g, "–");
    const detail = [container, volume !== "" ? (issue !== "" ? `${volume}(${issue})` : volume) : "", page].filter((p) => p !== "").join(", ");
    parts.push(`${detail}.`);
  } else if (text(item.publisher) !== "") {
    parts.push(`${stripDot(text(item.publisher))}.`);
  }
  const doi = text(item.DOI);
  const url = text(item.URL);
  if (doi !== "") parts.push(/^https?:\/\//i.test(doi) ? doi : `https://doi.org/${doi}`);
  else if (/^https?:\/\//i.test(url)) parts.push(url);
  return parts.join(" ");
}

/** 문서에서 인용된 키들을 처음 나온 순서로(중복 없이). `sources`는 각 인용의 원문. */
export function orderedCitedKeys(sources: readonly string[], keysOf: (source: string) => readonly string[]): string[] {
  const seen = new Set<string>();
  for (const source of sources) for (const key of keysOf(source)) seen.add(key);
  return [...seen];
}
