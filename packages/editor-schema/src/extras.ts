/**
 * 추가 문법(extras)의 규칙: 하이라이트·위/아래 첨자·삽입·글자색·배경색·약어(마크), 주석·태그·인용(인라인 노드), 정의 목록·목차(블록 노드), 이모지 단축 코드.
 * 모두 **켜야 쓰인다**(`createCoreExtensions({ extras })`, 가져오기는 `ImportContext.extras`) — 노드·마크를 더하는 것이라 본문을 저장하는 소비자는 스키마 버전을 올려야 한다.
 * 이 파일은 문서에 저장되는 값의 정리(정규화)와 Markdown 표기의 모양만 안다. 화면은 core/react, 읽고 쓰기는 markdown이 맡는다.
 */

/** 어떤 추가 문법을 켤지. 쓰지 않는 것은 비워 둔다(꺼짐). */
export interface ExtraSyntax {
  /** 마크: 하이라이트(`==글==`), 위첨자(`^글^`·`<sup>`), 아래첨자(`<sub>`), 삽입(`++글++`·`<ins>`), 글자색·배경색(`<span style>`). */
  marks?: boolean;
  /** 약어: 문서의 `*[HTML]: Hyper Text Markup Language` 정의를 글 속 낱말에 달고, `<abbr title>`로 내보낸다. */
  abbr?: boolean;
  /** 주석 `%%글%%`: 화면에 흐리게 보이고 렌더러에서는 숨는다. */
  comments?: boolean;
  /** 태그 `#태그`. */
  tags?: boolean;
  /** 인용 `[@citekey]`(Pandoc/Zotero). */
  citations?: boolean;
  /** 정의 목록: `용어` 다음 줄 `: 설명`. */
  definitions?: boolean;
  /** 목차 `[toc]`: 문서의 제목들로 그려지는 블록. */
  toc?: boolean;
  /** 이모지 단축 코드 `:smile:` → 😄 (가져올 때 글자로 바꾸고, 편집기에서는 입력 규칙). */
  emoji?: boolean;
}

export const EXTRA_MARKS = ["highlight", "superscript", "subscript", "insert", "textColor", "backgroundColor"] as const;
export const ABBR_MARK = "abbr";
export const COMMENT_NODE = "comment";
export const TAG_NODE = "tag";
export const CITATION_NODE = "citation";
export const DEFINITION_LIST_NODE = "definitionList";
export const DEFINITION_TERM_NODE = "definitionTerm";
export const DEFINITION_DETAIL_NODE = "definitionDetail";
export const TOC_NODE = "toc";

// ───────────────────────── 색 ─────────────────────────

/** 이름으로 쓸 수 있는 기본 색(글자색·배경색 메뉴가 쓰는 팔레트의 이름). 값은 읽기 좋은 중간 톤이다. */
export const COLOR_NAMES: Readonly<Record<string, string>> = {
  red: "#dc2626",
  orange: "#ea580c",
  yellow: "#ca8a04",
  green: "#16a34a",
  blue: "#2563eb",
  purple: "#9333ea",
  pink: "#db2777",
  gray: "#6b7280",
};

/** 글자색 팔레트(이름 → 값). 배경색은 같은 색의 옅은 톤을 쓴다. */
export const TEXT_COLOR_PALETTE: Readonly<Record<string, string>> = COLOR_NAMES;
export const BACKGROUND_COLOR_PALETTE: Readonly<Record<string, string>> = {
  red: "#fecaca",
  orange: "#fed7aa",
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  purple: "#e9d5ff",
  pink: "#fbcfe8",
  gray: "#e5e7eb",
};

/** 색 값: `#rgb`·`#rrggbb`(소문자 `#rrggbb`로 정리)나 기본 색 이름(값으로 바꾼다). 그 밖은 null — 임의의 CSS를 문서에 넣을 수 없다. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  const name = COLOR_NAMES[text];
  if (name !== undefined) return name;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/.test(text) ? text : null;
}

/** `style="color:#f00; background-color:#ff0"` 같은 인라인 스타일에서 글자색·배경색만 뽑는다(그 밖의 속성은 버린다). */
export function colorsFromStyle(style: string): { color: string | null; background: string | null } {
  let color: string | null = null;
  let background: string | null = null;
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = normalizeColor(declaration.slice(colon + 1));
    if (value === null) continue;
    if (name === "color") color = value;
    else if (name === "background-color" || name === "background") background = value;
  }
  return { color, background };
}

// ───────────────────────── 약어 ─────────────────────────

/** 약어 설명: 한 줄 글, 200자까지. */
export function normalizeAbbrTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, 200).trim();
  return text === "" ? null : text;
}

/** 약어로 쓸 낱말: 공백 없는 1~30자. */
export function isAbbrTerm(value: unknown): value is string {
  return typeof value === "string" && /^[^\s[\]*]{1,30}$/.test(value);
}

