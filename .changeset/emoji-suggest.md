---
"@gogum4/editor-schema": minor
"@gogum4/editor-markdown": minor
"@gogum4/editor-render": minor
"@gogum4/editor-core": minor
"@gogum4/editor-react": minor
---

이모지 자동완성과 제안을 더한다(`extras.emoji`를 켠 편집기). 줄 맨 앞이나 공백 뒤에서 `:`를 치면 메뉴가 뜬다.

- `:`만 치면 **최근에 쓴 이모지**(없으면 기본 제안), 두 글자 이상이면 이름·한국어·영어 동의어로 찾은 후보(`:웃음`·`:하트`·`:좋아요`·`:thumbs`). 고르면 이모지가 입력되고 최근 목록(포트 `keyValue`의 `emoji.recent`)의 맨 앞에 오른다. 한 글자·시간 표기·코드 안에서는 뜨지 않는다.
- `@gogum4/editor-schema/extras`: `searchEmoji`·`allEmoji`·`DEFAULT_EMOJI_SUGGESTIONS`·`EMOJI_KEYWORDS`. 편집기: `EmojiSuggest`(core), `menus.emoji`·`emojiMenuRender`(react, `createReactExtensions`가 기본으로 채운다), 문구 `extras.emojiMenu`.
- 새로 더한 노드·마크는 없어서 본문 스키마 버전은 그대로다.
