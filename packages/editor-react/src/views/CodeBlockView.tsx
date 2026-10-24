import { type NodeViewProps, NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

import { resolveLanguage } from "@9um4/editor-schema/codeLanguages";
import { isMermaidLanguage } from "@9um4/editor-core";
import { LanguagePicker } from "./LanguagePicker";
import { MermaidPreview } from "./MermaidPreview";
import { useEditorStrings } from "../context";

type CopyState = "idle" | "copied" | "failed";

/** 코드 블록 한 개의 화면: 위쪽에 언어 선택과 복사 버튼, 아래에 코드. */
export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const strings = useEditorStrings();
  const attrLanguage = (node.attrs.language as string | null) ?? null;
  // 저장된 값이 별칭(ts)이어도 목록에는 정식 이름(typescript)으로 보인다. 모르는 이름은 그대로 보여 준다.
  const shown = resolveLanguage(attrLanguage) ?? (attrLanguage?.trim() ? attrLanguage : null);

  const isMermaid = isMermaidLanguage(attrLanguage);
  // 그림이 있는 블록에서만 쓰는 것: 코드를 접고 그림만 볼 수 있다. 접어도 코드는 그대로 남아 있다.
  const [codeHidden, setCodeHidden] = useState(false);

  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopyState("copied");
    } catch (error) {
      console.warn("코드를 복사하지 못했어요", error);
      setCopyState("failed");
    }
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 1500);
  };

  return (
    <NodeViewWrapper className="code-block">
      {/* 이 막대는 편집 대상이 아니다. 누를 때 에디터의 선택이 옮겨 가지 않게 mousedown을 막는다. */}
      <div className="code-block-bar" contentEditable={false}>
        <LanguagePicker value={shown} onChange={(language) => updateAttributes({ language })} />
        <div className="code-block-actions">
          {isMermaid && (
            <button
              type="button"
              className="code-block-toggle"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setCodeHidden((hidden) => !hidden)}
            >
              {codeHidden ? strings.codeBlock.show : strings.codeBlock.hide}
            </button>
          )}
          <button
            type="button"
            className="code-block-copy"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void copy()}
          >
            {copyState === "copied" ? strings.codeBlock.copied : copyState === "failed" ? strings.codeBlock.copyFailed : strings.codeBlock.copy}
          </button>
        </div>
      </div>
      {/* 코드를 접어도 NodeViewContent는 그대로 두어야 문서 내용이 유지된다. 화면에서만 숨긴다. */}
      <pre hidden={isMermaid && codeHidden}>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {isMermaid && <MermaidPreview source={node.textContent} />}
    </NodeViewWrapper>
  );
}
