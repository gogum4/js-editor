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

export interface EditorPorts {
  keyValue: KeyValueStore;
  links: UrlOpener;
  assets: AssetStore;
  notifier: Notifier;
}
