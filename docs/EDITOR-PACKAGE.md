# 에디터 패키지 분리 설계 (초안)

이 앱의 에디터(`src/features/editor/`)를 여러 앱이 쓰는 패키지로 빼는 계획. **아직 코드는 바뀌지 않았다** — 이 문서는 읽기 전용 조사(2026-10-22)와 결정을 모은 것이다.

## 1. 목적과 결정

- **목적**: 내 앱들의 편집 경험을 통일한다.
- **소비자**: ① 이 노트 앱 ② 블로그 에디터 ③ 캘린더 에디터의 Markdown 부분(일정 필드 안의 Markdown 편집기) ④ PlanBench(게임 디자인 도구: 스키마와 데이터베이스 같은 표를 정의하는 도구).
- **PlanBench**: 이 에디터를 **새로 도입**하되, PlanBench 고유의 스키마·표 기능은 그대로 둔다. 그 기능은 공유 코어에 넣지 않고 PlanBench 쪽 확장으로 얹는다.
- **저장 형식**: **확장 Markdown**이 기본이다. 저장에 JSON이 필요하면 써도 된다. 에디터는 **Markdown 문법을 지원**해야 한다(§6의 빈틈 참고).
- **호환**: Markdown 가져오기·내보내기를 **Notion·Obsidian과 호환**시킨다.
- **렌더링**: 블로그가 확장 노드(콜아웃·토글·수식·각주·mermaid 등)를 **읽기 전용으로 렌더링**해야 한다. 스택은 React와 Node.js다.
- **배포**: npm이나 GitHub 패키지. 공개 여부는 **미정**.
- **노력 수준**: 제한 없음 — 가장 철저한 설계로 간다.

## 2. 패키지 구성

| 패키지 | 내용 | 의존 | 소비자 |
|---|---|---|---|
| `editor-schema` | 노드·마크 이름, 속성 정규화, 스키마 버전, 언어 이름 데이터. **TipTap·DOM 비의존**, Node.js에서 import 가능 | 없음 | 전부 |
| `editor-core` | TipTap 확장(앱 비의존), `createEditorExtensions(options)`, 포트 인터페이스 | schema, TipTap | 전부 |
| `editor-markdown` | Markdown ↔ 문서 JSON, 프런트매터, **방언 명세**, 골든 왕복 시험 | schema, marked | 블로그·캘린더·노트 |
| `editor-render` | 읽기 전용 렌더링(Markdown → HTML 플러그인, JSON → React). 서버에서 동작 | schema, markdown | 블로그 |
| `editor-react` | NodeView, 메뉴, 편집 막대, 테마 CSS | core, React | 편집기가 있는 앱 |
| (앱에 남김) 위키·문서 계층 | 페이지 링크·카드, 동기화 블록, Yjs 저장, 저널, 동기화 훅 | 위 패키지 | 노트 앱 |
| (PlanBench에 둠) | 스키마·표 정의 노드 | core의 확장 지점 | PlanBench |

수식·mermaid·구문 강조는 무거우므로 하위 경로 export(`/math`, `/mermaid`, `/highlight`)로 나눠 소비자가 필요한 것만 가져가게 한다.

## 3. 현황 측정

`src/features/editor/`: 파일 78개, 테스트 제외 약 6,700줄. 테스트는 에디터 24개 파일, `lib/` 57개 파일.

| 묶음 | 줄 수 | 앱 의존 | 분류 |
|---|---|---|---|
| 기본 서식·표·체크리스트·정렬·링크 열기 | (`editorExtensions.ts` 구성) | 없음 | core |
| 블록 확장(BlockId·BlockFlash·BlockLinkCopy·Callout·CodeBlock·TextAlign·LinkOpener·mermaid 뷰) | ~1,330 | BlockLinkCopy는 `tree/store` | core (BlockLinkCopy는 포트로) |
| 코드 강조·자동완성 | ~890 | 없음(§5의 번들러 문제) | core |
| 수식·각주 | ~930 | 없음 | core |
| 표 편집 막대 | ~90 | 없음 | react |
| 토글 | ~150 | `lib/api`(설정 저장) | core + 저장 포트 |
| 이미지 | ~420 | `lib/api`(`putAsset`), 동기화와 연결된 캐시 | core + 자산 포트 |
| 슬래시 메뉴 | ~270 | 페이지 블록 항목이 섞임 | react + 항목 등록식 |
| 페이지 링크·블록 링크·페이지 블록·동기화 블록 | ~1,200 | `lib/api`·`tree/store` 깊이 의존 | 앱(위키 계층) |
| 문서 계층(Yjs 저장·저널·잠금·등록·스키마 버전·모르는 노드 보호) | ~1,300 | 앱·동기화 결합 | 앱 |

