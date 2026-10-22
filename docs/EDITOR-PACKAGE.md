# 에디터 패키지 분리 설계 (초안)

이 앱의 에디터(`src/features/editor/`)를 여러 앱이 쓰는 패키지로 빼는 계획. 이 문서는 읽기 전용 조사(2026-10-22)와 결정을 모은 것이다. **P1·P2는 끝났다**(§8): `packages/editor-schema`와 `packages/editor-core`가 있고 앱이 그것을 쓴다.

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
| ① 입력 규칙 | 표준 Markdown과 확장 문법(콜아웃 `> [!NOTE]`, `<details>`, 각주 `[^1]`, 표 `\|a\|b\|`)을 **타이핑하는 중에** 변환 | P3 |
| ② 붙여넣기 변환 | Markdown 텍스트를 붙여넣으면 서식으로 변환(되돌리기 한 번에 원문으로 복귀, 일반 텍스트로 붙여넣기 단축키는 그대로 둠) | P3 |
| ③ 복사 시 Markdown | 클립보드의 `text/plain`을 Markdown으로 채워, 다른 편집기(Obsidian 등)에 붙여도 문법이 유지되게 한다 | P3 |
| ④ 소스 보기 | Markdown 원문 편집 모드. **나중으로 미룬다** | P5 이후 |

소스 보기를 미루는 이유: 노트 앱은 원본이 Yjs라서 Markdown이 손실 있는 파생물이고, 모드를 오가면 블록 id·동기화 블록 같은 정보를 잃는다. 반면 블로그·캘린더처럼 **Markdown이 원본인 소비자**는 소스 보기가 오히려 필요하다. 그 소비자에게는 **원본 보존 정책**(에디터가 모르는 구문, 예를 들어 raw HTML이나 알 수 없는 펜스를 `raw` 노드로 그대로 보존해 편집하지 않아도 파일이 바뀌지 않게 함)이 먼저다. 이 정책이 서야 소스 보기를 안전하게 얹을 수 있다.

### Notion은 가져오기만

Notion에서 이전하는 용도만 지원한다. Notion의 Markdown 내보내기를 읽는 가져오기 변환기(`markdownImport` 확장)가 대상이고, Notion 방언으로 쓰는 내보내기는 만들지 않는다. 변환기의 정확도는 **실제 Notion 내보내기 파일**로 만든 고정 시험 자료에 달려 있으므로, 샘플 내보내기(zip)가 필요하다. 이 시험 자료 없이는 Notion이 콜아웃·토글·데이터베이스를 어떻게 내보내는지 추측일 뿐이다.

### 제안하는 방언

Obsidian 호환 Markdown의 상위 집합을 공식 방언으로 한다. 콜아웃은 `> [!TYPE]`, 접히는 콜아웃은 `> [!TYPE]-`, 위키 링크는 `[[…]]`, 블록 id는 줄 끝 `^id`(옵션으로 보존), 토글은 `<details>`. Notion은 가져오기에서 콜아웃·토글을 완전히 보존하지 못하는 것으로 알고 있으나 **최신 동작은 확인하지 않았다** — 실제 Notion 내보내기·가져오기 파일로 검증해야 한다.

## 7. 이름 제안

