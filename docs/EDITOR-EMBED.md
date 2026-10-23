# 에디터 임베드 번들과 호스트 메시지 규약 (P6b)

React 에디터를 **WebView·iframe 안에서 돌리고 호스트 앱(Flutter 등)과 JSON 메시지로 대화**하게 하는 번들이다. 캘린더(LunarTask, Flutter)의 일정·할 일 `description`(Markdown 문자열) 편집기가 쓴다. 계획과 결정은 [EDITOR-PACKAGE.md](EDITOR-PACKAGE.md)의 "P6b 상세 계획".

- 코드: `packages/editor-embed/` (비공개 앱 번들, 배포 패키지가 아니다). 규약 타입·검증은 `src/protocol.ts`, 전송 어댑터는 `src/transport.ts`.
- 빌드: `pnpm --filter @9um4-utils/editor-embed build` → `packages/editor-embed/dist/` (정적 파일, 상대 경로라 `file://`·로컬 에셋 서버·iframe 어디서나 연다). mermaid를 포함하려면 `EMBED_MERMAID=1 pnpm … build`(기본은 뺀다 — 아래 "크기").
- 시험: `pnpm --filter @9um4-utils/editor-embed e2e` — iframe 부모 창을 호스트 삼아 실제 Chromium에서 규약 전체를 확인한다(CI `browser` 작업이 돌린다). 브라우저 준비는 [examples/editor-demo/README.md](../examples/editor-demo/README.md)와 같다.

## 규약 (버전 1)

모든 메시지는 JSON 객체다. **보낼 때는 JSON 글자**로 보낸다(어느 WebView 채널이든 글자는 보낼 수 있다). **받을 때는 글자와 객체를 모두** 받는다. 모르는 필드는 무시하고 모르는 `type`·올바르지 않은 값은 버린다 — 호스트와 번들 버전이 조금 달라도 깨지지 않게 하려는 것이다.

흐름: 번들이 뜨면 `ready`를 보낸다 → 호스트가 `init`으로 내용과 설정을 준다 → 사용자가 고치면 `change`가 온다.

### 호스트 → 에디터

| `type` | 필드 | 동작 |
|---|---|---|
| `init` | `markdown`(필수), `theme`(`light`\|`dark`, 기본 light), `readOnly`(기본 false), `placeholder`(기본: 에디터 기본 안내), `locale`(`ko`\|`en`, 기본 ko), `features`(아래), `autoHeight`(기본 true), `background`(CSS 색, 기본: 테마 바탕) | 에디터를 **새로 띄운다**(다시 보내면 이전 상태가 남지 않는다 — 다른 일정을 열 때 쓴다). 읽는 것만으로는 `change`가 나가지 않는다 |
| `setMarkdown` | `markdown` | 내용을 바꾼다. `change`를 보내지 않고, 이 내용이 새 기준이 된다 |
| `setTheme` | `theme` | 테마(`<html data-md-theme>`와 바탕·글자색) |
| `setReadOnly` | `readOnly` | 편집 가능 여부 |
| `focus` | — | 글 끝에 포커스 |
| `insertMarkdown` | `markdown` | 커서 자리에 끼운다. `change`가 나간다 |

`features`는 `/` 메뉴에 허용할 묶음이다(문단은 항상 있다): `heading`(제목 1~3) · `list`(글머리·번호) · `task`(할 일) · `quote` · `code` · `divider` · `table` · `math` · `callout` · `footnote`. 기본은 `heading, list, task, quote, code, divider`. 이미지·토글·정렬은 일정 설명에 쓰지 않아 어느 묶음에도 없다. (메뉴만 줄이는 것이다 — 이미 글에 있는 표·수식은 그대로 보이고 고쳐진다.)

### 에디터 → 호스트

모든 메시지에 `"v": 1`이 있다.

