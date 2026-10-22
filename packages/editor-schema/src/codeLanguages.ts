import { LANGUAGE_ALIASES, LANGUAGE_NAMES } from "./languageData.generated";

const NAME_SET: ReadonlySet<string> = new Set(LANGUAGE_NAMES);

/** highlight.js가 별칭으로 정의하지 않았지만 자주 쓰는 이름 (정식 이름으로 연결한다). */
const EXTRA_ALIASES: Readonly<Record<string, string>> = {
  vue: "xml",
  svelte: "xml",
  astro: "xml",
  json5: "json",
  jsonl: "json",
};

/**
 * highlight.js 언어는 아니지만 언어 선택 목록에 넣는 것들. 색은 입히지 않고(`resolveLanguage`는 모른다고 답한다),
 * 코드 블록이 그에 맞는 화면으로 바꾼다. 예: mermaid는 다이어그램 그림.
 */
const SPECIAL_LANGUAGES: readonly string[] = ["mermaid"];

/** 언어 선택 목록에서 검색어가 없을 때 맨 위에 보여 줄 자주 쓰는 언어. */
const POPULAR = [
  "plaintext",
  "javascript",
  "typescript",
  "python",
  "java",
  "kotlin",
  "rust",
  "go",
  "c",
  "cpp",
  "csharp",
  "bash",
  "sql",
  "json",
  "yaml",
  "xml",
  "css",
  "markdown",
  "diff",
  "dockerfile",
];

export interface LanguageOption {
  /** 정식 이름 (highlight.js 모듈 이름). */
  name: string;
  /** 이 언어를 가리키는 별칭들. 예: typescript → ["ts", "tsx", …]. */
  aliases: string[];
}

/** ` ```ts ` 같은 입력의 언어 이름을 정식 이름으로 바꾼다. 모르는 언어면 null. */
export function resolveLanguage(input: string | null | undefined): string | null {
  const key = input?.trim().toLowerCase();
  if (!key) return null;
  if (NAME_SET.has(key)) return key;
  return LANGUAGE_ALIASES[key] ?? EXTRA_ALIASES[key] ?? null;
}

let cachedOptions: LanguageOption[] | null = null;

/** 모든 언어와 그 별칭. 자주 쓰는 언어가 앞에 오고 나머지는 이름순이다. */
export function languageOptions(): LanguageOption[] {
  if (cachedOptions) return cachedOptions;

  const aliasesByName = new Map<string, string[]>();
  for (const [alias, name] of [...Object.entries(LANGUAGE_ALIASES), ...Object.entries(EXTRA_ALIASES)]) {
    const list = aliasesByName.get(name) ?? [];
    list.push(alias);
    aliasesByName.set(name, list);
  }

  const options = [...LANGUAGE_NAMES, ...SPECIAL_LANGUAGES].map((name) => ({
    name,
    aliases: (aliasesByName.get(name) ?? []).sort(),
  }));
  const popularRank = new Map(POPULAR.map((name, i) => [name, i]));
  cachedOptions = options.sort((a, b) => {
    const ra = popularRank.get(a.name) ?? Number.POSITIVE_INFINITY;
    const rb = popularRank.get(b.name) ?? Number.POSITIVE_INFINITY;
    return ra - rb || a.name.localeCompare(b.name);
  });
  return cachedOptions;
}

/**
 * 검색어로 언어를 찾는다. 이름과 별칭 모두 대상이고, 정확히 같음 → 앞부분 일치 → 포함 순으로 앞에 온다.
 * 검색어가 비어 있으면 전체(자주 쓰는 언어가 먼저)를 돌려준다.
 */
export function searchLanguages(query: string): LanguageOption[] {
  const q = query.trim().toLowerCase();
  const options = languageOptions();
  if (!q) return options;

  const scored: { option: LanguageOption; score: number; index: number }[] = [];
  options.forEach((option, index) => {
    const terms = [option.name, ...option.aliases];
    let best = Number.POSITIVE_INFINITY;
    for (const term of terms) {
      if (term === q) best = Math.min(best, 0);
      else if (term.startsWith(q)) best = Math.min(best, 1);
      else if (term.includes(q)) best = Math.min(best, 2);
    }
    if (best !== Number.POSITIVE_INFINITY) scored.push({ option, score: best, index });
  });
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.option);
}
