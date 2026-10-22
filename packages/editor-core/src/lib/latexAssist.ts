import { LATEX_COMMANDS, type LatexCommand } from "./latexCommands";

/**
 * 수식 편집 창의 입력 보조(순수 로직): 커서 앞의 `\명령` 찾기, 후보 거르기, 고른 명령 삽입, 괄호 자동 닫기.
 * 화면은 모르고 글자와 커서 위치만 받는다. 화면에 적용할 변경은 `Edit`(바꿀 범위, 넣을 글자, 끝난 뒤 커서)로 돌려준다.
 */

/** 바꿀 범위 [from, to)를 `insert`로 바꾸고, 끝난 뒤 커서를 `caret`(바뀐 글자 기준 위치)에 둔다. */
export interface Edit {
  from: number;
  to: number;
  insert: string;
  caret: number;
}

/** 시험과 화면 밖 계산에서 쓰는, 변경을 글자에 적용한 결과. */
export function applyEdit(text: string, edit: Edit): { text: string; caret: number } {
  return { text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to), caret: edit.caret };
}

/** 커서가 놓인 `\명령` 조각. */
export interface LatexQuery {
  /** 역슬래시(없으면 커서) 위치. */
  start: number;
  /** 바꿀 범위의 끝(커서 뒤에 이어진 글자까지). */
  end: number;
  /** 역슬래시 뒤에 이미 친 글자. */
  prefix: string;
  /** 역슬래시가 있는가(없으면 Ctrl+Space로 부른 경우). */
  hasBackslash: boolean;
}

