# gogum4/js-editor — 에디터 패키지 묶음

TipTap 기반 위키형 에디터 패키지(`packages/`)와 예제(`examples/`). 노트 앱(`9um4-utils/mine`)·블로그·캘린더가 소비한다. **코드·주석·문서는 한국어**, 기존 문체와 주석 밀도를 따른다. 커밋은 맥락 단위로 잘게, `Co-Authored-By` trailer는 붙이지 않는다. 패키지 매니저는 pnpm, 전역 설치 금지.

## 명령

| 명령 | 설명 |
|---|---|
| `pnpm test` | 시험(Vitest) |
| `pnpm check:deps` | 의존 방향·화면 글 하드코딩·CSS 규칙·색 토큰 |
| `pnpm check:dist` | 배포본 컴파일·`pnpm pack` 모양·소비자 타입·Node 로드 |
| `pnpm --filter editor-demo visual` (`visual:update`, `visual:plain`) | 실제 Chromium 시각·동작 시험(규칙 순서·우선순위 포함). 브라우저 준비는 `examples/editor-demo/README.md` |
| `pnpm gen:languages` | 코드 언어 데이터 생성 |
| `pnpm changeset` / `pnpm release` | 버전 설명 / 게시(수동 워크플로 — **내가 게시하지 않는다**, `docs/RELEASING.md`) |

## 구조

- ① `editor-schema` — TipTap·DOM·앱 비의존 순수 규칙. ② `editor-core` — TipTap 확장·슬래시 메뉴·수식/각주/표/이미지/토글/코드 블록의 스키마·명령·입력 규칙·붙여넣기/복사와 **포트(주입 접점)·화면 글 사전**. **React가 없다**(화면은 주입). 모르는 Markdown 디렉티브를 담는 `raw`·`rawInline`·`directive`는 `createCoreExtensions({ raw: true })`, 다른 개체를 `kind`·`id`로 가리키는 `reference` 노드는 `{ reference: true }`로만 켜진다. ③ `editor-markdown` — 본문 ↔ Markdown(방언 규칙 `docs/MARKDOWN-DIALECT.md`, 골든 `packages/editor-markdown/fixtures/` — 변환을 고치면 골든이 실패하니 의도한 변경이면 `pnpm vitest run packages/editor-markdown -u`로 갱신하고 diff와 명세를 함께 고친다). ④ `editor-render` — 읽기 전용 렌더링(서버 컴포넌트에서 훅 없이, 수식·코드 강조는 서버 준비 단계 `prepareRender`, mermaid는 `"use client"` 조각). ⑤ `editor-react` — core에 주입하는 React 화면(`"use client"`). ⑥ `editor-embed`(비공개, 게시 안 함) — WebView·iframe 번들과 JSON 메시지 규약(`docs/EDITOR-EMBED.md`).
- **패키지는 소비자 앱 코드를 import하지 않는다** — `pnpm check:deps`가 막는다. 패키지 안 상대 import는 확장자 유무와 상관없다(`pnpm check:dist`가 dist의 JS·선언을 `.js`로 고친다).
- 다섯 게시 패키지는 **같은 버전**(Changesets `fixed`). 호환 규칙·점검표는 `docs/RELEASING.md`. 노드·속성이 사라지거나 바뀌면 `schemaCompat.test.ts`가 실패한다(`schema-snapshot.json`).

## 규칙

- **editor-core / editor-react 경계**: React에 묶인 것(뷰·메뉴·편집 창 호스트·zustand 저장소·훅·컨텍스트)은 `editor-react`에만 둔다. core는 React·zustand를 import하지 못한다. editor-react은 core의 **공개 API**(`@gogum4/editor-core`)만 쓴다 — 필요하면 core의 `src/index.ts`에 이름을 더한다. 확장은 화면을 직접 모르고 `createCoreExtensions`의 `views`·`menus`·`ui`로 주입받는다 — 새 노드 뷰는 확장에 `nodeView` 옵션을 두고 `editor-react/src/createReactExtensions.ts`의 `reactViews`에 더한다. 편집 창을 여는 코드는 `uiOf(editor)`를 통한다.
- **스타일**: 본문 모양은 `packages/editor-react/styles/editor.css`(루트 클래스 `md-editor`), 메뉴·편집 창은 `styles/ui.css`(`md-` 클래스, Tailwind 없이 동작), 둘을 `@gogum4/editor-react/styles.css`가 묶는다. 줄 간격은 `calc(1.25 / 0.875)`를 `var()`로 쓴다(소수로 적으면 1/64px 어긋난다). **색은 날것으로 쓰지 않고 `var(--md-c-<값>, <밝은 값>)`**(`styles/dark.css`에 어두운 값을 짝지어 적는다 — `check-css-tokens`가 막는다; 다크 모드는 `<html data-md-theme="dark">`나 `.dark`).
- **에디터 화면(뷰·메뉴·편집 창)이나 CSS를 고칠 때**: ① happy-dom DOM 골든(`domGolden*.test.ts`)이 DOM 구조·클래스를, ② `check-css-rules`가 규칙이 사라지지 않았는지를, ③ `editor-demo visual`이 실제 Chromium에서 계산된 스타일(규칙 **순서·우선순위** 변화 포함)과 동작을 기준과 비교한다. 의도한 변경이면 `visual:update`로 기준을 갱신하고 diff를 검토해 커밋한다.
- **키 입력·되돌리기·붙여넣기·Collaboration이 얽힌 동작**: 화면 없는 시험(`@gogum4/editor-core/testing`의 `liveState`·`typeText`)은 Yjs와 실제 view가 없어서 통합 문제(단축키 우선순위, `CommandManager`의 마지막 디스패치)를 못 잡는다. 그런 동작은 `// @vitest-environment happy-dom` 시험으로 마운트된 에디터 + 실제 `Y.Doc`에서 확인한다(`markdownPaste.collab.test.ts`가 예). **TipTap 명령(`addCommands`) 안에서 직접 `view.dispatch`로 문서를 바꾸지 않는다** — "mismatched transaction"이 난다.
- **editor-core를 고칠 때**: ① 소비자 기능(저장·링크 열기·알림 등)이 필요하면 직접 부르지 말고 **포트**(`ports/types.ts`)를 늘린다. 모듈 전역 상태는 만들지 않는다(포트 객체별 `WeakMap`처럼 에디터마다 따로). ② 화면에 보이는 글은 `strings/`의 사전(ko·en)에만 둔다(한글 하드코딩은 `check-core-strings`가 막는다). ③ 위키 기능(페이지 링크·페이지 블록)은 core에 넣지 않는다 — 소비자가 `createCoreExtensions`의 `transform`·`slashItems`·`slashHandlers`로 주입한다. ④ **확장 순서를 바꾸면** 같은 HTML을 읽는 규칙의 우선순위가 달라질 수 있다 — 스키마 골든이 순서도 고정하니 의도를 확인하고 스냅샷을 갱신한다. ⑤ 노드·속성을 더하면 **소비자의 본문 스키마 버전 규칙**도 있다(노트 앱은 `DOC_SCHEMA_VERSION`·`SUPPORTED_DOC_SCHEMA`를 함께 올린다) — `docs/RELEASING.md`의 호환 규칙을 따라 changeset을 더한다.
- **소비자와의 관계**: 노트 앱(`9um4-utils/mine`)은 이 패키지의 포트를 `src/features/editor/appPorts.ts`에서 구현하고 위키 기능(페이지 링크·페이지 블록)을 주입한다. 이 저장소의 변경이 소비자에게 보이면 changeset을 더하고, 게시된 버전을 소비자가 받아 간다.
