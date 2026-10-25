/**
 * Markdown → 본문(ProseMirror JSON). 순수 함수라 화면 없이 시험할 수 있다.
 *
 * `markdown.ts`(본문 → Markdown)의 반대쪽이다. 이 앱이 내보낸 Markdown은 물론 Obsidian 같은 도구의 일반적인 Markdown을 읽는다.
 * 읽는 것: 제목·문단·굵게/기울임/취소선/인라인 코드/링크, 목록(할 일 포함)·인용·콜아웃(`> [!NOTE]`)·코드 블록·표·구분선,
 * `[[위키 링크]]`·`![[임베드]]`, 이미지(`![설명|너비](경로)` 포함), 수식(`$…$`·`$$…$$`), 각주(`[^1]`), HTML `<u>`·`<br>`·`<div align>`·`<details>`.
 * 읽지 못하는 것은 글자로 남기고 `notices`로 알린다(내용을 버리지 않는다).
 *
 * 구조: ① 글자 모양이 `marked`에 망가지는 것(수식의 `_`·`*`, 위키 링크, 각주)을 먼저 자리표시자로 바꿔 두고 ② `marked`로 토큰을 만든 뒤
 * ③ 토큰을 본문 노드로 바꾸면서 자리표시자를 되살린다. 페이지·이미지가 어디 있는지는 `ImportContext`가 안다(가져오기 계획이 만든다).
 */

import { Lexer, type Token, type Tokens } from "marked";

import { blockIdFromForeign, isBlockIdType } from "@gogum4/editor-schema/blockId";
import type { ReferenceTarget } from "@gogum4/editor-schema/reference";
import { calloutTypeFromName, normalizeCalloutTitle, normalizeCalloutType } from "@gogum4/editor-schema/callout";
import { detectEmbed, normalizeEmbedSize } from "@gogum4/editor-schema/embed";
import {
  CITATION_IN_TEXT_SOURCE,
  colorsFromStyle,
  type ExtraSyntax,
  isSkippedTag,
  normalizeAbbrTitle,
  normalizeCitationSource,
  normalizeCommentText,
  normalizeTag,
  replaceEmojiShortcodes,
  TAG_IN_TEXT_SOURCE,
  normalizeTaskStatus,
} from "@gogum4/editor-schema/extras";
import { indentFromLeadingSpaces } from "@gogum4/editor-schema/indent";
import { normalizeCodeMeta } from "@gogum4/editor-schema/codeMeta";
import { normalizeImageCaption, normalizeImageWidth } from "@gogum4/editor-schema/imageLayout";
import type { PmMark, PmNode } from "@gogum4/editor-schema/pmDoc";
import { isSafeToOpen } from "@gogum4/editor-schema/safeLink";
import { normalizeTextAlign } from "@gogum4/editor-schema/textAlign";

import { type DialectProfile, type MarkdownDialect, profileOf } from "./dialect.ts";
import { parseReferenceLine } from "./referenceDirective.ts";

// ───────────────────────── frontmatter ─────────────────────────

export type FrontmatterValue = string | string[];

export interface Frontmatter {
  /** 키(원래 대소문자 그대로) → 값. 목록은 문자열 배열, 나머지는 문자열. */
  data: Record<string, FrontmatterValue>;
  /** frontmatter를 뗀 본문. */
  body: string;
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {
      // JSON 이스케이프가 아니면 따옴표만 뗀다.
    }
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

/** `[a, "b, c", 'd']` 같은 한 줄 목록을 항목으로 나눈다(따옴표 안의 쉼표는 구분자가 아니다). */
function splitInlineList(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quote) {
      current += ch;
      if (ch === "\\" && quote === '"' && i + 1 < inner.length) current += inner[++i];
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      items.push(current);
      current = "";
    } else current += ch;
  }
  items.push(current);
  return items.map(unquote).filter((item) => item !== "");
}

/**
 * 글 맨 앞의 `---`로 둘러싼 YAML frontmatter를 읽는다. 이 앱이 쓰는 모양(문자열·한 줄 목록)과 Obsidian이 쓰는 모양(들여쓴 `- 항목` 목록,
 * 따옴표 없는 글)을 읽고, 중첩된 구조는 읽지 않는다. frontmatter가 없거나 닫히지 않으면 본문 전체를 돌려준다.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(normalized);
  if (!match) return { data: {}, body: normalized };
  const data: Record<string, FrontmatterValue> = {};
  const lines = (match[1] ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const keyed = /^([^\s#:][^:]*?):(?:\s+(.*))?$/.exec(lines[i]!.trimEnd());
    if (!keyed) continue;
    const key = unquote(keyed[1]!);
    const rest = (keyed[2] ?? "").trim();
    if (rest === "") {
      // 다음 줄들이 `- 항목`이면 목록이다.
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s+|^-\s+/.test(lines[i + 1]!)) {
        items.push(unquote(lines[++i]!.replace(/^\s*-\s+/, "")));
      }
      if (items.length > 0) data[key] = items.filter((item) => item !== "");
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) data[key] = splitInlineList(rest.slice(1, -1));
    else data[key] = unquote(rest);
  }
  return { data, body: normalized.slice(match[0].length) };
}

// ───────────────────────── 자리표시자 ─────────────────────────

const OPEN = "";
const CLOSE = "";
const PLACEHOLDER = new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g");

type Placeholder =
  | { kind: "wiki"; target: string; anchor: string | null; alias: string | null; embed: boolean; raw: string }
  | { kind: "math"; latex: string; raw: string }
  | { kind: "mathBlock"; latex: string; raw: string }
  | { kind: "footnote"; id: string; raw: string }
  /** 줄 끝의 `^블록id`(Obsidian). 글자에서는 빠지고 그 블록의 id가 된다. */
  | { kind: "blockId"; id: string; raw: string }
  /** 참조 노드로 읽은 한 줄(`ImportContext.references`). */
  | { kind: "reference"; target: ReferenceTarget; raw: string }
  /** 추가 문법(`ImportContext.extras`): 주석 `%%글%%`(여러 줄 가능), 태그, 인용, 인라인 각주 `^[글]`, 목차 `[toc]`, 정의 목록. */
  | { kind: "comment"; text: string; raw: string }
  | { kind: "tag"; name: string; raw: string }
  | { kind: "citation"; source: string; raw: string }
  | { kind: "inlineFootnote"; text: string; raw: string }
  | { kind: "toc"; raw: string }
  | { kind: "defList"; items: Array<{ term: string; details: string[] }>; raw: string };

interface Protected {
  text: string;
  store: Placeholder[];
  footnotes: Map<string, string>;
  /** 약어 정의(낱말 → 설명). */
  abbrs: Map<string, string>;
}

const DEFINITION_DETAIL = /^ {0,3}:[ \t]+\S/;

/** `kept[at]`이 정의 목록의 용어(들여쓰지 않은 일반 줄)이고 바로 다음 줄이 `: 설명`인가. */
function isDefinitionStart(lines: readonly string[], at: number): boolean {
  const line = lines[at];
  if (line === undefined || line.trim() === "" || /^[ \t>#|:-]/.test(line) || /^(\d+[.)]|[*+])\s/.test(line) || FENCE.test(line)) return false;
  return DEFINITION_DETAIL.test(lines[at + 1] ?? "");
}

/** 코드 울타리와 인라인 코드 밖의 `%%…%%`를 주석 자리표시자로 바꾼다. 닫히지 않은 `%%`는 글자로 둔다. 줄 전체가 주석이면 자기 문단이 된다. */
function protectComments(lines: readonly string[], put: (placeholder: Placeholder) => string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    if (fence !== null || !line.includes("%%")) {
      out.push(line);
      continue;
    }
    let rest = line;
    let result = "";
    for (;;) {
      const open = indexOutsideCode(rest, "%%");
      if (open < 0) {
        result += rest;
        break;
      }
      const afterOpen = rest.slice(open + 2);
      let body: string;
      let after = "";
      const close = afterOpen.indexOf("%%");
      if (close >= 0) {
        body = afterOpen.slice(0, close);
        after = afterOpen.slice(close + 2);
      } else {
        // 여러 줄 주석: 닫는 `%%`가 있는 줄까지(코드 울타리를 만나면 닫히지 않은 것이다).
        const parts = [afterOpen];
        let j = i + 1;
        let found = false;
        for (; j < lines.length; j++) {
          if (FENCE.test(lines[j]!)) break;
          const at = lines[j]!.indexOf("%%");
          if (at >= 0) {
            parts.push(lines[j]!.slice(0, at));
            after = lines[j]!.slice(at + 2);
            found = true;
            break;
          }
          parts.push(lines[j]!);
        }
        if (!found) {
          result += rest;
          break;
        }
        body = parts.join("\n");
        i = j;
      }
      const text = normalizeCommentText(body);
      const prefix = rest.slice(0, open);
      if (text === null) {
        result += `${prefix}%%${body}%%`;
      } else {
        result += prefix + put({ kind: "comment", text, raw: `%%${body}%%` });
      }
      rest = after;
    }
    // 줄 전체가 주석 하나뿐이면 자기 문단으로 둔다.
    if (new RegExp(`^\\s*${OPEN}\\d+${CLOSE}\\s*$`).test(result)) out.push("", result.trim(), "");
    else out.push(result);
  }
  return out;
}

/** 인라인 코드 조각 밖에서 `needle`이 처음 나오는 자리(없으면 -1). */
function indexOutsideCode(line: string, needle: string): number {
  let offset = 0;
  for (const part of splitCodeSpans(line)) {
    if (!part.code) {
      const at = part.text.indexOf(needle);
      if (at >= 0) return offset + at;
    }
    offset += part.text.length;
  }
  return -1;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** 인라인 코드 조각(`…`)과 그 밖의 조각으로 줄을 나눈다. 코드 조각 안은 건드리지 않는다. */
function splitCodeSpans(line: string): Array<{ code: boolean; text: string }> {
  const parts: Array<{ code: boolean; text: string }> = [];
  const re = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) parts.push({ code: false, text: line.slice(last, m.index) });
    parts.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ code: false, text: line.slice(last) });
  return parts;
}