/** 명령 이름에 쓰이는 글자(영문, 한글 — 한글은 설명 낱말로 찾을 때). */
const NAME_CHAR = /[A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/;
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

/** 자동으로 후보를 여는 최소 글자 수(한글은 한 글자부터). */
export const MIN_AUTO_PREFIX = 2;
/** 자동으로 보여 주는 후보 수. */
export const MAX_AUTO_CANDIDATES = 8;
/** Ctrl+Space로 불렀을 때 보여 주는 후보 수(목록을 스크롤해서 본다). */
export const MAX_MANUAL_CANDIDATES = 80;

/**
 * 커서 앞이 `\글자들`이면 그 조각을 돌려준다. 역슬래시가 둘 이어진 줄바꿈(`\\`) 뒤의 글자는 명령이 아니다.
 */
export function commandQuery(text: string, caret: number): LatexQuery | null {
  let begin = caret;
  while (begin > 0 && NAME_CHAR.test(text[begin - 1]!)) begin--;
  if (begin === 0 || text[begin - 1] !== "\\") return null;

  // 앞에 이어진 역슬래시가 홀수 개여야 명령의 시작이다(짝수 개는 `\\` 줄바꿈들).
  let run = 0;
  for (let i = begin - 1; i >= 0 && text[i] === "\\"; i--) run++;
  if (run % 2 === 0) return null;

  let end = caret;
  while (end < text.length && NAME_CHAR.test(text[end]!)) end++;
  return { start: begin - 1, end, prefix: text.slice(begin, caret), hasBackslash: true };
}

/** 자동으로 후보를 열 만큼 쳤는가. */
export function shouldAutoOpen(query: LatexQuery): boolean {
  if (!query.hasBackslash) return false;
  return HANGUL.test(query.prefix) ? query.prefix.length >= 1 : query.prefix.length >= MIN_AUTO_PREFIX;
}

interface Scored {
  command: LatexCommand;
  score: number;
  order: number;
}

function scoreOf(command: LatexCommand, query: string): number | null {
  const name = command.name;
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const lower = query.toLowerCase();
  const lowerName = name.toLowerCase();
  if (lowerName === lower) return 1.2;
  if (lowerName.startsWith(lower)) return 1.5;
  const words = command.keys.split(/\s+/).filter(Boolean);
  if (words.some((w) => w.startsWith(lower))) return 2;
  if (lowerName.includes(lower)) return 3;
  if (words.some((w) => w.includes(lower))) return 4;
  return null;
}

/**
 * 접두 글자로 후보를 거른다. 이름이 같으면 먼저, 이름이 그 글자로 시작하면 그다음, 설명 낱말(한글·영어)로 시작하는 것,
 * 이름에 들어 있는 것 순이고, 같은 순위에서는 목록에 적은 순서(자주 쓰는 것이 앞)를 따른다. 빈 글자면 전부(목록 순서).
 */
export function suggest(prefix: string, limit: number, commands: readonly LatexCommand[] = LATEX_COMMANDS): LatexCommand[] {
  if (prefix === "") return commands.slice(0, limit);
  const found: Scored[] = [];
  commands.forEach((command, order) => {
    const score = scoreOf(command, prefix);
    if (score !== null) found.push({ command, score, order });
  });
  found.sort((a, b) => a.score - b.score || a.order - b.order);
  return found.slice(0, limit).map((s) => s.command);
}

/** 고른 명령으로 `\명령 조각`을 바꾸는 변경. `$0`이 있으면 거기에 커서를 둔다. */
export function commandEdit(query: LatexQuery, command: LatexCommand): Edit {
  const marker = command.insert.indexOf("$0");
  const body = marker < 0 ? command.insert : command.insert.replace("$0", "");
  const caret = query.start + (marker < 0 ? body.length : marker);
  return { from: query.start, to: query.end, insert: body, caret };
}

const PAIRS: Readonly<Record<string, string>> = { "{": "}", "(": ")", "[": "]" };
const CLOSERS = new Set(Object.values(PAIRS));

/**
 * 여는 괄호를 쳤을 때의 변경: 글자를 골라 둔 채면 그 글자를 괄호로 감싸고, 아니면 짝을 같이 넣어 커서를 사이에 둔다.
 * 다음 글자가 단어의 일부(뒤에 글자가 이어짐)이거나 `\{`처럼 역슬래시 바로 뒤면 짝을 넣지 않는다(null).
 */
export function openPairEdit(text: string, start: number, end: number, key: string): Edit | null {
  const close = PAIRS[key];
  if (close === undefined) return null;
  if (text[start - 1] === "\\") return null;
  if (start !== end) {
    const selected = text.slice(start, end);
    return { from: start, to: end, insert: key + selected + close, caret: start + selected.length + 2 };
  }
  const next = text[start];
  if (next !== undefined && !/\s/.test(next) && !CLOSERS.has(next)) return null;
  return { from: start, to: start, insert: key + close, caret: start + 1 };
}

/** 닫는 괄호를 쳤는데 바로 뒤에 같은 괄호가 있으면 새로 넣지 않고 그 뒤로 건너뛴다(null이면 그냥 입력). */
export function skipCloserEdit(text: string, start: number, end: number, key: string): Edit | null {
  if (!CLOSERS.has(key) || start !== end || text[start] !== key) return null;
  return { from: start, to: start, insert: "", caret: start + 1 };
}

/** Backspace로 빈 괄호 쌍(`{}`·`()`·`[]`) 사이를 지울 때 짝도 함께 지운다(null이면 기본 동작). */
export function deletePairEdit(text: string, start: number, end: number): Edit | null {
  if (start !== end || start === 0) return null;
  const open = text[start - 1]!;
  if (PAIRS[open] === undefined || text[start] !== PAIRS[open]) return null;
  return { from: start - 1, to: start + 1, insert: "", caret: start - 1 };
}

/**
 * Tab: 커서 바로 뒤가 닫는 괄호면 그 뒤로 나가고, 이어서 `{`가 오면 그 안으로 들어간다.
 * 예) `\frac{a|}{b}` → Tab → `\frac{a}{|b}`. 해당이 없으면 null(기본 동작).
 */
export function tabJump(text: string, caret: number): number | null {
  const next = text[caret];
  if (next === undefined || !CLOSERS.has(next)) return null;
  let to = caret + 1;
  if (next === "}" && text[to] === "{") to += 1;
  return to;
}

/** 후보 목록의 삽입 글자를 사람이 읽는 모양으로(커서 자리는 ▮, 줄바꿈은 ⏎). */
export function insertPreview(command: LatexCommand): string {
  return command.insert.replace("$0", "▮").replace(/\n/g, " ⏎ ");
}
