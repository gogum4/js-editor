// core 후보 에디터 코드에 화면에 보이는 한글이 하드코딩돼 있지 않은지 검사한다(docs/EDITOR-PACKAGE.md P2-7).
// 화면 글은 `src/features/editor/strings/`의 사전(ko·en)에 둔다. 검사에서 빼는 것: 주석, 개발자용 콘솔 출력(console.*),
// 앱 계층(위키·저장·동기화), 사전 폴더, 시험 파일. 슬래시 항목의 기본(한국어) 글은 `src/lib/slashItems.ts`에 있어 여기 대상이 아니다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/features/editor", import.meta.url));
const APP_LAYER = [
  "usePageDoc.ts", "docSaver.ts", "docJournal.ts", "journalRecovery.ts", "docAccess.ts", "docLocks.ts", "openDocs.ts",
  "saverRegistry.ts", "snapshotRegistry.ts", "PageEditor.tsx", "PageBody.tsx", "SaveIndicator.tsx", "currentEditor.ts",
  "blockIdMigration.ts", "blockIndexBackfill.ts", "unknownNodes.ts", "ydocToJson.ts", "editorFocus.ts",
  "pagelink/", "pageblock/", "extensions/BlockLinkCopy.ts", "appPorts.ts", "editorExtensions.ts", "strings/",
];
const isApp = (rel) => APP_LAYER.some((a) => (a.endsWith("/") ? rel.startsWith(a) : rel === a));

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
  console.error(`화면 글 한글 하드코딩 ${found.length}건 — src/features/editor/strings/ 사전으로 옮긴다:\n  ${found.join("\n  ")}`);
  process.exit(1);
}
console.log("화면 글 하드코딩 OK");