/** 돈 액수처럼 보이는 `$…$`(예: `$5`와 `$6` 사이)는 수식이 아니다. */
function looksLikeMoney(latex: string): boolean {
  return /^\s*\d[\d.,]*\s*$/.test(latex);
}

/** HTML 태그(`<span style="…">` 등) 밖의 조각에만 `fn`을 적용한다. */
function outsideHtmlTags(text: string, fn: (piece: string) => string): string {
  if (!text.includes("<")) return fn(text);
  return text
    .split(/(<\/?[a-zA-Z][^<>]*>)/)
    // 태그 바로 뒤의 조각은 줄이나 공백 뒤가 아니므로, 맨 앞 표지를 달아 `#태그`의 "앞이 공백" 검사에 걸리지 않게 한다.
    .map((piece, index) => (index % 2 === 1 ? piece : index === 0 ? fn(piece) : fn(`\u0000${piece}`).slice(1)))
    .join("");
}

/** `==글==`·`++글++`·`^글^`를 HTML 마크 태그로 바꾼다(`marked`가 인라인 HTML로 통과시키고 읽을 때 마크가 된다). */
function marksToHtml(text: string): string {
  // 안쪽에는 `\=`처럼 이스케이프한 글자가 올 수 있다(내보내기가 글자 속의 `==`를 그렇게 막는다).
  return text
    .replace(/(?<![=\\])==(?![\s=])((?:\\.|[^=\n\\])+)(?<!\s)==(?!=)/g, "<mark>$1</mark>")
    .replace(/(?<![+\\])\+\+(?![\s+])((?:\\.|[^+\n\\])+)(?<!\s)\+\+(?!\+)/g, "<ins>$1</ins>")
    .replace(/(?<![\\^[])\^((?:\\.|[^\s^\n\\[\]])+)\^/g, "<sup>$1</sup>");
}

function protectInline(line: string, store: Placeholder[], footnotes: Map<string, string>, profile: DialectProfile, extras: ExtraSyntax = {}): string {
  const put = (placeholder: Placeholder) => `${OPEN}${store.push(placeholder) - 1}${CLOSE}`;
  const joined = splitCodeSpans(line)
    .map((part) => {
      if (part.code) return part.text;
      let text = part.text;
      // `markdown-it`처럼 물결표 하나를 취소선으로 읽지 않는 방언: 홀로 있는 `~`를 이스케이프해서 파서가 글자로 두게 한다.
      if (!profile.singleTildeStrike) text = text.replace(/(?<![\\~])~(?!~)/g, "\\~");
      // 인라인 각주 `^[글]`(`[^1]`과 다른 표기)는 각주 노드가 된다.
      if (profile.footnotes) text = text.replace(/\^\[([^\]\n]+)\]/g, (raw, body: string) => put({ kind: "inlineFootnote", text: body.trim(), raw }));
      const chained = text
        .replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (raw, bang: string, inner: string) => {
          // 위키 링크가 없는 방언(블로그)에서는 `[[글]]`이 그냥 글자다. `![[…]]` 임베드가 없는 방언에서 `!`는 글자다.
          if (!profile.wikiLinks || (bang === "!" && !profile.wikiExtras)) return raw;
          if (!profile.wikiExtras) {
            // 일반 GFM: `[[대상|표시]]`(표시 글자에 `|`가 있어도 첫 `|` 뒤 전부), 대상에 `#`이 있으면 이름의 일부다.
            const parts = (inner as string).split("|");
            const name = parts[0]!.trim();
            const alias = parts.slice(1).join("|").trim();
            return name === "" ? raw : put({ kind: "wiki", target: name, anchor: null, alias: parts.length > 1 && alias !== "" ? alias : null, embed: false, raw });
          }
          // `이름#위치|표시 글자` (위치는 `제목` 또는 `^블록`).
          const [target = "", alias] = (inner as string).split("|", 2) as [string, string | undefined];
          const hash = target.indexOf("#");
          const name = (hash < 0 ? target : target.slice(0, hash)).trim();
          const anchor = hash < 0 ? null : target.slice(hash + 1).trim();
          return put({ kind: "wiki", target: name, anchor: anchor === "" ? null : anchor, alias: alias?.trim() || null, embed: bang === "!", raw });
        })
        .replace(/(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<![\s\\])\$(?![\d$\w])/g, (raw, latex: string) =>
          !profile.math || looksLikeMoney(latex) ? raw : put({ kind: "math", latex, raw }),
        )
        .replace(/\[\^([^\]\s]+)\]/g, (raw, id: string) => (profile.footnotes && footnotes.has(id) ? put({ kind: "footnote", id, raw }) : raw));
      // HTML 태그 안(`<span style="color:#fff">`의 `#fff` 같은 것)은 태그·이모지·마크로 읽지 않는다.
      const extra = outsideHtmlTags(chained, (piece) => {
        let value = piece;
      if (extras.citations) {
        value = value.replace(new RegExp(CITATION_IN_TEXT_SOURCE, "g"), (raw, inner: string) => {
          const source = normalizeCitationSource(inner);
          return source === null ? raw : put({ kind: "citation", source, raw });
        });
      }
      if (extras.tags) {
        value = value.replace(new RegExp(TAG_IN_TEXT_SOURCE, "gu"), (raw, name: string) => {
          const tag = normalizeTag(name);
          return tag === null || isSkippedTag(tag, extras) ? raw : put({ kind: "tag", name: tag, raw });
        });
      }
      if (extras.emoji) value = replaceEmojiShortcodes(value);
      if (extras.marks) value = marksToHtml(value);
        return value;
      });
      return extra;
    })
    .join("");
  // 줄 끝의 `^블록id`. 글자가 있는 id만(`x ^2` 같은 지수 표기가 id로 읽히지 않게 3글자 이상, 글자 포함).
  if (!profile.blockIds) return joined; // `^id`가 없는 방언: 줄 끝의 `^abc`는 글자다.
  return joined.replace(BLOCK_ID_AT_END, (raw, _lead: string, id: string) => (/[A-Za-z]/.test(id) ? put({ kind: "blockId", id, raw }) : raw));
}

const BLOCK_ID_AT_END = /(^|[ \t])\^([A-Za-z0-9][A-Za-z0-9-]{2,})[ \t]*$/;

/**
 * `marked`가 망가뜨릴 것들을 자리표시자로 바꾼다: 위키 링크, 수식(`_`·`*`가 기울임으로 읽힌다), 각주 정의와 참조.
 * 코드 블록(``` 울타리)과 인라인 코드 안은 그대로 둔다. 블록 수식(`$$ … $$`)은 자기 문단이 되도록 앞뒤에 빈 줄을 둔다.
 */
