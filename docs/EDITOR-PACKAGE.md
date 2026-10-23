# 에디터 패키지 분리 설계 (초안)

이 앱의 에디터(`src/features/editor/`)를 여러 앱이 쓰는 패키지로 빼는 계획. 이 문서는 읽기 전용 조사(2026-10-22)와 결정을 모은 것이다. **P1·P2·P4는 끝났고 P3는 샘플 검증(3-6)만 남았다**(§8): `packages/editor-schema`·`editor-core`·`editor-markdown`·`editor-render`가 있고 앱과 Next.js 샘플이 그것을 쓴다.

## 1. 목적과 결정

- **목적**: 내 앱들의 편집 경험을 통일한다.
- **소비자**: ① 이 노트 앱 ② 블로그 에디터 ③ 캘린더 에디터의 Markdown 부분(일정 필드 안의 Markdown 편집기) ④ PlanBench(게임 디자인 도구: 스키마와 데이터베이스 같은 표를 정의하는 도구).
- **PlanBench**: 이 에디터를 **새로 도입**하되, PlanBench 고유의 스키마·표 기능은 그대로 둔다. 그 기능은 공유 코어에 넣지 않고 PlanBench 쪽 확장으로 얹는다. 에디터는 PlanBench의 **문서(Document) 범위**에서 쓰이고, 문서 안에서 **표 스키마 미리 보기**를 지원한다 — 이 기능은 PlanBench 전용 확장이라는 것이 사용자의 추정이다(§9에서 확인). 스키마·표의 정의 자체는 에디터 밖에서 한다.
- **저장 형식**: **확장 Markdown**이 기본이다. 저장에 JSON이 필요하면 써도 된다. 에디터는 **Markdown 문법을 지원**해야 한다(§6의 빈틈 참고).
- **호환**: **Obsidian은 가져오기·내보내기 모두**, **Notion은 가져오기(이전)만** 호환시킨다. Notion으로 내보내는 호환은 목표가 아니다.
- **렌더링**: 블로그가 확장 노드(콜아웃·토글·수식·각주·mermaid 등)를 **읽기 전용으로 렌더링**해야 한다. 블로그는 **Next.js**다(스택은 React와 Node.js).
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

### 참조 노드 확장 지점 (PlanBench의 표 스키마 미리 보기가 쓴다)

이 앱의 페이지 카드·임베드(`PageBlock`)와 PlanBench의 표 스키마 미리 보기는 **같은 모양**이다: 문서 안에 다른 개체의 id만 저장하고, 보여 줄 때 앱이 주입한 해석기로 내용을 읽어 미리 보기를 그린다. 그래서 core는 개별 노드가 아니라 **일반 참조 노드**를 제공한다.

- 노드: 속성 `{ kind, id }`(예: `page`, `table-schema`). 문서에는 id만 저장되어 원본이 바뀌면 미리 보기도 따라 바뀐다.
- 포트 `ReferenceResolver(kind)`: 제목, 미리 보기 데이터, 열기 동작, 존재 여부(삭제됨 표시)를 돌려준다. 렌더링은 소비자가 `kind`별 컴포넌트로 등록한다.
- Markdown 직렬화 훅: `kind`마다 내보내기 표현을 등록한다(§6). 해석기가 없는 소비자(블로그)는 **대체 표현**으로 그린다.
- 노트 앱은 `kind: page`를, PlanBench는 `kind: table-schema`를 등록한다. 코어는 PlanBench의 스키마 모양을 모른다.

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
| `latexCommands`, `latexAssist` | 371+161 | 없음 | core(수식 보조) — P2에서 core를 만들 때 옮긴다(schema는 이름·정규화만 둔다) |
| `slashItems` | 110 | 없음 | core (페이지 블록 항목은 등록식으로 분리) — P2에서 옮긴다 |
| `markdown` (내보내기) | 448 | assets·imageLayout·textAlign | markdown |
| `markdownImport` (가져오기) | 777 | marked 등 | markdown |
| `blockId` | 106 | `yjs`, `markdown` 타입 | ✅ **분리함** — ID 생성·정규화는 schema(`blockId`), Yjs 부분은 앱의 `lib/blockIdYjs.ts`. `PmNode`·`PmMark` 타입은 schema의 `pmDoc`로 옮기고 `lib/markdown`이 다시 내보낸다 |
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

### Markdown 지원 범위 제안 (§9 3번에 대한 답)

| 범위 | 내용 | 단계 |
|---|---|---|
| ① 입력 규칙 | 표준 Markdown과 확장 문법(콜아웃 `> [!NOTE]`, `<details>`, 각주 `[^1]`, 표 `\|a\|b\|`)을 **타이핑하는 중에** 변환 | P3 (3-6 보류) |
| ② 붙여넣기 변환 | Markdown 텍스트를 붙여넣으면 서식으로 변환(되돌리기 한 번에 원문으로 복귀, 일반 텍스트로 붙여넣기 단축키는 그대로 둠) | P3 |
| ③ 복사 시 Markdown | 클립보드의 `text/plain`을 Markdown으로 채워, 다른 편집기(Obsidian 등)에 붙여도 문법이 유지되게 한다 | P3 |
| ④ 소스 보기 | Markdown 원문 편집 모드. **나중으로 미룬다** | P5 이후 |

소스 보기를 미루는 이유: 노트 앱은 원본이 Yjs라서 Markdown이 손실 있는 파생물이고, 모드를 오가면 블록 id·동기화 블록 같은 정보를 잃는다. 반면 블로그·캘린더처럼 **Markdown이 원본인 소비자**는 소스 보기가 오히려 필요하다. 그 소비자에게는 **원본 보존 정책**(에디터가 모르는 구문, 예를 들어 raw HTML이나 알 수 없는 펜스를 `raw` 노드로 그대로 보존해 편집하지 않아도 파일이 바뀌지 않게 함)이 먼저다. 이 정책이 서야 소스 보기를 안전하게 얹을 수 있다.

### Notion은 가져오기만

Notion에서 이전하는 용도만 지원한다. Notion의 Markdown 내보내기를 읽는 가져오기 변환기(`markdownImport` 확장)가 대상이고, Notion 방언으로 쓰는 내보내기는 만들지 않는다. 변환기의 정확도는 **실제 Notion 내보내기 파일**로 만든 고정 시험 자료에 달려 있으므로, 샘플 내보내기(zip)가 필요하다. 이 시험 자료 없이는 Notion이 콜아웃·토글·데이터베이스를 어떻게 내보내는지 추측일 뿐이다.

### 제안하는 방언

Obsidian 호환 Markdown의 상위 집합을 공식 방언으로 한다. 콜아웃은 `> [!TYPE]`, 접히는 콜아웃은 `> [!TYPE]-`, 위키 링크는 `[[…]]`, 블록 id는 줄 끝 `^id`(옵션으로 보존), 토글은 `<details>`. Notion은 가져오기에서 콜아웃·토글을 완전히 보존하지 못하는 것으로 알고 있으나 **최신 동작은 확인하지 않았다** — 실제 Notion 내보내기·가져오기 파일로 검증해야 한다.

## 7. 이름 제안

- **결정(2026-10-23, P8에서 바뀜): scope는 `@9um4-utils`, 레지스트리는 GitHub Packages.** 2026-10-22의 `@9um4` 결정을 대체한다. 이유: GitHub Packages(npm)는 scope가 저장소 소유자(`9um4-utils`)와 같아야 하고 비공개도 된다. 모든 import가 `@9um4-utils/…`로 바뀌었다. 아래는 결정 전 비교다(예전 `@9um4` 서술 포함).
- **scope 후보 두 개** (사용자가 `@9um4`를 제안함). GitHub의 사용자 `9um4`와 조직 `9um4-utils`는 **둘 다 존재한다**(확인함). npm 쪽 이름이 비어 있는지는 **확인하지 못했다**(레지스트리 검색 API는 scope 필터를 무시하고, npmjs.com은 봇을 막는다) — npm 계정으로 직접 확인해야 한다.

  | | `@9um4` | `@9um4-utils` |
  |---|---|---|
  | 공개 npm(npmjs.com) | npm 사용자 이름 `9um4`가 내 것이면 가능(사용자 scope가 자동으로 생긴다) | npm 조직 `9um4-utils`를 만들면 가능(공개 패키지는 무료) |
  | GitHub Packages | 저장소 소유자가 `9um4`여야 한다 → **지금 저장소(`9um4-utils/mine`)로는 불가**, 옮겨야 함 | **가능** (저장소 소유자와 같음) |
  | 비공개 | npm 유료 플랜 필요 | GitHub Packages로 가능 |
  | 길이 | 짧음 | 김 |

  **추천: `@9um4-utils`.** 공개 여부가 미정인데, 이 이름만 두 레지스트리 모두에서 저장소를 옮기지 않고 쓸 수 있다. scope를 나중에 바꾸면 모든 소비자의 import가 바뀌므로 지금 정한다. 공개로 확정되고 짧은 이름이 중요하면 `@9um4`로 가는 것도 합리적이다(그때 npm 이름을 확인).
- **패키지 이름은 기능 이름으로**: `@9um4-utils/editor-schema`, `editor-core`, `editor-markdown`, `editor-render`, `editor-react`. 앱 이름이 가칭("Notes")이라 이름에 넣지 않는다.
- **저장소**: 1단계는 이 저장소의 `packages/` 워크스페이스(`pnpm-workspace.yaml`에 추가)로 둔다. 소비자가 둘 이상 안정되면 `9um4-utils/editor`로 분리를 판단한다.

## 8. 단계 계획

| 단계 | 내용 | 끝났다고 볼 조건 |
|---|---|---|
| P0 | §9의 미결 질문을 해소하고 이름·방언을 확정한다 | 이 문서의 §9가 비어 있다 |
| P1 ✅ (dist 컴파일·Node 로드 시험 포함) | **경계 만들기**: `packages/`와 `editor-schema`로 순수 모듈 이동, 의존 방향 검사를 CI에 추가 | 기존 시험이 모두 통과하고, schema가 앱 코드를 import하지 않는다 |
| P2 ✅ | **core 포트화**: `createEditorExtensions(options)`, 자산·키값·알림 포트, Collaboration 선택화, 문자열 사전, `import.meta.glob` 제거 | core 폴더에 `lib/api`·`tree/store` import가 0개 |
| P3 | **markdown**: 방언 명세, 골든 왕복 시험, 붙여넣기 변환, 입력 규칙 빈틈 메우기, 실제 Notion·Obsidian 파일로 검증 | 골든 시험 통과, 알려진 손실 목록 확정 |
| P4 ✅ | **render**: Markdown→HTML 플러그인(unified: remark/rehype)과 JSON→React, 서버에서 KaTeX 문자열 렌더, mermaid는 클라이언트 컴포넌트. **Next.js App Router 기준**: 서버 컴포넌트에서 훅 없이 동작, 클라이언트가 필요한 부분(mermaid, 접히는 토글)만 `"use client"`, 컴파일된 JS와 타입을 `exports` 맵으로 배포(소스 TS 배포는 `transpilePackages` 부담을 소비자에게 넘긴다), CSS는 별도 export | Next.js 샘플 앱에서 블로그 글 한 편을 SSG로 끝까지 렌더 |
| P5 | **react**: 메뉴·NodeView·CSS 분리, 데모 페이지 | 노트 앱이 패키지만으로 같은 화면을 낸다 |
| P6 | **시범 소비자**: **블로그 관리자 편집기**(캘린더는 Flutter라 P6b WebView로 미룸)에 도입하고 `raw` 보존 노드·방언 어댑터를 만들며 API 빈틈을 기록한다 | 빈틈 목록을 반영했다 |
| P7 | **PlanBench 도입**: 확장 지점으로 스키마·표 노드를 얹는다. **P7a ✅**(참조 노드·렌더러 빈틈·다크 모드, 데모의 가짜 `table-schema`로 확인) / P7b(실제 PlanBench 도입, 저장소 필요) | PlanBench 고유 기능이 그대로 동작한다 |
| P8 ✅(준비·리허설까지, 게시는 사용자 몫) | **배포**: Changesets, 스키마 호환 semver 규칙, 레지스트리 결정(GitHub Packages) | 첫 버전을 소비자가 설치해 쓴다(로컬 레지스트리로 확인) |
| P9 ✅(판단·리허설까지) | 블로그 도입, 소비자 2개 이상 안정 후 **별도 저장소 분리 판단** → **지금은 분리하지 않음**([EDITOR-SPLIT.md](EDITOR-SPLIT.md)); 블로그는 배포 전 준비 완료 | — |

