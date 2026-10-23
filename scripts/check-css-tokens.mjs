// 에디터 CSS의 색이 모두 다크 모드 토큰을 거치는지 검사한다(docs/EDITOR-PACKAGE.md P7-5).
// 규칙: `packages/editor-react/styles/{editor,ui}.css`의 색은 `var(--md-c-<이름>, <밝은 값>)` 꼴이어야 하고(날것의 #hex·oklch() 금지),
// 쓰인 토큰은 모두 `dark.css`에 어두운 값이 있어야 하며, 토큰 이름은 밝은 값에서 만든 것과 같아야 한다.
// 새 색을 쓸 때: 위 꼴로 쓰고 dark.css에 짝을 더한다(같은 값이 이미 있으면 같은 토큰을 쓴다).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(`${root}packages/editor-react/styles/${file}`, "utf8");
const dark = read("dark.css");
// 검은색 배경막(#000)은 어두운 모드에서도 같아서 토큰을 두지 않는다.
const EXEMPT = new Set(["--md-c-000"]);
const problems = [];
const used = new Set();

const nameOf = (literal) => "--md-c-" + literal.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

for (const file of ["editor.css", "ui.css"]) {
  let source = read(file);
  // 마메이드 크게 보기(ui.css 끝)는 어두운 모드에서도 같은 색이라 토큰을 거치지 않는다.
  const exempt = source.indexOf("/* ---------- 마메이드 크게 보기 ---------- */");
  if (exempt >= 0) source = source.slice(0, exempt);
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // var(--md-c-x, 값) 쌍을 먼저 확인하고 지운 뒤, 남은 색 글자를 찾는다.
  const rest = css.replace(/var\((--md-c-[a-z0-9-]+),\s*(#[0-9a-fA-F]{3,8}\b|oklch\([^)]*\))\)/g, (_all, name, literal) => {
    used.add(name);
    if (nameOf(literal) !== name) problems.push(`${file}: ${name}의 밝은 값이 ${literal}이라 이름이 ${nameOf(literal)}이어야 한다`);
    return "";
  });
  for (const m of rest.matchAll(/#[0-9a-fA-F]{3,8}\b|oklch\([^)]*\)/g)) problems.push(`${file}: 토큰을 거치지 않은 색 ${m[0]}`);
}
for (const name of used) if (!EXEMPT.has(name) && !dark.includes(`${name}:`)) problems.push(`dark.css에 ${name}이 없다`);
for (const m of dark.matchAll(/(--md-c-[a-z0-9-]+):/g)) if (!used.has(m[1])) problems.push(`dark.css의 ${m[1]}는 어디서도 쓰이지 않는다`);

if (problems.length > 0) {
  console.error(`CSS 색 토큰 위반 ${problems.length}건:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`CSS 색 토큰 OK — ${used.size}개 모두 다크 값이 있다`);
