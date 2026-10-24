> **이 문서는 분리 전 노트 앱 저장소(`9um4-utils/mine`)에서 왔다.** 본문의 `src/`·`src-tauri/`·`server/`·`protocol/` 경로와 `CLAUDE.md` 언급은 그 저장소의 것이고, 이 저장소에는 `packages/`·`examples/`·`scripts/`가 있다. (`@9um4-utils`로 적힌 예전 scope는 `@9um4`다.)

# 에디터 패키지 배포와 버전 규칙 (P8)

패키지 5개(`@gogum4/editor-schema·markdown·render·core·react`)를 **GitHub Packages(scope `@gogum4`, MIT)**에 올리고 Changesets로 버전을 관리한다. 결정 배경은 [EDITOR-PACKAGE.md](EDITOR-PACKAGE.md) §7·P8. 앱·서버·데모·`editor-embed`(앱 번들)는 버전 대상이 아니다(`.changeset/config.json`의 `ignore`).

## 한눈에

- **5개는 항상 같은 버전**(`fixed` 묶음)이다. 한 패키지만 바뀌어도 다섯이 같이 오른다 — 서로의 호환을 따로 따지지 않기 위해서다(소비자는 다섯을 한 버전으로 맞추면 된다).
- 변경이 소비자에게 보이면 `pnpm changeset`으로 설명을 더한다(단계는 아래 규칙으로 고른다). 설명은 PR에 같이 올린다.
- 배포는 **수동 워크플로**(`.github/workflows/release.yml`, Actions 탭 → release → Run)가 한다: changeset이 쌓여 있으면 "버전 올리기" PR을 만들고, 그 PR을 합친 뒤 다시 실행하면 게시한다. 자동으로 돌지 않는다.
- 아직 한 번도 게시하지 않았다. 첫 게시는 `.changeset/first-release.md`가 **0.1.0**으로 올린다.

## 어떤 단계로 올릴까 (호환 규칙)

기준은 **저장된 것과의 호환**이다: ① 본문(ProseMirror JSON) ② Markdown 표기 ③ 패키지의 공개 API.

| 단계 | 언제 | 예 |
|---|---|---|
| **major** | 이미 저장된 본문·Markdown을 못 읽거나 다르게 읽게 된다. 공개 API가 깨진다 | 노드·마크·속성을 지우거나 이름·기본값·내용 규칙을 바꿈(`schemaCompat` 시험이 잡는다), Markdown 방언의 기존 표기 의미를 바꿈(골든 시험이 잡는다), 필수 포트·옵션을 더함, 내보낸 이름을 지움 |
| **minor** | 더해지기만 한다. 소비자가 켜기 전에는 아무것도 달라지지 않는다 | 새 노드·속성(기본 꺼짐 옵션 뒤: `raw`·`reference` 같은 것), 새 선택 옵션·포트·내보내기, 새 방언, 새 CSS 토큰 |
| **patch** | 같은 입력에서 같은 저장 결과, 버그·성능·내부 수정 | 렌더 버그, 입력 규칙 수정, 문구 수정 |

특히 주의:

- **본문 스키마**: 노드·속성을 더하면 minor이지만, **본문을 저장하는 소비자는 그 기능을 켤 때 자기 스키마 버전을 올린다**(노트 앱은 `DOC_SCHEMA_VERSION`·`SUPPORTED_DOC_SCHEMA`를 함께). 패키지의 기본값은 새 노드를 끈 채로 두어야 minor가 안전하다.
- **저장 호환 가드**: `packages/editor-core/src/schemaCompat.test.ts`가 옵션을 전부 켠 스키마를 `schema-snapshot.json`에 고정한다. 사라지거나 바뀐 것이 있으면 "깨지는 변경(major)"으로, 더해진 것만 있으면 "minor + 스냅샷 갱신"으로 알려 준다. 의도한 변경이면 `UPDATE_SCHEMA_SNAPSHOT=1 pnpm vitest run packages/editor-core/src/schemaCompat.test.ts`로 갱신하고 changeset을 더한다.
- **Markdown**: `packages/editor-markdown/fixtures/`의 골든이 바뀌면(`-u`로 갱신하는 경우) 표기 의미가 바뀐 것인지 따진다. 기존 글의 변환 결과가 달라지면 major다.
- **0.x 동안**: 1.0 전에는 minor에서도 깨질 수 있다는 관례가 있지만, 이 프로젝트는 위 표를 0.x에서도 그대로 지킨다(소비자가 앱 3개라 깨짐의 비용이 크다).
- **같이 오르는 CSS**: `styles.css`의 클래스 이름(`md-…`)과 색 토큰(`--md-c-…`)은 공개 API다. 지우거나 이름을 바꾸면 major.

