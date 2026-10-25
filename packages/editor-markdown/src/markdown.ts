/**
 * 본문(ProseMirror JSON)을 Markdown으로 바꾼다. 순수 함수라서 화면 없이 시험할 수 있다.
 *
 * 이 파일은 내보내기 쪽이고 반대 방향은 `markdownImport.ts`다. 노트 앱의 원본은 Yjs/JSON이고 Markdown은 거기서 만든 파생물이다.
 * Markdown으로 온전히 표현되지 않는 부분은 `notices`로 알려서 화면에 보여 줄 수 있게 한다.
 */

import { assetFileName, isAssetHash } from "@gogum4/editor-schema/assets";
import { blockIdOf } from "@gogum4/editor-schema/blockId";
import { normalizeImageWidth } from "@gogum4/editor-schema/imageLayout";
import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import { normalizeTextAlign } from "@gogum4/editor-schema/textAlign";

import { normalizeReferenceProps, type ReferenceProps } from "@gogum4/editor-schema/reference";
import { formatReference } from "./referenceDirective.ts";
import { isBuiltinCalloutType, normalizeCalloutFold, normalizeCalloutTitle, normalizeCalloutType } from "@gogum4/editor-schema/callout";
import { normalizeEmbedSize, normalizeEmbedTarget } from "@gogum4/editor-schema/embed";
import { emojiFromShortcode, type ExtraSyntax, isAbbrTerm, isSkippedTag, normalizeAbbrTitle, normalizeCitationSource, normalizeColor, normalizeCommentText, normalizeTag, TAG_IN_TEXT_SOURCE } from "@gogum4/editor-schema/extras";
import { indentPrefix } from "@gogum4/editor-schema/indent";
import type { MarkdownDialect } from "./dialect.ts";

export interface MarkdownOptions {
  /** 페이지 id로 제목을 찾는다. 삭제됐거나 없는 페이지는 null. */
  pageTitle: (pageId: string) => string | null;
  /**
   * 이미지 파일의 (이 Markdown 파일에서 본) 경로. 주지 않으면 `assets/<파일 이름>`이고,
   * 이때는 "assets 폴더의 파일을 가리킨다"는 안내가 붙는다(전체 내보내기는 경로를 직접 주므로 안내가 없다).
   */
  assetPath?: (hash: string, mime: string) => string;
  /**
   * 동기화 블록(숨김 페이지)의 본문 블록들. 주면 그 내용을 **그 자리에 복사해** 내보낸다(내보낸 파일에서는 서로 동기화되지 않는다).
   * 주지 않거나 null이면 그 블록은 빼고 안내한다.
   */
  syncedContent?: (pageId: string) => PmNode[] | null;
  /**
   * 블록 id를 Obsidian의 `^id`로 남긴다: 링크할 수 있는 블록(문단·제목·코드·수식·표·이미지)에 `^id`를 붙이고,
   * 블록 링크는 `[[제목#^id]]`로 쓴다. 문단·제목은 줄 끝에 ' ^id', 나머지는 블록 아래 빈 줄 뒤 한 줄(`^id`)이다.
   * 기본은 꺼짐(한 페이지 내보내기는 id가 지저분하므로). 전체 내보내기가 켠다.
   */
  blockIds?: boolean;
  /**
   * 내보낼 방언. 기본 `obsidian`(Obsidian 호환). `gfm`은 일반 GFM 문서: 이미지 크기·토글·밑줄·정렬 같은 Obsidian 쪽 표기를 쓰지 않는다.
   */
  dialect?: MarkdownDialect;
  /**
   * 하드 브레이크(`hardBreak`)를 쓰는 모양. 기본 `"backslash"`(`\` + 줄바꿈 — 어느 Markdown 해석기에서나 줄바꿈이다). `"newline"`은 그냥 줄바꿈 한 개로 쓴다:
   * Obsidian처럼 문단 안의 줄바꿈을 눈에 보이는 줄바꿈으로 그리는 소비자(일정 설명 같은 일반 글)가 원문을 그대로 돌려받는다.
   * 앞뒤가 글이 아니거나(문단 처음·끝, 연속한 줄바꿈) 줄바꿈이 문단을 나누게 되는 자리는 `"backslash"`로 쓴다.
   */
  hardBreakStyle?: "backslash" | "newline";
  /**
   * 참조 노드(`reference`)의 내보내기. `toMarkdown(kind, id)`가 글자(한 줄 이상)를 돌려주면 그것을, `null`이면 내보내지 않고(안내함), `undefined`면 기본 표기
   * `::ref{kind=… id=…}`를 쓴다. 블로그처럼 해석기가 없는 소비자는 기본 표기나 대체 표현을 고른다.
   */
  references?: { toMarkdown?: (kind: string, id: string, props: ReferenceProps | null) => string | null | undefined };
  /**
   * 켠 추가 문법(`ImportContext.extras`와 짝). 글자 속의 `#태그`·`%%`·`==`·`:이모지:` 같은 모양이 다시 읽을 때 문법으로 읽히지 않게 이스케이프하는 데 쓴다.
   * 마크·노드는 이 값과 상관없이 문서에 있으면 내보낸다.
   */
  extras?: ExtraSyntax;
  /**
   * 약어를 내보내는 모양. 기본 `"html"`: 낱말마다 `<abbr title="…">`(어디서나 읽힌다). `"definitions"`: 글은 그대로 두고 문서 끝에 `*[HTML]: 설명` 정의를 모은다(Joplin·Pandoc·PHP Markdown Extra).
   * 정의는 문서의 **같은 낱말 전부**에 걸리므로, 설명이 하나로 정해지고 그 낱말이 나올 때마다 약어인 경우에만 정의로 내보내고 그렇지 않은 낱말은 `<abbr>`로 내보낸다.
   */
  abbrStyle?: "html" | "definitions";
}