### P2 상세 계획 (2026-10-23 결정, 같은 날 구현 완료)

측정(2026-10-23): 에디터 폴더에서 `lib/api`·`tree/store`를 쓰는 파일 18개, `import.meta.glob` 1곳(`highlight/loader.ts`), 한글 문자열이 든 파일 약 61개, 모듈 전역 상태 8곳(`toggleStore`·`assetCache`·`keywordStore`·`lowlight`·`blockSource` 등).

결정: ① **React NodeView는 P2에서 core에 같이 옮긴다**(React는 peerDependency; P5에서 `editor-react`로 다시 분리 — 이동이 두 번 일어나는 비용을 받아들인다). ② **문자열 사전은 한국어 기본 + 영어 제공**.

| 단계 | 내용 | 확인 방법 |
|---|---|---|
| 2-0 | **안전망**: `createEditorExtensions`의 스키마(노드·마크·속성 이름)를 골든 파일로 고정, 폴더 단위 의존 규칙을 `check:deps`에 추가 | 스키마가 한 글자도 안 바뀐다 |
| 2-1 | **포트 정의**: `KeyValueStore`·`AssetStore`·`Notifier` 인터페이스와 메모리 기본값 | 타입만 추가 |
| 2-2 | **모듈 전역 → 확장 옵션**: `toggleStore`·`assetCache`를 포트를 받는 구조로 | 기존 시험 + 에디터 2개 동시 시험 |
| 2-3 | **이미지·알림 포트화**: `insertImages`·`ImageView`의 `api.putAsset`·`reportError` | 기존 시험 |
| 2-4 | **`import.meta.glob` 제거**: `gen:languages`가 193개 언어의 명시적 지연 import 표를 생성 | Node import 시험 + 번들 크기 비교 |
| 2-5 | **Collaboration 선택화**: `ydoc`가 없으면 일반 `undoRedo` | 새 시험 |
| 2-6 | **위키 계층 분리**: `PageLink`·`PageBlock`·`PageLinkSuggest`·`BlockLinkCopy`·슬래시 페이지 항목을 앱 쪽 확장으로, `createEditorExtensions({ extensions, slashItems })`로 주입 | 스키마 골든 + 기존 시험 |
| 2-7 | **문자열 사전**: `strings` 옵션(ko 기본, en 제공) | 한글 하드코딩 0 |
| 2-8 | **물리적 이동**: `packages/editor-core`로 위키가 아닌 코드와 `latexCommands`·`slashItems`를 한 번에 | 시험·빌드·CI 통과, core의 앱 import 0 |

**결과** (2-0~2-8 모두 끝, 커밋은 `git log --grep "P2-"`):
- `packages/editor-core`: 위키가 아닌 에디터 코드 75개 파일(확장·NodeView·슬래시·수식·각주·표·이미지·토글·코드 블록·포트·글 사전)과 `lib`의 `math`·`latexAssist`·`latexCommands`·`slashItems`. 공개 API는 `src/index.ts` 배럴 하나이고 앱은 `@9um4-utils/editor-core`로만 가져온다.
- **포트**: `KeyValueStore`·`AssetStore`·`Notifier`·`UrlOpener`(Tauri opener를 직접 쓰던 `LinkOpener`를 바꿨다). 앱 구현은 `src/features/editor/appPorts.ts`. 상태는 포트 객체별(`WeakMap`)이라 에디터가 여럿이어도 섞이지 않는다.
- **주입 지점**: `createCoreExtensions(ydoc, { ports, strings, slashItems, slashHandlers, transform })`. 노트 앱의 `editorExtensions.ts`가 위키 확장을 **예전 자리 그대로** 끼운다. 스키마 골든이 노드·마크·확장 순서를 고정하고, P2 내내 한 글자도 바뀌지 않았다.
- **Yjs 선택화**: `ydoc`가 없으면 StarterKit의 history가 되돌리기를 맡는다.
- **`import.meta.glob` 제거**: `pnpm gen:languages`가 193개 언어의 명시적 지연 import 표를 만든다. 번들 구조(JS 290개, 언어 조각 해시)는 그대로다.
- **글 사전**: `strings/`의 ko(기본)·en. 슬래시 항목은 한국어·영어로 모두 검색된다. `pnpm check:deps`(`check-core-strings`)가 core의 한글 하드코딩을 막는다.
- 검증: 로컬 전체 시험 1507개, 새 클론에서 CI와 같은 순서(`install --frozen-lockfile` → 시험 → `check:deps` → `check:dist` → `build`) 통과.

**P2에서 확인하지 못했거나 남은 것**:
1. **화면에서 직접 확인하지 못했다.** 서버(Linux, 화면 없음)에서 Tauri 앱을 띄우지 못했다. React 컨텍스트(`EditorPortsProvider`)가 TipTap NodeView에 닿는지, 되돌리기/다시하기, 입력 동작은 사람이 [IME-CHECKLIST.md](IME-CHECKLIST.md)와 함께 확인해야 한다. 화면 없는 시험 환경에서는 일반 StarterKit도 되돌리기가 동작하지 않아 구조(설정값)만 시험했다.
2. **글 사전에 없는 한국어**: 위키 계층(페이지 링크·페이지 블록·위키 슬래시 항목 4개), LaTeX 명령 설명·검색어 표(`lib/latexCommands.ts`, 약 300개 항목), 개발자용 `console.warn` 문구. 슬래시 기본 항목의 한국어 글은 `lib/slashItems.ts`에 데이터로 남아 있고 영어가 사전으로 덮는다.
3. ~~core에 React 뷰가 들어 있다~~ → P5에서 `editor-react`로 나눴고 `check:dist`가 다섯 패키지를 모두 본다.
4. ~~CSS는 앱의 `src/index.css`에 남아 있다~~ → P5-4에서 `editor-react/styles/`로 옮겼다(앱 고유 규칙만 남음).
5. `lib/math.ts`가 `katex/dist/katex.min.css`를 JS에서 동적 import한다(§5 걸림돌 2). Next.js 서버 렌더링용 처리는 P4.

**5-1 결과** (2026-10-23): core의 확장은 이제 화면을 모른다. `createCoreExtensions(ydoc, { views, menus, ui })`로 노드 뷰 7개(콜아웃·코드 블록·이미지·각주·토글·수식 인라인/블록), 메뉴 2개(`/`·코드 자동완성 — 닫힐 때 Ctrl+Space 위치를 비우는 일과 한글 조합 키 무시는 core가 주입된 render를 감싸서 한다), 편집 창 접점(`uiOf(editor).openMathEditor/openFootnoteEditor`)을 주입받고, 주입하지 않으면 `renderHTML` 기본 렌더로 그려진다. `src/react/`(views·menus·hosts·stores·hooks·context·`createReactExtensions`)에 React 쪽을 모았고, `scripts/check-core-react.mjs`가 **그 밖의 core가 React·zustand를 import하면 실패**시킨다(`check:deps`; 지금 위반 0). 수식 KaTeX 로더는 core(`lib/math.ts`), `useMathHtml` 훅은 react. 노트 앱·데모·화면 시험은 `createReactExtensions`를 쓴다. 검증: 단위 시험 1686개, DOM 골든 한 글자도 안 바뀜, 실제 Chromium의 계산된 스타일이 기준과 같음, 동작 시험 19개, **스크린샷 13장이 5-0b 시점과 픽셀 단위로 동일**.

**5-2 결과** (2026-10-23): `packages/editor-react`(`@9um4-utils/editor-react`)가 생겼다 — 뷰 10개·메뉴 3개·호스트 3개·저장소 3개·훅·컨텍스트·`createReactExtensions`와 화면 시험(DOM 골든 2개와 그 골든 파일, 실제 Yjs 마운트 시험)이 옮겨 왔고 공개 API는 `src/index.ts`(`"use client"`) 하나다. **core는 React를 전혀 쓰지 못한다**: `check-package-deps`의 core 허용 목록에서 `react`·`react-dom`·`@tiptap/react`·`zustand`를 뺐고 core의 `package.json`에서도 지웠다(5-1의 임시 검사 `check-core-react`는 이 규칙으로 대체되어 없앴다). **editor-react은 core의 공개 API(`@9um4-utils/editor-core`, `@9um4-utils/editor-core/testing`)만 쓴다**(상대 경로로 core 내부를 읽으면 `check-package-deps`가 막는다). 넓어진 core 공개 API: 수식·각주 편집 보조(`setMathLatex`·`setFootnoteText`·`collectFootnotes` 등), 수식 로더(`loadKatex`·`renderMathHtml`·`mathError`), LaTeX 자동완성 계산(`latexAssist`), mermaid 도구, `assetCacheFor`, 화면 시험 도구(`@9um4-utils/editor-core/testing`에 `mountGolden`). 한글 하드코딩 검사는 두 패키지를 모두 본다. 노트 앱·데모는 React 쪽을 `@9um4-utils/editor-react`에서 가져온다. 검증: 단위 시험 1686개, DOM 골든(옮겨 간 파일 그대로), 실제 Chromium 계산된 스타일 기준과 같음, 동작 시험 19개, **스크린샷 13장이 P5 시작 전과 픽셀 단위로 동일**, 앱 진입 JS +1.5KB.

**5-3 결과** (2026-10-23): editor-react의 Tailwind 유틸리티 클래스를 모두 `md-` 의미 클래스로 바꿨다(`packages/editor-react/styles/ui.css`, 패키지 내보내기 `@9um4-utils/editor-react/styles.css`; 앱은 `src/index.css`에서 가져온다). 값은 Tailwind가 실제로 내놓는 CSS를 뽑아 그대로 옮겼다(색은 oklch 값, 길이는 0.25rem 단위). Tailwind 초기화(preflight)에 기대던 것(버튼의 `font: inherit`·테두리 없음, `box-sizing`, 목록 기호 없음)은 클래스마다 직접 적어서 Tailwind 없는 소비자도 같은 모양이 나온다. 배운 점: **줄 간격은 `calc(1.25 / 0.875)`를 사용자 정의 속성에 담아 `var()`로 써야 한다** — 소수(`1.42857`)로 적거나 CSS 최적화가 나눗셈을 소수로 줄이면 14px 글자가 19.98px 줄이 돼 메뉴 글자가 1px씩 올라간다(스크린샷 비교가 잡았다). 검증: DOM 골든 7개는 클래스 속성만 달라졌고(클래스를 지운 뒤 같음을 스크립트로 확인) 단위 시험 1686개·동작 시험 19개 통과, **스크린샷 13장이 P5 시작 전과 픽셀 단위로 동일**. 계산된 스타일 기준은 눈에 보이지 않는 차이(너비 0 테두리의 색·스타일, 투명한 그림자 층, 1e-5 크기의 색 혼합 오차)만 있어 갱신했다.