## 소비자가 설치하는 법

GitHub Packages라 **설치하는 쪽에도 토큰이 필요하다**(공개 패키지도 `read:packages` 권한의 토큰을 요구한다). `.npmrc`에 아래 두 줄을 두고 `pnpm add @gogum4/editor-react …`(다섯 패키지는 같은 버전으로).

```
@gogum4:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_PACKAGES_TOKEN}
```

게시는 Actions의 `GITHUB_TOKEN`이 하므로 OTP·`NPM_TOKEN`이 필요 없다(출처 증명은 GitHub Packages에서 지원하지 않아 껐다).

- **노트 앱(이 저장소)**은 워크스페이스(`workspace:*`)로 쓰므로 토큰이 필요 없다.
- **블로그(Docker 빌드)**는 지금 `vendor/*.tgz`로 설치한다. 첫 게시 뒤에는 레지스트리 버전으로 바꾸고 `vendor/`·`overrides`를 지운다(Docker 빌드 시크릿으로 `read:packages` 토큰이 필요하다). 그 저장소는 따로 있어 여기서 바꾸지 않았다.
- **캘린더(Flutter)**는 npm 패키지를 직접 쓰지 않는다 — `editor-embed` 번들(정적 파일)을 쓴다([EDITOR-EMBED.md](EDITOR-EMBED.md)).
- scope는 `@9um4-utils` → `@9um4` → `@gogum4`로 바뀌었다(2026-10-24, 첫 게시 전; 다른 언어에서도 쓰려고 영문자로 시작하는 이름으로, 저장소는 `gogum4/js-editor`). 블로그 복제본의 `vendor/` tarball은 이전 이름이라 게시 뒤 레지스트리 설치로 바꿀 때 함께 바뀐다.

## 게시 전 점검표

1. `pnpm test`·`pnpm build`·`pnpm check:deps`·`pnpm check:dist`가 통과한다(`pnpm release`가 앞의 둘과 `check:dist`를 다시 돌린다).
2. `pnpm changeset status`가 기대한 단계를 보인다(major가 의도한 것인가).
3. `schema-snapshot.json`이 현재 스키마와 같다.
4. 라이선스: **MIT**(각 패키지 폴더의 `LICENSE`와 `package.json`).
5. 게시는 되돌릴 수 없다(같은 버전 번호는 재사용 불가, 삭제는 제한적). 의심스러우면 아래 리허설부터.

## 리허설 (실제 레지스트리에 올리지 않고 게시·설치를 시험)

P8에서 이 방법으로 확인했다(2026-10-23): 5개 패키지가 `0.1.0`으로 게시되고, 게시된 매니페스트의 `workspace:*`가 `0.1.0`으로 바뀌고, 새 프로젝트에서 설치해 Node에서 렌더·변환이 돌고 타입 검사가 통과했다.

```bash
# 1) 임시 로컬 레지스트리(Verdaccio): 저장소 밖에서. @gogum4/*는 누구나 게시, 나머지는 npmjs로 프록시
mkdir -p /tmp/vd && cd /tmp/vd && npm i verdaccio@6 && cat > config.yaml <<'YAML'
storage: ./storage
auth: { htpasswd: { file: ./htpasswd } }
uplinks: { npmjs: { url: https://registry.npmjs.org/ } }
packages:
  '@gogum4/*': { access: $all, publish: $all }
  '**': { access: $all, proxy: npmjs }
YAML
npx verdaccio -c config.yaml -l 127.0.0.1:4873 &
# 2) 토큰을 받아 userconfig에 적는다(사용자 만들기: PUT /-/user/org.couchdb.user:<이름>, 응답의 token)
# 3) 저장소에서: changeset version → publishConfig.registry를 로컬로 바꿔서(임시) 다섯 패키지에서 pnpm publish --no-git-checks
#    (NPM_CONFIG_USERCONFIG=위 userconfig). 끝나면 `git checkout -- . && rm packages/*/CHANGELOG.md`로 되돌린다.
# 4) 새 폴더에서 `.npmrc`에 `@gogum4:registry=http://127.0.0.1:4873/`를 두고 `pnpm add`로 설치해 import해 본다.
```

`pnpm publish --dry-run`은 매니페스트·파일 목록만 보여 준다(인증은 필요 없다).
