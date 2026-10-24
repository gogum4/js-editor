> **이 문서는 분리 전 노트 앱 저장소(`9um4-utils/mine`)에서 왔다.** 본문의 `src/`·`src-tauri/`·`server/`·`protocol/` 경로와 `CLAUDE.md` 언급은 그 저장소의 것이고, 이 저장소에는 `packages/`·`examples/`·`scripts/`가 있다. (`@9um4-utils`로 적힌 예전 scope는 `@9um4`다.)

# 에디터 패키지를 별도 저장소로 뗄까? (P9 판단)

**결론(2026-10-23): 지금은 떼지 않는다.** 떼는 것이 기술적으로 가능함은 리허설로 확인했고(아래), 떼는 비용을 낮추는 수정도 이 저장소에 해 두었다. 떼는 시점은 아래 "떼는 조건"이 갖춰질 때다.

## 소비자 현황 (계획의 기준: "소비자 2개 이상이 안정된 뒤")

| 소비자 | 연결 방식 | 상태 |
|---|---|---|
| 노트 앱(이 저장소) | 워크스페이스(`workspace:*`) | **안정**(사람이 확인할 화면 점검 일부 남음) |
| 블로그 시각 모드 | `~/blog-wysiwyg`(브랜치 `feature/wysiwyg-editor`)의 `vendor/*.tgz` | 만들었고 시험했다: 실제 글 7편 렌더 HTML 바이트 동일, `npm ci`·`tsc`·테스트·lint·`next build` 통과, **Docker 빌드도 이 서버에서 통과**(이미지에 에디터 CSS·청크 포함 확인 후 이미지는 지움). **아직 배포·푸시 안 함, 실제 관리자 화면 확인 안 함** |
| 캘린더(Flutter) | `editor-embed` 번들 + 메시지 규약 | 웹 쪽 완성·시험. **Flutter 연결은 없음**(SDK 없음) |
| PlanBench | — | 저장소가 이 서버에 없음(P7b) |

→ **안정된 소비자는 1개**다. 계획의 조건을 아직 채우지 못했다.

## 떼는 것이 가능한지: 리허설 (2026-10-23)

`git ls-files`로 `packages/`·`examples/`·`scripts/`·`.changeset/`·에디터 문서·루트 설정만 새 폴더에 복사하고(앱 `src/`·`src-tauri/`·`server/`·`protocol/` 없음) 루트 `package.json`·`pnpm-workspace.yaml`을 새로 만들어 돌렸다. 앱 없이 전부 통과했다: **시험 553개, 타입 검사, `check:deps`, `check:dist`(5개 패키지 배포 모양·소비자 타입·Node 로드), Next.js 샘플 앱 빌드·검사, 데모의 실제 Chromium 시각·동작 시험(계산된 스타일 기준 그대로)**.

이 과정에서 **앱 저장소에 기대고 있던 곳 네 군데**를 찾았다:

| # | 기대고 있던 곳 | 처리 |
|---|---|---|
| 1 | `editor-react`의 DOM 골든 시험이 루트에 끌어올려진 `mermaid`를 모의(mock)한다 — 패키지에 선언이 없었다 | ✅ `editor-react`의 `devDependencies`에 `mermaid`를 더했다(이 저장소에서 고침) |
| 2 | `scripts/check-css-rules.mjs`의 기준이 앱의 `src/index.css`를 포함한다 | ✅ 기준을 **묶음별**(`app`·`packages`)로 기록하고 원본이 없는 묶음은 건너뛰게 고쳤다 |
| 3 | `scripts/check-types-consumer.mjs`는 소비자 프로젝트를 저장소 안에 만들고 `@tiptap/*`·`yjs`·`react` 등을 **루트 `node_modules`에서** 찾는다 | 새 저장소의 루트 `devDependencies`에 그 의존성들을 둔다(떼는 날 할 일) |
| 4 | 루트 `tsconfig.json`이 `vite/client` 타입(`import.meta.glob`·CSS import 선언)을 앱의 `src/vite-env.d.ts`에서 얻는다 | 새 저장소에 `packages/vite-env.d.ts`(`/// <reference types="vite/client" />`)와 루트 `vite` devDependency(떼는 날 할 일) |

## 떼면 무엇을 얻고 잃나

