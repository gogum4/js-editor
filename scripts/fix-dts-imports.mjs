// 컴파일한 dist의 상대 import를 배포 모양(Node ESM이 그대로 읽는 `.js`)으로 맞춘다.
//  ① 선언(.d.ts)의 `./x.ts`/`./x.tsx` → `./x.js`. `rewriteRelativeImportExtensions`는 JS 출력만 고치고 선언은 `./x.ts`를 그대로 남긴다.
//     TypeScript 6은 `./x.ts`도 해석해서 (확인함: 번들러·nodenext 해석 모두) 지금 소비자에게 문제를 일으키지는 않지만, 표준 모양과 JS 출력에 맞춰 둔다.
//  ② 확장자 없는 상대 import(`./x`, `./dir`)에 `.js`(또는 `/index.js`)를 붙인다 — JS와 선언 모두. 소스가 확장자 없이 쓰인 패키지(core·react)는
//     tsc가 그대로 내보내서 순수 Node(서버 렌더·도구)에서는 불러지지 않는다. 번들러는 문제없지만 `check:dist`의 Node 스모크가 이것을 잡는다.
// 사용: node scripts/fix-dts-imports.mjs <dist 폴더>
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(d\.ts|js)$/.test(name) ? [path] : [];
  });
}

// `from "./x.ts"`, `import("./x.tsx")`, `export * from "../y.ts"` (선언만)
const TS_SPECIFIER = /((?:from\s*|import\s*\(\s*)["']\.{1,2}\/[^"']*?)\.tsx?(["'])/g;
// 확장자 없는 것: `from "./x"`, `import("./x")`, `import "./x"`
const BARE_SPECIFIER = /((?:from\s*|import\s*\(\s*|import\s+)["'])(\.{1,2}\/[^"'\n]+?)(["'])/g;

/** 가리키는 파일이 있으면 맞는 모양으로, 없으면(이미 확장자가 있거나 바깥 것이면) 그대로 둔다. */
function withExtension(file, spec) {
  if (/\.(js|mjs|cjs|json|css|svg)$/.test(spec)) return spec;
  const base = resolve(dirname(file), spec);
  if (existsSync(`${base}.js`)) return `${spec}.js`;
  if (existsSync(join(base, "index.js"))) return `${spec}/index.js`;
  return spec;
}

let tsFixed = 0;
let bareFixed = 0;
for (const file of walk(root)) {
  const before = readFileSync(file, "utf8");
  let after = file.endsWith(".d.ts") ? before.replace(TS_SPECIFIER, "$1.js$2") : before;
  if (after !== before) tsFixed += 1;
  const bare = after.replace(BARE_SPECIFIER, (match, head, spec, tail) => `${head}${withExtension(file, spec)}${tail}`);
  if (bare !== after) {
    bareFixed += 1;
    after = bare;
  }
  if (after !== before) writeFileSync(file, after);
}
console.log(`${root}: 선언 ${tsFixed}개의 .ts 확장자를 .js로, 파일 ${bareFixed}개의 확장자 없는 import를 고쳤다`);
