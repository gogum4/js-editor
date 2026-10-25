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

import { COLOR_NAMES, type ExtraSyntax } from "@gogum4/editor-schema/extras";

const COLOR_ORDER = Object.keys(COLOR_NAMES);

/** 켠 추가 문법에 맞는 슬래시 항목(글은 `strings.extras.items`에서 온다). */
export function extraSlashItems(extras: ExtraSyntax | undefined): SlashItem[] {
  if (!extras) return [];
  const items: SlashItem[] = [];
  if (extras.toc) items.push({ id: "toc", label: "목차", description: "문서의 제목들로 만든 목차", keywords: ["toc", "contents", "outline", "목차", "차례"] });
  if (extras.definitions) items.push({ id: "definitionList", label: "정의 목록", description: "용어와 설명", keywords: ["definition", "dl", "glossary", "정의", "용어", "설명", "사전"] });
  if (extras.comments) items.push({ id: "comment", label: "주석", description: "글에는 안 보이는 메모", keywords: ["comment", "note", "hidden", "주석", "메모"] });
  if (extras.citations) items.push({ id: "citation", label: "인용", description: "참고 문헌 인용", keywords: ["citation", "cite", "zotero", "reference", "bibliography", "인용", "참고문헌", "논문"] });
  if (extras.marks) {
    items.push(
      { id: "highlight", label: "하이라이트", description: "형광펜", keywords: ["highlight", "mark", "marker", "하이라이트", "형광펜", "강조"] },
      { id: "superscript", label: "위첨자", description: "올려 쓰기", keywords: ["superscript", "sup", "위첨자", "제곱"] },
      { id: "subscript", label: "아래첨자", description: "내려 쓰기", keywords: ["subscript", "sub", "아래첨자"] },
      { id: "insert", label: "삽입", description: "추가된 글 표시", keywords: ["insert", "ins", "삽입", "추가"] },
      { id: "color-reset", label: "색 지우기", description: "글자색과 배경색 없애기", keywords: ["color", "clear", "reset", "색", "지우기", "초기화"] },
    );
    for (const name of COLOR_ORDER) {
      items.push({ id: `color-${name}`, label: `글자색 · ${name}`, description: "글자색", keywords: ["color", "text", "font", "글자색", "글씨색", "색", name] });
    }
    for (const name of COLOR_ORDER) {
      items.push({ id: `bg-${name}`, label: `배경색 · ${name}`, description: "배경색", keywords: ["background", "bg", "color", "배경색", "배경", "색", name] });
    }
  }
  return items;
}

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

/** `/임베드` 항목. 임베드 노드를 켠 때(`createCoreExtensions({ embed: true })`)만 메뉴에 더해지므로 기본 항목(`CORE_SLASH_ITEMS`)에는 없다. */
export const EMBED_SLASH_ITEM: SlashItem = {
  id: "embed",
  label: "임베드",
  description: "주소를 붙여 영상·게시물을 끼워 넣기",
  keywords: ["embed", "youtube", "video", "tweet", "instagram", "임베드", "영상", "유튜브", "트윗", "삽입"],
};