- **얻는 것**: 패키지 릴리스 주기를 앱과 분리, 앱 저장소의 CI(Windows 러너 Rust 빌드 포함, 약 10분)와 무관한 빠른 CI, 다른 소비자(블로그·캘린더·PlanBench)가 앱 저장소를 몰라도 되는 구조.
- **잃는 것**: ① **앱과 패키지를 한 커밋에서 같이 고치는 안전장치** — 지금은 에디터를 고치면 앱의 시험 1,200여 개(편집기 통합·동기화·저널)가 같은 커밋에서 돌지만, 떼면 패키지를 먼저 게시하고 앱이 새 버전을 받아야 한다(토큰·게시 대기). ② 앱의 `docs/MVP*.md`와 얽힌 설명(`CLAUDE.md`의 에디터 규칙들)을 나눠야 한다. ③ 히스토리: `git subtree split --prefix=packages`로 `packages/`의 이력은 가져갈 수 있지만 P1(2026-10-22) 이전의 에디터 이력은 앱 `src/`에 있다.
- **떼도 달라지지 않는 것**: 패키지 이름·버전 규칙·배포 워크플로(이미 저장소 소유자 scope `@9um4`로 맞췄다) — 이 준비는 저장소를 옮겨도 그대로 쓴다.

## 떼는 조건 (이 중 둘 이상이 되면 다시 판단)

1. 안정된 소비자가 **둘 이상**이다(블로그가 운영에 배포되어 레지스트리 설치로 돌고 있다 + 캘린더 임베드가 실기기에서 돈다).
2. 앱 저장소의 변경 없이 **패키지만 자주 고치는** 날이 많아져서 앱 CI(약 10분)가 병목이다.
3. 다른 소비자가 **미게시 패키지 변경**을 기다리느라 막히는 일이 반복된다(지금은 tarball로 우회한다).
4. 앱과 다른 주기·권한으로 협업하는 사람이 생긴다.

## 떼는 날의 절차 (초안)

1. 선행: 이 저장소의 첫 게시(`docs/RELEASING.md`)가 끝나 있고 노트 앱이 `workspace:*` 대신 레지스트리 버전으로 돌 수 있음을 앱에서 시험한다(토큰·CI 비밀 준비).
2. `git subtree split --prefix=packages -b split/packages`로 이력을 뽑거나, 이 리허설처럼 파일만 복사한다. 새 저장소 `9um4-utils/editor`에: `packages/`·`examples/`·`scripts/`(앱 전용 `sync-version.mjs` 제외)·`.changeset/`·`docs/EDITOR-*.md`·`docs/RELEASING.md`·`docs/MARKDOWN-DIALECT.md`·워크플로(`app.yml`의 frontend 중 에디터 관련 단계와 `packages`·`browser` 작업, `release.yml`).
3. 표의 3·4번을 적용하고 `pnpm install && pnpm test && pnpm check:deps && pnpm check:dist`와 데모 시험이 통과하는지 확인한다.
4. 앱: 의존을 `workspace:*`에서 `^0.x`로 바꾸고 `.npmrc`(GitHub Packages) 추가, 앱 저장소에서 `packages/`·`examples/`·에디터 전용 스크립트 제거, CLAUDE.md의 에디터 규칙을 새 저장소로 옮기고 링크로 대체.
5. 블로그·캘린더는 같은 레지스트리를 쓴다(블로그는 Docker 빌드 시크릿).

## 블로그를 실제로 켜려면 (사람이 할 일)

1. `~/blog-wysiwyg`의 브랜치 `feature/wysiwyg-editor`를 서명 커밋으로 다시 만들어 푸시하고 PR(커밋 2개: `779ba93`, `4c3b36b`; 서명 명령은 `docs/EDITOR-PACKAGE.md` 6-3 결과).
2. 합친 뒤 서버(`~/blog`)에서 `git pull && docker compose up -d --build`(Dockerfile의 `COPY vendor`가 들어 있다).
3. 관리자 화면에서 모드 "시각"을 골라 글을 열고 고쳐 저장해 본다(실제 로그인·DB가 필요해 이 서버 시험에서는 못 했다). 문제가 있으면 기본 모드("통합")는 그대로이니 쓰지 않으면 된다.
4. 패키지를 게시한 뒤에는 `vendor/`·`overrides`를 지우고 레지스트리 설치로 바꾼다(`docs/RELEASING.md`).
