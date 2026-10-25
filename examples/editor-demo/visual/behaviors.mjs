// 실제 브라우저(Chromium)에서의 동작 시험. 키 입력·클릭은 Playwright가 진짜 입력 이벤트로 보내고,
// 한글 조합은 CDP의 `Input.imeSetComposition`으로 흉내 낸다(docs/IME-CHECKLIST.md 3절과 같은 방법; 실제 한글 입력기는 아니다).
import { clickMath, focusScratch, LAST_P, selectEndOfFirst } from "./scenes.mjs";

const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (actual, expected, label) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`);

const json = (page) => page.evaluate(() => window.__demo.editor.getJSON());
const textOf = (node) => (node.content ?? []).map((c) => c.text ?? textOf(c)).join("");
const isEmptyParagraph = (node) => node.type === "paragraph" && textOf(node) === "";
/** 시험이 입력하는 영역: 문서의 '끝' 문단 다음의 블록들. */
const tail = async (page) => {
  const blocks = (await json(page)).content;
  const index = blocks.findIndex((node) => node.type === "paragraph" && textOf(node) === "끝");
  return blocks.slice(index + 1);
};
/** 입력 영역의 비어 있지 않은 마지막 블록(제목·콜아웃으로 바뀌면 에디터가 그 뒤에 빈 문단을 하나 더 둔다). */
const lastFilled = async (page) => (await tail(page)).filter((node) => !isEmptyParagraph(node)).at(-1);
const lastText = async (page) => {
  const node = await lastFilled(page);
  return node ? textOf(node) : "";
};

async function paste(page, text, { shift = false } = {}) {
  if (shift) await page.keyboard.down("Shift");
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    document.querySelector(".ProseMirror").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  if (shift) await page.keyboard.up("Shift");
  await page.waitForTimeout(100);
}

async function ime(page, steps, commit) {
  const cdp = await page.context().newCDPSession(page);
  for (const text of steps) {
    await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
    await page.waitForTimeout(30);
  }
  if (commit !== undefined) await cdp.send("Input.insertText", { text: commit });
  await page.waitForTimeout(50);
  return cdp;
}

const MARKDOWN = "# 붙임\n\n- 항목 하나\n- 항목 둘";

/** 붙여넣기 + 첫 Ctrl+Z는 원문으로 + 둘째 Ctrl+Z는 붙여넣기 전으로. 노트 앱의 Yjs 경로(`collab`)와 보통 경로 둘 다 확인한다. */
async function pasteUndoScenario({ page, open }, collab) {
  await open({ collab });
  await focusScratch(page);
  const before = await tail(page);
  await paste(page, MARKDOWN);
  const afterPaste = await tail(page);
  assert(afterPaste.some((n) => n.type === "heading"), `붙여넣기가 제목으로 변환되지 않았다: ${JSON.stringify(afterPaste.map((n) => n.type))}`);
  assert(afterPaste.some((n) => n.type === "bulletList"), "붙여넣기가 목록으로 변환되지 않았다");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  const raw = await tail(page);
  const rawTexts = raw.filter((n) => n.type === "paragraph").map(textOf).filter(Boolean);
  eq(rawTexts, ["# 붙임", "- 항목 하나", "- 항목 둘"], "첫 Ctrl+Z는 원문(일반 텍스트)이어야 한다");
  assert(!raw.some((n) => n.type === "heading" || n.type === "bulletList"), "첫 Ctrl+Z 뒤에도 변환된 블록이 남아 있다");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(100);
  const restored = await tail(page);
  eq(restored.map((n) => [n.type, textOf(n)]), before.map((n) => [n.type, textOf(n)]), "둘째 Ctrl+Z는 붙여넣기 전이어야 한다");
}

export const BEHAVIORS = [
  {
    name: "입력 규칙: '# ' 로 제목",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await page.keyboard.type("# 제목입니다");
      const last = await lastFilled(page);
      eq([last.type, last.attrs.level, textOf(last)], ["heading", 1, "제목입니다"], "입력한 블록");
    },
  },
  {
    name: "입력 규칙: '> ' 다음 '[!tip] ' 로 콜아웃",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await page.keyboard.type("> [!tip] 내용");
      const last = await lastFilled(page);
      eq([last.type, last.attrs.type], ["callout", "tip"], "입력한 블록");
    },
  },
  {
    name: "슬래시 메뉴: 거르고 Enter로 고른다",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await page.keyboard.type("/제목");
      await page.waitForSelector('[aria-label="명령 메뉴"] [role="option"]');
      await page.keyboard.press("Enter");
      const last = await lastFilled(page);
      eq([last.type, last.attrs.level], ["heading", 1], "고른 블록");
      assert((await page.$('[aria-label="명령 메뉴"]')) === null, "고른 뒤에도 메뉴가 남아 있다");
    },
  },
  {
    name: "되돌리기: 입력을 한 번에 되돌린다",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await page.keyboard.type("abc");
      eq(await lastText(page), "abc", "입력 직후");
      await page.keyboard.press("Control+z");
      eq(await lastText(page), "", "Ctrl+Z 뒤");
    },
  },
  { name: "붙여넣기: Markdown 변환, Ctrl+Z 두 단계 (보통 경로)", run: (ctx) => pasteUndoScenario(ctx, false) },
  { name: "붙여넣기: Markdown 변환, Ctrl+Z 두 단계 (실제 Yjs 경로)", run: (ctx) => pasteUndoScenario(ctx, true) },
  {
    name: "붙여넣기: Shift를 누른 채 붙이면 변환하지 않는다",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await paste(page, MARKDOWN, { shift: true });
      const blocks = await tail(page);
      assert(!blocks.some((n) => n.type === "heading"), "Shift 붙여넣기가 제목으로 변환됐다");
    },
  },
  {
    name: "붙여넣기: HTML이 같이 있으면 변환하지 않는다",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await page.evaluate(() => {
        const data = new DataTransfer();
        data.setData("text/plain", "# 제목");
        data.setData("text/html", "<h1>제목</h1>");
        document.querySelector(".ProseMirror").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(100);
      // 우리 변환이 아니라 ProseMirror의 기본 HTML 붙여넣기가 처리한다(제목 블록이 생겨도 '# 제목' 글자는 남지 않는다).
      assert(!(await lastText(page)).includes("# 제목"), "HTML 붙여넣기에서 Markdown 원문 글자가 들어갔다");
    },
  },
  {
    name: "한글 조합(IME): 문단에서 ㅎ→하→한, ㄱ→그→글",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await ime(page, ["ㅎ", "하", "한"], undefined);
      assert((await page.textContent(LAST_P)).includes("한"), "조합 중인 글자가 화면에 보이지 않는다");
      await ime(page, [], "한");
      await ime(page, ["ㄱ", "그", "글"], "글");
      eq(await lastText(page), "한글", "확정된 글");
    },
  },
  {
    name: "한글 조합(IME): 슬래시 뒤에 '제'를 조합해 확정하면 메뉴가 걸러진다",
    async run({ page, open }) {
      await open();
      await focusScratch(page);
      await page.keyboard.type("/");
      await page.waitForSelector('[aria-label="명령 메뉴"]');
      await ime(page, ["ㅈ", "저", "제"], "제");
      await page.waitForTimeout(100);
      const options = await page.$$eval('[aria-label="명령 메뉴"] [role="option"]', (els) => els.map((e) => e.textContent));
      assert(options.length > 0 && options.every((text) => text.includes("제") || /제|title|heading/i.test(text)), `걸러진 항목이 이상하다: ${JSON.stringify(options)}`);
      eq(await lastText(page), "/제", "문단 글");
    },
  },
  {
    name: "코드 자동완성: 접두사를 치면 뜨고 Tab으로 받는다",
    async run({ page, open }) {
      await open();
      await selectEndOfFirst(page, "codeBlock");
      await page.keyboard.type("\ncons");
      await page.waitForSelector('[aria-label="자동완성"] [role="option"]');
      const first = await page.$eval('[aria-label="자동완성"] [role="option"]', (el) => el.getAttribute("data-completion-word") ?? "");
      await page.keyboard.press("Tab");
      const code = await page.evaluate(() => {
        let text = "";
        window.__demo.editor.state.doc.descendants((node) => {
          if (!text && node.type.name === "codeBlock") text = node.textContent;
        });
        return text;
      });
      assert(code.split("\n").at(-1) === first, `Tab으로 받은 줄이 후보와 다르다: ${JSON.stringify(code.split("\n").at(-1))} / ${first}`);
    },
  },
  {
    name: "언어 선택: 검색해서 Enter로 고른다",
    async run({ page, open }) {
      await open();
      await page.click(".language-picker-button");
      await page.fill(".language-picker-popup input", "rust");
      await page.waitForSelector('.language-picker-popup [role="option"]');
      await page.keyboard.press("Enter");
      const language = await page.evaluate(() => {
        let value = null;
        window.__demo.editor.state.doc.descendants((node) => {
          if (value === null && node.type.name === "codeBlock") value = node.attrs.language;
        });
        return value;
      });
      eq(language, "rust", "첫 코드 블록 언어");
    },
  },
  {
    name: "수식 편집: 열고 고쳐서 Ctrl+Enter로 저장한다",
    async run({ page, open }) {
      await open();
      await clickMath(page);
      await page.waitForSelector('[data-testid="math-editor"] textarea');
      await page.fill('[data-testid="math-editor"] textarea', "y^2");
      await page.keyboard.press("Control+Enter");
      await page.waitForFunction(() => !document.querySelector('[data-testid="math-editor"]'));
      const latex = await page.evaluate(() => {
        let value = null;
        window.__demo.editor.state.doc.descendants((node) => {
          if (value === null && node.type.name === "mathInline") value = node.attrs.latex;
        });
        return value;
      });
      eq(latex, "y^2", "인라인 수식");
    },
  },
  {
    name: "각주 편집: 열고 고쳐서 Enter로 저장한다",
    async run({ page, open }) {
      await open();
      await page.click(".ProseMirror [data-footnote]");
      await page.waitForSelector('[data-testid="footnote-editor"] textarea');
      await page.fill('[data-testid="footnote-editor"] textarea', "고친 각주");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => !document.querySelector('[data-testid="footnote-editor"]'));
      const text = await page.evaluate(() => {
        let value = null;
        window.__demo.editor.state.doc.descendants((node) => {
          if (value === null && node.type.name === "footnote") value = node.attrs.text;
        });
        return value;
      });
      eq(text, "고친 각주", "첫 각주");
    },
  },
  {
    name: "표 편집 막대: 아래에 행 추가",
    async run({ page, open }) {
      await open();
      await page.click(".ProseMirror td");
      await page.click('[data-table-action="addRowAfter"]');
      eq(await page.$$eval(".ProseMirror table tr", (rows) => rows.length), 3, "행 수");
    },
  },
  {
    name: "토글: 접고 펼친다",
    async run({ page, open }) {
      await open();
      await page.click(".ProseMirror .toggle-arrow");
      eq(await page.getAttribute(".toggle-block", "data-open"), "false", "접은 뒤");
      await page.click(".ProseMirror .toggle-arrow");
      eq(await page.getAttribute(".toggle-block", "data-open"), "true", "다시 펼친 뒤");
    },
  },
  {
    name: "콜아웃: 아이콘 메뉴로 종류를 바꾼다",
    async run({ page, open }) {
      await open();
      await page.click(".ProseMirror .callout-icon button");
      await page.click('.callout-menu [role="menuitem"]:has-text("경고")');
      const type = await page.evaluate(() => {
        let value = null;
        window.__demo.editor.state.doc.descendants((node) => {
          if (value === null && node.type.name === "callout") value = node.attrs.type;
        });
        return value;
      });
      eq(type, "warning", "첫 콜아웃 종류");
    },
  },
  {
    name: "콜아웃: 메뉴로 제목을 넣고 접을 수 있게 하며, 제목 줄에서 접고 편다",
    async run({ page, open }) {
      await open();
      const attrs = () =>
        page.evaluate(() => {
          let value = null;
          window.__demo.editor.state.doc.descendants((node) => {
            if (value === null && node.type.name === "callout") value = { title: node.attrs.title, fold: node.attrs.fold };
          });
          return value;
        });
      await page.click(".ProseMirror .callout-icon button");
      await page.click('.callout-menu [role="menuitem"]:has-text("제목 넣기")');
      await page.fill(".ProseMirror .callout-title-input", "내 제목");
      eq((await attrs()).title, "내 제목", "입력한 제목");
      await page.click(".ProseMirror .callout-icon button");
      await page.click('.callout-menu [role="menuitem"]:has-text("접힌 채로")');
      eq((await attrs()).fold, "-", "접기 표식");
      const display = () => page.evaluate(() => getComputedStyle(document.querySelector(".ProseMirror .callout-content")).display);
      await page.waitForTimeout(100);
      eq(await display(), "none", "접힌 채로 시작하면 본문이 숨는다");
      await page.click(".ProseMirror .callout-fold-toggle");
      await page.waitForTimeout(100);
      assert((await display()) !== "none", "누르면 펼쳐진다");
      eq((await attrs()).fold, "-", "펴도 문서의 접기 표식은 그대로");
    },
  },
  {
    name: "추가 문법: 하이라이트·태그·주석·인용 입력 규칙과 목차 슬래시 명령",
    async run({ page, open }) {
      await open({ extras: true });
      await focusScratch(page);
      await page.keyboard.type("==강조== ");
      await page.keyboard.type("#할일 ");
      await page.keyboard.type("%%메모%% ");
      await page.keyboard.type("[@smith2020]");
      const kinds = await page.evaluate(() => {
        const found = [];
        const last = window.__demo.editor.state.doc.lastChild;
        const paragraph = last.type.name === "paragraph" ? last : window.__demo.editor.state.doc.child(window.__demo.editor.state.doc.childCount - 2);
        paragraph.forEach((child) => found.push(child.isText ? `text:${child.marks.map((m) => m.type.name).join("+")}` : child.type.name));
        return found;
      });
      assert(kinds.includes("text:highlight") && kinds.includes("tag") && kinds.includes("comment") && kinds.includes("citation"), `입력 규칙 결과: ${kinds.join(", ")}`);
      assert(await page.evaluate(() => !!document.querySelector(".ProseMirror mark")), "하이라이트가 <mark>로 보인다");
      assert(await page.evaluate(() => !!document.querySelector(".ProseMirror .md-tag")), "태그 칩");
      // 주석 칩을 누르면 입력 상자로 바뀐다.
      await page.click(".ProseMirror .md-comment");
      await page.waitForSelector(".md-comment-input", { timeout: 2000 }).catch(async () => { throw new Error("주석 입력 상자가 안 뜬다: " + (await page.evaluate(() => document.querySelector(".ProseMirror").innerHTML.slice(0, 600)))); });
      await page.keyboard.press("Escape");
      // 입력 상자가 닫히고 편집기가 포커스를 돌려받을 때까지 기다린 뒤, 위치를 명시해 문서 끝으로 간다(곧바로 키를 치면 포커스가 돌아오기 전에 들어가 사라질 수 있다).
      await page.waitForSelector(".md-comment-input", { state: "detached", timeout: 2000 });
      await page.waitForFunction(() => document.activeElement?.classList.contains("ProseMirror"), null, { timeout: 2000 });
      await page.evaluate(() => window.__demo.editor.commands.focus("end"));
      // 목차 슬래시 명령
      await page.keyboard.press("Enter");
      await page.keyboard.type("/목차");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".ProseMirror nav.md-toc", { timeout: 2000 }).catch(async () => { throw new Error("목차가 안 생긴다: " + (await page.evaluate(() => document.querySelector(".ProseMirror").innerHTML.slice(-700)))); });
      assert(await page.evaluate(() => document.querySelector(".ProseMirror nav.md-toc").textContent.length > 0), "목차가 보인다");
    },
  },
  {
    name: "할 일 상태·서술형 인용·코드 블록 메타: Ctrl+Alt+Enter와 Alt+클릭으로 상태가 돌고, @키는 칩이 되고, 메타 입력 칸이 값을 지킨다",
    async run({ page, open }) {
      await open({ extras: true });
      await focusScratch(page);
      await page.keyboard.type("[] 할 일");
      const status = () => page.evaluate(() => [...document.querySelectorAll("li[data-checked]")].at(-1)?.getAttribute("data-status") ?? null);
      eq(await status(), null, "처음에는 상태 없음");
      await page.keyboard.press("Control+Alt+Enter");
      eq(await status(), "progress", "첫 번째는 진행 중");
      await page.keyboard.press("Control+Alt+Enter");
      eq(await status(), "deferred", "다음은 미룸");
      await page.locator("li[data-checked] input[type=checkbox]").last().click({ modifiers: ["Alt"] });
      eq(await status(), "question", "Alt+클릭으로 다음 상태");
      eq(await page.evaluate(() => [...document.querySelectorAll("li[data-checked]")].at(-1)?.getAttribute("data-checked")), "false", "상태가 있으면 완료 표시는 꺼진다");
      // 서술형 인용
      await page.keyboard.press("Enter");
      await page.keyboard.press("Enter");
      await page.keyboard.type("보면 @smith2020 ");
      const chip = await page.evaluate(() => [...document.querySelectorAll("cite.md-citation, span.md-citation")].map((el) => el.textContent));
      assert(chip.includes("@smith2020"), `서술형 칩은 괄호 없이 @키: ${JSON.stringify(chip)}`);
      // 코드 블록 메타
      await page.keyboard.type("```");
      await page.keyboard.type(" ");
      await page.waitForSelector(".code-block-meta", { timeout: 2000 });
      await page.fill(".code-block-meta", 'title="a.ts" {2}');
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      eq(await page.inputValue(".code-block-meta"), 'title="a.ts" {2}', "메타 값이 저장되어 입력 칸에 남는다");
    },
  },
  {
    name: "수식 그래프: ```plot 블록이 2D 그래프와 3D 곡면(드래그로 회전)을 그리고, 틀린 식은 오류를 보인다",
    async run({ page, open }) {
      await open({});
      await focusScratch(page);
      await page.keyboard.type("```plot ");
      await page.keyboard.type("y = sin(x)");
      await page.waitForSelector(".plot-preview svg", { timeout: 3000 });
      assert(await page.evaluate(() => document.querySelectorAll(".plot-preview svg path").length >= 2), "2D 그래프에 곡선 경로가 있다");
      assert(!(await page.evaluate(() => !!document.querySelector(".plot-3d"))), "2D는 회전하는 그림이 아니다");
      // 식을 3D 곡면으로 바꾼다
      await page.keyboard.press("Shift+Home");
      await page.keyboard.type("z = x^2 - y^2");
      await page.waitForSelector(".plot-3d svg polygon", { timeout: 3000 });
      const before = await page.evaluate(() => document.querySelector(".plot-3d svg polygon")?.getAttribute("points"));
      await page.locator(".plot-3d").scrollIntoViewIfNeeded(); // 화면 밖이면 마우스 좌표가 허공을 가리킨다
      const box = await page.locator(".plot-3d").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 5 });
      await page.mouse.up();
      const after = await page.evaluate(() => document.querySelector(".plot-3d svg polygon")?.getAttribute("points"));
      assert(before !== after, "드래그하면 곡면이 돌아간다");
      await page.locator(".plot-3d").dblclick();
      eq(await page.evaluate(() => document.querySelector(".plot-3d svg polygon")?.getAttribute("points")), before, "더블클릭하면 처음 시점");
      // 틀린 식(마우스를 쓴 뒤라 코드 줄을 다시 눌러 커서를 돌려 놓는다)
      await page.locator(".code-block pre").last().click();
      await page.keyboard.press("End");
      await page.keyboard.press("Shift+Home");
      await page.keyboard.type("y = foo(x)");
      await page.waitForSelector(".plot-error", { timeout: 3000 });
      assert((await page.locator(".plot-error").textContent()).includes("foo"), "오류에 모르는 이름이 나온다");
    },
  },
  {
    name: "이모지 자동완성: :글자로 후보가 뜨고 고르면 입력되며, :만 치면 최근에 쓴 이모지를 제안한다",
    async run({ page, open }) {
      await open({ extras: true });
      await focusScratch(page);
      const menu = () => page.evaluate(() => [...document.querySelectorAll(".md-menu-emoji [data-emoji-name]")].map((li) => li.getAttribute("data-emoji-name")));
      // 시간 표기나 한 글자는 메뉴를 띄우지 않는다.
      await page.keyboard.type("시각 10:3");
      await page.waitForTimeout(150);
      eq(await menu(), [], "시간 표기에서는 메뉴 없음");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      // 쓴 기록이 없을 때 ':'만 치면 기본 제안(제목이 "이모지 제안").
      await page.keyboard.type(" :");
      await page.waitForSelector(".md-menu-emoji [data-emoji-name]", { timeout: 2000 });
      eq(await page.evaluate(() => document.querySelector(".md-menu-emoji .md-menu-heading")?.textContent), "이모지 제안", "기록이 없으면 기본 제안 제목");
      eq((await menu())[0], "+1", "기본 제안의 첫 항목");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Backspace");
      // 공백 뒤의 ":smi" → 후보
      await page.keyboard.type(" :smi");
      await page.waitForSelector(".md-menu-emoji [data-emoji-name]", { timeout: 2000 });
      assert((await menu())[0] === "smile", `첫 후보는 smile: ${(await menu()).join(",")}`);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
      assert((await lastText(page)).includes("😄"), `이모지가 입력된다: ${await lastText(page)}`);
      assert(!(await lastText(page)).includes(":smi"), "입력한 :smi는 사라진다");
      eq(await menu(), [], "고른 뒤 메뉴가 닫힌다");
      // 한국어 동의어로도 찾는다.
      await page.keyboard.type(" :로켓");
      await page.waitForSelector(".md-menu-emoji [data-emoji-name]", { timeout: 2000 });
      eq((await menu())[0], "rocket", "한국어 동의어");
      await page.keyboard.press("ArrowDown").catch(() => {});
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      eq(await menu(), [], "Esc로 닫힌다");
      // ':'만 치면 최근에 쓴 이모지(맨 앞이 방금 쓴 😄)
      await page.keyboard.type(" :");
      await page.waitForSelector(".md-menu-emoji [data-emoji-name]", { timeout: 2000 });
      eq((await menu())[0], "smile", "최근에 쓴 것이 먼저");
      eq(await page.evaluate(() => document.querySelector(".md-menu-emoji .md-menu-heading")?.textContent), "최근에 쓴 이모지", "기록이 있으면 최근 제목");
      assert(await page.evaluate(() => !!document.querySelector(".md-menu-emoji .md-menu-heading")), "최근 제목이 보인다");
    },
  },
  {
    name: "선택 서식 막대: 글을 선택하면 뜨고 서식·색·약어를 건다",
    async run({ page, open }) {
      await open({ extras: true });
      await focusScratch(page);
      await page.keyboard.type("서식을 걸 낱말");
      assert(!(await page.$('[data-testid="selection-toolbar"]')), "선택이 없으면 막대가 없다");
      // 마지막 낱말 "낱말"을 선택한다(Shift+Ctrl+←).
      await page.keyboard.press("Shift+Control+ArrowLeft");
      await page.waitForSelector('[data-testid="selection-toolbar"]', { timeout: 2000 });
      const marksOf = () => page.evaluate(() => {
        const found = [];
        const doc = window.__demo.editor.state.doc;
        const paragraph = doc.child(doc.childCount - 1).textContent.includes("낱말") ? doc.child(doc.childCount - 1) : doc.child(doc.childCount - 2);
        paragraph.forEach((child) => { if (child.isText && child.text.includes("낱말")) found.push(...child.marks.map((m) => m.type.name + (m.attrs.color ? ":" + m.attrs.color : "") + (m.attrs.title ? ":" + m.attrs.title : ""))); });
        return found;
      });
      await page.click('[data-testid="selection-toolbar"] [data-mark="bold"]');
      await page.click('[data-testid="selection-toolbar"] [data-mark="highlight"]');
      // 색 팔레트
      await page.click('[data-testid="selection-toolbar"] [data-panel="color"]');
      await page.click('[data-testid="selection-toolbar"] [data-kind="text"][data-color="red"]');
      // 약어 설명
      await page.click('[data-testid="selection-toolbar"] [data-panel="abbr"]');
      await page.fill('[data-panel-body="abbr"] input', "낱말의 뜻");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
      const marks = await marksOf();
      for (const expected of ["bold", "highlight", "textColor:#dc2626", "abbr:낱말의 뜻"]) assert(marks.includes(expected), `${expected} 가 걸려야 한다: ${marks.join(", ")}`);
      // 눌렀다 떼면 해제된다.
      await page.click('[data-testid="selection-toolbar"] [data-mark="bold"]');
      assert(!(await marksOf()).includes("bold"), "굵게가 해제된다");
    },
  },
  {
    name: "링크: Ctrl+클릭만 열고 그냥 클릭은 열지 않는다",
    async run({ page, open }) {
      await open();
      await page.click(".ProseMirror a");
      eq(await page.evaluate(() => window.__demo.opened), [], "그냥 클릭 뒤 연 주소");
      await page.click(".ProseMirror a", { modifiers: ["Control"] });
      await page.waitForTimeout(100);
      eq(await page.evaluate(() => window.__demo.opened), ["https://example.com"], "Ctrl+클릭 뒤 연 주소");
    },
  },
  {
    name: "raw 상자: 칸에서 원문을 고치면 본문에 반영되고 Ctrl+Z로 돌아간다 (Yjs 경로)",
    async run({ page, open }) {
      await open({ collab: true, raw: true });
      const rawText = () => page.evaluate(() => window.__demo.editor.getJSON().content.find((n) => n.type === "raw").attrs.text);
      eq(await rawText(), ":::fold{h=1}\n안쪽 줄\n:::", "처음 원문");
      const before = JSON.stringify((await json(page)).content.filter((n) => n.type !== "raw"));
      // 칸 안의 키 입력은 에디터 본문이 아니라 칸에 들어간다.
      await page.click("textarea.md-raw-source");
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\nZ");
      await page.click("textarea.md-raw-source", { position: { x: 5, y: 5 } }); // 같은 칸(블러 없음)
      await page.waitForTimeout(600); // 입력이 멈춘 뒤 반영(400ms)
      eq(await rawText(), ":::fold{h=1}\n안쪽 줄\n:::\nZ", "고친 뒤 원문");
      eq(JSON.stringify((await json(page)).content.filter((n) => n.type !== "raw")), before, "칸 밖의 본문");
      // 칸 밖을 눌러 벗어난 뒤 에디터의 되돌리기가 원문 변경을 되돌린다.
      await page.click(".ProseMirror > p");
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(100);
      eq(await rawText(), ":::fold{h=1}\n안쪽 줄\n:::", "되돌린 뒤 원문");
      eq(await page.inputValue("textarea.md-raw-source"), ":::fold{h=1}\n안쪽 줄\n:::", "되돌린 뒤 칸");
    },
  },
  {
    name: "참조 카드: 해석기가 채우고(제목·열 미리 보기), 바뀌면 따라가고, 지워지면 삭제됨으로 보인다 (Yjs 경로)",
    async run({ page, open }) {
      await open({ collab: true, ref: true });
      const states = () => page.evaluate(() => [...document.querySelectorAll(".md-reference")].map((el) => el.getAttribute("data-state")));
      await page.waitForFunction(() => [...document.querySelectorAll(".md-reference")].every((el) => el.getAttribute("data-state") !== "loading"));
      eq(await states(), ["ready", "missing", "unknown"], "카드 상태");
      const card = page.locator('.md-reference[data-id="monster"]');
      eq(await card.locator(".md-reference-title").textContent(), "몬스터", "제목");
      eq(await card.locator(".demo-schema-preview td").allTextContents(), ["이름", "체력", "공격력"], "미리 보기 열");
      // 카드를 누르면 해석기의 open이 불린다.
      await card.click();
      eq(await page.evaluate(() => window.__demo.opened), ["schema:monster"], "연 대상");
      // 원본이 바뀌면 카드가 따라간다(문서는 그대로).
      const before = JSON.stringify(await json(page));
      await page.evaluate(() => window.__demo.setSchema("monster", { title: "몬스터 v2", columns: ["이름", "체력", "공격력", "방어력"] }));
      await page.waitForFunction(() => document.querySelector('.md-reference[data-id="monster"] .md-reference-title')?.textContent === "몬스터 v2");
      eq(await card.locator(".demo-schema-preview td").count(), 4, "바뀐 열 수");
      eq(JSON.stringify(await json(page)), before, "참조를 바꿔도 문서는 그대로");
      // 지워지면 삭제됨.
      await page.evaluate(() => window.__demo.setSchema("monster", null));
      await page.waitForFunction(() => document.querySelector('.md-reference[data-id="monster"]')?.getAttribute("data-state") === "missing");
    },
  },
  {
    name: "다크 모드: 조상에 data-md-theme=dark만 달면 본문·메뉴 색이 바뀌고 지우면 돌아온다",
    async run({ page, open }) {
      await open();
      const colors = () =>
        page.evaluate(() => {
          const css = (selector, prop) => getComputedStyle(document.querySelector(selector))[prop];
          return { pre: css(".ProseMirror .code-block", "backgroundColor"), link: css(".ProseMirror a", "color"), callout: css(".ProseMirror .callout", "backgroundColor") };
        });
      const light = await colors();
      await page.evaluate(() => document.documentElement.setAttribute("data-md-theme", "dark"));
      const dark = await colors();
      for (const key of Object.keys(light)) assert(light[key] !== dark[key], `${key}: 다크에서 색이 그대로다 (${light[key]})`);
      eq(dark.pre, "rgb(31, 35, 40)", "다크 코드 블록 바탕");
      // 메뉴(body에 뜨는 부품)도 따라간다.
      await focusScratch(page);
      await page.keyboard.type("/");
      await page.waitForSelector(".md-menu");
      eq(await page.evaluate(() => getComputedStyle(document.querySelector(".md-menu")).backgroundColor), "rgb(23, 23, 23)", "다크 메뉴 바탕");
      await page.keyboard.press("Escape");
      await page.evaluate(() => document.documentElement.removeAttribute("data-md-theme"));
      eq(await colors(), light, "끄면 밝은 모드로 돌아온다");
    },
  },
  {
    name: "콜아웃: 아무 이름이나 받고(`> [!rocket] `), 아이콘 표의 아이콘이 보인다",
    async run({ page, open }) {
      await open({ embed: true });
      await focusScratch(page);
      await page.keyboard.type("> [!rocket] 출시");
      const last = await lastFilled(page);
      eq([last.type, last.attrs.type], ["callout", "rocket"], "입력한 블록");
      eq(await page.evaluate(() => document.querySelector(".callout-rocket .callout-icon button")?.textContent), "🚀", "아이콘 표의 아이콘");
    },
  },
  {
    name: "임베드: /임베드로 빈 카드를 끼우고 주소를 적으면 공급자를 알아내 iframe이 된다",
    async run({ page, open }) {
      await open({ embed: true });
      await focusScratch(page);
      await page.keyboard.type("/임베드");
      await page.waitForSelector(".slash-menu, [role='listbox'], .md-slash-menu", { timeout: 2000 }).catch(() => {});
      await page.keyboard.press("Enter");
      await page.waitForSelector("input.md-embed-input", { timeout: 2000 });
      const focused = await page.evaluate(() => document.activeElement?.classList.contains("md-embed-input"));
      assert(focused, "빈 카드의 입력 상자에 포커스가 가야 한다");
      // 지원하지 않는 주소는 안내만 보인다.
      await page.keyboard.type("https://example.com/video");
      await page.keyboard.press("Enter");
      eq(await page.evaluate(() => document.querySelector(".md-embed-message")?.textContent), "지원하지 않는 주소예요", "안내");
      // 지원하는 주소(YouTube)는 공급자를 알아내 iframe이 된다.
      await page.keyboard.press("Control+a");
      await page.keyboard.type("https://youtu.be/dQw4w9WgXcQ?si=abc");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".md-embed iframe", { timeout: 2000 });
      const node = (await json(page)).content.find((n) => n.type === "embed");
      eq([node.attrs.provider, node.attrs.url], ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"], "저장된 값");
      eq(await page.evaluate(() => document.querySelector(".md-embed iframe").getAttribute("src")), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "iframe 주소");
      eq(await page.evaluate(() => document.querySelector(".md-embed iframe").getAttribute("sandbox")?.includes("allow-scripts")), true, "sandbox");
    },
  },
  {
    name: "임베드: 빈 카드에서 Esc를 누르면 카드가 지워진다",
    async run({ page, open }) {
      await open({ embed: true });
      await focusScratch(page);
      await page.keyboard.type("/임베드");
      await page.keyboard.press("Enter");
      await page.waitForSelector("input.md-embed-input", { timeout: 2000 });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      eq((await json(page)).content.some((n) => n.type === "embed"), false, "카드 없음");
    },
  },
  {
    name: "들여쓰기: Tab으로 늘리고 Shift+Tab으로 줄이며, 문단마다 단계가 따로다",
    async run({ page, open }) {
      await open({ indent: true });
      await focusScratch(page);
      await page.keyboard.type("첫째");
      await page.keyboard.press("Tab");
      const indentOf = async (text) => (await json(page)).content.find((n) => n.type === "paragraph" && textOf(n) === text)?.attrs?.indent ?? null;
      eq(await indentOf("첫째"), 1, "Tab 한 번");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      eq(await indentOf("첫째"), 3, "Tab 세 번");
      eq(await page.evaluate(() => [...document.querySelectorAll(".ProseMirror p")].find((p) => p.textContent === "첫째").style.marginLeft), "6em", "화면의 왼쪽 여백");
      await page.keyboard.press("Shift+Tab");
      eq(await indentOf("첫째"), 2, "Shift+Tab");
      // 다음 문단은 따로: 엔터로 나눈 새 문단은 단계를 이어받지 않는다(속성은 문단마다).
      await page.keyboard.press("Enter");
      await page.keyboard.type("둘째");
      await page.keyboard.press("Tab");
      eq([await indentOf("첫째"), await indentOf("둘째")].length, 2, "두 문단");
      assert((await indentOf("둘째")) !== null, "둘째 문단도 들여쓴다");
    },
  },
  {
    name: "들여쓰기: 목록 안에서 Tab은 들여쓰기가 아니라 목록 중첩이다",
    async run({ page, open }) {
      await open({ indent: true });
      await focusScratch(page);
      await page.keyboard.type("- 하나");
      await page.keyboard.press("Enter");
      await page.keyboard.type("둘");
      await page.keyboard.press("Tab");
      const doc = JSON.stringify(await json(page));
      assert(!/"indent":\d/.test(doc), "목록 안 문단에 indent가 붙으면 안 된다");
      assert(doc.includes('"type":"bulletList"') && (doc.match(/"type":"bulletList"/g) ?? []).length >= 2, "둘째 항목이 중첩 목록으로 들어가야 한다");
    },
  },
  {
    name: "raw 상자: 글 중간 디렉티브를 더블클릭해서 고친다",
    async run({ page, open }) {
      await open({ raw: true });
      await page.dblclick("code.md-raw-inline");
      await page.keyboard.press("Control+a");
      await page.keyboard.type(":postlink[새 글]{slug=b}");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      const inline = await page.evaluate(() => {
        const p = window.__demo.editor.getJSON().content.at(-1);
        return p.content.find((n) => n.type === "rawInline").attrs.text;
      });
      eq(inline, ":postlink[새 글]{slug=b}", "고친 원문");
    },
  },
  {
    name: "Yjs 경로와 보통 경로의 본문 DOM이 같다",
    async run({ page, open, dump }) {
      await open();
      const plain = await dump(".ProseMirror");
      await open({ collab: true });
      const collab = await dump(".ProseMirror");
      eq(collab, plain, "계산된 스타일 덤프");
    },
  },
];
