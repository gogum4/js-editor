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
    name: "directive: 여는 줄 입력칸을 고치고, 안쪽 글은 평소처럼 입력한다",
    async run({ page, open }) {
      await open({ raw: true });
      const node = () => page.evaluate(() => window.__demo.editor.getJSON().content.find((n) => n.type === "directive"));
      await page.click("input.md-directive-input");
      await page.keyboard.press("Control+a");
      await page.keyboard.type(":::indent{n=3}");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);
      eq((await node()).attrs.head, ":::indent{n=3}", "고친 여는 줄");
      await page.click(".md-directive-body p");
      await page.keyboard.press("End");
      await page.keyboard.type("!");
      await page.waitForTimeout(100);
      eq(textOf(await node()), "디렉티브 안쪽!", "안쪽 글");
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
