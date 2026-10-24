// 배포될 모양(pnpm pack = publishConfig 적용)을 검사한다: exports가 TS 소스(src)가 아니라 dist를 가리키고, 가리키는 파일이 tarball에 모두 있으며,
// 의존성에 `workspace:`가 남아 있지 않은지. 먼저 `pnpm build:packages`가 필요하다.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PACKAGES = ["editor-schema", "editor-markdown", "editor-render", "editor-core", "editor-react"];
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const tmp = mkdtempSync(join(tmpdir(), "pack-check-"));
const problems = [];

/** exports 값에서 파일 경로를 모두 모은다(조건 객체도 풀어서). */
function targets(value) {
  if (typeof value === "string") return [value];
  return Object.values(value ?? {}).flatMap(targets);
}

try {
  for (const name of PACKAGES) {
    const dest = join(tmp, name);
    execFileSync(pnpm, ["--filter", `@9um4/${name}`, "pack", "--pack-destination", dest], { stdio: "pipe", shell: process.platform === "win32" });
    const tgz = execFileSync("node", ["-e", `console.log(require("fs").readdirSync(${JSON.stringify(dest)}).find((f) => f.endsWith(".tgz")))`], { encoding: "utf8" }).trim();
    execFileSync("tar", ["-xzf", join(dest, tgz), "-C", dest]);
    const root = join(dest, "package");
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const files = execFileSync("tar", ["-tzf", join(dest, tgz)], { encoding: "utf8" }).split("\n").map((f) => f.replace(/^package\//, ""));
    for (const target of targets(manifest.exports)) {
      const path = target.replace(/^\.\//, "");
      if (path.startsWith("src/")) problems.push(`${name}: exports가 소스를 가리킨다: ${target}`);
      else if (path.includes("*")) continue; // 패턴(예: ./*)은 파일 하나가 아니다
      else if (!files.includes(path)) problems.push(`${name}: exports가 가리키는 파일이 tarball에 없다: ${target}`);
    }
    // 선언의 상대 import는 표준 모양인 `.js`로 쓴다(fix-dts-imports.mjs가 고친다; 지금 TypeScript는 `.ts`도 해석하지만 JS 출력과 맞춘다).
    for (const file of files.filter((f) => f.endsWith(".d.ts"))) {
      const text = readFileSync(join(root, file), "utf8");
      if (/(?:from\s*|import\s*\(\s*)["']\.{1,2}\/[^"']*\.tsx?["']/.test(text)) problems.push(`${name}: ${file}의 상대 import가 .ts/.tsx로 끝난다`);
    }
    for (const [dep, version] of Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      if (String(version).startsWith("workspace:")) problems.push(`${name}: 의존성 ${dep}에 ${version}이 남아 있다`);
    }
    console.log(`${name}: 배포 모양 OK (파일 ${files.filter(Boolean).length}개)`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (problems.length > 0) {
  console.error(`배포 모양 문제 ${problems.length}건:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
