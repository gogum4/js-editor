"use client";

import { useEffect, useId, useState } from "react";

export interface MermaidDiagramProps {
  /** mermaid 소스. */
  source: string;
  /** mermaid 테마. 기본 `default`. */
  theme?: "default" | "dark" | "neutral" | "forest";
}

type State = { status: "pending" } | { status: "ready"; svg: string } | { status: "failed" };

/**
 * mermaid 다이어그램. **서버(와 JS가 꺼진 환경)에서는 소스를 담은 `<pre class="mermaid">`** 가 나오고,
 * 브라우저에서 `mermaid`를 불러와 그림(SVG)으로 바꾼다. 문법이 틀리거나 불러오지 못하면 소스가 그대로 남는다.
 * mermaid는 매우 커서 **이 컴포넌트가 브라우저에서 처음 그릴 때만** 동적으로 불러온다 — 선택 의존성(peer)이다.
 * `securityLevel: "strict"`라서 글 안의 스크립트·HTML은 실행되지 않는다.
 */
export function MermaidDiagram({ source, theme = "default" }: MermaidDiagramProps) {
  const [state, setState] = useState<State>({ status: "pending" });
  // mermaid가 SVG 안의 id로 쓰므로 영문·숫자만 남긴다.
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "pending" });
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "inherit" });
        // render()는 문법이 틀려도 던지지 않고 "문법 오류" 그림을 돌려주므로 먼저 검사한다.
        await mermaid.parse(source);
        const { svg } = await mermaid.render(id, source);
        if (!cancelled) setState({ status: "ready", svg });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [source, theme, id]);

  if (state.status === "ready") {
    return <div className="mermaid-diagram" role="img" aria-label="diagram" dangerouslySetInnerHTML={{ __html: state.svg }} />;
  }
  return <pre className="mermaid">{source}</pre>;
}
