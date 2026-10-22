// highlight.js의 언어 모듈에서 언어 이름과 별칭을 뽑아 `packages/editor-schema/src/languageData.generated.ts`를 만든다.
// 별칭(ts, py, sh, yml …)은 각 언어 모듈이 스스로 정의하고 있어서 손으로 표를 만들지 않고 그대로 가져온다.
// highlight.js를 올린 뒤에는 `pnpm gen:languages`를 다시 실행하고 결과를 커밋한다.
import { readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const hljs = require("highlight.js/lib/core");
const languagesDir = path.dirname(require.resolve("highlight.js/lib/languages/javascript"));

// lib/languages에는 `x.js`와 함께 ESM 연결용 `x.js.js` 조각도 들어 있어서 뺀다.
const names = readdirSync(languagesDir)
  .filter((file) => file.endsWith(".js") && !file.endsWith(".js.js") && !file.endsWith(".min.js"))
  .map((file) => file.slice(0, -3))
  .sort();

const aliases = new Map();
const conflicts = [];

for (const name of names) {
  const languageFn = require(path.join(languagesDir, `${name}.js`));
  const definition = languageFn(hljs);
  for (const alias of definition.aliases ?? []) {
    const key = alias.toLowerCase();
    if (names.includes(key)) continue; // 다른 언어의 정식 이름과 겹치면 정식 이름이 우선이다
    if (aliases.has(key) && aliases.get(key) !== name) {
      conflicts.push(`${key}: ${aliases.get(key)} / ${name} (앞의 것을 유지)`);
      continue;
    }
    aliases.set(key, name);
  }
}

const sortedAliases = [...aliases.entries()].sort(([a], [b]) => a.localeCompare(b));
const output = `// 이 파일은 \`pnpm gen:languages\`(scripts/gen-language-data.mjs)가 만든다. 직접 고치지 않는다.
// highlight.js ${require("highlight.js/package.json").version} 기준 ${names.length}개 언어, 별칭 ${sortedAliases.length}개.

/** highlight.js가 가진 언어의 정식 이름. */
export const LANGUAGE_NAMES: readonly string[] = ${JSON.stringify(names)};

/** 별칭 → 정식 이름 (예: ts → typescript). */
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = ${JSON.stringify(
  Object.fromEntries(sortedAliases),
  null,
  2,
)};
`;

const target = fileURLToPath(new URL("../packages/editor-schema/src/languageData.generated.ts", import.meta.url));
writeFileSync(target, output);
console.log(`언어 ${names.length}개, 별칭 ${sortedAliases.length}개 → ${path.relative(process.cwd(), target)}`);
if (conflicts.length > 0) console.log(`별칭 충돌 ${conflicts.length}건:\n  ${conflicts.join("\n  ")}`);
