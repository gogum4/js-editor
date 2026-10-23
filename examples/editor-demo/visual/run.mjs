// 실제 브라우저(Chromium) 시각·동작 회귀 시험 (docs/EDITOR-PACKAGE.md P5-0b).
//
//   pnpm --filter editor-demo visual            장면의 계산된 스타일을 기준과 비교하고, 동작 시험을 돌린다
//   pnpm --filter editor-demo visual:update     기준(visual/baseline/computed-styles.json)을 다시 만든다
//   ... --screenshots <이름>                    장면별 스크린샷을 .visual/<이름>/에 저장한다(커밋하지 않는다; 같은 머신의 전후 비교용)
//   ... --diff <이름A> <이름B>                  저장해 둔 두 스크린샷 묶음을 픽셀 단위로 비교한다
//   ... --only styles|behaviors                 한쪽만 돌린다
//
// 브라우저: `npx playwright install chromium-headless-shell`(CI는 --with-deps). 시스템 라이브러리가 없고 root가 없으면 PLAYWRIGHT_BROWSERS_PATH와
// LD_LIBRARY_PATH로 사용자 폴더의 것을 가리킨다(README 참고).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { build, preview } from "vite";

import { BEHAVIORS } from "./behaviors.mjs";
import { diffDumps, dumpSubtree, INHERITED, PROPS } from "./capture.mjs";
import { SCENES, waitReady } from "./scenes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
// --plain: Tailwind 없이 패키지 스타일만 쓰는 페이지(plain.html)를 본다. 기준 파일도 따로다(Tailwind의 초기화가 없어 값이 다르다).
const plain = process.argv.includes("--plain");
const baselinePath = join(here, "baseline", plain ? "computed-styles-plain.json" : "computed-styles.json");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => args[args.indexOf(name) + 1];
const only = flag("--only") ? valueOf("--only") : null;

async function main() {
  if (flag("--diff")) return diffScreenshots(valueOf("--diff"), args[args.indexOf("--diff") + 2]);

  await build({ root, logLevel: "warn" });
  const server = await preview({ root, logLevel: "error", preview: { port: 0, strictPort: false, host: "127.0.0.1" } });
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch();
  const failures = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 1000 },
      locale: "ko-KR",
      colorScheme: "light",
      reducedMotion: "reduce",
      deviceScaleFactor: 1,
    });
    context.setDefaultTimeout(8_000); // 실패는 빨리 알린다

    /** 새 페이지를 열고 콘솔 오류를 모은다. */
    const openPage = async () => {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        const text = message.text();
        if (message.type() === "error" && !/Failed to load resource/.test(text)) errors.push(`console.error: ${text}`);
      });
      const open = async ({ collab = false, raw = false, ref = false } = {}) => {
        const query = [collab ? "collab=1" : "", raw ? "raw=1" : "", ref ? "ref=1" : ""].filter(Boolean).join("&");
        await page.goto(url + (plain ? "plain.html" : "") + (query ? `?${query}` : ""));
        await waitReady(page);
      };
      const dump = (selector) => page.evaluate(dumpSubtree, { selector, props: PROPS, inherited: INHERITED });
      return { page, errors, open, dump };
    };

    // ── 장면: 계산된 스타일
    if (only !== "behaviors") {
      const current = {};
      const shotLabel = flag("--screenshots") ? valueOf("--screenshots") : null;
      if (shotLabel) mkdirSync(join(root, ".visual", shotLabel), { recursive: true });
      for (const scene of SCENES) {
        const ctx = await openPage();
        try {
          await ctx.open();
          await scene.setup?.(ctx.page);
          await ctx.page.waitForTimeout(200);
          const combined = {};
          for (const selector of scene.roots) {
            const dumped = await ctx.dump(selector);
            if (dumped === null) throw new Error(`장면 '${scene.name}': ${selector}를 찾지 못했다`);
            for (const [path, value] of Object.entries(dumped)) combined[`${selector} › ${path}`] = value;
          }
          current[scene.name] = combined;
          if (shotLabel) await ctx.page.screenshot({ path: join(root, ".visual", shotLabel, `${scene.name}.png`), fullPage: true });
          if (ctx.errors.length) failures.push(`장면 '${scene.name}': 콘솔 오류 ${ctx.errors.join(" | ")}`);
          console.log(`장면 ${scene.name.padEnd(22)} 요소 ${Object.keys(combined).length}개`);
        } catch (error) {
          failures.push(`장면 '${scene.name}': ${error.message}`);
        } finally {
          await ctx.page.close();
        }
      }
      if (flag("--update")) {
        mkdirSync(dirname(baselinePath), { recursive: true });
        writeFileSync(baselinePath, JSON.stringify(current) + "\n");
        console.log(`기준을 썼다: ${baselinePath} (장면 ${Object.keys(current).length}개)`);
      } else if (!existsSync(baselinePath)) {
        failures.push("기준 파일이 없다. `visual:update`로 만든다.");
      } else {
        const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
        const diff = diffDumps(baseline, current);
        if (diff.count > 0) failures.push(`계산된 스타일이 기준과 ${diff.count}곳 다르다:\n    ${diff.shown.join("\n    ")}${diff.hidden ? `\n    … 외 ${diff.hidden}곳` : ""}`);
        else console.log("계산된 스타일: 기준과 같다");
      }
    }

    // ── 동작
    if (only !== "styles") {
      for (const behavior of BEHAVIORS) {
        const ctx = await openPage();
        const started = Date.now();
        try {
          await behavior.run(ctx);
          if (ctx.errors.length) throw new Error(`콘솔 오류 ${ctx.errors.join(" | ")}`);
          console.log(`  ✓ ${behavior.name} (${Date.now() - started}ms)`);
        } catch (error) {
          console.log(`  ✗ ${behavior.name}`);
          failures.push(`동작 '${behavior.name}': ${error.message}`);
        } finally {
          await ctx.page.close();
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (failures.length > 0) {
    console.error(`\n실패 ${failures.length}건:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("\n시각·동작 시험 OK");
}

async function diffScreenshots(a, b) {
  const { PNG } = await import("pngjs");
  const { default: pixelmatch } = await import("pixelmatch");
  const dirA = join(root, ".visual", a);
  const dirB = join(root, ".visual", b);
  const out = join(root, ".visual", `diff-${a}-${b}`);
  mkdirSync(out, { recursive: true });
  let bad = 0;
  for (const file of readdirSync(dirA).filter((f) => f.endsWith(".png"))) {
    if (!existsSync(join(dirB, file))) {
      console.log(`  ✗ ${file}: ${b}에 없음`);
      bad += 1;
      continue;
    }
    const imgA = PNG.sync.read(readFileSync(join(dirA, file)));
    const imgB = PNG.sync.read(readFileSync(join(dirB, file)));
    if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
      console.log(`  ✗ ${file}: 크기가 다름 ${imgA.width}x${imgA.height} → ${imgB.width}x${imgB.height}`);
      bad += 1;
      continue;
    }
    const diff = new PNG({ width: imgA.width, height: imgA.height });
    const count = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0.1 });
    if (count > 0) {
      writeFileSync(join(out, file), PNG.sync.write(diff));
      console.log(`  ✗ ${file}: ${count}픽셀 다름 → ${join(out, file)}`);
      bad += 1;
    } else console.log(`  ✓ ${file}`);
  }
  if (bad > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
