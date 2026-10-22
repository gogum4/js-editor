import type { PmNode } from "./pmDoc.ts";

/**
 * 블록 id: 문단·제목·목록·인용·콜아웃·코드·구분선·이미지 같은 **블록마다 붙는 짧은 고유 이름**(`attrs.id`).
 * 글을 고치거나 블록을 옮겨도 그대로라서, 비교에서 "같은 블록이 옮겨졌다/고쳐졌다"를 내용 짐작이 아니라 id로 알 수 있고
 * (나중에 블록 링크 `[[페이지#^id]]`와 기기 간 동기화의 바탕이 된다).
 * 목록 항목(listItem·taskItem)에는 붙이지 않는다: 그 안의 문단이 id를 가진다.
 */
export const BLOCK_ID_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "callout",
  "codeBlock",
  "horizontalRule",
  "image",
  "pageBlock",
  "mathBlock",
  "table",
  "toggle",
] as const;

const ID_TYPES: ReadonlySet<string> = new Set(BLOCK_ID_TYPES);

export function isBlockIdType(nodeName: string): boolean {
  return ID_TYPES.has(nodeName);
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export const BLOCK_ID_LENGTH = 10;
/** 블록 id의 모양: 소문자·숫자 10글자. */
export const BLOCK_ID_PATTERN = /^[0-9a-z]{10}$/;

/** 새 블록 id. 36^10 ≈ 3.6×10^15 가지라 한 문서 안에서 겹칠 일은 사실상 없고, 겹치면 호출하는 쪽이 다시 만든다. */
export function generateBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BLOCK_ID_LENGTH));
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

/**
 * 블록의 **내용만** 담은 모양: 모든 단계의 `attrs.id`를 빼고, 그러고도 속성이 없으면 `attrs` 자체를 뺀다.
 * id가 없는 옛 문서의 블록과 id가 붙은 같은 내용의 블록이 "같은 블록"으로 비교되게 한다. 값이 null인 속성도 없는 것으로 본다.
 */
export function canonicalBlock(node: PmNode): PmNode {
  const out: PmNode = { type: node.type };
  if (node.attrs) {
    // 값이 null인 속성(예: 정렬을 하지 않은 문단의 textAlign)은 속성이 없는 것과 같다. Yjs 문서는 null 속성을 저장하지 않아서
    // 에디터의 \`toJSON()\`(null 포함)과 Yjs에서 읽은 JSON(null 없음)이 같은 내용으로 비교되게 한다.
    const rest = Object.fromEntries(Object.entries(node.attrs).filter(([key, value]) => key !== "id" && value !== null && value !== undefined));
    if (Object.keys(rest).length > 0) out.attrs = rest;
  }
  if (node.content) out.content = node.content.map(canonicalBlock);
  if (node.marks) out.marks = node.marks;
  if (node.text !== undefined) out.text = node.text;
  return out;
}

/** 블록 내용의 비교 키(id 무시). 같은 키면 같은 내용이다. */
export function blockKey(node: PmNode): string {
  return JSON.stringify(canonicalBlock(node));
}

/** 블록에 붙은 id. 없거나 모양이 틀리면 null. */
export function blockIdOf(node: PmNode): string | null {
  const id = node.attrs?.id;
  return typeof id === "string" && BLOCK_ID_PATTERN.test(id) ? id : null;
}
