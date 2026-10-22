/**
 * 붙여넣은 일반 텍스트가 Markdown처럼 보이는지 판별한다. 틀려서 Markdown이 아닌 글을 바꿔 버리는 쪽이 더 나쁘므로 보수적으로 본다:
 * 블록 문법이 한 줄이라도 있거나(제목·목록·인용·코드 펜스·표·`$$`·`<details>`·각주 정의), 강한 인라인 문법이 있을 때만 참이다
 * (`**굵게**`, `~~취소선~~`, `[글](주소)`, `[[위키]]`, `` `코드` ``). `*기울임*`·`_기울임_`·`$수식$`은 평범한 글에도 많아서 신호로 보지 않는다.
 */
export function looksLikeMarkdown(text: string): boolean {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (normalized.trim() === "") return false;
  // 주소 하나만 붙여넣는 것은 링크 붙여넣기의 몫이다.
  if (/^\s*(https?:\/\/|mailto:)\S+\s*$/i.test(normalized)) return false;

  const lines = normalized.split("\n");
  if (lines.some(isBlockLine) || hasTable(lines)) return true;
  return STRONG_INLINE.some((pattern) => pattern.test(normalized));
}

const BLOCK_LINES: readonly RegExp[] = [
  /^ {0,3}#{1,6}\s+\S/, //                 제목
  /^ {0,3}[-*+]\s+\S/, //                  글머리·할 일
  /^ {0,3}\d{1,9}[.)]\s+\S/, //            번호
  /^ {0,3}>\s?\S/, //                      인용·콜아웃
  /^ {0,3}(```|~~~)/, //                   코드 펜스
  /^\s*\$\$/, //                           블록 수식
  /^\s*<details[\s>]/i, //                 토글
  /^\[\^[^\]\s]+\]:\s/, //                 각주 정의
];

const isBlockLine = (line: string) => BLOCK_LINES.some((pattern) => pattern.test(line));

const TABLE_DELIMITER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** `|`가 든 줄 바로 다음에 `|---|---|` 줄이 오면 GFM 표다. */
function hasTable(lines: readonly string[]): boolean {
  return lines.some((line, index) => {
    const next = lines[index + 1];
    return next !== undefined && line.includes("|") && next.includes("-") && TABLE_DELIMITER.test(next) && next.includes("|");
  });
}

const STRONG_INLINE: readonly RegExp[] = [
  /\*\*[^*\s][^*\n]*\*\*/, //     **굵게**
  /~~[^~\s][^~\n]*~~/, //         ~~취소선~~
  /\[[^\]\n]+\]\([^)\s]+\)/, //   [글](주소)
  /\[\[[^[\]\n]+\]\]/, //         [[위키]]
  /`[^`\n]+`/, //                 `코드`
];
