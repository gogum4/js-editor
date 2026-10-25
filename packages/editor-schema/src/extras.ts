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
  /**
   * 태그 `#태그`. `{ skipHexColors: true }`면 `#fff`·`#ff00aa`처럼 16진 색으로 보이는 것(3·4·6·8자리 16진수만)은 태그가 아니라 글자로 둔다
   * (기본은 Obsidian과 같게 글자가 하나라도 있으면 태그라 `#bad`도 `#fff`도 태그다 — 진짜 태그 `#bad`가 막히는 부작용이 있다).
   */
  tags?: boolean | { skipHexColors?: boolean };
  /** 인용 `[@citekey]`(Pandoc/Zotero). */
  citations?: boolean;
  /** 정의 목록: `용어` 다음 줄 `: 설명`. */
  definitions?: boolean;
  /** 목차 `[toc]`: 문서의 제목들로 그려지는 블록. */
  toc?: boolean;
  /** 할 일 상태: `- [/]` 진행 중, `- [-]` 취소, `- [>]` 미룸, `- [?]` 질문, `- [!]` 중요 (Obsidian 테마·Tasks). 할 일 항목의 `status` 속성. */
  taskStatus?: boolean;
  /** 키보드 키 `<kbd>Ctrl</kbd>`: 글자 모양의 마크. 따로 켠다(`marks`와 별개). */
  kbd?: boolean;
  /** 이모지 단축 코드 `:smile:` → 😄 (가져올 때 글자로 바꾸고, 편집기에서는 입력 규칙). */
  emoji?: boolean;
}

export const EXTRA_MARKS = ["highlight", "superscript", "subscript", "insert", "textColor", "backgroundColor"] as const;
/** 할 일 상태 글자(`[ ]`·`[x]` 밖의 것). 저장은 이 한 글자이고, 뜻은 아래 이름이다. */
export const TASK_STATUSES = { "/": "progress", "-": "cancelled", ">": "deferred", "?": "question", "!": "important" } as const;
export type TaskStatus = keyof typeof TASK_STATUSES;

export function normalizeTaskStatus(value: unknown): TaskStatus | null {
  return typeof value === "string" && Object.hasOwn(TASK_STATUSES, value) ? (value as TaskStatus) : null;
}

/** 상태를 돌려 가며 바꿀 순서(없음 → … → 없음). */
export function nextTaskStatus(current: unknown): TaskStatus | null {
  const order: Array<TaskStatus | null> = [null, "/", ">", "?", "!", "-"];
  const at = order.indexOf(normalizeTaskStatus(current));
  return order[(at + 1) % order.length] ?? null;
}

export const ABBR_MARK = "abbr";
export const KBD_MARK = "kbd";
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

/** 이 태그를 글자로 둘지(`tags: { skipHexColors: true }`일 때 16진 색 모양). */
export function isSkippedTag(name: string, extras: ExtraSyntax | undefined): boolean {
  const tags = extras?.tags;
  return typeof tags === "object" && tags.skipHexColors === true && /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(name);
}

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

// ───────────────────────── 이모지 검색(자동완성·제안) ─────────────────────────

export interface EmojiMatch {
  /** 단축 코드 이름(콜론 없이). */
  name: string;
  emoji: string;
}

