# @gogum4/editor-react

## 0.2.0

### Minor Changes

- 2f65502: **깨지는 변경(0.x라 minor)**: 블로그 방언을 없애고 Obsidian 호환 문법으로 일원화했다.
  
  - 제거: `dialect: "blog"`, `directive`·`softBreak` 노드, `ImportContext.rawDirectives`, `isContainerOpener`, `Directive`·`SoftBreak` 확장. `raw: true`는 `raw`·`rawInline`만 켠다(HTML 등 대응 노드 없는 조각용).
  - 콜아웃: 종류를 **아무 이름이나** 받는다(`> [!rocket]`). 기본 5종은 대문자(GitHub 알림), 그 밖은 소문자 그대로 쓰고, Obsidian 별칭을 5종으로 합치지 않는다. 아이콘 표 `EditorPorts.calloutIcons`·렌더러 `calloutIcons`, `calloutMeta()`.
  - 임베드(옵션 `embed: true`): `embed` 노드, `/임베드`, 주소로 공급자를 알아내는 `detectEmbed`(YouTube·X·Instagram·Pinterest·SoundCloud), Markdown은 `![](주소)`·`![|500x300](주소)`, 렌더러는 허용한 도메인의 iframe만 그린다. 소비자의 개체는 `EditorPorts.parseEmbedInput` + `reference` 노드(`![[슬러그]]`)로 잇는다.
  - 들여쓰기(옵션 `indent: true`): 문단·제목의 `indent`(1~8단계), Tab/Shift+Tab, Markdown은 줄 맨 앞 `&emsp;` × (단계×2), 렌더러는 2em 왼쪽 여백.
  - `renderMarkdown`에 `embeds`·`indent` 옵션(기본 켜짐).
  - **타입 이행**: `CalloutType`은 `string`이고 `CALLOUT_META`는 기본 5종만 키로 가진다 — 임의 이름의 모양은 `CALLOUT_META[type]` 대신 `calloutMeta(type, icons?)`로 읽는다(`CALLOUT_META[type].icon` → `calloutMeta(type).icon`). `calloutTypeFromName`은 별칭을 합치지 않고 이름을 그대로 돌려준다(이름으로 쓸 수 없는 글자면 null).
  - 노트 앱처럼 위 옵션을 켜지 않는 소비자는 스키마가 같다. 켜는 소비자는 본문 스키마 버전을 올린다.

### Patch Changes

- Updated dependencies [2f65502]
  - @gogum4/editor-schema@0.2.0
  - @gogum4/editor-core@0.2.0

## 0.1.0

### Minor Changes

- 3a5ab80: 첫 버전(0.1.0). 노트 앱·블로그(시각 모드)·캘린더(임베드 번들)가 쓰는 에디터 패키지: 스키마 규칙, Markdown 변환(Obsidian·블로그 방언), 읽기 전용 렌더러, TipTap 코어(포트·참조 노드·원문 보존 노드), React 화면과 다크 모드.
- 12bedd7: 일반 GFM 문서용 방언 `gfm`(위키 링크만 읽고 콜아웃·수식·각주·`^id`·HTML 변환 없음)과 방언 플래그 묶음(`DialectProfile`), `[[대상|표시]]`의 표시 글자를 `pageLink.label`로 보존, `gfm` 방언의 최소 이스케이프(`_`·`~`·`*`·`<`를 서식이 될 수 있는 자리만)와 글머리·할 일이 섞인 목록의 보존, 열자마자 문서 정리를 끝내는 옵션 `createCoreExtensions({ settle: true })`(원자 노드를 처음 누를 때 나는 "Selection passed to setSelection" 오류 방지), `gfm`에서 물결표 하나(`10~30`)를 취소선으로 읽지 않기·상대 경로 링크 보존, **이어지는 같은 서식의 글자 노드를 한 쌍의 기호로 묶는 내보내기**(굵은 글씨 안의 코드 조각 등 모든 방언), 참조 노드의 선택 속성 `props`(`{{table:이름 rows=5}}` 같은 설정; 해석기 `resolve`·`open`의 둘째 인자, `renderReference`의 `props`).

### Patch Changes

- Updated dependencies [3a5ab80]
- Updated dependencies [12bedd7]
  - @gogum4/editor-schema@0.1.0
  - @gogum4/editor-core@0.1.0
