import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useRef, useState } from "react";

import {
  IMAGE_WIDTH_PRESETS,
  type ImageAlign,
  imageLayout,
  matchingPreset,
  presetWidth,
  resizedWidth,
} from "@gogum4/editor-schema/imageLayout";
import { AssetImage } from "./AssetImage";
import { useEditorStrings } from "../context";

const ALIGN_BUTTONS: ReadonlyArray<{ align: ImageAlign }> = [{ align: "left" }, { align: "center" }, { align: "right" }];

/**
 * 에디터 안의 이미지 블록. 누르면 블록이 선택되고(Backspace로 지움) 드래그로 옮길 수 있다.
 * 선택하면 위에 **정렬·크기 막대**가 뜨고 양쪽 아래 모서리에 **크기 손잡이**가 생긴다. 손잡이를 끌면 비율을 지킨 채 너비가 바뀐다
 * (너비만 저장하고 높이는 비율대로 정해진다). 끄는 동안은 화면에서만 바꾸고 손을 뗄 때 한 번에 저장한다(되돌리기 한 번에 취소).
 */
export function ImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const strings = useEditorStrings().image;
  const hash = String(node.attrs.hash ?? "");
  const mime = String(node.attrs.mime ?? "");
  const alt = String(node.attrs.alt ?? "");
  const { width, align } = imageLayout(node.attrs);

  const frameRef = useRef<HTMLDivElement>(null);
  // 끄는 중의 너비(저장 전). 끝나면 null.
  const [draft, setDraft] = useState<number | null>(null);
  const shownWidth = draft ?? width;

  /** 이미지가 놓일 칸(에디터 본문)의 너비. */
  const containerWidth = () => frameRef.current?.parentElement?.getBoundingClientRect().width ?? 0;

  const startResize = (side: "left" | "right") => (event: React.PointerEvent) => {
    const frame = frameRef.current;
    if (!frame || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = frame.getBoundingClientRect().width;
    const container = containerWidth();
    let latest = Math.round(startWidth);
    // 끄는 동안 이미지 블록이 "끌어서 옮기기"로 잡히지 않게 한다.
    const blockDrag = (e: Event) => e.preventDefault();
    document.addEventListener("dragstart", blockDrag, true);

    const move = (e: PointerEvent) => {
      latest = resizedWidth(startWidth, e.clientX - startX, side, align, container);
      setDraft(latest);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.removeEventListener("dragstart", blockDrag, true);
      setDraft(null);
      if (latest !== Math.round(startWidth)) updateAttributes({ width: latest });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const activePreset = matchingPreset(width, containerWidth());

  return (
    <NodeViewWrapper className={["image-block", selected ? "is-selected" : ""].filter(Boolean).join(" ")} data-image-hash={hash} contentEditable={false}>
      <div
        ref={frameRef}
        className="image-frame"
        data-align={align}
        data-sized={shownWidth !== null ? "true" : undefined}
        data-resizing={draft !== null ? "true" : undefined}
        style={shownWidth !== null ? { width: shownWidth } : undefined}
      >
        <AssetImage hash={hash} mime={mime} alt={alt} />
        {selected && (
          <>
            <div className="image-toolbar" role="toolbar" aria-label={strings.toolbarLabel} onMouseDown={(event) => event.preventDefault()}>
              {ALIGN_BUTTONS.map((button) => (
                <button
                  key={button.align}
                  type="button"
                  title={strings.align[button.align].title}
                  aria-pressed={align === button.align}
                  data-image-align={button.align}
                  onClick={() => updateAttributes({ textAlign: button.align === "left" ? null : button.align })}
                >
                  {strings.align[button.align].label}
                </button>
              ))}
              <span className="image-toolbar-sep" aria-hidden="true" />
              {IMAGE_WIDTH_PRESETS.map((percent) => (
                <button
                  key={percent}
                  type="button"
                  title={percent === 100 ? strings.widthFull : strings.widthPercent(percent)}
                  aria-pressed={activePreset === percent}
                  data-image-preset={percent}
                  onClick={() => updateAttributes({ width: presetWidth(percent, containerWidth()) })}
                >
                  {percent}%
                </button>
              ))}
              <button
                type="button"
                title={strings.originalSize}
                aria-pressed={width === null}
                data-image-preset="original"
                onClick={() => updateAttributes({ width: null })}
              >
                {strings.originalShort}
              </button>
              {draft !== null && <span className="image-toolbar-size">{draft}px</span>}
            </div>
            {(["left", "right"] as const).map((side) => (
              <div
                key={side}
                className="image-resize-handle"
                data-side={side}
                role="separator"
                aria-label={side === "left" ? strings.resizeLeft : strings.resizeRight}
                onPointerDown={startResize(side)}
              />
            ))}
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
