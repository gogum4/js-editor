/**
 * 코드 블록 자동완성의 순수 로직: 언어의 예약어 뽑기, mermaid 정적 목록, 커서 앞 단어 찾기, 후보 거르기.
 * 화면이나 문서는 모르고, 블록의 글자와 커서 위치(블록 글자 기준 오프셋)만 받는다.
 */

export type WordKind = "keyword" | "literal" | "builtin" | "type" | "word" | "diagram";

export interface Candidate {
  word: string;
  kind: WordKind;
}

/** 후보를 띄우기 시작하는 최소 글자 수. */
export const MIN_PREFIX = 2;
/** 한 번에 보여 주는 후보 수. */
export const MAX_CANDIDATES = 8;
/** 수동으로 불렀을 때(Ctrl+Space) 보여 주는 후보 수. 목록을 스크롤해서 본다. */
export const MAX_MANUAL_CANDIDATES = 40;

// ---------------------------------------------------------------------------
// 언어 예약어 (highlight.js 언어 정의에서 뽑는다)
// ---------------------------------------------------------------------------

const HLJS_KIND: Readonly<Record<string, WordKind>> = {
  keyword: "keyword",
  "variable.language": "keyword",
  literal: "literal",
  built_in: "builtin",
  type: "type",
};

const IDENTIFIER = /^[A-Za-z_$@][A-Za-z0-9_$]*$/;

function wordsOf(value: unknown): string[] {
  const list = typeof value === "string" ? value.split(/\s+/) : Array.isArray(value) ? value : [];
  const words: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    // highlight.js는 `단어|중요도` 형태도 쓴다.
    const word = item.split("|")[0];
    if (word.length >= MIN_PREFIX && IDENTIFIER.test(word)) words.push(word);
  }
  return words;
}

/**
 * highlight.js 언어 정의(`hljs => language`의 결과)의 `keywords`에서 예약어·상수·내장 이름·타입 이름을 뽑는다.
 * `keywords`는 문자열이거나 `{ keyword: "…", built_in: [...] }` 꼴이다. 같은 단어는 먼저 나온 종류를 쓴다.
 */
export function extractKeywords(language: { keywords?: unknown } | undefined): Candidate[] {
  const keywords = language?.keywords;
  if (!keywords) return [];

  const result = new Map<string, WordKind>();
  const add = (value: unknown, kind: WordKind) => {
    for (const word of wordsOf(value)) if (!result.has(word)) result.set(word, kind);
  };

  if (typeof keywords === "string" || Array.isArray(keywords)) {
    add(keywords, "keyword");
  } else if (typeof keywords === "object") {
    for (const [key, value] of Object.entries(keywords)) {
      if (key === "$pattern") continue;
      // 알려진 종류만 쓴다. 숫자 이름의 키는 목록을 풀어 쓴 언어(Dockerfile 등)라서 예약어로 본다.
      const kind = HLJS_KIND[key] ?? (/^\d+$/.test(key) ? "keyword" : undefined);
      if (kind) add(value, kind);
    }
  }
  return [...result].map(([word, kind]) => ({ word, kind }));
}

// ---------------------------------------------------------------------------
// mermaid (highlight.js에 문법이 없어서 직접 쓴 목록)
// ---------------------------------------------------------------------------

const DIAGRAM_TYPES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "quadrantChart",
  "requirementDiagram",
  "gitGraph",
  "mindmap",
  "timeline",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "architecture-beta",
  "C4Context",
];

const DIRECTIONS = ["TB", "TD", "BT", "RL", "LR"];
const COMMON = ["title", "accTitle", "accDescr"];

const MERMAID_WORDS: Readonly<Record<string, readonly string[]>> = {
  flowchart: ["subgraph", "end", "direction", "style", "classDef", "class", "click", "linkStyle", ...DIRECTIONS],
  sequenceDiagram: [
    "participant",
    "actor",
    "as",
    "activate",
    "deactivate",
    "autonumber",
    "loop",
    "alt",
    "else",
    "opt",
    "par",
    "and",
    "critical",
    "option",
    "break",
    "rect",
    "box",
    "end",
    "Note",
    "note",
    "over",
    "of",
    "left",
    "right",
    "create",
    "destroy",
    "link",
    "links",
  ],
  classDiagram: ["class", "namespace", "direction", "note", "link", "click", "callback", "style", "classDef", "cssClass", ...DIRECTIONS],
  stateDiagram: ["state", "as", "note", "end", "direction", "choice", "fork", "join", "left", "right", "of", "classDef", "class", ...DIRECTIONS],
  erDiagram: ["PK", "FK", "UK", "direction", ...DIRECTIONS],
  gantt: [
    "dateFormat",
    "axisFormat",
    "tickInterval",
    "excludes",
    "includes",
    "todayMarker",
    "weekday",
    "section",
    "done",
    "active",
    "crit",
    "milestone",
    "after",
  ],
  pie: ["showData"],
  journey: ["section"],
  gitGraph: ["commit", "branch", "checkout", "switch", "merge", "cherry-pick", "tag", "id", "type", "msg", "NORMAL", "REVERSE", "HIGHLIGHT"],
  timeline: ["section"],
  mindmap: ["root"],
};

/** 첫 줄의 단어로 어떤 다이어그램인지 본다. 같은 목록을 쓰는 종류는 묶는다. */
const MERMAID_ALIASES: Readonly<Record<string, string>> = {
  graph: "flowchart",
  "stateDiagram-v2": "stateDiagram",
};

