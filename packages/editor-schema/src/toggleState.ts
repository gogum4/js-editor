/**
 * 토글(접는 블록)의 열림 상태. **문서에 저장하지 않고** 이 컴퓨터의 설정에 블록 id별로 둔다 — 열고 닫을 때마다 문서가 바뀌면
 * 버전 기록·되돌리기·동기화에 노이즈가 생기고, 같은 본문을 여러 곳(동기화 블록·임베드)에서 볼 때 서로 영향을 주기 때문이다.
 * 기본은 **열림**이라 닫은 것의 id만 적는다(적게 저장된다).
 */

/** 설정에 적는 키. */
export const TOGGLE_CLOSED_KEY = "ui.toggleClosed";

/** 기억하는 닫힌 토글의 최대 개수. 넘으면 오래된 것부터 잊는다(지운 토글의 id가 쌓이지 않게). */
export const MAX_CLOSED_TOGGLES = 1000;

/** 설정에 적힌 글자를 닫힌 토글 id 목록으로. 이상한 값은 빈 목록이다. */
export function parseClosedToggles(stored: string | null): string[] {
  if (stored === null || stored === "") return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((id): id is string => typeof id === "string" && id !== "");
    return [...new Set(ids)].slice(-MAX_CLOSED_TOGGLES);
  } catch {
    return [];
  }
}

/** 닫힌 토글 id 목록을 설정에 적을 글자로. 한도를 넘으면 오래된 것(앞쪽)을 버린다. */
export function serializeClosedToggles(ids: readonly string[]): string {
  return JSON.stringify(ids.slice(-MAX_CLOSED_TOGGLES));
}

/**
 * 한 토글을 열거나 닫은 뒤의 목록. 닫으면 목록 끝에 더하고(가장 최근), 열면 뺀다. 이미 그 상태면 그대로다.
 * 순서가 "최근에 닫은 순"이라 한도를 넘을 때 오래 안 건드린 것부터 잊힌다.
 */
export function withToggleOpen(closed: readonly string[], id: string, open: boolean): string[] {
  const rest = closed.filter((x) => x !== id);
  return open ? rest : [...rest, id].slice(-MAX_CLOSED_TOGGLES);
}
