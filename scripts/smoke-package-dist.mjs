// 배포용으로 컴파일한 packages/*/dist를 앱 도구(Vite) 없이 순수 Node로 불러 본다.
// 확장자 누락(`./x`)이나 import 시점의 브라우저 API 사용이 있으면 여기서 깬다 — 블로그 서버(Next.js)가 겪을 문제다.
// `@9um4/editor-*` import는 dist로 돌려서(scripts/dist-resolve-hooks.mjs) 배포된 모양 그대로 검증한다.
// 먼저 `pnpm build:packages`가 필요하다.
import { existsSync, readdirSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

register("./dist-resolve-hooks.mjs", import.meta.url);

const PACKAGES = ["editor-schema", "editor-markdown", "editor-render"];
let total = 0;
for (const name of PACKAGES) {
  const dist = fileURLToPath(new URL(`../packages/${name}/dist/`, import.meta.url));
  if (!existsSync(dist)) {
    console.error(`${name}/dist가 없다. 먼저 \`pnpm build:packages\`를 실행한다.`);
    process.exit(1);
  }
  const files = readdirSync(dist).filter((n) => n.endsWith(".js"));
  for (const file of files) await import(pathToFileURL(dist + file).href);
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
