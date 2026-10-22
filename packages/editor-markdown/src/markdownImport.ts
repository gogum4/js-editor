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

import { normalizeCalloutType } from "@9um4/editor-schema/callout";
import { normalizeImageWidth } from "@9um4/editor-schema/imageLayout";
import type { PmMark, PmNode } from "@9um4/editor-schema/pmDoc";
import { isSafeToOpen } from "@9um4/editor-schema/safeLink";
import { normalizeTextAlign } from "@9um4/editor-schema/textAlign";

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
  | { kind: "footnote"; id: string; raw: string };

interface Protected {
  text: string;
  store: Placeholder[];
  footnotes: Map<string, string>;
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

function protectInline(line: string, store: Placeholder[], footnotes: Map<string, string>): string {
  const put = (placeholder: Placeholder) => `${OPEN}${store.push(placeholder) - 1}${CLOSE}`;
  return splitCodeSpans(line)
    .map((part) => {
      if (part.code) return part.text;
      return part.text
        .replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (raw, bang: string, inner: string) => {
          // `이름#위치|표시 글자` (위치는 `제목` 또는 `^블록`).
          const [target = "", alias] = (inner as string).split("|", 2) as [string, string | undefined];
          const hash = target.indexOf("#");
          const name = (hash < 0 ? target : target.slice(0, hash)).trim();
          const anchor = hash < 0 ? null : target.slice(hash + 1).trim();
          return put({ kind: "wiki", target: name, anchor: anchor === "" ? null : anchor, alias: alias?.trim() || null, embed: bang === "!", raw });
        })
        .replace(/(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<![\s\\])\$(?![\d$\w])/g, (raw, latex: string) =>
          looksLikeMoney(latex) ? raw : put({ kind: "math", latex, raw }),
        )
        .replace(/\[\^([^\]\s]+)\]/g, (raw, id: string) => (footnotes.has(id) ? put({ kind: "footnote", id, raw }) : raw));
    })
    .join("");
}

/**
 * `marked`가 망가뜨릴 것들을 자리표시자로 바꾼다: 위키 링크, 수식(`_`·`*`가 기울임으로 읽힌다), 각주 정의와 참조.
 * 코드 블록(``` 울타리)과 인라인 코드 안은 그대로 둔다. 블록 수식(`$$ … $$`)은 자기 문단이 되도록 앞뒤에 빈 줄을 둔다.
 */
function protect(source: string): Protected {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const store: Placeholder[] = [];
  const footnotes = new Map<string, string>();

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
    const def = fence === null ? /^\[\^([^\]\s]+)\]:\s?(.*)$/.exec(line) : null;
    if (!def) {
      kept.push(line);
      continue;
    }
    const parts = [def[2]!];
    while (i + 1 < lines.length && /^( {4}|\t)/.test(lines[i + 1]!)) parts.push(lines[++i]!.replace(/^( {4}|\t)/, ""));
    footnotes.set(def[1]!, parts.join("\n").trim());
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
    const block = /^ {0,3}\$\$(.*)$/.exec(line);
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
          out.push(protectInline(line, store, footnotes));
          continue;
        }
        latex = body.join("\n").trim();
        i = j;
      }
      const ref = `${OPEN}${store.push({ kind: "mathBlock", latex, raw: `$$${latex}$$` }) - 1}${CLOSE}`;
      out.push("", ref, "");
      continue;
    }
    out.push(protectInline(line, store, footnotes));
  }
  return { text: out.join("\n"), store, footnotes };
}

// ───────────────────────── 변환 ─────────────────────────

/** 페이지와 이미지가 어디 있는지 알려 주는 쪽(가져오기 계획). */
export interface ImportContext {
  /** 위키 링크의 이름이나 상대 경로(`.md` 없이)로 가져올 페이지의 id를 찾는다. 없으면 null. */
  resolvePage(target: string, fromDir: string): string | null;
  /** 이미지의 상대 경로(또는 파일 이름)를 가져올 폴더 안의 경로로 바꾼다. 폴더에 없으면 null. */
  resolveImage(path: string, fromDir: string): string | null;
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
  fromDir: string;
  store: Placeholder[];
  footnotes: Map<string, string>;
  notices: Map<string, number>;
  images: Set<string>;
  /** `<u>` 안에 있는 동안 1 이상. */
  underline: number;
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
  const pageId = p.target === "" ? null : state.ctx.resolvePage(p.target, state.fromDir);
  if (pageId === null) {
    note(state, p.embed ? NOTICE.unresolvedEmbed : NOTICE.unresolvedLink);
    return textNode(p.raw, marks);
  }
  if (p.anchor !== null) note(state, NOTICE.anchorLink);
  return { type: "pageLink", attrs: { pageId } };
}

