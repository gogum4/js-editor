import type { CSSProperties, ReactNode } from "react";

import { calloutMeta, normalizeCalloutType } from "@gogum4/editor-schema/callout";
import { blockIdOf } from "@gogum4/editor-schema/blockId";
import type { PmMark, PmNode } from "@gogum4/editor-schema/pmDoc";
import { normalizeReferenceProps } from "@gogum4/editor-schema/reference";
import { isSafeToOpen } from "@gogum4/editor-schema/safeLink";
import { normalizeTextAlign } from "@gogum4/editor-schema/textAlign";
import { MermaidDiagram } from "./client/MermaidDiagram.tsx";
import { hastToReact } from "./highlight.tsx";
import { collectHeadings, textOf } from "./slug.ts";
import { koRenderStrings, type RenderStrings } from "./strings.ts";
import { codeKey, type ImageSource, mathKey, type RenderOptions } from "./types.ts";

/** 렌더 한 번 동안 쓰는 상태. 렌더는 문서 순서대로 한 번 돌고, 각주 번호는 나온 순서대로 매겨진다. */
interface Context {
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
  if (has("italic")) out = <em>{out}</em>;
  if (has("bold")) out = <strong>{out}</strong>;
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
      case "softBreak":
        // 문단 안의 줄바꿈 한 개(소스에서 줄을 나눈 자리): 공백으로 그린다.
        return <Keyed key={index}>{" "}</Keyed>;
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
        return (
          <a key={index} className="page-link" href={blockId === null ? target.href : `${target.href}#^${blockId}`}>
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
        <p key={key} id={anchorId(node, ctx)} style={alignStyle(node)}>
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
        <Tag key={key} id={id} style={alignStyle(node)}>
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
    case "callout": {
      const type = normalizeCalloutType(node.attrs?.type);
      const meta = calloutMeta(type, ctx.options.calloutIcons);
      const label = ctx.strings.callout[type] ?? meta.label;
      return (
        <div key={key} id={anchorId(node, ctx)} className={`callout callout-${type}`} data-callout={type} role="note" aria-label={label}>
          <div className="callout-icon" aria-hidden="true">
            {meta.icon}
          </div>
          <div className="callout-body">{renderBlocks(node.content, ctx)}</div>
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
    case "directive": {
      // 컨테이너 디렉티브(`:::indent{n=1}` 등): 안쪽 블록을 그대로 그리고, 여는 줄은 data 속성에 남긴다(소비자가 CSS·후처리로 꾸민다).
      const head = typeof node.attrs?.head === "string" ? node.attrs.head : "";
      return (
        <div key={key} className="directive" data-directive="" data-head={head}>
          {renderBlocks(node.content, ctx)}
        </div>
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
export function renderDoc(doc: PmNode, options: RenderOptions = {}): ReactNode {
  const ctx: Context = {
    options,
    strings: options.strings ?? koRenderStrings,
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