/** 이름만으로는 못 찾는 이모지의 다른 말(영어 동의어와 한국어). 공백으로 나눈다. 대소문자는 무시한다. */
export const EMOJI_KEYWORDS: Readonly<Record<string, string>> = {
  smile: "웃음 미소 행복 기쁨 happy",
  smiley: "웃음 기쁨 happy",
  grin: "웃음 히죽",
  laughing: "웃음 하하 lol",
  joy: "웃겨 ㅋㅋ 눈물 lol funny",
  rofl: "빵터짐 ㅋㅋㅋ funny",
  blush: "수줍 부끄 홍조 shy",
  wink: "윙크",
  heart_eyes: "사랑 반함 love",
  kissing_heart: "뽀뽀 키스 사랑 love",
  yum: "맛있 냠 delicious",
  sunglasses: "선글라스 멋짐 cool",
  thinking: "생각 고민 hmm 음",
  neutral_face: "무표정 덤덤",
  unamused: "시큰둥 못마땅",
  sweat_smile: "당황 식은땀 whew",
  sweat: "땀 식은땀",
  pensive: "시무룩 우울",
  confused: "혼란 당황 헷갈",
  disappointed: "실망 속상",
  worried: "걱정 불안",
  angry: "화남 분노 짜증 mad",
  rage: "격분 분노 열받 mad",
  cry: "울음 슬픔 눈물 sad",
  sob: "오열 펑펑 통곡 sad",
  scream: "비명 충격 놀람 shock",
  fearful: "무서 공포 두려움",
  flushed: "당황 놀람 홍당무",
  sleepy: "졸림 피곤 tired",
  sleeping: "잠 수면 zzz",
  mask: "마스크 아픔 sick",
  nerd_face: "공부 안경 괴짜",
  star_struck: "감탄 반짝 wow",
  partying_face: "파티 축하 celebrate",
  pleading_face: "부탁 애원 please",
  hugs: "포옹 안아 hug",
  relieved: "안도 휴 편안",
  smirk: "썩소 비웃",
  innocent: "천사 순수 angel",
  slightly_smiling_face: "미소 살짝",
  upside_down_face: "거꾸로 장난",
  grimacing: "으 어색 어이",
  exploding_head: "폭발 머리 충격 mindblown",
  skull: "해골 죽음 dead",
  ghost: "유령 귀신",
  robot: "로봇 ai",
  poop: "똥 응가",
  "+1": "좋아요 엄지 최고 찬성 like good yes ok",
  thumbsup: "좋아요 엄지 최고 찬성 like good yes",
  "-1": "싫어요 반대 별로 dislike bad no",
  thumbsdown: "싫어요 반대 별로 dislike bad",
  clap: "박수 짝짝 bravo applause",
  raised_hands: "만세 환호 hooray",
  pray: "기도 부탁 감사 제발 thanks please",
  muscle: "근육 힘 파이팅 strong",
  wave: "손 인사 안녕 hello bye",
  ok_hand: "오케이 좋아 ok",
  v: "브이 승리 평화 peace",
  point_up: "위 가리킴",
  point_down: "아래 가리킴",
  point_left: "왼쪽 가리킴",
  point_right: "오른쪽 가리킴",
  fist: "주먹 파이팅",
  handshake: "악수 협력 deal",
  writing_hand: "쓰기 필기 메모",
  eyes: "눈 보다 구경 look",
  brain: "뇌 생각 지능",
  heart: "하트 사랑 love",
  orange_heart: "주황 하트",
  yellow_heart: "노랑 하트",
  green_heart: "초록 하트",
  blue_heart: "파랑 하트",
  purple_heart: "보라 하트",
  black_heart: "검정 하트",
  broken_heart: "상처 이별 실연",
  sparkling_heart: "반짝 하트",
  two_hearts: "두 하트 사랑",
  fire: "불 불꽃 핫 hot lit",
  star: "별 스타",
  star2: "별 반짝 빛남",
  sparkles: "반짝 반짝이 새로움 magic new",
  zap: "번개 전기 빠름 lightning",
  boom: "폭발 쾅 충돌",
  sunny: "해 맑음 날씨 sun",
  cloud: "구름 흐림 날씨",
  umbrella: "우산 비 rain",
  snowflake: "눈 눈송이 겨울 winter",
  rainbow: "무지개",
  ocean: "바다 파도 wave",
  earth_asia: "지구 세계 world",
  moon: "달 밤",
  tada: "축하 파티 짝짝 congrats celebrate celebration",
  confetti_ball: "축하 색종이",
  balloon: "풍선 생일",
  gift: "선물 present",
  trophy: "트로피 우승 1등 win",
  medal_sports: "메달 상",
  crown: "왕관 최고 king",
  gem: "보석 다이아 diamond",
  bell: "종 알림 notification",
  mega: "확성기 공지 announce",
  bulb: "전구 아이디어 idea 생각",
  flashlight: "손전등 랜턴",
  key: "열쇠 키 비밀번호",
  lock: "자물쇠 잠금 보안 secure",
  unlock: "잠금 해제 열림",
  hammer: "망치 공사",
  wrench: "렌치 도구 수리 fix",
  gear: "톱니 설정 settings",
  link: "링크 연결 url",
  paperclip: "클립 첨부 attach",
  pushpin: "핀 고정 pin",
  scissors: "가위 자르기",
  pencil2: "연필 쓰기 edit",
  pencil: "메모 쓰기 note",
  memo: "메모 기록 노트 note",
  book: "책 독서 read",
  books: "책 도서 독서",
  bookmark: "북마크 책갈피",
  notebook: "공책 노트",
  page_facing_up: "문서 페이지 종이",
  clipboard: "클립보드 체크리스트",
  calendar: "달력 일정",
  date: "날짜 일정 달력",
  chart_with_upwards_trend: "상승 그래프 성장 증가 growth",
  bar_chart: "그래프 통계 chart",
  mag: "돋보기 검색 search",
  mag_right: "돋보기 검색 search",
  email: "이메일 메일 편지",
  envelope: "편지 메일",
  phone: "전화",
  iphone: "휴대폰 핸드폰 스마트폰 phone",
  computer: "컴퓨터 노트북 laptop",
  keyboard: "키보드 타자",
  desktop_computer: "데스크톱 컴퓨터 모니터",
  printer: "프린터 인쇄",
  floppy_disk: "저장 디스켓 save",
  cd: "시디 디스크",
  camera: "카메라 사진 photo",
  movie_camera: "영상 촬영 video",
  tv: "텔레비전 티비",
  radio: "라디오",
  headphones: "헤드폰 음악 이어폰",
  microphone: "마이크 노래 녹음",
  musical_note: "음표 음악 music",
  notes: "음표 음악 music",
  guitar: "기타 음악",
  video_game: "게임 컨트롤러 game",
  dart: "과녁 목표 표적 goal target",
  art: "그림 미술 팔레트",
  package: "상자 택배 배송 박스 box",
  truck: "트럭 배송 delivery",
  car: "자동차 차",
  bus: "버스",
  airplane: "비행기 여행 travel",
  rocket: "로켓 출시 런칭 배포 launch deploy",
  ship: "배 선박",
  bike: "자전거",
  house: "집 홈 home",
  office: "회사 사무실 직장 work",
  school: "학교",
  hospital: "병원",
  bank: "은행 돈",
  hotel: "호텔 숙소",
  coffee: "커피 카페 cafe",
  tea: "차 녹차",
  beer: "맥주 술 건배",
  wine_glass: "와인 술",
  pizza: "피자 음식 food",
  hamburger: "햄버거 음식 food",
  fries: "감자튀김 음식",
  apple: "사과 과일",
  banana: "바나나 과일",
  strawberry: "딸기 과일",
  cake: "케이크 생일 디저트",
  cookie: "쿠키 과자",
  ice_cream: "아이스크림 디저트",
  dog: "강아지 개 멍멍",
  cat: "고양이 냥이 야옹",
  mouse: "쥐",
  rabbit: "토끼",
  bear: "곰",
  panda_face: "판다",
  koala: "코알라",
  tiger: "호랑이",
  lion: "사자",
  cow: "소",
  pig: "돼지",
  frog: "개구리",
  monkey: "원숭이",
  chicken: "닭",
  penguin: "펭귄",
  bird: "새",
  fish: "물고기 생선",
  whale: "고래",
  octopus: "문어",
  butterfly: "나비",
  bug: "벌레 버그 오류 error",
  bee: "벌 꿀벌",
  turtle: "거북이",
  snake: "뱀",
  unicorn: "유니콘",
  tree: "나무",
  evergreen_tree: "소나무 침엽수",
  palm_tree: "야자수 휴양",
  cactus: "선인장",
  herb: "허브 풀 잎",
  four_leaf_clover: "네잎클로버 행운 luck",
  maple_leaf: "단풍 가을",
  rose: "장미 꽃",
  sunflower: "해바라기 꽃",
  tulip: "튤립 꽃",
  cherry_blossom: "벚꽃 봄",
  mushroom: "버섯",
  white_check_mark: "체크 완료 확인 done 성공 success",
  heavy_check_mark: "체크 완료 확인 done",
  x: "엑스 취소 실패 삭제 no cancel fail",
  negative_squared_cross_mark: "엑스 취소 no",
  warning: "경고 주의 위험 caution",
  no_entry: "금지 출입금지 stop",
  no_entry_sign: "금지 안됨 no",
  question: "물음표 질문 궁금 ?",
  exclamation: "느낌표 중요 !",
  grey_question: "물음표 질문",
  grey_exclamation: "느낌표",
  bangbang: "느낌표 강조",
  interrobang: "물음표 느낌표",
  heavy_plus_sign: "더하기 추가 plus add",
  heavy_minus_sign: "빼기 삭제 minus",
  arrow_right: "화살표 오른쪽 다음",
  arrow_left: "화살표 왼쪽 이전",
  arrow_up: "화살표 위",
  arrow_down: "화살표 아래",
  arrows_counterclockwise: "새로고침 반복 refresh sync",
  recycle: "재활용 순환",
  hourglass: "모래시계 기다림 대기 wait",
  alarm_clock: "알람 시계 시간 time",
  stopwatch: "스톱워치 시간 타이머",
  "100": "백점 만점 완벽 perfect",
  new: "새로운 신규 new",
  free: "무료",
  ok: "오케이 확인",
  sos: "도움 긴급 help",
  up: "위 업",
  cool: "멋짐 쿨",
  red_circle: "빨강 동그라미 원",
  orange_circle: "주황 동그라미 원",
  yellow_circle: "노랑 동그라미 원",
  green_circle: "초록 동그라미 원",
  blue_circle: "파랑 동그라미 원",
  purple_circle: "보라 동그라미 원",
  black_circle: "검정 동그라미 원",
  white_circle: "하양 동그라미 원",
  checkered_flag: "결승 깃발 완료 finish",
  triangular_flag_on_post: "깃발 표시 flag",
  kr: "한국 대한민국 korea 태극기",
  us: "미국 usa america",
  jp: "일본 japan",
  cn: "중국 china",
  gb: "영국 uk britain",
  de: "독일 germany",
  fr: "프랑스 france",
};