- **결정(2026-10-22): scope는 `@9um4`.** 아래는 결정 전 비교다. 공개 npm으로 올린다면 npm 사용자 이름 `9um4`가 비어 있는지 계정으로 확인해야 하고, GitHub Packages로 올린다면 저장소를 `9um4` 소유로 옮겨야 한다(P8). 그 전까지는 워크스페이스 링크(`workspace:*`)로만 쓰므로 영향이 없다.
- **scope 후보 두 개** (사용자가 `@9um4`를 제안함). GitHub의 사용자 `9um4`와 조직 `9um4-utils`는 **둘 다 존재한다**(확인함). npm 쪽 이름이 비어 있는지는 **확인하지 못했다**(레지스트리 검색 API는 scope 필터를 무시하고, npmjs.com은 봇을 막는다) — npm 계정으로 직접 확인해야 한다.

  | | `@9um4` | `@9um4-utils` |
  |---|---|---|
  | 공개 npm(npmjs.com) | npm 사용자 이름 `9um4`가 내 것이면 가능(사용자 scope가 자동으로 생긴다) | npm 조직 `9um4-utils`를 만들면 가능(공개 패키지는 무료) |
  | GitHub Packages | 저장소 소유자가 `9um4`여야 한다 → **지금 저장소(`9um4-utils/mine`)로는 불가**, 옮겨야 함 | **가능** (저장소 소유자와 같음) |
  | 비공개 | npm 유료 플랜 필요 | GitHub Packages로 가능 |
  | 길이 | 짧음 | 김 |

  **추천: `@9um4-utils`.** 공개 여부가 미정인데, 이 이름만 두 레지스트리 모두에서 저장소를 옮기지 않고 쓸 수 있다. scope를 나중에 바꾸면 모든 소비자의 import가 바뀌므로 지금 정한다. 공개로 확정되고 짧은 이름이 중요하면 `@9um4`로 가는 것도 합리적이다(그때 npm 이름을 확인).
- **패키지 이름은 기능 이름으로**: `@9um4/editor-schema`, `editor-core`, `editor-markdown`, `editor-render`, `editor-react`. 앱 이름이 가칭("Notes")이라 이름에 넣지 않는다.
- **저장소**: 1단계는 이 저장소의 `packages/` 워크스페이스(`pnpm-workspace.yaml`에 추가)로 둔다. 소비자가 둘 이상 안정되면 `9um4-utils/editor`로 분리를 판단한다.

## 8. 단계 계획

| 단계 | 내용 | 끝났다고 볼 조건 |
|---|---|---|
| P0 | §9의 미결 질문을 해소하고 이름·방언을 확정한다 | 이 문서의 §9가 비어 있다 |
| P1 ✅ (dist 컴파일·Node 로드 시험 포함) | **경계 만들기**: `packages/`와 `editor-schema`로 순수 모듈 이동, 의존 방향 검사를 CI에 추가 | 기존 시험이 모두 통과하고, schema가 앱 코드를 import하지 않는다 |
| P2 ✅ | **core 포트화**: `createEditorExtensions(options)`, 자산·키값·알림 포트, Collaboration 선택화, 문자열 사전, `import.meta.glob` 제거 | core 폴더에 `lib/api`·`tree/store` import가 0개 |
| P3 | **markdown**: 방언 명세, 골든 왕복 시험, 붙여넣기 변환, 입력 규칙 빈틈 메우기, 실제 Notion·Obsidian 파일로 검증 | 골든 시험 통과, 알려진 손실 목록 확정 |
| P4 | **render**: Markdown→HTML 플러그인(unified: remark/rehype)과 JSON→React, 서버에서 KaTeX 문자열 렌더, mermaid는 클라이언트 컴포넌트. **Next.js App Router 기준**: 서버 컴포넌트에서 훅 없이 동작, 클라이언트가 필요한 부분(mermaid, 접히는 토글)만 `"use client"`, 컴파일된 JS와 타입을 `exports` 맵으로 배포(소스 TS 배포는 `transpilePackages` 부담을 소비자에게 넘긴다), CSS는 별도 export | Next.js 샘플 앱에서 블로그 글 한 편을 SSG로 끝까지 렌더 |
| P5 | **react**: 메뉴·NodeView·CSS 분리, 데모 페이지 | 노트 앱이 패키지만으로 같은 화면을 낸다 |
| P6 | **시범 소비자**: 캘린더 Markdown 부분에 도입하고 API 빈틈을 기록한다 | 빈틈 목록을 반영했다 |
| P7 | **PlanBench 도입**: 확장 지점으로 스키마·표 노드를 얹는다 | PlanBench 고유 기능이 그대로 동작한다 |
| P8 | **배포**: Changesets, 스키마 호환 semver 규칙, 레지스트리 결정 | 첫 버전을 소비자가 설치해 쓴다 |
| P9 | 블로그 도입, 소비자 2개 이상 안정 후 **별도 저장소 분리 판단** | — |

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
- `packages/editor-core`: 위키가 아닌 에디터 코드 75개 파일(확장·NodeView·슬래시·수식·각주·표·이미지·토글·코드 블록·포트·글 사전)과 `lib`의 `math`·`latexAssist`·`latexCommands`·`slashItems`. 공개 API는 `src/index.ts` 배럴 하나이고 앱은 `@9um4/editor-core`로만 가져온다.
- **포트**: `KeyValueStore`·`AssetStore`·`Notifier`·`UrlOpener`(Tauri opener를 직접 쓰던 `LinkOpener`를 바꿨다). 앱 구현은 `src/features/editor/appPorts.ts`. 상태는 포트 객체별(`WeakMap`)이라 에디터가 여럿이어도 섞이지 않는다.
- **주입 지점**: `createCoreExtensions(ydoc, { ports, strings, slashItems, slashHandlers, transform })`. 노트 앱의 `editorExtensions.ts`가 위키 확장을 **예전 자리 그대로** 끼운다. 스키마 골든이 노드·마크·확장 순서를 고정하고, P2 내내 한 글자도 바뀌지 않았다.
- **Yjs 선택화**: `ydoc`가 없으면 StarterKit의 history가 되돌리기를 맡는다.
- **`import.meta.glob` 제거**: `pnpm gen:languages`가 193개 언어의 명시적 지연 import 표를 만든다. 번들 구조(JS 290개, 언어 조각 해시)는 그대로다.
- **글 사전**: `strings/`의 ko(기본)·en. 슬래시 항목은 한국어·영어로 모두 검색된다. `pnpm check:deps`(`check-core-strings`)가 core의 한글 하드코딩을 막는다.
- 검증: 로컬 전체 시험 1507개, 새 클론에서 CI와 같은 순서(`install --frozen-lockfile` → 시험 → `check:deps` → `check:dist` → `build`) 통과.

