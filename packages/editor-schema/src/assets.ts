/** 첨부 이미지(자산)에 관한 순수 규칙. 저장소(Rust `pages::assets`)의 규칙과 같아야 한다. */

export const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/**
 * SVG. 스크립트·외부 주소가 들어갈 수 있어서 **기본으로는 받지 않는다**. 저장소가 SVG를 정화·검사할 수 있는 소비자만
 * `AssetStore.acceptedTypes`(코어)·`checkImageFile`의 `accepted`에 이 형식을 더해 켠다.
 */
export const SVG_IMAGE_TYPE = "image/svg+xml";

/** 한 파일의 최대 크기 (Rust의 `MAX_ASSET_BYTES`와 같다). */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

/** 받는 형식인지. `accepted`를 주지 않으면 `SUPPORTED_IMAGE_TYPES`(래스터 네 가지)다. */
export function isSupportedImageType(mime: string, accepted: readonly string[] = SUPPORTED_IMAGE_TYPES): boolean {
  return accepted.includes(mime);
}

/** 형식에 맞는 파일 확장자. 모르는 형식은 `bin`. */
export function assetExtension(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case SVG_IMAGE_TYPE:
      return "svg";
    default:
      return "bin";
  }
}

/** 내보낼 때 쓰는 파일 이름: 해시 앞 16자 + 확장자 (Rust의 `file_name_for`와 같다). */
export function assetFileName(hash: string, mime: string): string {
  return `${hash.slice(0, 16)}.${assetExtension(mime)}`;
}

/** 파일 이름에서 확장자를 떼어 대체 글자(alt)로 쓴다. 비면 빈 문자열. */
export function altFromFileName(name: string): string {
  return name.trim().replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/\s+/g, " ").trim();
}

/** `code`로 사유를 구분하고(다른 언어의 안내를 만들 때), `reason`은 한국어 기본 문장이다. */
export type ImageFileCheck = { ok: true } | { ok: false; code: "type" | "empty" | "size"; reason: string };

const TYPE_LABELS: Readonly<Record<string, string>> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/gif": "GIF",
  "image/webp": "WebP",
  [SVG_IMAGE_TYPE]: "SVG",
};

/** 붙이기 전에 화면에서 미리 확인한다(저장소도 바이트로 다시 확인한다). `accepted`는 받는 형식(기본 `SUPPORTED_IMAGE_TYPES`). */
export function checkImageFile(
  file: { type: string; size: number; name: string },
  accepted: readonly string[] = SUPPORTED_IMAGE_TYPES,
): ImageFileCheck {
  if (!isSupportedImageType(file.type, accepted)) {
    const labels = accepted.map((mime) => TYPE_LABELS[mime] ?? mime).join("·");
    return { ok: false, code: "type", reason: `이미지는 ${labels}만 붙일 수 있어요.` };
  }
  if (file.size === 0) return { ok: false, code: "empty", reason: "빈 파일은 붙일 수 없어요." };
  if (file.size > MAX_ASSET_BYTES) {
    return { ok: false, code: "size", reason: `이미지는 ${MAX_ASSET_BYTES / 1024 / 1024}MB까지 붙일 수 있어요.` };
  }
  return { ok: true };
}

/** 바이트 머리글자로 이미지 형식을 알아본다(Rust의 `sniff_image_mime`과 같은 기준). 모르면 null. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || starts(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) return "image/gif";
  if (bytes.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

/**
 * SVG처럼 보이는지(앞의 공백·BOM·XML 선언·주석 뒤에 `<svg`가 오는지). **안전한지는 보지 않는다** — 저장소가 이미 검사한 바이트를
 * 화면에 보일 때 형식(`Blob`의 type)을 모르면 쓰는 용도다. `sniffImageMime`은 래스터 네 가지만 알아본다(받는 형식의 판단에 쓰는 소비자가 있다).
 */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  return /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>\s*)*<svg[\s>/]/i.test(head);
}

/** 해시 형식(소문자 16진수 64자)인지. */
export function isAssetHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
