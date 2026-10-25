/** Markdown ↔ 본문(ProseMirror JSON). 방언 명세는 docs/MARKDOWN-DIALECT.md. */
export * from "./markdown.ts";
export * from "./markdownImport.ts";
export { type DialectProfile, type MarkdownDialect } from "./dialect.ts";
export { formatReference, parseReferenceLine } from "./referenceDirective.ts";
