import { useEffect, useState } from "react";

import { loadKatex, mathError, renderMathHtml } from "../../lib/math";
import { useEditorStrings } from "../context";

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
