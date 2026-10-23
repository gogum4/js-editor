# @9um4-utils/editor-core

TipTap 확장(React 없음): 서식·콜아웃·코드·수식·각주·표·토글·원문 보존·참조 노드, 포트와 글 사전.

```ts
import { createCoreExtensions } from "@9um4-utils/editor-core";
```

## 설치

GitHub Packages(비공개)에서 받는다. 프로젝트의 `.npmrc`에:

```
@9um4-utils:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN`은 `read:packages` 권한이 있는 토큰이다. 그 뒤 `pnpm add @9um4-utils/editor-core`. 자세한 내용·버전 규칙은 [docs/RELEASING.md](../../docs/RELEASING.md), 설계는 [docs/EDITOR-PACKAGE.md](../../docs/EDITOR-PACKAGE.md).

패키지 5개(schema·markdown·render·core·react)는 **같은 버전**으로 함께 올라가므로 한꺼번에 같은 버전을 쓴다.
