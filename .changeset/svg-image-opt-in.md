---
"@gogum4/editor-schema": minor
"@gogum4/editor-core": minor
---

SVG 이미지를 소비자가 켤 수 있게 한다(기본은 그대로 받지 않는다).

- `editor-schema`: `SVG_IMAGE_TYPE`, `looksLikeSvg`를 더하고, `isSupportedImageType`·`checkImageFile`에 받는 형식 목록(`accepted`, 기본 `SUPPORTED_IMAGE_TYPES`)을 선택 인자로 받는다. `assetExtension("image/svg+xml")`은 `svg`다.
- `editor-core`: `AssetStore.acceptedTypes`(선택)로 붙여넣기·끌어 놓기·고르는 창이 받는 형식을 정한다. SVG를 넣는 소비자는 `put`에서 정화·검사해야 한다. 형식을 모르는 이미지(`mime`이 빈 썸네일 등)를 보일 때 SVG도 알아본다.
