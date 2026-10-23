/**
 * 에디터 번들 ↔ 호스트(Flutter 앱 등)의 메시지 규약, 버전 1 (docs/EDITOR-EMBED.md).
 * 메시지는 JSON 객체이고 전송할 때는 JSON **문자열**이다(어느 WebView 채널이든 글자는 보낼 수 있다). 받을 때는 문자열과 객체를 모두 받는다.
 * 모르는 필드는 무시하고, 모르는 `type`은 버린다 — 호스트와 번들의 버전이 조금 달라도 깨지지 않게 하려는 것이다.
 */

export const PROTOCOL_VERSION = 1;

export type Theme = "light" | "dark";
export type Locale = "ko" | "en";

/** `/` 메뉴에 허용할 기능 묶음. 문단은 항상 있다. */
export const FEATURES = ["heading", "list", "task", "quote", "code", "divider", "table", "math", "callout", "footnote"] as const;
export type Feature = (typeof FEATURES)[number];
export const DEFAULT_FEATURES: readonly Feature[] = ["heading", "list", "task", "quote", "code", "divider"];

// ───────────────────────── 호스트 → 에디터 ─────────────────────────

export interface InitMessage {
  type: "init";
  /** 처음 열 Markdown. 빈 글이면 빈 문자열. */
  markdown: string;
  theme: Theme;
  readOnly: boolean;
  placeholder: string;
  locale: Locale;
  features: Feature[];
  /** 참이면 에디터가 내용 높이를 `height`로 알린다(호스트가 WebView 높이를 맞춘다). 거짓이면 창 높이를 채우고 안에서 스크롤한다. */
  autoHeight: boolean;
  /** 바탕색(CSS 색 글자). 없으면 테마의 기본 바탕. `transparent`도 된다(호스트 위젯이 비쳐 보이는지는 WebView 플러그인에 달렸다). */
  background: string | null;
}

export type HostMessage =
  | InitMessage
  /** 내용을 바꾼다(다른 일정으로 넘어갈 때 등). `change`를 보내지 않는다. */
  | { type: "setMarkdown"; markdown: string }
  | { type: "setTheme"; theme: Theme }
  | { type: "setReadOnly"; readOnly: boolean }
  | { type: "focus" }
  /** 커서 자리에 Markdown 조각을 끼운다. 끼우면 `change`가 나간다. */
  | { type: "insertMarkdown"; markdown: string };

// ───────────────────────── 에디터 → 호스트 ─────────────────────────

export type EditorMessage =
  /** 번들이 떴다. 호스트는 이것을 받은 뒤 `init`을 보낸다. */
  | { v: 1; type: "ready"; protocol: number }
  /** 사용자가 고쳐서 Markdown이 달라졌다(입력이 멈춘 뒤 250ms에 한 번). `rev`는 1부터 늘어난다. 열기만 한 것·`setMarkdown`은 보내지 않는다. */
  | { v: 1; type: "change"; markdown: string; rev: number }
  /** 내용 높이(px, 올림). `autoHeight`일 때만, 달라질 때마다. */
  | { v: 1; type: "height"; px: number }
  /** 링크를 열어 달라는 요청(WebView 안에서 직접 열지 않는다). 열어도 되는 주소만 온다. */
  | { v: 1; type: "openLink"; url: string }
  | { v: 1; type: "focus" }
  | { v: 1; type: "blur" }
  | { v: 1; type: "error"; message: string };

const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

/**
 * 호스트가 보낸 값(문자열이나 객체)을 메시지로. 올바르지 않거나 모르는 종류면 null.
 * `init`의 빠진 필드는 기본값으로 채운다(테마 light, 편집 가능, 안내 글 없음, 한국어, 기본 기능, 자동 높이 켬).
 */
export function parseHostMessage(raw: unknown): HostMessage | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const m = value as Record<string, unknown>;
  switch (m.type) {
    case "init": {
      if (typeof m.markdown !== "string") return null;
      const features = Array.isArray(m.features) ? m.features.filter((f): f is Feature => (FEATURES as readonly string[]).includes(f as string)) : [...DEFAULT_FEATURES];
      return {
        type: "init",
        markdown: m.markdown,
        theme: isTheme(m.theme) ? m.theme : "light",
        readOnly: m.readOnly === true,
        placeholder: typeof m.placeholder === "string" ? m.placeholder : "",
        locale: m.locale === "en" ? "en" : "ko",
        features,
        autoHeight: m.autoHeight !== false,
        background: typeof m.background === "string" && m.background.trim() !== "" ? m.background : null,
      };
    }
    case "setMarkdown":
    case "insertMarkdown":
      return typeof m.markdown === "string" ? { type: m.type, markdown: m.markdown } : null;
    case "setTheme":
      return isTheme(m.theme) ? { type: "setTheme", theme: m.theme } : null;
    case "setReadOnly":
      return typeof m.readOnly === "boolean" ? { type: "setReadOnly", readOnly: m.readOnly } : null;
    case "focus":
      return { type: "focus" };
    default:
      return null;
  }
}

/** 에디터 → 호스트로 보낼 글자. */
export function encodeEditorMessage(message: EditorMessage): string {
  return JSON.stringify(message);
}
