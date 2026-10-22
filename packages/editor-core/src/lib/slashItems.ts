/** `/` 명령 메뉴의 항목 목록과 검색. 실제로 블록을 만드는 동작은 `slashCommands.ts`에 있다. */

export interface SlashItem {
  id: string;
  label: string;
  description: string;
  /** 검색에 쓰는 다른 이름들 (영문 이름, 줄임말, 한글 동의어). */
  keywords: string[];
}

/** 위키(페이지·동기화 블록)와 무관한 기본 항목. 앱이 자기 항목을 끼워 넣는 방법은 `createEditorExtensions`의 `slashItems`. */
export const CORE_SLASH_ITEMS: readonly SlashItem[] = [
  { id: "paragraph", label: "본문", description: "일반 텍스트", keywords: ["text", "paragraph", "p", "문단", "텍스트"] },
  { id: "heading1", label: "제목 1", description: "큰 제목", keywords: ["heading", "h1", "title", "큰제목"] },
  { id: "heading2", label: "제목 2", description: "중간 제목", keywords: ["heading", "h2", "중간제목"] },
  { id: "heading3", label: "제목 3", description: "작은 제목", keywords: ["heading", "h3", "작은제목"] },
  { id: "heading4", label: "제목 4", description: "제목 4단계", keywords: ["heading", "h4"] },
  { id: "heading5", label: "제목 5", description: "제목 5단계", keywords: ["heading", "h5"] },
  { id: "heading6", label: "제목 6", description: "제목 6단계", keywords: ["heading", "h6"] },
  { id: "bulletList", label: "글머리 기호 목록", description: "점으로 된 목록", keywords: ["bullet", "ul", "list", "목록", "글머리", "불릿"] },
  { id: "orderedList", label: "번호 목록", description: "1, 2, 3… 순서 목록", keywords: ["ordered", "ol", "number", "list", "번호", "순서"] },
  { id: "taskList", label: "할 일 목록", description: "체크박스가 있는 목록", keywords: ["todo", "task", "checkbox", "check", "체크", "할일", "체크박스"] },
  { id: "blockquote", label: "인용", description: "인용문", keywords: ["quote", "blockquote", "인용구"] },
  { id: "codeBlock", label: "코드 블록", description: "구문 강조가 되는 코드", keywords: ["code", "codeblock", "코드"] },
  { id: "table", label: "표", description: "행과 열로 된 표 (3×3, 머리글 행 포함)", keywords: ["table", "grid", "표", "테이블", "격자"] },
  { id: "toggle", label: "토글", description: "제목을 눌러 접고 펼치는 블록", keywords: ["toggle", "collapse", "collapsible", "details", "토글", "접기", "접는", "펼치기"] },
  { id: "horizontalRule", label: "구분선", description: "가로 줄", keywords: ["divider", "hr", "line", "rule", "구분", "가로줄"] },
  { id: "alignLeft", label: "왼쪽 정렬", description: "이 문단을 왼쪽에 맞춤 (Ctrl+Shift+L)", keywords: ["align", "left", "정렬", "왼쪽", "좌측", "기본"] },
  { id: "alignCenter", label: "가운데 정렬", description: "이 문단을 가운데로 (Ctrl+Shift+E)", keywords: ["align", "center", "middle", "정렬", "가운데", "중앙"] },
  { id: "alignRight", label: "오른쪽 정렬", description: "이 문단을 오른쪽에 맞춤 (Ctrl+Shift+R)", keywords: ["align", "right", "정렬", "오른쪽", "우측"] },
  { id: "alignJustify", label: "양쪽 정렬", description: "이 문단의 양 끝을 맞춤 (Ctrl+Shift+J)", keywords: ["align", "justify", "정렬", "양쪽", "균등", "양끝"] },
  { id: "image", label: "이미지", description: "사진·스크린샷 첨부", keywords: ["image", "img", "picture", "photo", "screenshot", "이미지", "사진", "그림", "스크린샷", "첨부"] },
  {
    id: "mathBlock",
    label: "수식",
    description: "LaTeX 수식을 한 줄에 크게 ($$)",
    keywords: ["math", "latex", "equation", "formula", "katex", "수식", "공식", "라텍스", "블록수식"],
  },
  {
    id: "mathInline",
    label: "인라인 수식",
    description: "문장 안의 LaTeX 수식 ($…$)",
    keywords: ["math", "latex", "inline", "equation", "수식", "공식", "라텍스", "인라인"],
  },
  {
    id: "footnote",
    label: "각주",
    description: "문장에 번호를 달고 페이지 끝에 주석 모으기",
    keywords: ["footnote", "note", "endnote", "각주", "주석", "미주"],
  },
  { id: "callout-note", label: "콜아웃 · 정보", description: "참고할 내용", keywords: ["callout", "note", "info", "콜아웃", "정보", "메모"] },
  { id: "callout-tip", label: "콜아웃 · 팁", description: "도움이 되는 조언", keywords: ["callout", "tip", "hint", "콜아웃", "팁", "힌트"] },
  { id: "callout-important", label: "콜아웃 · 중요", description: "꼭 알아야 할 내용", keywords: ["callout", "important", "콜아웃", "중요"] },
  { id: "callout-warning", label: "콜아웃 · 경고", description: "주의가 필요한 내용", keywords: ["callout", "warning", "warn", "콜아웃", "경고"] },
  { id: "callout-caution", label: "콜아웃 · 주의", description: "위험할 수 있는 내용", keywords: ["callout", "caution", "danger", "콜아웃", "주의", "위험"] },
];

/** 항목의 이름·설명을 사전의 글로 바꾼다(사전에 없는 항목은 그대로). 검색 이름(keywords)은 한국어·영어를 모두 남겨 어느 언어로도 찾게 한다. */
export function localizeSlashItems(
  items: readonly SlashItem[],
  texts: Readonly<Record<string, { label: string; description: string }>>,
): readonly SlashItem[] {
  return items.map((item) => {
    const text = texts[item.id];
    return text ? { ...item, label: text.label, description: text.description, keywords: [...item.keywords, item.label] } : item;
  });
}

/** 비교용으로 소문자로 바꾸고 공백·가운뎃점을 없앤다. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s·]+/g, "");
}

function score(item: SlashItem, query: string): number | null {
  const label = normalize(item.label);
  const keywords = item.keywords.map(normalize);

  if (label.startsWith(query)) return 1;
  if (keywords.some((k) => k.startsWith(query))) return 2;
  if (label.includes(query)) return 3;
  if (keywords.some((k) => k.includes(query))) return 4;
  return null;
}

/**
 * 검색어에 맞는 항목을 점수순으로 돌려준다 (이름 앞부분 일치 → 다른 이름 앞부분 일치 → 이름 포함 → 다른 이름 포함).
 * 점수가 같으면 원래 순서를 지킨다. 검색어가 비어 있으면 전체.
 */
export function filterSlashItems(query: string, items: readonly SlashItem[] = CORE_SLASH_ITEMS): SlashItem[] {
  const q = normalize(query);
  if (!q) return [...items];

  return items
    .map((item, index) => ({ item, index, s: score(item, q) }))
    .filter((entry): entry is { item: SlashItem; index: number; s: number } => entry.s !== null)
    .sort((a, b) => a.s - b.s || a.index - b.index)
    .map((entry) => entry.item);
}
