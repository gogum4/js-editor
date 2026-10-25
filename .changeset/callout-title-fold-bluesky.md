---
"@gogum4/editor-schema": minor
"@gogum4/editor-markdown": minor
"@gogum4/editor-render": minor
"@gogum4/editor-core": minor
"@gogum4/editor-react": minor
---

콜아웃에 `title`(제목)과 `fold`(`+`/`-`, 접을 수 있음) 속성을 더하고, 임베드에 Bluesky 공급자를 더한다.

- **콜아웃**: `> [!note]- 제목`의 제목은 이제 굵은 첫 문단이 아니라 `title` 속성으로, `+`/`-`는 `fold` 속성으로 읽고 그대로 내보낸다. 편집기 콜아웃 메뉴에서 제목과 접기를 정하고 제목 줄에서 접고 편다. 렌더러는 제목을 그리고 접을 수 있으면 `<details>`로 그린다. **이미 굵은 문단으로 저장된 글은 그대로 읽힌다.** 노드에 속성이 더해지므로 본문을 저장하는 소비자는 스키마 버전을 올린다(노트 앱은 콜아웃을 쓰므로 해당). 새 문구(`callout.titlePlaceholder` 등)가 문구 표에 더해졌다.
- **Bluesky 임베드**: `![](https://bsky.app/profile/핸들 또는 DID/post/키)`. `embed.bsky.app`이 DID만 받아서 핸들 주소는 `embedSource`가 null(원본 링크만 보임)이다. `withBlueskyDid`·`blueskyProfile`, 편집기 포트 `resolveBlueskyHandle`, 렌더러 옵션 `blueskyDids`로 DID를 주면 그려진다.
