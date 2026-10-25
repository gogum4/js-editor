---
"@gogum4/editor-schema": minor
"@gogum4/editor-markdown": minor
"@gogum4/editor-render": minor
"@gogum4/editor-core": minor
"@gogum4/editor-react": minor
---

추가 문법(`extras`)을 더한다: 하이라이트(`==글==`)·위첨자·아래첨자·삽입·글자색·배경색·약어(마크), 주석(`%%글%%`)·태그(`#태그`)·인용(`[@citekey]`)·정의 목록·목차(`[toc]`), 이모지 단축 코드(`:smile:`), 인라인 각주(`^[글]`), 페이지의 제목 위치(`[[노트#제목]]`, `ImportContext.anchors`), Zotero 링크(`zotero://`).

- **켜야 쓰인다**: `createCoreExtensions({ extras })`, `ImportContext.extras`, `MarkdownOptions.extras`. 켜지 않으면 스키마·읽기·쓰기가 그대로다(노트 앱 영향 없음). 켠 소비자는 본문 스키마 버전을 올린다. `renderMarkdown`은 기본으로 모두 읽는다(`extras: false`로 끈다).
- 편집기: 입력 규칙(`==글==`·`^글^`·`++글++`·`%%글%%`·`#태그 `·`[@키]`·`:이모지:`), 단축키(Ctrl+Shift+H 하이라이트, Ctrl+. 위첨자, Ctrl+, 아래첨자), 슬래시 항목(목차·정의 목록·주석·인용·글자색/배경색), 포트 `EditorPorts.citations`.
- 렌더러: 새 마크·노드를 그리고, 옵션 `tagHref`·`citationLabel`·`citationHref`·`showComments`를 더한다.
- 규칙은 `@gogum4/editor-schema/extras`(색·태그·인용·이모지 정리). 자세한 표기와 한계는 docs/MARKDOWN-DIALECT.md "추가 문법".
