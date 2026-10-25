/** 본문의 링크를 기본 앱(브라우저, 메일)으로 열어도 되는 주소인지 판단한다. */
const OPENABLE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "zotero:"]);

/**
 * http, https, mailto, zotero(Zotero 항목 링크 `zotero://select/…`) 주소만 연다. `javascript:`나 `file:` 같은 것, 상대 경로, 깨진 주소는 열지 않는다.
 * (본문 내용은 붙여 넣은 것일 수 있으므로 열 수 있는 종류를 좁게 잡는다.)
 */
export function isSafeToOpen(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    return OPENABLE_PROTOCOLS.has(new URL(href.trim()).protocol);
  } catch {
    return false;
  }
}

/** Ctrl(윈도우·리눅스) 또는 ⌘(맥)와 함께 왼쪽 버튼으로 눌렀을 때만 링크를 연다. 그냥 클릭은 글자 편집이다. */
export function wantsToOpenLink(event: { button: number; ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.button === 0 && (event.ctrlKey || event.metaKey);
}
