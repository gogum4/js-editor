/** 코드 블록 글자 안에서 `pos`에서 `remove`글자를 지우고 `insert`를 넣는 한 번의 수정. 위치는 블록 글자 기준(0부터). */
export interface CodeEdit {
  pos: number;
  remove: number;
  insert: string;
}

/** Shift+Tab이 줄 앞에서 걷어 내는 공백의 최대 개수. 탭 한 칸의 너비(CSS `tab-size`)와 맞춘다. */
export const OUTDENT_SPACES = 4;

/**
 * Tab / Shift+Tab이 코드 블록 글자에 일으킬 수정을 계산한다. `start`~`end`는 선택 범위(같으면 커서).
 * 한 번에 한 군데만 건드리는 작은 수정들로 돌려주므로, 협업 중에도 블록 전체를 갈아 끼우지 않는다.
 * 돌려주는 수정은 위치가 앞에서 뒤로 정렬돼 있고 서로 겹치지 않는다.
 */
export function computeIndentEdits(text: string, start: number, end: number, outdent: boolean): CodeEdit[] {
  const multiLine = text.slice(start, end).includes("\n");

  if (!outdent && !multiLine) {
    // 커서나 한 줄 안의 선택: 일반 편집기처럼 선택을 탭으로 바꾼다.
    return [{ pos: start, remove: end - start, insert: "\t" }];
  }

  // 손대는 줄들. 선택이 다음 줄의 맨 앞에서 끝나면 그 줄은 선택하지 않은 것으로 본다.
  const lastChar = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const edits: CodeEdit[] = [];
  let lineStart = text.lastIndexOf("\n", start - 1) + 1;
  while (lineStart <= lastChar) {
    if (!outdent) {
      // 빈 줄에는 탭을 넣지 않는다(줄 끝 공백이 남는 것을 피함).
      if (text[lineStart] !== "\n" && lineStart < text.length) edits.push({ pos: lineStart, remove: 0, insert: "\t" });
    } else if (text[lineStart] === "\t") {
      edits.push({ pos: lineStart, remove: 1, insert: "" });
    } else {
      let spaces = 0;
      while (spaces < OUTDENT_SPACES && text[lineStart + spaces] === " ") spaces++;
      if (spaces > 0) edits.push({ pos: lineStart, remove: spaces, insert: "" });
    }
    const next = text.indexOf("\n", lineStart);
    if (next === -1) break;
    lineStart = next + 1;
  }
  return edits;
}
