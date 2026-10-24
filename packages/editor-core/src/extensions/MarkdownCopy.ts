import { Extension } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { docToMarkdown, type MarkdownOptions } from "@gogum4/editor-markdown";
import type { PmNode } from "@gogum4/editor-schema/pmDoc";

/** 복사할 때 클립보드의 일반 텍스트(`text/plain`)를 Markdown으로 채우는 옵션. 비우면(`null`) 켜지 않는다. */
export type MarkdownCopyOptions = Partial<MarkdownOptions> | null;

/** 복사하는 조각을 Markdown으로. 글자 일부만 고른 조각(문단 안의 글)은 문단으로 감싼다. */
export function sliceToMarkdown(slice: Slice, options: Partial<MarkdownOptions>): string {
  const content = slice.content.toJSON() as PmNode[] | null;
  if (!content || content.length === 0) return "";
  const inlineOnly = slice.content.firstChild?.isInline === true;
  const blocks = inlineOnly ? [{ type: "paragraph", content }] : content;
  // 파일용 끝 줄바꿈은 클립보드에 필요 없다.
  return docToMarkdown({ type: "doc", content: blocks }, { pageTitle: () => null, ...options }).markdown.replace(/\n+$/, "");
}

/**
 * 복사하면 `text/plain`이 Markdown이 된다 (docs/MARKDOWN-DIALECT.md). `text/html`은 그대로라서 에디터끼리의 복사·웹 페이지 붙여넣기는 변하지 않고,
 * Obsidian 같은 일반 텍스트 편집기에 붙이면 문법이 유지된다. **기본은 꺼짐**이다 — 메모장 같은 곳에 붙이면 \`**굵게**\` 같은 기호가 보이기 때문이다.
 * 코드 블록 안의 글을 복사할 때는 코드 그대로 둔다.
 */
export const MarkdownCopy = Extension.create<{ markdown: MarkdownCopyOptions }>({
  name: "markdownCopy",
  // 기본 clipboardTextSerializer(TipTap 내장)보다 먼저 와야 한다.
  priority: 1000,

  addOptions: () => ({ markdown: null }),

  addProseMirrorPlugins() {
    const options = this.options.markdown;
    if (options === null) return [];
    return [
      new Plugin({
        key: new PluginKey("markdownCopy"),
        props: {
          clipboardTextSerializer(slice: Slice, view: EditorView) {
            if (view.state.selection.$from.parent.type.spec.code) return slice.content.textBetween(0, slice.content.size, "\n\n");
            return sliceToMarkdown(slice, options);
          },
        },
      }),
    ];
  },
});
