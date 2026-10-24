---
"@gogum4/editor-schema": minor
"@gogum4/editor-markdown": minor
"@gogum4/editor-render": minor
"@gogum4/editor-core": minor
"@gogum4/editor-react": minor
---

**깨지는 변경(0.x라 minor)**: 블로그 방언을 없애고 Obsidian 호환 문법으로 일원화했다.

- 제거: `dialect: "blog"`, `directive`·`softBreak` 노드, `ImportContext.rawDirectives`, `isContainerOpener`, `Directive`·`SoftBreak` 확장. `raw: true`는 `raw`·`rawInline`만 켠다(HTML 등 대응 노드 없는 조각용).
- 콜아웃: 종류를 **아무 이름이나** 받는다(`> [!rocket]`). 기본 5종은 대문자(GitHub 알림), 그 밖은 소문자 그대로 쓰고, Obsidian 별칭을 5종으로 합치지 않는다. 아이콘 표 `EditorPorts.calloutIcons`·렌더러 `calloutIcons`, `calloutMeta()`.
- 임베드(옵션 `embed: true`): `embed` 노드, `/임베드`, 주소로 공급자를 알아내는 `detectEmbed`(YouTube·X·Instagram·Pinterest·SoundCloud), Markdown은 `![](주소)`·`![|500x300](주소)`, 렌더러는 허용한 도메인의 iframe만 그린다. 소비자의 개체는 `EditorPorts.parseEmbedInput` + `reference` 노드(`![[슬러그]]`)로 잇는다.
- 들여쓰기(옵션 `indent: true`): 문단·제목의 `indent`(1~8단계), Tab/Shift+Tab, Markdown은 줄 맨 앞 `&emsp;` × (단계×2), 렌더러는 2em 왼쪽 여백.
- `renderMarkdown`에 `embeds`·`indent` 옵션(기본 켜짐).
- **타입 이행**: `CalloutType`은 `string`이고 `CALLOUT_META`는 기본 5종만 키로 가진다 — 임의 이름의 모양은 `CALLOUT_META[type]` 대신 `calloutMeta(type, icons?)`로 읽는다(`CALLOUT_META[type].icon` → `calloutMeta(type).icon`). `calloutTypeFromName`은 별칭을 합치지 않고 이름을 그대로 돌려준다(이름으로 쓸 수 없는 글자면 null).
- 노트 앱처럼 위 옵션을 켜지 않는 소비자는 스키마가 같다. 켜는 소비자는 본문 스키마 버전을 올린다.
