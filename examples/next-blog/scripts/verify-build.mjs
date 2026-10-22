// `next build`가 만든 정적 HTML을 검사한다(docs/EDITOR-PACKAGE.md P4 완료 조건: 글 한 편을 SSG로 끝까지 렌더).
// 먼저 `pnpm build`가 필요하다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const app = join(process.cwd(), ".next/server/app");
const problems = [];

function read(rel) {
  const file = join(app, rel);
  if (!existsSync(file)) {
    problems.push(`${rel}가 없다 (빌드가 정적 페이지를 만들지 못했다)`);
    return "";
  }
  return readFileSync(file, "utf8");
}

function expectAll(name, html, patterns) {
  for (const [label, pattern] of patterns) {
    const ok = pattern instanceof RegExp ? pattern.test(html) : html.includes(pattern);
    if (!ok) problems.push(`${name}: ${label} — ${pattern}이(가) 없다`);
  }
}

function expectNone(name, html, patterns) {
  for (const [label, pattern] of patterns) {
    const found = pattern instanceof RegExp ? pattern.test(html) : html.includes(pattern);
    if (found) problems.push(`${name}: ${label} — ${pattern}이(가) 있으면 안 된다`);
  }
}

const hello = read("posts/hello.html");
expectAll("hello", hello, [
  ["제목 앵커", '<h2 id="목록과-할-일">'],
  ["목차", 'class="toc"'],
  ["굵게", "<strong>같은 규칙</strong>"],
  ["할 일 목록", 'type="checkbox"'],
  ["표", "<table>"],
  ["콜아웃", "callout-tip"],
  ["경고 콜아웃", "callout-warning"],
  ["토글(<details>)", '<details class="toggle">'],
  ["각주", 'id="fn-1"'],
  ["로컬 이미지", 'src="/images/sample.svg"'],
  ["원격 이미지", 'src="https://example.com/remote.png"'],
  ["위키 링크 → 다른 글", 'href="/posts/math-and-code"'],
  ["링크 rel", 'rel="noopener noreferrer nofollow"'],
]);

const math = read("posts/math-and-code.html");
expectAll("math-and-code", math, [
  ["인라인 수식(KaTeX)", 'class="katex"'],
  ["블록 수식(KaTeX)", "katex-display"],
  ["접근성 MathML", 'encoding="application/x-tex"'],
  ["코드 강조(ts)", "hljs-keyword"],
  ["코드 언어", "language-ts"],
  ["코드 강조(python)", "language-python"],
  ["위키 링크 → 다른 글", 'href="/posts/hello"'],
]);

const diagrams = read("posts/diagrams.html");
expectAll("diagrams", diagrams, [["mermaid 소스(서버 출력)", /<pre class="mermaid">graph TD/]]);
// 서버가 그린 다이어그램 SVG가 아니어야 한다(브라우저가 그린다).
expectNone("diagrams", diagrams, [["서버가 mermaid SVG를 만들었다", 'class="mermaid-diagram"']]);

const index = read("index.html");
expectAll("index", index, [
  ["글 목록", 'href="/posts/hello"'],
  ["글 목록", 'href="/posts/math-and-code"'],
  ["글 목록", 'href="/posts/diagrams"'],
]);

// 안전: 글 안의 내용이 스크립트로 새지 않았는지(우리가 넣은 것 말고 인라인 <script>에 글 내용이 없어야 한다).
for (const [name, html] of [["hello", hello], ["math-and-code", math], ["diagrams", diagrams]]) {
  expectNone(name, html, [["javascript: 링크", /href="javascript:/i]]);
}

// 스타일: 렌더러 CSS와 KaTeX 글꼴 규칙이 번들에 들어갔는지.
function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? cssFiles(path) : name.endsWith(".css") ? [path] : [];
  });
}
const staticDir = join(process.cwd(), ".next/static");
const css = existsSync(staticDir) ? cssFiles(staticDir).map((f) => readFileSync(f, "utf8")).join("\n") : "";
for (const [label, pattern] of [
  ["렌더러 기본 스타일(.md-doc)", ".md-doc"],
  ["콜아웃 스타일", ".callout-tip"],
  ["코드 강조 색", ".hljs-keyword"],
  ["KaTeX 스타일", ".katex"],
]) {
  if (!css.includes(pattern)) problems.push(`번들 CSS에 ${label}가 없다 (${pattern})`);
}

if (problems.length > 0) {
  console.error(`샘플 앱 빌드 검사 실패 ${problems.length}건:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("샘플 앱 빌드 검사 OK — 정적 HTML 4개(목록 + 글 3편)와 번들 CSS 확인");
