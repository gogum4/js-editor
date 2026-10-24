# @gogum4/editor-schema

노드·속성 정규화, 콜아웃·정렬·이미지 레이아웃·안전한 링크·참조 노드 속성 등 TipTap·DOM 비의존 순수 규칙. Node.js에서 그대로 쓴다.

```ts
import { normalizeCalloutType } from "@gogum4/editor-schema/callout";
```

## 설치

GitHub Packages(비공개)에서 받는다. 프로젝트의 `.npmrc`에:

```
@gogum4:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

`NODE_AUTH_TOKEN`은 `read:packages` 권한이 있는 토큰이다. 그 뒤 `pnpm add @gogum4/editor-schema`. 자세한 내용·버전 규칙은 [docs/RELEASING.md](../../docs/RELEASING.md), 설계는 [docs/EDITOR-PACKAGE.md](../../docs/EDITOR-PACKAGE.md).

패키지 5개(schema·markdown·render·core·react)는 **같은 버전**으로 함께 올라가므로 한꺼번에 같은 버전을 쓴다.
