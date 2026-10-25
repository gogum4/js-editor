---
"@gogum4/editor-schema": minor
"@gogum4/editor-markdown": minor
"@gogum4/editor-render": minor
"@gogum4/editor-core": minor
"@gogum4/editor-react": minor
---

Markdown 가져오기에 `ImportContext.profile`(방언 항목 덮어쓰기)과 `DialectProfile` 타입 내보내기를 더한다. `dialect: "obsidian"`에 `{ rawEmbeds: true, keepAnyHref: true, mdLinksToPages: false }`를 얹으면 콜아웃·수식·각주는 Obsidian대로 읽으면서 이미지·HTML·열 정렬 표는 원문으로 보존한다(블로그가 0.1의 `dialect: "blog"`를 대신해 쓴다). 쓰지 않으면 달라지는 것이 없다.
