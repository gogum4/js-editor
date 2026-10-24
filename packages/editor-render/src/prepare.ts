import katex from "katex";
import { createLowlight } from "lowlight";

import { resolveLanguage } from "@gogum4/editor-schema/codeLanguages";
import type { PmNode } from "@gogum4/editor-schema/pmDoc";
import type { HastChild } from "./highlight.tsx";
import { LANGUAGE_LOADERS } from "./languageLoaders.generated.ts";
import { textOf } from "./slug.ts";
import { codeKey, mathKey, type Prepared } from "./types.ts";

/** 수식 하나의 길이 상한(편집기와 같다). 넘는 부분은 잘라서 그린다. */
const MAX_LATEX_CHARS = 5000;
/** 이보다 긴 코드는 강조하지 않고 그대로 보인다(서버 시간을 지키려는 상한). */
const MAX_HIGHLIGHT_CHARS = 100_000;

// 한 번 불러온 언어는 프로세스가 사는 동안 재사용한다(데이터일 뿐이라 요청끼리 섞여도 결과는 같다).
const lowlight = createLowlight();
const loading = new Map<string, Promise<boolean>>();

/** 언어 정의를 불러와 등록한다. 모르는 언어거나 불러오지 못하면 false. */
function ensureLanguage(name: string): Promise<boolean> {
  if (lowlight.registered(name)) return Promise.resolve(true);
  let pending = loading.get(name);
  if (!pending) {
    const load = LANGUAGE_LOADERS[name];
    pending = load
      ? load().then(
          (module) => {
            lowlight.register({ [name]: module.default });
            return true;
          },
          () => false,
        )
      : Promise.resolve(false);
    loading.set(name, pending);
  }
  return pending;
}

function renderMath(latex: string, display: boolean): string {
  return katex.renderToString(latex.slice(0, MAX_LATEX_CHARS), {
    displayMode: display,
    // 틀린 수식도 던지지 않고 빨간 원문으로 보인다. 스크립트·링크 같은 위험한 기능은 끈다.
    throwOnError: false,
    trust: false,
    strict: "ignore",
  });
}

interface Targets {
  math: Array<{ latex: string; display: boolean }>;
  code: Array<{ language: string; code: string }>;
}

function collect(node: PmNode, out: Targets): void {
  if (node.type === "mathInline" || node.type === "mathBlock") {
    const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
    if (latex.trim() !== "") out.math.push({ latex, display: node.type === "mathBlock" });
    return;
  }
  if (node.type === "codeBlock") {
    const language = typeof node.attrs?.language === "string" ? node.attrs.language.trim() : "";
    // mermaid는 브라우저가 그린다. 언어가 없으면 강조하지 않는다.
    if (language !== "" && language.toLowerCase() !== "mermaid") out.code.push({ language, code: textOf(node) });
    return;
  }
  for (const child of node.content ?? []) collect(child, out);
}

/**
 * 렌더 전에 서버에서 한 번 하는 준비: 문서 안의 수식을 KaTeX HTML로, 코드를 구문 강조한 hast로 미리 만든다.
 * 비동기인 이유는 코드 언어를 처음 쓸 때 불러오기 때문이다. 결과를 `renderDoc`의 `prepared` 옵션에 주면 렌더 자체는 동기로 돈다.
 * 수식·코드가 없는 문서는 아무것도 불러오지 않는다.
 */
export async function prepareRender(doc: PmNode): Promise<Prepared> {
  const targets: Targets = { math: [], code: [] };
  collect(doc, targets);

  const math = new Map<string, string>();
  for (const { latex, display } of targets.math) {
    const key = mathKey(display, latex);
    if (!math.has(key)) math.set(key, renderMath(latex, display));
  }

  const code = new Map<string, readonly HastChild[]>();
  for (const { language, code: source } of targets.code) {
    const key = codeKey(language, source);
    if (code.has(key) || source.length > MAX_HIGHLIGHT_CHARS) continue;
    const name = resolveLanguage(language);
    if (name === null || !(await ensureLanguage(name))) continue;
    try {
      code.set(key, lowlight.highlight(name, source).children as HastChild[]);
    } catch {
      // 강조에 실패하면 그대로 보인다.
    }
  }
  return { math, code };
}