// ───────────────────────── 태그 ─────────────────────────

/**
 * 태그 이름(`#` 뒤): 글자·숫자·`_`·`-`·`/`(중첩 태그)로 이루어지고, 글자(숫자만은 아님)가 하나 이상 있어야 한다(Obsidian과 같다). 100자까지.
 * 앞뒤의 `/`·`-`는 이름이 아니다.
 */
export const TAG_BODY_SOURCE = "[\\p{L}\\p{N}_/-]*[\\p{L}_-][\\p{L}\\p{N}_/-]*";
export const TAG_PATTERN = new RegExp(`^${TAG_BODY_SOURCE}$`, "u");
/** 글 속에서 태그를 찾는 패턴의 조각(앞은 줄 처음이나 공백이어야 한다 — 링크 주소의 `(#앵커)`는 태그가 아니다). 소비자(가져오기)가 쓴다. */
export const TAG_IN_TEXT_SOURCE = `(?<=^|\\s)#(${TAG_BODY_SOURCE})`;

export function normalizeTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/^#/, "");
  return text.length <= 100 && TAG_PATTERN.test(text) && !/^[/-]|[/-]$/.test(text) ? text : null;
}

// ───────────────────────── 인용 ─────────────────────────

/** 인용 키: `@` 뒤의 글자·숫자·`_`로 시작하고 `:.#$%&+?<>~/-`를 쓸 수 있다(Pandoc). 끝의 구두점은 키가 아니다. */
const CITE_KEY_SOURCE = "[A-Za-z0-9_][A-Za-z0-9_:.#$%&+?<>~/-]*";
/** 대괄호 안(`[@a; @b, p. 3]`의 안쪽)에서 키를 뽑는 패턴. */
const CITE_KEY_RE = new RegExp(`(?<![\\w])-?@(${CITE_KEY_SOURCE})`, "g");

/** 대괄호 안 글(인용 원문). `@키`가 하나 이상 있어야 하고, 한 줄 300자까지. */
export function normalizeCitationSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length >= 2 && text.length <= 300 && citationKeys(text).length > 0 ? text : null;
}

