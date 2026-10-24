# @9um4/editor-markdown

## 0.1.0

### Minor Changes

- 3a5ab80: 첫 버전(0.1.0). 노트 앱·블로그(시각 모드)·캘린더(임베드 번들)가 쓰는 에디터 패키지: 스키마 규칙, Markdown 변환(Obsidian·블로그 방언), 읽기 전용 렌더러, TipTap 코어(포트·참조 노드·원문 보존 노드), React 화면과 다크 모드.
- 12bedd7: 일반 GFM 문서용 방언 `gfm`(위키 링크만 읽고 콜아웃·수식·각주·`^id`·HTML 변환 없음)과 방언 플래그 묶음(`DialectProfile`), `[[대상|표시]]`의 표시 글자를 `pageLink.label`로 보존, `gfm` 방언의 최소 이스케이프(`_`·`~`·`*`·`<`를 서식이 될 수 있는 자리만)와 글머리·할 일이 섞인 목록의 보존, 열자마자 문서 정리를 끝내는 옵션 `createCoreExtensions({ settle: true })`(원자 노드를 처음 누를 때 나는 "Selection passed to setSelection" 오류 방지), `gfm`에서 물결표 하나(`10~30`)를 취소선으로 읽지 않기·상대 경로 링크 보존, **이어지는 같은 서식의 글자 노드를 한 쌍의 기호로 묶는 내보내기**(굵은 글씨 안의 코드 조각 등 모든 방언), 참조 노드의 선택 속성 `props`(`{{table:이름 rows=5}}` 같은 설정; 해석기 `resolve`·`open`의 둘째 인자, `renderReference`의 `props`).

### Patch Changes

- Updated dependencies [3a5ab80]
- Updated dependencies [12bedd7]
  - @9um4/editor-schema@0.1.0
