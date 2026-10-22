/** 첨부 이미지(자산)에 관한 순수 규칙. 저장소(Rust `pages::assets`)의 규칙과 같아야 한다. */

export const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** 한 파일의 최대 크기 (Rust의 `MAX_ASSET_BYTES`와 같다). */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export function isSupportedImageType(mime: string): boolean {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime);
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

export type ImageFileCheck = { ok: true } | { ok: false; reason: string };

/** 붙이기 전에 화면에서 미리 확인한다(저장소도 바이트로 다시 확인한다). */
export function checkImageFile(file: { type: string; size: number; name: string }): ImageFileCheck {
  if (!isSupportedImageType(file.type)) {
    return { ok: false, reason: "이미지는 PNG·JPEG·GIF·WebP만 붙일 수 있어요." };
  }
  if (file.size === 0) return { ok: false, reason: "빈 파일은 붙일 수 없어요." };
  if (file.size > MAX_ASSET_BYTES) {
    return { ok: false, reason: `이미지는 ${MAX_ASSET_BYTES / 1024 / 1024}MB까지 붙일 수 있어요.` };
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

/** 해시 형식(소문자 16진수 64자)인지. */
export function isAssetHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
