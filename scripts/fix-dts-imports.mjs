// 컴파일한 타입 선언(.d.ts)의 상대 import 확장자를 `.ts`/`.tsx` → `.js`로 바꾼다.
// `rewriteRelativeImportExtensions`는 JS 출력만 고치고 선언은 `./x.ts`를 그대로 남겨서, 소비자의 TypeScript가 타입을 못 찾을 수 있다.
// 사용: node scripts/fix-dts-imports.mjs <dist 폴더>
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "dist");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : name.endsWith(".d.ts") ? [path] : [];
  });
}

// `from "./x.ts"`, `import("./x.tsx")`, `export * from "../y.ts"`
const SPECIFIER = /((?:from\s*|import\s*\(\s*)["']\.{1,2}\/[^"']*?)\.tsx?(["'])/g;

let changed = 0;
for (const file of walk(root)) {
  const before = readFileSync(file, "utf8");
  const after = before.replace(SPECIFIER, "$1.js$2");
  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
  }
}
console.log(`${root}: 선언 파일 ${changed}개의 상대 import 확장자를 .js로 고쳤다`);