에디터 밖에서 에디터를 import하는 파일은 13개다: `AssetImage`, `ydocBytesToPmJson`, `useCurrentEditor`, `docAccess`·`docLocks`·`assetCache`(동기화), `focusEditorStart`, `PageBody`, `SaveIndicator`, `flushAll`(`saverRegistry`), `editorSchema`.

## 4. 포트 목록 (에디터가 앱에서 필요로 하는 것)

에디터 폴더가 `lib/api`를 직접 부르는 곳이 12개 파일, `tree/store`를 쓰는 곳이 12개 파일이다. 필요한 것을 포트로 모으면 이렇다.

| 포트 | 지금 쓰는 곳 | 필요한 동작 | 어디에 둘까 |
|---|---|---|---|
| `DocStore` (본문 영속화) | `usePageDoc`, `journalRecovery`, `syncedDocs`, `createSynced`, `blockSource`, `blockIdMigration`, `blockIndexBackfill` | `getPageDoc`·`getPageDocStamp`·`savePageDoc`, 저널(`appendDocJournal`·`getDocJournal`·`clearDocJournal`·`listJournalPages`), `createPageVersion` | **앱에 남김** — Yjs+SQLite 전용이라 다른 소비자에게는 필요 없다 |
| `KeyValueStore` | `toggleStore`, `blockIdMigration`, `blockIndexBackfill` | `getSetting`·`setSetting` (토글 열림 상태 등) | core의 포트, 기본값은 메모리 |
| `AssetStore` | `image/insertImages`, `assetCache` | 이미지 저장(`putAsset`), 주소 얻기, 도착 알림 | core의 포트 (블로그는 파일·CDN) |
| `PageResolver` | `pagelink/*`, `pageblock/*`, `BlockLinkCopy` | 페이지 목록·검색·제목, 열기(`revealPage`), 블록이 있는 페이지 찾기(`findBlockPages`) | 위키 계층이 구현, core는 **링크 해석기** 확장 지점만 연다 |
| `Notifier` | `insertImages`, `createSynced`, `syncedDocs`, `usePageDoc`, `BlockLinkCopy` | 오류·안내 알림(`reportError` 등) | core의 콜백 옵션 |
| 앱 전용 UI 신호 | `PageEditor`의 `blockRequest`·`findRequest`, `SaveIndicator`의 `doc` 상태 | 앱 안의 명령 전달 | 앱 (패키지로 가지 않음) |

## 5. 이관 후보와 걸림돌

### `lib/`의 순수 모듈 (editor-schema·markdown 후보)

| 모듈 | 줄 | 의존 | 판정 |
|---|---|---|---|
| `callout`, `textAlign`, `safeLink`, `imageLayout`, `toggleState`, `menuPosition` | 20~58 | 서로 간 의존뿐 | schema (바로 이동 가능) |
| `assets` | 65 | 없음 | schema (해시 규칙을 블로그와 공유해야 함) |
| `codeLanguages`, `languageData.generated` | 106+194 | 없음 | schema |
| `latexCommands`, `latexAssist` | 371+161 | 없음 | core(수식 보조) |
| `slashItems` | 110 | 없음 | core (페이지 블록 항목은 등록식으로 분리) |
| `markdown` (내보내기) | 448 | assets·imageLayout·textAlign | markdown |
| `markdownImport` (가져오기) | 777 | marked 등 | markdown |
| `blockId` | 106 | `yjs`, `markdown` 타입 | **분리 필요** — ID 생성·정규화는 schema, Yjs 부분은 앱 쪽 어댑터 |
| `math` | 72 | **React 훅 + KaTeX CSS 동적 import** | **분리 필요** — 로더는 core, 훅은 react |
| `blockLink`, `pageLinks`, `pageLinkSearch`, `pagePreview`, `blockDiff` | 105~647 | yjs·위키·버전 비교 | 앱 |

### 걸림돌

