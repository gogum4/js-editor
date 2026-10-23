import { useEffect, useRef, useState } from "react";

import { EmbedEditor, type EmbedEditorHandle } from "./EmbedEditor.tsx";
import { type InitMessage, parseHostMessage, PROTOCOL_VERSION, type Theme } from "./protocol.ts";
import { detectTransport, type HostWindow, listen } from "./transport.ts";

/** 테마의 기본 바탕·글자색. `init.background`가 있으면 바탕은 그것을 쓴다. */
const THEME_COLORS: Record<Theme, { background: string; color: string }> = {
  light: { background: "#ffffff", color: "#262626" },
  dark: { background: "#171717", color: "#f5f5f5" },
};

export function App({ win }: { win: Window & typeof globalThis }) {
  const transport = useRef(detectTransport(win as unknown as HostWindow)).current;
  // `key`: `init`을 받을 때마다 에디터를 새로 띄운다(다른 일정을 열 때 이전 상태가 남지 않게).
  const [session, setSession] = useState<{ key: number; init: InitMessage } | null>(null);
  const [theme, setTheme] = useState<Theme>("light");
  const [readOnly, setReadOnly] = useState(false);
  const handle = useRef<EmbedEditorHandle>(null);
  const background = session?.init.background ?? null;

  useEffect(() => {
    const stop = listen(win as unknown as HostWindow, (value) => {
      const message = parseHostMessage(value);
      if (message === null) return;
      switch (message.type) {
        case "init":
          setTheme(message.theme);
          setReadOnly(message.readOnly);
          setSession((previous) => ({ key: (previous?.key ?? 0) + 1, init: message }));
          break;
        case "setMarkdown":
          handle.current?.setMarkdown(message.markdown);
          break;
        case "setTheme":
          setTheme(message.theme);
          break;
        case "setReadOnly":
          setReadOnly(message.readOnly);
          break;
        case "focus":
          handle.current?.focus();
          break;
        case "insertMarkdown":
          handle.current?.insertMarkdown(message.markdown);
          break;
      }
    });
    const onError = (event: ErrorEvent) => transport.send({ v: 1, type: "error", message: event.message });
    const onRejection = (event: PromiseRejectionEvent) => transport.send({ v: 1, type: "error", message: String(event.reason) });
    win.addEventListener("error", onError);
    win.addEventListener("unhandledrejection", onRejection);
    transport.send({ v: 1, type: "ready", protocol: PROTOCOL_VERSION });
    return () => {
      stop();
      win.removeEventListener("error", onError);
      win.removeEventListener("unhandledrejection", onRejection);
    };
  }, [win, transport]);

  useEffect(() => {
    const colors = THEME_COLORS[theme];
    win.document.documentElement.setAttribute("data-md-theme", theme);
    win.document.body.style.background = background ?? colors.background;
    win.document.body.style.color = colors.color;
  }, [win, theme, background]);

  if (session === null) return null;
  return <EmbedEditor key={session.key} init={session.init} readOnly={readOnly} transport={transport} handle={handle} />;
}
