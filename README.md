# @9um4/editor

TipTap 기반 **위키형 에디터**를 여러 곳에서 쓰려고 나눈 패키지 묶음이다(노트 앱, 블로그, 캘린더…). 본문은 ProseMirror JSON, 저장·전송 형식은 Markdown 방언([docs/MARKDOWN-DIALECT.md](docs/MARKDOWN-DIALECT.md)).
A set of packages for a TipTap-based wiki-style editor, shared across several apps. Documents are ProseMirror JSON and round-trip through a documented Markdown dialect.

| 패키지 | 내용 |
|---|---|
| [`@9um4/editor-schema`](packages/editor-schema) | TipTap·DOM·앱에 기대지 않는 순수 규칙(콜아웃·정렬·이미지 레이아웃·안전한 링크 등) |
| [`@9um4/editor-core`](packages/editor-core) | TipTap 확장·슬래시 메뉴·수식/각주/표/이미지/토글/코드 블록, **포트(주입 접점)**와 화면 글 사전. React 없음 |
| [`@9um4/editor-react`](packages/editor-react) | core에 주입하는 React 화면(노드 뷰·메뉴·편집 창) |
| [`@9um4/editor-markdown`](packages/editor-markdown) | 본문 ↔ Markdown 변환(순수 함수) |
| [`@9um4/editor-render`](packages/editor-render) | 읽기 전용 렌더링(본문/Markdown → React·HTML, 서버 컴포넌트 지원) |
| `@9um4/editor-embed` | (비공개) WebView·iframe에 올리는 번들과 호스트 메시지 규약 |

다섯 패키지는 **항상 같은 버전**으로 게시한다(Changesets `fixed`). 설치:

```bash
pnpm add @9um4/editor-react @9um4/editor-core @9um4/editor-schema @9um4/editor-markdown   # 같은 버전으로
```

## 개발

```bash
pnpm install
pnpm test            # 단위·통합 시험
pnpm check:deps      # 패키지 의존 방향, 화면 글 하드코딩, CSS 규칙·색 토큰
pnpm check:dist      # 배포본(dist) 컴파일·pack 모양·소비자 타입·Node 로드
pnpm --filter editor-demo visual   # 실제 Chromium 시각·동작 시험(examples/editor-demo/README.md)
```

- 설계: [docs/EDITOR-PACKAGE.md](docs/EDITOR-PACKAGE.md), 배포·버전 규칙: [docs/RELEASING.md](docs/RELEASING.md), WebView 임베드: [docs/EDITOR-EMBED.md](docs/EDITOR-EMBED.md)
- 예제: [`examples/editor-demo`](examples/editor-demo)(시각 시험 포함), [`examples/next-blog`](examples/next-blog)(Next.js App Router에서 렌더러를 SSG로)
- 이 저장소는 노트 앱 저장소에서 분리됐다(이력은 `packages/` 등 이 저장소의 경로만 가져왔다).

## 라이선스

MIT — [LICENSE](LICENSE)
