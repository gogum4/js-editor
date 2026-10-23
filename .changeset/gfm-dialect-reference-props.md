---
"@9um4-utils/editor-schema": minor
"@9um4-utils/editor-markdown": minor
"@9um4-utils/editor-render": minor
"@9um4-utils/editor-core": minor
"@9um4-utils/editor-react": minor
---

일반 GFM 문서용 방언 `gfm`(위키 링크만 읽고 콜아웃·수식·각주·`^id`·HTML 변환 없음)과 방언 플래그 묶음(`DialectProfile`), `[[대상|표시]]`의 표시 글자를 `pageLink.label`로 보존, `gfm` 방언의 최소 이스케이프(`_`·`~`·`*`·`<`를 서식이 될 수 있는 자리만)와 글머리·할 일이 섞인 목록의 보존, 열자마자 문서 정리를 끝내는 옵션 `createCoreExtensions({ settle: true })`(원자 노드를 처음 누를 때 나는 "Selection passed to setSelection" 오류 방지), 참조 노드의 선택 속성 `props`(`{{table:이름 rows=5}}` 같은 설정; 해석기 `resolve`·`open`의 둘째 인자, `renderReference`의 `props`).