function protect(source: string, profile: DialectProfile, references: ImportContext["references"] = false, extras: ExtraSyntax = {}): Protected {
  let lines = source.replace(/\r\n/g, "\n").split("\n");
  const store: Placeholder[] = [];
  const footnotes = new Map<string, string>();
  const abbrs = new Map<string, string>();
  const putRef = (placeholder: Placeholder) => `${OPEN}${store.push(placeholder) - 1}${CLOSE}`;

  // 참조 노드: 한 줄 전체가 참조 표기인 줄은 자기 문단이 되는 자리표시자로 바꾼다(코드 울타리 안은 건드리지 않는다). 디렉티브 처리보다 먼저다.
  if (references) {
    const parse = typeof references === "function" ? references : parseReferenceLine;
    const replaced: string[] = [];
    let inFence: string | null = null;
    for (const line of lines) {
      const fenceMatch = FENCE.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1]!;
        if (inFence === null) inFence = marker;
        else if (marker[0] === inFence[0] && marker.length >= inFence.length) inFence = null;
        replaced.push(line);
        continue;
      }
      const target = inFence === null ? parse(line) : null;
      if (target === null) replaced.push(line);
      else replaced.push("", `${store.push({ kind: "reference", target, raw: line }) - 1}`, "");
    }
    lines = replaced;
  }

  // 1) 각주 정의(`[^id]: 내용`, 이어지는 줄은 들여쓴다)를 떼어 낸다.
  const kept: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      kept.push(line);
      continue;
    }
    // 약어 정의 `*[HTML]: 설명`는 글에서 빠지고, 글 속 낱말에 약어 마크가 달린다.
    const abbr = fence === null && extras.abbr ? /^\*\[([^\]\n]+)\]:\s*(.+?)\s*$/.exec(line) : null;
    if (abbr) {
      const title = normalizeAbbrTitle(abbr[2]);
      if (title !== null) abbrs.set(abbr[1]!.trim(), title);
      continue;
    }
    const def = fence === null && profile.footnotes ? /^\[\^([^\]\s]+)\]:\s?(.*)$/.exec(line) : null;
    if (!def) {
      kept.push(line);
      continue;
    }
    const parts = [def[2]!];
    while (i + 1 < lines.length && /^( {4}|\t)/.test(lines[i + 1]!)) parts.push(lines[++i]!.replace(/^( {4}|\t)/, ""));
    footnotes.set(def[1]!, parts.join("\n").trim());
  }

  // 1.5) 주석 `%%…%%`(여러 줄도 된다)는 어느 서식보다 먼저 떼어 낸다.
  if (extras.comments) {
    const commented = protectComments(kept, putRef);
    kept.length = 0;
    kept.push(...commented);
  }

  // 2) 줄마다 자리표시자로 바꾼다.
  const out: string[] = [];
  fence = null;
  for (let i = 0; i < kept.length; i++) {
    const line = kept[i]!;
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    if (fence !== null) {
      out.push(line);
      continue;
    }
    // 목차 `[toc]`는 자기 문단이다.
    if (extras.toc && /^ {0,3}\[toc\]\s*$/i.test(line)) {
      out.push("", putRef({ kind: "toc", raw: line }), "");
      continue;
    }
    // 정의 목록: `용어` 다음 줄 `: 설명`(설명은 여러 개, 이어지는 줄은 들여쓴다), 묶음 사이의 빈 줄은 한 목록 안이다.
    if (extras.definitions && isDefinitionStart(kept, i)) {
      const items: Array<{ term: string; details: string[] }> = [];
      let j = i;
      while (j < kept.length && isDefinitionStart(kept, j)) {
        const details: string[] = [];
        let k = j + 1;
        while (k < kept.length && DEFINITION_DETAIL.test(kept[k]!)) {
          let detail = kept[k]!.replace(/^ {0,3}:[ \t]+/, "").trim();
          k++;
          while (k < kept.length && /^( {2,}|\t)\S/.test(kept[k]!)) detail += `\n${kept[k++]!.trim()}`;
          details.push(protectInline(detail, store, footnotes, profile, extras));
        }
        items.push({ term: protectInline(kept[j]!.trim(), store, footnotes, profile, extras), details });
        j = k;
        let m = j;
        while (m < kept.length && kept[m]!.trim() === "") m++;
        if (m > j && isDefinitionStart(kept, m)) j = m;
        else break;
      }
      out.push("", putRef({ kind: "defList", items, raw: kept.slice(i, j).join("\n") }), "");
      i = j - 1;
      continue;
    }
    const block = profile.math ? /^ {0,3}\$\$(.*)$/.exec(line) : null;
    if (block) {
      const first = block[1]!;
      const closedOnSameLine = /^(.*)\$\$\s*$/.exec(first);
      let latex: string;
      if (closedOnSameLine) {
        latex = closedOnSameLine[1]!.trim();
      } else {
        const body: string[] = first.trim() === "" ? [] : [first];
        let closed = false;
        let j = i + 1;
        for (; j < kept.length; j++) {
          const close = /^(.*?)\$\$\s*$/.exec(kept[j]!);
          if (close) {
            if (close[1]!.trim() !== "") body.push(close[1]!);
            closed = true;
            break;
          }
          body.push(kept[j]!);
        }
        if (!closed) {
          // 닫히지 않은 `$$`는 수식이 아니라 그냥 글자다.
          out.push(protectInline(line, store, footnotes, profile, extras));
          continue;
        }
        latex = body.join("\n").trim();
        i = j;
      }
      const ref = `${OPEN}${store.push({ kind: "mathBlock", latex, raw: `$$${latex}$$` }) - 1}${CLOSE}`;
      out.push("", ref, "");
      continue;
    }
    out.push(protectInline(line, store, footnotes, profile, extras));
  }
  return { text: out.join("\n"), store, footnotes, abbrs };
}

// ───────────────────────── 변환 ─────────────────────────

/** 페이지와 이미지가 어디 있는지 알려 주는 쪽(가져오기 계획). */
export interface ImportContext {
  /** 위키 링크의 이름이나 상대 경로(`.md` 없이)로 가져올 페이지의 id를 찾는다. 없으면 null. */
  resolvePage(target: string, fromDir: string): string | null;
  /** 이미지의 상대 경로(또는 파일 이름)를 가져올 폴더 안의 경로로 바꾼다. 폴더에 없으면 null. */
  resolveImage(path: string, fromDir: string): string | null;
  /**
   * 참이면 `http(s)://` 주소의 이미지를 링크가 아니라 이미지 노드(`importPath`가 그 주소, `remote: true`)로 가져온다.
   * 읽기 전용 렌더링(블로그)을 위한 옵션이다 — 노트 앱의 가져오기는 이미지를 저장소에 넣어야 해서 켜지 않는다.
   */
  remoteImages?: boolean;
  /**
   * Markdown 방언. 기본 `obsidian`. `gfm`은 일반 GFM 문서(위키 링크만 읽고 콜아웃·수식·각주·`^id`·HTML 변환은 없다 — `DialectProfile`).
   */
  dialect?: MarkdownDialect;
  /**
   * 방언의 항목을 하나씩 덮어쓴다. 방언 둘 사이의 조합이 필요한 소비자를 위한 것이다 — 예: `dialect: "obsidian"`(콜아웃·수식·각주)에
   * `{ rawEmbeds: true, keepAnyHref: true, mdLinksToPages: false }`를 얹으면 이미지·HTML·열 정렬 표를 원문으로 보존하면서(글 원본을 잃지 않는다) Obsidian 문법을 읽는다.
   */
  profile?: Partial<DialectProfile>;
  /**
   * 추가 문법: 켠 것만 읽는다(`createCoreExtensions({ extras })`와 짝). 하이라이트 `==글==`·위첨자 `^글^`·삽입 `++글++`와 `<sup>`·`<sub>`·`<ins>`·`<mark>`·`<span style>`(글자색·배경색),
   * 약어 `*[HTML]: 설명`·`<abbr>`, 주석 `%%글%%`, 태그 `#태그`, 인용 `[@키]`, 정의 목록, 목차 `[toc]`, 이모지 `:smile:`. docs/MARKDOWN-DIALECT.md "추가 문법".
   */
  extras?: ExtraSyntax;
  /**
   * 참이면 `[[페이지#제목]]`·`![[페이지#제목]]`의 제목 위치를 `heading` 속성으로 보존한다(페이지 링크·페이지 블록 노드가 그 속성을 가진 소비자). 끄면 위치를 버리고 안내한다.
   */
  anchors?: boolean;
  /**
   * 지금 읽는 글 자신의 페이지 id. 있으면 대상이 빈 `[[#제목]]`·`[[#^블록]]`(같은 글 안의 위치)을 이 페이지로 푼다. 없으면 풀지 못해 글자로 남긴다.
   */
  selfPage?: string | null;
  /**
   * 참조 노드(`reference`)로 읽을 줄. `true`면 기본 표기 `::ref{kind=… id=…}`, 함수면 소비자의 표기(한 줄을 받아 대상이거나 null).
   * 끄면(기본) 글자로 읽는다. `createCoreExtensions({ reference: true })`와 짝이다.
   */
  references?: boolean | ((line: string) => ReferenceTarget | null);
  /**
   * 지원하는 외부 임베드 주소(YouTube·X·Instagram·Pinterest·SoundCloud)의 이미지 문법 `![](주소)`·`![|500x300](주소)`를 `embed` 노드로 읽는다.
   * 끄면(기본) 일반 이미지로 본다. `createCoreExtensions({ embed: true })`와 짝이다.
   */
  embeds?: boolean;
  /**
   * 문단·제목 맨 앞의 `&emsp;`(두 개가 한 단계)를 들여쓰기(`indent` 속성)로 읽는다. 끄면(기본) 글자로 둔다.
   * `createCoreExtensions({ indent: true })`와 짝이다.
   */
  indent?: boolean;
}

