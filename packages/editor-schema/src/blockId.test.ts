import { describe, expect, it } from "vitest";

import {
  BLOCK_ID_LENGTH,
  BLOCK_ID_PATTERN,
  BLOCK_ID_TYPES,
  blockIdOf,
  blockKey,
  canonicalBlock,
  generateBlockId,
  blockIdFromForeign,
  isBlockIdType,
} from "./blockId.ts";
import type { PmNode } from "./pmDoc.ts";

const text = (t: string): PmNode => ({ type: "text", text: t });
const para = (t: string, id?: string): PmNode => ({ type: "paragraph", ...(id !== undefined ? { attrs: { id } } : {}), content: [text(t)] });

describe("generateBlockId", () => {
  it("소문자·숫자 10글자이고 거의 겹치지 않는다", () => {
    const ids = Array.from({ length: 5000 }, generateBlockId);
    for (const id of ids) {
      expect(id).toHaveLength(BLOCK_ID_LENGTH);
      expect(id).toMatch(BLOCK_ID_PATTERN);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isBlockIdType", () => {
  it("블록 종류에는 붙이고 목록 항목·글자·페이지 링크에는 붙이지 않는다", () => {
    for (const type of BLOCK_ID_TYPES) expect(isBlockIdType(type)).toBe(true);
    for (const type of ["listItem", "taskItem", "text", "pageLink", "hardBreak", "doc", ""]) expect(isBlockIdType(type)).toBe(false);
  });
});

describe("canonicalBlock / blockKey", () => {
  it("값이 null인 속성은 속성이 없는 것과 같다 (에디터의 toJSON과 Yjs에서 읽은 JSON이 같게 비교된다)", () => {
    const fromEditor: PmNode = { type: "paragraph", attrs: { id: "abc", textAlign: null }, content: [text("글")] };
    const fromYjs: PmNode = { type: "paragraph", content: [text("글")] };
    expect(canonicalBlock(fromEditor)).toEqual(canonicalBlock(fromYjs));
    expect(blockKey(fromEditor)).toBe(blockKey(fromYjs));
    // 값이 있는 속성은 그대로 남아서 정렬만 달라도 다른 블록이다.
    const centered: PmNode = { type: "paragraph", attrs: { textAlign: "center" }, content: [text("글")] };
    expect(blockKey(centered)).not.toBe(blockKey(fromYjs));
    expect(canonicalBlock(centered).attrs).toEqual({ textAlign: "center" });
  });

  it("id가 있든 없든 같은 내용이면 같은 키다 (attrs: { id: null }도 같다)", () => {
    const plain = para("본문");
    expect(blockKey(para("본문", "abc0123456"))).toBe(blockKey(plain));
    expect(blockKey({ ...plain, attrs: { id: null } })).toBe(blockKey(plain));
    expect(blockKey(para("다른 글", "abc0123456"))).not.toBe(blockKey(plain));
  });

  it("id가 아닌 속성은 남기고 안쪽(중첩) 블록의 id도 뺀다", () => {
    const list: PmNode = {
      type: "bulletList",
      attrs: { id: "aaaaaaaaaa" },
      content: [{ type: "listItem", content: [para("항목", "bbbbbbbbbb")] }],
    };
    expect(canonicalBlock(list)).toEqual({ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("항목")] }] }] });
    const heading: PmNode = { type: "heading", attrs: { level: 2, id: "cccccccccc" }, content: [text("제목")] };
    expect(canonicalBlock(heading).attrs).toEqual({ level: 2 });
    expect(blockKey({ type: "heading", attrs: { level: 2 }, content: [text("제목")] })).toBe(blockKey(heading));
    expect(blockKey({ type: "heading", attrs: { level: 3 }, content: [text("제목")] })).not.toBe(blockKey(heading));
  });

  it("원본을 바꾸지 않고 서식(marks)은 그대로 둔다", () => {
    const node: PmNode = { type: "paragraph", attrs: { id: "dddddddddd" }, content: [{ type: "text", text: "굵게", marks: [{ type: "bold" }] }] };
    const copy = structuredClone(node);
    const out = canonicalBlock(node);
    expect(node).toEqual(copy);
    expect(out.content?.[0]?.marks).toEqual([{ type: "bold" }]);
  });
});

describe("blockIdOf", () => {
  it("올바른 모양의 id만 돌려준다", () => {
    expect(blockIdOf(para("a", "abc0123456"))).toBe("abc0123456");
    for (const bad of ["", "short", "ABC0123456", "abc012345!", 12345, null]) {
      expect(blockIdOf({ type: "paragraph", attrs: { id: bad as string } })).toBeNull();
    }
    expect(blockIdOf({ type: "paragraph" })).toBeNull();
  });
});

describe("blockIdFromForeign", () => {
  it("우리 모양의 id는 그대로 둔다", () => {
    expect(blockIdFromForeign("abc0123456")).toBe("abc0123456");
  });

  it("다른 모양은 글자에서 정해지는 우리 모양의 id가 된다 (고정된 값)", () => {
    expect(blockIdFromForeign("my-id")).toMatch(BLOCK_ID_PATTERN);
    expect(blockIdFromForeign("my-id")).toBe(blockIdFromForeign("my-id"));
    expect(blockIdFromForeign("my-id")).not.toBe(blockIdFromForeign("my-ie"));
    // 값이 바뀌면 이미 가져온 노트의 블록 링크가 끊어지므로 고정한다.
    expect(blockIdFromForeign("my-id")).toBe("um0cdfuogn");
    expect(blockIdFromForeign("한글-id")).toMatch(BLOCK_ID_PATTERN);
  });
});
