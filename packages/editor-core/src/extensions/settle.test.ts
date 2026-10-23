// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";

import { createCoreExtensions } from "../coreExtensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

const lastType = (e: Editor) => {
  const content = e.getJSON().content ?? [];
  return content[content.length - 1]?.type;
};
const mount = (settle: boolean) => {
  const element = document.createElement("div");
  document.body.appendChild(element);
  editor = new Editor({
    element,
    extensions: createCoreExtensions(null, { raw: true, settle }),
    content: { type: "doc", content: [{ type: "raw", attrs: { text: "::youtube{id=x}" } }] },
  });
  return editor;
};

describe("settle: 열자마자 문서 정리를 끝낸다", () => {
  // TipTap은 `create` 이벤트를 만든 직후 한 박자 뒤에 낸다.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("켜면 끝 문단이 이미 있고, 끄면 첫 트랜잭션까지 없다", async () => {
    const on = mount(true);
    await tick();
    expect(lastType(on)).toBe("paragraph");
    on.destroy();
    const e = mount(false);
    await tick();
    expect(lastType(e)).toBe("raw");
    e.view.dispatch(e.state.tr.setMeta("any", true));
    expect(lastType(e)).toBe("paragraph");
  });

  it("정리하는 트랜잭션은 되돌리기 기록에 남지 않는다", async () => {
    const e = mount(true);
    await tick();
    expect(e.can().undo()).toBe(false);
  });
});