**P2에서 확인하지 못했거나 남은 것**:
1. **화면에서 직접 확인하지 못했다.** 서버(Linux, 화면 없음)에서 Tauri 앱을 띄우지 못했다. React 컨텍스트(`EditorPortsProvider`)가 TipTap NodeView에 닿는지, 되돌리기/다시하기, 입력 동작은 사람이 [IME-CHECKLIST.md](IME-CHECKLIST.md)와 함께 확인해야 한다. 화면 없는 시험 환경에서는 일반 StarterKit도 되돌리기가 동작하지 않아 구조(설정값)만 시험했다.
2. **글 사전에 없는 한국어**: 위키 계층(페이지 링크·페이지 블록·위키 슬래시 항목 4개), LaTeX 명령 설명·검색어 표(`lib/latexCommands.ts`, 약 300개 항목), 개발자용 `console.warn` 문구. 슬래시 기본 항목의 한국어 글은 `lib/slashItems.ts`에 데이터로 남아 있고 영어가 사전으로 덮는다.
3. **core에 React 뷰가 들어 있다**(React는 peerDependency). P5에서 `editor-react`로 다시 나눈다. 그래서 `check:dist`(컴파일 후 Node 로드)는 아직 schema만 한다.
4. **CSS는 앱의 `src/index.css`에 남아 있다**(콜아웃·코드 블록·표 등). Tailwind 클래스는 `packages/`도 자동으로 스캔된다. 스타일 분리는 P5.
5. `lib/math.ts`가 `katex/dist/katex.min.css`를 JS에서 동적 import한다(§5 걸림돌 2). Next.js 서버 렌더링용 처리는 P4.

하지 않는 것: **일반 참조 노드는 P7(PlanBench)에서 만든다** — 새 노드는 저장 스키마·`DOC_SCHEMA_VERSION`을 바꾸고 기존 `pageLink`/`pageBlock` 이전이 필요한데, 소비자가 하나뿐인 지금 만들면 틀린 추상화가 될 수 있다(§10). P2의 2-6 주입 구조가 그 바탕이다. 저장·동기화·저널 코드(`usePageDoc`·`docSaver`·`openDocs` 등)는 앱에 남는다.