**5-4 결과** (2026-10-23): 본문 모양 규칙(제목·목록·콜아웃·코드 블록·언어 선택·구문 강조·이미지·각주·수식·표와 표 편집 막대·토글·할 일·링크 기본형)을 `src/index.css`에서 `packages/editor-react/styles/editor.css`로 옮기고 루트 클래스를 `.md-editor`로 바꿨다(713줄 이동, 앱에는 295줄 남음). 패키지의 `styles.css` 내보내기는 `styles/index.css`가 `ui.css`(5-3)와 `editor.css`를 함께 가져온다. **앱 고유의 규칙은 앱에 남겼다**: 페이지 링크·페이지 블록·동기화 블록·버전 비교(`.page-editor` 선택자 그대로). 앱의 본문 요소는 `page-editor md-editor` 두 클래스를 모두 단다(`PageEditor`·`SyncedBlock`·`VersionCompareView`·`PagePreviewHost`). 순서가 바뀐 것: 옮긴 규칙이 앱 규칙(버전 비교·페이지 블록) 뒤에서 앞으로 왔다 — 같은 요소를 꾸미는 겹침이 없는지 따졌다(버전 비교의 `[data-diff]`는 노드가 아니라 비교 화면이 만든 래퍼에 붙고, 페이지 블록의 `.image-placeholder` 규칙은 여전히 뒤에 있다) — 앱 화면은 데모가 덮지 못하므로 5-5의 사람 확인 항목이다. `check-css-rules`는 두 파일을 보고 `.md-editor`를 기준의 `.page-editor`로 맞춰 비교한다(기준 210개 모두 있음). 데모는 이제 앱의 CSS가 아니라 패키지의 `styles.css`만 쓴다. 검증: 계산된 스타일이 기준과 같고(실제 Chromium) 동작 시험 19개·단위 시험 1686개 통과, **스크린샷 13장이 P5 시작 전과 픽셀 단위로 동일**.

**5-6 결과** (2026-10-23): `editor-core`와 `editor-react`도 배포용으로 컴파일하고 `check:dist`가 다섯 패키지를 모두 본다(`build:packages` → pack 모양 → 소비자 타입(번들러·nodenext, `skipLibCheck: false`) → Node 스모크). 각 패키지에 `tsconfig.build.json`·`files`·`publishConfig`·`build` 스크립트를 더했고 editor-react의 `"use client"`가 컴파일 뒤에도 진입점 맨 앞에 남는지 검사한다. 이 과정에서 잡힌 문제 셋: ① **core·react의 소스는 확장자 없는 상대 import(`./keywordStore`)를 써서 tsc 출력이 순수 Node에서 불러지지 않았다**(Node 스모크가 52개 모듈 중 첫 번째에서 깼다) → `fix-dts-imports.mjs`가 JS·선언의 확장자 없는 상대 import에 `.js`/`/index.js`를 붙이도록 넓혔다(소스는 건드리지 않음). ② **editor-react의 표 막대가 쓰는 표 명령 타입(`addRowAfter` 등)은 `@tiptap/extension-table`이 에디터 타입에 더하는 확장인데, editor-react은 그 패키지에 의존하지 않아 컴파일이 깨졌다**(선언 파일의 `/// <reference types>`는 tsc가 남기지 않는다) → 표 동작 목록(`TABLE_ACTIONS`: 실행·가능 여부·위험 표시)을 core의 `table/tableActions.ts`로 옮겨 공개했다 — 에디터 명령은 core에 있는 것이 옳다. ③ `katex/dist/katex.min.css` 동적 import에 타입 선언이 없어 컴파일이 깨졌다 → `css.d.ts`(번들러가 CSS를 처리한다는 전제를 문서화). editor-react은 컴파일할 때 core의 소스가 아니라 `dist/index.d.ts`를 보게 `paths`로 지정했고, 그래서 `build:packages`는 core를 먼저 짓는다(pnpm이 의존 순서를 지킨다). 소비자 타입 시험에 core·react의 공개 API 사용 예(`createCoreExtensions`·`createReactExtensions`·`newEditor`·`TABLE_ACTIONS`)와 "없는 옵션은 오류" 확인을 더했다. 검증: `check:dist` 전부 통과(Node에서 102개 모듈), 단위 1686개, 동작 19개, 스크린샷 13장 P5 이전과 동일, 앱 진입 JS 1,524,759B(5-2 대비 −1.8KB: Tailwind 클래스가 빠졌다).

**5-7 결과** (2026-10-23): 데모는 `@9um4-utils/editor-core`·`@9um4-utils/editor-react`와 패키지 스타일(`@9um4-utils/editor-react/styles.css`)만 쓴다(앱의 `src/`를 가져오는 곳 없음). 더해서 **Tailwind 없는 페이지(`plain.html`)** 를 만들었다 — 소비자(블로그·캘린더)가 Tailwind를 안 쓰는 경우를 실제 브라우저로 보려는 것이다. 처음에는 브라우저 기본 여백(`p`·`ul`)·버튼 테두리·`img` 크기 제한·`code` 글자 크기가 그대로 스며들어 모양이 많이 달랐다(스크린샷). 두 페이지의 계산된 스타일을 비교해 **차이를 낳는 속성만** 골라(박스 크기·여백·테두리 초기화, 제목 크기, 목록 기호, 링크 색, 버튼·입력 글꼴, 이미지·svg 표시) `editor.css` 앞머리의 `@layer base` 초기화로 넣었다: Tailwind preflight와 같은 값이라 앱에서는 아무것도 바뀌지 않고(계산된 스타일·스크린샷 13장 동일), `@layer base` 안이라 소비자의 스타일·Tailwind 유틸리티가 항상 이긴다(레이어 밖 규칙이 레이어 안 규칙을 이긴다 — 페이지 미리보기가 `page-editor md-editor` 요소에 `mt-1.5`·`border-t`를 얹는 것이 이 이유로 안전하다). 표 막대는 본문 밖에 뜨는 부품이라 `box-sizing`·`font: inherit`를 직접 적었다. 이제 두 페이지의 남은 차이는 소비자 몫(문서 기본 글꼴·줄 간격)뿐이고 **동작 시험 19개가 Tailwind 없는 페이지에서도 통과**한다. `visual:plain`(기준 `computed-styles-plain.json`)을 CI `browser` 작업에 더했다.

**P5 완료 요약과 5-5·5-8** (2026-10-23): 5-5(앱 연결)의 코드 작업은 앞 단계에서 끝났다 — 앱은 `createReactExtensions`와 `@9um4-utils/editor-react`·`@9um4-utils/editor-react/styles.css`를 쓰고 본문 요소에 `page-editor md-editor`를 단다. 남은 것은 **앱 화면은 서버(Linux, 화면 없음)에서 띄울 수 없어 데모가 덮지 못하는 곳을 사람이 확인하는 일**이다. 확인 목록(앱 `pnpm tauri dev`, 이전 모습과 비교):
1. 본문 편집 화면: 제목·목록·표·콜아웃·코드 블록·이미지·토글·각주·수식이 이전과 같은가(특히 첫 화면의 간격).
2. 메뉴·편집 창: 슬래시 메뉴, 코드 자동완성, 수식 편집 창과 LaTeX 자동완성, 각주 편집 창, 마메이드 크게 보기의 모양과 위치.
3. **CSS 순서가 바뀐 곳**(옮긴 규칙이 앱 규칙 앞으로 왔다): 버전 비교 화면(색·기호·접힘), 페이지 블록 카드·임베드·동기화 블록, 링크 호버 미리보기(`PagePreviewHost`: 위쪽 간격·구분선), 페이지 링크의 색·흐림.
4. 어두운 배경이나 좁은 창에서 메뉴가 잘리지 않는가(WebView2).
5. 한글 IME(실제 입력기; 체크리스트는 [IME-CHECKLIST.md](IME-CHECKLIST.md)) — 자동 시험은 이벤트 주입이다.

P5로 해소된 한계: 위 P2의 3번(core의 React 뷰)·4번(CSS는 앱에 남음)은 풀렸다 — React는 `editor-react`, 본문 모양은 `editor-react/styles/editor.css`, 메뉴·편집 창은 `ui.css`에 있고 다섯 패키지가 모두 `check:dist`(컴파일·pack·소비자 타입·Node 로드·`"use client"`)를 거친다. 남은 한계: 헤드리스 Chromium(Linux)은 WebView2가 아니다, 마우스 올림·포커스 상태는 자동으로 보지 않는다, IME는 이벤트 주입이다, GitHub Actions의 `browser` 작업은 아직 한 번도 돌지 않았다. 다음 단계는 P6 이후.

하지 않는 것: **일반 참조 노드는 P7(PlanBench)에서 만든다** — 새 노드는 저장 스키마·`DOC_SCHEMA_VERSION`을 바꾸고 기존 `pageLink`/`pageBlock` 이전이 필요한데, 소비자가 하나뿐인 지금 만들면 틀린 추상화가 될 수 있다(§10). P2의 2-6 주입 구조가 그 바탕이다. 저장·동기화·저널 코드(`usePageDoc`·`docSaver`·`openDocs` 등)는 앱에 남는다.

위험: IME·자동완성·슬래시 같은 입력 동작은 시험이 다 못 잡으므로 끝에 [IME-CHECKLIST.md](IME-CHECKLIST.md)를 사람이 확인한다. core의 React 뷰는 Tailwind 클래스를 쓰므로 앱 CSS가 `packages/`도 스캔하게 설정한다.

### P3 상세 계획 (2026-10-23 결정, 3-6만 보류)

현황: 내보내기(`lib/markdown.ts`)와 가져오기(`lib/markdownImport.ts`)는 순수 함수이고 위키 연결(페이지 제목 찾기, 링크·이미지 해석)은 이미 옵션·컨텍스트로 주입된다 → 패키지로 옮기기 쉽다. 입력 규칙·붙여넣기 변환·복사 시 Markdown은 없다. 블록 링크(`[[제목#^id]]`)는 내보낼 때 페이지 링크로 바뀌고 가져올 때 위치를 버려 **Markdown 왕복에서 사라진다**.

결정: ① 전체 내보내기(Obsidian 금고)는 **모든 블록에 `^id`를 남긴다**(블록 링크가 Obsidian에서 동작하고 재가져오기에서 id가 보존된다. 대신 파일이 지저분해진다). ② 복사 시 Markdown은 core 옵션(`copyAsMarkdown`)으로 만들고 **노트 앱은 끈다**. ③ 실제 Obsidian·Notion 샘플은 나중에 받는다 — 그때까지는 공개 문법 문서 기반 시험 자료이고 "추정"이라고 적는다. ④ 원본 보존(`raw` 노드)은 새 노드라 저장 스키마·동기화에 영향을 주므로 소비자가 붙는 P6에서 다룬다.

| 단계 | 내용 | 확인 방법 |
|---|---|---|
| 3-0 | **방언 명세와 골든 틀**: `docs/MARKDOWN-DIALECT.md`(노드별 문법·읽기/쓰기 규칙·알려진 손실)와 `fixtures/` 골든(문서→Markdown, Markdown→문서, 왕복) | 골든이 현재 동작과 일치 |
| 3-1 | **`@9um4-utils/editor-markdown` 패키지**: `markdown.ts`·`markdownImport.ts`(frontmatter 포함)와 시험을 옮긴다. 의존은 schema·`marked`만 | 기존 시험 그대로 통과 |
| 3-2 | **블록 id `^id` 입출력**: 내보내기 옵션 `blockIds`, 가져오기에서 `^id` 읽기, 블록 링크가 `[[제목#^id]]`로 살아남게 한다 | 왕복·블록 링크 시험 |
| 3-3 | **입력 규칙**: 있는 규칙(제목·목록·인용·코드 펜스·체크리스트·수식)을 시험으로 확인하고 콜아웃 `> [!NOTE]`를 추가한다 | 타이핑 시뮬레이션 시험 |
| 3-4 | **붙여넣기 변환**: Markdown 같은 텍스트를 붙이면 서식으로 변환, Ctrl+Z로 원문 복귀, Ctrl+Shift+V는 일반 텍스트 그대로. 위키 링크 해석은 앱이 주입 | 판별·변환 시험 |
| 3-5 | **복사 시 Markdown** 옵션(앱은 끔) | 직렬화 시험 |
| 3-6 | Obsidian·Notion **실제 파일 검증** | 샘플이 와야 가능(보류) |
| 3-7 | **알려진 손실 목록 확정**, 문서 갱신 | — |

