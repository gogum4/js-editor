# @gogum4/editor-render

## 0.4.0

### Minor Changes

- 77a3ff4: 추가 문법(`extras`)을 더한다: 하이라이트(`==글==`)·위첨자·아래첨자·삽입·글자색·배경색·약어(마크), 주석(`%%글%%`)·태그(`#태그`)·인용(`[@citekey]`)·정의 목록·목차(`[toc]`), 이모지 단축 코드(`:smile:`), 인라인 각주(`^[글]`), 페이지의 제목 위치(`[[노트#제목]]`, `ImportContext.anchors`), Zotero 링크(`zotero://`).
  
  - **켜야 쓰인다**: `createCoreExtensions({ extras })`, `ImportContext.extras`, `MarkdownOptions.extras`. 켜지 않으면 스키마·읽기·쓰기가 그대로다(노트 앱 영향 없음). 켠 소비자는 본문 스키마 버전을 올린다. `renderMarkdown`은 기본으로 모두 읽는다(`extras: false`로 끈다).
  - 선택 서식 막대 `SelectionToolbar`(editor-react): 글을 선택하면 굵게·기울임·취소선·밑줄·코드, (켠 마크가 있으면) 하이라이트·위/아래 첨자·삽입, 글자색·배경색 팔레트, 약어 설명, 링크. 스키마에 없는 서식의 단추는 숨는다.
  - 옵션: `tags: { skipHexColors: true }`(16진 색 모양은 태그가 아님), `MarkdownOptions.abbrStyle: "definitions"`(약어를 `*[HTML]: 설명` 정의로), 정의 목록 설명의 줄바꿈, 이웃한 정의 목록 자동 합치기.
  - 편집기: 입력 규칙(`==글==`·`^글^`·`++글++`·`%%글%%`·`#태그 `·`[@키]`·`:이모지:`), 단축키(Ctrl+Shift+H 하이라이트, Ctrl+. 위첨자, Ctrl+, 아래첨자), 슬래시 항목(목차·정의 목록·주석·인용·글자색/배경색), 포트 `EditorPorts.citations`.
  - 렌더러: 새 마크·노드를 그리고, 옵션 `tagHref`·`citationLabel`·`citationHref`·`showComments`를 더한다.
  - 규칙은 `@gogum4/editor-schema/extras`(색·태그·인용·이모지 정리). 자세한 표기와 한계는 docs/MARKDOWN-DIALECT.md "추가 문법".

### Patch Changes

- Updated dependencies [77a3ff4]
  - @gogum4/editor-schema@0.4.0
  - @gogum4/editor-markdown@0.4.0

## 0.3.0

### Minor Changes

- 8ac3767: 콜아웃에 `title`(제목)과 `fold`(`+`/`-`, 접을 수 있음) 속성을 더하고, 임베드에 Bluesky 공급자를 더한다.
  
  - **콜아웃**: `> [!note]- 제목`의 제목은 이제 굵은 첫 문단이 아니라 `title` 속성으로, `+`/`-`는 `fold` 속성으로 읽고 그대로 내보낸다. 편집기 콜아웃 메뉴에서 제목과 접기를 정하고 제목 줄에서 접고 편다. 렌더러는 제목을 그리고 접을 수 있으면 `<details>`로 그린다. **이미 굵은 문단으로 저장된 글은 그대로 읽힌다.** 노드에 속성이 더해지므로 본문을 저장하는 소비자는 스키마 버전을 올린다(노트 앱은 콜아웃을 쓰므로 해당). 새 문구(`callout.titlePlaceholder` 등)가 문구 표에 더해졌다.
  - **Bluesky 임베드**: `![](https://bsky.app/profile/핸들 또는 DID/post/키)`. `embed.bsky.app`이 DID만 받아서 핸들 주소는 `embedSource`가 null(원본 링크만 보임)이다. `withBlueskyDid`·`blueskyProfile`, 편집기 포트 `resolveBlueskyHandle`, 렌더러 옵션 `blueskyDids`로 DID를 주면 그려진다.
- ec19b9d: Markdown 가져오기에 `ImportContext.profile`(방언 항목 덮어쓰기)과 `DialectProfile` 타입 내보내기를 더한다. `dialect: "obsidian"`에 `{ rawEmbeds: true, keepAnyHref: true, mdLinksToPages: false }`를 얹으면 콜아웃·수식·각주는 Obsidian대로 읽으면서 이미지·HTML·열 정렬 표는 원문으로 보존한다(블로그가 0.1의 `dialect: "blog"`를 대신해 쓴다). 쓰지 않으면 달라지는 것이 없다.

### Patch Changes

- Updated dependencies [8ac3767]
- Updated dependencies [ec19b9d]
  - @gogum4/editor-schema@0.3.0
  - @gogum4/editor-markdown@0.3.0

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
  - @gogum4/editor-markdown@0.2.0

## 0.1.0

### Minor Changes

- 3a5ab80: 첫 버전(0.1.0). 노트 앱·블로그(시각 모드)·캘린더(임베드 번들)가 쓰는 에디터 패키지: 스키마 규칙, Markdown 변환(Obsidian·블로그 방언), 읽기 전용 렌더러, TipTap 코어(포트·참조 노드·원문 보존 노드), React 화면과 다크 모드.
- 12bedd7: 일반 GFM 문서용 방언 `gfm`(위키 링크만 읽고 콜아웃·수식·각주·`^id`·HTML 변환 없음)과 방언 플래그 묶음(`DialectProfile`), `[[대상|표시]]`의 표시 글자를 `pageLink.label`로 보존, `gfm` 방언의 최소 이스케이프(`_`·`~`·`*`·`<`를 서식이 될 수 있는 자리만)와 글머리·할 일이 섞인 목록의 보존, 열자마자 문서 정리를 끝내는 옵션 `createCoreExtensions({ settle: true })`(원자 노드를 처음 누를 때 나는 "Selection passed to setSelection" 오류 방지), `gfm`에서 물결표 하나(`10~30`)를 취소선으로 읽지 않기·상대 경로 링크 보존, **이어지는 같은 서식의 글자 노드를 한 쌍의 기호로 묶는 내보내기**(굵은 글씨 안의 코드 조각 등 모든 방언), 참조 노드의 선택 속성 `props`(`{{table:이름 rows=5}}` 같은 설정; 해석기 `resolve`·`open`의 둘째 인자, `renderReference`의 `props`).

### Patch Changes

- Updated dependencies [3a5ab80]
- Updated dependencies [12bedd7]
  - @gogum4/editor-schema@0.1.0
  - @gogum4/editor-markdown@0.1.0
