import { useEffect, useRef } from "react";

import { insertPreview } from "@9um4/editor-core";
import type { LatexCommand } from "@9um4/editor-core";
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
      className={above ? "md-latex md-latex-above" : "md-latex md-latex-below"}
    >
      <ul ref={listRef} role="listbox" aria-label={strings.latexCompletionLabel} className="md-latex-list">
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
            className="md-latex-item"
          >
            <span className="md-latex-name">{`\\${item.name}`}</span>
            <span className="md-latex-desc">{item.desc}</span>
            <span className="md-latex-kind">{item.kind}</span>
          </li>
        ))}
      </ul>
      {current && <Detail command={current} />}
      <p className="md-latex-hint">{strings.latexCompletionHint}</p>
    </div>
  );
}

/** 활성 항목의 설명: 전체 설명, 그려 본 예시, 들어갈 글자. */
function Detail({ command }: { command: LatexCommand }) {
  const strings = useEditorStrings().math;
  const { html } = useMathHtml(command.example, false);
  return (
    <div data-testid="latex-completion-detail" className="md-latex-detail">
      <p className="md-latex-detail-title">
        <span className="md-latex-detail-name">{`\\${command.name}`}</span> — {command.desc}
      </p>
      <div className="md-latex-detail-row">
        <div className="md-latex-example" data-testid="latex-completion-example">
          {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span className="md-latex-example-empty">…</span>}
        </div>
        <code className="md-latex-insert" title={strings.latexInsertedTitle}>
          {insertPreview(command)}
        </code>
      </div>
    </div>
  );
}