위험: IME·자동완성·슬래시 같은 입력 동작은 시험이 다 못 잡으므로 끝에 [IME-CHECKLIST.md](IME-CHECKLIST.md)를 사람이 확인한다. core의 React 뷰는 Tailwind 클래스를 쓰므로 앱 CSS가 `packages/`도 스캔하게 설정한다.

### P3 상세 계획 (2026-10-23 결정)

현황: 내보내기(`lib/markdown.ts`)와 가져오기(`lib/markdownImport.ts`)는 순수 함수이고 위키 연결(페이지 제목 찾기, 링크·이미지 해석)은 이미 옵션·컨텍스트로 주입된다 → 패키지로 옮기기 쉽다. 입력 규칙·붙여넣기 변환·복사 시 Markdown은 없다. 블록 링크(`[[제목#^id]]`)는 내보낼 때 페이지 링크로 바뀌고 가져올 때 위치를 버려 **Markdown 왕복에서 사라진다**.

결정: ① 전체 내보내기(Obsidian 금고)는 **모든 블록에 `^id`를 남긴다**(블록 링크가 Obsidian에서 동작하고 재가져오기에서 id가 보존된다. 대신 파일이 지저분해진다). ② 복사 시 Markdown은 core 옵션(`copyAsMarkdown`)으로 만들고 **노트 앱은 끈다**. ③ 실제 Obsidian·Notion 샘플은 나중에 받는다 — 그때까지는 공개 문법 문서 기반 시험 자료이고 "추정"이라고 적는다. ④ 원본 보존(`raw` 노드)은 새 노드라 저장 스키마·동기화에 영향을 주므로 소비자가 붙는 P6에서 다룬다.

| 단계 | 내용 | 확인 방법 |
|---|---|---|
| 3-0 | **방언 명세와 골든 틀**: `docs/MARKDOWN-DIALECT.md`(노드별 문법·읽기/쓰기 규칙·알려진 손실)와 `fixtures/` 골든(문서→Markdown, Markdown→문서, 왕복) | 골든이 현재 동작과 일치 |
| 3-1 | **`@9um4/editor-markdown` 패키지**: `markdown.ts`·`markdownImport.ts`(frontmatter 포함)와 시험을 옮긴다. 의존은 schema·`marked`만 | 기존 시험 그대로 통과 |
| 3-2 | **블록 id `^id` 입출력**: 내보내기 옵션 `blockIds`, 가져오기에서 `^id` 읽기, 블록 링크가 `[[제목#^id]]`로 살아남게 한다 | 왕복·블록 링크 시험 |
| 3-3 | **입력 규칙**: 있는 규칙(제목·목록·인용·코드 펜스·체크리스트·수식)을 시험으로 확인하고 콜아웃 `> [!NOTE]`를 추가한다 | 타이핑 시뮬레이션 시험 |
| 3-4 | **붙여넣기 변환**: Markdown 같은 텍스트를 붙이면 서식으로 변환, Ctrl+Z로 원문 복귀, Ctrl+Shift+V는 일반 텍스트 그대로. 위키 링크 해석은 앱이 주입 | 판별·변환 시험 |
| 3-5 | **복사 시 Markdown** 옵션(앱은 끔) | 직렬화 시험 |
| 3-6 | Obsidian·Notion **실제 파일 검증** | 샘플이 와야 가능(보류) |
| 3-7 | **알려진 손실 목록 확정**, 문서 갱신 | — |

## 9. 결정 기록과 미결 질문

### 해소된 것

| 질문 | 답 |
|---|---|
| PlanBench의 스키마·표 | 에디터는 **문서 범위**에서 쓰이고, 문서 안에서 **표 스키마 미리 보기**를 지원한다(PlanBench 전용 확장으로 추정). 정의는 에디터 밖 → §2의 참조 노드로 수용 |
| 블로그 렌더링 | **Next.js** → P4를 App Router 기준으로 설계 |
| Markdown 지원 범위 | §6의 ①~③은 P3, ④ 소스 보기는 미룸 (사용자가 제안을 받아들임) |
| Notion 호환 | **가져오기(이전)만** |
| scope | **`@9um4`로 확정**(§7). 공개 여부는 미정 |
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
