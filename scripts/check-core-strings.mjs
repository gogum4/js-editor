// core 후보 에디터 코드에 화면에 보이는 한글이 하드코딩돼 있지 않은지 검사한다(docs/EDITOR-PACKAGE.md P2-7).
// 화면 글은 `packages/editor-core/src/strings/`의 사전(ko·en)에 둔다. 검사에서 빼는 것: 주석, 개발자용 콘솔 출력(console.*),
// 사전 폴더(strings/), 시험 파일, 한국어가 데이터인 파일(DATA_FILES). `packages/editor-core/src/`만 본다(앱 계층은 패키지 밖이다).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../packages/editor-core/src", import.meta.url));
const SKIP_DIRS = ["strings/"];
// 한국어가 데이터인 파일: 슬래시 항목의 기본(한국어) 글, LaTeX 명령 설명·검색어 표, 한글 입력 판별 정규식. 다른 언어는 사전으로 덮는다(슬래시) 또는 아직 없다(LaTeX 설명).
const DATA_FILES = new Set(["lib/slashItems.ts", "lib/latexCommands.ts", "lib/latexAssist.ts"]);
const isApp = (rel) => DATA_FILES.has(rel) || SKIP_DIRS.some((dir) => rel.startsWith(dir));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const found = [];
for (const file of walk(root)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (isApp(rel)) continue;
  // 블록 주석은 줄 수를 지키며 비운다.
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  text.split("\n").forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    if (/console\.(warn|error|info|log)/.test(code)) return;
    if (/[가-힣]/.test(code)) found.push(`${rel}:${i + 1}: ${code.trim().slice(0, 80)}`);
  });
}

if (found.length > 0) {
  console.error(`화면 글 한글 하드코딩 ${found.length}건 — packages/editor-core/src/strings/ 사전으로 옮긴다:\n  ${found.join("\n  ")}`);
  process.exit(1);
}
console.log("화면 글 하드코딩 OK");
