// packages/*의 import 방향을 검사한다(docs/EDITOR-PACKAGE.md §8 P1).
// editor-schema는 같은 패키지 안의 상대 경로와 `node:` 내장만 import할 수 있다 —
// 앱(`src/`)·서버·TipTap·React 등을 끌어오면 Node.js(블로그 서버)에서 쓸 수 없게 된다.
// 허용 목록에 있는 외부 패키지도 그 패키지의 package.json에 선언돼 있어야 한다(선언 없이 쓰면 소비자가 설치하지 못한다).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ALLOWED_PACKAGES = {
  "editor-schema": [],
  // Markdown 변환: schema와 marked만(순수 함수라 TipTap·DOM이 필요 없다).
  "editor-markdown": ["@9um4/editor-schema", "marked"],
  // 에디터 코어: TipTap·Yjs·React 계열과 schema만. 앱(`src/`)·Tauri·서버는 안 된다.
  "editor-core": [
    "@9um4/editor-schema", "@tiptap/core", "@tiptap/extension-code-block", "@tiptap/extension-collaboration", "@tiptap/extension-list",
    "@tiptap/extension-table", "@tiptap/extensions", "@tiptap/pm", "@tiptap/react", "@tiptap/starter-kit", "@tiptap/suggestion",
    "@tiptap/y-tiptap", "highlight.js", "katex", "lowlight", "mermaid", "react", "react-dom", "yjs", "zustand",
  ],
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"'\n]+)["']/g;
const violations = [];

for (const [pkg, allowed] of Object.entries(ALLOWED_PACKAGES)) {
  const pkgDir = join(root, "packages", pkg);
  const manifest = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
  for (const a of allowed) if (!declared.has(a)) violations.push(`packages/${pkg}/package.json: 허용한 ${a}가 dependencies에 없다`);
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
      if (/\.test\.tsx?$/.test(file) && (spec === "vitest" || spec.startsWith("highlight.js/"))) continue;
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
