import { useEffect, useState } from "react";
import { useEditorStrings } from "../ports/context";

/**
 * LaTeX 수식 렌더링(KaTeX). **수식을 처음 볼 때만 불러온다**(스타일·글꼴 포함, mermaid처럼) — 수식이 없는 페이지에서는 번들이 늘지 않는다.
 * 본문에는 LaTeX 글자(`latex`)만 저장하고 그림은 그때그때 그린다.
 */
type Katex = typeof import("katex").default;

let katexPromise: Promise<Katex> | null = null;

/** KaTeX와 그 스타일을 불러온다(한 번만). 실패하면 다음에 다시 시도할 수 있게 남겨 두지 않는다. */
export function loadKatex(): Promise<Katex> {
  if (!katexPromise) {
    katexPromise = Promise.all([import("katex"), import("katex/dist/katex.min.css")])
      .then(([module]) => module.default)
      .catch((error: unknown) => {
        katexPromise = null;
        throw error;
      });
  }
  return katexPromise;
}

/** 수식 글자의 한도(너무 긴 입력으로 화면이 느려지는 것을 막는다). */
export const MAX_LATEX_CHARS = 5000;

/**
 * LaTeX를 HTML로 바꾼다. 문법이 틀려도 던지지 않고 KaTeX가 틀린 글자를 빨갛게 보여 준다(`throwOnError: false`).
 * 링크·스타일 같은 위험한 명령은 막는다(`trust: false`, 기본값). `display`면 한 줄을 차지하는 큰 수식이다.
 */
export function renderMathHtml(katex: Katex, latex: string, display: boolean): string {
  return katex.renderToString(latex.slice(0, MAX_LATEX_CHARS), {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    output: "htmlAndMathml",
  });
}

/** LaTeX가 문법에 맞는지(렌더링하는 화면이 오류 안내를 보일 때 쓴다). 맞으면 null, 아니면 KaTeX의 오류 글. */
export function mathError(katex: Katex, latex: string): string | null {
  try {
    katex.renderToString(latex.slice(0, MAX_LATEX_CHARS), { throwOnError: true, trust: false, strict: "ignore" });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, "") : String(error);
  }
}

/** 수식을 그린 HTML. KaTeX를 불러오는 동안은 null(자리표시를 보여 준다). 입력이 바뀌면 다시 그린다. */
export function useMathHtml(latex: string, display: boolean): { html: string | null; error: string | null } {
  const libraryError = useEditorStrings().math.libraryError;
  const [state, setState] = useState<{ html: string | null; error: string | null }>({ html: null, error: null });
  useEffect(() => {
    if (latex.trim() === "") {
      setState({ html: "", error: null });
      return;
    }
    let cancelled = false;
    loadKatex()
      .then((katex) => {
        if (!cancelled) setState({ html: renderMathHtml(katex, latex, display), error: mathError(katex, latex) });
      })
      .catch(() => {
        if (!cancelled) setState({ html: null, error: libraryError });
      });
    return () => {
      cancelled = true;
    };
  }, [latex, display, libraryError]);
  return state;
}
