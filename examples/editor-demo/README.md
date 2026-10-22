# 에디터 데모와 시각·동작 시험

노트 앱 없이 `@9um4/editor-core`만으로 편집기를 띄우는 데모이자, **실제 브라우저(Chromium)** 에서 화면과 동작이 바뀌지 않았는지 확인하는 시험의 대상이다(docs/EDITOR-PACKAGE.md P5).

```
pnpm --filter editor-demo dev                 # 데모를 띄운다 (http://localhost:5173, ?collab=1이면 실제 Yjs 문서)
pnpm --filter editor-demo visual              # 시각·동작 시험: 기준과 비교한다
pnpm --filter editor-demo visual:update       # 의도한 변경이면 기준을 다시 만든다 (diff를 검토하고 커밋)
pnpm --filter editor-demo visual -- --screenshots <이름>        # 장면 스크린샷을 .visual/<이름>/에 저장 (커밋하지 않음)
pnpm --filter editor-demo visual -- --diff <이름A> <이름B>      # 저장한 두 묶음을 픽셀 단위로 비교
```

## 무엇을 확인하나

- **계산된 스타일 비교** (`visual/baseline/computed-styles.json`, 커밋됨): 13개 장면(본문, 슬래시 메뉴, 언어 선택, 코드 자동완성, 수식·각주 편집 창, 표 막대, 이미지 선택, 콜아웃 메뉴, 토글, mermaid 크게 보기 등)의 모든 요소에서 CSS가 실제로 정한 값을 비교한다.
  `computedStyleMap()`의 **계산 값**(`width: auto`는 `auto`)이라 글꼴·화면 크기에 흔들리지 않는다. 그래서 CSS 규칙을 옮겨서 **순서·우선순위가 달라진 것**도 잡는다(규칙 집합 검사 `scripts/check-css-rules.mjs`는 이것을 못 잡는다).
- **동작 시험** (`visual/behaviors.mjs`): 실제 키 입력·클릭·붙여넣기 이벤트로 입력 규칙, 슬래시 메뉴, Markdown 붙여넣기 + Ctrl+Z 두 단계(보통 경로와 실제 Yjs 경로), 코드 자동완성, 언어 선택, 수식·각주 편집, 표 막대, 토글, 콜아웃, 링크 Ctrl+클릭, **한글 조합(IME; CDP의 `Input.imeSetComposition`)**. 콘솔 오류가 있으면 실패한다.
- **스크린샷**: 같은 머신에서의 전후 비교용이다. 글꼴이 머신마다 달라서 커밋하지 않는다.

## 브라우저 준비

```
pnpm --filter editor-demo exec playwright install chromium-headless-shell          # 로컬
pnpm --filter editor-demo exec playwright install --with-deps chromium-headless-shell   # CI(Ubuntu, sudo 가능)
```

**root가 없고 시스템 라이브러리가 모자라면**(`error while loading shared libraries: libatk-1.0.so.0` 등): 부족한 `.deb`를 `apt-get download`로 받아 `dpkg -x`로 사용자 폴더에 풀고
`LD_LIBRARY_PATH=<그 폴더>/usr/lib/x86_64-linux-gnu`를 준다(필요한 것: libatk1.0-0t64, libatk-bridge2.0-0t64, libatspi2.0-0t64, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libgbm1, libxrender1, libxi6).
브라우저 위치를 바꾸려면 `PLAYWRIGHT_BROWSERS_PATH`.

## 한계

- headless Chromium(Linux)이지 앱이 쓰는 WebView2(Windows)가 아니다. 같은 Blink 엔진이지만 글꼴·플랫폼 차이는 남는다. Tauri 자체(파일 대화상자 등)는 못 본다.
- IME는 조합 **이벤트**를 주입하는 것이다. 실제 한글 입력기(OS) 동작은 사람이 확인한다.
- 계산된 스타일은 hover·focus 같은 동적 상태를 보지 않는다.
