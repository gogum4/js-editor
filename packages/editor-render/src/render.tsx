import type { CSSProperties, ReactNode } from "react";

import { calloutMeta, normalizeCalloutFold, normalizeCalloutTitle, normalizeCalloutType } from "@gogum4/editor-schema/callout";
import { normalizeIndent } from "@gogum4/editor-schema/indent";
import { citationKeys, normalizeAbbrTitle, normalizeCitationSource, normalizeColor, normalizeCommentText, normalizeTag } from "@gogum4/editor-schema/extras";
import { blueskyProfile, EMBED_DEFAULT_SIZE, EMBED_IFRAME_ALLOW, embedSource, normalizeEmbedSize, normalizeEmbedTarget, withBlueskyDid } from "@gogum4/editor-schema/embed";
import { blockIdOf } from "@gogum4/editor-schema/blockId";
import type { PmMark, PmNode } from "@gogum4/editor-schema/pmDoc";
import { normalizeReferenceProps } from "@gogum4/editor-schema/reference";
import { isSafeToOpen } from "@gogum4/editor-schema/safeLink";
import { normalizeTextAlign } from "@gogum4/editor-schema/textAlign";
import { MermaidDiagram } from "./client/MermaidDiagram.tsx";
import { hastToReact } from "./highlight.tsx";
import { collectHeadings, slugify, textOf } from "./slug.ts";
import { koRenderStrings, type RenderStrings } from "./strings.ts";
import { codeKey, type ImageSource, mathKey, type RenderOptions } from "./types.ts";

/** 렌더 한 번 동안 쓰는 상태. 렌더는 문서 순서대로 한 번 돌고, 각주 번호는 나온 순서대로 매겨진다. */
interface Context {
  /** 문서 전체(목차 블록이 제목들을 모은다). */
  doc: PmNode;
  options: RenderOptions;
  strings: RenderStrings;
  footnotes: string[];
  headingIds: string[];
  nextHeading: number;
}

const LINK_REL = "noopener noreferrer nofollow";

function alignStyle(node: PmNode): CSSProperties | undefined {
  const align = normalizeTextAlign(node.attrs?.textAlign);
  return align === null ? undefined : { textAlign: align };
}

/** 문단·제목의 정렬과 들여쓰기(한 단계 2em)를 합친 스타일. */
function blockStyle(node: PmNode): CSSProperties | undefined {
  const indent = normalizeIndent(node.attrs?.indent);
  const align = alignStyle(node);
  if (indent === null) return align;
  return { ...align, marginLeft: `${indent * 2}em` };
}

/** 블록 id를 앵커로 단다(옵션이 켜졌을 때). `[[글#^id]]` 링크의 목적지다. */
function anchorId(node: PmNode, ctx: Context): string | undefined {
  if (!ctx.options.blockAnchors) return undefined;
  const id = blockIdOf(node);
  return id === null ? undefined : `^${id}`;
}

/** 기본 이미지 주소: `http(s)` 이미지와, 스킴이 없는 경로(`a.png`, `./a.png`, `/img/a.png`)만 쓴다. `javascript:`·`data:` 같은 스킴은 막는다. */
function defaultImageUrl(image: ImageSource): string | null {
  if (image.path === null) return null;
  if (image.remote) return image.path;
  return /^[a-z][a-z0-9+.-]*:/i.test(image.path.trim()) ? null : image.path;
}

// ───────────────────────── 인라인 ─────────────────────────