**결과** (3-0~3-5, 3-7 끝, 커밋은 `git log --grep "P3-"`):
- **`@9um4-utils/editor-markdown`**: `markdown.ts`·`markdownImport.ts`(frontmatter 포함)와 시험. 의존은 schema·`marked`뿐이다.
- **방언 명세** [MARKDOWN-DIALECT.md](MARKDOWN-DIALECT.md)와 **골든 픽스처 15개**(`packages/editor-markdown/fixtures/`): 문서→Markdown, Markdown→문서, 한 번 읽은 뒤 제자리, 손실 없는 것은 문서 동일, 손실 있는 것은 읽은 모양 고정. 골든을 만들며 **실제 손실 하나를 찾아 고쳤다**: 같은 종류의 목록이 이어지면 Markdown이 한 목록으로 합치던 것을 기호 번갈아 쓰기(`-`↔`*`, `.`↔`)`)로 해결.
- **블록 id `^id`**: 내보내기 옵션 `blockIds`(전체 내보내기는 켬), 가져오기에서 줄 끝·홀로 있는 `^id`와 `[[이름#^id]]` 블록 링크. Obsidian 사용자의 `^my-id`는 글자에서 정해지는 id로 바꾼다(`blockIdFromForeign`, 값 고정). 전체 내보내기→가져오기 왕복에서 블록 링크가 이어지는 것을 시험으로 확인.
- **입력 규칙**: 있는 11개를 한 글자씩 타이핑하는 시험으로 고정(설계 문서가 "미확인"이라 했던 것이 모두 있었다), 콜아웃 `> [!NOTE] ` 추가.
- **붙여넣기 변환**: `MarkdownPaste` — 판별(`looksLikeMarkdown`), 첫 Ctrl+Z는 원문으로, 노트 앱은 제목이 같은 페이지가 하나일 때만 `[[제목]]`을 이어 줌.
- **복사 시 Markdown**: `copyAsMarkdown` 옵션, 기본 꺼짐(노트 앱도 끔).
- 화면 없는 시험 도구를 `@9um4-utils/editor-core/testing`으로 공개했다(타이핑·붙여넣기·플러그인 상태).

**P3에서 확인하지 못했거나 남은 것**:
1. **3-6 Obsidian·Notion 실제 파일 검증은 샘플이 없어 못 했다.** 호환은 공개 문서의 문법을 근거로 한 것이다.
2. **화면 확인 상태** (2026-10-23, CDP로 검증용 앱을 띄워 확인): 붙여넣기 변환·Ctrl+Shift+V·HTML 동반 붙여넣기·`[[제목]]` 해석·콜아웃 입력·전체 내보내기/가져오기의 `^id`와 블록 링크는 통과. 붙여넣기 후 Ctrl+Z 두 단계(원문 → 붙여넣기 전)와 입력 직후 붙여넣기도 수정 뒤 통과("확인에서 나온 수정"). **남은 것**: 링크 Ctrl+클릭으로 브라우저 탭이 실제로 열리는지, 한글 입력(IME), 토글 경고가 이전부터였는지, Obsidian에서 블록 링크가 동작하는지. **원인 미확인 현상**: 새로 만든 페이지에서 처음 한 번 붙여넣은 뒤 Ctrl+Z에 반응이 없었다(같은 시나리오 3회 반복에서는 재현 안 됨; 새 페이지 직후 첫 실행에서만 보임). 또 나오면 Collaboration의 UndoManager 스택이 비어 있어 `undo()`가 false였는지(`getUndoManager(state).undoStack.length`), 검증 도구의 포커스 문제였는지부터 본다. ① 실제 클립보드(VS Code·GitHub·메모장·Obsidian에서 복사)에서 판별이 기대대로인지, ③ Ctrl+Shift+V 판별은 prosemirror-view의 비공개 값(`view.input.shiftKey`)에 기댄다 — 읽을 수 없으면 일반 붙여넣기로 보지 않아 변환이 일어난다.
3. **컨테이너 블록의 id**(목록·인용·콜아웃·토글·구분선·페이지 블록)는 내보내지 않는다. 가져오면 새 id가 생긴다(링크는 글이 있는 블록만 가리킬 수 있어서 영향이 없다).
4. **`notices`(변환 안내 문구)는 한국어뿐**이다 — editor-markdown의 글 사전화는 안 했다.
5. **원본 보존(`raw` 노드)**과 소스 보기는 P6 이후.

**확인에서 나온 수정** (사람이 앱에서 확인해 알려 준 실패): 붙여넣기 직후 Ctrl+Z가 원문으로 돌아가지 않고 붙여넣기 전체를 취소했다. 원인은 ① `MarkdownPaste`와 Collaboration의 우선순위가 둘 다 1000이었고 TipTap은 같은 우선순위에서 **나중에 등록된 확장의 단축키를 먼저** 실행해 Yjs가 Ctrl+Z를 가져간 것, ② 원문으로 "바꿔 넣는" 편집을 기록에 더하면 두 번째 Ctrl+Z가 변환된 내용을 되살리는 것이었다. 우선순위를 1100으로 올리고, 첫 Ctrl+Z는 "표준 되돌리기로 붙여넣기 취소 → 원문을 새 편집으로 삽입"으로 바꿨으며, 붙여넣기가 앞선 입력과 한 되돌리기 단계로 합쳐지지 않게 끊는다. 화면 없는 시험이 Yjs 없이 돌아서 못 잡았으므로 `happy-dom`을 개발 의존성에 더하고 실제 Yjs + 마운트된 에디터 시험(`markdownPaste.collab.test.ts`)을 추가했다 — 옛 설정으로 돌리면 이 시험이 실패하는 것을 확인했다.

### P4 상세 계획 (2026-10-23 결정, 같은 날 구현 완료)

결정: ① **파이프라인은 하나**: `Markdown → markdownToDoc → 본문 JSON → React 요소`. 원안의 unified(remark/rehype) 플러그인은 만들지 않는다 — 콜아웃·토글·각주·수식·블록 id의 해석을 두 곳에 구현하면 편집기와 블로그가 어긋나기 때문이다(대신 remark/rehype 생태계 플러그인은 쓸 수 없다). ② **Next.js 샘플 앱을 만들고 CI에서 `next build`도 돌린다**. ③ **mermaid는 브라우저에서 그린다**(서버는 `<pre class="mermaid">`).

| 단계 | 내용 | 확인 방법 |
|---|---|---|
| 4-0 | `@9um4-utils/editor-render` 골격(의존: schema·markdown·katex·lowlight, React는 peer). 의존 방향 검사와 **배포용 컴파일을 세 패키지 모두로** 확장, dist끼리의 import를 검증하는 로더 | `check:deps`·`check:dist` |
| 4-1 | **핵심 렌더러**(JSON→React, 훅·브라우저 API 없음): 모든 블록·인라인, 콜아웃, 토글(`<details>`), 각주 목록, 표, 정렬, 안전한 링크, 이미지(주소 해석기 주입), 블록 id·제목 앵커 | `editor-markdown` 골든 픽스처 재사용 → HTML 골든 |
| 4-2 | **서버 준비 단계** `prepareRender(doc)`(비동기): 수식→KaTeX HTML, 코드→lowlight 강조. 렌더 자체는 동기 | Node 시험 |
| 4-3 | **클라이언트 조각** `MermaidDiagram`(`"use client"`) | 서버 출력 시험 |
| 4-4 | **스타일**: `styles.css`(CSS 변수, 다크), 코드 강조 테마, KaTeX CSS 재노출 | 샘플 앱 육안 |
| 4-5 | **편의 API**: `renderMarkdown(source)`(frontmatter·요소·목차·안내), `renderToHtml` | 단위 시험 |
| 4-6 | **배포 형식**: 컴파일된 JS·타입, `exports` 맵, `"use client"` 보존 | Node 로드 시험 |
| 4-7 | **Next.js 샘플** `examples/next-blog`(App Router, `generateStaticParams`) + `next build` + 산출 HTML 검사 + CI | 빌드·HTML 검사 |
| 4-8 | 문서와 남은 것 | — |

하지 않는 것: mermaid의 빌드 시점 SVG(브라우저 엔진 필요), 위키 링크의 의미 있는 해석(블로그에 위키가 없다 — 소비자가 `pageLink` 해석기를 주면 링크로 만든다).

**결과** (4-0~4-8 끝, 커밋은 `git log --grep "P4-"`):
- **`@9um4-utils/editor-render`**: `renderDoc`(본문 JSON→React 요소, 훅·브라우저 API 없음), `prepareRender`(서버에서 수식→KaTeX HTML·코드→lowlight 강조, 렌더는 동기), `renderMarkdown`(frontmatter·본문 변환·준비·렌더·목차·안내를 한 번에), `/html` 진입점(`react-dom/server` 문자열; Next 서버 컴포넌트와 섞지 않으려고 분리), `MermaidDiagram`(`"use client"`, 서버는 `<pre class="mermaid">`, 브라우저에서만 mermaid를 동적 import — 선택 peer), 스타일 3개(`styles.css`·`highlight.css`·`katex.css`; CSS 변수, 시스템 다크 모드 + `data-theme`).
- **파이프라인은 하나**(결정 ①): Markdown→`markdownToDoc`→본문 JSON→React. 편집기와 블로그가 같은 해석을 쓴다. 이를 위해 가져오기에 `remoteImages` 옵션을 더했다(블로그는 `![](https://…)`를 이미지로 읽는다).
- **HTML 골든**: `editor-markdown`의 Markdown 골든 픽스처 15개를 그대로 렌더해 `fixtures/*.html`로 고정(같은 문서가 Markdown으로도 HTML로도 고정된다) + 서버 준비 골든 2개. 보안 시험: HTML 이스케이프, `javascript:`·`data:` 링크·이미지 차단, KaTeX `trust: false`.
- **배포 모양**(`pnpm check:dist`, CI `packages` 작업): 세 패키지를 tsc로 컴파일하고 ① `pnpm pack` 결과의 `exports`가 dist를 가리키는지·`workspace:`가 없는지, ② 소비자 프로젝트가 배포된 `.d.ts`를 `skipLibCheck: false`로 번들러·nodenext 해석 둘 다에서 컴파일하는지, ③ dist끼리의 import(로더 훅)로 순수 Node에서 Markdown→HTML이 끝까지 되는지, ④ `"use client"`가 컴파일 뒤에도 남는지 확인한다. 이 검사들이 실제 문제를 잡았다: 렌더 패키지 상대 import의 확장자 누락(dist에서 모듈 못 찾음), `gen:languages`가 P2 이동 뒤에도 옛 경로에 쓰던 것.
- **Next.js 샘플** `examples/next-blog`(Next 16, App Router, Turbopack): 글 3편이 서버 컴포넌트에서 `generateStaticParams`로 SSG되고, `pnpm --filter next-blog-example verify`가 산출 HTML(제목 앵커·목차·콜아웃·토글·각주·표·KaTeX·코드 강조·위키 링크 해석·이미지)과 번들 CSS를 확인한다. 클린 클론에서 `next build` 성공.

