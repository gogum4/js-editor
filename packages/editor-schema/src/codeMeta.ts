/**
 * 코드 블록의 **메타 문자열**: 펜스 뒤 언어 다음에 오는 글(```` ```ts title="a.ts" {2,4-6} showLineNumbers ````).
 * 저장은 원문 그대로(`codeBlock.attrs.meta`)이고, 읽는 쪽이 이 함수로 뜻을 푼다. 모르는 낱말은 무시하되 원문은 지우지 않는다.
 * - `title="파일명"` (작은따옴표도 된다) — 제목 줄
 * - `{2,4-6}` — 강조할 줄(1부터)
 * - `showLineNumbers`·`ln` — 줄 번호
 */
export interface CodeMeta {
  title: string | null;
  /** 강조할 줄 번호(1부터, 오름차순, 중복 없음). */
  lines: number[];
  showLineNumbers: boolean;
}

const MAX_LINES = 2000;
const MAX_META = 300;

/** 저장해도 되는 메타(공백 정리, 한 줄, 길이 제한). 비면 null. */
export function normalizeCodeMeta(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const meta = value.replace(/\s+/g, " ").trim().slice(0, MAX_META);
  return meta === "" ? null : meta;
}

export function parseCodeMeta(meta: unknown): CodeMeta {
  const text = normalizeCodeMeta(meta) ?? "";
  const result: CodeMeta = { title: null, lines: [], showLineNumbers: false };
  if (text === "") return result;

  const title = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/.exec(text);
  if (title) {
    const value = (title[1] ?? title[2] ?? "").trim();
    result.title = value === "" ? null : value;
  }

  const set = new Set<number>();
  const group = /\{([\d,\s-]+)\}/.exec(text);
  if (group) {
    for (const part of group[1]!.split(",")) {
      const range = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
      if (!range) continue;
      const from = Number(range[1]);
      const to = range[2] === undefined ? from : Number(range[2]);
      for (let line = Math.max(from, 1); line <= Math.min(to, MAX_LINES); line += 1) set.add(line);
    }
  }
  result.lines = [...set].sort((a, b) => a - b);

  result.showLineNumbers = /(?:^|\s)(?:showLineNumbers|ln)(?:\s|$|=)/.test(text);
  return result;
}
