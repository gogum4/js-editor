import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  centerAt,
  constrainView,
  fitView,
  percentLabel,
  type Size,
  svgSize,
  type View,
  zoomAt,
} from "@9um4/editor-core";
import { useEditorStrings } from "../context";

/** 그림을 이 값만큼 곱해 키우고 줄이는 한 단계(버튼·키보드). */
const STEP = 1.25;
/** 이 거리(px) 안에서 끝난 누르기는 드래그가 아니라 클릭으로 본다. */
const CLICK_SLOP = 4;
/** 드래그를 시작한 곳이 그림 위였는지, 빈 배경이었는지와 지금까지 움직인 거리. */
interface DragState {
  startX: number;
  startY: number;
  origin: View;
  onContent: boolean;
  moved: number;
}

/**
 * mermaid 그림을 화면 전체에 크게 보여 주는 창. 처음엔 창에 맞춰 보여 주고,
 * 드래그로 옮기고, 휠(또는 버튼·+/-)로 확대·축소하고, 더블클릭으로 맞춤 ↔ 원래 크기를 오간다.
 * Esc, 닫기 버튼, 빈 배경을 누르면 닫힌다.
 */
export function MermaidViewer({ svg, onClose }: { svg: string; onClose: () => void }) {
  const strings = useEditorStrings().mermaid.viewer;
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  // 사용자가 아직 확대·이동을 하지 않았으면 창 크기가 바뀔 때 다시 맞춘다.
  const untouched = useRef(true);

  const size = useMemo<Size>(() => svgSize(svg) ?? { width: 800, height: 600 }, [svg]);
  const [view, setView] = useState<View | null>(null);
  const [dragging, setDragging] = useState(false);

  const viewportSize = useCallback((): Size => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 800, height: rect?.height ?? 600 };
  }, []);

  /** 이동·확대 결과를 화면 안에 걸쳐 있도록 맞춰 저장한다. */
  const apply = useCallback(
    (next: View) => setView(constrainView(next, size, viewportSize())),
    [size, viewportSize],
  );

  const fit = useCallback(() => {
    untouched.current = true;
    setView(fitView(size, viewportSize()));
  }, [size, viewportSize]);

  // 그림이 창 크기가 아니라 원래 크기로 놓이도록 SVG의 크기를 정한다(mermaid는 100% 너비와 최대 너비만 준다).
  useLayoutEffect(() => {
    const element = contentRef.current?.querySelector("svg");
    if (!element) return;
    element.setAttribute("width", String(size.width));
    element.setAttribute("height", String(size.height));
    element.style.maxWidth = "none";
    element.style.display = "block";
  }, [svg, size]);

  useLayoutEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    const onResize = () => {
      if (untouched.current) setView(fitView(size, viewportSize()));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [size, viewportSize]);

  // 열릴 때 창에 포커스를 두고(키 입력을 받으려고), 닫히면 원래 있던 곳으로 돌려준다.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // 휠은 브라우저가 기본으로 스크롤하지 않게 막아야 해서(passive: false) 직접 붙인다.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      untouched.current = false;
      const rect = viewport.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      // 터치패드의 모아 쥐기(ctrl+휠)는 값이 작게 오므로 더 크게 반영한다.
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015));
      setView((current) => (current ? constrainView(zoomAt(current, factor, point), size, viewportSize()) : current));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [size, viewportSize]);

  const zoomFromCenter = (factor: number) => {
    if (!view) return;
    untouched.current = false;
    const { width, height } = viewportSize();
    apply(zoomAt(view, factor, { x: width / 2, y: height / 2 }));
  };

  const actualSize = () => {
    untouched.current = false;
    setView(centerAt(size, viewportSize(), 1));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !view) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: view,
      onContent: !!contentRef.current?.contains(event.target as Node),
      moved: 0,
    };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    state.moved = Math.max(state.moved, Math.hypot(dx, dy));
    if (state.moved >= CLICK_SLOP) untouched.current = false;
    apply({ ...state.origin, x: state.origin.x + dx, y: state.origin.y + dy });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // 빈 배경을 (움직이지 않고) 눌렀으면 닫는다.
    if (state && !state.onContent && state.moved < CLICK_SLOP && event.type === "pointerup") onClose();
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!view) return;
    const fitted = fitView(size, viewportSize());
    if (Math.abs(view.scale - fitted.scale) < 0.01) {
      // 맞춤 상태면 눌린 자리를 중심으로 원래 크기로.
      const rect = event.currentTarget.getBoundingClientRect();
      untouched.current = false;
      apply(zoomAt(view, 1 / view.scale, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    } else {
      fit();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      case "+":
      case "=":
        event.preventDefault();
        zoomFromCenter(STEP);
        break;
      case "-":
      case "_":
        event.preventDefault();
        zoomFromCenter(1 / STEP);
        break;
      case "0":
        event.preventDefault();
        fit();
        break;
      case "1":
        event.preventDefault();
        actualSize();
        break;
      default:
    }
    // 뒤의 에디터나 전역 단축키로 키가 새지 않게 한다.
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={strings.label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-black/70 text-white outline-none"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="min-w-0 truncate text-white/70">{strings.hint}</span>
        <div className="flex shrink-0 items-center gap-1" data-mermaid-viewer-toolbar>
          <ToolButton label={strings.zoomOut} onClick={() => zoomFromCenter(1 / STEP)}>
            −
          </ToolButton>
          <span className="w-14 text-center tabular-nums" data-mermaid-viewer-zoom>
            {view ? percentLabel(view.scale) : ""}
          </span>
          <ToolButton label={strings.zoomIn} onClick={() => zoomFromCenter(STEP)}>
            +
          </ToolButton>
          <ToolButton label={strings.fit} onClick={fit}>
            {strings.fitShort}
          </ToolButton>
          <ToolButton label={strings.actualSize} onClick={actualSize}>
            100%
          </ToolButton>
          <ToolButton label={strings.close} onClick={onClose}>
            ✕
          </ToolButton>
        </div>
      </div>

      <div
        ref={viewportRef}
        data-mermaid-viewport
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        className={["relative flex-1 touch-none select-none overflow-hidden", dragging ? "cursor-grabbing" : "cursor-grab"].join(" ")}
      >
        <div
          ref={contentRef}
          data-mermaid-content
          role="img"
          aria-label={strings.diagram}
          className="absolute left-0 top-0 origin-top-left rounded-lg bg-white shadow-2xl"
          style={{
            width: size.width,
            height: size.height,
            transform: view ? `translate(${view.x}px, ${view.y}px) scale(${view.scale})` : "scale(0)",
          }}
          // svg는 mermaid가 `securityLevel: "strict"`로 걸러 낸 결과다.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>,
    document.body,
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="min-w-8 cursor-pointer rounded-md px-2 py-1 hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