/** 이모지 단축 코드 전부(정의 순서). */
export function allEmoji(): EmojiMatch[] {
  return [...EMOJI].map(([name, emoji]) => ({ name, emoji }));
}

/** 이모지 후보를 못 정했을 때(최근 쓴 것이 없을 때) 보여 줄 기본 제안. */
export const DEFAULT_EMOJI_SUGGESTIONS: readonly string[] = ["+1", "smile", "joy", "heart", "tada", "fire", "pray", "eyes", "white_check_mark", "thinking", "sparkles", "rocket"];

const normalizeQuery = (value: string) => value.toLowerCase().replace(/[\s_:-]+/g, "");

/**
 * 이모지 검색: `query`(콜론 없이)를 이름·한국어·영어 동의어로 찾는다. 순서는 ① 이름이 같음 ② 이름이 `query`로 시작 ③ 동의어가 `query`로 시작 ④ 이름에 포함 ⑤ 동의어에 포함이다
 * (같은 등급에서는 동의어에서 **앞에 적힌 낱말**로 맞은 것이 먼저, 그다음 `recent`에 있는 것, 그다음 이름이 짧은 것, 그다음 정의 순서). `query`가 비면 `recent`(없으면 기본 제안)를 돌려준다. 모르는 이름은 건너뛴다.
 */
