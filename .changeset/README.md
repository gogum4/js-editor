# Changesets

패키지 5개(`@9um4-utils/editor-schema·markdown·render·core·react`)는 **같은 버전으로 함께 올린다**(`config.json`의 `fixed`). 앱·서버·데모·임베드 번들은 버전 대상이 아니다(`ignore`).

변경이 소비자에게 보이면 `pnpm changeset`으로 변경 설명을 더한다. **어떤 단계(patch·minor·major)로 올릴지는 [docs/RELEASING.md](../docs/RELEASING.md)의 호환 규칙을 따른다** — 저장된 본문·Markdown과의 호환이 기준이다.