export interface MarkdownImportResult {
  doc: PmNode;
  /** 본문이 쓰는 이미지의 폴더 안 경로(중복 없음). 이미지 노드는 `importPath`로 가리키고 `finalizeImages`가 채운다. */
  images: string[];
  /** 손실·대체 안내(문구 → 몇 번). */
  notices: Map<string, number>;
}

export const NOTICE = {
  unresolvedLink: "찾지 못한 [[링크]]는 글자로 두었어요.",
  anchorLink: "[[페이지#제목]]·[[페이지#^블록]]은 위치를 빼고 그 페이지로 가는 링크로 가져왔어요.",
  remoteImage: "인터넷 주소의 이미지는 가져오지 않고 링크로 두었어요.",
  missingImage: "폴더에서 찾지 못한 이미지는 글자로 두었어요.",
  unsupportedHtml: "지원하지 않는 HTML은 태그를 빼고 글자만 가져왔어요.",
  unresolvedEmbed: "찾지 못한 ![[임베드]]는 글자로 두었어요.",
  embedAnchor: "![[페이지#위치]] 임베드는 위치를 빼고 페이지 전체를 임베드로 가져왔어요.",
  unknownBlock: "알 수 없는 블록은 글자로 가져왔어요.",
  relativeLink: "찾지 못한 상대 경로 링크는 글자만 남겼어요.",
} as const;

interface State {
  ctx: ImportContext;
  profile: DialectProfile;
  fromDir: string;
  store: Placeholder[];
  footnotes: Map<string, string>;
  notices: Map<string, number>;
  images: Set<string>;
  /** 열려 있는 인라인 HTML 서식 태그(`<u>`·`<mark>`·`<span style>` …)와 그 태그가 거는 마크. 닫는 태그가 오면 가장 가까운 같은 태그가 빠진다. */
  htmlMarks: Array<{ tag: string; marks: PmMark[] }>;
  /** 약어 낱말 → 설명, 그리고 글 속에서 낱말을 찾는 패턴(약어가 없으면 null). */
  abbrs: ReadonlyMap<string, string>;
  abbrPattern: RegExp | null;
  /** 방금 읽은 글에서 찾은 줄 끝 `^id`(블록이 만들어지면 그 블록에 단다). */
  foundId: string | null;
  /** 자기 줄에 홀로 있던 `^id`(앞 블록의 id다). */
  orphanId: string | null;
}

/** 블록에 id를 단다. id가 없는 종류의 블록(목록 항목 등)이면 그대로 둔다. */
function withBlockId(node: PmNode, id: string): PmNode {
  return isBlockIdType(node.type) ? { ...node, attrs: { ...(node.attrs ?? {}), id: blockIdFromForeign(id) } } : node;
}

const note = (s: State, message: string) => s.notices.set(message, (s.notices.get(message) ?? 0) + 1);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'" })[name] ?? _);
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function textNode(text: string, marks: readonly PmMark[]): PmNode {
  return marks.length > 0 ? { type: "text", text, marks: [...marks] } : { type: "text", text };
}

/** 자리표시자를 원래 글자로 되돌린다(코드 안·HTML 같은 "글자 그대로" 자리). */
function restoreRaw(text: string, state: State): string {
  return text.replace(PLACEHOLDER, (_, index: string) => state.store[Number(index)]?.raw ?? "");
}

/** 위키 링크 하나를 노드로. 찾지 못하면 원래 글자로 둔다. */
function wikiNode(p: Extract<Placeholder, { kind: "wiki" }>, marks: readonly PmMark[], state: State): PmNode {
  const pageId = p.target === "" ? (state.ctx.selfPage ?? null) : state.ctx.resolvePage(p.target, state.fromDir);
  if (pageId === null) {
    note(state, p.embed ? NOTICE.unresolvedEmbed : NOTICE.unresolvedLink);
    return textNode(p.raw, marks);
  }
  // `[[페이지#^블록]]`은 블록 링크로 가져온다. `[[페이지#제목]]`(제목 위치)은 위치를 빼고 페이지 링크로 둔다.
  if (p.anchor !== null && p.anchor.startsWith("^") && p.anchor.length > 1) {
    return { type: "pageLink", attrs: { pageId, blockId: blockIdFromForeign(p.anchor.slice(1)), ...(p.alias !== null ? { label: p.alias } : {}) } };
  }
  const heading = state.ctx.anchors === true && p.anchor !== null ? p.anchor : null;
  if (p.anchor !== null && heading === null) note(state, NOTICE.anchorLink);
  // `[[대상|표시]]`의 표시 글자는 `label`로 남긴다(`label` 속성이 없는 스키마는 무시한다). 제목 위치는 `anchors`를 켠 소비자만 `heading`으로 받는다.
  return { type: "pageLink", attrs: { pageId, ...(heading !== null ? { heading } : {}), ...(p.alias !== null ? { label: p.alias } : {}) } };
}

/** 글자 하나를 자리표시자 기준으로 나누어 글자·링크·수식·각주 노드로 만든다. */
function restoreText(text: string, marks: readonly PmMark[], state: State): PmNode[] {
  const nodes: PmNode[] = [];
  const push = (value: string) => {
    if (value === "") return;
    // 줄바꿈은 눈에 보이는 줄바꿈으로 둔다(Obsidian의 기본 보기와 같다).
    value.split("\n").forEach((piece, index) => {
      if (index > 0) nodes.push({ type: "hardBreak" });
      if (piece !== "") nodes.push(...abbreviated(decodeEntities(piece), marks, state));
    });
  };
  let last = 0;
  for (let m = PLACEHOLDER.exec(text); m; m = PLACEHOLDER.exec(text)) {
    push(text.slice(last, m.index));
    last = m.index + m[0].length;
    const p = state.store[Number(m[1])];
    if (!p) continue;
    if (p.kind === "wiki") nodes.push(wikiNode(p, marks, state));
    else if (p.kind === "blockId") state.foundId = p.id;
    else if (p.kind === "reference") nodes.push(textNode(p.raw, marks));
    else if (p.kind === "comment") nodes.push({ type: "comment", attrs: { text: p.text } });
    else if (p.kind === "tag") nodes.push({ type: "tag", attrs: { name: p.name } });
    else if (p.kind === "citation") nodes.push({ type: "citation", attrs: { source: p.source } });
    else if (p.kind === "inlineFootnote") nodes.push({ type: "footnote", attrs: { text: p.text } });
    else if (p.kind === "toc" || p.kind === "defList") nodes.push(textNode(p.raw, marks));
    else if (p.kind === "footnote") nodes.push({ type: "footnote", attrs: { text: state.footnotes.get(p.id) ?? "" } });
    else nodes.push({ type: "mathInline", attrs: { latex: p.latex } });
  }
  PLACEHOLDER.lastIndex = 0;
  push(text.slice(last));
  return nodes;
}

/** 약어 낱말을 찾는 패턴(길이가 긴 낱말이 먼저, 앞뒤가 글자·숫자가 아닐 때만). */
function abbrPatternOf(abbrs: ReadonlyMap<string, string>): RegExp | null {
  if (abbrs.size === 0) return null;
  const terms = [...abbrs.keys()].sort((a, b) => b.length - a.length).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(${terms.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
}

/** 글자를 약어 낱말 기준으로 나눠 약어 마크를 단 글자 노드들로(약어가 없으면 글자 하나). */
function abbreviated(text: string, marks: readonly PmMark[], state: State): PmNode[] {
  const pattern = state.abbrPattern;
  if (pattern === null) return [textNode(text, marks)];
  const nodes: PmNode[] = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > last) nodes.push(textNode(text.slice(last, m.index), marks));
    nodes.push(textNode(m[0], toggleMark(marks, "abbr", { title: state.abbrs.get(m[0]) ?? "" })));
    last = m.index + m[0].length;
  }
  if (last === 0) return [textNode(text, marks)];
  if (last < text.length) nodes.push(textNode(text.slice(last), marks));
  return nodes;
}