**P4에서 확인하지 못했거나 남은 것**:
1. **샘플 앱은 패키지의 TS 소스를 `transpilePackages`로 쓴다.** 배포된 dist를 번들러(Turbopack)가 읽는 경로는 위 ①~④로만 간접 검증했고 샘플 앱으로는 못 했다. 문제가 생기면 패키지 `exports`에 `source` 조건을 두는 방식을 검토한다.
2. **눈으로 확인하지 못했다**: 스타일(밝은/어두운), mermaid가 브라우저에서 실제로 그려지는지(시험은 happy-dom + mermaid 모의), 수식 글꼴. `cd examples/next-blog && pnpm dev`로 확인한다.
3. **GitHub Actions `packages` 작업은 아직 한 번도 돌지 않았다.**
4. 렌더되지 않는 것: 저장소 해시 이미지(소비자가 `imageUrl`로 주소를 줘야 보인다), 위키의 동기화 블록·페이지 임베드 본문. 블록 id 앵커는 `blockAnchors` 옵션을 켜야 나온다.
5. Markdown 변환 안내(`notices`)는 한국어뿐이다. 렌더 문구(각주, 콜아웃 이름)는 ko·en이 있다.
6. 모든 패키지가 `private: true`다 — 배포(레지스트리, 버전, Changesets)는 P8.

### P5 상세 계획 (2026-10-23 결정)

측정(2026-10-23): core의 TS 파일 48개 중 38개는 이미 React가 없다. React가 얽힌 곳은 `.tsx` 17개(1,747줄)와 그 뷰를 직접 import하는 확장(노드 뷰 7개: 콜아웃·코드 블록·이미지·각주·토글·수식 인라인/블록, 메뉴 2개: 슬래시·코드 자동완성)이다. 확장이 편집 창을 열려고 `openMathEditor`·`openFootnoteEditor`(zustand 저장소 → React 창)를 직접 부른다. `src/index.css`(1006줄)의 에디터 본문 스타일이 약 600줄이고, TSX에 Tailwind 유틸리티 클래스가 45곳 있다. 앱이 core에서 가져다 쓰는 React 쪽 이름: `AssetImage`·`TableToolbar`·`MathEditorHost`·`FootnoteEditorHost`·`EditorPortsProvider`·`useMathHtml`·`placeMenu`.

결정: ① **Tailwind 클래스는 일반 CSS로 바꾼다**(패키지가 자기 CSS를 배포해 소비자가 Tailwind가 없어도 된다). ② **본문 루트 CSS 클래스는 `md-editor`로 새로 정한다**(패키지 스타일은 `.md-editor` 아래에서만; 앱은 `page-editor`에 `md-editor`를 함께 달고 앱 전용 스타일만 `page-editor`에 남긴다; 읽기 전용 렌더러의 `md-doc`과 짝). ③ **데모 페이지 `examples/editor-demo`(Vite)를 만든다**.

설계: **editor-core는 React가 없다**(스키마·명령·입력 규칙·붙여넣기·복사·포트·순수 로직). 뷰·메뉴·편집 창은 **주입**받는다 — `createCoreExtensions(ydoc, { views, menus, ui })`: `views`는 노드 이름별 `NodeViewRenderer` 맵(없으면 `renderHTML` 기본 렌더라서 React 아닌 소비자도 쓸 수 있다), `menus`는 Suggestion의 `render`, `ui`는 편집 창 열기 접점(`openMathEditor`·`openFootnoteEditor`; 기본은 아무것도 안 함). **editor-react**는 뷰 17개·메뉴·편집 창 호스트·`EditorPortsProvider`와 훅·`createReactExtensions()`(core에 위 주입을 채워 줌)·스타일을 가지며 `"use client"`다. `lib/math.ts`의 KaTeX 로더는 core, `useMathHtml` 훅은 react.

| 단계 | 내용 | 확인 방법 |
|---|---|---|
| 5-0 | **안전망**: ① 모든 노드가 든 문서를 happy-dom에서 **실제로 마운트**(EditorContent)해 렌더된 DOM을 골든으로 고정, ② `index.css`의 **규칙 집합**을 기준 파일로 고정(옮긴 뒤 규칙이 사라지지 않았는지 비교) | 이동 전 골든 생성 |
| 5-0b | **실제 브라우저 안전망**(5-0의 한계를 푼다): ① `examples/editor-demo`(Vite) — 고정 문서·고정 id로 지금의 core 뷰를 띄운다(`?collab=1`이면 실제 Yjs), ② Playwright(headless Chromium)로 장면 13개의 **계산된 스타일**(`computedStyleMap`)을 덤프해 기준으로 커밋, ③ 실제 키 입력·붙여넣기·**CDP 한글 조합(IME)** 동작 시험 19개, ④ 같은 머신 전후 비교용 스크린샷(픽셀 diff) | 기준 비교 + 동작 시험 통과, CI `browser` 작업 |
| 5-1 ✅ | **접점 만들기(제자리)**: core 안에서 뷰·메뉴·편집 창을 주입 방식으로 바꾸고, React에 묶인 파일을 `src/react/`로 모은다(아직 같은 패키지) | 5-0·5-0b가 한 글자·한 픽셀도 안 바뀜 |
| 5-2 ✅ | **`editor-react` 패키지 생성**: `src/react/` 폴더를 통째로 새 패키지로 옮겼다. core의 공개 API를 그것이 필요로 하는 만큼 넓혔다 | `check:deps`, 골든, `visual` |
| 5-3 ✅ | **Tailwind 클래스 → 일반 CSS**(45곳) | 골든 갱신 후 diff 검토 |
| 5-4 ✅ | **CSS 이동**: 본문 스타일을 `editor-react`의 스타일 파일로, 앱 `index.css`에서 제거. 루트 클래스 `md-editor` | 규칙 집합 비교 |
| 5-5 | **앱 연결**: `PageEditor`·`SyncedBlock`·호스트를 `createReactExtensions`와 새 import로 | 전체 시험 + 사람의 화면 확인 |
| 5-6 ✅ | **배포 모양**: core·react를 `check:dist`(컴파일·pack·소비자 타입·`"use client"` 보존)에 추가 | `check:dist` |
| 5-7 ✅ | **데모 페이지**: `examples/editor-demo`는 5-0b에서 앞당겨 만들었다. 남은 일은 데모가 `editor-react`·패키지 스타일만 쓰도록 import를 바꾸는 것 | 빌드 + `visual`, CI |
| 5-8 ✅ | 문서와 남은 것 | — |

위험: ① **CSS 우선순위·순서**: 규칙 집합 비교는 "사라진 규칙"만 잡고 순서·우선순위 변화는 못 잡는다 → 5-5 뒤 사람의 화면 확인(이전과 같은 CDP 검증)이 필요하다 → **5-0b가 이 위험을 줄인다**(순서만 바꾼 CSS도 브라우저의 계산된 스타일 비교가 잡는다). ② **마운트 시험의 한계**: happy-dom은 레이아웃을 계산하지 않아 위치·크기 문제를 못 잡는다(DOM 구조·클래스만 고정) → 5-0b의 실제 브라우저 시험이 보완한다. ③ 범위가 크다(파일 20여 개, CSS 600줄) — 단계마다 시험이 통과한 채 커밋한다.

### P6 상세 계획 (2026-10-23 결정, 미착수)

**시범 소비자는 블로그 관리자 편집기(`~/blog`, Next.js 16·React 19)로 한다.** 캘린더(`~/todo`, LunarTask)는 Flutter 앱이고 Markdown 편집기가 아직 없어서 React 패키지를 바로 못 쓴다(WebView에 번들을 올리는 별도 작업 → **P6b**로 미룬다). 계획표의 "캘린더 Markdown 부분"은 이 결정으로 바뀐다.

블로그 사실: Markdown이 원본이고(DB의 `contentMd`) 렌더링은 자체 remark 파이프라인(`lib/domain/render.ts`: gfm·math·`remark-directive`·임베드·fold·시리즈 카드·rehype-katex)이다. 관리자 편집기는 textarea 기반 `UnifiedEditor`(블록 단위 인라인 편집, 소스 줄 번호 `rehypeSourceLines`)와 모드 전환(`PostEditor`)이다. 문법은 `markdown-syntax.md`: 콜아웃은 `:::note[제목]`(우리는 `> [!note]`), `:::center|right|indent{n}|fold{h}`, `::youtube`·`::post{slug}`·`::series{id}`·소셜 임베드, `:postlink[텍스트]{slug}`.

**핵심 어려움**: ① 방언이 다르다. ② **Markdown이 원본이라 왕복이 손실 없어야 한다** — 에디터가 모르는 디렉티브가 저장 때 사라지면 안 된다(§6 원본 보존, P3에서 "P6 이후"로 미룬 `raw` 노드가 여기서 필요해진다). ③ 블로그 렌더링 파이프라인은 건드리지 않는다(독자 화면 위험 0).

| 단계 | 내용 | 끝났다고 볼 조건 |
|---|---|---|
| 6-0 | **측정**: 블로그 실제 글(DB의 `contentMd` 전부)을 `markdownToDoc`→`docToMarkdown`에 넣어 왕복 손실을 센다(읽기 전용 스크립트, 저장소 밖). 결과를 문법별 표로 | 손실 목록 확정 |
| 6-1 | **`raw` 보존 노드**(schema·core·markdown): 모르는 블록·인라인 문법(디렉티브 전체)을 원문 그대로 담는 노드. 편집기에서는 회색 상자로 원문 표시·소스 편집, 내보낼 때 한 글자도 안 바꾼다. 노트 앱은 `DOC_SCHEMA_VERSION`을 올리고 `raw`를 쓰지 않는 옵션(기본 끔)으로 유지 | 골든: 모르는 구문이 든 문서의 왕복이 바이트 동일 |
| 6-2 | **방언 어댑터**: `editor-markdown`에 방언 옵션(`dialect: "obsidian" | "blog"`) — 블로그 방언에서 `:::note|info|tip|warning|danger[제목]`↔콜아웃, `:::center|right`↔정렬, `:::indent{n}`, 이어 `::post`·`::series`·`::youtube`·`:postlink`는 구조화 노드 없이 **raw로 보존**(P7의 참조 노드 이후 승격 가능). 콜아웃 종류 매핑(note·info·tip·warning·danger ↔ 우리 5종) | 블로그 방언 골든 + 6-0의 손실 0 |
| 6-3 | **블로그 쪽 어댑터(블로그 저장소)**: `PostEditor`에 WYSIWYG 모드를 **추가**(기존 textarea 모드는 그대로 둔다 — 문제가 있으면 즉시 되돌림). 저장은 `docToMarkdown`(블로그 방언)→`contentMd`. 이미지 업로드는 core의 자산 포트에 블로그의 업로더를 연결. 패키지는 `file:`/pnpm 링크 또는 `pnpm pack` tarball로 설치(레지스트리는 P8) | 관리자에서 글을 열어 WYSIWYG로 고치고 저장했을 때 독자 화면이 같다 |
| 6-4 | **검증**: 블로그 글 전부를 열었다 저장해(저장 안 하는 건식 실행) 렌더 HTML이 바이트 동일한지 비교 + 사람이 글 몇 편 직접 편집 | 불일치 0 또는 설명된 것만 |
| 6-5 | **API 빈틈 기록**: 블로그 연결에서 막힌 곳(포트, 방언, CSS 충돌 — 블로그는 Tailwind typography `prose`를 쓴다, 다크 모드, SSR 경계, 번들 크기)을 이 문서에 표로 적고 패키지에 반영 | 빈틈 목록을 반영했다 |

위험: ① raw 노드가 에디터 안에서 어색하면 쓰기 불편하다 → 6-1에서 소스 편집 UI를 같이 만든다. ② 블로그가 Tailwind `prose`·다크 모드를 쓴다 → `md-editor` 스타일이 `prose`와 겹치지 않게 `not-prose`나 격리 필요(5-7의 `@layer base` 초기화가 도움). ③ 블로그 Node 24·Next 16 환경 차이 → `check:dist`의 소비자 시험을 블로그 모양(Next 빌드)으로 한 번 더 돌린다. ④ 블로그 저장소는 따로 있다(`~/blog`) → 6-3은 그 저장소에 별도 커밋이며, 이 저장소의 `examples/next-blog`는 읽기 전용 샘플로 둔다.

