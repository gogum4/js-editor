// 에디터 번들(정적 빌드)을 iframe 호스트 흉내 페이지에 띄우고 메시지 규약을 실제 Chromium에서 확인한다(docs/EDITOR-EMBED.md).
// 사용: pnpm --filter @gogum4/editor-embed build && pnpm --filter @gogum4/editor-embed e2e   (브라우저 준비는 examples/editor-demo/README.md와 같다)
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("dist가 없다. 먼저 `pnpm --filter @gogum4/editor-embed build`");
  process.exit(1);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = path === "/host.html" ? join(here, "host.html") : path.startsWith("/app/") ? join(dist, normalize(path.slice(5))) : null;
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (actual, expected, label) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);

const INIT = { type: "init", markdown: "첫 줄\n둘째 줄\n\n- [ ] 할 일\n\n[링크](https://example.com)\n", theme: "light" };

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  await page.goto(`${base}/host.html`);
  await page.waitForFunction(() => window.log.some((m) => m.type === "ready"), undefined, { timeout: 20000 });
  const frame = page.frameLocator("#app");
  const log = (type) => page.evaluate((t) => window.log.filter((m) => m.type === t), type);
  const clear = () => page.evaluate(() => (window.log.length = 0));
  const send = (message) => page.evaluate((m) => window.send(m), message);
  const ready = async (init = INIT) => {
    await send(init);
    await frame.locator(".ProseMirror").waitFor();
    await page.waitForTimeout(400);
  };
  return { page, errors, frame, log, clear, send, ready };
}