/** 같은 서식의 이웃한 글자 노드를 하나로 합친다. */
function mergeText(nodes: PmNode[]): PmNode[] {
  const out: PmNode[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "text" && node.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(node.marks ?? [])) {
      out[out.length - 1] = { ...prev, text: (prev.text ?? "") + (node.text ?? "") };
    } else out.push(node);
  }
  return out;
}

/** `![](주소)`의 주소가 지원하는 임베드 주소면 임베드 노드로(크기 `|500`·`|500x300`은 방언이 허용할 때만). 아니면 null. */
function embedNode(href: string, rawAlt: string, state: State): PmNode | null {
  if (state.ctx.embeds !== true) return null;
  const target = detectEmbed(href);
  if (target === null) return null;
  const sized = state.profile.imageWidth ? /\|\s*(\d+)(?:x(\d+))?\s*$/.exec(rawAlt) : null;
  const width = sized ? normalizeEmbedSize(sized[1]) : null;
  const height = sized?.[2] !== undefined ? normalizeEmbedSize(sized[2]) : null;
  return { type: "embed", attrs: { provider: target.provider, url: target.url, ...(width !== null ? { width } : {}), ...(height !== null ? { height } : {}) } };
}

/** 이미지 하나(`![설명|너비](경로)`)를 이미지 노드로. 인터넷 주소·폴더에 없는 파일은 글자·링크로 둔다. */
function imageNode(href: string, rawAlt: string, state: State, title: string | null = null): PmNode {
  const node = imageNodeBase(href, rawAlt, state);
  // `![alt](src "캡션")`의 title을 캡션으로 보존한다(이미지 노드로 읽힌 경우만).
  const caption = normalizeImageCaption(title === null ? null : decodeEntities(restoreRaw(title, state)));
  return node.type === "image" && caption !== null ? { ...node, attrs: { ...node.attrs, caption } } : node;
}

function imageNodeBase(href: string, rawAlt: string, state: State): PmNode {
  // `설명|300`·`설명|300x200`·`300`(Obsidian): 너비만 쓴다.
  let alt = rawAlt;
  let width: number | null = null;
  const sized = !state.profile.imageWidth ? null : /^(.*?)\|\s*(\d+)(?:x\d+)?\s*$/.exec(rawAlt);
  if (sized) {
    alt = sized[1]!.trim();
    width = normalizeImageWidth(Number(sized[2]));
  }
  if (state.ctx.remoteImages === true && /^https?:\/\//i.test(href)) {
    return { type: "image", attrs: { importPath: href, alt, remote: true, ...(width !== null ? { width } : {}) } };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    note(state, NOTICE.remoteImage);
    return { type: "paragraph", content: [{ type: "text", text: alt === "" ? href : alt, marks: [{ type: "link", attrs: { href } }] }] };
  }
  const path = state.ctx.resolveImage(safeDecode(href), state.fromDir);
  if (path === null) {
    note(state, NOTICE.missingImage);
    return { type: "paragraph", content: [{ type: "text", text: `![${alt}](${href})` }] };
  }
  state.images.add(path);
  return { type: "image", attrs: { importPath: path, alt, ...(width !== null ? { width } : {}) } };
}

/** `[[이미지.png|300]]`·`![[이미지.png|300]]`의 이미지 노드(폴더에 있을 때만). */
function embeddedImage(p: Extract<Placeholder, { kind: "wiki" }>, state: State): PmNode | null {
  if (!IMAGE_EXT.test(p.target)) return null;
  const path = state.ctx.resolveImage(p.target, state.fromDir);
  if (path === null) return null;
  state.images.add(path);
  const width = p.alias && /^\d+(?:x\d+)?$/.test(p.alias) ? normalizeImageWidth(Number(p.alias.split("x")[0])) : null;
  return { type: "image", attrs: { importPath: path, alt: "", ...(width !== null ? { width } : {}) } };
}

function toggleMark(marks: readonly PmMark[], type: string, attrs?: Record<string, unknown>): PmMark[] {
  return [...marks.filter((m) => m.type !== type), attrs ? { type, attrs } : { type }];
}

const HTML_MARK_TAGS: Readonly<Record<string, string>> = { mark: "highlight", sup: "superscript", sub: "subscript", ins: "insert" };

/**
 * 인라인 HTML 서식 태그(`<u>`, 추가 문법을 켰으면 `<mark>`·`<sup>`·`<sub>`·`<ins>`·`<span style>`·`<abbr title>`)를 읽어 열려 있는 서식에 반영한다. 다룬 태그면 true.
 * `rawEmbeds` 방언(블로그)에서 `<u>`는 기존대로 원문이다.
 */
function htmlMarkTag(raw: string, state: State): boolean {
  const match = /^<(\/)?([a-z][a-z0-9]*)((?:\s[^>]*)?)\/?>$/i.exec(raw.trim());
  if (!match) return false;
  const closing = match[1] !== undefined;
  const name = match[2]!.toLowerCase();
  const attrs = match[3] ?? "";
  const extras = state.ctx.extras;
  let marks: PmMark[] | null = null;
  if (name === "u" && !state.profile.rawEmbeds) marks = [{ type: "underline" }];
  else if (extras?.kbd && name === "kbd") marks = [{ type: "kbd" }];
  else if (extras?.marks && HTML_MARK_TAGS[name] !== undefined) marks = [{ type: HTML_MARK_TAGS[name]! }];
  else if (extras?.marks && name === "span") {
    const { color, background } = colorsFromStyle(/style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "");
    marks = [...(color !== null ? [{ type: "textColor", attrs: { color } }] : []), ...(background !== null ? [{ type: "backgroundColor", attrs: { color: background } }] : [])];
  } else if (extras?.abbr && name === "abbr") {
    const title = normalizeAbbrTitle(decodeEntities(/title\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? ""));
    marks = title === null ? [] : [{ type: "abbr", attrs: { title } }];
  }
  if (marks === null) return false;
  if (closing) {
    for (let i = state.htmlMarks.length - 1; i >= 0; i--) {
      if (state.htmlMarks[i]!.tag === name) {
        state.htmlMarks.splice(i, 1);
        break;
      }
    }
  } else state.htmlMarks.push({ tag: name, marks });
  return true;
}

/** 인라인 토큰들을 노드로. 이미지는 블록이라 이미지 노드가 섞여 나오고, 부르는 쪽이 문단에서 떼어 낸다. */
function inlineNodes(tokens: readonly Token[], marks: readonly PmMark[], state: State): PmNode[] {
  const nodes: PmNode[] = [];
  const active = () => state.htmlMarks.reduce<PmMark[]>((current, entry) => entry.marks.reduce((acc, mark) => toggleMark(acc, mark.type, mark.attrs), current), [...marks]);
  for (const token of tokens) {
    switch (token.type) {
      case "text": {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) nodes.push(...inlineNodes(t.tokens, marks, state));
        else nodes.push(...restoreText(t.text, active(), state));
        break;
      }
      case "escape":
        nodes.push(textNode((token as Tokens.Escape).text, active()));
        break;
      case "strong":
        nodes.push(...inlineNodes((token as Tokens.Strong).tokens, toggleMark(marks, "bold"), state));
        break;
      case "em":
        nodes.push(...inlineNodes((token as Tokens.Em).tokens, toggleMark(marks, "italic"), state));
        break;
      case "del":
        nodes.push(...inlineNodes((token as Tokens.Del).tokens, toggleMark(marks, "strike"), state));
        break;
      case "codespan": {
        const text = restoreRaw((token as Tokens.Codespan).text, state);
        if (text !== "") nodes.push(textNode(decodeEntities(text), toggleMark(marks, "code")));
        break;
      }
      case "br":
        nodes.push({ type: "hardBreak" });
        break;
      case "image": {
        const t = token as Tokens.Image;
        const embed = embedNode(t.href, restoreRaw(t.text, state), state);
        if (embed !== null) {
          nodes.push(embed);
          break;
        }
        // 블로그의 이미지는 `/img/3?w=300`처럼 주소에 크기가 실리고 에디터의 이미지 노드(저장소 해시)와 모양이 다르다 → 원문 그대로 둔다(화면은 그림으로 보인다).
        if (state.profile.rawEmbeds) {
          nodes.push({ type: "rawInline", attrs: { text: restoreRaw(t.raw, state) } });
          break;
        }
        nodes.push(imageNode(t.href, restoreRaw(t.text, state), state, t.title ?? null));
        break;
      }
      case "link": {
        const t = token as Tokens.Link;
        if (state.profile.rawEmbeds && t.tokens.some((inner) => inner.type === "image")) {
          nodes.push({ type: "rawInline", attrs: { text: restoreRaw(t.raw, state) } });
          break;
        }
        const href = restoreRaw(t.href, state);
        nodes.push(...linkNodes(t, href, marks, state));
        break;
      }
      case "html": {
        const tag = (token as Tokens.HTML).raw.trim().toLowerCase();
        if (htmlMarkTag((token as Tokens.HTML).raw, state)) break;
        if (state.profile.rawEmbeds) {
          // 블로그는 HTML을 그리지 않는다 → 태그 글자를 잃지 않게 원문 그대로 둔다.
          nodes.push({ type: "rawInline", attrs: { text: (token as Tokens.HTML).raw } });
        } else if (/^<br\s*\/?>$/.test(tag)) nodes.push({ type: "hardBreak" });
        else if (!/^<!--/.test(tag)) note(state, NOTICE.unsupportedHtml);
        break;
      }
      default: {
        const raw = (token as { raw?: string }).raw ?? "";
        nodes.push(...restoreText(raw, active(), state));
      }
    }
  }
  return nodes;
}

