// 배포용으로 컴파일한 packages/*/dist를 앱 도구(Vite) 없이 순수 Node로 불러 본다.
// 확장자 누락(`./x`)이나 import 시점의 브라우저 API 사용이 있으면 여기서 깬다 — 블로그 서버(Next.js)가 겪을 문제다.
// `@9um4/editor-*` import는 dist로 돌려서(scripts/dist-resolve-hooks.mjs) 배포된 모양 그대로 검증한다.
// 먼저 `pnpm build:packages`가 필요하다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

register("./dist-resolve-hooks.mjs", import.meta.url);

/** 하위 폴더까지 .js 파일을 모두 모은다. */
function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = dir + name;
    return statSync(path).isDirectory() ? jsFiles(path + "/") : name.endsWith(".js") ? [path] : [];
  });
}

const PACKAGES = ["editor-schema", "editor-markdown", "editor-render", "editor-core", "editor-react"];
let total = 0;
for (const name of PACKAGES) {
  const dist = fileURLToPath(new URL(`../packages/${name}/dist/`, import.meta.url));
  if (!existsSync(dist)) {
    console.error(`${name}/dist가 없다. 먼저 \`pnpm build:packages\`를 실행한다.`);
    process.exit(1);
  }
  const files = jsFiles(dist);
  for (const file of files) await import(pathToFileURL(file).href);
  console.log(`${name}: dist 모듈 ${files.length}개를 Node에서 불러왔다`);
  total += files.length;
}
console.log(`모두 ${total}개 OK`);

// 배포된 모양 그대로 Markdown → 본문 JSON → HTML이 끝까지 되는지 한 번 돌려 본다.
const { markdownToDoc } = await import("@9um4/editor-markdown");
const { prepareRender, renderDoc } = await import("@9um4/editor-render");
const { renderToStaticMarkup } = await import("react-dom/server");
const { doc } = markdownToDoc("# 제목\n\n**굵게** 와 [링크](https://example.com) 와 $x^2$\n\n> [!TIP]\n> 팁\n\n```ts\nconst a = 1;\n```", { resolvePage: () => null, resolveImage: () => null }, "");
const html = renderToStaticMarkup(renderDoc(doc, { prepared: await prepareRender(doc) }));
for (const expected of ["<h1", "<strong>굵게</strong>", 'href="https://example.com"', "callout-tip", 'class="katex"', "hljs-keyword"]) {
  if (!html.includes(expected)) {
    console.error(`dist 렌더 결과에 ${expected}가 없다:\n${html}`);
    process.exit(1);
  }
}
console.log("dist로 Markdown → HTML 렌더 OK");

// 클라이언트 컴포넌트의 "use client" 지시어는 컴파일 뒤에도 파일 맨 앞에 남아야 Next.js가 클라이언트 경계로 인식한다.
const client = fileURLToPath(new URL("../packages/editor-render/dist/client/MermaidDiagram.js", import.meta.url));
if (!/^\s*"use client";/.test(readFileSync(client, "utf8"))) {
  console.error("MermaidDiagram.js 맨 앞에 \"use client\" 지시어가 없다");
  process.exit(1);
}
// editor-react은 모듈 전체가 클라이언트 모듈이다: 진입점 맨 앞에 지시어가 남아야 한다.
const reactEntry = fileURLToPath(new URL("../packages/editor-react/dist/index.js", import.meta.url));
if (!/^\s*"use client";/.test(readFileSync(reactEntry, "utf8"))) {
  console.error("editor-react/dist/index.js 맨 앞에 \"use client\" 지시어가 없다");
  process.exit(1);
}
console.log('dist의 "use client" 지시어 OK');

// 편의 API: frontmatter·목차·HTML 문자열 진입점(react-dom/server를 쓰는 별도 파일)까지 dist로 한 번 돌려 본다.
const { renderMarkdownToHtml } = await import("@9um4/editor-render/html");
const result = await renderMarkdownToHtml("---\ntitle: 글\n---\n\n# 제목\n\n본문 \`코드\`");
if (result.frontmatter.title !== "글" || result.headings[0]?.id !== "제목" || !result.html.includes("<code>코드</code>")) {
  console.error("renderMarkdownToHtml 결과가 이상하다:", result);
  process.exit(1);
}
console.log("dist의 renderMarkdownToHtml OK");
