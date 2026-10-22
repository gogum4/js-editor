// packages/*의 import 방향을 검사한다(docs/EDITOR-PACKAGE.md §8 P1).
// editor-schema는 같은 패키지 안의 상대 경로와 `node:` 내장만 import할 수 있다 —
// 앱(`src/`)·서버·TipTap·React 등을 끌어오면 Node.js(블로그 서버)에서 쓸 수 없게 된다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ALLOWED_PACKAGES = { "editor-schema": [] };

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
const violations = [];

for (const [pkg, allowed] of Object.entries(ALLOWED_PACKAGES)) {
  const pkgDir = join(root, "packages", pkg);
  for (const file of walk(join(pkgDir, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(specifier)) {
      const spec = m[1];
      if (spec.startsWith("node:")) continue;
      if (spec.startsWith(".")) {
        const target = resolve(file, "..", spec);
        if (!target.startsWith(pkgDir)) violations.push(`${relative(root, file)}: 패키지 밖 상대 경로 ${spec}`);
        continue;
      }
      if (/\.test\.tsx?$/.test(file) && spec === "vitest") continue;
      if (allowed.some((a) => spec === a || spec.startsWith(`${a}/`))) continue;
      violations.push(`${relative(root, file)}: 허용되지 않은 import ${spec}`);
    }
  }
}

if (violations.length > 0) {
  console.error(`패키지 의존 방향 위반 ${violations.length}건:\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
console.log("패키지 의존 방향 OK");