하지 않는 것: 블로그 독자용 렌더링 파이프라인 교체(P9에서 판단), 캘린더 WebView(P6b), 레지스트리 배포(P8), 새 구조화 노드(`::post` 등 승격은 P7 참조 노드와 함께).

**6-0 실제 글 결과** (2026-10-23, 사용자가 읽기 전용으로 덤프한 글 7편; 비공개 글 포함 여부와 무관하게 원문은 저장소에 두지 않았다): 왕복 후 바이트가 같은 글은 **0편**이고, 두 번째 왕복은 7편 모두 안정(멱등)이다. 쓰인 방언: `:::indent` 13, `:::fold` 4, `:::center`·`:::info`·`:::note` 각 1, `:postlink[]` 1, `$$` 1 — `::youtube` 등 임베드는 쓰이지 않았다. 컨테이너 `:::` 줄은 37줄 중 7줄이 바뀌고(`:::indent{n=1}`·`:::center`·`:::note[제목]`), `:postlink[]{…}`와 `$$` 블록은 개수가 바뀐 글이 각 1편, 표는 9줄 중 1줄(구분줄 `| :--- |`)이 바뀐다. 나머지 일반 줄은 188줄 중 19줄이 바뀐다(강제 줄바꿈·이스케이프 등; 6-1에서 종류별로 본다). 결론: 방언 어댑터(6-2)가 필수이고, 현재 글 수가 적으니 6-4 전수 시험이 쉽다.
**6-1 결과** (2026-10-23): 에디터가 모르는 디렉티브를 원문 그대로 담는 노드가 생겼다. ① `editor-markdown`: `rawDirectives` 가져오기 옵션(기본 끔)이 한 줄짜리 `::이름{…}`·컨테이너 `:::이름 … :::`(중첩 짝 세기, 코드 울타리 건너뜀)를 `raw` 블록으로, 글 중간 `:이름[글]{속성}`을 `rawInline`으로 만들고(`rawDirectives.ts`; 파서가 망가뜨리기 전에 자리표시자로 떼어 둔다), 내보내기는 두 노드의 원문을 그대로 쓴다. 규칙은 `docs/MARKDOWN-DIALECT.md`의 "모르는 디렉티브". ② `editor-core`: `Raw`·`RawInline` 확장(`raw/Raw.ts`)을 `createCoreExtensions({ raw: true })`로 켠다(기본 끔; 붙여넣기 변환도 같이 켜진다). 화면은 React 없이 DOM으로 그린다 — 회색 점선 상자 안의 `textarea`에서 원문을 그 자리에서 고치고(입력이 400ms 멈추거나 칸을 벗어나면 본문에 반영), 글 중간 것은 더블클릭하면 입력칸으로 바뀐다. 화면 글은 사전(`raw`)에, 스타일은 `editor.css`의 `.md-raw*`에 있다. ③ **노트 앱은 켜지 않으므로 본문 스키마 버전을 올리지 않았다**(계획에는 "올린다"고 적었으나 노드가 앱 스키마에 들어가지 않는다 — 앱이 켜기로 하는 날 `DOC_SCHEMA_VERSION`·`SUPPORTED_DOC_SCHEMA`를 함께 올린다. 앱 스키마 골든이 바뀌지 않은 것이 확인이다). 검증: 단위 시험 1706개(새 20개: 구간 찾기·왕복 바이트 동일·멱등·코드/시각/URL 오탐 없음·옵션 끔·core 마운트·칸 편집·원격 변경 반영·붙여넣기), 실제 Chromium 동작 시험 21개(새 2개: 칸에 입력→본문 반영→Ctrl+Z 복원(Yjs 경로), 글 중간 더블클릭 편집; 데모 `?raw=1`), 계산된 스타일·스크린샷 기준은 그대로(Tailwind 있는 페이지·없는 페이지 모두), `check:dist` 통과. **실제 글 7편으로 다시 잰 결과**: 컨테이너 `:::` 줄은 37줄 중 바뀐 것이 7 → **0**, `:postlink[]`는 바뀐 글 1 → **0**. 남은 차이는 일반 줄 188줄 중 6줄(예: 한 개짜리 `~취소선~`이 `~~…~~`로 정규화), 한 줄 수식 `$$y=Wx+b$$`가 `$$` 세 줄 블록으로 바뀜, 표 구분줄의 정렬 표시(`:---`)가 `---`로 사라짐 — 모두 디렉티브가 아니라 일반 Markdown 정규화이므로 6-2(블로그 방언)에서 다룬다. 남은 한계: 목록·인용 안의 블록 디렉티브는 찾지 않는다, `rawInline`의 서식은 보존되지 않는다. 6-2에서 알려진 컨테이너(`note` 등)를 구조화 노드로 올리면 그만큼 `raw`가 줄어든다.
**6-2 결과** (2026-10-23): `editor-markdown`에 방언 옵션을 더했다 — 가져오기 `ImportContext.dialect`, 내보내기 `MarkdownOptions.dialect`(`"obsidian"` 기본 | `"blog"`). 규칙표는 `docs/MARKDOWN-DIALECT.md`의 "블로그 방언". 핵심: ① 이름만 있는 `:::note|info|tip|warning|danger`는 콜아웃(5종 일대일: info↔important, danger↔caution), `:::center|right`는 안쪽 블록의 정렬(내보낼 때 이어지는 같은 정렬을 한 컨테이너로 묶음), 나머지 컨테이너(`[제목]`·`indent`·`fold`·속성)는 **새 `directive` 노드**(core, `raw: true`로 켬): 여는 줄 원문을 입력칸으로 보이고 **안쪽은 평소처럼 편집**한다 — 컨테이너를 통째 `raw`로 두면 안쪽을 못 고쳐서 만들었다. 짝은 "가장 최근에 연 것부터"(블로그 `normalizeContainerFences`와 같음)이고 여닫는 줄을 줄 단위 자리표시자로 바꿔 기존 `<div>`/`<details>` 프레임과 같은 방식으로 구조를 만든다. ② 한 줄짜리·글 중간 디렉티브, 한 줄 `$$…$$`, 열 정렬 있는 표, HTML 블록은 `raw`. ③ **문단 안의 줄바꿈 한 개는 글자 속 `\n`**(블로그는 remark-breaks 없이 공백으로 그린다 — 예전 변환은 이것을 하드 브레이크로 바꿔 줄마다 `\`를 붙였다). ④ 블로그에 없는 문법(위키 링크·`^id`·`> [!NOTE]`·이미지 `|너비`)은 읽지 않고 글자로 둔다; 블로그에 없는 서식(토글·양쪽 정렬·밑줄·이미지 크기)은 풀어서 내보내고 안내한다. **실제 글 7편 검증**(블로그의 `normalizeContainerFences`와 같은 `unified`+`remark-gfm/directive/math` 파서를 저장소 밖에서 돌려, 원문과 왕복 결과의 mdast를 위치 정보 없이 비교): **7편 모두 구문 트리가 같다.** 바이트는 다르다(빈 줄 간격, `~x~`→`~~x~~`, `~`→`\~`, 끝 줄바꿈) — 모두 렌더가 같은 정규화다. 시험: 단위 1706→새 블로그 방언 18개·core 2개(directive 여는 줄 편집·잘못된 입력 되돌림), 실제 Chromium 동작 시험 +1(directive: 여는 줄 고치기·안쪽 글 입력). 한계: 블로그 렌더 HTML 자체(shiki·섹션 감싸기)는 6-4에서 블로그 파이프라인으로 비교한다; `center` 두 구간이 이어서 있으면 하나로 합쳐진다(렌더 같음); `directive` 안에 `directive`가 중첩된 문서를 에디터에서 만들 방법(슬래시 항목)은 6-3에서 정한다.
**6-3·6-4 결과** (2026-10-23): 블로그 관리자 편집기에 **시각(WYSIWYG) 모드**를 더했다. **`~/blog`는 운영 서버의 배포 체크아웃이라 건드리지 않고**, 복제본 `~/blog-wysiwyg`(브랜치 `feature/wysiwyg-editor`, 커밋 1개 `779ba93`, **서명 없는 커밋** — SSH 서명은 이 서버에서 안 되므로 필요하면 `git rebase --exec 'git commit --amend -S --no-edit' 921b8bb`)에 만들었다. 푸시는 하지 않았다(`origin`은 GitHub 원격으로 바꿔 둠). 구성: ① `components/admin/wysiwyg-editor.tsx` — `createReactExtensions(null, { raw: true, markdown: { dialect: "blog" }, … })`; 열 때 `markdownToDoc`, 고치면 250ms 뒤 `docToMarkdown(dialect: "blog")`을 `onContentChange`로 내보낸다. **연 직후의 마크다운과 같으면 내보내지 않는다**(에디터가 스스로 일으키는 변경—블록 id 부여 등—이 본문을 바꾸지 않게). 이미지·토글 확장은 `transform`으로 뺐고(이미지는 업로드 버튼의 마크다운이 원문 상자로 들어가 그림으로 보임), `/` 메뉴에서 이미지·토글·양쪽 정렬을 빼고 블로그 항목(유튜브·포스트/시리즈 카드·포스트 링크·들여쓰기·접기)을 더했다. 에디터 번들은 `next/dynamic`(ssr 끔)으로 시각 모드를 열 때만 불러오고, 어두운 테마에서도 흰 종이 위에 둔다(`not-prose`). ② `PostEditor`에 모드 `wysiwyg`("시각")를 **추가**했다 — 기본은 그대로 "통합"이고 기존 세 모드의 코드는 바뀌지 않았다. 이미지 업로드는 에디터 핸들(`insertMarkdown`)로 커서 위치에 끼운다. ③ 패키지는 `vendor/*.tgz` + `package.json`의 `overrides`(패키지끼리의 의존도 같은 tarball로)로 설치하고, **Dockerfile deps 단계에 `COPY vendor ./vendor`를 더했다**(안 그러면 `npm ci`가 깨진다). 검증: 복제본에서 `npm ci`·`tsc`·테스트 120개·lint(오류 0)·`next build` 통과. **실제 글 7편 — 블로그 자신의 `renderPostHtml`로 원문과 에디터 왕복 결과의 HTML을 비교하니 7편 모두 바이트 단위로 같다**(저장소 밖 임시 시험). 또 실제 Chromium(Playwright)에서 복제본의 시험 페이지로 7편을 열어 첫 문단에 `ZZ`를 쳐서 나온 마크다운을 블로그 파서의 구문 트리로 비교: 7편 모두 `ZZ`만 다르다; 열기만 한 상태에서는 본문이 바뀌지 않는다(7편). 이 과정에서 잡힌 문제: **글자 속 `\n`은 에디터가 근처를 고칠 때 하드 브레이크로 바뀐다**(ProseMirror가 DOM을 다시 읽음 — 7편 중 2편이 `\`가 붙었다) → 문단 안 줄바꿈 한 개를 전용 노드 `softBreak`(공백으로 보임)로 바꿨다. 아직 사람이 안 한 것: 실제 관리자 화면(DB·로그인 필요)에서의 사용감과 글꼴·다크 모드 모양, 운영 배포(Docker 빌드는 이 서버에서 돌려 보지 않았다).

**6-5 API 빈틈 기록** (블로그 연결에서 막히거나 우회한 곳):

| 빈틈 | 지금 처리 | 패키지에 반영할 것 |
|---|---|---|
| 이미지: 코어 이미지 노드는 저장소 해시 전제(앱) | 블로그 이미지를 `rawInline`(원문)으로 두고 그림으로 보임; 이미지 확장은 `transform`으로 제거 | URL 이미지 노드(`src`) 또는 포트로 업로드 연결 — 노드를 더하면 스키마 버전 영향(P7과 함께 판단) |
| 소비자가 쓰지 않을 확장을 끄기 | `transform`으로 이름 필터 | `createCoreExtensions`에 `disable: ["image","toggle"]` 같은 옵션 |
| 소비자별 `/` 메뉴 | `slashItems`·`slashHandlers`로 충분했다(항목 뺌·더함) | 없음(잘 맞음) |
| 다크 모드 | 스타일이 밝은 배경 기준(하드코딩 색) → 흰 종이로 가림 | **P7-5에서 해결**: CSS 변수 토큰 + `dark.css`(블로그는 흰 종이를 걷어도 된다) |
| typography(`prose`)와의 충돌 | `not-prose` 래퍼 | 문서화(`styles/README`) |
| 한 줄 수식·열 정렬 표·HTML 등 에디터에 대응 노드가 없는 문법 | `raw` 보존(편집은 원문 칸) | 열 정렬 표 속성·한 줄 수식은 P7에서 승격 검토 |
| 문단 안 줄바꿈 | `softBreak` 노드(블로그 방언) | 이미 반영 |
| 소비자 설치 | tarball + `overrides`, Dockerfile `COPY vendor` | P8 레지스트리 배포로 해소 |
| 읽기 전용 렌더러(`editor-render`)는 `raw`·`directive`·`softBreak`를 모름 | 블로그는 자기 파이프라인으로 그린다 | **P7-3에서 해결**: 네 노드(+`reference`) 지원, `renderRaw`·`renderReference` 주입 |
| 포스트·시리즈 카드 등 임베드의 미리보기 | 회색 원문 상자만 | 소비자 주입 뷰(`views`에 `raw` 렌더러)로 카드 미리보기 |
**7-1~7-5 결과** (2026-10-23, P7a): ① **참조 노드** — `editor-schema/reference`(kind·id 정규화), core `Reference` 노드(속성 `{kind,id}`만 저장, `createCoreExtensions({ reference: true })`로 켬·기본 끔 → 노트 앱 스키마 버전 불변), 포트 `EditorPorts.references[kind]: ReferenceResolver`(`resolve`→제목·설명·미리 보기 데이터 또는 null=삭제됨, `open`, `subscribe`, DOM 접점 `renderPreview`), 기본 DOM 카드(상태 `loading/ready/missing/unresolved/unknown`, 누르면 열기, 원본이 바뀌면 다시 읽음), 명령 `insertReference`, 글 사전 `reference`. ② **Markdown 훅** — 기본 표기 `::ref{kind=… id=…}`, 가져오기 `ImportContext.references`(true | 한 줄을 받는 함수), 내보내기 `MarkdownOptions.references.toMarkdown(kind,id)`(문자열 | `null`=생략+안내 | `undefined`=기본 표기), 블로그 방언·코드 울타리·잘못된 속성 처리. ③ **읽기 전용 렌더러** — `reference`(소비자 주입 `renderReference`, 없으면 종류·id 대체 표시, `null`이면 그리지 않음), `raw`·`rawInline`(`renderRaw` 또는 원문 표시), `directive`(안쪽 렌더 + `data-head`), `softBreak`; `renderMarkdown`에 `dialect`·`references` 옵션. ④ **데모의 가짜 PlanBench 종류 `table-schema`**(`?ref=1`) — 해석기·미리 보기 표·열기·원본 변경 추적·삭제됨을 실제 Chromium 동작 시험으로 확인(코어는 스키마 모양을 모름). ⑤ **다크 모드** — `editor.css`·`ui.css`의 모든 색이 `var(--md-c-<값>, <밝은 값>)`(54개 토큰; 마메이드 크게 보기는 어두운 모드에서도 같아 제외)이고 `styles/dark.css`가 `[data-md-theme="dark"]`·`.dark` 아래에서 어두운 값을 준다(메뉴·편집 창은 body에 뜨므로 `<html>`에 단다). `scripts/check-css-tokens.mjs`(`check:deps`)가 날것의 색·누락된 다크 값·이름 불일치를 막는다. **밝은 모드는 그대로**: 계산된 스타일 기준(Tailwind 있는/없는 페이지)이 같고 스크린샷 13장이 P5 시작 전과 픽셀 단위로 동일. 다크는 스크린샷을 눈으로 확인했고(`visual --dark --screenshots <이름>`) 동작 시험이 색 전환·복귀를 확인한다. 배운 점: ⓐ **구독 알림 안에서 다시 구독하면 `Set.forEach`가 끝나지 않는다**(실제 Chromium 시험이 영원히 멈춰서 발견; 구독은 대상이 바뀔 때만, 알림은 읽기만) — 회귀 시험 추가. ⓑ **`pnpm test`가 `packages/**/*.test.tsx`를 안 돌리고 있었다** — 설정을 고쳐 렌더 시험(.tsx)이 CI에서 돌게 했다(1728→1752개). ⓒ `color-mix()` 안의 색을 변수로 바꾸면 계산값에 1e-5 오차가 나 기준이 깨진다 — 마메이드 크게 보기를 토큰에서 뺀 이유 중 하나. 남은 것(P7b): 실제 PlanBench 저장소에서 문서 범위 에디터 도입, `table-schema` 해석기 등록, 노트 앱의 `pageLink`/`pageBlock`을 참조 노드로 이전할지 판단(저장 스키마·마이그레이션이 필요해 보류), 이미지 노드의 URL 대응, 열 정렬 표·한 줄 수식의 구조 노드 승격.

**P6b 결과** (2026-10-23): `packages/editor-embed`(비공개 앱 번들)와 `docs/EDITOR-EMBED.md`(규약 명세·Flutter 연결 초안)를 만들었다. ① `editor-markdown`에 `hardBreakStyle: "newline"`(일반 글의 줄바꿈 한 개를 백슬래시 없이 되돌림). ② **메시지 규약 v1**: 호스트→에디터 `init`·`setMarkdown`·`setTheme`·`setReadOnly`·`focus`·`insertMarkdown`, 에디터→호스트 `ready`·`change`(250ms 디바운스, 포커스를 잃으면 즉시, 열기만 하면 안 보냄)·`height`·`openLink`·`focus`/`blur`·`error`. 전송은 환경에서 자동 감지(`flutter_inappwebview` → JavaScriptChannel `EditorHost` → WebView2 → iframe 부모)하고 받는 길은 `message` 이벤트와 전역 `__editorHostReceive`. 모르는 필드·메시지는 무시. `/` 메뉴는 `features`로 줄인다(기본: 제목 1~3·목록·할 일·인용·코드·구분선). ③ 시험: 단위 15개(규약·전송·기능 목록) + **실제 Chromium에서 iframe 호스트 흉내 페이지로 15개 시나리오**(ready/init, 열기만 하면 change 없음, 입력→change·rev, setMarkdown, 테마, background·autoHeight, 읽기 전용 링크, Ctrl+클릭, 메뉴 제한, features, insertMarkdown, focus/blur와 마지막 입력 즉시 전송, init 재전송·객체·전역 함수·모르는 메시지, 폭 360px 메뉴, mermaid 제외, 문법처럼 보이는 일반 글을 열기만 함); CI `browser` 작업에 추가. ④ **번들 크기**: mermaid를 `resolve.alias`로 대용품으로 바꿔 기본으로 뺐다(8.7MB → 3.3MB, 진입 JS 1.05MB·gzip 330KB; 일정 설명에 다이어그램을 안 쓴다고 본 결정 — `EMBED_MERMAID=1`로 켬). **Flutter SDK가 이 서버에 없어서 Dart 연결은 만들지도 검증하지도 못했다**(`~/todo`는 운영 컨테이너 체크아웃이라 건드리지 않음) — 명세와 검증 안 된 초안만 문서에 있다. 남은 것: 실기기 WebView 왕복, 모바일 한글 IME·가상 키보드, 모바일 터치로 편집 중 링크 열기, KaTeX 글꼴·코드 언어 조각 줄이기, Flutter 웹 iframe 확인.

**P8 결과** (2026-10-23, **게시는 하지 않았다**): 사용자가 레지스트리를 **GitHub Packages**로 골라서 ① **scope를 `@9um4` → `@9um4-utils`로 바꿨다**(GitHub Packages는 scope가 저장소 소유자와 같아야 한다; import·스크립트·문서 일괄, 블로그 복제본도 따라감). ② **Changesets**: 패키지 5개를 한 버전으로 묶고(`fixed`) 앱·서버·데모·임베드는 제외, 첫 changeset이 0.1.0을 만든다; 루트 스크립트 `changeset`·`version-packages`·`release`. ③ 5개 매니페스트의 `private` 제거, `repository`·`publishConfig.registry`·`license: UNLICENSED`(공개 범위를 아직 안 정함), 패키지별 README(설치 안내). ④ **저장 호환 가드**: `schemaCompat.test.ts`가 옵션을 전부 켠 스키마(노드 28·마크 6)를 `schema-snapshot.json`에 고정하고, 사라지거나 바뀐 것은 "major", 더해진 것은 "minor + 스냅샷 갱신"으로 알려 준다; Markdown은 기존 골든이 가드. ⑤ **호환 규칙·설치·점검표·리허설**을 `docs/RELEASING.md`에 적었다. ⑥ **수동 배포 워크플로**(`release.yml`, `workflow_dispatch`만; changesets/action이 "버전 올리기" PR → 합친 뒤 게시). **리허설**: 로컬 Verdaccio에 `changeset version`으로 0.1.0을 만들어 다섯 패키지를 실제로 게시하고(게시된 매니페스트에서 `workspace:*`가 `0.1.0`으로 치환됨), 새 프로젝트에서 설치해 Node에서 렌더·변환이 돌고 타입 검사가 통과함을 확인한 뒤 저장소를 되돌렸다. `pnpm publish --dry-run`도 통과. 이 과정에서 P7-4가 데모 타입 오류를 만들었던 것(CI "데모 타입 검사"가 잡았을 것)도 찾아 고쳤다. **사람이 할 것**: 라이선스 결정(지금 UNLICENSED), 첫 게시 때 Actions에서 release 실행·"버전 올리기" PR 합치기, GitHub Packages 읽기 토큰 만들기(소비자용), 블로그를 레지스트리로 옮길지(Docker 빌드 시크릿 필요).

**P9 결과** (2026-10-23): **분리 판단: 지금은 떼지 않는다**([EDITOR-SPLIT.md](EDITOR-SPLIT.md)). 근거: 안정된 소비자가 노트 앱 하나뿐이다(블로그는 시험·Docker 빌드까지 통과했지만 배포 전, 캘린더는 Flutter 연결 없음, PlanBench는 없음). **떼는 리허설**로 가능함을 확인했다 — 앱 없이 `packages/`·`examples/`·`scripts/`만으로 새 폴더를 만들어 시험 553개·타입 검사·`check:deps`·`check:dist`·Next.js 샘플·데모 Chromium 시험이 모두 통과. 이때 **앱 저장소에 기대던 곳 4곳**을 찾았고 둘을 이 저장소에서 고쳤다: ① `editor-react`가 `mermaid` devDependency를 선언하지 않았음(루트에 끌어올려져 우연히 동작), ② CSS 규칙 기준이 앱의 `src/index.css`를 섞어 담았음 → 기준을 묶음별(`app`·`packages`)로 나누고 원본이 없는 묶음은 건너뜀. 나머지 둘(소비자 타입 시험의 루트 의존, vite 타입 선언)은 떼는 날 할 일로 문서에 적었다. **블로그 Docker 빌드를 이 서버에서 돌려 봤다**(`blog-wysiwyg-rehearsal:tmp`, 통과 → 이미지 확인 후 삭제, 운영 컨테이너는 그대로): 6-3에서 "미확인"이던 항목이 해소됐다. 떼는 조건·떼는 날의 절차·블로그를 켜는 사람의 일 목록은 `docs/EDITOR-SPLIT.md`. 남은 것: PlanBench(P7b), Obsidian·Notion 실제 샘플(P3-6), 사람이 하는 화면 확인·첫 게시·블로그 배포.

미결: ⓐ 블로그 실제 글 데이터(DB)를 읽을 방법(로컬 덤프나 읽기 전용 접속) ⓑ WYSIWYG를 기본 모드로 삼을지 선택 모드로 둘지(권장: 선택 모드로 시작).

**6-0 중간 결과** (2026-10-23, 실제 글 측정은 데이터 대기 중): 측정 도구(저장소 밖; 글 목록 JSON이나 `.md`를 받아 왕복하고 ① 구문별 개수 ② 원문 줄이 그대로 남았는지를 범주별로 센다)를 만들었다. 실제 블로그 DB(`blog-db-1` 컨테이너)를 읽는 시도는 권한 판정에서 막혀서 하지 않았다 — 데이터는 사용자가 덤프해 주기로 한다. 블로그 문법 한 벌을 담은 합성 글(`:::note[제목]`·`tip`·`center`·`indent{n}`·`fold{h}`, `::youtube`·`::post`·`::series`·`::video`, `:postlink[]{}`, `$$`, 할 일, 각주)로 먼저 잰 결과: **지금 변환기는 블로그 방언을 보존하지 못한다.** 컨테이너 `:::` 10줄 중 5줄이 바뀌고(여는 줄의 `[제목]`이 `\[제목\]`로 이스케이프되고, 안쪽 줄마다 끝에 `\`(강제 줄바꿈)가 붙는다 — 문단 안으로 들어가서), 인라인 `:postlink[…]{…}`은 대괄호가 이스케이프되며, `::video[URL]`은 자동 링크로 바뀐다. 한 줄짜리 `::youtube{…}`·`::post{…}`·`::series{…}`와 `$$`·할 일·각주는 그대로 남았다(우연히 텍스트 문단으로 통과한 것이라 속성 안에 특수문자가 있으면 깨질 수 있다). 6-1의 `raw` 노드와 6-2의 방언 어댑터가 필요하다는 근거다.

### P7 상세 계획 (2026-10-23 결정)

**PlanBench의 소스는 이 서버에 없다**(`~/`에 저장소가 없음). 그래서 P7을 둘로 나눈다: **P7a(지금) — PlanBench가 쓸 확장 지점을 패키지에 만든다**(§2의 일반 참조 노드, 읽기 전용 렌더러의 빈틈, 다크 모드 CSS 변수). 데모 앱에 PlanBench를 흉내 낸 `table-schema` 종류를 등록해서 확장 지점이 소비자 코드 없이 동작함을 보인다. **P7b — PlanBench 저장소가 생기면** 실제 도입(문서 범위 에디터, 표 스키마 미리 보기 등록, 시험 데이터 이전). 노트 앱의 `pageLink`/`pageBlock`을 참조 노드로 **이전하지는 않는다**(저장 스키마 변경·마이그레이션 위험이 크고 소비자가 노트 앱 하나일 때는 이득이 없다 — P7b에서 PlanBench와 함께 판단).

| 단계 | 내용 | 끝났다고 볼 조건 |
|---|---|---|
| 7-0 | 이 계획 | — |
| 7-1 | **`reference` 노드와 `ReferenceResolver` 포트**(schema 정규화·core 노드·포트·기본 DOM 뷰·글 사전). 속성 `{ kind, id }`만 저장. 해석기가 없거나 못 찾으면 "삭제됨/알 수 없음" 표시. `createCoreExtensions({ reference: true })`로 켠다(노트 앱은 끔 — 스키마 버전 불변) | 단위·마운트 시험 |
| 7-2 | **Markdown 훅**: 내보내기 `references.toMarkdown(kind, id)`, 가져오기 `references.parse(줄)`(기본 표기 `::ref{kind=… id=…}`), 블로그 방언에서도 구조 노드로 읽힘 | 골든 왕복(기본 표기·사용자 정의 표기·해석기 없음) |
| 7-3 | **읽기 전용 렌더러의 빈틈**: `reference`(소비자 주입 `renderReference` 또는 대체 표시), `raw`·`rawInline`·`directive`·`softBreak` | 렌더 시험 |
| 7-4 | **데모의 가짜 PlanBench 종류(`table-schema`)**: 해석기 등록(제목·미리 보기 표·열기·삭제됨), 실제 Chromium 동작 시험 | 동작 시험 통과 |
| 7-5 | **다크 모드**: `editor.css`·`ui.css`의 하드코딩 색을 CSS 변수(기본값은 지금 색)로, `data-theme="dark"`용 값 파일 | 계산된 스타일 기준 불변 + 다크 스크린샷 시험 |
| 7-6 | 문서·6-5 빈틈 표 갱신, `check:dist`·CI | 전부 통과 |

### P6b 상세 계획 (2026-10-23 결정): 캘린더(LunarTask, Flutter)에 Markdown 에디터 넣기

사실: 캘린더(`~/todo`)는 **Flutter 앱**이고(Windows·Android·웹), 일정·할 일의 `description`(문자열)에 Markdown 편집기가 아직 없다. **이 서버에는 Flutter SDK가 없어서 Dart 코드는 빌드·실행할 수 없다**(`~/todo`는 운영 컨테이너 `lunartask-*`의 체크아웃이기도 해서 건드리지 않는다 — 블로그와 같은 규칙). 그래서 **웹 쪽(번들·메시지 규약·시험)을 완성하고 Flutter 연결은 명세와 검증되지 않은 예시로 남긴다**.

결정: ① **React 에디터를 WebView에 올린다**(Flutter에 같은 편집기를 다시 만들지 않는다 — 통일이 이 프로젝트의 목적). ② 번들은 새 워크스페이스 패키지 `packages/editor-embed`(비공개, 앱 번들)가 만든다: Vite 정적 빌드(`index.html` + 에셋, 상대 경로라 `file://`·로컬 에셋 서버·iframe 어디서나 연다). ③ **호스트와의 대화는 버전이 붙은 JSON 메시지 규약**이다(전송 수단은 자동 감지: `flutter_inappwebview` 핸들러, `webview_flutter`의 JavaScriptChannel `EditorHost`, WebView2 `chrome.webview`, 부모 창 `postMessage`(Flutter 웹의 iframe)). ④ 저장 형식은 **Markdown 문자열 그대로**(`description`) — 기존 일반 글 설명은 **열기만 해서는 바뀌지 않는다**(블로그 시각 모드와 같은 규칙: 연 직후의 변환 결과와 같으면 `change`를 보내지 않는다). ⑤ 일반 글의 줄바꿈 한 개는 눈에 보이는 줄바꿈이므로 내보낼 때 `\`가 아니라 그냥 줄바꿈으로 쓴다(`MarkdownOptions.hardBreakStyle: "newline"`).

| 단계 | 내용 | 끝났다고 볼 조건 |
|---|---|---|
| 6b-0 | 이 계획 | — |
| 6b-1 | `editor-markdown`: `hardBreakStyle` 옵션(`"backslash"` 기본 \| `"newline"`) | 골든·왕복 시험 |
| 6b-2 | `packages/editor-embed`: 메시지 규약(`protocol.ts`: 검증·인코딩), 전송 어댑터 4종(`transport.ts`), 기능 제한 목록(`features.ts`: `/` 메뉴 허용 항목), 앱(`main.tsx`) | 단위 시험 |
| 6b-3 | 정적 번들 빌드와 **호스트 흉내 페이지**(iframe 부모)로 실제 Chromium 시험: `ready`→`init`→입력→`change`, 열기만 하면 `change` 없음, `setMarkdown`·`setTheme`·`readOnly`, `height` 자동 보고, 링크는 `openLink`로 호스트에 맡김, 키보드 포커스 이벤트 | 시험 통과, 번들 크기 기록 |
| 6b-4 | `docs/EDITOR-EMBED.md`: 규약 명세, Flutter 연결 지침(플랫폼별 WebView 플러그인·에셋 적재·키보드·IME·다크 모드), 검증되지 않은 Dart 예시, 호스트가 해야 할 사람 확인 목록 | 문서 |
| 6b-5 | 결과·빈틈 기록(번들 크기, 모바일 IME·가상 키보드는 미확인) | 기록 |

하지 않는 것: `~/todo` 수정, Flutter 위젯의 빌드·실행 검증(SDK 없음), 이미지 첨부(일정 설명에는 이미지가 없다고 보고 `/` 메뉴에서 뺀다), 모바일 실기기 시험.

## 9. 결정 기록과 미결 질문

### 해소된 것

| 질문 | 답 |
|---|---|
| PlanBench의 스키마·표 | 에디터는 **문서 범위**에서 쓰이고, 문서 안에서 **표 스키마 미리 보기**를 지원한다(PlanBench 전용 확장으로 추정). 정의는 에디터 밖 → §2의 참조 노드로 수용 |
| 블로그 렌더링 | **Next.js** → P4를 App Router 기준으로 설계 |
| Markdown 지원 범위 | §6의 ①~③은 P3, ④ 소스 보기는 미룸 (사용자가 제안을 받아들임) |
| Notion 호환 | **가져오기(이전)만** |
| scope | **`@9um4-utils`로 확정**(§7, P8에서 `@9um4`에서 바뀜). 레지스트리 GitHub Packages |
| 표 스키마 미리 보기 | PlanBench 전용 확장으로 확인됨(사용자). 코어에는 일반 참조 노드 확장 지점만 둔다(§2) |

### 아직 남은 것

1. **표 스키마 미리 보기가 PlanBench 전용 확장인지** 확인이 필요하다(사용자의 추정). 확인할 것: ① 문서 안에 `id`만 저장하고 보여 줄 때 PlanBench가 내용을 읽어 그리는가(→ 참조 노드로 충분), 아니면 문서 안에 스키마 내용을 복사해 저장하는가(→ 별도 노드 필요). ② 이 노드가 Markdown으로 내보내질 때의 모습(예: `![[schema:이름]]`, 펜스 블록)과, 블로그에서 어떻게 보여야 하는가.
2. **블로그의 Markdown 처리 시점**: 빌드 때(SSG) 변환인가, 요청 때(SSR) 변환인가? 글 저장소(파일, DB, CMS)는 무엇인가? — P4의 캐시·성능 설계에 영향.
3. **Notion 샘플 내보내기** 파일(콜아웃·토글·표·이미지·데이터베이스가 든 페이지)을 받을 수 있는가 — 가져오기 변환기의 시험 자료.
4. **npm 이름 확인**(`@9um4`나 조직 `9um4-utils`가 비어 있는지)과 공개 여부. 미정이어도 설계는 진행할 수 있다.
5. **Markdown이 원본인 소비자(블로그·캘린더)의 원본 보존 정책**: 에디터가 모르는 구문을 그대로 보존할지(§6). 보존한다고 가정하고 설계한다.

## 10. 위험

- 소비자가 하나뿐일 때 API를 미리 일반화하면 틀린 추상화가 된다 → 시범 소비자(P6)를 일찍 둔다.
- 에디터를 고칠 때마다 패키지를 배포하면 노트 앱 개발이 느려진다 → 워크스페이스 링크로 개발한다.
- 위키·동기화 결합(문서 계층)을 코어로 끌고 오면 다른 소비자가 쓸 수 없다 → 앱에 남긴다.
- 이 문서의 코드 사실은 소스 읽기와 `grep` 기반이다. 입력 규칙 동작, 모듈 전역 상태의 영향, 번들러 호환성은 실제로 실행해 보지 않았다.
