// 시각 회귀 장면들. 각 장면은 새로 불러온 페이지에서 `setup`으로 상태를 만든 뒤 `roots`의 스타일을 덤프한다.
// 시나리오는 실제 키 입력과 클릭을 쓴다(happy-dom 골든이 못 잡는 열린 팝업·편집 창 상태까지 본다).

export const LAST_P = '.ProseMirror p[data-block-id="demo000032"]';

/** 본문의 비동기 요소(코드 강조, 수식, mermaid 미리보기, 이미지)가 다 도착할 때까지 기다린다. */
export async function waitReady(page) {
  await page.waitForFunction(
    () =>
      document.querySelector(".ProseMirror .hljs-keyword") &&
      document.querySelector(".ProseMirror .math-rendered .katex") &&
      document.querySelector(".ProseMirror .mermaid-preview svg") &&
      document.querySelector(".ProseMirror .image-frame img"),
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(150);
}

/** 문서 안의 위치를 찾아 에디터에 선택을 둔다(코드 블록 끝 등). */
export async function selectEndOfFirst(page, nodeType) {
  await page.evaluate((type) => {
    const { editor } = window.__demo;
    let target = null;
    editor.state.doc.descendants((node, pos) => {
      if (!target && node.type.name === type) target = { pos, size: node.nodeSize };
      return !target;
    });
    if (!target) throw new Error(`${type} 노드가 없다`);
    editor.chain().focus().setTextSelection(target.pos + target.size - 1).run();
  }, nodeType);
}

/**
 * 끝 문단을 눌러 커서를 놓는다. 클릭 직후에는 ProseMirror가 DOM의 선택 변경(selectionchange)을 아직 반영하지 못했을 수 있어서,
 * 에디터의 선택이 그 문단 안으로 옮겨질 때까지 기다린다(그 전에 붙여넣기 이벤트를 보내면 문서 맨 앞에 붙는다).
 */
export async function focusScratch(page) {
  await page.click(LAST_P);
  await page.waitForFunction(() => {
    const { editor } = window.__demo;
    const $from = editor.state.selection.$from;
    return $from.parent.type.name === "paragraph" && $from.parent.attrs.id === "demo000032";
  });
}

/**
 * 그려진 수식 글자를 실제 사용자처럼 눌러 편집 창을 연다. 인라인 요소는 클릭 조각이 여러 개라서 Playwright의 기본 클릭 지점이 문단에 떨어지므로,
 * 화면 가운데로 스크롤한 뒤 그 자리의 좌표를 마우스로 직접 누른다.
 */
export async function clickMath(page) {
  const point = await page.evaluate(() => {
    const el = document.querySelector(".ProseMirror .math-inline .katex");
    el.scrollIntoView({ block: "center" });
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
}

const MENU = (label) => `body > div:has([aria-label="${label}"])`;

export const SCENES = [
  { name: "editor", roots: [".ProseMirror"] },
  {
    name: "slash-menu",
    roots: [MENU("명령 메뉴")],
    async setup(page) {
      await focusScratch(page);
      await page.keyboard.type("/");
      await page.waitForSelector('[aria-label="명령 메뉴"]');
    },
  },
  {
    name: "slash-menu-filtered",
    roots: [MENU("명령 메뉴")],
    async setup(page) {
      await focusScratch(page);
      await page.keyboard.type("/제목");
      await page.waitForFunction(() => document.querySelectorAll('[aria-label="명령 메뉴"] [role="option"]').length > 0 && document.querySelectorAll('[aria-label="명령 메뉴"] [role="option"]').length < 12);
    },
  },
  {
    name: "language-picker",
    roots: [".language-picker"],
    async setup(page) {
      await page.click(".language-picker-button");
      await page.waitForSelector(".language-picker-popup");
    },
  },
  {
    name: "code-completion",
    roots: [MENU("자동완성")],
    async setup(page) {
      await selectEndOfFirst(page, "codeBlock");
      await page.keyboard.type("\ncons");
      await page.waitForSelector('[aria-label="자동완성"]');
    },
  },
  {
    name: "math-editor",
    roots: ['[data-testid="math-editor"]'],
    async setup(page) {
      await clickMath(page);
      await page.waitForSelector('[data-testid="math-editor"]');
      await page.waitForSelector('[data-testid="math-preview"] .katex');
    },
  },
  {
    name: "latex-completion",
    roots: ['[data-testid="math-editor"]'],
    async setup(page) {
      await clickMath(page);
      await page.waitForSelector('[data-testid="math-editor"] textarea');
      await page.click('[data-testid="math-editor"] textarea');
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\\fra");
      await page.waitForSelector('[data-testid="latex-completion"]');
    },
  },
  {
    name: "footnote-editor",
    roots: ['[data-testid="footnote-editor"]'],
    async setup(page) {
      await page.click(".ProseMirror [data-footnote]");
      await page.waitForSelector('[data-testid="footnote-editor"]');
    },
  },
  {
    name: "table-toolbar",
    roots: ['[data-testid="table-toolbar"]'],
    async setup(page) {
      await page.click(".ProseMirror td");
      await page.waitForSelector('[data-testid="table-toolbar"]');
    },
  },
  {
    name: "image-selected",
    roots: [".ProseMirror .image-block"],
    async setup(page) {
      await page.click(".ProseMirror .image-frame img");
      await page.waitForSelector(".image-toolbar");
    },
  },
  {
    name: "callout-menu",
    roots: [".ProseMirror .callout-icon"],
    async setup(page) {
      await page.click(".ProseMirror .callout-icon button");
      await page.waitForSelector(".callout-menu");
    },
  },
  {
    name: "toggle-closed",
    roots: [".ProseMirror .toggle-block"],
    async setup(page) {
      await page.click(".ProseMirror .toggle-arrow");
      await page.waitForSelector('.toggle-block[data-open="false"]');
    },
  },
  {
    name: "mermaid-viewer",
    roots: ['[aria-label="다이어그램 크게 보기"][role="dialog"]'],
    async setup(page) {
      await page.click(".ProseMirror .mermaid-preview");
      await page.waitForSelector('[aria-label="다이어그램 크게 보기"]');
    },
  },
];
