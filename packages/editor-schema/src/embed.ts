/**
 * 외부 임베드(`embed` 노드)의 규칙. 문서에는 정규화한 **원래 주소**(`url`)와 공급자 이름만 저장하고, 보여 줄 때 이 파일의 표로 iframe 주소를 만든다.
 * 주소 하나로 공급자를 알아내고(`detectEmbed`), 허용한 도메인의 iframe 주소만 만든다(`embedSource`) — 임의 주소를 iframe으로 넣을 수 없다.
 * Markdown에서는 `![](주소)`·`![|500x300](주소)`로 쓴다(Obsidian의 임베드와 같은 모양, docs/MARKDOWN-DIALECT.md).
 */

export const EMBED_NODE = "embed";

export const EMBED_PROVIDERS = ["youtube", "x", "instagram", "pinterest", "soundcloud"] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

export interface EmbedTarget {
  provider: EmbedProvider;
  /** 정규화한 원래 주소(영상·글 페이지). iframe 주소가 아니다. */
  url: string;
}

export function isEmbedProvider(value: unknown): value is EmbedProvider {
  return typeof value === "string" && (EMBED_PROVIDERS as readonly string[]).includes(value);
}

/** http(s) 주소만 읽는다. 계정 정보·포트가 있으면 거절한다. 호스트는 소문자·`www.`/`m.`/`mobile.` 접두를 뗀 이름. */
function parse(input: string): { host: string; parts: string[]; url: URL } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const parts = url.pathname.split("/").filter((part) => part !== "");
  return { host, parts, url };
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DIGITS = /^\d{1,25}$/;
const CODE = /^[A-Za-z0-9_-]{5,40}$/;
const X_USER = /^[A-Za-z0-9_]{1,50}$/;
const SC_NAME = /^[A-Za-z0-9_-]{1,100}$/;
/** 사운드클라우드에서 사용자 이름이 아닌 최상위 경로. */
const SC_RESERVED = new Set(["discover", "stream", "you", "upload", "search", "pages", "charts", "settings", "messages", "notifications", "feed", "mobile"]);

function youtube(p: NonNullable<ReturnType<typeof parse>>): string | null {
  let id: string | undefined;
  if (p.host === "youtu.be") id = p.parts[0];
  else if (p.host === "youtube.com" || p.host === "music.youtube.com" || p.host === "youtube-nocookie.com") {
    if (p.parts[0] === "watch") id = p.url.searchParams.get("v") ?? undefined;
    else if (p.parts[0] === "embed" || p.parts[0] === "shorts" || p.parts[0] === "live" || p.parts[0] === "v") id = p.parts[1];
  }
  return id !== undefined && YOUTUBE_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

function x(p: NonNullable<ReturnType<typeof parse>>): string | null {
  if (p.host !== "x.com" && p.host !== "twitter.com") return null;
  const [user, status, id] = p.parts;
  return user !== undefined && X_USER.test(user) && status === "status" && id !== undefined && DIGITS.test(id) ? `https://x.com/${user}/status/${id}` : null;
}

function instagram(p: NonNullable<ReturnType<typeof parse>>): string | null {
  if (p.host !== "instagram.com") return null;
  const [kind, code] = p.parts;
  if (kind === undefined || code === undefined || !CODE.test(code)) return null;
  if (kind === "p" || kind === "reel" || kind === "tv") return `https://www.instagram.com/${kind === "tv" ? "reel" : kind}/${code}/`;
  return null;
}

function pinterest(p: NonNullable<ReturnType<typeof parse>>): string | null {
  if (!/^pinterest\.[a-z.]{2,8}$/.test(p.host)) return null;
  const [pin, id] = p.parts;
  return pin === "pin" && id !== undefined && DIGITS.test(id) ? `https://www.pinterest.com/pin/${id}/` : null;
}

function soundcloud(p: NonNullable<ReturnType<typeof parse>>): string | null {
  if (p.host !== "soundcloud.com") return null;
  const [user, track] = p.parts;
  if (user === undefined || track === undefined || SC_RESERVED.has(user.toLowerCase())) return null;
  return SC_NAME.test(user) && SC_NAME.test(track) ? `https://soundcloud.com/${user}/${track}` : null;
}

const DETECTORS: ReadonlyArray<readonly [EmbedProvider, (p: NonNullable<ReturnType<typeof parse>>) => string | null]> = [
  ["youtube", youtube],
  ["x", x],
  ["instagram", instagram],
  ["pinterest", pinterest],
  ["soundcloud", soundcloud],
];

/** 주소가 지원하는 공급자의 것이면 공급자와 정규화한 주소를, 아니면 null. 공급자는 주소만 보고 알아낸다. */
export function detectEmbed(input: string): EmbedTarget | null {
  const parsed = parse(input);
  if (parsed === null) return null;
  for (const [provider, detect] of DETECTORS) {
    const url = detect(parsed);
    if (url !== null) return { provider, url };
  }
  return null;
}

/** 저장된 값이 이상해도 올바른 임베드 대상으로 다시 만든다. 올바르지 않으면 null (공급자는 주소로 다시 정하고, 저장된 공급자와 다르면 거절). */
export function normalizeEmbedTarget(provider: unknown, url: unknown): EmbedTarget | null {
  if (typeof url !== "string") return null;
  const detected = detectEmbed(url);
  if (detected === null) return null;
  if (provider !== undefined && provider !== null && provider !== "" && provider !== detected.provider) return null;
  return detected;
}

/** iframe에 넣을 주소. 허용한 도메인(YouTube nocookie·X 플랫폼·Instagram·Pinterest·SoundCloud 플레이어)만 돌려준다. */
export function embedSource(target: EmbedTarget): string | null {
  const normalized = detectEmbed(target.url);
  if (normalized === null || normalized.provider !== target.provider) return null;
  const parsed = parse(normalized.url)!;
  switch (normalized.provider) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${parsed.url.searchParams.get("v")}`;
    case "x":
      return `https://platform.twitter.com/embed/Tweet.html?id=${parsed.parts[2]}`;
    case "instagram":
      return `https://www.instagram.com/${parsed.parts[0]}/${parsed.parts[1]}/embed/captioned/`;
    case "pinterest":
      return `https://assets.pinterest.com/ext/embed.html?id=${parsed.parts[1]}`;
    case "soundcloud":
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(normalized.url)}`;
  }
}

/** 공급자별 기본 크기(px). 너비는 상한이라 좁은 화면에서는 줄어든다. `aspect`가 있으면 높이는 너비에 비례한다. */
export const EMBED_DEFAULT_SIZE: Readonly<Record<EmbedProvider, { width: number; height: number; aspect: boolean }>> = {
  youtube: { width: 640, height: 360, aspect: true },
  x: { width: 550, height: 520, aspect: false },
  instagram: { width: 540, height: 640, aspect: false },
  pinterest: { width: 345, height: 500, aspect: false },
  soundcloud: { width: 640, height: 166, aspect: false },
};

/** iframe `allow` 속성: 공급자가 쓰는 기능만 연다. */
export const EMBED_IFRAME_ALLOW: Readonly<Record<EmbedProvider, string>> = {
  youtube: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
  x: "",
  instagram: "",
  pinterest: "",
  soundcloud: "autoplay",
};

const MIN_SIZE = 100;
const MAX_SIZE = 2000;

/** 크기(px): 100~2000의 정수. 그 밖이면 null(기본 크기). 글자 숫자(`"500"`)도 받는다. */
export function normalizeEmbedSize(value: unknown): number | null {
  const n = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_SIZE && n <= MAX_SIZE ? n : null;
}
