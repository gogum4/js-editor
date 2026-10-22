import type { AssetStore, EditorPorts, KeyValueStore, Notifier, UrlOpener } from "./types";

/** 메모리에만 두는 설정 저장소(기본값, 시험용). */
export function memoryKeyValue(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map(Object.entries(initial));
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
  };
}

/** 저장소가 없는 소비자의 기본값: 이미지를 저장하지 못하고 읽지도 못한다(개발자용 오류라 영어). */
export const noAssets: AssetStore = {
  put: () => Promise.reject(new Error("No asset store is connected")),
  get: () => Promise.reject(new Error("No asset store is connected")),
};

/** 브라우저 창으로 연다(창이 없는 환경에서는 아무것도 하지 않는다). */
export const browserUrlOpener: UrlOpener = {
  open: async (url) => {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  },
};

/** 안내와 오류를 콘솔에만 남긴다. */
export const consoleNotifier: Notifier = {
  notice: (message) => console.info(message),
  error: (error) => console.error(error),
};

export function memoryPorts(overrides: Partial<EditorPorts> = {}): EditorPorts {
  return { keyValue: memoryKeyValue(), links: browserUrlOpener, assets: noAssets, notifier: consoleNotifier, ...overrides };
}
