import type { PmNode } from "@9um4/editor-schema/pmDoc";

/** 노드 안의 글자를 모두 이은 것(제목의 앵커·목차에 쓴다). */
export function textOf(node: PmNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak" || node.type === "softBreak") return " ";
  if (node.type === "rawInline") return typeof node.attrs?.text === "string" ? node.attrs.text : "";
  if (node.type === "mathInline") return typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
  return (node.content ?? []).map(textOf).join("");
}

/** 제목 글자 → 앵커 id. 글자·숫자(모든 언어)만 남기고 공백은 `-`로 잇는다. 비면 `section`. */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "section" : slug;
}

export interface HeadingInfo {
  level: number;
  text: string;
  /** 문서 안에서 겹치지 않는 앵커 id (겹치면 `-2`, `-3`을 붙인다). */
  id: string;
}

/** 문서의 제목들을 문서 순서대로. 렌더러가 다는 앵커 id와 같은 규칙이라 목차에 그대로 쓴다. */
export function collectHeadings(doc: PmNode): HeadingInfo[] {
  const seen = new Map<string, number>();
  const out: HeadingInfo[] = [];
  const visit = (node: PmNode) => {
    if (node.type === "heading") {
      const text = textOf(node).replace(/\s+/g, " ").trim();
      const base = slugify(text);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      out.push({ level: Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6), text, id: count === 1 ? base : `${base}-${count}` });
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return out;
}