const TESTS = [
  {
    name: "ready → init: 열기만 해서는 change가 나가지 않고 height가 보고된다",
    async run({ log, ready, page, frame }) {
      eq((await log("ready"))[0], { v: 1, type: "ready", protocol: 1 }, "ready");
      await ready();
      await page.waitForTimeout(500);
      eq((await log("change")).length, 0, "열기만 한 뒤 change 수");
      const heights = await log("height");
      assert(heights.length > 0 && heights.at(-1).px > 50, `height가 없거나 너무 작다: ${JSON.stringify(heights)}`);
      eq(await frame.locator(".ProseMirror p").first().innerText(), "첫 줄\n둘째 줄", "렌더된 첫 문단(줄바꿈 보임)");
    },
  },
  {
    name: "입력하면 250ms 뒤 change 한 번: 줄바꿈은 백슬래시 없이, rev는 1부터",
    async run({ log, ready, frame, page, clear }) {
      await ready();
      await clear();
      // 첫 문단의 둘째 줄 끝으로 간다.
      await frame.locator(".ProseMirror p").first().click();
      await page.keyboard.press("Control+Home");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("End");
      await page.keyboard.type("!!");
      await page.waitForTimeout(700);
      const changes = await log("change");
      eq(changes.length, 1, "change 수");
      eq(changes[0].rev, 1, "rev");
      assert(changes[0].markdown.startsWith("첫 줄\n둘째 줄!!\n"), `줄바꿈 모양이 다르다: ${JSON.stringify(changes[0].markdown)}`);
      assert(!changes[0].markdown.includes("\\"), "백슬래시가 섞였다");
      assert(changes[0].markdown.includes("- [ ] 할 일"), "할 일 목록이 사라졌다");
      await page.keyboard.type("?");
      await page.waitForTimeout(700);
      eq((await log("change")).at(-1).rev, 2, "두 번째 rev");
    },
  },
  {
    name: "setMarkdown은 change 없이 내용을 바꾸고, 그 뒤 입력의 기준이 된다",
    async run({ log, ready, frame, page, clear, send }) {
      await ready();
      await clear();
      await send({ type: "setMarkdown", markdown: "새 일정 메모" });
      await page.waitForTimeout(500);
      eq(await frame.locator(".ProseMirror").innerText(), "새 일정 메모", "바뀐 내용");
      eq((await log("change")).length, 0, "setMarkdown 뒤 change 수");
      await frame.locator(".ProseMirror p").click();
      await page.keyboard.press("End");
      await page.keyboard.type("!");
      await page.waitForTimeout(700);
      eq((await log("change")).at(-1).markdown, "새 일정 메모!\n", "입력 뒤 Markdown");
    },
  },
  {
    name: "setTheme: html 속성과 바탕이 바뀐다",
    async run({ ready, frame, send, page }) {
      await ready();
      await send({ type: "setTheme", theme: "dark" });
      await page.waitForTimeout(200);
      const dark = await frame.locator("html").evaluate((el) => ({ theme: el.getAttribute("data-md-theme"), bg: getComputedStyle(document.body).backgroundColor }));
      eq(dark, { theme: "dark", bg: "rgb(23, 23, 23)" }, "다크");
      await send({ type: "setTheme", theme: "light" });
      await page.waitForTimeout(200);
      eq(await frame.locator("html").evaluate((el) => el.getAttribute("data-md-theme")), "light", "라이트");
    },
  },
  {
    name: "background 지정과 autoHeight=false",
    async run({ ready, frame, page, log }) {
      await ready({ ...INIT, background: "rgb(1, 2, 3)", autoHeight: false });
      eq(await frame.locator("body").evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(1, 2, 3)", "바탕");
      eq((await log("height")).length, 0, "자동 높이를 끄면 height를 보내지 않는다");
      assert((await frame.locator(".ProseMirror").evaluate((el) => el.getBoundingClientRect().height)) > 300, "창 높이를 채우지 않는다");
      void page;
    },
  },
  {
    name: "읽기 전용: 입력은 막히고 링크를 누르면 openLink",
    async run({ log, ready, frame, page, clear }) {
      await ready({ ...INIT, readOnly: true });
      await clear();
      await frame.locator(".ProseMirror p").first().click();
      await page.keyboard.type("x");
      await page.waitForTimeout(600);
      eq((await log("change")).length, 0, "읽기 전용에서 change 수");
      eq(await frame.locator(".ProseMirror").getAttribute("contenteditable"), "false", "contenteditable");
      await frame.locator(".ProseMirror a").click();
      await page.waitForTimeout(200);
      eq((await log("openLink")).map((m) => m.url), ["https://example.com"], "연 주소");
    },
  },
  {
    name: "편집 중에는 Ctrl+클릭만 openLink (그냥 클릭은 열지 않는다)",
    async run({ log, ready, frame, page, clear }) {
      await ready();
      await clear();
      await frame.locator(".ProseMirror a").click();
      await page.waitForTimeout(200);
      eq((await log("openLink")).length, 0, "그냥 클릭");
      await frame.locator(".ProseMirror a").click({ modifiers: ["Control"] });
      await page.waitForTimeout(200);
      eq((await log("openLink")).map((m) => m.url), ["https://example.com"], "Ctrl+클릭");
    },
  },
  {
    name: "`/` 메뉴는 허용한 기능의 항목만 (이미지·토글·정렬 없음)",
    async run({ ready, frame, page }) {
      await ready({ ...INIT, markdown: "" });
      await frame.locator(".ProseMirror p").click();
      await page.keyboard.type("/");
      await frame.locator(".md-menu").waitFor();
      const labels = await frame.locator(".md-menu-item .md-menu-label").allTextContents();
      eq(labels.length, 10, `항목 수(${labels.join(",")})`);
      for (const banned of ["이미지", "토글", "정렬"]) assert(!labels.some((l) => l.includes(banned)), `${banned}이 메뉴에 있다`);
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "features로 표·수식을 열 수 있다",
    async run({ ready, frame, page }) {
      await ready({ ...INIT, markdown: "", features: ["table", "math"] });
      await frame.locator(".ProseMirror p").click();
      await page.keyboard.type("/");
      await frame.locator(".md-menu").waitFor();
      const labels = await frame.locator(".md-menu-item .md-menu-label").allTextContents();
      assert(labels.some((l) => l.includes("표")) && labels.some((l) => l.includes("수식")), `표·수식이 없다: ${labels}`);
      assert(!labels.some((l) => l.includes("제목")), "허용하지 않은 제목이 있다");
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "insertMarkdown은 커서 자리에 끼우고 change를 보낸다",
    async run({ log, ready, frame, page, send, clear }) {
      await ready({ ...INIT, markdown: "앞 뒤" });
      await clear();
      await frame.locator(".ProseMirror p").click();
      await page.keyboard.press("Home");
      await send({ type: "insertMarkdown", markdown: "**굵게** " });
      await page.waitForTimeout(700);
      const last = (await log("change")).at(-1);
      assert(last && last.markdown.includes("**굵게**") && last.markdown.includes("앞 뒤"), `끼운 결과가 이상하다: ${JSON.stringify(last)}`);
    },
  },
  {
    name: "focus 명령과 focus·blur 이벤트, 포커스를 잃으면 남은 입력을 바로 보낸다",
    async run({ log, ready, frame, page, send, clear }) {
      await ready();
      await clear();
      await send({ type: "focus" });
      await page.waitForTimeout(200);
      assert((await log("focus")).length >= 1, "focus 이벤트가 없다");
      await page.keyboard.type("Z");
      // 250ms를 기다리지 않고 포커스를 뺀다
      await frame.locator("body").evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForTimeout(100);
      assert((await log("blur")).length >= 1, "blur 이벤트가 없다");
      assert((await log("change")).some((m) => m.markdown.includes("Z")), "blur 때 남은 입력을 보내지 않았다");
    },
  },
  {
    name: "init을 다시 보내면 새로 뜬다 / 객체·전역 함수로 보내도 받는다 / 모르는 메시지는 무시",
    async run({ log, ready, frame, page, send, clear }) {
      await ready();
      await send({ type: "init", markdown: "두 번째 일정", theme: "light" });
      await page.waitForTimeout(500);
      eq(await frame.locator(".ProseMirror").innerText(), "두 번째 일정", "다시 init");
      await page.evaluate(() => window.sendObject({ type: "setMarkdown", markdown: "객체로" }));
      await page.waitForTimeout(300);
      eq(await frame.locator(".ProseMirror").innerText(), "객체로", "객체 메시지");
      await page.evaluate(() => window.sendViaGlobal({ type: "setMarkdown", markdown: "전역 함수로" }));
      await page.waitForTimeout(300);
      eq(await frame.locator(".ProseMirror").innerText(), "전역 함수로", "__editorHostReceive");
      await clear();
      await send({ type: "unknown-future-message", x: 1 });
      await page.evaluate(() => window.send("not json"));
      await page.waitForTimeout(200);
      eq((await log("error")).length, 0, "모르는 메시지 뒤 error 수");
    },
  },
  {
    name: "좁은 화면(폭 360px): `/` 메뉴가 화면 안에 들어오고 가로 스크롤이 생기지 않는다",
    async run({ ready, frame, page }) {
      await page.evaluate(() => (document.getElementById("app").style.width = "360px"));
      await ready({ ...INIT, markdown: "" });
      await frame.locator(".ProseMirror p").click();
      await page.keyboard.type("/");
      await frame.locator(".md-menu").waitFor();
      const box = await frame.locator(".md-menu").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, width: window.innerWidth, scroll: document.documentElement.scrollWidth };
      });
      assert(box.left >= 0 && box.right <= box.width, `메뉴가 화면 밖이다: ${JSON.stringify(box)}`);
      assert(box.scroll <= box.width, `가로 스크롤이 생겼다: ${JSON.stringify(box)}`);
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "mermaid를 뺀 번들: 다이어그램 코드 블록은 그림 대신 안내로 보이고 원문은 그대로, 오류 메시지는 없다",
    async run({ log, ready, frame, page }) {
      const source = "```mermaid\ngraph TD;A-->B\n```\n";
      await ready({ ...INIT, markdown: source });
      await page.waitForTimeout(800);
      assert((await frame.locator(".mermaid-error, .mermaid-empty").count()) > 0, "다이어그램 자리에 안내가 없다");
      eq((await log("error")).length, 0, "호스트로 간 error 수");
      eq((await log("change")).length, 0, "열기만 한 뒤 change 수");
    },
  },
  {
    name: "일반 글 설명(Markdown 문법처럼 보이는 글자 포함)을 열기만 하면 그대로다",
    async run({ log, ready, page }) {
      await ready({ ...INIT, markdown: "2*3*4 = 24\n[x] 확인\n#태그 and a_b_c\n" });
      await page.waitForTimeout(700);
      eq((await log("change")).length, 0, "열기만 한 뒤 change 수");
    },
  },
];

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const browser = await chromium.launch();
const failures = [];
try {
  for (const test of TESTS) {
    if (only && !test.name.includes(only)) continue;
    const ctx = await open(browser);
    const started = Date.now();
    try {
      await test.run(ctx);
      if (ctx.errors.length) throw new Error(`콘솔 오류: ${ctx.errors.join(" | ")}`);
      console.log(`  ✓ ${test.name} (${Date.now() - started}ms)`);
    } catch (error) {
      console.log(`  ✗ ${test.name}`);
      failures.push(`${test.name}: ${error.message}`);
    } finally {
      await ctx.page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

// 번들 크기(참고용): 처음 열 때 받는 것은 진입 JS·CSS, 나머지는 필요할 때 받는 조각이다.
const assets = join(dist, "assets");
const files = readdirSync(assets).map((name) => ({ name, size: statSync(join(assets, name)).size }));
const total = files.reduce((sum, f) => sum + f.size, 0);
console.log(`번들: 파일 ${files.length}개, 합계 ${(total / 1024).toFixed(0)}KB (가장 큰 것: ${files.sort((a, b) => b.size - a.size).slice(0, 3).map((f) => `${f.name} ${(f.size / 1024).toFixed(0)}KB`).join(", ")})`);

if (failures.length > 0) {
  console.error(`\n실패 ${failures.length}건:\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log("\n에디터 번들 시험 OK");
