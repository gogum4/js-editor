/**
 * Mermaid 다이어그램을 그림(SVG)으로 바꾼다.
 * mermaid는 매우 커서 **처음 그림을 그릴 때만** 불러온다(Vite가 별도 파일로 나눈다). 그래서 이 파일은
 * 정적으로 `mermaid`를 가져오지 않는다.
 */

export type MermaidResult = { ok: true; svg: string } | { ok: false; error: string };

type MermaidApi = typeof import("mermaid").default;

let loading: Promise<MermaidApi> | null = null;

/** mermaid를 한 번만 불러오고 설정한다. 실패하면 다음에 다시 시도할 수 있게 비워 둔다. */
function loadMermaid(): Promise<MermaidApi> {
  loading ??= import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        // 노트에 들어온 글이 스크립트나 HTML로 실행되지 않게 한다.
        securityLevel: "strict",
        theme: "default",
        fontFamily: "inherit",
      });
      return mermaid;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

/**
 * 한가한 때 mermaid를 미리 불러온다(처음 그림을 그릴 때의 기다림을 줄인다). 실패해도 나중에 그릴 때 다시 시도한다.
 * mermaid 본체만 불러서는 부족하다 — 그림 종류별 문법·배치 코드(흐름도 등)는 처음 그릴 때 따로 불러오므로, 가장 흔한 흐름도 하나를 미리 그려 그 조각들도 받아 둔다.
 */
export function preloadMermaid(): void {
  // 다른 그리기와 겹치지 않게 같은 줄에 선다.
  queue = queue
    .then(async () => {
      const mermaid = await loadMermaid();
      const id = `mermaid-warmup-${++counter}`;
      try {
        await mermaid.render(id, "graph TD\nA-->B");
      } finally {
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
      }
    })
    .catch(() => {});
}

const USED_KEY = "mermaid.used";

/** 이 브라우저에서 다이어그램을 그려 본 적이 있는가(저장소를 못 쓰면 `false`). 다음에 앱을 열 때 미리 불러올지 정하는 데 쓴다. */
export function hasUsedMermaid(): boolean {
  try {
    return localStorage.getItem(USED_KEY) === "1";
  } catch {
    return false;
  }
}

function markMermaidUsed(): void {
  try {
    localStorage.setItem(USED_KEY, "1");
  } catch {
    // 못 적어도 그림은 그려졌다.
  }
}

/** 언어 이름이 mermaid인지 (대소문자·공백 무시). */
export function isMermaidLanguage(language: string | null | undefined): boolean {
  return language?.trim().toLowerCase() === "mermaid";
}

/** mermaid의 오류 글은 길고 영어라서, 앞의 몇 줄만 보여 준다. 글이 비었으면 빈 문자열(화면이 안내 글로 채운다). */
export function summarizeMermaidError(error: unknown, maxLines = 4): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "";
  return lines.slice(0, maxLines).join("\n");
}

/**
 * 같은 소스를 다시 그리지 않도록 결과를 기억한다(페이지를 다시 열 때 바로 그림이 나온다). 성공한 그림만 담고 가장 오래 안 쓴 것부터 버린다.
 * mermaid는 같은 소스·같은 설정이면 같은 그림을 내므로 안전하다.
 */
const CACHE_LIMIT = 64;
const cache = new Map<string, MermaidResult>();

/** 이미 그려 둔 그림이 있으면 돌려준다(없으면 `null`). 화면이 처음부터 그림을 보이는 데 쓴다. */
export function peekMermaid(source: string): MermaidResult | null {
  const hit = cache.get(source);
  if (!hit) return null;
  cache.delete(source);
  cache.set(source, hit); // 최근에 쓴 것으로
  return hit;
}

function remember(source: string, result: MermaidResult): void {
  if (!result.ok) return;
  cache.delete(source);
  cache.set(source, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
}

let counter = 0;
// mermaid는 같은 시각에 여러 번 그리면 서로의 임시 요소를 건드릴 수 있어, 한 번에 하나씩 그린다.
let queue: Promise<unknown> = Promise.resolve();

/** 소스를 그림으로 만든다. 문법이 틀려도 던지지 않고 `{ ok: false }`로 돌려준다. */
export function renderMermaid(source: string): Promise<MermaidResult> {
  const cached = peekMermaid(source);
  if (cached) return Promise.resolve(cached);
  const task = queue.then(async (): Promise<MermaidResult> => {
    const again = peekMermaid(source); // 줄을 서는 동안 같은 소스가 그려졌을 수 있다
    if (again) return again;
    const id = `mermaid-render-${++counter}`;
    try {
      const mermaid = await loadMermaid();
      // render()는 문법이 틀려도 던지지 않고 "문법 오류" 그림을 돌려준다. 먼저 검사해서 오류로 다룬다.
      await mermaid.parse(source);
      const { svg } = await mermaid.render(id, source);
      const result: MermaidResult = { ok: true, svg };
      remember(source, result);
      markMermaidUsed();
      return result;
    } catch (error) {
      // 실패하면 mermaid가 오류 그림이 든 임시 요소를 body에 남긴다. 치운다.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
      return { ok: false, error: summarizeMermaidError(error) };
    }
  });
  queue = task;
  return task;
}
