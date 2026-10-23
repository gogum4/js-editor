import { describe, expect, it, vi } from "vitest";

import { detectTransport, type HostWindow, listen } from "./transport.ts";

const base = (): HostWindow => ({ addEventListener: () => {}, removeEventListener: () => {} });
const ready = { v: 1, type: "ready", protocol: 1 } as const;

describe("detectTransport", () => {
  it("flutter_inappwebview → callHandler('editorHost', 글자)", () => {
    const callHandler = vi.fn();
    const t = detectTransport({ ...base(), flutter_inappwebview: { callHandler }, EditorHost: { postMessage: vi.fn() } });
    expect(t.name).toBe("flutter_inappwebview");
    t.send(ready);
    expect(callHandler).toHaveBeenCalledWith("editorHost", JSON.stringify(ready));
  });

  it("webview_flutter JavaScriptChannel(EditorHost) → postMessage(글자)", () => {
    const postMessage = vi.fn();
    const t = detectTransport({ ...base(), EditorHost: { postMessage } });
    expect(t.name).toBe("javascript_channel");
    t.send(ready);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(ready));
  });

  it("WebView2 chrome.webview → postMessage(글자)", () => {
    const postMessage = vi.fn();
    const t = detectTransport({ ...base(), chrome: { webview: { postMessage } } });
    expect(t.name).toBe("webview2");
    t.send(ready);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(ready));
  });

  it("iframe이면 부모 창에 postMessage(글자, '*')", () => {
    const postMessage = vi.fn();
    const t = detectTransport({ ...base(), parent: { postMessage } });
    expect(t.name).toBe("parent");
    t.send(ready);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(ready), "*");
  });

  it("최상위 창(부모가 자기 자신)이고 다른 길이 없으면 none", () => {
    const win = base();
    win.parent = win as unknown as HostWindow["parent"];
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const t = detectTransport(win);
    expect(t.name).toBe("none");
    t.send(ready);
    expect(debug).toHaveBeenCalled();
    debug.mockRestore();
  });
});

describe("listen", () => {
  it("message 이벤트와 전역 함수 두 길로 받고, 해제하면 정리한다", () => {
    let handler: ((event: { data: unknown }) => void) | null = null;
    const win: HostWindow = {
      addEventListener: (_type, listener) => {
        handler = listener;
      },
      removeEventListener: () => {
        handler = null;
      },
    };
    const seen: unknown[] = [];
    const stop = listen(win, (value) => seen.push(value));
    handler!({ data: "a" });
    win.__editorHostReceive!("b");
    expect(seen).toEqual(["a", "b"]);
    stop();
    expect(handler).toBeNull();
    expect(win.__editorHostReceive).toBeUndefined();
  });
});
