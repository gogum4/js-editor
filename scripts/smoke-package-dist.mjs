// 배포용으로 컴파일한 packages/editor-schema/dist를 앱 도구(Vite) 없이 순수 Node로 불러 본다.
// 확장자 누락(`./x`)이나 import 시점의 브라우저 API 사용이 있으면 여기서 깬다 — 블로그 서버(Next.js)가 겪을 문제다.
// 먼저 `pnpm --filter @9um4/editor-schema build`가 필요하다.
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = fileURLToPath(new URL("../packages/editor-schema/dist/", import.meta.url));
if (!existsSync(dist)) {
  console.error("dist가 없다. 먼저 `pnpm --filter @9um4/editor-schema build`를 실행한다.");
  process.exit(1);
}
const files = readdirSync(dist).filter((n) => n.endsWith(".js"));
for (const name of files) await import(pathToFileURL(dist + name).href);
console.log(`dist 모듈 ${files.length}개를 Node에서 불러왔다`);
