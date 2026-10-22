import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createCoreExtensions as createEditorExtensions } from "./coreExtensions";

type Extensions = ReturnType<typeof createEditorExtensions>;
const names = (list: Extensions) => list.map((e) => e.name);
const undoRedoOption = (list: Extensions) => (list.find((e) => e.name === "starterKit")?.options as { undoRedo: unknown }).undoRedo;

// 되돌리기가 실제로 동작하는지는 화면 없는 시험 환경에서는 확인할 수 없다(일반 StarterKit도 안 된다) — 앱에서 직접 확인한다.
// 여기서는 어느 쪽이 되돌리기를 맡는지(둘이 함께 켜지면 충돌한다)만 고정한다.
describe("되돌리기 담당", () => {
  it("Yjs가 없으면 일반 history(StarterKit undoRedo)가 맡고 Collaboration은 없다", () => {
    const list = createEditorExtensions(null);
    expect(undoRedoOption(list)).not.toBe(false);
    expect(names(list)).not.toContain("collaboration");
  });

  it("Yjs가 있으면 Collaboration(Yjs UndoManager)이 맡고 history는 꺼진다", () => {
    const list = createEditorExtensions(new Y.Doc());
    expect(undoRedoOption(list)).toBe(false);
    expect(names(list)).toContain("collaboration");
  });
});
