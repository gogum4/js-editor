import type { CalloutIcons } from "@gogum4/editor-schema/callout";
import type { ReferenceProps, ReferenceTarget } from "@gogum4/editor-schema/reference";

/**
 * 에디터가 바깥(앱)에서 필요로 하는 것들. 에디터 코드는 `lib/api`나 화면 저장소를 직접 부르지 않고 이 포트만 쓴다
 * (docs/EDITOR-PACKAGE.md 4절). 앱은 `appPorts`로, 시험과 다른 소비자는 `memoryPorts`나 자기 구현으로 채운다.
 */

/** 이 컴퓨터에 두는 작은 설정(토글 열림 상태 등). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface StoredAsset {
  /** 내용의 SHA-256(소문자 16진수 64자). 본문에는 이것만 들어간다. */
  hash: string;
  mime: string;
}

/** 첨부 이미지 저장소. */
export interface AssetStore {
  /** 이미지 바이트를 저장한다(같은 내용은 한 번만 저장). */
  put(bytes: Uint8Array): Promise<StoredAsset>;
  /** 저장된 이미지 바이트. 없으면 거절한다. */
  get(hash: string): Promise<Uint8Array>;
  /** 이 기기에 없는 이미지를 다른 곳에서 받아 달라고 요청한다. 요청을 접수하면 true(받으면 `onArrived`로 알린다). */
  requestRemote?(hash: string): boolean;
  /** 이 해시의 이미지가 도착하면 `listener`를 부른다. 해제 함수를 돌려준다. */
  onArrived?(hash: string, listener: () => void): () => void;
}

/** 사용자에게 알리는 창구. */
export interface Notifier {
  /** 일반 안내. */
  notice(message: string): void;
  /** 예상하지 못한 오류. */
  error(error: unknown): void;
}

/** 링크를 바깥(기본 브라우저·메일 앱)에서 여는 창구. 열어도 되는 주소인지는 에디터가 먼저 가린다(`isSafeToOpen`). */
export interface UrlOpener {
  open(url: string): Promise<void>;
}

/** 참조 노드가 가리키는 개체를 해석한 결과. */
export interface ReferenceInfo {
  title: string;
  description?: string;
  /** 소비자가 정한 미리 보기 데이터(표 스키마의 열 목록 등). 코어는 모양을 모르고 `renderPreview`에 그대로 넘긴다. */
  preview?: unknown;
}

/**
 * 한 종류(`kind`)의 참조를 해석하는 소비자 쪽 구현(docs/EDITOR-PACKAGE.md §2). 노트 앱은 `page`를, PlanBench는 `table-schema`를 등록한다.
 * 코어는 개체의 모양을 모른다 — 제목·설명과 소비자가 그리는 미리 보기만 다룬다.
 */
export interface ReferenceResolver {
  /** id의 개체를 읽는다. 없거나 지워졌으면 null(삭제됨으로 보인다). 거절하면 "불러오지 못함"으로 보인다. */
  resolve(id: string, props?: ReferenceProps): Promise<ReferenceInfo | null>;
  /** 카드를 눌렀을 때(개체 열기). 없으면 눌러도 아무 일이 없다. */
  open?(id: string, props?: ReferenceProps): void | Promise<void>;
  /** 개체가 바뀌거나 지워지면 `listener`를 부른다(카드가 다시 읽는다). 해제 함수를 돌려준다. */
  subscribe?(id: string, listener: () => void): () => void;
  /**
   * 미리 보기를 `container`에 그린다(React 없는 코어라 DOM 접점이다 — React 소비자는 여기서 `createRoot`를 쓴다). 정리 함수를 돌려주면 다시 그리기 전과 카드가 없어질 때 부른다.
   * 없으면 제목과 설명만 보인다.
   */
  renderPreview?(info: ReferenceInfo, container: HTMLElement): (() => void) | void;
}

export interface EditorPorts {
  keyValue: KeyValueStore;
  links: UrlOpener;
  assets: AssetStore;
  notifier: Notifier;
  /** 참조 노드(`createCoreExtensions({ reference: true })`)의 종류별 해석기. 없는 종류는 "알 수 없는 참조"로 보인다. */
  references?: Readonly<Record<string, ReferenceResolver>>;
  /** 콜아웃 종류별 아이콘 표(이모지나 짧은 글). `> [!rocket]`처럼 아이콘을 모르는 종류의 아이콘을 정하거나 기본 종류의 아이콘을 바꾼다. */
  calloutIcons?: CalloutIcons;
  /**
   * 임베드 입력(`/임베드`에 붙여 넣은 글)을 소비자가 알아보게 한다. 외부 공급자(YouTube·X …)로 알아보지 못한 글을 받아, 소비자의 개체를 가리키는 참조 대상이면 그 대상을, 아니면 null을 돌려준다
   * (예: 블로그의 `https://내사이트/글/슬러그` → `{ kind: "post", id: "슬러그" }`). 참조 노드(`reference: true`)가 켜져 있어야 한다.
   */
  parseEmbedInput?: (input: string) => ReferenceTarget | null;
  /**
   * Bluesky 핸들(`alice.bsky.social`)을 DID(`did:plc:…`)로 알아낸다(`com.atproto.identity.resolveHandle`). Bluesky의 임베드 주소가 DID만 받기 때문에, 핸들 주소의 임베드를 끼우거나 열면
   * 이 함수로 DID를 알아내 주소를 DID 모양으로 바꾼다. 없거나 null을 돌려주면 핸들 주소의 임베드는 원본 링크만 보인다. 네트워크 요청이라 소비자가 정한다(코어는 요청하지 않는다).
   */
  resolveBlueskyHandle?: (handle: string) => Promise<string | null>;
  /**
   * 인용(`[@citekey]`, `createCoreExtensions({ extras: { citations: true } })`)의 해석. `label`이 키들의 사람이 읽는 글(예: "Smith 2020")을 돌려주면 인용 칩에 그 글이 보이고,
   * `open`은 Ctrl/⌘+클릭으로 그 키의 항목을 연다(예: Zotero 앱). 둘 다 없으면 칩은 `@키` 그대로 보이고 눌러도 열리지 않는다.
   */
  citations?: {
    /** `narrative`가 참이면 서술형 인용(`@키`)이라 "Smith (2020)"처럼, 아니면 괄호형 "Smith 2020"으로 돌려준다. */
    label?(keys: readonly string[], options?: { narrative?: boolean }): Promise<string | null>;
    open?(key: string): void | Promise<void>;
    /** 참고문헌 목록(`[bibliography]`)의 한 줄 글. 키마다 하나(모르는 키는 null이라 키가 그대로 보인다). */
    entries?(keys: readonly string[]): Promise<Array<string | null>>;
  };
}