| `type` | 필드 | 뜻 |
|---|---|---|
| `ready` | `protocol`(=1) | 번들이 떴다. 호스트는 이것을 받은 뒤 `init`을 보낸다 |
| `change` | `markdown`, `rev` | 사용자가 고쳐서 Markdown이 달라졌다(입력이 멈춘 뒤 250ms에 한 번, 포커스를 잃으면 바로). `rev`는 1부터 늘어난다. **열기만 한 것·`setMarkdown`은 보내지 않는다** |
| `height` | `px` | 내용 높이(올림). `autoHeight`일 때 달라질 때마다. 호스트가 WebView 높이를 맞춘다 |
| `openLink` | `url` | 링크를 열어 달라는 요청(열어도 되는 주소만 온다). 편집 중에는 Ctrl+클릭, 읽기 전용에서는 그냥 클릭 |
| `focus` / `blur` | — | 포커스가 들어왔다/나갔다(호스트가 가상 키보드·스크롤을 다룬다) |
| `error` | `message` | 에디터 안의 오류(잡히지 않은 예외 포함) |

### 저장 형식과 "열기만 하면 바뀌지 않는다"

`description`에는 **Markdown 문자열**이 그대로 저장된다. 기존의 일반 글(문법을 의식하지 않고 쓴 글)도 열 수 있고, 열기만 해서는 `change`가 오지 않는다 — 연 직후의 변환 결과와 같으면 보내지 않기 때문이다(`2*3*4`·`[x]`·`#태그` 같은 글도 확인한다). 고치면 그때부터 정규화된 Markdown이 나온다(문단 사이 빈 줄 등). **문단 안의 줄바꿈 한 개는 눈에 보이는 줄바꿈이고 `\`·공백 없이 그냥 줄바꿈으로 돌아간다**(`MarkdownOptions.hardBreakStyle: "newline"`) — 호스트가 이 글을 읽기 전용으로 보여 줄 때 줄바꿈을 줄바꿈으로 그려야 같은 모양이다(Obsidian과 같은 규칙).

## 전송 길(환경에서 자동으로 고른다)

번들이 호스트로 보내는 길은 아래 순서로 처음 있는 것을 쓴다. 모두 JSON 글자를 보낸다.

| 순서 | 환경 | 번들이 부르는 것 | 호스트가 해야 할 일 |
|---|---|---|---|
| 1 | `flutter_inappwebview` | `window.flutter_inappwebview.callHandler("editorHost", 글자)` | 핸들러 `editorHost` 등록 |
| 2 | `webview_flutter`의 JavaScriptChannel | `EditorHost.postMessage(글자)` | 채널 이름 `EditorHost` |
| 3 | WebView2 직접 | `chrome.webview.postMessage(글자)` | `WebMessageReceived` |
| 4 | iframe(Flutter 웹) | `parent.postMessage(글자, "*")` | 부모 창의 `message` 이벤트 |
| — | 없음 | 콘솔에만 | — |

호스트가 번들로 보내는 길은 둘 다 열려 있다: ① `window`의 `message` 이벤트(iframe 부모의 `postMessage`, WebView2의 `PostWebMessageAsString`), ② **전역 함수 `window.__editorHostReceive(값)`**(호스트가 `evaluateJavascript`로 `window.__editorHostReceive(JSON글자)`를 부를 때 — 대부분의 Flutter WebView가 이 길을 쓴다).

## Flutter 연결 지침 (⚠ 검증되지 않음)

**이 서버에는 Flutter SDK가 없어서 Dart 코드는 빌드·실행해 보지 못했다.** 아래는 규약과 각 플러그인의 문서를 바탕으로 한 **초안**이고, 웹 쪽(번들·규약)만 실제 Chromium에서 시험했다. 캘린더 저장소(`~/todo`)는 운영 컨테이너의 체크아웃이라 건드리지 않았다.

1. **플러그인 선택**: Android·iOS·macOS는 `webview_flutter`나 `flutter_inappwebview`, **Windows는 `flutter_inappwebview`(WebView2) 또는 `webview_windows`**, **Flutter 웹은 WebView 대신 iframe**(`HtmlElementView`)이다. 한 앱이 여러 플랫폼이면 `flutter_inappwebview`가 Windows·웹까지 가장 넓게 덮는다(웹은 제약이 있어 iframe 경로를 따로 두는 편이 안전하다). 플러그인의 플랫폼 지원 표를 확인하고 정한다.
2. **번들 싣기**: `dist/`를 Flutter 에셋으로 넣거나(`pubspec.yaml`의 `assets:`에 폴더 — **하위 폴더마다 줄을 적어야 한다**), 앱이 시작할 때 로컬 HTTP 서버(예: `shelf_static`)로 서빙한다. `file://`는 플랫폼·플러그인에 따라 에셋 접근(CORS)이 막힐 수 있어 로컬 서버가 가장 덜 놀랍다. Flutter 웹은 같은 출처의 정적 경로(`web/editor/`)에 두고 iframe으로 연다.
3. **높이**: `autoHeight`(기본)이면 `height` 메시지로 위젯 높이를 맞춘다. 스크롤 가능한 폼 안에 넣을 때 편하다.
4. **키보드·IME**: 가상 키보드가 올라오면 `focus` 이벤트로 폼을 스크롤한다. **모바일 한글 입력(IME)과 가상 키보드는 실기기에서 확인하지 못했다**(데스크톱 Chromium의 조합 시험은 `examples/editor-demo`에 있다) — 사람 확인 목록에 있다.
5. **다크 모드**: 앱 테마가 바뀌면 `setTheme`. 바탕을 투명하게 하려면 `background: "transparent"`(WebView가 투명 배경을 지원해야 한다).
6. **링크**: `openLink`를 받아 `url_launcher`로 연다.