export interface MarkdownResult {
  markdown: string;
  /** 손실이나 대체가 있었다면 사람이 읽을 안내. 없으면 빈 배열. */
  notices: string[];
  /** 본문이 쓰는 이미지들(해시 기준으로 중복 없이, 문서 순서). */
  images: Array<{ hash: string; mime: string }>;
}

export const MISSING_PAGE_TITLE = "삭제된 페이지";

/** 글자 속에서 Markdown 문법으로 읽힐 수 있는 문자를 막는다. 과하게 막아도 보이는 글자는 같다. */
export function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]<~]/g, "\\$&");
}

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/**
 * 일반 GFM 문서(`gfm` 방언)용 이스케이프: 손으로 쓴 `.md` 파일에 `\`가 마구 붙지 않도록 **서식으로 읽힐 수 있는 자리만** 막는다.
 * 단어 속 `_`(`snake_case`), 양옆이 공백인 `*`, 홀로 있는 `~`, HTML 시작이 아닌 `<`(`a < b`)는 그대로 둔다(CommonMark·markdown-it에서 서식을 열지 못한다).
 * 글자 노드의 처음·끝 글자는 이웃을 몰라서 항상 막는다.
 */
export function escapeInlineGfm(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const prev = text[i - 1];
    const next = text[i + 1];
    if (c === "\\" || c === "`" || c === "[" || c === "]") out += `\\${c}`;
    else if (c === "*") out += isSpace(prev) && isSpace(next) ? c : `\\${c}`;
    else if (c === "_") out += isWordChar(prev) && isWordChar(next) ? c : `\\${c}`;
    else if (c === "<") out += next !== undefined && /[A-Za-z/!?]/.test(next) ? `\\${c}` : c;
    else if (c === "~") out += prev === "~" || next === "~" ? `\\${c}` : c;
    else out += c;
  }
  return out;
}

/** HTML 속성값에 넣을 글: `& < > "`를 개체로. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * 추가 문법을 켠 문서에서, 글자 속의 같은 모양(`#글`, `%%`, `==`, `++`, `^`, `:smile:`)이 다시 읽을 때 문법으로 읽히지 않게 `\`로 막는다.
 * `atStart`는 이 글이 줄(또는 공백) 바로 뒤에서 시작하는가 — `#태그`는 그때만 태그다.
 */
function escapeExtras(text: string, extras: ExtraSyntax, atStart: boolean): string {
  let out = text;
  if (extras.tags) {
    const probe = atStart ? out : `\u0000${out}`;
    const escaped = probe.replace(new RegExp(TAG_IN_TEXT_SOURCE, "gu"), (whole, name: string) => (normalizeTag(name) === null || isSkippedTag(name, extras) ? whole : `\\#${name}`));
    out = atStart ? escaped : escaped.slice(1);
  }
  if (extras.comments) out = out.replace(/%%/g, "\\%\\%");
  if (extras.marks) out = out.replace(/==/g, "\\=\\=").replace(/\+\+/g, "\\+\\+").replace(/\^/g, "\\^");
  if (extras.emoji) out = out.replace(/(?<![\w:]):([a-z0-9_+-]{1,40}):(?![\w:])/gi, (whole, name: string) => (emojiFromShortcode(name) === null ? whole : `\\:${name}\\:`));
  return out;
}

