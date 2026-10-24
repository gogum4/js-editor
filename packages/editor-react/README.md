# @gogum4/editor-react

core에 주입하는 React 화면(노드 뷰·메뉴·편집 창)과 스타일(다크 모드 포함). `"use client"`.

```ts
import { createReactExtensions } from "@gogum4/editor-react";
import "@gogum4/editor-react/styles.css";
```

## 설치

GitHub Packages(비공개)에서 받는다. 프로젝트의 `.npmrc`에:

```
@gogum4:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN`은 `read:packages` 권한이 있는 토큰이다. 그 뒤 `pnpm add @gogum4/editor-react`. 자세한 내용·버전 규칙은 [docs/RELEASING.md](../../docs/RELEASING.md), 설계는 [docs/EDITOR-PACKAGE.md](../../docs/EDITOR-PACKAGE.md).

패키지 5개(schema·markdown·render·core·react)는 **같은 버전**으로 함께 올라가므로 한꺼번에 같은 버전을 쓴다.
