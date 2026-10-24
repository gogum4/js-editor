import { useEffect, useRef, useState } from "react";

import { type MermaidResult, peekMermaid, renderMermaid } from "@gogum4/editor-core";
import { MermaidViewer } from "./MermaidViewer";
import { useEditorStrings } from "../context";

/** 입력이 멈춘 뒤 이만큼 지나야 다시 그린다. 타이핑하는 동안 문법이 계속 틀려 있는 것을 보여 주지 않으려는 것. */
const RENDER_DELAY_MS = 400;

/** `mermaid` 코드 블록 아래에 보이는 그림. 소스가 바뀌면 잠시 뒤 다시 그린다. */
export function MermaidPreview({ source }: { source: string }) {
  const strings = useEditorStrings();
  // 이미 그려 둔 그림이면 처음부터 보인다(페이지를 다시 열 때 기다리지 않는다).
  const [result, setResult] = useState<MermaidResult | null>(() => peekMermaid(source));
  const rendered = useRef(false);
  const [viewing, setViewing] = useState(false);
  const empty = source.trim().length === 0;

  useEffect(() => {
    if (empty) return;
    let stale = false;
    // 처음 그릴 때는 기다리지 않는다. 지연은 타이핑으로 소스가 바뀔 때만 둔다(문법이 틀려 있는 중간 상태를 보여 주지 않으려는 것).
    const delay = rendered.current ? RENDER_DELAY_MS : 0;
    rendered.current = true;
    const timer = window.setTimeout(() => {
      void renderMermaid(source).then((next) => {
        if (!stale) setResult(next);
      });
    }, delay);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [source, empty]);

  // 그림이 없어지면(비었거나 문법 오류) 열려 있던 보기 창도 닫는다. 나중에 그림이 돌아와도 저절로 열리지 않게.
  const failed = result !== null && !result.ok;
  useEffect(() => {
    if (empty || failed) setViewing(false);
  }, [empty, failed]);

  // 이 영역은 편집 대상이 아니다(`contentEditable={false}`).
  if (empty) {
    return (
      <div className="mermaid-preview mermaid-empty" contentEditable={false}>
        {strings.mermaid.empty}
      </div>
    );
  }
  if (!result) {
    return (
      <div className="mermaid-preview mermaid-empty" contentEditable={false}>
        {strings.mermaid.loading}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="mermaid-preview mermaid-error" contentEditable={false} role="alert">
        <strong>{strings.mermaid.syntaxError}</strong>
        <pre>{result.error || strings.mermaid.emptyError}</pre>
      </div>
    );
  }
  // 그림을 누르면(또는 Enter·Space) 화면 전체의 보기 창이 열린다.
  // svg는 mermaid가 `securityLevel: "strict"`로 걸러 낸 결과다.
  return (
    <>
      <div
        className="mermaid-preview mermaid-clickable"
        contentEditable={false}
        role="button"
        tabIndex={0}
        title={strings.mermaid.enlargeTitle}
        aria-label={strings.mermaid.enlargeLabel}
        onClick={() => setViewing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setViewing(true);
          }
        }}
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
      {viewing && <MermaidViewer svg={result.svg} onClose={() => setViewing(false)} />}
    </>
  );
}
