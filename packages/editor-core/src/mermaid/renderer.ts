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

let counter = 0;
// mermaid는 같은 시각에 여러 번 그리면 서로의 임시 요소를 건드릴 수 있어, 한 번에 하나씩 그린다.
let queue: Promise<unknown> = Promise.resolve();

/** 소스를 그림으로 만든다. 문법이 틀려도 던지지 않고 `{ ok: false }`로 돌려준다. */
export function renderMermaid(source: string): Promise<MermaidResult> {
  const task = queue.then(async (): Promise<MermaidResult> => {
    const id = `mermaid-render-${++counter}`;
    try {
      const mermaid = await loadMermaid();
      // render()는 문법이 틀려도 던지지 않고 "문법 오류" 그림을 돌려준다. 먼저 검사해서 오류로 다룬다.
      await mermaid.parse(source);
      const { svg } = await mermaid.render(id, source);
      return { ok: true, svg };
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