function renderText(node: PmNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? "";
  const marks: readonly PmMark[] = node.marks ?? [];
  const has = (type: string) => marks.some((m) => m.type === type);
  // 안쪽부터: 코드 → 밑줄 → 취소선 → 기울임 → 굵게 → 링크(가장 바깥).
  if (has("code")) out = <code>{out}</code>;
  if (has("underline")) out = <u>{out}</u>;
  if (has("strike")) out = <s>{out}</s>;
  // 추가 문법의 마크(안쪽부터): 삽입 → 하이라이트 → 위/아래 첨자 → 약어 → 색.
  if (has("insert")) out = <ins>{out}</ins>;
  if (has("highlight")) out = <mark>{out}</mark>;
  if (has("superscript")) out = <sup>{out}</sup>;
  if (has("subscript")) out = <sub>{out}</sub>;
  const abbr = marks.find((m) => m.type === "abbr");
  const abbrTitle = normalizeAbbrTitle(abbr?.attrs?.title);
  if (abbrTitle !== null) out = <abbr title={abbrTitle}>{out}</abbr>;
  if (has("italic")) out = <em>{out}</em>;
  if (has("bold")) out = <strong>{out}</strong>;
  const textColor = normalizeColor(marks.find((m) => m.type === "textColor")?.attrs?.color);
  const backgroundColor = normalizeColor(marks.find((m) => m.type === "backgroundColor")?.attrs?.color);
  if (textColor !== null || backgroundColor !== null) {
    out = <span style={{ ...(textColor !== null ? { color: textColor } : {}), ...(backgroundColor !== null ? { backgroundColor } : {}) }}>{out}</span>;
  }
  const link = marks.find((m) => m.type === "link");
  const href = typeof link?.attrs?.href === "string" ? link.attrs.href.trim() : "";
  // 열면 안 되는 주소(javascript: 등)는 링크 없이 글자만 보인다.
  if (href !== "" && isSafeToOpen(href)) {
    out = (
      <a href={href} rel={LINK_REL}>
        {out}
      </a>
    );
  }
  return <Keyed key={key}>{out}</Keyed>;
}

