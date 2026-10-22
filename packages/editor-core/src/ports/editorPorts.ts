import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";

import { koStrings } from "../strings/ko";
import type { EditorStrings } from "../strings/types";
import { memoryPorts } from "./memory";
import type { EditorPorts } from "./types";

const fallbackPorts = memoryPorts();

interface PortsOptions {
  ports: EditorPorts | null;
  strings: EditorStrings | null;
}

/**
 * 에디터에 포트와 글 사전을 붙인다. 명령·붙여넣기 처리처럼 `editor`만 쥔 코드가 `portsOf(editor)`·`stringsOf(editor)`로 얻는다
 * (화면 쪽은 `useEditorPorts`·`useEditorStrings`). 같은 앱에서는 둘이 같은 객체여야 한다.
 */
export const EditorPortsExtension = Extension.create<PortsOptions, PortsOptions>({
  name: "editorPorts",
  addOptions: () => ({ ports: null, strings: null }),
  addStorage() {
    return { ports: this.options.ports, strings: this.options.strings };
  },
});

function storageOf(editor: Editor): Partial<PortsOptions> {
  return (editor.storage as { editorPorts?: PortsOptions }).editorPorts ?? {};
}

export function portsOf(editor: Editor): EditorPorts {
  return storageOf(editor).ports ?? fallbackPorts;
}

export function stringsOf(editor: Editor): EditorStrings {
  return storageOf(editor).strings ?? koStrings;
}