export function searchEmoji(query: string, limit = 8, recent: readonly string[] = []): EmojiMatch[] {
  const q = normalizeQuery(query);
  const pick = (names: readonly string[]) => names.flatMap((name) => (EMOJI.has(name) ? [{ name, emoji: EMOJI.get(name)! }] : [])).slice(0, limit);
  if (q === "") return pick(recent.length > 0 ? recent : DEFAULT_EMOJI_SUGGESTIONS);

  // 등급(0~4)과, 동의어로 맞았을 때는 맞은 낱말이 동의어 목록에서 몇 번째인지(앞일수록 그 이모지의 대표 말이다).
  const rank = new Map<string, { level: number; word: number }>();
  for (const name of EMOJI.keys()) {
    const key = normalizeQuery(name);
    const words = (EMOJI_KEYWORDS[name] ?? "").split(/\s+/).filter(Boolean).map(normalizeQuery);
    const prefixWord = words.findIndex((word) => word.startsWith(q));
    const includesWord = words.findIndex((word) => word.includes(q));
    if (key === q) rank.set(name, { level: 0, word: 0 });
    else if (key.startsWith(q)) rank.set(name, { level: 1, word: 0 });
    else if (prefixWord >= 0) rank.set(name, { level: 2, word: prefixWord });
    else if (key.includes(q)) rank.set(name, { level: 3, word: 0 });
    else if (includesWord >= 0) rank.set(name, { level: 4, word: includesWord });
  }
  const recentIndex = (name: string) => {
    const at = recent.indexOf(name);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  const order = new Map([...EMOJI.keys()].map((name, index) => [name, index] as const));
  return [...rank]
    .sort(([a, rankA], [b, rankB]) => rankA.level - rankB.level || rankA.word - rankB.word || recentIndex(a) - recentIndex(b) || a.length - b.length || order.get(a)! - order.get(b)!)
    .slice(0, limit)
    .map(([name]) => ({ name, emoji: EMOJI.get(name)! }));
}
