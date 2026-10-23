import { createContext, type ReactNode, useContext } from "react";

import { koStrings } from "@9um4-utils/editor-core";
import type { EditorStrings } from "@9um4-utils/editor-core";
import { memoryPorts } from "@9um4-utils/editor-core";
import type { EditorPorts } from "@9um4-utils/editor-core";

const fallbackPorts = memoryPorts();
const EditorPortsContext = createContext<EditorPorts>(fallbackPorts);
const EditorStringsContext = createContext<EditorStrings>(koStrings);

/**
 * 에디터 화면(NodeView 등)이 쓸 포트와 글을 정한다. 에디터 바깥에서 `AssetImage`를 쓰는 화면도 이 안에 있어야 한다.
 * `strings`를 생략하면 한국어다.
 */
export function EditorPortsProvider({ ports, strings = koStrings, children }: { ports: EditorPorts; strings?: EditorStrings; children: ReactNode }) {
  return (
    <EditorPortsContext.Provider value={ports}>
      <EditorStringsContext.Provider value={strings}>{children}</EditorStringsContext.Provider>
    </EditorPortsContext.Provider>
  );
}

/** 화면에서 포트를 얻는다. 제공자가 없으면 메모리 기본값이다. */
export function useEditorPorts(): EditorPorts {
  return useContext(EditorPortsContext);
}

/** 화면에서 글 사전을 얻는다. 제공자가 없으면 한국어다. */
export function useEditorStrings(): EditorStrings {
  return useContext(EditorStringsContext);
}
