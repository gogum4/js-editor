/**
 * 에디터가 모르는 "디렉티브" 문법(`remark-directive` 계열: `::youtube{id=x}`, `:::note[제목] … :::`, `:postlink[글]{slug}`)을 찾는다.
 * 찾은 것은 가져올 때 `raw` 노드에 **원문 그대로** 담기고 내보낼 때 한 글자도 바뀌지 않는다(docs/EDITOR-PACKAGE.md P6-1).
 * 순수 함수다 — Markdown 파서(marked)는 이 문법을 모르고 글자를 망가뜨리므로, 파서에 넘기기 전에 이 구간을 떼어 놓는다.
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** 디렉티브의 이름 뒤 부분: `[라벨]`과 `{속성}`을 각각 하나까지(둘 다 없어도 된다). */
const TAIL = String.raw`(?:\[[^\n]*\])?(?:\{[^\n]*\})?[ \t]*$`;
/** 한 줄짜리(leaf) 디렉티브: `::이름[라벨]{속성}` — 콜론 둘. */
const LEAF = new RegExp(String.raw`^ {0,3}::[A-Za-z][\w-]*` + TAIL);
/** 컨테이너 디렉티브의 여는 줄: `:::이름[제목]{속성}` — 콜론 셋 이상, 이름이 있어야 한다. */
const OPENER = new RegExp(String.raw`^ {0,3}:{3,}[A-Za-z][\w-]*` + TAIL);
/** 컨테이너의 닫는 줄: 콜론 셋 이상만. */
const CLOSER = /^ {0,3}:{3,}[ \t]*$/;

/** 줄 번호 `start`부터 `end`(포함하지 않음)까지가 디렉티브 하나이고, `text`가 그 원문(줄 사이는 `\n`). */
export interface RawBlockRegion {
  start: number;
  end: number;
  text: string;
}

/**
 * 줄들에서 최상위 디렉티브 구간을 찾는다. 코드 울타리(``` · ~~~) 안은 건드리지 않는다.
 * 컨테이너는 같은 종류의 여는 줄과 닫는 줄을 세어서 짝을 맞춘다(안에 컨테이너가 또 있어도 바깥 것 하나가 한 구간이다).
 * 닫히지 않은 컨테이너는 여는 줄 한 줄만 구간으로 삼는다 — 원문은 그래도 지켜진다.
 */
export function findRawBlocks(lines: readonly string[]): RawBlockRegion[] {
  const regions: RawBlockRegion[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (LEAF.test(line)) {
      regions.push({ start: i, end: i + 1, text: line });
    } else if (OPENER.test(line)) {
      const end = containerEnd(lines, i);
      regions.push({ start: i, end, text: lines.slice(i, end).join("\n") });
      i = end - 1;
    }
  }
  return regions;
}

/** `open`번째 줄에서 열린 컨테이너가 닫히는 줄의 다음 줄 번호(닫히지 않으면 `open + 1`). 안의 코드 울타리는 건너뛴다. */
function containerEnd(lines: readonly string[], open: number): number {
  let depth = 1;
  let fence: string | null = null;
  for (let j = open + 1; j < lines.length; j++) {
    const line = lines[j]!;
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (OPENER.test(line)) depth += 1;
    else if (CLOSER.test(line)) {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  return open + 1;
}

/**
 * 글 중간의 디렉티브: `:이름[글]{속성}` · `:이름[글]` · `:이름{속성}`. 이름 앞이 글자·숫자·`:`이면 아니다(`10:30`, `https://`, `::`).
 * `[`나 `{`가 없는 `:이름`은 이모티콘·시각 표기와 구별할 수 없어 디렉티브로 보지 않는다.
 */
export const INLINE_DIRECTIVE = /(?<![\w:])(:[A-Za-z][\w-]*(?:\[[^\]\n]*\](?:\{[^}\n]*\})?|\{[^}\n]*\}))/g;
