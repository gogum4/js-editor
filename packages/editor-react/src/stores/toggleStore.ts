import { create, type StoreApi, type UseBoundStore } from "zustand";

import { parseClosedToggles, serializeClosedToggles, TOGGLE_CLOSED_KEY, withToggleOpen } from "@gogum4/editor-schema/toggleState";
import type { KeyValueStore } from "@gogum4/editor-core";

const SAVE_DELAY_MS = 400;

export interface ToggleState {
  /** 닫아 둔 토글의 블록 id들(닫은 순서). 여기 없으면 열려 있다. */
  closed: readonly string[];
  loaded: boolean;
  /** 저장된 설정을 한 번만 읽는다. 못 읽으면 모두 열린 채로 둔다. */
  load: () => Promise<void>;
  /** 토글을 열거나 닫는다(바로 화면에 반영하고 잠시 뒤 설정에 저장한다). */
  setOpen: (id: string, open: boolean) => void;
}

export type ToggleStore = UseBoundStore<StoreApi<ToggleState>>;

/** 설정 저장소 하나에 붙는 토글 열림 상태. 저장소가 다르면(에디터가 따로 쓰이면) 상태도 따로다. */
export function createToggleStore(keyValue: KeyValueStore): ToggleStore {
  let loading = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return create<ToggleState>()((set, get) => ({
    closed: [],
    loaded: false,
    async load() {
      if (get().loaded || loading) return;
      loading = true;
      try {
        const stored = parseClosedToggles(await keyValue.get(TOGGLE_CLOSED_KEY));
        // 읽는 사이에 사용자가 이미 닫은 것은 지우지 않고 합친다.
        set((state) => ({ closed: [...new Set([...stored, ...state.closed])] }));
      } catch {
        // 설정을 읽지 못해도 토글은 쓸 수 있다(열린 채로 시작).
      } finally {
        loading = false;
        set({ loaded: true });
      }
    },
    setOpen(id, open) {
      const next = withToggleOpen(get().closed, id, open);
      set({ closed: next });
      // 여닫기를 연달아 해도 저장은 한 번만 한다. 저장에 실패해도 이번 실행에서는 바뀐 채로 둔다.
      clearTimeout(timer);
      timer = setTimeout(() => {
        void keyValue.set(TOGGLE_CLOSED_KEY, serializeClosedToggles(get().closed)).catch(() => {});
      }, SAVE_DELAY_MS);
    },
  }));
}

const stores = new WeakMap<KeyValueStore, ToggleStore>();

/** 이 설정 저장소의 토글 상태(없으면 만든다). 같은 저장소를 쓰는 에디터들이 한 상태를 나눠 쓴다. */
export function toggleStoreFor(keyValue: KeyValueStore): ToggleStore {
  let store = stores.get(keyValue);
  if (!store) stores.set(keyValue, (store = createToggleStore(keyValue)));
  return store;
}
