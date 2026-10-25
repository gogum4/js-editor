import { useEffect, useMemo, useRef, useState } from "react";

import { parsePlot } from "@gogum4/editor-schema/plot";
import { DEFAULT_PITCH, DEFAULT_YAW, plotToSvg } from "@gogum4/editor-schema/plotSvg";
import { useEditorStrings } from "../context";

/** 입력이 멈춘 뒤 이만큼 지나야 다시 그린다(타이핑하는 동안 식이 틀려 있는 중간 상태를 보여 주지 않으려는 것). */
const RENDER_DELAY_MS = 300;
/** 드래그 1px가 돌리는 각도(도). */
const DEGREES_PER_PIXEL = 0.5;

/**
 * `plot` 코드 블록 아래에 보이는 수식 그래프. 소스가 바뀌면 잠시 뒤 다시 그린다. 3D 곡면·곡선은 **끌어서 돌리고**, 더블클릭하면 처음 시점으로 돌아온다.
 * 그림은 `@gogum4/editor-schema/plotSvg`가 만든 SVG 글자다(사용자 글은 모두 이스케이프돼 있고 식은 `eval` 없이 계산한다).
 */
export function PlotPreview({ source }: { source: string }) {
  const strings = useEditorStrings().plot;
  const [text, setText] = useState(source);
  const first = useRef(true);
  const [view, setView] = useState({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    // 처음 그릴 때는 기다리지 않는다(`useState`의 처음 값으로 이미 그렸다).
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => setText(source), RENDER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [source]);

  const parsed = useMemo(() => parsePlot(text), [text]);
  const is3d = parsed.ok && parsed.spec.kind === "3d";
  const svg = useMemo(() => (parsed.ok ? plotToSvg(parsed.spec, is3d ? view : {}) : ""), [parsed, is3d, view]);

  if (text.trim() === "") {
    return (
      <div className="plot-preview plot-empty" contentEditable={false}>
        {strings.empty}
      </div>
    );
  }
  if (!parsed.ok) {
    return (
      <div className="plot-preview plot-error" contentEditable={false} role="alert">
        <strong>{strings.syntaxError}</strong>
        <div>{strings.error(parsed.error)}</div>
      </div>
    );
  }
  return (
    <div
      className={`plot-preview${is3d ? " plot-3d" : ""}`}
      contentEditable={false}
      title={is3d ? strings.dragHint : undefined}
      onPointerDown={
        is3d
          ? (event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, ...view };
            }
          : undefined
      }
      onPointerMove={
        is3d
          ? (event) => {
              const start = drag.current;
              if (!start) return;
              setView({
                yaw: start.yaw + (event.clientX - start.x) * DEGREES_PER_PIXEL,
                pitch: Math.min(89, Math.max(-89, start.pitch + (event.clientY - start.y) * DEGREES_PER_PIXEL)),
              });
            }
          : undefined
      }
      onPointerUp={is3d ? () => (drag.current = null) : undefined}
      onPointerCancel={is3d ? () => (drag.current = null) : undefined}
      onDoubleClick={is3d ? () => setView({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH }) : undefined}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
