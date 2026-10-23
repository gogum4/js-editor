import type { Editor } from "@tiptap/core";
import { NodeSelection, Selection } from "@tiptap/pm/state";

import { altFromFileName, checkImageFile, MAX_ASSET_BYTES, SUPPORTED_IMAGE_TYPES } from "@9um4-utils/editor-schema/assets";
import { portsOf, stringsOf } from "../ports/editorPorts";

/**
 * 이미지를 넣으면 이미지 블록이 선택된 채로 남는다. 그대로 두면 다음 붙여넣기·입력이 그 이미지를 **덮어쓰므로**
 * 커서를 이미지 바로 뒤(다음 문단의 처음)로 옮긴다. 뒤에 문단이 없으면 에디터가 끝에 두는 빈 문단으로 간다.
 */
export function moveCursorAfterSelection(editor: Editor): void {
  const { state, view } = editor;
  if (!(state.selection instanceof NodeSelection)) return;
  const after = Selection.near(state.doc.resolve(state.selection.to), 1);
  view.dispatch(state.tr.setSelection(after).scrollIntoView());
}

/**
 * 이미지 파일들을 저장소에 넣고(같은 내용은 한 번만 저장) 커서 자리(또는 `position`)에 이미지 블록으로 끼운다.
 * 받지 못하는 파일(형식·크기)은 건너뛰고 안내하며, 나머지는 계속 넣는다. 넣은 개수를 돌려준다.
 */
export async function insertImageFiles(editor: Editor, files: readonly File[], position?: number): Promise<number> {
  const { assets, notifier } = portsOf(editor);
  const strings = stringsOf(editor).image;
  let inserted = 0;
  let at = position;
  for (const file of files) {
    const check = checkImageFile(file);
    if (!check.ok) {
      const reason = check.code === "type" ? strings.unsupportedType : check.code === "empty" ? strings.emptyFile : strings.tooLarge(MAX_ASSET_BYTES / 1024 / 1024);
      notifier.notice(strings.rejected(file.name || strings.fallbackName, reason));
      continue;
    }
    try {
      const info = await assets.put(new Uint8Array(await file.arrayBuffer()));
      const content = { type: "image", attrs: { hash: info.hash, mime: info.mime, alt: altFromFileName(file.name) } };
      const chain = editor.chain().focus();
      if (at === undefined) chain.insertContent(content).run();
      else chain.insertContentAt(at, content).run();
      moveCursorAfterSelection(editor);
      // 이어서 넣는 이미지는 방금 넣은 이미지 뒤에 둔다.
      at = editor.state.selection.to;
      inserted += 1;
    } catch (error) {
      notifier.error(error);
    }
  }
  return inserted;
}

/** 이미지 파일을 고르는 창을 열어, 고른 이미지를 커서 자리에 끼운다 (`/이미지`). */
export function openImagePicker(editor: Editor): void {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = SUPPORTED_IMAGE_TYPES.join(",");
  input.onchange = () => {
    const files = [...(input.files ?? [])];
    if (files.length > 0) void insertImageFiles(editor, files);
  };
  input.click();
}
