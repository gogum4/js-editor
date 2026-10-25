// 배포될 모양의 타입 선언을 **소비자의 TypeScript가 읽을 수 있는지** 확인한다.
// pnpm pack 한 tarball을 풀어 `node_modules/@gogum4/*`에 두고, 그것을 import하는 작은 프로젝트를 `skipLibCheck: false`로 컴파일한다
// (skipLibCheck가 켜져 있으면 선언 안의 해석 못 한 import가 조용히 `any`가 되어 문제를 숨긴다). 먼저 `pnpm build:packages`가 필요하다.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
// 저장소 안에 두어야 `react` 같은 외부 타입을 위로 올라가며 찾는다.
const work = mkdtempSync(join(repo, ".consumer-check-"));

try {
  for (const name of ["editor-schema", "editor-markdown", "editor-render", "editor-core", "editor-react"]) {
    const pack = join(work, "packs", name);
    execFileSync(pnpm, ["--filter", `@gogum4/${name}`, "pack", "--pack-destination", pack], { stdio: "pipe", shell: process.platform === "win32" });
    const tgz = readdirSync(pack).find((f) => f.endsWith(".tgz"));
    const target = join(work, "node_modules", "@gogum4", name);
    mkdirSync(target, { recursive: true });
    execFileSync("tar", ["-xzf", join(pack, tgz), "-C", target, "--strip-components=1"]);
  }
  writeFileSync(
    join(work, "consumer.tsx"),
    `import { renderMarkdown, renderDoc, prepareRender, collectHeadings, MermaidDiagram, type RenderOptions, type Prepared, type HeadingInfo } from "@gogum4/editor-render";
import { renderMarkdownToHtml, renderDocToHtml } from "@gogum4/editor-render/html";
import { markdownToDoc, docToMarkdown, parseFrontmatter, type ImportContext } from "@gogum4/editor-markdown";
import { blockIdOf, blockIdFromForeign } from "@gogum4/editor-schema/blockId";
import { isSafeToOpen } from "@gogum4/editor-schema/safeLink";
import { calloutMeta, type CalloutIcons } from "@gogum4/editor-schema/callout";
import { detectEmbed, embedSource, type EmbedTarget } from "@gogum4/editor-schema/embed";
import { citationKeys, type ExtraSyntax, normalizeColor, replaceEmojiShortcodes } from "@gogum4/editor-schema/extras";
import { indentPrefix, normalizeIndent } from "@gogum4/editor-schema/indent";
import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import * as Y from "yjs";
import { createCoreExtensions, koStrings, memoryPorts, TABLE_ACTIONS, type CoreExtensionsOptions, type EditorPorts, type EditorStrings } from "@gogum4/editor-core";
import { newEditor } from "@gogum4/editor-core/testing";
import { createReactExtensions, EditorPortsProvider, TableToolbar, useEditorStrings } from "@gogum4/editor-react";

// 타입이 실제로 해석되는지(any가 아닌지) 확인하는 사용 예.
export async function page(source: string) {
  const options: RenderOptions = { pageLink: (id: string) => (id === "x" ? { href: "/x", title: "x" } : null), blockAnchors: true };
  const { element, headings, frontmatter, doc }: { element: unknown; headings: HeadingInfo[]; frontmatter: Record<string, string | string[]>; doc: PmNode } = await renderMarkdown(source, options);
  const prepared: Prepared = await prepareRender(doc);
  const html: string = renderDocToHtml(doc, { ...options, prepared });
  const more = await renderMarkdownToHtml(source);
  const ctx: ImportContext = { resolvePage: () => null, resolveImage: () => null };
  const parsed = markdownToDoc(source, ctx, "");
  const back: string = docToMarkdown(parsed.doc, { pageTitle: () => null }).markdown;
  const front = parseFrontmatter(source).data;
  const id: string | null = blockIdOf(doc);
  const mapped: string = blockIdFromForeign("my-id");
  const safe: boolean = isSafeToOpen("https://example.com");
  const heads = collectHeadings(doc);
  return { element, headings, frontmatter, html, more: more.html, back, front, id, mapped, safe, heads, node: <MermaidDiagram source="graph TD;A-->B" /> };
}

// @ts-expect-error — 존재하지 않는 옵션은 오류여야 한다(타입이 any로 풀리지 않았다는 증거).
export const bad: RenderOptions = { noSuchOption: true };

// 에디터: core(React 없음)와 editor-react의 공개 API도 같은 방식으로 해석돼야 한다. 표 명령 타입(addRowAfter 등)은 core 안에서 풀린다.
export function editor() {
  const options: CoreExtensionsOptions = { strings: koStrings, raw: true };
  const strings: EditorStrings = koStrings;
  const extensions = createReactExtensions(new Y.Doc(), options);
  const plain = createCoreExtensions(null);
  const headless = newEditor(undefined, plain);
  // 0.2: 임베드·들여쓰기 옵션, 콜아웃 아이콘 표, 소비자 입력 접점(parseEmbedInput)이 타입으로 풀린다.
  const icons: CalloutIcons = { rocket: "🚀" };
  const ports: EditorPorts = { ...memoryPorts(), calloutIcons: icons, parseEmbedInput: (input: string) => (input.startsWith("post:") ? { kind: "post", id: input.slice(5) } : null) };
  const extras: ExtraSyntax = { marks: true, abbr: true, comments: true, tags: true, citations: true, definitions: true, toc: true, emoji: true };
  const rich = createReactExtensions(new Y.Doc(), { ports, embed: true, indent: true, reference: true, extras });
  const color: string | null = normalizeColor("#f00");
  const keys: string[] = citationKeys("@smith2020");
  const emoji: string = replaceEmojiShortcodes(":smile:");
  void [color, keys, emoji];
  const target: EmbedTarget | null = detectEmbed("https://youtu.be/dQw4w9WgXcQ");
  const src: string | null = target === null ? null : embedSource(target);
  const meta: { label: string; icon: string } = calloutMeta("rocket", icons);
  const level: number | null = normalizeIndent("3");
  return { rich, src, meta, level, prefix: indentPrefix(2), extensions, strings, headless, tableActions: TABLE_ACTIONS.map((a) => a.key), provider: EditorPortsProvider, strings2: useEditorStrings, toolbar: <TableToolbar editor={null} /> };
}
// @ts-expect-error — core에 없는 옵션은 오류여야 한다.
export const badCore: CoreExtensionsOptions = { noSuchOption: true };
// @ts-expect-error — 지원하지 않는 블로그 방언은 타입에서 사라졌다.
export const badDialect: ImportContext = { resolvePage: () => null, resolveImage: () => null, dialect: "blog" };
`,
  );
  writeFileSync(
    join(work, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022", module: "ESNext", moduleResolution: "bundler", jsx: "react-jsx", strict: true,
        skipLibCheck: false, noEmit: true, types: [], lib: ["ES2022", "DOM"],
      },
      files: ["consumer.tsx"],
    }),
  );
  const tsc = (project) => execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", join(work, project)], { stdio: "inherit" });
  tsc("tsconfig.json");
  console.log("소비자 프로젝트(번들러 해석: Next.js·Vite)가 배포 모양의 타입으로 컴파일됐다 (skipLibCheck: false)");

  // Node 방식 해석(`nodenext`)은 더 엄격하다: 선언의 상대 import 확장자가 `.js`여야 한다(`.ts`로 끝나면 해석하지 못한다).
  writeFileSync(
    join(work, "consumer-node.mts"),
    `import { renderMarkdownToHtml } from "@gogum4/editor-render/html";
import { prepareRender, type RenderOptions, type Prepared } from "@gogum4/editor-render";
import { markdownToDoc } from "@gogum4/editor-markdown";

export async function run(source: string): Promise<string> {
  const options: RenderOptions = { blockAnchors: true };
  const { html } = await renderMarkdownToHtml(source, options);
  const parsed = markdownToDoc(source, { resolvePage: () => null, resolveImage: () => null }, "");
  const prepared: Prepared = await prepareRender(parsed.doc);
  return html + prepared.math.size;
}
`,
  );
  writeFileSync(
    join(work, "tsconfig.node.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: false, noEmit: true, types: [], lib: ["ES2022", "DOM"] },
      files: ["consumer-node.mts"],
    }),
  );
  tsc("tsconfig.node.json");
  console.log("소비자 프로젝트(Node 해석: nodenext)도 컴파일됐다");
} finally {
  rmSync(work, { recursive: true, force: true });
}
