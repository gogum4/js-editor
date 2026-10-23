import { sniffImageMime } from "@9um4-utils/editor-schema/assets";
import type { AssetStore } from "../ports/types";

/**
 * 첨부 이미지를 화면에 보이려면 바이트를 읽어 `blob:` 주소로 바꿔야 한다. 같은 이미지는 한 번만 읽고
 * 주소를 재사용한다(여러 곳에 같은 이미지가 있거나 페이지를 다시 열 때). 주소는 저장소가 사는 동안 유지한다.
 * 읽기에 실패하면 캐시에서 빼서 다음에 다시 시도할 수 있게 한다.
 * `mime`을 모르면(빈 글자, 예: 속성에 해시만 저장된 썸네일) 바이트의 머리글자로 알아본다.
 */
export interface AssetCache {
  loadUrl(hash: string, mime: string): Promise<string>;
  /** 시험용: 캐시를 비운다. */
  clear(): void;
}

export function createAssetCache(assets: AssetStore): AssetCache {
  const urls = new Map<string, Promise<string>>();
  return {
    loadUrl(hash, mime) {
      let pending = urls.get(hash);
      if (!pending) {
        pending = assets
          .get(hash)
          .then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime || sniffImageMime(bytes) || "" })));
        urls.set(hash, pending);
        pending.catch(() => {
          if (urls.get(hash) === pending) urls.delete(hash);
        });
      }
      return pending;
    },
    clear: () => urls.clear(),
  };
}

const caches = new WeakMap<AssetStore, AssetCache>();

/** 이 이미지 저장소의 캐시(없으면 만든다). 같은 저장소를 쓰는 에디터들이 나눠 쓴다. */
export function assetCacheFor(assets: AssetStore): AssetCache {
  let cache = caches.get(assets);
  if (!cache) caches.set(assets, (cache = createAssetCache(assets)));
  return cache;
}
