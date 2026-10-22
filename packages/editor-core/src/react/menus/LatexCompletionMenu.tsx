import { useEffect, useRef } from "react";

import { insertPreview } from "../../lib/latexAssist";
import type { LatexCommand } from "../../lib/latexCommands";
import { useMathHtml } from "../hooks/useMathHtml";
import { useEditorStrings } from "../context";

interface LatexCompletionMenuProps {
  items: readonly LatexCommand[];
  active: number;
  /** 입력창 위쪽에 띄울지(아래에 자리가 모자랄 때). */
  above: boolean;
  onPick: (command: LatexCommand) => void;
  onHover: (index: number) => void;
}

/**
 * 수식 입력창의 `\명령` 후보 목록. 각 줄에 명령 이름·한 줄 설명·분류가 보이고,
 * 고른(활성) 항목은 아래 설명 칸에 **그려 본 예시**와 **들어갈 글자**를 보여 준다.
 * 마우스로 눌러도 입력창의 포커스가 빠지지 않는다(mousedown을 막는다).
 */
export function LatexCompletionMenu({ items, active, above, onPick, onHover }: LatexCompletionMenuProps) {
  const strings = useEditorStrings().math;
  const listRef = useRef<HTMLUListElement>(null);
  const current = items[active];

  // 키보드로 옮겨도 활성 항목이 목록 안에 보이게 한다.
  useEffect(() => {
    listRef.current?.querySelector("[data-active=true]")?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  return (
    <div
      data-testid="latex-completion"
      className={[
        "absolute right-0 left-0 z-10 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg",
        above ? "bottom-full mb-1" : "top-full mt-1",
      ].join(" ")}
    >
      <ul ref={listRef} role="listbox" aria-label={strings.latexCompletionLabel} className="max-h-44 overflow-y-auto p-1">
        {items.map((item, index) => (
          <li
            key={item.name}
            role="option"
            aria-selected={index === active}
            data-active={index === active}
            data-latex-command={item.name}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => onHover(index)}
            onClick={() => onPick(item)}
            className={[
              "flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1",
              index === active ? "bg-neutral-100" : "",
            ].join(" ")}
          >
            <span className="w-32 shrink-0 truncate font-mono text-sm text-neutral-800">{`\\${item.name}`}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-neutral-600">{item.desc}</span>
            <span className="shrink-0 text-[10px] text-neutral-400">{item.kind}</span>
          </li>
        ))}
      </ul>
      {current && <Detail command={current} />}
      <p className="border-t border-neutral-100 px-2 py-1 text-[10px] text-neutral-400">{strings.latexCompletionHint}</p>
    </div>
  );
}

/** 활성 항목의 설명: 전체 설명, 그려 본 예시, 들어갈 글자. */
function Detail({ command }: { command: LatexCommand }) {
  const strings = useEditorStrings().math;
  const { html } = useMathHtml(command.example, false);
  return (
    <div data-testid="latex-completion-detail" className="border-t border-neutral-100 bg-neutral-50 px-3 py-2">
      <p className="text-xs text-neutral-700">
        <span className="font-mono">{`\\${command.name}`}</span> — {command.desc}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="min-h-7 min-w-0 overflow-x-auto text-neutral-800" data-testid="latex-completion-example">
          {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span className="text-xs text-neutral-400">…</span>}
        </div>
        <code className="max-w-[45%] shrink-0 truncate text-[11px] text-neutral-500" title={strings.latexInsertedTitle}>
          {insertPreview(command)}
        </code>
      </div>
    </div>
  );
}