/** 줄 맨 앞의 `#`, `-`, `+`, `>`, `1.`이 블록 문법으로 읽히지 않게 한다. */
function escapeLineStart(line: string): string {
  if (/^(#{1,6}(\s|$)|[-+>])/.test(line)) return `\\${line}`;
  return line.replace(/^(\d+)([.)])(\s|$)/, "$1\\$2$3");
}

/** 문자열 안의 가장 긴 연속 `ch` 길이. */
function longestRun(text: string, ch: string): number {
  let longest = 0;
  let current = 0;
  for (const c of text) {
    current = c === ch ? current + 1 : 0;
    if (current > longest) longest = current;
  }
  return longest;
}

function renderCode(text: string): string {
  const fence = "`".repeat(longestRun(text, "`") + 1);
  // 안쪽이 백틱으로 시작·끝나면 구분용 공백이 필요하다.
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function renderLinkHref(href: string): string {
  return /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href;
}

/** 각주 정의의 본문: 줄바꿈이 있으면 이어지는 줄을 네 칸 들여 써서 같은 각주에 속하게 한다. */
function footnoteDefinition(index: number, text: string): string {
  const lines = text.split("\n").map((line) => line.trimEnd());
  return `[^${index}]: ${lines[0] ?? ""}${lines
    .slice(1)
    .map((line) => (line === "" ? "\n" : `\n    ${line}`))
    .join("")}`;
}

/** 글자에 씌우는 서식 하나의 여닫는 기호(`key`가 같으면 같은 서식이라 이어서 쓴다). */
interface MarkSyntax {
  key: string;
  open: string;
  close: string;
}

class Renderer {
  readonly notices = new Set<string>();
  readonly images = new Map<string, string>();
  /** 문서에 나온 순서대로의 각주 내용 (`[^1]`, `[^2]` …로 내보내고 끝에 정의를 모은다). */
  readonly footnotes: string[] = [];
  /** `abbrStyle: "definitions"`로 내보낼 수 있는 약어(낱말 → 설명). `prepareAbbreviations`가 채운다. */
  readonly abbrDefinitions = new Map<string, string>();
  private readonly linkedTitles = new Map<string, Set<string>>();
  private missingLinks = 0;

  constructor(private readonly options: MarkdownOptions) {}

  /** 노트 앱의 Obsidian 방언이 아니다(블로그·일반 GFM): 이미지 크기·토글·밑줄·정렬 같은 Obsidian 쪽 표기를 쓰지 않는다. */
  private get plain(): boolean {
    return this.options.dialect !== undefined && this.options.dialect !== "obsidian";
  }

  finish(): string[] {
    const duplicated = [...this.linkedTitles.entries()]
      .filter(([, ids]) => ids.size > 1)
      .map(([title]) => title);
    const notices = [...this.notices];
    if (duplicated.length > 0) {
      notices.push(
        `제목이 같은 서로 다른 페이지로 가는 링크(${duplicated.map((t) => `"${t}"`).join(", ")})는 Markdown의 [[제목]]에서 구별되지 않아요.`,
      );
    }
    if (this.missingLinks > 0) {
      notices.push(`삭제됐거나 없는 페이지로 가는 링크 ${this.missingLinks}개는 [[${MISSING_PAGE_TITLE}]]로 내보냈어요.`);
    }
    return notices;
  }

  /** 인라인 노드들(글자, 줄바꿈, 페이지 링크)을 한 문자열로. */
  inline(nodes: PmNode[] | undefined): string {
    const list = nodes ?? [];
    let out = "";
    // 열려 있는 서식(링크·굵게·기울임·취소선·밑줄을 이 순서로 바깥부터). 이어지는 글자 노드들이 같은 서식이면 한 쌍의 기호로 묶는다
    // (`**`float` 는 …**`처럼 코드 조각과 글자가 한 굵은 글씨일 때 `**`float`****는 …**`로 갈라지면 서식이 깨진다).
    let open: MarkSyntax[] = [];
    const closeFrom = (from: number) => {
      for (let j = open.length - 1; j >= from; j--) {
        // 닫는 기호 앞의 공백은 기호 밖으로 옮긴다(공백에 붙은 기호는 서식으로 읽히지 않는다).
        const ws = /\s+$/.exec(out)?.[0] ?? "";
        out = out.slice(0, out.length - ws.length) + open[j]!.close + ws;
      }
      open = open.slice(0, from);
    };
    list.forEach((node, index) => {
      if (node.type === "text") {
        const raw = node.text ?? "";
        if (raw === "") return;
        const lead = /^\s*/.exec(raw)?.[0] ?? "";
        const trail = raw.length > lead.length ? (/\s*$/.exec(raw)?.[0] ?? "") : "";
        const core = raw.slice(lead.length, raw.length - trail.length);
        if (core === "") {
          out += raw; // 공백뿐인 글자는 지금 열린 서식 안에 둔다(가장자리면 닫을 때 밖으로 나간다)
          return;
        }
        const marks = node.marks ?? [];
        const isCode = marks.some((m) => m.type === "code");
        const desired = this.markSyntax(marks, core);
        let common = 0;
        while (common < open.length && common < desired.length && open[common]!.key === desired[common]!.key) common++;
        closeFrom(common);
        out += lead;
        for (const syntax of desired.slice(common)) {
          out += syntax.open;
          open.push(syntax);
        }
        const escaped = isCode ? renderCode(core) : this.options.dialect === "gfm" ? escapeInlineGfm(core) : escapeInline(core);
        out += isCode || !this.options.extras ? escaped : escapeExtras(escaped, this.options.extras, out === "" || /\s$/.test(out));
        out += trail;
        return;
      }
      closeFrom(0);
      out += node.type === "hardBreak" ? this.hardBreak(list[index - 1], list[index + 1]) : this.inlineNode(node);
    });
    closeFrom(0);
    return out;
  }

  /** 글자 노드의 서식을 바깥부터 안쪽 순서(링크 → 굵게 → 기울임 → 취소선 → 밑줄)의 여닫는 기호로. 이 방언에 없는 서식(밑줄)은 안내하고 뺀다. */
  private markSyntax(marks: readonly { type: string; attrs?: Record<string, unknown> }[], text?: string): MarkSyntax[] {
    const has = (type: string) => marks.some((m) => m.type === type);
    const out: MarkSyntax[] = [];
    const link = marks.find((m) => m.type === "link");
    if (link && typeof link.attrs?.href === "string" && link.attrs.href !== "") {
      const href = link.attrs.href;
      out.push({ key: `link:${href}`, open: "[", close: `](${renderLinkHref(href)})` });
    }
    if (has("bold")) out.push({ key: "bold", open: "**", close: "**" });
    if (has("italic")) out.push({ key: "italic", open: "*", close: "*" });
    if (has("strike")) out.push({ key: "strike", open: "~~", close: "~~" });
    // 추가 문법의 마크: 하이라이트는 `==`(일반 GFM은 `<mark>`), 나머지는 어디서나 읽히는 HTML.
    if (has("highlight")) out.push(this.plain ? { key: "highlight", open: "<mark>", close: "</mark>" } : { key: "highlight", open: "==", close: "==" });
    if (has("superscript")) out.push({ key: "superscript", open: "<sup>", close: "</sup>" });
    if (has("subscript")) out.push({ key: "subscript", open: "<sub>", close: "</sub>" });
    if (has("insert")) out.push({ key: "insert", open: "<ins>", close: "</ins>" });
    for (const [type, property] of [["textColor", "color"], ["backgroundColor", "background-color"]] as const) {
      const color = normalizeColor(marks.find((m) => m.type === type)?.attrs?.color);
      if (color !== null) out.push({ key: `${type}:${color}`, open: `<span style="${property}: ${color}">`, close: "</span>" });
    }
    const abbr = marks.find((m) => m.type === "abbr");
    const abbrTitle = normalizeAbbrTitle(abbr?.attrs?.title);
    if (abbr && abbrTitle !== null && !(text !== undefined && this.abbrDefinitions.get(text) === abbrTitle)) out.push({ key: `abbr:${abbrTitle}`, open: `<abbr title="${escapeAttr(abbrTitle)}">`, close: "</abbr>" });
    if (has("underline")) {
      if (this.plain) this.notices.add("밑줄은 이 방언의 문법에 없어서 일반 글자로 내보냈어요.");
      else {
        out.push({ key: "underline", open: "<u>", close: "</u>" });
        this.notices.add("밑줄은 Markdown에 없어서 <u>…</u>로 내보냈어요.");
      }
    }
    return out;
  }

  /** 하드 브레이크 한 개. `newline` 모양은 양옆이 모두 글(줄바꿈이 아닌 인라인)일 때만 쓴다. */
  private hardBreak(previous: PmNode | undefined, next: PmNode | undefined): string {
    const plain = (n: PmNode | undefined) => n !== undefined && n.type !== "hardBreak";
    // 일반 GFM(`breaks:true`)은 줄바꿈 한 개가 눈에 보이는 줄바꿈이라 기본이 `newline`이다.
    const style = this.options.hardBreakStyle ?? (this.options.dialect === "gfm" ? "newline" : "backslash");
    return style === "newline" && plain(previous) && plain(next) ? "\n" : "\\\n";
  }

  private inlineNode(node: PmNode): string {
    switch (node.type) {
      case "text":
        return this.inline([node]);
      case "hardBreak":
        return "\\\n";
      case "pageLink":
        return this.pageLink(node);
      case "rawInline":
        // 에디터가 모르는 글 중간 디렉티브: 원문 그대로.
        return typeof node.attrs?.text === "string" ? node.attrs.text : "";
      case "comment": {
        const text = normalizeCommentText(node.attrs?.text);
        return text === null ? "" : `%%${text}%%`;
      }
      case "tag": {
        const name = normalizeTag(node.attrs?.name);
        return name === null ? "" : `#${name}`;
      }
      case "citation": {
        const source = normalizeCitationSource(node.attrs?.source);
        return source === null ? "" : `[${source}]`;
      }
      case "mathInline": {
        // 인라인 수식은 `$…$`. 줄바꿈은 공백으로, 앞뒤 공백은 없앤다(`$ x $`는 수식으로 읽히지 않는다).
        const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex.replace(/\s+/g, " ").trim() : "";
        return latex === "" ? "" : `$${latex}$`;
      }
      case "footnote": {
        // 각주는 `[^번호]`로 쓰고 내용은 문서 끝에 모은다(GFM·Obsidian 문법). 내용이 빈 각주는 내보내지 않는다.
        const text = typeof node.attrs?.text === "string" ? node.attrs.text.trim() : "";
        if (text === "") return "";
        this.footnotes.push(text);
        return `[^${this.footnotes.length}]`;
      }
      default:
        // 모르는 인라인 노드는 안에 든 글자만 내보낸다.
        this.notices.add(`지원하지 않는 인라인 요소(${node.type})는 글자만 내보냈어요.`);
        return this.inline(node.content);
    }
  }

  private pageLink(node: PmNode): string {
    const id = typeof node.attrs?.pageId === "string" ? node.attrs.pageId : "";
    // 블록 링크: `blockIds`가 켜져 있으면 `[[제목#^id]]`, 아니면 그 페이지로 가는 링크로 내보낸다(블록 표시 `^id`를 남기지 않는다).
    const blockId = node.type === "pageLink" ? blockIdOf({ type: "x", attrs: { id: node.attrs?.blockId } }) : null;
    const heading = typeof node.attrs?.heading === "string" ? node.attrs.heading.replace(/[[\]|#^\n]/g, " ").replace(/\s+/g, " ").trim() : "";
    const anchor = blockId !== null && this.options.blockIds ? `#^${blockId}` : heading !== "" ? `#${heading}` : "";
    if (node.type === "pageLink" && typeof node.attrs?.blockId === "string" && node.attrs.blockId !== "" && anchor === "") {
      this.notices.add("블록 링크는 그 페이지로 가는 링크로 내보냈어요.");
    }
    const title = id ? this.options.pageTitle(id) : null;
    if (title === null) {
      this.missingLinks += 1;
      return `[[${MISSING_PAGE_TITLE}]]`;
    }
    const shown = title.trim() === "" ? "제목 없음" : title;
    const ids = this.linkedTitles.get(shown) ?? new Set<string>();
    ids.add(id);
    this.linkedTitles.set(shown, ids);
    // `[[…]]` 안에서 대괄호는 구분자와 헷갈리므로 뺀다.
    // `[[대상|표시 글자]]`: 표시 글자가 있고 대상과 다르면 남긴다(가져올 때 `label`로 보존한 것).
    const label = typeof node.attrs?.label === "string" ? node.attrs.label.replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim() : "";
    const target = shown.replace(/[[\]]/g, "").replace(/\s+/g, " ");
    return `[[${target}${anchor}${label !== "" && label !== target ? `|${label}` : ""}]]`;
  }

  /** 블록들을 빈 줄로 이어 붙인다. 문서 끝의 빈 문단(에디터가 항상 두는 것)은 버린다. */
  blocks(nodes: PmNode[] | undefined, dropTrailingEmpty = false): string {
    let list = nodes ?? [];
    if (dropTrailingEmpty) {
      while (list.length > 0 && isEmptyParagraph(list[list.length - 1])) list = list.slice(0, -1);
    }
    const parts: string[] = [];
    let previousFamily: ReturnType<typeof listFamily> = null;
    const gfm = this.options.dialect === "gfm";
    let lastFamily: ReturnType<typeof listFamily> = null; // 바로 앞 블록이 목록이면 그 계열
    let flip = false;
    for (const node of list) {
      const family = listFamily(node, gfm);
      flip = family !== null && family === previousFamily ? !flip : false;
      this.flipList = flip;
      const rendered = this.block(node);
      this.flipList = false;
      if (rendered === null) continue;
      previousFamily = family;
      // 일반 GFM: 글머리 목록과 할 일 목록이 이어지면 같은 기호로 **빈 줄 없이** 붙여 써서 다시 한 목록(촘촘한 목록)으로 읽히게 한다.
      if (gfm && parts.length > 0 && family !== null && family !== "ordered" && lastFamily !== null && lastFamily !== "ordered" && family !== lastFamily) {
        parts[parts.length - 1] += `\n${rendered}`;
      } else parts.push(this.aligned(node, rendered));
      lastFamily = family;
    }
    return parts.join("\n\n");
  }

  /**
   * 가운데·오른쪽·양쪽 정렬한 문단·제목·이미지는 HTML `<div align="…">`로 감싼다(Markdown에는 정렬이 없다).
   * 안쪽 Markdown이 그대로 읽히도록 여는 태그와 닫는 태그 앞뒤에 빈 줄을 둔다. 목록 항목·표 셀 안의 블록은 감싸지 않는다(`blocks`를 거치지 않는다).
   * 이미지는 양쪽 맞춤이 없어서(왼쪽으로 본다) 가운데·오른쪽만 감싼다.
   */
  private aligned(node: PmNode, rendered: string): string {
    if (this.plain || (node.type !== "paragraph" && node.type !== "heading" && node.type !== "image")) return rendered;
    const align = normalizeTextAlign(node.attrs?.textAlign);
    if (align === null || (node.type === "image" && align === "justify")) return rendered;
    this.notices.add("가운데·오른쪽·양쪽 정렬은 Markdown에 없어서 HTML(<div align>)로 내보냈어요. 목록·표 안의 정렬은 내보내지 않아요.");
    return `<div align="${align}">\n\n${rendered}\n\n</div>`;
  }

  private block(node: PmNode): string | null {
    const rendered = this.blockWithoutId(node);
    if (rendered === null || !this.options.blockIds) return rendered;
    const id = blockIdOf(node);
    if (id === null) return rendered;
    if (node.type === "paragraph" || node.type === "heading") return `${rendered} ^${id}`;
    // 코드·수식·표·이미지는 줄 끝에 붙일 수 없어서 블록 아래 빈 줄 뒤에 둔다(Obsidian의 규칙).
    if (node.type === "codeBlock" || node.type === "mathBlock" || node.type === "table" || node.type === "image") return `${rendered}\n\n^${id}`;
    return rendered;
  }

  private blockWithoutId(node: PmNode): string | null {
    switch (node.type) {
      case "paragraph": {
        const text = this.inline(node.content);
        if (text.trim() === "") return null; // 빈 문단은 Markdown에서 의미가 없다.
        // 들여쓰기는 줄 맨 앞의 `&emsp;`(문단의 첫 줄만).
        return indentPrefix(node.attrs?.indent) + text.split("\n").map(escapeLineStart).join("\n");
      }
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
        return `${"#".repeat(level)} ${indentPrefix(node.attrs?.indent)}${this.inline(node.content).replace(/\n/g, " ")}`.trimEnd();
      }
      case "bulletList": {
        const mark = this.takeFlip() ? "*" : "-";
        return this.list(node, () => `${mark} `);
      }
      case "orderedList": {
        const start = Number(node.attrs?.start) || 1;
        const delimiter = this.takeFlip() ? ")" : ".";
        return this.list(node, (index) => `${start + index}${delimiter} `);
      }
      case "taskList": {
        const mark = this.takeFlip() ? "*" : "-";
        return this.list(node, (_index, item) => (item.attrs?.checked ? `${mark} [x] ` : `${mark} [ ] `));
      }
      case "blockquote":
        return prefixLines(this.blocks(node.content), "> ");
      case "callout": {
        // 기본 5종은 GitHub 알림 이름(대문자)으로, 그 밖의 이름은 소문자 그대로(Obsidian 콜아웃·사용자 이름).
        const type = normalizeCalloutType(node.attrs?.type);
        const label = isBuiltinCalloutType(type) ? type.toUpperCase() : type;
        const body = this.blocks(node.content);
        const title = normalizeCalloutTitle(node.attrs?.title);
        const head = `[!${label}]${normalizeCalloutFold(node.attrs?.fold) ?? ""}${title !== null ? ` ${title}` : ""}`;
        return prefixLines(body === "" ? head : `${head}\n${body}`, "> ");
      }
      case "codeBlock":
        return this.codeBlock(node);
      case "horizontalRule":
        return "---";
      case "image":
        return this.image(node);
      case "embed":
        return this.embed(node);
      case "mathBlock": {
        // 블록 수식은 `$$` 줄 사이에 LaTeX를 그대로 둔다. 내용이 빈 수식은 내보내지 않는다.
        const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex.trim() : "";
        return latex === "" ? null : `$$\n${latex}\n$$`;
      }
      case "reference": {
        const kind = String(node.attrs?.kind ?? "");
        const id = String(node.attrs?.id ?? "");
        const props = normalizeReferenceProps(node.attrs?.props);
        const custom = this.options.references?.toMarkdown?.(kind, id, props);
        if (custom === null) {
          this.notices.add(`참조(${kind})를 Markdown으로 내보내지 않았어요.`);
          return null;
        }
        const text = custom ?? formatReference(kind, id, props);
        if (text === null) {
          this.notices.add("참조 정보가 올바르지 않은 블록은 내보내지 못했어요.");
          return null;
        }
        return text;
      }
      case "raw":
        // 에디터가 모르는 블록 디렉티브: 원문 그대로(한 글자도 바꾸지 않는다). 빈 원문은 내보내지 않는다.
        return typeof node.attrs?.text === "string" && node.attrs.text !== "" ? node.attrs.text : null;
      case "toc":
        return "[toc]";
      case "definitionList":
        return this.definitionList(node);
      case "table":
        return this.table(node);
      case "toggle":
        return this.toggle(node);
      case "pageBlock": {
        if (node.attrs?.mode === "synced") return this.syncedBlock(node);
        // 카드는 링크 한 줄, 임베드는 Obsidian의 ![[…]] (본문을 끼우는 문법)로 내보낸다.
        const link = this.pageLink(node);
        return node.attrs?.mode === "embed" ? `!${link}` : link;
      }
      default:
        this.notices.add(`지원하지 않는 블록(${node.type})은 안의 내용만 내보냈어요.`);
        return this.blocks(node.content) || null;
    }
  }

  /** 정의 목록: `용어` 다음 줄마다 `: 설명`, 용어 묶음 사이는 빈 줄. 용어는 한 줄(줄바꿈은 공백)이고, 설명 안의 줄바꿈은 들여쓴 이어지는 줄이다. */
  private definitionList(node: PmNode): string | null {
    const groups: string[] = [];
    let current: string[] = [];
    for (const child of node.content ?? []) {
      const rendered = this.inline(child.content).replace(/\\\n/g, "\n").trim();
      const text = child.type === "definitionTerm" ? rendered.replace(/\s*\n\s*/g, " ") : rendered.replace(/\s*\n\s*/g, "\n    ");
      if (child.type === "definitionTerm") {
        if (current.length > 0) groups.push(current.join("\n"));
        current = [text === "" ? "\u00a0" : text];
      } else current.push(`: ${text}`);
    }
    if (current.length > 0) groups.push(current.join("\n"));
    return groups.length === 0 ? null : groups.join("\n\n");
  }

  /**
   * 표는 GFM 표로 내보낸다. Markdown 표는 병합 셀과 머리글 없는 표를 표현하지 못해서, 병합 셀은 풀어서(남는 칸은 빈 칸) 쓰고
   * 첫 줄을 머리글로 삼는다(그렇게 한 경우 안내한다). 셀 안의 문단은 <br>로 잇고 | 는 \| 로 쓴다.
   */
  private table(node: PmNode): string | null {
    const rows = node.content ?? [];
    const grid: string[][] = [];
    const taken: boolean[][] = [];
    let merged = false;
    rows.forEach((row, r) => {
      grid[r] ??= [];
      taken[r] ??= [];
      let c = 0;
      for (const cell of row.content ?? []) {
        while (taken[r]![c]) c++;
        const colspan = Math.max(1, Number(cell.attrs?.colspan) || 1);
        const rowspan = Math.max(1, Number(cell.attrs?.rowspan) || 1);
        if (colspan > 1 || rowspan > 1) merged = true;
        const text = this.cellText(cell);
        for (let dr = 0; dr < rowspan; dr++) {
          for (let dc = 0; dc < colspan; dc++) {
            (taken[r + dr] ??= [])[c + dc] = true;
            (grid[r + dr] ??= [])[c + dc] = dr === 0 && dc === 0 ? text : "";
          }
        }
        c += colspan;
      }
    });
    const columns = Math.max(0, ...grid.map((cells) => cells.length));
    if (grid.length === 0 || columns === 0) return null;
    if (merged) this.notices.add("병합된 표 셀은 풀어서 내보냈어요(Markdown 표는 셀 병합을 표현하지 못해요).");
    const firstRow = rows[0]?.content ?? [];
    if (!firstRow.every((cell) => cell.type === "tableHeader")) {
      this.notices.add("머리글 행이 없는 표는 첫 줄을 머리글로 내보냈어요.");
    }
    const line = (cells: string[]) => "| " + Array.from({ length: columns }, (_, i) => cells[i] ?? "").join(" | ") + " |";
    return [line(grid[0]!), "| " + Array(columns).fill("---").join(" | ") + " |", ...grid.slice(1).map(line)].join("\n");
  }

  /** 표 셀의 글자: 문단들을 <br>로 잇고, 줄바꿈은 <br>로, 세로선은 이스케이프한다. */
  private cellText(cell: PmNode): string {
    return (cell.content ?? [])
      .map((paragraph) => this.inline(paragraph.content).replace(/\\\n|\n/g, "<br>").replace(/\|/g, "\\|"))
      .filter((text) => text.trim() !== "")
      .join("<br>");
  }

  /** 토글은 HTML <details>로 내보낸다(제목 줄이 <summary>, 나머지는 안의 내용). */
  private toggle(node: PmNode): string | null {
    const [title, ...rest] = node.content ?? [];
    if (this.plain) {
      // 블로그·일반 GFM에는 토글이 없다(HTML도 그려지지 않는다) → 제목 줄을 굵은 문단으로 두고 내용을 이어 쓴다.
      this.notices.add("토글은 블로그 문법에 없어서 제목 문단과 내용으로 풀어 내보냈어요.");
      const head = title ? this.inline(title.content).replace(/\\\n|\n/g, " ").trim() : "";
      const inner = this.blocks(rest);
      return [head === "" ? "" : `**${head}**`, inner].filter((part) => part !== "").join("\n\n") || null;
    }
    const summary = title ? this.inline(title.content).replace(/\\\n|\n/g, " ").trim() : "";
    const body = this.blocks(rest);
    if (summary === "" && body === "") return null;
    return body === "" ? "<details>\n<summary>" + summary + "</summary>\n</details>" : "<details>\n<summary>" + summary + "</summary>\n\n" + body + "\n\n</details>";
  }

  /** 동기화 블록: 숨김 페이지의 내용을 그 자리에 복사해 쓴다. 내용을 모르면 빼고 안내한다. */
  private syncedBlock(node: PmNode): string | null {
    const id = typeof node.attrs?.pageId === "string" ? node.attrs.pageId : "";
    const blocks = id ? (this.options.syncedContent?.(id) ?? null) : null;
    if (!blocks) {
      this.notices.add("동기화 블록의 내용을 가져오지 못해 내보내지 않았어요.");
      return null;
    }
    this.notices.add("동기화 블록은 내용을 그 자리에 복사해 내보냈어요(내보낸 파일에서는 서로 동기화되지 않아요).");
    const text = this.blocks(blocks, true);
    return text === "" ? null : text;
  }

  /** `![대체 글자](경로)`. 해시가 올바르지 않은 이미지는 빼고 안내한다. */
  /** 외부 임베드는 `![](주소)`(크기가 있으면 `![|500x300](주소)`) — Obsidian의 임베드와 같은 모양이라 지원하는 곳에서는 영상·게시물로 보이고 아닌 곳에서는 이미지·링크 자리에 남는다. */
  private embed(node: PmNode): string | null {
    const target = normalizeEmbedTarget(node.attrs?.provider, node.attrs?.url);
    if (target === null) {
      // 주소를 아직 적지 않은 카드나 올바르지 않은 값은 내보내지 않는다.
      if (String(node.attrs?.url ?? "") !== "") this.notices.add("주소가 올바르지 않은 임베드는 내보내지 못했어요.");
      return null;
    }
    const width = this.plain ? null : normalizeEmbedSize(node.attrs?.width);
    const height = this.plain ? null : normalizeEmbedSize(node.attrs?.height);
    // Obsidian 크기 표기는 너비가 있어야 하므로 높이만 있는 크기는 내보내지 않는다.
    const size = width === null ? "" : height === null ? `|${width}` : `|${width}x${height}`;
    return `![${size}](${target.url})`;
  }

  private image(node: PmNode): string | null {
    const hash = node.attrs?.hash;
    const mime = typeof node.attrs?.mime === "string" ? node.attrs.mime : "";
    if (!isAssetHash(hash)) {
      this.notices.add("이미지 정보가 올바르지 않은 블록은 내보내지 못했어요.");
      return null;
    }
    this.images.set(hash, mime);
    // `|`는 크기 구분자로 쓰므로 설명 글자에서는 뺀다.
    const alt = String(node.attrs?.alt ?? "").replace(/[[\]|\n]/g, " ").replace(/\s+/g, " ").trim();
    // 크기는 Obsidian 문법(`![설명|너비](경로)`). 다른 편집기에서는 설명 글자에 `|너비`가 붙어 보일 수 있다.
    const width = this.plain ? null : normalizeImageWidth(node.attrs?.width);
    if (width !== null) this.notices.add("이미지 크기는 Obsidian 형식(![설명|너비](…))으로 내보냈어요. 다른 편집기에서는 크기가 적용되지 않을 수 있어요.");
    const label = width === null ? alt : `${alt}|${width}`;
    const path = this.options.assetPath ? this.options.assetPath(hash, mime) : `assets/${assetFileName(hash, mime)}`;
    if (!this.options.assetPath) {
      this.notices.add("이미지는 assets 폴더의 파일을 가리켜요. 파일은 설정의 전체 내보내기에서 함께 내보내요.");
    }
    return `![${label}](${path})`;
  }

  private codeBlock(node: PmNode): string {
    const code = (node.content ?? []).map((n) => n.text ?? "").join("");
    const fence = "`".repeat(Math.max(3, longestRun(code, "`") + 1));
    const language = typeof node.attrs?.language === "string" ? node.attrs.language.trim() : "";
    return `${fence}${language}\n${code}\n${fence}`;
  }

  /** 바로 앞 목록과 기호를 바꿔 써야 하는지(`blocks`·`list`가 정하고, 목록을 쓰는 쪽이 한 번 읽어 간다). */
  private flipList = false;

  private takeFlip(): boolean {
    const flip = this.flipList;
    this.flipList = false;
    return flip;
  }

  private list(node: PmNode, marker: (index: number, item: PmNode) => string): string {
    const items = node.content ?? [];
    return items
      .map((item, index) => {
        const bullet = marker(index, item);
        const indent = " ".repeat(bullet.length);
        const parts: string[] = [];
        let previous: PmNode | null = null;
        let flip = false;
        for (const child of item.content ?? []) {
          const family = listFamily(child, this.options.dialect === "gfm");
          flip = family !== null && previous !== null && family === listFamily(previous, this.options.dialect === "gfm") ? !flip : false;
          this.flipList = flip;
          const rendered = this.block(child);
          this.flipList = false;
          if (rendered === null) continue;
          // 목록이 이어질 때는 붙여 쓰고, 문단·코드 등은 빈 줄로 나눈다.
          const sep = previous === null ? "" : isList(child) ? "\n" : "\n\n";
          parts.push(sep + rendered);
          previous = child;
        }
        const body = parts.join("");
        if (body === "") return bullet.trimEnd();
        return bullet + body.split("\n").map((line, i) => (i === 0 || line === "" ? line : indent + line)).join("\n");
      })
      .join("\n");
  }
}

/**
 * 이어서 놓이면 Markdown이 한 목록으로 합치는 목록의 계열: 글머리·할 일은 `-`/`*`, 번호는 `.`/`)`. 같은 계열이 바로 이어지면
 * 둘째는 다른 기호(`*`, `)`)로 써서 목록 둘이 한 목록으로 합쳐지지 않게 한다(CommonMark는 기호가 바뀌면 새 목록으로 본다).
 * `splitTasks`(일반 GFM): 그 방언에서 `- [ ] 할 일`은 그냥 글머리 항목이다 → 글머리 목록과 할 일 목록이 이어져 있으면 원래 한 목록이었으므로
 * 계열을 나눠서(같은 기호를 쓰게 해서) 다시 한 목록으로 읽히게 한다. 같은 종류끼리 이어진 둘은 여전히 기호를 바꿔 쓴다.
 */
function listFamily(node: PmNode, splitTasks = false): "bullet" | "task" | "ordered" | null {
  if (node.type === "bulletList") return "bullet";
  if (node.type === "taskList") return splitTasks ? "task" : "bullet";
  return node.type === "orderedList" ? "ordered" : null;
}

function isList(node: PmNode): boolean {
  return node.type === "bulletList" || node.type === "orderedList" || node.type === "taskList";
}

function isEmptyParagraph(node: PmNode): boolean {
  return node.type === "paragraph" && (node.content ?? []).length === 0;
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? prefix.trimEnd() : prefix + line))
    .join("\n");
}

/** 문서(ProseMirror JSON의 `doc`)를 Markdown으로. 내용이 없으면 빈 문자열. */
/**
 * `abbrStyle: "definitions"`일 때 정의로 내보내도 다시 읽어 같아지는 약어만 고른다: 낱말(공백·대괄호 없는 한 덩어리)마다 설명이 하나이고,
 * 문서 어디서든 그 낱말이 (앞뒤가 글자가 아닌) 낱말로 나올 때는 항상 같은 약어 마크가 달려 있어야 한다.
 */
function prepareAbbreviations(doc: PmNode): Map<string, string> {
  const titles = new Map<string, Set<string>>();
  const texts: Array<{ text: string; title: string | null }> = [];
  const visit = (node: PmNode) => {
    if (node.type === "text") {
      const title = normalizeAbbrTitle(node.marks?.find((m) => m.type === "abbr")?.attrs?.title);
      texts.push({ text: node.text ?? "", title });
      if (title !== null && isAbbrTerm(node.text)) (titles.get(node.text) ?? titles.set(node.text, new Set()).get(node.text)!).add(title);
      return;
    }
    // 코드 안의 글자는 정의가 걸리지 않는다(가져올 때 코드 조각은 건드리지 않는다) — 확인에서 뺀다.
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  const safe = new Map<string, string>();
  for (const [term, set] of titles) {
    if (set.size !== 1) continue;
    const title = [...set][0]!;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "gu");
    const consistent = texts.every((entry) => !pattern.test(entry.text) || (entry.title === title && entry.text === term));
    pattern.lastIndex = 0;
    if (consistent) safe.set(term, title);
  }
  return safe;
}

export function docToMarkdown(doc: PmNode, options: MarkdownOptions): MarkdownResult {
  const renderer = new Renderer(options);
  if (options.abbrStyle === "definitions") for (const [term, title] of prepareAbbreviations(doc)) renderer.abbrDefinitions.set(term, title);
  let body = renderer.blocks(doc.content, true);
  if (renderer.abbrDefinitions.size > 0) {
    const used = [...renderer.abbrDefinitions].map(([term, title]) => `*[${term}]: ${title}`).join("\n");
    body = body === "" ? used : `${body}\n\n${used}`;
  }
  if (renderer.footnotes.length > 0) {
    const definitions = renderer.footnotes.map((text, i) => footnoteDefinition(i + 1, text)).join("\n");
    body = body === "" ? definitions : `${body}\n\n${definitions}`;
  }
  return {
    markdown: body === "" ? "" : `${body}\n`,
    notices: renderer.finish(),
    images: [...renderer.images].map(([hash, mime]) => ({ hash, mime })),
  };
}

/** 저장 대화상자의 기본 파일 이름. 파일 이름에 못 쓰는 문자를 빼고 `.md`를 붙인다. */
export function defaultMarkdownFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  const base = cleaned === "" ? "제목 없음" : cleaned.slice(0, 80).trim();
  // Windows 예약 이름(CON, NUL …)은 피한다.
  const safe = /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base) ? `${base}_` : base;
  return `${safe}.md`;
}
