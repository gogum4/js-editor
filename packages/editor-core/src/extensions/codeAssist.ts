/**
 * 코드 블록의 편의 입력: 괄호·따옴표 자동 닫기와 Enter 자동 들여쓰기.
 * 문서나 화면을 모르는 순수 함수라서, 블록의 글자와 커서 위치(블록 글자 기준, 0부터)만 받는다.
 */

/** 여는 글자 → 닫는 글자. 따옴표는 둘이 같다. */
export const PAIRS: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
};

const CLOSERS = new Set(Object.values(PAIRS));
const QUOTES = new Set(['"', "'"]);

/** 닫는 글자를 자동으로 넣어도 되는, 커서 바로 뒤의 글자들. 그 밖이면 단어 앞에서 괄호를 여는 것으로 보고 넣지 않는다. */
const CLOSE_BEFORE = ")]},;:";

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}_]/u.test(char);

const canCloseBefore = (after: string | undefined) =>
  after === undefined || /\s/.test(after) || CLOSE_BEFORE.includes(after);

export type TypedAction =
  /** 선택한 글자를 여는·닫는 글자로 감싼다. */
  | { kind: "wrap"; open: string; close: string }
  /** 여는 글자와 닫는 글자를 함께 넣고 그 사이에 커서를 둔다. */
  | { kind: "pair"; open: string; close: string }
  /** 이미 있는 닫는 글자를 넘어간다(글자는 넣지 않는다). */
  | { kind: "skip" };

/**
 * `start`~`end`(같으면 커서)에 한 글자 `char`를 입력했을 때 해야 할 일. 기본 입력대로 두려면 null.
 * - 선택이 있고 여는 글자를 치면 선택을 감싼다.
 * - 커서 뒤에 같은 닫는 글자가 있으면 넘어간다.
 * - 여는 글자는 짝을 함께 넣는다. 따옴표는 단어 뒤(`don't`)나 같은 따옴표 뒤(`'''`)면 넣지 않는다.
 */
export function typedCharAction(text: string, start: number, end: number, char: string): TypedAction | null {
  const close = PAIRS[char];

  if (start !== end) {
    return close === undefined ? null : { kind: "wrap", open: char, close };
  }

  const before = text[start - 1];
  const after = text[start];

  if (CLOSERS.has(char) && after === char) return { kind: "skip" };
  if (close === undefined) return null;
  if (!canCloseBefore(after)) return null;
  if (QUOTES.has(char) && (isWordChar(before) || before === char)) return null;
  return { kind: "pair", open: char, close };
}

/** Backspace가 커서 양쪽의 빈 짝(`()`, `""` 등)을 한꺼번에 지워야 하는지. */
export function shouldDeletePair(text: string, pos: number): boolean {
  const before = text[pos - 1];
  const after = text[pos];
  // 짝이 없는 글자의 `PAIRS[before]`는 undefined라서, 글자 끝(`after`도 undefined)에서 같다고 나오지 않게 짝이 있는지부터 본다.
  const close = before === undefined ? undefined : PAIRS[before];
  return close !== undefined && close === after;
}

/**
 * 들여쓰기 한 단계. 줄이 탭으로 들여쓰였으면 탭, 아니면 블록 안에서 가장 얕은 공백 들여쓰기 폭을 따른다.
 * 블록에 공백 들여쓰기가 하나도 없으면 탭(Tab 키가 넣는 것과 같다).
 */
export function indentUnit(text: string, lineIndent: string): string {
  if (lineIndent.includes("\t")) return "\t";
  let narrowest = Infinity;
  for (const line of text.split("\n")) {
    const match = /^( +)\S/.exec(line);
    if (match) narrowest = Math.min(narrowest, match[1].length);
  }
  return Number.isFinite(narrowest) ? " ".repeat(narrowest) : "\t";
}

export interface EnterEdit {
  /** `start`~`end`를 이 글자로 바꾼다. */
  insert: string;
  /** 바꾼 뒤 커서 위치(`insert` 안의 오프셋). */
  cursor: number;
}

/**
 * Enter를 눌렀을 때 넣을 글자. 앞 줄의 들여쓰기를 이어 가고,
 * 줄이 `{` `(` `[`로 끝나면 한 단계 더 들여쓴다. 열고 닫는 글자 사이에서 누르면
 * 가운데 줄을 들여써서 만들고 닫는 글자는 자기 줄로 내려보낸다.
 */
export function enterEdit(text: string, start: number, end: number): EnterEdit {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const linePrefix = text.slice(lineStart, start);
  const indent = /^[ \t]*/.exec(linePrefix)![0];

  const opener = linePrefix.trimEnd().slice(-1);
  const closer = opener === "{" || opener === "(" || opener === "[" ? PAIRS[opener] : undefined;
  if (closer === undefined) {
    const insert = `\n${indent}`;
    return { insert, cursor: insert.length };
  }

  const inner = `\n${indent}${indentUnit(text, indent)}`;
  // 여는 글자 바로 뒤에서 눌렀고 커서 뒤가 짝이면, 닫는 글자를 아래 줄로 보낸다.
  if (linePrefix.endsWith(opener) && text[end] === closer) {
    return { insert: `${inner}\n${indent}`, cursor: inner.length };
  }
  return { insert: inner, cursor: inner.length };
}