/** 인용 원문에서 키들(중복 없이, 순서대로). 끝의 `.`·`:` 같은 구두점은 뗀다. */
export function citationKeys(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(CITE_KEY_RE)) {
    const key = match[1]!.replace(/[.:#$%&+?<>~/-]+$/, "");
    if (key !== "" && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Markdown에서 `[@키]` 인용을 찾는 패턴의 소스: 대괄호 안에 `@키`가 있고, 뒤에 `(`·`[`·`:`가 이어지지 않는다(링크·각주·참조 정의와 구별). */
export const CITATION_IN_TEXT_SOURCE = `\\[((?:[^\\]\\n@[]*\\s)?-?@${CITE_KEY_SOURCE}[^\\]\\n[]*)\\](?![(\\[:])`;

// ───────────────────────── 주석 ─────────────────────────

/** 주석 글: 빈 줄은 한 줄 바꿈으로 줄이고 앞뒤 공백을 뗀다. 비면 null. */
export function normalizeCommentText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\n{2,}/g, "\n").trim();
  return text === "" || text.includes("%%") ? null : text;
}

// ───────────────────────── 이모지 ─────────────────────────

/** 자주 쓰는 이모지 단축 코드(GitHub·Joplin 이름). */
const EMOJI_SOURCE = `smile:😄 smiley:😃 grin:😁 laughing:😆 joy:😂 rofl:🤣 blush:😊 wink:😉 heart_eyes:😍 kissing_heart:😘 yum:😋 sunglasses:😎 thinking:🤔 neutral_face:😐 expressionless:😑 unamused:😒 sweat_smile:😅 sweat:😓 pensive:😔 confused:😕 disappointed:😞 worried:😟 angry:😠 rage:😡 cry:😢 sob:😭 scream:😱 fearful:😨 flushed:😳 sleepy:😪 sleeping:😴 mask:😷 nerd_face:🤓 star_struck:🤩 partying_face:🥳 pleading_face:🥺 hugs:🤗 relieved:😌 smirk:😏 innocent:😇 slightly_smiling_face:🙂 upside_down_face:🙃 grimacing:😬 zany_face:🤪 exploding_head:🤯 skull:💀 ghost:👻 robot:🤖 poop:💩 +1:👍 thumbsup:👍 -1:👎 thumbsdown:👎 clap:👏 raised_hands:🙌 pray:🙏 muscle:💪 wave:👋 ok_hand:👌 v:✌️ point_up:☝️ point_down:👇 point_left:👈 point_right:👉 fist:✊ handshake:🤝 writing_hand:✍️ eyes:👀 brain:🧠 heart:❤️ orange_heart:🧡 yellow_heart:💛 green_heart:💚 blue_heart:💙 purple_heart:💜 black_heart:🖤 broken_heart:💔 sparkling_heart:💖 two_hearts:💕 fire:🔥 star:⭐ star2:🌟 sparkles:✨ zap:⚡ boom:💥 sunny:☀️ cloud:☁️ umbrella:☔ snowflake:❄️ rainbow:🌈 ocean:🌊 earth_asia:🌏 moon:🌙 sun_with_face:🌞 tada:🎉 confetti_ball:🎊 balloon:🎈 gift:🎁 trophy:🏆 medal_sports:🏅 crown:👑 gem:💎 bell:🔔 mega:📣 bulb:💡 flashlight:🔦 key:🔑 lock:🔒 unlock:🔓 hammer:🔨 wrench:🔧 gear:⚙️ link:🔗 paperclip:📎 pushpin:📌 scissors:✂️ pencil2:✏️ pencil:📝 memo:📝 book:📖 books:📚 bookmark:🔖 notebook:📓 page_facing_up:📄 clipboard:📋 calendar:📆 date:📅 chart_with_upwards_trend:📈 bar_chart:📊 mag:🔍 mag_right:🔎 email:📧 envelope:✉️ phone:☎️ iphone:📱 computer:💻 keyboard:⌨️ desktop_computer:🖥️ printer:🖨️ floppy_disk:💾 cd:💿 camera:📷 movie_camera:🎥 tv:📺 radio:📻 headphones:🎧 microphone:🎤 musical_note:🎵 notes:🎶 guitar:🎸 video_game:🎮 dart:🎯 art:🎨 package:📦 truck:🚚 car:🚗 bus:🚌 airplane:✈️ rocket:🚀 ship:🚢 bike:🚲 house:🏠 office:🏢 school:🏫 hospital:🏥 bank:🏦 hotel:🏨 coffee:☕ tea:🍵 beer:🍺 wine_glass:🍷 pizza:🍕 hamburger:🍔 fries:🍟 apple:🍎 banana:🍌 strawberry:🍓 cake:🍰 cookie:🍪 ice_cream:🍨 dog:🐶 cat:🐱 mouse:🐭 rabbit:🐰 bear:🐻 panda_face:🐼 koala:🐨 tiger:🐯 lion:🦁 cow:🐮 pig:🐷 frog:🐸 monkey:🐵 chicken:🐔 penguin:🐧 bird:🐦 fish:🐟 whale:🐳 octopus:🐙 butterfly:🦋 bug:🐛 bee:🐝 turtle:🐢 snake:🐍 unicorn:🦄 tree:🌳 evergreen_tree:🌲 palm_tree:🌴 cactus:🌵 herb:🌿 four_leaf_clover:🍀 maple_leaf:🍁 rose:🌹 sunflower:🌻 tulip:🌷 cherry_blossom:🌸 mushroom:🍄 white_check_mark:✅ heavy_check_mark:✔️ x:❌ negative_squared_cross_mark:❎ warning:⚠️ no_entry:⛔ no_entry_sign:🚫 question:❓ exclamation:❗ grey_question:❔ grey_exclamation:❕ bangbang:‼️ interrobang:⁉️ heavy_plus_sign:➕ heavy_minus_sign:➖ arrow_right:➡️ arrow_left:⬅️ arrow_up:⬆️ arrow_down:⬇️ arrows_counterclockwise:🔄 recycle:♻️ hourglass:⌛ alarm_clock:⏰ stopwatch:⏱️ 100:💯 new:🆕 free:🆓 ok:🆗 sos:🆘 up:🆙 cool:🆒 red_circle:🔴 orange_circle:🟠 yellow_circle:🟡 green_circle:🟢 blue_circle:🔵 purple_circle:🟣 black_circle:⚫ white_circle:⚪ checkered_flag:🏁 triangular_flag_on_post:🚩 kr:🇰🇷 us:🇺🇸 jp:🇯🇵 cn:🇨🇳 gb:🇬🇧 de:🇩🇪 fr:🇫🇷`;

const EMOJI = new Map<string, string>(
  EMOJI_SOURCE.split(" ").map((pair) => {
    const at = pair.indexOf(":", 1);
    return [pair.slice(0, at), pair.slice(at + 1)] as const;
  }),
);

/** `smile`(콜론 없이)의 이모지. 모르는 이름이면 null. */
export function emojiFromShortcode(name: string): string | null {
  return EMOJI.get(name.toLowerCase()) ?? null;
}

/** 글 속의 `:이름:`을 이모지로 바꾼다(모르는 이름은 그대로). 시간 표기(`10:30:45`)를 건드리지 않도록 이름은 글자로 시작해야 한다. */
export function replaceEmojiShortcodes(text: string): string {
  return text.replace(/(?<![\w:]):([a-z0-9_+-]{1,40}):(?![\w:])/gi, (whole, name: string) => emojiFromShortcode(name) ?? whole);
}