Dart 쪽 뼈대(초안, `flutter_inappwebview` 기준 — **컴파일해 보지 않았다**):

```dart
// 에디터 → 호스트: 핸들러 'editorHost'가 JSON 글자를 받는다.
controller.addJavaScriptHandler(
  handlerName: 'editorHost',
  callback: (args) {
    final message = jsonDecode(args[0] as String) as Map<String, dynamic>;
    switch (message['type']) {
      case 'ready':
        _send({'type': 'init', 'markdown': description, 'theme': isDark ? 'dark' : 'light', 'locale': 'ko'});
      case 'change':
        onChanged(message['markdown'] as String); // description에 저장
      case 'height':
        setState(() => _height = (message['px'] as num).toDouble());
      case 'openLink':
        launchUrl(Uri.parse(message['url'] as String));
    }
  },
);

// 호스트 → 에디터: 전역 함수로 보낸다(JSON 글자를 다시 JSON 글자로 감싸 이스케이프를 맡긴다).
Future<void> _send(Map<String, dynamic> message) =>
    controller.evaluateJavascript(source: 'window.__editorHostReceive(${jsonEncode(jsonEncode(message))})');
```

## 크기

`pnpm … build` 결과(mermaid 제외): 파일 257개 합계 약 3.3MB, **처음에 읽는 진입 JS 1.05MB(gzip 약 330KB)**. 나머지는 코드 언어별 조각(필요할 때만 읽음)과 KaTeX 글꼴이다. mermaid를 넣으면 약 8MB가 된다(대부분 다이어그램 조각). 앱 에셋 크기가 문제면: ① 쓰지 않는 코드 언어 조각을 빼기(코드 블록 강조가 없어도 된다면) ② KaTeX 글꼴을 woff2만 남기기 — 아직 하지 않았다.

## 알려진 한계

- mermaid를 뺀 번들에서 ```` ```mermaid ```` 블록은 그림 대신 "그림을 그리지 못했어요" 안내로 보인다(원문은 그대로).
- 이미지는 지원하지 않는다(`/` 메뉴에 없고 붙여넣어도 저장소가 없다).
- 모바일 터치로 편집 중 링크를 여는 방법이 없다(편집 중에는 Ctrl+클릭만). 읽기 전용에서는 그냥 눌러 연다.
- 위키 링크 `[[…]]`·블록 id는 이 번들에서 의미가 없다(해석기를 연결하지 않았다).
- 번들 안의 글(기본 안내·메뉴·편집 창)은 한국어·영어 두 가지뿐이다.

## 사람이 확인할 것 (호스트 연결 때)

- [ ] 실제 기기(Android·Windows)에서 WebView로 열어 `ready`→`init`→`change`가 오가는지
- [ ] 가상 키보드가 올라올 때 입력 줄이 가려지지 않는지, 모바일 한글 IME 조합이 정상인지
- [ ] 다크 모드 전환, 폼 높이 자동 맞춤, 링크 열기
- [ ] Flutter 웹(iframe)에서 `postMessage` 왕복
- [ ] 에셋 크기가 앱 배포 크기에 미치는 영향
