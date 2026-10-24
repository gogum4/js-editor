import { enStrings, type EditorStrings, koStrings, memoryPorts } from "@gogum4/editor-core";
import { createReactExtensions, EditorPortsProvider, FootnoteEditorHost, MathEditorHost, TableToolbar } from "@gogum4/editor-react";
import { docToMarkdown, type ImportContext, markdownToDoc } from "@gogum4/editor-markdown";
import { isSafeToOpen } from "@gogum4/editor-schema/safeLink";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";

import { allowedSlashItems } from "./features.ts";
import type { InitMessage } from "./protocol.ts";
import type { Transport } from "./transport.ts";

/** 입력이 멈춘 뒤 이만큼 기다렸다가 Markdown으로 내보낸다. */
export const CHANGE_DELAY_MS = 250;

/** 호스트 메시지 중 편집기가 직접 처리하는 것들. */
export interface EmbedEditorHandle {
  setMarkdown(markdown: string): void;
  insertMarkdown(markdown: string): void;
  focus(): void;
}

const IMPORT_CONTEXT: ImportContext = { resolvePage: () => null, resolveImage: () => null };

/** 일정 설명 같은 일반 글: 줄바꿈 한 개는 눈에 보이는 줄바꿈이고, 내보낼 때도 그냥 줄바꿈이다. */
function exportMarkdown(editor: Editor): string {
  return docToMarkdown(editor.getJSON(), { pageTitle: () => null, hardBreakStyle: "newline" }).markdown;
}

interface Props {
  init: InitMessage;
  readOnly: boolean;
  transport: Transport;
  handle: Ref<EmbedEditorHandle>;
}

export function EmbedEditor({ init, readOnly, transport, handle }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef<string | null>(null);
  const rev = useRef(0);
  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  const ports = useMemo(
    () =>
      memoryPorts({
        links: { open: async (url) => transport.send({ v: 1, type: "openLink", url }) },
        notifier: { notice: () => {}, error: (error) => transport.send({ v: 1, type: "error", message: error instanceof Error ? error.message : String(error) }) },
      }),
    [transport],
  );

  const strings: EditorStrings = useMemo(() => {
    const base = init.locale === "en" ? enStrings : koStrings;
    return init.placeholder === "" ? base : { ...base, placeholder: { ...base.placeholder, empty: init.placeholder } };
  }, [init.locale, init.placeholder]);

  const extensions = useMemo(
    () =>
      createReactExtensions(null, {
        ports,
        strings,
        markdown: IMPORT_CONTEXT,
        // 열자마자 문서 정리를 끝낸다(원자 노드를 처음 누를 때의 선택 오류 방지). 연 직후의 내보낸 글을 기준으로 삼으므로 변경으로 치지 않는다.
        settle: true,
        slashItems: (core) => allowedSlashItems(core, init.features),
      }),
    [ports, strings, init.features],
  );

  const flush = (editor: Editor) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const markdown = exportMarkdown(editor);
    if (markdown === baseline.current) return;
    baseline.current = markdown;
    rev.current += 1;
    transport.send({ v: 1, type: "change", markdown, rev: rev.current });
  };

  const editor = useEditor({
    extensions,
    // 마운트할 때만 읽는다(호스트가 `init`을 다시 보내면 컴포넌트가 새로 뜬다). 읽는 것만으로는 `change`가 나가지 않는다.
    content: markdownToDoc(init.markdown, IMPORT_CONTEXT, "").doc,
    editable: !init.readOnly,
    immediatelyRender: false,
    editorProps: { attributes: { class: "md-editor", "aria-label": "본문" } },
    onCreate: ({ editor: current }) => {
      baseline.current = exportMarkdown(current);
    },
    onUpdate: ({ editor: current }) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(current), CHANGE_DELAY_MS);
    },
    onFocus: () => transport.send({ v: 1, type: "focus" }),
    onBlur: ({ editor: current }) => {
      // 포커스를 잃을 때 아직 안 보낸 입력은 바로 보낸다(호스트가 저장하러 가기 전에).
      if (timer.current !== null) flush(current);
      transport.send({ v: 1, type: "blur" });
    },
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useImperativeHandle(
    handle,
    () => ({
      setMarkdown: (markdown) => {
        if (editor === null) return;
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        editor.commands.setContent(markdownToDoc(markdown, IMPORT_CONTEXT, "").doc, { emitUpdate: false });
        baseline.current = exportMarkdown(editor);
      },
      insertMarkdown: (markdown) => {
        if (editor === null) return;
        editor.chain().focus().insertContent(markdownToDoc(markdown, IMPORT_CONTEXT, "").doc.content ?? []).run();
      },
      focus: () => void editor?.commands.focus("end"),
    }),
    [editor],
  );

  // 읽기 전용에서는 링크를 그냥 눌러 연다(터치 화면에는 Ctrl+클릭이 없다). 열기는 호스트가 한다.
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => {
      if (!readOnlyRef.current) return;
      const link = (event.target as HTMLElement | null)?.closest("a");
      const href = link?.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      if (isSafeToOpen(href)) transport.send({ v: 1, type: "openLink", url: href });
    };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [transport]);

  // 내용 높이를 호스트에 알린다.
  useEffect(() => {
    const element = wrapper.current;
    if (!element || !init.autoHeight) return;
    let last = -1;
    const report = () => {
      const px = Math.ceil(element.getBoundingClientRect().height);
      if (px !== last) {
        last = px;
        transport.send({ v: 1, type: "height", px });
      }
    };
    const observer = new ResizeObserver(report);
    observer.observe(element);
    report();
    return () => observer.disconnect();
  }, [transport, init.autoHeight]);

  // 떠날 때(다른 일정으로 넘어가 컴포넌트가 새로 뜰 때) 남은 입력을 보낸다.
  useEffect(
    () => () => {
      if (timer.current !== null && editor && !editor.isDestroyed) flush(editor);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  return (
    <EditorPortsProvider ports={ports}>
      <div ref={wrapper} className={init.autoHeight ? "embed-root" : "embed-root embed-fill"}>
        <EditorContent editor={editor} />
        <TableToolbar editor={editor} />
        <MathEditorHost />
        <FootnoteEditorHost />
      </div>
    </EditorPortsProvider>
  );
}
