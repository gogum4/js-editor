import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import { isSafeToOpen, wantsToOpenLink } from "@9um4-utils/editor-schema/safeLink";
import { portsOf } from "../ports/editorPorts";

/**
 * 본문 링크의 클릭 동작을 정한다.
 * - **Ctrl/⌘+클릭**: 기본 브라우저(메일 주소는 메일 앱)에서 **한 번** 연다. http, https, mailto만 연다.
 * - 그 밖의 클릭(그냥, Shift, Alt): 링크 글자를 편집하는 것이고 아무것도 열지 않는다.
 *
 * opener 플러그인은 앱 전체에 "링크를 클릭하면 기본 브라우저로 연다"는 스크립트를 따로 넣는다
 * (`target="_blank"` 링크는 그냥 클릭에도, Ctrl/Shift+클릭에는 모든 외부 링크에 반응한다).
 * 그 스크립트는 이미 처리된(`defaultPrevented`) 클릭을 건너뛰므로, 에디터 안의 링크 클릭은 여기서 먼저
 * `preventDefault`로 처리해 두 번 열리거나 의도하지 않게 열리는 일을 막는다.
 */
export const LinkOpener = Extension.create({
  name: "linkOpener",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("linkOpener"),
        props: {
          handleDOMEvents: {
            click(view, event) {
              const anchor = (event.target as HTMLElement | null)?.closest("a");
              if (!anchor || !view.dom.contains(anchor)) return false;

              // 링크 위의 모든 클릭은 여기서 처리 완료로 표시한다 (플러그인의 전역 스크립트가 다시 열지 않게).
              event.preventDefault();

              const href = anchor.getAttribute("href");
              if (wantsToOpenLink(event) && href && isSafeToOpen(href)) {
                void portsOf(editor).links.open(href.trim()).catch((error: unknown) => {
                  console.warn("링크를 열지 못했어요", error);
                });
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});
