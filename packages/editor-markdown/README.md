# @9um4-utils/editor-markdown

본문(ProseMirror JSON) ↔ Markdown 변환. Obsidian 방언과 블로그(remark-directive) 방언, 모르는 문법의 원문 보존.

```ts
import { docToMarkdown, markdownToDoc } from "@9um4-utils/editor-markdown";
```

## 설치

GitHub Packages(비공개)에서 받는다. 프로젝트의 `.npmrc`에:

```
@9um4-utils:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN`은 `read:packages` 권한이 있는 토큰이다. 그 뒤 `pnpm add @9um4-utils/editor-markdown`. 자세한 내용·버전 규칙은 [docs/RELEASING.md](../../docs/RELEASING.md), 설계는 [docs/EDITOR-PACKAGE.md](../../docs/EDITOR-PACKAGE.md).

패키지 5개(schema·markdown·render·core·react)는 **같은 버전**으로 함께 올라가므로 한꺼번에 같은 버전을 쓴다.
