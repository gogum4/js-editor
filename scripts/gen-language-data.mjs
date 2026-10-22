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

// 구문 강조용 지연 로더 표. `import.meta.glob`(Vite 전용)을 쓰지 않고 언어마다 명시적인 동적 import를 둔다 —
// Vite·Next.js·Node 어디서나 같은 방식으로 언어별 조각이 나뉜다(docs/EDITOR-PACKAGE.md P2-4).
const loaderLines = names.map((name) => `  ${JSON.stringify(name)}: () => import("highlight.js/lib/languages/${name}"),`).join("\n");
const loaderOutput = `// 이 파일은 \`pnpm gen:languages\`(scripts/gen-language-data.mjs)가 만든다. 직접 고치지 않는다.
// highlight.js ${require("highlight.js/package.json").version} 기준 ${names.length}개 언어.
import type { LanguageFn } from "highlight.js";

/** 언어 정식 이름 → 그 언어 정의를 불러오는 함수. 처음 쓸 때만 불러온다. */
export const LANGUAGE_LOADERS: Readonly<Record<string, () => Promise<{ default: LanguageFn }>>> = {
${loaderLines}
};
`;
// 같은 표를 에디터 코어(브라우저)와 읽기 전용 렌더러(서버)가 각자 가진다 — 서로 import하지 않는 패키지다.
for (const target of ["../packages/editor-core/src/highlight/languageLoaders.generated.ts", "../packages/editor-render/src/languageLoaders.generated.ts"]) {
  const file = fileURLToPath(new URL(target, import.meta.url));
  writeFileSync(file, loaderOutput);
  console.log(`로더 ${names.length}개 → ${path.relative(process.cwd(), file)}`);
}