/** 글자 하나를 자리표시자 기준으로 나누어 글자·링크·수식·각주 노드로 만든다. */
function restoreText(text: string, marks: readonly PmMark[], state: State): PmNode[] {
  const nodes: PmNode[] = [];
  const push = (value: string) => {
    if (value === "") return;
    // 줄바꿈은 눈에 보이는 줄바꿈으로 둔다(Obsidian의 기본 보기와 같다).
    value.split("\n").forEach((piece, index) => {
      if (index > 0) nodes.push({ type: "hardBreak" });
      if (piece !== "") nodes.push(textNode(decodeEntities(piece), marks));
    });
  };
  let last = 0;
  for (let m = PLACEHOLDER.exec(text); m; m = PLACEHOLDER.exec(text)) {
    push(text.slice(last, m.index));
    last = m.index + m[0].length;
    const p = state.store[Number(m[1])];
    if (!p) continue;
    if (p.kind === "wiki") nodes.push(wikiNode(p, marks, state));
    else if (p.kind === "footnote") nodes.push({ type: "footnote", attrs: { text: state.footnotes.get(p.id) ?? "" } });
    else nodes.push({ type: "mathInline", attrs: { latex: p.latex } });
  }
  PLACEHOLDER.lastIndex = 0;
  push(text.slice(last));
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

/** 이미지 하나(`![설명|너비](경로)`)를 이미지 노드로. 인터넷 주소·폴더에 없는 파일은 글자·링크로 둔다. */
function imageNode(href: string, rawAlt: string, state: State): PmNode {
  // `설명|300`·`설명|300x200`·`300`(Obsidian): 너비만 쓴다.
  let alt = rawAlt;
  let width: number | null = null;
  const sized = /^(.*?)\|\s*(\d+)(?:x\d+)?\s*$/.exec(rawAlt);
  if (sized) {
    alt = sized[1]!.trim();
    width = normalizeImageWidth(Number(sized[2]));
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

/** 인라인 토큰들을 노드로. 이미지는 블록이라 이미지 노드가 섞여 나오고, 부르는 쪽이 문단에서 떼어 낸다. */
function inlineNodes(tokens: readonly Token[], marks: readonly PmMark[], state: State): PmNode[] {
  const nodes: PmNode[] = [];
  const active = () => (state.underline > 0 ? toggleMark(marks, "underline") : [...marks]);
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
        nodes.push(imageNode(t.href, restoreRaw(t.text, state), state));
        break;
      }
      case "link": {
        const t = token as Tokens.Link;
        const href = restoreRaw(t.href, state);
        nodes.push(...linkNodes(t, href, marks, state));
        break;
      }
      case "html": {
        const tag = (token as Tokens.HTML).raw.trim().toLowerCase();
        if (/^<u(\s[^>]*)?>$/.test(tag)) state.underline++;
        else if (tag === "</u>") state.underline = Math.max(0, state.underline - 1);
        else if (/^<br\s*\/?>$/.test(tag)) nodes.push({ type: "hardBreak" });
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
  if (/\.(md|markdown)$/i.test(target) && !/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    const pageId = state.ctx.resolvePage(target.replace(/\.(md|markdown)$/i, ""), state.fromDir);
    if (pageId !== null) return [{ type: "pageLink", attrs: { pageId } }];
    note(state, NOTICE.relativeLink);
    return inlineNodes(token.tokens, marks, state);
  }
  const children = inlineNodes(token.tokens, marks, state);
  if (isSafeToOpen(href)) {
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
    if (node.type === "image") {
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

/** 문단 토큰 하나를 블록들로. 수식 블록·페이지 임베드·이미지 임베드만 든 문단은 그 블록이 된다. */
function paragraphBlocks(token: Tokens.Paragraph | Tokens.Text, state: State): PmNode[] {
  const only = /^(\d+)$/.exec(token.text.trim());
  const placeholder = only ? state.store[Number(only[1])] : undefined;
  if (placeholder?.kind === "mathBlock") return [{ type: "mathBlock", attrs: { latex: placeholder.latex } }];
  if (placeholder?.kind === "wiki" && placeholder.embed) {
    const image = embeddedImage(placeholder, state);
    if (image) return [image];
    const pageId = placeholder.target === "" ? null : state.ctx.resolvePage(placeholder.target, state.fromDir);
    if (pageId !== null) {
      if (placeholder.anchor !== null) note(state, NOTICE.embedAnchor);
      return [{ type: "pageBlock", attrs: { pageId, mode: "embed" } }];
    }
  }
  const tokens = token.tokens ?? [];
  return paragraphsAround(inlineNodes(tokens, [], state));
}

/** 콜아웃 종류 이름(`NOTE`, `info`, `Warning` …)을 이 앱의 5종 가운데 하나로. */
function calloutType(name: string): string {
  const lowered = name.toLowerCase();
  const alias: Record<string, string> = { info: "note", abstract: "note", summary: "note", todo: "note", question: "note", quote: "note", example: "note", hint: "tip", success: "tip", check: "tip", done: "tip", attention: "warning", failure: "caution", fail: "caution", missing: "caution", danger: "caution", error: "caution", bug: "caution" };
  return normalizeCalloutType(alias[lowered] ?? lowered);
}

function blockquoteBlocks(token: Tokens.Blockquote, state: State): PmNode[] {
  const first = token.tokens[0];
  const header = first && first.type === "paragraph" ? /^\[!([A-Za-z]+)\][+-]?[ \t]*([^\n]*)(?:\n([\s\S]*))?$/.exec((first as Tokens.Paragraph).text) : null;
  if (!header) {
    const content = convertBlocks(token.tokens, state);
    return [{ type: "blockquote", content: content.length > 0 ? content : [{ type: "paragraph" }] }];
  }
  const content: PmNode[] = [];
  const title = (header[2] ?? "").trim();
  // 콜아웃의 제목 줄은 굵은 글씨 문단으로 둔다(기본 제목과 같은 글자면 생략한다).
  if (title !== "" && title.toLowerCase() !== header[1]!.toLowerCase()) {
    content.push({ type: "paragraph", content: mergeText(inlineNodes(Lexer.lexInline(title), [{ type: "bold" }], state)) });
  }
  const bodyText = header[3] ?? "";
  if (bodyText.trim() !== "") {
    content.push(...paragraphsAround(inlineNodes(Lexer.lexInline(bodyText), [], state)));
  }
  content.push(...convertBlocks(token.tokens.slice(1), state));
  return [{ type: "callout", attrs: { type: calloutType(header[1]!) }, content: content.length > 0 ? content : [{ type: "paragraph" }] }];
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
function listBlocks(token: Tokens.List, state: State): PmNode[] {
  const runs: Tokens.ListItem[][] = [];
  for (const item of token.items) {
    const last = runs[runs.length - 1];
    if (last && Boolean(last[0]!.task) === Boolean(item.task)) last.push(item);
    else runs.push([item]);
  }
  return runs.map((run, index) => {
    if (run[0]!.task) {
      return {
        type: "taskList",
        content: run.map((item) => ({ type: "taskItem", attrs: { checked: item.checked === true }, content: itemContent(item.tokens, state) })),
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
    const inline = mergeText(inlineNodes(c.tokens, [], state).filter((n) => n.type !== "image"));
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

function tokenBlocks(token: Token, state: State): PmNode[] {
  switch (token.type) {
    case "paragraph":
    case "text":
      return paragraphBlocks(token as Tokens.Paragraph, state);
    case "heading": {
      const t = token as Tokens.Heading;
      const content = trimBreaks(mergeText(inlineNodes(t.tokens, [], state).filter((n) => n.type !== "image")));
      return [{ type: "heading", attrs: { level: Math.min(Math.max(t.depth, 1), 6) }, ...(content.length > 0 ? { content } : {}) }];
    }
    case "code": {
      const t = token as Tokens.Code;
      const language = (t.lang ?? "").trim().split(/\s+/)[0] ?? "";
      const text = restoreRaw(t.text, state);
      return [{ type: "codeBlock", ...(language !== "" ? { attrs: { language } } : {}), ...(text !== "" ? { content: [{ type: "text", text }] } : {}) }];
    }
    case "blockquote":
      return blockquoteBlocks(token as Tokens.Blockquote, state);
    case "list":
      return listBlocks(token as Tokens.List, state);
    case "table":
      return [tableBlock(token as Tokens.Table, state)];
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
        if (frame.kind === "details") frame.title = mergeText(inlineNodes(Lexer.lexInline(inner.trim()), [], state).filter((n) => n.type !== "image"));
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
      handleHtml((token as Tokens.HTML).raw, stack, state);
      continue;
    }
    stack[stack.length - 1]!.nodes.push(...tokenBlocks(token, state));
  }
  // 닫히지 않은 구간은 닫는다.
  while (stack.length > 1) {
    if (stack[stack.length - 1]!.kind === "details") closeDetails(stack);
    else popDiv(stack);
  }
  return stack[0]!.nodes;
}

/**
 * Markdown 본문(frontmatter는 이미 뗀 것)을 본문 문서로 바꾼다. `fromDir`은 이 글이 있는 폴더(폴더 기준 상대 경로 해석에 쓴다).
 * 이미지 노드는 `importPath`만 가지고 있다 — 이미지를 저장소에 넣은 뒤 `finalizeImages`로 해시와 형식을 채운다.
 */
export function markdownToDoc(markdown: string, ctx: ImportContext, fromDir: string): MarkdownImportResult {
  const { text, store, footnotes } = protect(markdown);
  const state: State = { ctx, fromDir, store, footnotes, notices: new Map(), images: new Set(), underline: 0 };
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
