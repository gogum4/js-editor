import type { LanguageFn } from "highlight.js";
import { createLowlight } from "lowlight";

import { LANGUAGE_LOADERS } from "./languageLoaders.generated";

/**
 * 코드 구문 강조용 lowlight 인스턴스와 **언어 지연 로더**.
 * highlight.js의 언어 193개를 처음부터 다 싣지 않고, 코드 블록에서 쓰는 언어만 처음 쓸 때 불러온다
 * (번들러가 언어마다 별도 파일로 나눈다).
 */
export const lowlight = createLowlight();

type LanguageModule = { default: LanguageFn };

// 언어마다 명시적인 동적 import 표(`pnpm gen:languages`가 만든다). 번들러가 언어별 조각으로 나눈다.
const loaders = new Map<string, () => Promise<LanguageModule>>(Object.entries(LANGUAGE_LOADERS));

const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

/** 불러올 수 있는 언어의 정식 이름들. */
export function availableLanguageNames(): string[] {
  return [...loaders.keys()].sort();
}

export function isLanguageLoaded(name: string): boolean {
  return loaded.has(name);
}

/**
 * 언어를 불러와 lowlight에 등록한다. 이미 불러왔거나 불러오는 중이면 같은 결과를 돌려주고,
 * 모르는 이름이면 아무것도 하지 않는다. 실패하면 경고만 남기고 다음에 다시 시도할 수 있다.
 */
export function loadLanguage(name: string): Promise<void> {
  if (loaded.has(name)) return Promise.resolve();
  const pending = loading.get(name);
  if (pending) return pending;

  const load = loaders.get(name);
  if (!load) return Promise.resolve();

  const promise = load()
    .then((module) => {
      lowlight.register({ [name]: module.default });
      loaded.add(name);
    })
    .catch((error: unknown) => {
      console.warn(`구문 강조 언어를 불러오지 못했어요: ${name}`, error);
    })
    .finally(() => {
      loading.delete(name);
    });
  loading.set(name, promise);
  return promise;
}

/**
 * 언어 정의(`hljs => language`)만 불러온다. 구문 강조에 등록하지 않고 정의를 직접 읽고 싶을 때(자동완성의 예약어) 쓴다.
 * 모르는 이름이면 undefined, 불러오지 못해도 undefined(경고만 남긴다).
 */
export async function loadLanguageDefinition(name: string): Promise<LanguageFn | undefined> {
  const load = loaders.get(name);
  if (!load) return undefined;
  try {
    return (await load()).default;
  } catch (error) {
    console.warn(`언어 정의를 불러오지 못했어요: ${name}`, error);
    return undefined;
  }
}