function linkNodes(token: Tokens.Link, href: string, marks: readonly PmMark[], state: State): PmNode[] {
  const target = safeDecode(href.split("#")[0]!.split("?")[0]!);
  // 가져올 폴더 안의 다른 글을 가리키는 상대 링크(`[글](다른글.md)`)는 페이지 링크로 바꾼다.
  if (state.profile.mdLinksToPages && /\.(md|markdown)$/i.test(target) && !/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    const pageId = state.ctx.resolvePage(target.replace(/\.(md|markdown)$/i, ""), state.fromDir);
    if (pageId !== null) return [{ type: "pageLink", attrs: { pageId } }];
    note(state, NOTICE.relativeLink);
    return inlineNodes(token.tokens, marks, state);
  }
  const children = inlineNodes(token.tokens, marks, state);
  // 글 원본을 잃지 않는 방언(블로그·일반 GFM)은 상대 경로 같은 주소도 링크로 남긴다. 열기는 에디터가 안전한 주소만 연다.
  if (isSafeToOpen(href) || (state.profile.keepAnyHref && href.trim() !== "" && !/^\s*(javascript|vbscript|file|data):/i.test(href))) {
    return children.map((child) => (child.type === "text" ? { ...child, marks: toggleMark(child.marks ?? [], "link", { href }) } : child));
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#")) note(state, NOTICE.relativeLink);
  return children;
}

/** 문단 안의 인라인 노드들을 이미지 노드 기준으로 갈라 문단·이미지 블록의 목록으로 만든다. */
function paragraphsAround(inline: PmNode[]): PmNode[] {
  const blocks: PmNode[] = [];
  let run: PmNode[] = [];
  const flush = () => {
    const content = trimBreaks(mergeText(run));
    if (content.length > 0) blocks.push({ type: "paragraph", content });
    run = [];
  };
  for (const node of inline) {
    if (node.type === "image" || node.type === "embed") {
      flush();
      blocks.push(node);
    } else if (node.type === "paragraph") {
      // 인터넷 이미지·없는 이미지의 대체 문단은 안의 글자를 이어 붙인다.
      run.push(...(node.content ?? []));
    } else run.push(node);
  }
  flush();
  return blocks;
}

function trimBreaks(nodes: PmNode[]): PmNode[] {
  let start = 0;
  let end = nodes.length;
  while (start < end && nodes[start]!.type === "hardBreak") start++;
  while (end > start && nodes[end - 1]!.type === "hardBreak") end--;
  return nodes.slice(start, end);
}

/** 맨 앞의 들여쓰기 문자: `&emsp;` 글자나 EM SPACE(U+2003). */
const LEADING_INDENT = new RegExp(`^(?:&emsp;|${String.fromCharCode(0x2003)})+`);

/** 문단·제목의 첫 글자 토큰에서 앞의 들여쓰기 문자를 떼고 단계를 돌려준다(없거나 꺼져 있으면 null, 토큰은 그대로). */
function takeIndent(tokens: Token[], state: State): number | null {
  if (state.ctx.indent !== true) return null;
  const first = tokens[0];
  if (!first || first.type !== "text") return null;
  const lead = LEADING_INDENT.exec((first as Tokens.Text).text);
  if (!lead) return null;
  const count = lead[0].split("&emsp;").length - 1 + [...lead[0].replace(/&emsp;/g, "")].length;
  const rest = (first as Tokens.Text).text.slice(lead[0].length);
  tokens[0] = { ...first, text: rest, raw: rest } as Token;
  return indentFromLeadingSpaces(count);
}

/** 첫 문단 블록에 들여쓰기 단계를 붙인다. */
function withIndent(blocks: PmNode[], indent: number | null): PmNode[] {
  if (indent === null) return blocks;
  const index = blocks.findIndex((block) => block.type === "paragraph");
  if (index < 0) return blocks;
  const target = blocks[index]!;
  return blocks.map((block, at) => (at === index ? { ...target, attrs: { ...target.attrs, indent } } : block));
}

const INLINE_TYPES = new Set(["text", "hardBreak", "pageLink", "mathInline", "footnote", "rawInline", "comment", "tag", "citation"]);

/** 정의 목록 노드: 용어와 설명은 한 줄 인라인이다. */
function definitionListNode(items: ReadonlyArray<{ term: string; details: readonly string[] }>, state: State): PmNode {
  const inline = (text: string): PmNode[] => {
    state.htmlMarks = [];
    return mergeText(inlineNodes(Lexer.lexInline(text), [], state)).filter((node) => INLINE_TYPES.has(node.type));
  };
  const withContent = (type: string, text: string): PmNode => {
    const content = inline(text);
    return content.length > 0 ? { type, content } : { type };
  };
  return {
    type: "definitionList",
    content: items.flatMap((item) => [withContent("definitionTerm", item.term), ...item.details.map((detail) => withContent("definitionDetail", detail))]),
  };
}

/** 문단 토큰 하나를 블록들로. 수식 블록·페이지 임베드·이미지 임베드만 든 문단은 그 블록이 된다. */
function paragraphBlocks(token: Tokens.Paragraph | Tokens.Text, state: State): PmNode[] {
  const only = /^(\d+)$/.exec(token.text.trim());
  const placeholder = only ? state.store[Number(only[1])] : undefined;
  if (placeholder?.kind === "mathBlock") return [{ type: "mathBlock", attrs: { latex: placeholder.latex } }];
  if (placeholder?.kind === "reference") return [{ type: "reference", attrs: { ...placeholder.target } }]; // props는 있을 때만 붙는다
  if (placeholder?.kind === "toc") return [{ type: "toc" }];
  if (placeholder?.kind === "defList") return [definitionListNode(placeholder.items, state)];
  if (placeholder?.kind === "blockId") {
    // 자기 줄에 홀로 있는 `^id`는 바로 앞 블록의 id다(코드·표·수식 같은 줄 끝에 못 붙이는 블록).
    state.orphanId = placeholder.id;
    return [];
  }
  if (placeholder?.kind === "wiki" && placeholder.embed) {
    const image = embeddedImage(placeholder, state);
    if (image) return [image];
    const pageId = placeholder.target === "" ? (state.ctx.selfPage ?? null) : state.ctx.resolvePage(placeholder.target, state.fromDir);
    if (pageId !== null) {
      // `![[페이지#^블록]]`은 블록 하나만 끼우는 임베드다(`blockId`). 블록 id를 받지 않는 소비자의 스키마는 무시한다.
      if (placeholder.anchor !== null && placeholder.anchor.startsWith("^") && placeholder.anchor.length > 1) {
        return [{ type: "pageBlock", attrs: { pageId, mode: "embed", blockId: blockIdFromForeign(placeholder.anchor.slice(1)) } }];
      }
      const heading = state.ctx.anchors === true && placeholder.anchor !== null && !placeholder.anchor.startsWith("^") ? placeholder.anchor : null;
      if (placeholder.anchor !== null && heading === null) note(state, NOTICE.embedAnchor);
      return [{ type: "pageBlock", attrs: { pageId, mode: "embed", ...(heading !== null ? { heading } : {}) } }];
    }
  }
  state.htmlMarks = [];
  const tokens = [...(token.tokens ?? [])];
  const indent = takeIndent(tokens, state);
  return withIndent(paragraphsAround(inlineNodes(tokens, [], state)), indent);
}

/** 콜아웃 이름(`NOTE`, `info`, `Warning`, `rocket` …)을 종류로(대소문자는 무시, 별칭으로 합치지 않는다). */
function calloutType(name: string): string {
  return calloutTypeFromName(name) ?? normalizeCalloutType(name);
}

function blockquoteBlocks(token: Tokens.Blockquote, state: State): PmNode[] {
  const first = token.tokens[0];
  const header = first && first.type === "paragraph" && state.profile.callouts ? /^\[!([A-Za-z][\w-]*)\]([+-])?[ \t]*([^\n]*)(?:\n([\s\S]*))?$/.exec((first as Tokens.Paragraph).text) : null;
  if (!header) {
    const content = convertBlocks(token.tokens, state);
    return [{ type: "blockquote", content: content.length > 0 ? content : [{ type: "paragraph" }] }];
  }
  const content: PmNode[] = [];
  // 표식 줄의 나머지는 제목이다(종류 이름과 같은 글자면 기본 제목이라 생략). 제목은 서식 없는 한 줄 글로 둔다.
  const title = normalizeCalloutTitle(header[3] ?? "");
  const customTitle = title !== null && title.toLowerCase() !== header[1]!.toLowerCase() ? title : null;
  const bodyText = header[4] ?? "";
  if (bodyText.trim() !== "") {
    state.foundId = null;
    const bodyBlocks = paragraphsAround(inlineNodes(Lexer.lexInline(bodyText), [], state));
    if (state.foundId !== null && bodyBlocks.length > 0) bodyBlocks[bodyBlocks.length - 1] = withBlockId(bodyBlocks[bodyBlocks.length - 1]!, state.foundId);
    state.foundId = null;
    content.push(...bodyBlocks);
  }
  content.push(...convertBlocks(token.tokens.slice(1), state));
  return [{ type: "callout", attrs: { type: calloutType(header[1]!), ...(customTitle !== null ? { title: customTitle } : {}), ...(header[2] ? { fold: header[2] } : {}) }, content: content.length > 0 ? content : [{ type: "paragraph" }] }];
}

/** 목록 항목 하나의 안쪽(`paragraph block*`)을 만든다. 글로 시작하지 않으면 빈 문단을 앞에 둔다. */
function itemContent(tokens: Token[], state: State): PmNode[] {
  const blocks = convertBlocks(tokens, state);
  const nodes = blocks.length > 0 ? blocks : [{ type: "paragraph" }];
  return nodes[0]!.type === "paragraph" ? nodes : [{ type: "paragraph" }, ...nodes];
}

/**
 * 목록 하나를 블록들로. 일반 항목과 할 일 항목은 한 목록이 될 수 없어서(`bulletList`와 `taskList`) **연속한 같은 종류 구간마다** 목록을 따로 만든다.
 * (내보낸 Markdown에서 불릿 목록 바로 뒤의 할 일 목록은 CommonMark 규칙상 하나의 목록으로 읽히므로 이렇게 되돌린다.)
 */
/** 할 일 상태 `[/] 글`: 항목 첫 글자에 상태 표시가 있으면 표시를 떼고 상태와 함께 돌려준다(상태 문법을 켠 때만). */
function withTaskStatus(item: Tokens.ListItem, state: State): { item: Tokens.ListItem; status: string | null } {
  if (state.ctx.extras?.taskStatus !== true || item.task) return { item, status: null };
  const first = item.tokens[0];
  const match = first && first.type === "text" ? /^\[(.)\] /.exec((first as Tokens.Text).text) : null;
  const status = match ? normalizeTaskStatus(match[1]) : null;
  if (!match || status === null) return { item, status: null };
  const cut = (t: Token): Token => ("text" in t && typeof t.text === "string" ? { ...t, text: t.text.slice(match[0].length), raw: t.raw.slice(match[0].length) } : t);
  const text = first as Tokens.Text;
  const inner = text.tokens && text.tokens.length > 0 ? [cut(text.tokens[0]!), ...text.tokens.slice(1)] : text.tokens;
  const stripped = { ...cut(text), ...(inner ? { tokens: inner } : {}) } as Tokens.Text;
  return { item: { ...item, task: true, checked: false, tokens: [stripped, ...item.tokens.slice(1)] }, status };
}

function listBlocks(token: Tokens.List, state: State): PmNode[] {
  const statuses = new Map<Tokens.ListItem, string>();
  const items = token.items.map((original) => {
    const { item, status } = withTaskStatus(original, state);
    if (status !== null) statuses.set(item, status);
    return item;
  });
  const runs: Tokens.ListItem[][] = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && Boolean(last[0]!.task) === Boolean(item.task)) last.push(item);
    else runs.push([item]);
  }
  return runs.map((run, index) => {
    if (run[0]!.task) {
      return {
        type: "taskList",
        content: run.map((item) => ({ type: "taskItem", attrs: { checked: item.checked === true, ...(statuses.has(item) ? { status: statuses.get(item) } : {}) }, content: itemContent(item.tokens, state) })),
      };
    }
    const items = run.map((item) => ({ type: "listItem", content: itemContent(item.tokens, state) }));
    if (token.ordered) {
      const start = typeof token.start === "number" ? token.start : 1;
      // 둘째 구간부터는 앞 구간의 이어지는 번호로 시작한다.
      const offset = runs.slice(0, index).reduce((sum, r) => sum + r.length, 0);
      return { type: "orderedList", ...(start + offset !== 1 ? { attrs: { start: start + offset } } : {}), content: items };
    }
    return { type: "bulletList", content: items };
  });
}

