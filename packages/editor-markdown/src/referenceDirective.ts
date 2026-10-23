/**
 * 참조 노드(`reference`)의 기본 Markdown 표기: `::ref{kind=table-schema id=abc}` 한 줄(블로그 방언의 한 줄 디렉티브와 같은 모양).
 * 소비자는 내보내기 `references.toMarkdown`과 가져오기 `references`로 자기 표기(예: `![[schema:이름]]`)를 쓸 수 있다.
 */
import { normalizeReferenceId, normalizeReferenceKind, normalizeReferenceProps, type ReferenceProps, type ReferenceTarget, referenceTarget } from "@9um4-utils/editor-schema/reference";

const LINE = /^ {0,3}::ref\{([^}\n]*)\}[ \t]*$/;
const ATTR = /([a-zA-Z][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s"}]+))/g;

/** 한 줄이 기본 표기의 참조이면 대상을, 아니면 null. kind·id가 올바르지 않아도 null(글자로 남는다). */
export function parseReferenceLine(line: string): ReferenceTarget | null {
  const match = LINE.exec(line);
  if (match === null) return null;
  const attrs: Record<string, string> = {};
  for (const m of match[1]!.matchAll(ATTR)) attrs[m[1]!] = m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : m[3]!;
  // `kind`·`id` 말고 다른 속성은 참조의 설정(`props`)이다(예: `::ref{kind=table id=Item rows=5}`).
  const { kind, id, ...rest } = attrs;
  return referenceTarget(kind, id, rest);
}

const quote = (value: string) => (/[\s"'{}\\]/.test(value) ? `"${value.replace(/["\\]/g, "\\$&")}"` : value);

/** 기본 표기 한 줄. 값에 공백·따옴표·중괄호가 있으면 따옴표로 감싼다. kind·id가 올바르지 않으면 null. */
export function formatReference(kind: unknown, id: unknown, props?: ReferenceProps | null): string | null {
  const k = normalizeReferenceKind(kind);
  const i = normalizeReferenceId(id);
  if (k === null || i === null) return null;
  const extra = Object.entries(normalizeReferenceProps(props) ?? {})
    .filter(([name]) => name !== "kind" && name !== "id")
    .map(([name, value]) => ` ${name}=${quote(value)}`)
    .join("");
  return `::ref{kind=${k} id=${quote(i)}${extra}}`;
}