1. **`highlight/loader.ts`가 `import.meta.glob`을 쓴다.** Vite 전용이라 Next.js·Node에서 깨진다. `highlight.js` 언어 193개의 **명시적 지연 import 표**를 생성하는 방식으로 바꿔야 한다(`lowlight` 자체는 Node에서 동작한다).
2. **KaTeX CSS를 JS에서 import한다**(`katex/dist/katex.min.css`). 서버 렌더링에서는 `katex.renderToString`을 쓰고, CSS는 별도 export로 배포해야 한다.
3. **mermaid는 브라우저가 필요하다.** 렌더러는 `<pre class="mermaid">`를 내고 클라이언트에서 그리거나, 미리 이미지로 만든다.
4. **Yjs(Collaboration)가 `createEditorExtensions(ydoc)`에 고정돼 있다.** 선택 기능으로 빼야 한다.
5. **한국어 문자열이 하드코딩돼 있다**(예: 빈 줄 안내 "'/'를 눌러 명령을 입력하세요", 제목 안내). 옵션이나 사전으로 빼야 한다.
6. **React 뷰가 Tailwind 클래스를 쓴다.** CSS 변수 기반 스타일을 함께 배포할지, 소비자의 Tailwind 설정에 포함하게 할지 정해야 한다.
7. **모듈 전역 상태**(`toggleStore`, `assetCache`, `keywordStore`, `lowlight` 인스턴스)가 한 화면에 에디터가 여럿일 때(블로그 목록, 일정 여러 개) 문제가 되는지 아직 확인하지 않았다.
8. **스키마 버전.** 소비자마다 패키지 버전이 달라 새 버전이 쓴 문서를 옛 버전이 열 수 있다. `DOC_SCHEMA_VERSION`·모르는 노드 보호 장치를 패키지 수준으로 올리고 semver 규칙을 정한다(노드나 속성 추가는 minor 이상).

### 라이선스

`package.json`의 직접 의존성은 **모두 MIT 또는 BSD-3-Clause**다(`@tiptap/*`, `yjs`, `katex`, `mermaid`, `marked`, `lowlight`, `highlight.js`, `diff`, `react`). 공개 배포를 막는 항목은 없다. 간접 의존성은 확인하지 않았다.

## 6. Markdown 지원

### 현재 내보내기 방언 (`lib/markdown.ts`) — 이미 Obsidian식

| 노드 | 출력 |
|---|---|
| 콜아웃 | `> [!NOTE]` |
| 페이지 링크 | `[[제목]]` |
| 페이지 임베드 | `![[…]]` |
| 각주 | `[^1]` (정의는 문서 끝) |
| 수식 | `$…$`, `$$…$$` |
| 토글 | `<details><summary>` |
| 체크리스트 | `- [ ]`, `- [x]` |
| 표 | GFM 표 (셀 병합·열 너비는 표현 불가 → `notices`로 알림) |

`markdown.ts` 머리 주석은 "내보내기 전용"이라고 되어 있지만 `markdownImport.ts`(가져오기)가 있어 **주석이 낡았다**.

### "에디터가 Markdown 문법을 지원한다"의 빈틈 (소스 확인, 실행은 안 해 봄)