function tableBlock(token: Tokens.Table, state: State): PmNode {
  const cell = (type: "tableHeader" | "tableCell", c: Tokens.TableCell): PmNode => {
    const inline = mergeText(inlineNodes(c.tokens, [], state).filter((n) => n.type !== "image" && n.type !== "embed"));
    return { type, content: [{ type: "paragraph", ...(inline.length > 0 ? { content: inline } : {}) }] };
  };
  const header: PmNode = { type: "tableRow", content: token.header.map((c) => cell("tableHeader", c)) };
  const rows = token.rows.map((row): PmNode => ({ type: "tableRow", content: row.map((c) => cell("tableCell", c)) }));
  return { type: "table", content: [header, ...rows] };
}

function plainParagraph(text: string): PmNode {
  const lines = text.split("\n");
  const content: PmNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    if (line !== "") content.push({ type: "text", text: line });
  });
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

/** 토큰 하나를 블록들로. 글에서 찾은 줄 끝 `^id`는 만들어진 마지막 블록에 단다. */
function tokenBlocks(token: Token, state: State): PmNode[] {
  state.foundId = null;
  const blocks = tokenBlocksWithoutId(token, state);
  const id = state.foundId;
  state.foundId = null;
  if (id !== null && blocks.length > 0) blocks[blocks.length - 1] = withBlockId(blocks[blocks.length - 1]!, id);
  return blocks;
}