/** 머리 줄: 비어 있지 않고 `%%` 주석이 아닌 첫 줄. `end`는 그 줄 끝의 위치. */
function mermaidHeader(text: string): { line: string; end: number } | null {
  let start = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line && !line.startsWith("%%")) return { line, end: start + raw.length };
    start += raw.length + 1;
  }
  return null;
}

/**
 * mermaid 코드에서 `offset`의 단어 자리에 제안할 말. 머리 줄을 쓰는 중이면 다이어그램 종류와 방향,
 * 그 밖에는 머리 줄이 가리키는 다이어그램의 말과 공통 말(`title` 등).
 */
export function mermaidWords(text: string, offset: number): Candidate[] {
  const header = mermaidHeader(text);
  if (!header || offset <= header.end) {
    return [
      ...DIAGRAM_TYPES.map((word) => ({ word, kind: "diagram" as const })),
      ...DIRECTIONS.map((word) => ({ word, kind: "keyword" as const })),
    ];
  }

  const type = header.line.split(/[\s;{]/)[0];
  const set = MERMAID_WORDS[MERMAID_ALIASES[type] ?? type] ?? [];
  return [...set, ...COMMON].map((word) => ({ word, kind: "keyword" as const }));
}

// ---------------------------------------------------------------------------
// 커서 앞 단어와 후보
// ---------------------------------------------------------------------------

/** 후보를 만드는 단어 글자. 한글은 넣지 않는다(주석·문자열의 한글 입력 중에 메뉴가 뜨지 않게). */
const WORD_CHAR = /[A-Za-z0-9_$]/;

export interface CurrentWord {
  /** 단어가 시작하는 위치(블록 글자 기준). */
  start: number;
  /** 커서 앞까지 친 글자. */
  prefix: string;
  /** 바로 앞이 `.`이면 멤버 접근이다(예약어는 맞지 않는다). */
  afterDot: boolean;
}

/** 커서 앞의 단어. 커서가 단어 한가운데면(뒤에 단어 글자가 이어지면) 고치는 중으로 보고 null. 숫자로 시작해도 null. */
export function currentWord(text: string, offset: number): CurrentWord | null {
  if (offset < text.length && WORD_CHAR.test(text[offset])) return null;
  let start = offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  const prefix = text.slice(start, offset);
  if (prefix.length === 0 || /^\d/.test(prefix)) return null;
  return { start, prefix, afterDot: text[start - 1] === "." };
}

/**
 * 수동으로 후보를 불렀을 때(Ctrl+Space)의 단어. 자동일 때와 달리 단어가 비어 있어도, 커서가 단어 한가운데여도
 * 된다(그때는 커서 앞까지가 단어다). 숫자로 시작하는 것만 제외한다.
 */
export function manualWord(text: string, offset: number): CurrentWord | null {
  let start = offset;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  const prefix = text.slice(start, offset);
  if (/^\d/.test(prefix)) return null;
  return { start, prefix, afterDot: text[start - 1] === "." };
}

/** 블록 안에 나온 식별자들. 커서가 쓰고 있는 단어 자신은 뺀다. */
function wordsInBlock(text: string, current: CurrentWord): string[] {
  const words = new Set<string>();
  for (const match of text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    if (match.index === current.start) continue;
    if (match[0].length >= MIN_PREFIX + 1) words.add(match[0]);
  }
  return [...words];
}

const RANK: Readonly<Record<WordKind, number>> = {
  word: 0,
  diagram: 1,
  keyword: 1,
  type: 2,
  literal: 3,
  builtin: 4,
};

export interface CandidateInput {
  text: string;
  offset: number;
  /** 언어 예약어(mermaid면 이 값은 쓰지 않고 정적 목록을 쓴다). */
  keywords: readonly Candidate[];
  mermaid?: boolean;
  limit?: number;
  /** 수동 호출: 이 단어를 쓰고 최소 글자 수를 따지지 않는다(빈 단어면 전체 후보). */
  word?: CurrentWord;
}

/**
 * 커서 앞 단어로 시작하는 후보. 순서는 대소문자까지 맞는 것 → 블록 안의 단어 → 예약어 → 타입 → 상수 → 내장,
 * 같으면 글자순. 이미 다 친 단어와 같은 것(대소문자만 다른 것 포함)은 빼고, 멤버 접근(`.` 뒤)에는 블록 안의 단어만 낸다.
 */
export function buildCandidates({ text, offset, keywords, mermaid = false, limit = MAX_CANDIDATES, word }: CandidateInput): Candidate[] {
  const current = word ?? currentWord(text, offset);
  if (!current || (!word && current.prefix.length < MIN_PREFIX)) return [];

  const known = mermaid ? mermaidWords(text, current.start) : keywords;
  const pool = new Map<string, Candidate>();
  if (!current.afterDot) for (const entry of known) pool.set(entry.word, entry);
  for (const word of wordsInBlock(text, current)) if (!pool.has(word)) pool.set(word, { word, kind: "word" });

  const lower = current.prefix.toLowerCase();
  return [...pool.values()]
    .filter((entry) => {
      const word = entry.word.toLowerCase();
      // 다 친 단어와 같은 것(대소문자만 다른 것 포함)은 뺀다. 남겨 두면 완성한 뒤에 Enter가 대소문자를 바꿔 버린다.
      return word !== lower && word.startsWith(lower);
    })
    .sort((a, b) => {
      const exactA = a.word.startsWith(current.prefix) ? 0 : 1;
      const exactB = b.word.startsWith(current.prefix) ? 0 : 1;
      return exactA - exactB || RANK[a.kind] - RANK[b.kind] || a.word.localeCompare(b.word);
    })
    .slice(0, limit);
}
