---
"@gogum4/editor-schema": minor
"@gogum4/editor-markdown": minor
"@gogum4/editor-render": minor
"@gogum4/editor-core": minor
"@gogum4/editor-react": minor
---

Obsidian 호환 보완과 새 문법 다섯 가지.

- **같은 글 안의 위치·블록 임베드**: `ImportContext.selfPage`로 `[[#제목]]`·`[[#^블록]]`을 푼다. `![[노트#^블록]]`은 `blockId`가 있는 `pageBlock`으로 읽고, `blockIds`를 켠 내보내기가 같은 글로 쓴다.
- **코드 블록 메타**(옵션 없이 항상): `codeBlock.attrs.meta`에 `title="a.ts" {2,4}` 같은 펜스 뒤 글을 원문 그대로 보존. `@gogum4/editor-schema/codeMeta`(`parseCodeMeta`·`normalizeCodeMeta`). 렌더러는 파일명 줄·강조 줄·줄 번호, 편집기는 막대의 입력 칸.
- **이미지 캡션**(옵션 없이 항상): `![alt](src "캡션")` ↔ `image.attrs.caption`. 렌더러 `<figcaption>`, 편집기 입력 칸.
- **`extras.kbd`**: `<kbd>` 마크.
- **`extras.taskStatus`**: `- [/]`·`[-]`·`[>]`·`[?]`·`[!]` 할 일 상태(`taskItem.attrs.status`), Alt+클릭·Ctrl/⌘+Alt+Enter·`setTaskStatus`/`cycleTaskStatus`.
- **`extras.citations`가 객체도 받는다**: `{ narrative: true }` 서술형 인용 `@키`(`citation.attrs.narrative`), `{ bibliography: true }` 참고문헌 블록 `[bibliography]`(`bibliography` 노드). 표시 글은 `citations.label(keys, { narrative })`·`citations.entries(keys)`(편집기 포트), `citationLabel(…, narrative)`·`bibliographyEntry(key)`(렌더러 옵션). `@gogum4/editor-schema/csl`: Zotero CSL JSON을 읽고 인용 글·참고문헌 줄을 만드는 `parseCslJson`·`cslLabelForKeys`·`cslEntry`.
- 새 노드·마크·속성(`meta`·`caption`·`narrative`·`status`, `kbd`·`bibliography`)이 생기므로 소비자는 본문 스키마 버전을 올린다. 새 옵션은 모두 꺼진 채가 기본이다(`meta`·`caption`은 속성 추가만).
