# @gogum4/editor-render

본문 JSON·Markdown을 읽기 전용 React 요소·HTML로. 서버 컴포넌트에서 훅 없이 동작한다.

```ts
import { renderMarkdown } from "@gogum4/editor-render";
```

## 설치

GitHub Packages(비공개)에서 받는다. 프로젝트의 `.npmrc`에:

```
@gogum4:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN`은 `read:packages` 권한이 있는 토큰이다. 그 뒤 `pnpm add @gogum4/editor-render`. 자세한 내용·버전 규칙은 [docs/RELEASING.md](../../docs/RELEASING.md), 설계는 [docs/EDITOR-PACKAGE.md](../../docs/EDITOR-PACKAGE.md).

패키지 5개(schema·markdown·render·core·react)는 **같은 버전**으로 함께 올라가므로 한꺼번에 같은 버전을 쓴다.