function tokenBlocksWithoutId(token: Token, state: State): PmNode[] {
  switch (token.type) {
    case "paragraph":
    case "text":
      return paragraphBlocks(token as Tokens.Paragraph, state);
    case "heading": {
      const t = token as Tokens.Heading;
      const headingTokens = [...t.tokens];
      const headingIndent = takeIndent(headingTokens, state);
      const content = trimBreaks(mergeText(inlineNodes(headingTokens, [], state).filter((n) => n.type !== "image" && n.type !== "embed")));
      return [{ type: "heading", attrs: { level: Math.min(Math.max(t.depth, 1), 6), ...(headingIndent !== null ? { indent: headingIndent } : {}) }, ...(content.length > 0 ? { content } : {}) }];
    }
    case "code": {
      const t = token as Tokens.Code;
      const info = (t.lang ?? "").trim();
      const language = info.split(/\s+/)[0] ?? "";
      // 언어 뒤 글(`title="a.ts" {2,4}`)은 메타로 보존한다. 언어 자리가 `{2}`·`title=…`처럼 메타로 시작하면 언어 없는 메타다.
      const metaStart = /^(\{|title=|showLineNumbers|ln(?:\s|$))/.test(info);
      const meta = normalizeCodeMeta(metaStart ? info : info.slice(language.length));
      const lang = metaStart ? "" : language;
      const text = restoreRaw(t.text, state);
      return [{ type: "codeBlock", ...(lang !== "" || meta !== null ? { attrs: { ...(lang !== "" ? { language: lang } : {}), ...(meta !== null ? { meta } : {}) } } : {}), ...(text !== "" ? { content: [{ type: "text", text }] } : {}) }];
    }
    case "blockquote":
      return blockquoteBlocks(token as Tokens.Blockquote, state);
    case "list":
      return listBlocks(token as Tokens.List, state);
    case "table": {
      const table = token as Tokens.Table;
      // 블로그는 표 열 정렬(`:---`·`---:`)을 그린다. 에디터의 표에는 열 정렬이 없어서 원문 그대로 둔다.
      if (state.profile.rawEmbeds && table.align.some((a) => a !== null)) return [{ type: "raw", attrs: { text: restoreRaw(table.raw, state).replace(/\n+$/, "") } }];
      return [tableBlock(table, state)];
    }
    case "hr":
      return [{ type: "horizontalRule" }];
    case "space":
    case "def":
      return [];
    default: {
      const raw = restoreRaw((token as { raw?: string }).raw ?? "", state).trim();
      if (raw === "") return [];
      note(state, NOTICE.unknownBlock);
      return [plainParagraph(raw)];
    }
  }
}

type Frame =
  | { kind: "root"; nodes: PmNode[] }
  | { kind: "div"; nodes: PmNode[]; align: string | null }
  | { kind: "details"; nodes: PmNode[]; title: PmNode[] | null };

/** 정렬이 필요한 문단·제목·이미지에 `textAlign`을 단다(이미지는 양쪽 맞춤이 없다). */
function alignNodes(nodes: PmNode[], align: string): PmNode[] {
  const stored = normalizeTextAlign(align);
  if (stored === null) return nodes;
  return nodes.map((node) => {
    if (node.type !== "paragraph" && node.type !== "heading" && node.type !== "image") return node;
    if (node.type === "image" && stored === "justify") return node;
    return { ...node, attrs: { ...(node.attrs ?? {}), textAlign: stored } };
  });
}

/** HTML 블록 토큰 하나를 읽어 `<div align>`·`<details>`·`<summary>`를 처리한다. 모르는 태그는 버리고 안내한다. */
function handleHtml(raw: string, stack: Frame[], state: State): void {
  const top = () => stack[stack.length - 1]!;
  const tag = /<(\/?)(div|details|summary)\b([^>]*)>|<!--[\s\S]*?-->|<[^>]+>/gi;
  let last = 0;
  let unknown = false;
  const loose = (text: string) => {
    if (text.trim() !== "") unknown = true;
  };
  for (let m = tag.exec(raw); m; m = tag.exec(raw)) {
    loose(raw.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2]?.toLowerCase();
    if (name === "div") {
      if (!closing) {
        const align = /align\s*=\s*["']?(\w+)/i.exec(m[3] ?? "")?.[1]?.toLowerCase() ?? null;
        stack.push({ kind: "div", nodes: [], align });
      } else if (top().kind === "div") popDiv(stack);
    } else if (name === "details") {
      if (!closing) stack.push({ kind: "details", nodes: [], title: null });
      else closeDetails(stack);
    } else if (name === "summary") {
      if (!closing) {
        // `<summary>…</summary>` 안의 글(Markdown)을 제목으로 읽는다.
        const end = /<\/summary>/i.exec(raw.slice(last));
        const inner = end ? raw.slice(last, last + end.index) : raw.slice(last);
        const frame = top();
        if (frame.kind === "details") frame.title = mergeText(inlineNodes(Lexer.lexInline(inner.trim()), [], state).filter((n) => n.type !== "image" && n.type !== "embed"));
        last += end ? end.index + end[0].length : inner.length;
        tag.lastIndex = last;
      }
    } else if (!m[0].startsWith("<!--")) unknown = true;
  }
  loose(raw.slice(last));
  if (unknown) {
    note(state, NOTICE.unsupportedHtml);
    const text = decodeEntities(raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).trim();
    if (text !== "") top().nodes.push(plainParagraph(text));
  }
}

function popDiv(stack: Frame[]): void {
  const frame = stack.pop();
  if (!frame || frame.kind !== "div") return;
  const parent = stack[stack.length - 1]!;
  parent.nodes.push(...(frame.align ? alignNodes(frame.nodes, frame.align) : frame.nodes));
}

function closeDetails(stack: Frame[]): void {
  // 안쪽에 닫지 않은 `<div>`가 있으면 먼저 닫는다.
  while (stack.length > 1 && stack[stack.length - 1]!.kind === "div") popDiv(stack);
  const frame = stack[stack.length - 1];
  if (!frame || frame.kind !== "details") return;
  stack.pop();
  const title: PmNode = { type: "paragraph", ...(frame.title && frame.title.length > 0 ? { content: frame.title } : {}) };
  stack[stack.length - 1]!.nodes.push({ type: "toggle", content: [title, ...frame.nodes] });
}

/** 블록 토큰들을 본문 블록들로. `<div align>`과 `<details>`는 짝이 맞는 구간을 묶어서 정렬 속성·토글로 만든다. */
function convertBlocks(tokens: readonly Token[], state: State): PmNode[] {
  const stack: Frame[] = [{ kind: "root", nodes: [] }];
  for (const token of tokens) {
    if (token.type === "html") {
      // HTML을 그리지 않는 방언(gfm)은 내용을 잃지 않게 원문 그대로 둔다.
      if (state.profile.rawEmbeds) stack[stack.length - 1]!.nodes.push({ type: "raw", attrs: { text: (token as Tokens.HTML).raw.replace(/\n+$/, "") } });
      else handleHtml((token as Tokens.HTML).raw, stack, state);
      continue;
    }
    const frame = stack[stack.length - 1]!;
    state.orphanId = null;
    frame.nodes.push(...tokenBlocks(token, state));
    if (state.orphanId !== null && frame.nodes.length > 0) {
      frame.nodes[frame.nodes.length - 1] = withBlockId(frame.nodes[frame.nodes.length - 1]!, state.orphanId);
    }
    state.orphanId = null;
  }
  // 닫히지 않은 구간은 닫는다.
  while (stack.length > 1) {
    const top = stack[stack.length - 1]!;
    if (top.kind === "details") closeDetails(stack);
    else popDiv(stack);
  }
  return stack[0]!.nodes;
}

/**
 * Markdown 본문(frontmatter는 이미 뗀 것)을 본문 문서로 바꾼다. `fromDir`은 이 글이 있는 폴더(폴더 기준 상대 경로 해석에 쓴다).
 * 이미지 노드는 `importPath`만 가지고 있다 — 이미지를 저장소에 넣은 뒤 `finalizeImages`로 해시와 형식을 채운다.
 */
export function markdownToDoc(markdown: string, ctx: ImportContext, fromDir: string): MarkdownImportResult {
  const profile = profileOf(ctx.dialect, ctx.profile);
  const { text, store, footnotes, abbrs } = protect(markdown, profile, ctx.references ?? false, ctx.extras ?? {});
  const state: State = { ctx, profile, fromDir, store, footnotes, notices: new Map(), images: new Set(), htmlMarks: [], abbrs, abbrPattern: abbrPatternOf(abbrs), foundId: null, orphanId: null };
  const tokens = new Lexer({ gfm: true, breaks: false }).lex(text);
  const content = convertBlocks(tokens, state);
  return {
    doc: { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] },
    images: [...state.images],
    notices: state.notices,
  };
}

/** 저장소에 넣은 이미지의 해시·형식. */
export interface StoredImage {
  hash: string;
  mime: string;
}

/**
 * 이미지 노드의 `importPath`를 저장소에 넣은 이미지(`resolved`: 폴더 안 경로 → 해시·형식)로 바꾼다.
 * 저장하지 못한 이미지(`null`이거나 목록에 없음)는 `![설명](경로)` 글자 문단으로 둔다. 바꾼 노드 수를 `missing`으로 돌려준다.
 */
export function finalizeImages(doc: PmNode, resolved: ReadonlyMap<string, StoredImage | null>): { doc: PmNode; missing: number } {
  let missing = 0;
  const walk = (node: PmNode): PmNode => {
    if (node.type === "image" && typeof node.attrs?.importPath === "string") {
      const { importPath, ...rest } = node.attrs;
      const stored = resolved.get(importPath);
      if (stored) return { ...node, attrs: { ...rest, hash: stored.hash, mime: stored.mime } };
      missing += 1;
      const alt = typeof rest.alt === "string" ? rest.alt : "";
      return { type: "paragraph", content: [{ type: "text", text: `![${alt}](${importPath})` }] };
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node;
  };
  return { doc: walk(doc), missing };
}