/** 키가 필요한 자리에서 요소가 아닌 것(글자)도 감싸 준다. */
function Keyed({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function renderInline(nodes: readonly PmNode[] | undefined, ctx: Context): ReactNode[] {
  return (nodes ?? []).map((node, index) => {
    switch (node.type) {
      case "text":
        return renderText(node, index);
      case "hardBreak":
        return <br key={index} />;
      case "mathInline": {
        const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
        const html = ctx.options.prepared?.math.get(mathKey(false, latex));
        return html === undefined ? (
          <code key={index} className="math-source">
            {latex}
          </code>
        ) : (
          <span key={index} className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
        );
      }
      case "footnote": {
        const text = typeof node.attrs?.text === "string" ? node.attrs.text.trim() : "";
        if (text === "") return null;
        ctx.footnotes.push(text);
        const n = ctx.footnotes.length;
        return (
          <sup key={index} className="footnote-ref" id={`fnref-${n}`}>
            <a href={`#fn-${n}`}>{n}</a>
          </sup>
        );
      }
      case "comment": {
        // 주석은 독자에게 보이지 않는다(`showComments`로 흐린 글로 보일 수 있다).
        const text = normalizeCommentText(node.attrs?.text);
        if (text === null || ctx.options.showComments !== true) return null;
        return (
          <span key={index} className="md-comment" data-comment="">
            %%{text}%%
          </span>
        );
      }
      case "tag": {
        const name = normalizeTag(node.attrs?.name);
        if (name === null) return null;
        const href = ctx.options.tagHref?.(name) ?? null;
        return href === null ? (
          <span key={index} className="md-tag" data-tag={name}>
            #{name}
          </span>
        ) : (
          <a key={index} className="md-tag" data-tag={name} href={href}>
            #{name}
          </a>
        );
      }
      case "citation": {
        const source = normalizeCitationSource(node.attrs?.source);
        if (source === null) return null;
        const keys = citationKeys(source);
        const label = ctx.options.citationLabel?.(keys, source) ?? null;
        const href = keys[0] === undefined ? null : (ctx.options.citationHref?.(keys[0]) ?? null);
        const text = label === null ? `[${source}]` : label;
        return (
          <cite key={index} className="md-citation" data-citation={source}>
            {href === null ? text : <a href={href}>{text}</a>}
          </cite>
        );
      }
      case "rawInline": {
        const text = typeof node.attrs?.text === "string" ? node.attrs.text : "";
        const custom = ctx.options.renderRaw?.(text, true);
        if (custom !== undefined) return <Keyed key={index}>{custom}</Keyed>;
        return (
          <code key={index} className="raw-source" data-raw-inline="">
            {text}
          </code>
        );
      }
      case "pageLink": {
        const pageId = typeof node.attrs?.pageId === "string" ? node.attrs.pageId : "";
        const target = ctx.options.pageLink?.(pageId) ?? null;
        if (target === null) return null;
        const blockId = blockIdOf({ type: "x", attrs: { id: node.attrs?.blockId } });
        // 제목 위치(`[[글#제목]]`)는 그 글의 제목 앵커로 잇는다(앵커 id는 제목 글자의 slug).
        const heading = typeof node.attrs?.heading === "string" && node.attrs.heading.trim() !== "" ? slugify(node.attrs.heading) : null;
        const hash = blockId !== null ? `#^${blockId}` : heading !== null ? `#${heading}` : "";
        return (
          <a key={index} className="page-link" href={`${target.href}${hash}`}>
            {target.title}
          </a>
        );
      }
      default:
        // 모르는 인라인 노드는 안에 든 글자만 보인다.
        return <Keyed key={index}>{renderInline(node.content, ctx)}</Keyed>;
    }
  });
}

// ───────────────────────── 블록 ─────────────────────────

function renderBlocks(nodes: readonly PmNode[] | undefined, ctx: Context): ReactNode[] {
  return (nodes ?? []).map((node, index) => renderBlock(node, ctx, index));
}

function renderList(node: PmNode, ctx: Context, key: number): ReactNode {
  const id = anchorId(node, ctx);
  const items = (node.content ?? []).map((item, index) => {
    if (node.type === "taskList") {
      const checked = item.attrs?.checked === true;
      return (
        <li key={index} className="task-item" data-checked={checked ? "true" : "false"}>
          <input type="checkbox" checked={checked} disabled readOnly aria-label={checked ? "✓" : "○"} />
          <div>{renderBlocks(item.content, ctx)}</div>
        </li>
      );
    }
    return <li key={index}>{renderBlocks(item.content, ctx)}</li>;
  });
  if (node.type === "orderedList") {
    const start = Number(node.attrs?.start) || 1;
    return (
      <ol key={key} id={id} start={start === 1 ? undefined : start}>
        {items}
      </ol>
    );
  }
  return (
    <ul key={key} id={id} className={node.type === "taskList" ? "task-list" : undefined}>
      {items}
    </ul>
  );
}

function renderCode(node: PmNode, ctx: Context, key: number): ReactNode {
  const code = textOf(node);
  const language = typeof node.attrs?.language === "string" ? node.attrs.language.trim() : "";
  const id = anchorId(node, ctx);
  // mermaid는 브라우저에서 그린다. 서버는 소스를 그대로 담은 `<pre class="mermaid">`를 낸다.
  if (language.toLowerCase() === "mermaid") {
    return id === undefined ? (
      <MermaidDiagram key={key} source={code} theme={ctx.options.mermaidTheme} />
    ) : (
      <div key={key} id={id}>
        <MermaidDiagram source={code} theme={ctx.options.mermaidTheme} />
      </div>
    );
  }
  const highlighted = ctx.options.prepared?.code.get(codeKey(language, code));
  return (
    <pre key={key} id={id} className="code-block" data-language={language === "" ? undefined : language}>
      <code className={language === "" ? undefined : `hljs language-${language}`}>{highlighted ? hastToReact(highlighted) : code}</code>
    </pre>
  );
}

function renderTable(node: PmNode, ctx: Context, key: number): ReactNode {
  const rows = node.content ?? [];
  const isHeaderRow = (row: PmNode | undefined) => (row?.content ?? []).length > 0 && (row?.content ?? []).every((cell) => cell.type === "tableHeader");
  const renderRow = (row: PmNode, index: number) => (
    <tr key={index}>
      {(row.content ?? []).map((cell, i) => {
        const colSpan = Number(cell.attrs?.colspan) > 1 ? Number(cell.attrs?.colspan) : undefined;
        const rowSpan = Number(cell.attrs?.rowspan) > 1 ? Number(cell.attrs?.rowspan) : undefined;
        const children = renderBlocks(cell.content, ctx);
        return cell.type === "tableHeader" ? (
          <th key={i} colSpan={colSpan} rowSpan={rowSpan} scope={rowSpan === undefined && isHeaderRow(row) ? "col" : undefined}>
            {children}
          </th>
        ) : (
          <td key={i} colSpan={colSpan} rowSpan={rowSpan}>
            {children}
          </td>
        );
      })}
    </tr>
  );
  const head = isHeaderRow(rows[0]) ? rows[0] : undefined;
  const body = head ? rows.slice(1) : rows;
  return (
    <div key={key} id={anchorId(node, ctx)} className="table-wrap">
      <table>
        {head ? <thead>{renderRow(head, 0)}</thead> : null}
        <tbody>{body.map((row, index) => renderRow(row, index + 1))}</tbody>
      </table>
    </div>
  );
}

function renderImage(node: PmNode, ctx: Context, key: number): ReactNode {
  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
  const width = typeof node.attrs?.width === "number" && node.attrs.width > 0 ? node.attrs.width : null;
  const source: ImageSource = {
    hash: typeof node.attrs?.hash === "string" ? node.attrs.hash : null,
    mime: typeof node.attrs?.mime === "string" ? node.attrs.mime : null,
    path: typeof node.attrs?.importPath === "string" ? node.attrs.importPath : null,
    alt,
    width,
    remote: node.attrs?.remote === true,
  };
  const src = (ctx.options.imageUrl ?? defaultImageUrl)(source);
  const id = anchorId(node, ctx);
  return (
    <figure key={key} id={id} className="image" style={alignStyle(node)}>
      {src === null ? (
        <span className="image-missing" role="img" aria-label={alt === "" ? ctx.strings.imageMissing : alt}>
          {alt === "" ? ctx.strings.imageMissing : alt}
        </span>
      ) : (
        <img src={src} alt={alt} width={width ?? undefined} loading="lazy" decoding="async" />
      )}
    </figure>
  );
}

function renderBlock(node: PmNode, ctx: Context, key: number): ReactNode {
  switch (node.type) {
    case "paragraph": {
      const children = renderInline(node.content, ctx);
      // 빈 문단(해석되지 않은 페이지 링크만 든 문단 포함)은 보이지 않는다.
      if (!children.some((child) => child !== null)) return null;
      return (
        <p key={key} id={anchorId(node, ctx)} style={blockStyle(node)}>
          {children}
        </p>
      );
    }
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const Tag = `h${level}` as "h1";
      const id = ctx.options.headingIds === false ? undefined : ctx.headingIds[ctx.nextHeading];
      ctx.nextHeading += 1;
      return (
        <Tag key={key} id={id} style={blockStyle(node)}>
          {renderInline(node.content, ctx)}
        </Tag>
      );
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      return renderList(node, ctx, key);
    case "blockquote":
      return (
        <blockquote key={key} id={anchorId(node, ctx)}>
          {renderBlocks(node.content, ctx)}
        </blockquote>
      );
    case "toc": {
      // 목차: 이 문서의 제목들로 만든 중첩 목록(앵커는 제목의 id와 같다).
      const headings = collectHeadings(ctx.doc);
      if (headings.length === 0) return null;
      const top = Math.min(...headings.map((heading) => heading.level));
      return (
        <nav key={key} className="md-toc" data-toc="" aria-label={ctx.strings.toc}>
          <p className="md-toc-title">{ctx.strings.toc}</p>
          <ul>
            {headings.map((heading) => (
              <li key={heading.id} style={{ marginLeft: `${(heading.level - top) * 1.1}em` }}>
                <a href={`#${heading.id}`}>{heading.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      );
    }
    case "definitionList":
      return (
        <dl key={key} className="md-dl">
          {(node.content ?? []).map((child, index) => (child.type === "definitionTerm" ? <dt key={index}>{renderInline(child.content, ctx)}</dt> : <dd key={index}>{renderInline(child.content, ctx)}</dd>))}
        </dl>
      );
    case "callout": {
      const type = normalizeCalloutType(node.attrs?.type);
      const meta = calloutMeta(type, ctx.options.calloutIcons);
      const label = ctx.strings.callout[type] ?? meta.label;
      const title = normalizeCalloutTitle(node.attrs?.title);
      const fold = normalizeCalloutFold(node.attrs?.fold);
      return (
        <div key={key} id={anchorId(node, ctx)} className={`callout callout-${type}`} data-callout={type} role="note" aria-label={label}>
          <div className="callout-icon" aria-hidden="true">
            {meta.icon}
          </div>
          {fold !== null ? (
            // 접을 수 있는 콜아웃: 제목(없으면 종류의 기본 제목)이 눌러서 펴고 접는 줄이다.
            <details className="callout-body" open={fold === "+"}>
              <summary className="callout-title">{title ?? label}</summary>
              {renderBlocks(node.content, ctx)}
            </details>
          ) : (
            <div className="callout-body">
              {title !== null && <div className="callout-title">{title}</div>}
              {renderBlocks(node.content, ctx)}
            </div>
          )}
        </div>
      );
    }
    case "codeBlock":
      return renderCode(node, ctx, key);
    case "horizontalRule":
      return <hr key={key} id={anchorId(node, ctx)} />;
    case "image":
      return renderImage(node, ctx, key);
    case "mathBlock": {
      const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
      if (latex.trim() === "") return null;
      const html = ctx.options.prepared?.math.get(mathKey(true, latex));
      return html === undefined ? (
        <pre key={key} id={anchorId(node, ctx)} className="math-source">
          {latex}
        </pre>
      ) : (
        <div key={key} id={anchorId(node, ctx)} className="math-block" dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
    case "table":
      return renderTable(node, ctx, key);
    case "toggle": {
      // 첫 문단이 제목 줄(<summary>), 나머지가 안의 내용. <details>라서 스크립트 없이 접고 펼친다.
      const [title, ...rest] = node.content ?? [];
      // 제목 줄이 제목(heading) 노드여도 인라인으로만 그리므로, 제목 앵커 번호가 어긋나지 않게 하나를 건너뛴다.
      if (title?.type === "heading") ctx.nextHeading += 1;
      return (
        <details key={key} id={anchorId(node, ctx)} className="toggle">
          <summary>{renderInline(title?.content, ctx)}</summary>
          {renderBlocks(rest, ctx)}
        </details>
      );
    }
    case "reference": {
      const kind = typeof node.attrs?.kind === "string" ? node.attrs.kind : "";
      const id = typeof node.attrs?.id === "string" ? node.attrs.id : "";
      if (kind === "" || id === "") return null;
      const custom = ctx.options.renderReference?.({ kind, id, props: normalizeReferenceProps(node.attrs?.props) });
      if (custom !== undefined) return custom === null ? null : <Keyed key={key}>{custom}</Keyed>;
      // 해석기가 없는 소비자의 대체 표시: 어떤 개체를 가리키는지만 적는다.
      return (
        <div key={key} className="reference reference-fallback" data-reference="" data-kind={kind} data-id={id}>
          <span className="reference-kind">{kind}</span> <span className="reference-id">{id}</span>
        </div>
      );
    }
    case "embed": {
      // 외부 임베드: 허용한 도메인의 iframe만 그린다(주소가 올바르지 않으면 아무것도 그리지 않는다).
      let target = normalizeEmbedTarget(node.attrs?.provider, node.attrs?.url);
      if (target !== null && target.provider === "bluesky" && embedSource(target) === null) {
        // 핸들 주소: 소비자가 미리 알아낸 DID가 있으면 DID 주소로 바꿔 그린다.
        const info = blueskyProfile(target);
        const known = info === null ? undefined : lookupDid(ctx.options.blueskyDids, info.profile);
        target = known === undefined ? target : (withBlueskyDid(target, known) ?? target);
      }
      const src = target === null ? null : embedSource(target);
      if (target === null) return null;
      if (src === null) {
        // 그릴 수 없는 임베드(DID를 모르는 Bluesky)는 원본 링크만 그린다.
        return (
          <div key={key} className="md-embed" data-embed="" data-provider={target.provider}>
            <a href={target.url} target="_blank" rel="noopener noreferrer nofollow">
              {target.url}
            </a>
          </div>
        );
      }
      const defaults = EMBED_DEFAULT_SIZE[target.provider];
      const width = normalizeEmbedSize(node.attrs?.width) ?? defaults.width;
      const height = normalizeEmbedSize(node.attrs?.height);
      const style: CSSProperties = { width: `${width}px`, maxWidth: "100%" };
      if (height === null && defaults.aspect) style.aspectRatio = `${defaults.width} / ${defaults.height}`;
      else style.height = `${height ?? defaults.height}px`;
      return (
        <div key={key} className="md-embed" data-embed="" data-provider={target.provider}>
          <div className="md-embed-frame" style={style}>
            <iframe
              src={src}
              title={ctx.strings.embedTitle(target.provider)}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
              allow={EMBED_IFRAME_ALLOW[target.provider]}
              allowFullScreen={target.provider === "youtube"}
            />
          </div>
        </div>
      );
    }
    case "raw": {
      const text = typeof node.attrs?.text === "string" ? node.attrs.text : "";
      if (text === "") return null;
      const custom = ctx.options.renderRaw?.(text, false);
      if (custom !== undefined) return custom === null ? null : <Keyed key={key}>{custom}</Keyed>;
      return (
        <pre key={key} className="raw-source" data-raw="">
          {text}
        </pre>
      );
    }
    case "pageBlock": {
      // 카드·임베드: 해석기가 페이지를 알면 링크 카드로, 아니면 아무것도 보이지 않는다. 동기화 블록은 내용이 이 문서에 없다.
      if (node.attrs?.mode === "synced") return null;
      const target = ctx.options.pageLink?.(typeof node.attrs?.pageId === "string" ? node.attrs.pageId : "") ?? null;
      if (target === null) return null;
      return (
        <p key={key} className="page-card">
          <a href={target.href}>{target.title}</a>
        </p>
      );
    }
    default:
      // 모르는 블록은 안의 내용만 보인다.
      return <Keyed key={key}>{renderBlocks(node.content, ctx)}</Keyed>;
  }
}

function renderFootnotes(ctx: Context): ReactNode {
  if (ctx.footnotes.length === 0) return null;
  return (
    <section className="footnotes" aria-label={ctx.strings.footnotes}>
      <hr />
      <ol>
        {ctx.footnotes.map((text, index) => (
          <li key={index} id={`fn-${index + 1}`}>
            {text}{" "}
            <a className="footnote-back" href={`#fnref-${index + 1}`} aria-label={ctx.strings.backToReference}>
              ↩
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * 본문 JSON을 React 요소로 만든다. **훅·브라우저 API 없이** 문서 순서대로 한 번 도는 순수 함수라서
 * Next.js 서버 컴포넌트, `react-dom/server`, 일반 React 어디서나 같은 결과를 낸다.
 */
/** 핸들 → DID 표(Map이나 객체)에서 DID를 찾는다. */
function lookupDid(table: ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined, handle: string): string | undefined {
  if (table === undefined) return undefined;
  return table instanceof Map ? table.get(handle) : (table as Readonly<Record<string, string>>)[handle];
}

export function renderDoc(doc: PmNode, options: RenderOptions = {}): ReactNode {
  const ctx: Context = {
    options,
    strings: options.strings ?? koRenderStrings,
    doc,
    footnotes: [],
    headingIds: collectHeadings(doc).map((heading) => heading.id),
    nextHeading: 0,
  };
  const blocks = renderBlocks(doc.content, ctx);
  const footnotes = renderFootnotes(ctx);
  return (
    <div className={options.className ? `md-doc ${options.className}` : "md-doc"}>
      {blocks}
      {footnotes}
    </div>
  );
}
