import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

import { createCoreExtensions } from "../coreExtensions";
import { insertImageFiles } from "../image/insertImages";
import { portsOf } from "./editorPorts";
import { memoryPorts } from "./memory";
import type { AssetStore, Notifier } from "./types";

const HASH = "a".repeat(64);
const EMPTY = { type: "doc", content: [{ type: "paragraph" }] };

function editorWithPorts(assets: AssetStore, notifier: Notifier) {
  const ports = memoryPorts({ assets, notifier });
  return { ports, editor: new Editor({ extensions: createCoreExtensions(null, { ports }), content: EMPTY }) };
}

const png = (name = "a.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

describe("에디터 포트", () => {
  it("포트를 주지 않은 에디터는 메모리 기본값을 쓴다", async () => {
    const editor = new Editor({ extensions: createCoreExtensions(null), content: EMPTY });
    await expect(portsOf(editor).assets.put(new Uint8Array([1]))).rejects.toThrow("asset store");
  });

  it("에디터마다 자기 포트를 쓴다", () => {
    const a = editorWithPorts({ put: vi.fn(), get: vi.fn() }, { notice: vi.fn(), error: vi.fn() });
    const b = editorWithPorts({ put: vi.fn(), get: vi.fn() }, { notice: vi.fn(), error: vi.fn() });
    expect(portsOf(a.editor)).toBe(a.ports);
    expect(portsOf(b.editor)).toBe(b.ports);
    expect(portsOf(a.editor)).not.toBe(portsOf(b.editor));
  });

  it("이미지를 넣으면 주입한 저장소에 저장하고 본문에 해시를 넣는다", async () => {
    const put = vi.fn().mockResolvedValue({ hash: HASH, mime: "image/png" });
    const { editor } = editorWithPorts({ put, get: vi.fn() }, { notice: vi.fn(), error: vi.fn() });
    expect(await insertImageFiles(editor, [png()])).toBe(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(editor.getJSON().content?.some((n) => n.type === "image" && n.attrs?.hash === HASH)).toBe(true);
  });

  it("받지 못하는 파일은 알림 포트로 안내하고, 저장 오류는 오류 포트로 알린다", async () => {
    const notifier = { notice: vi.fn(), error: vi.fn() };
    const failure = new Error("디스크가 가득 찼어요");
    const { editor } = editorWithPorts({ put: vi.fn().mockRejectedValue(failure), get: vi.fn() }, notifier);
    const text = new File(["x"], "a.txt", { type: "text/plain" });
    expect(await insertImageFiles(editor, [text, png()])).toBe(0);
    expect(notifier.notice).toHaveBeenCalledTimes(1);
    expect(notifier.error).toHaveBeenCalledWith(failure);
  });
});
