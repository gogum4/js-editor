import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOGGLE_CLOSED_KEY } from "@9um4-utils/editor-schema/toggleState";
import type { KeyValueStore } from "@9um4-utils/editor-core";
import { createToggleStore, type ToggleStore, toggleStoreFor } from "./toggleStore";

const kv = { get: vi.fn<KeyValueStore["get"]>(), set: vi.fn<KeyValueStore["set"]>() };
let store: ToggleStore;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  kv.set.mockResolvedValue(undefined);
  store = createToggleStore(kv);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("토글 열림 상태 저장소", () => {
  it("저장된 닫힌 토글을 읽어 온다", async () => {
    kv.get.mockResolvedValue('["a","b"]');
    await store.getState().load();
    expect(store.getState()).toMatchObject({ closed: ["a", "b"], loaded: true });
    expect(kv.get).toHaveBeenCalledWith(TOGGLE_CLOSED_KEY);
  });

  it("설정을 읽지 못하거나 없어도 모두 열린 채다", async () => {
    kv.get.mockRejectedValue(new Error("fail"));
    await store.getState().load();
    expect(store.getState()).toMatchObject({ closed: [], loaded: true });
  });

  it("읽는 사이에 사용자가 닫은 것은 지우지 않고 합친다", async () => {
    let resolve: (value: string) => void = () => {};
    kv.get.mockReturnValue(new Promise<string>((r) => (resolve = r)));
    const loading = store.getState().load();
    store.getState().setOpen("fresh", false);
    resolve('["old"]');
    await loading;
    expect([...store.getState().closed].sort()).toEqual(["fresh", "old"]);
  });

  it("두 번 불러도 설정은 한 번만 읽는다", async () => {
    kv.get.mockResolvedValue("[]");
    await Promise.all([store.getState().load(), store.getState().load()]);
    await store.getState().load();
    expect(kv.get).toHaveBeenCalledTimes(1);
  });

  it("여닫으면 바로 화면 상태가 바뀌고, 연달아 해도 저장은 잠시 뒤 한 번만 한다", () => {
    store.getState().setOpen("a", false);
    store.getState().setOpen("b", false);
    store.getState().setOpen("a", true);
    expect(store.getState().closed).toEqual(["b"]);
    expect(kv.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(kv.set).toHaveBeenCalledTimes(1);
    expect(kv.set).toHaveBeenCalledWith(TOGGLE_CLOSED_KEY, '["b"]');
  });

  it("저장에 실패해도 이번 실행에서는 바뀐 채로 둔다", async () => {
    kv.set.mockRejectedValue(new Error("fail"));
    store.getState().setOpen("a", false);
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().closed).toEqual(["a"]);
  });

  it("설정 저장소가 다르면 상태도 따로이고, 같은 저장소는 상태를 나눠 쓴다", () => {
    const other = { get: vi.fn(), set: vi.fn() };
    expect(toggleStoreFor(kv)).toBe(toggleStoreFor(kv));
    expect(toggleStoreFor(other)).not.toBe(toggleStoreFor(kv));
    toggleStoreFor(kv).getState().setOpen("x", false);
    expect(toggleStoreFor(other).getState().closed).toEqual([]);
  });
});