| 항목 | 상태 |
|---|---|
| 제목 `#`, 목록, 인용 `>`, 굵게·기울임·인라인 코드, 링크 | StarterKit의 입력 규칙으로 **있음** |
| 코드 펜스 ``` | TipTap 기본 코드 블록을 상속해 **있을 것으로 보임**(미확인) |
| 체크리스트 `- [ ]` | TaskItem 기본 규칙으로 **있을 것으로 보임**(미확인) |
| 수식 `$…$`, `$$` | **있음** (`MathInline`·`MathBlock`의 입력 규칙) |
| 콜아웃 `> [!NOTE]` 입력 | **없음** |
| 토글 `<details>`·각주 `[^1]` 입력 | **없음** |
| 표 `\|a\|b\|` 입력 | **없음** |
| Markdown **붙여넣기** → 서식 변환 | **없음** (`markdownToDoc`은 파일 가져오기에만 쓰임, 붙여넣기 핸들러는 이미지뿐) |
| 블록 id `^id` 입출력 | **없음** (내보내기에서 버림) |
| 프런트매터 | 가져오기에서만 해석 |

### 왕복은 손실이 있다

블록 id는 버려지고, 페이지 링크는 제목으로 바뀌며, 동기화 블록은 그 자리에 복사되고, 이미지는 파일 경로로 바뀐다. 공유 방언으로 쓰려면 **무엇을 잃어도 되는지 정하고 골든 파일 왕복 시험**을 만든다.

### 제안하는 방언

Obsidian 호환 Markdown의 상위 집합을 공식 방언으로 한다. 콜아웃은 `> [!TYPE]`, 접히는 콜아웃은 `> [!TYPE]-`, 위키 링크는 `[[…]]`, 블록 id는 줄 끝 `^id`(옵션으로 보존), 토글은 `<details>`. Notion은 가져오기에서 콜아웃·토글을 완전히 보존하지 못하는 것으로 알고 있으나 **최신 동작은 확인하지 않았다** — 실제 Notion 내보내기·가져오기 파일로 검증해야 한다.

## 7. 이름 제안

- **scope: `@9um4-utils`.** GitHub Packages의 npm 레지스트리는 패키지 scope가 저장소 소유자(사용자나 조직) 이름과 같아야 한다. 이 저장소의 소유자가 `9um4-utils`다. 공개 npm으로 낼 때는 같은 이름의 npm 조직이 필요한데, **그 이름이 비어 있는지는 확인하지 못했다**(npm 계정으로 확인해야 한다).
- **패키지 이름은 기능 이름으로**: `@9um4-utils/editor-schema`, `editor-core`, `editor-markdown`, `editor-render`, `editor-react`. 앱 이름이 가칭("Notes")이라 이름에 넣지 않는다.
- **저장소**: 1단계는 이 저장소의 `packages/` 워크스페이스(`pnpm-workspace.yaml`에 추가)로 둔다. 소비자가 둘 이상 안정되면 `9um4-utils/editor`로 분리를 판단한다.

## 8. 단계 계획

| 단계 | 내용 | 끝났다고 볼 조건 |
|---|---|---|
| P0 | §9의 미결 질문을 해소하고 이름·방언을 확정한다 | 이 문서의 §9가 비어 있다 |
| P1 | **경계 만들기**: `packages/`와 `editor-schema`로 순수 모듈 이동, 의존 방향 검사(`dependency-cruiser` 등)를 CI에 추가 | 기존 시험이 모두 통과하고, schema가 앱 코드를 import하지 않는다 |
| P2 | **core 포트화**: `createEditorExtensions(options)`, 자산·키값·알림 포트, Collaboration 선택화, 문자열 사전, `import.meta.glob` 제거 | core 폴더에 `lib/api`·`tree/store` import가 0개 |
| P3 | **markdown**: 방언 명세, 골든 왕복 시험, 붙여넣기 변환, 입력 규칙 빈틈 메우기, 실제 Notion·Obsidian 파일로 검증 | 골든 시험 통과, 알려진 손실 목록 확정 |
| P4 | **render**: Markdown→HTML 플러그인과 JSON→React, 서버에서 KaTeX 문자열 렌더, mermaid 클라이언트 처리 | Node.js에서 DOM 없이 블로그 글 한 편을 끝까지 렌더 |
| P5 | **react**: 메뉴·NodeView·CSS 분리, 데모 페이지 | 노트 앱이 패키지만으로 같은 화면을 낸다 |
| P6 | **시범 소비자**: 캘린더 Markdown 부분에 도입하고 API 빈틈을 기록한다 | 빈틈 목록을 반영했다 |
| P7 | **PlanBench 도입**: 확장 지점으로 스키마·표 노드를 얹는다 | PlanBench 고유 기능이 그대로 동작한다 |
| P8 | **배포**: Changesets, 스키마 호환 semver 규칙, 레지스트리 결정 | 첫 버전을 소비자가 설치해 쓴다 |
| P9 | 블로그 도입, 소비자 2개 이상 안정 후 **별도 저장소 분리 판단** | — |

## 9. 미결 질문

1. PlanBench의 스키마·표는 **문서 안의 블록**(Notion의 데이터베이스 블록 같은 것)인가, 별도 화면에서 편집하는가?
2. 블로그의 렌더링 스택은 무엇인가(Next.js, Astro 등)? Markdown을 빌드 때 변환하는가, 요청 때 변환하는가?
3. "Markdown 문법 지원"의 범위: 입력 중 문법 변환(입력 규칙)과 붙여넣기 변환 외에, 소스 보기(Markdown 원문 편집)도 필요한가?
4. 가져오기·내보내기 호환에서 Notion은 **가져오기만**인가, 내보내기까지인가?
5. 공개 여부와 npm 조직 이름 확보.

## 10. 위험

- 소비자가 하나뿐일 때 API를 미리 일반화하면 틀린 추상화가 된다 → 시범 소비자(P6)를 일찍 둔다.
- 에디터를 고칠 때마다 패키지를 배포하면 노트 앱 개발이 느려진다 → 워크스페이스 링크로 개발한다.
- 위키·동기화 결합(문서 계층)을 코어로 끌고 오면 다른 소비자가 쓸 수 없다 → 앱에 남긴다.
- 이 문서의 코드 사실은 소스 읽기와 `grep` 기반이다. 입력 규칙 동작, 모듈 전역 상태의 영향, 번들러 호환성은 실제로 실행해 보지 않았다.
