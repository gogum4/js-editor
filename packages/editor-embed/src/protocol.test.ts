import { describe, expect, it } from "vitest";

import { DEFAULT_FEATURES, encodeEditorMessage, parseHostMessage } from "./protocol.ts";

describe("parseHostMessage", () => {
  it("글자(JSON)와 객체를 모두 받는다", () => {
    const message = { type: "setMarkdown", markdown: "# 제목" };
    expect(parseHostMessage(JSON.stringify(message))).toEqual(message);
    expect(parseHostMessage(message)).toEqual(message);
  });

  it("init의 빠진 필드는 기본값으로 채운다", () => {
    expect(parseHostMessage({ type: "init", markdown: "" })).toEqual({
      type: "init",
      markdown: "",
      theme: "light",
      readOnly: false,
      placeholder: "",
      locale: "ko",
      features: [...DEFAULT_FEATURES],
      autoHeight: true,
      background: null,
    });
  });

  it("init: 모르는 기능 이름은 버리고, 값은 올바른 것만 쓴다", () => {
    const m = parseHostMessage({ type: "init", markdown: "a", theme: "dark", readOnly: true, locale: "en", features: ["table", "nope", "math"], autoHeight: false, background: " #fff ", placeholder: "메모" });
    expect(m).toMatchObject({ theme: "dark", readOnly: true, locale: "en", features: ["table", "math"], autoHeight: false, background: " #fff ", placeholder: "메모" });
    expect(parseHostMessage({ type: "init", markdown: "a", theme: "pink", locale: "fr" })).toMatchObject({ theme: "light", locale: "ko" });
  });

  it("올바르지 않거나 모르는 메시지는 null", () => {
    for (const bad of [null, undefined, 3, "not json", "[]", { type: "init" }, { type: "setMarkdown", markdown: 1 }, { type: "setTheme", theme: "x" }, { type: "setReadOnly", readOnly: "yes" }, { type: "nope" }, {}]) {
      expect(parseHostMessage(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("모르는 필드는 무시한다 (버전이 달라도 깨지지 않게)", () => {
    expect(parseHostMessage({ type: "focus", future: 1 })).toEqual({ type: "focus" });
  });
});

describe("encodeEditorMessage", () => {
  it("JSON 글자로 보낸다", () => {
    expect(JSON.parse(encodeEditorMessage({ v: 1, type: "change", markdown: "가\n", rev: 2 }))).toEqual({ v: 1, type: "change", markdown: "가\n", rev: 2 });
  });
});
