// 컴파일한 dist끼리의 import를 검증하는 Node 로더 훅.
// 개발 중 워크스페이스의 `exports`는 TS 소스(`./src/*.ts`)를 가리키지만, 배포된 패키지는 dist를 가리킨다(publishConfig).
// 이 훅은 `@9um4-utils/editor-*` import를 dist로 돌려, 배포된 모양에서 확장자 누락·잘못된 경로가 없는지 순수 Node로 확인하게 한다.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../packages/", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  const match = /^@9um4-utils\/(editor-[a-z]+)(?:\/(.+))?$/.exec(specifier);
  if (match) {
    const [, pkg, sub] = match;
    // 하위 경로는 `dist/<sub>.js`이거나(schema) 폴더의 index(core의 `./testing`)다.
    const candidates = [`${root}${pkg}/dist/${sub ?? "index"}.js`, `${root}${pkg}/dist/${sub}/index.js`];
    const file = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
    if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
    throw new Error(`dist가 없다: ${specifier} → ${file} (먼저 빌드한다)`);
  }
  return nextResolve(specifier, context);
}
