/**
 * 호스트와 주고받는 길. 보내는 길은 환경에서 자동으로 고르고(아래 순서), 받는 길은 두 가지를 모두 연다:
 * ① `window`의 `message` 이벤트(iframe 부모·WebView2 `chrome.webview`), ② 전역 함수 `window.__editorHostReceive(값)`(호스트가 `evaluateJavascript`로 부를 때).
 *
 * 보내는 길 순서: `flutter_inappwebview`(`callHandler("editorHost", 글자)`) → `webview_flutter`의 JavaScriptChannel(`EditorHost.postMessage(글자)`)
 * → WebView2(`chrome.webview.postMessage(글자)`) → 부모 창(`parent.postMessage(글자, "*")`, Flutter 웹의 iframe) → 없음(콘솔에만).
 * 모두 JSON **글자**를 보낸다.
 */
import { type EditorMessage, encodeEditorMessage } from "./protocol.ts";

export interface Transport {
  /** 어떤 길을 골랐는지(시험·진단용). */
  readonly name: "flutter_inappwebview" | "javascript_channel" | "webview2" | "parent" | "none";
  send(message: EditorMessage): void;
}

/** 시험에서 가짜 창을 주려고 필요한 모양만 적었다. */
export interface HostWindow {
  flutter_inappwebview?: { callHandler(name: string, ...args: unknown[]): unknown };
  EditorHost?: { postMessage(message: string): void };
  chrome?: { webview?: { postMessage(message: unknown): void } };
  parent?: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  __editorHostReceive?: (value: unknown) => void;
}

export function detectTransport(win: HostWindow): Transport {
  if (typeof win.flutter_inappwebview?.callHandler === "function") {
    const bridge = win.flutter_inappwebview;
    return { name: "flutter_inappwebview", send: (m) => void bridge.callHandler("editorHost", encodeEditorMessage(m)) };
  }
  if (typeof win.EditorHost?.postMessage === "function") {
    const channel = win.EditorHost;
    return { name: "javascript_channel", send: (m) => channel.postMessage(encodeEditorMessage(m)) };
  }
  if (typeof win.chrome?.webview?.postMessage === "function") {
    const webview = win.chrome.webview;
    return { name: "webview2", send: (m) => webview.postMessage(encodeEditorMessage(m)) };
  }
  // 자기 자신이 부모인 최상위 창이면 iframe이 아니다.
  if (win.parent && (win.parent as unknown) !== win) {
    const parent = win.parent;
    return { name: "parent", send: (m) => parent.postMessage(encodeEditorMessage(m), "*") };
  }
  return { name: "none", send: (m) => console.debug("[editor-embed] 호스트 없음:", encodeEditorMessage(m)) };
}

/** 호스트가 보낸 값을 받는다. 돌려주는 함수로 해제한다. */
export function listen(win: HostWindow, onValue: (value: unknown) => void): () => void {
  const onMessage = (event: { data: unknown }) => onValue(event.data);
  win.addEventListener("message", onMessage);
  win.__editorHostReceive = onValue;
  return () => {
    win.removeEventListener("message", onMessage);
    if (win.__editorHostReceive === onValue) delete win.__editorHostReceive;
  };
}
