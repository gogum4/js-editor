// CSS를 다른 파일로 옮겨도 규칙이 하나도 사라지지 않았는지 확인한다(docs/EDITOR-PACKAGE.md P5-0, P5-4).
// 규칙을 (선택자 하나, 선언 묶음) 쌍으로 풀어 집합으로 비교한다 — 선택자를 쉼표로 묶거나 파일을 나눠도 같다.
// 기준 파일(`scripts/css-rules-baseline.json`)은 P5-7 끝의 CSS 파일들에서 만들었다(옮기기 전 `src/index.css`의 규칙을 모두 포함하고, 5-3·5-7에서 의도해서 더하거나 바꾼 것을 반영). 규칙을 일부러 바꾸면 `--write`로 다시 만들고 diff를 검토한다.
// 이 검사는 "사라진 규칙"만 잡는다. 규칙 **순서·우선순위**가 달라지는 것은 못 잡으므로 옮긴 뒤에는 화면 확인이 필요하다.
//
// 사용:  node scripts/check-css-rules.mjs            기준과 비교
//        node scripts/check-css-rules.mjs --write    기준 파일을 현재 `BASELINE_SOURCE`에서 다시 만든다
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = `${root}scripts/css-rules-baseline.json`;

/** 기준을 만드는 원본. */
const BASELINE_SOURCE = ["src/index.css", "packages/editor-react/styles/ui.css", "packages/editor-react/styles/editor.css"];

/**
 * 지금 규칙이 들어 있는 파일들. 옮긴 뒤에는 새 파일을 여기에 더하고, 선택자 이름을 바꿨다면 `rewrite`로 옛 이름을 맞춘다
 * (예: `[".md-editor", ".page-editor"]`는 새 파일의 `.md-editor`를 기준의 `.page-editor`로 보고 비교한다).
 */
const CURRENT_SOURCES = BASELINE_SOURCE.map((file) => ({ file, rewrite: [] }));

/** 주석을 지운다. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** 괄호·따옴표 밖의 `;`로 선언을 나눈다(`url(data:image/svg+xml;base64,…)` 안의 `;`는 구분자가 아니다). */
function splitDeclarations(body) {
  const out = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const ch of body) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === "(") {
      depth += 1;
      current += ch;
    } else if (ch === ")") {
      depth -= 1;
      current += ch;
    } else if (ch === ";" && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

const squash = (text) => text.replace(/\s+/g, " ").trim();

/** CSS 텍스트 → "선택자 | 선언들(속성 이름순)" 문자열 목록. 한 줄짜리 `@import` 같은 규칙은 그대로 한 항목이다. */
export function ruleSet(css, rewrite = []) {
  const text = stripComments(css);
  const rules = [];
  let rest = text;
  while (rest.trim() !== "") {
    const open = rest.indexOf("{");
    const semi = rest.indexOf(";");
    if (open === -1 || (semi !== -1 && semi < open)) {
      // `@import "…";` 같은 블록 없는 규칙
      rules.push(`at | ${squash(rest.slice(0, semi === -1 ? rest.length : semi))}`);
      rest = semi === -1 ? "" : rest.slice(semi + 1);
      continue;
    }
    const selectors = rest.slice(0, open);
    let depth = 1;
    let i = open + 1;
    while (i < rest.length && depth > 0) {
      if (rest[i] === "{") depth += 1;
      else if (rest[i] === "}") depth -= 1;
      i += 1;
    }
    const body = rest.slice(open + 1, i - 1);
    rest = rest.slice(i);
    if (body.includes("{")) {
      // 중첩(@media 등)은 안쪽 규칙을 앞에 감싼 이름과 함께 푼다.
      for (const inner of ruleSet(body, rewrite)) rules.push(`${squash(selectors)} :: ${inner}`);
      continue;
    }
    const declarations = splitDeclarations(body)
      .map(squash)
      .filter(Boolean)
      .map((d) => d.replace(/\s*:\s*/, ": "))
      .sort()
      .join("; ");
    for (const raw of selectors.split(",")) {
      let selector = squash(raw);
      for (const [from, to] of rewrite) selector = selector.split(from).join(to);
      if (selector) rules.push(`${selector} | ${declarations}`);
    }
  }
  return rules;
}

function count(list) {
  const map = new Map();
  for (const item of list) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
}

const read = (file) => readFileSync(`${root}${file}`, "utf8");

if (process.argv.includes("--write")) {
  const rules = BASELINE_SOURCE.flatMap((file) => ruleSet(read(file)));
  writeFileSync(baselinePath, JSON.stringify(rules.sort(), null, 1) + "\n");
  console.log(`기준 규칙 ${rules.length}개를 썼다 (${BASELINE_SOURCE.join(", ")})`);
} else {
  const baseline = count(JSON.parse(readFileSync(baselinePath, "utf8")));
  const current = count(CURRENT_SOURCES.flatMap(({ file, rewrite }) => ruleSet(read(file), rewrite)));
  const missing = [];
  for (const [rule, n] of baseline) if ((current.get(rule) ?? 0) < n) missing.push(rule);
  let added = 0;
  for (const [rule, n] of current) if (!baseline.has(rule)) added += n;
  if (missing.length > 0) {
    console.error(`사라졌거나 바뀐 CSS 규칙 ${missing.length}개:\n  ${missing.slice(0, 20).join("\n  ")}${missing.length > 20 ? `\n  … 외 ${missing.length - 20}개` : ""}`);
    process.exit(1);
  }
  console.log(`CSS 규칙 OK — 기준 ${baseline.size}개 모두 있음 (새로 생긴 규칙 ${added}개)`);
}
