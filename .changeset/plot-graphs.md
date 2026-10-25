---
"@gogum4/editor-schema": minor
"@gogum4/editor-render": minor
"@gogum4/editor-core": minor
"@gogum4/editor-react": minor
---

**수식 그래프** — ` ```plot ` 코드 블록이 2D 함수·매개변수 곡선, 3D 곡면·곡선 그래프가 된다. 노드·속성을 더하지 않아 **본문 스키마 버전은 그대로**고 Markdown에서는 평범한 코드 블록이다.

- 편집기: 코드 아래에 그래프가 보이고(식이 틀리면 오류), 3D는 끌어서 돌리고 더블클릭으로 처음 시점. 언어 선택 목록에 `plot`이 생긴다. 문구 `strings.plot`(ko/en).
- 렌더러: 올바른 식은 SVG `figure.plot`(3D는 처음 시점의 정지 그림), 틀리면 일반 코드 블록.
- `@gogum4/editor-schema`: `mathExpr`(`eval` 없는 안전한 수식 계산기), `plot`(글 → 명세·표본), `plotSvg`(명세 → SVG). 자체 파이프라인을 쓰는 소비자(블로그)가 그대로 쓸 수 있다.
- 문법과 한계는 `docs/MARKDOWN-DIALECT.md` "수식 그래프".
