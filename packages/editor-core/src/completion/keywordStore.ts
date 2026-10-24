import hljs from "highlight.js/lib/core";

import { resolveLanguage } from "@gogum4/editor-schema/codeLanguages";
import { loadLanguageDefinition } from "../highlight/loader";
import { type Candidate, extractKeywords } from "./words";

/** 자동완성이 다루는 언어: `mermaid`(정적 목록) 아니면 highlight.js 정식 이름. 자동완성을 하지 않을 블록이면 null. */
export type CompletionLanguage = { kind: "mermaid" } | { kind: "hljs"; name: string };

/** 블록의 `language` 속성으로 자동완성 방식을 정한다. 언어가 없거나 일반 텍스트면 null(단어만 떠도 시끄럽다). */
export function completionLanguage(attr: string | null | undefined): CompletionLanguage | null {
  if (attr?.trim().toLowerCase() === "mermaid") return { kind: "mermaid" };
  const name = resolveLanguage(attr);
  if (!name || name === "plaintext") return null;
  return { kind: "hljs", name };
}

const cache = new Map<string, Candidate[]>();
const pending = new Map<string, Promise<void>>();

/** 이미 불러온 언어의 예약어. 아직이면 undefined. */
export function cachedKeywords(name: string): Candidate[] | undefined {
  return cache.get(name);
}

/** 언어의 예약어를 불러와 캐시에 둔다(처음 쓸 때 한 번). 실패하면 빈 목록으로 두어 다시 시도하지 않는다. */
export function ensureKeywords(name: string): Promise<void> {
  if (cache.has(name)) return Promise.resolve();
  const existing = pending.get(name);
  if (existing) return existing;

  const promise = loadLanguageDefinition(name)
    .then((definition) => {
      cache.set(name, definition ? extractKeywords(definition(hljs)) : []);
    })
    .catch((error: unknown) => {
      console.warn(`예약어를 읽지 못했어요: ${name}`, error);
      cache.set(name, []);
    })
    .finally(() => {
      pending.delete(name);
    });
  pending.set(name, promise);
  return promise;
}
