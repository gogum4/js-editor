// 브라우저 안에서 한 요소 아래의 모든 요소의 "계산된 스타일"을 덤프한다.
//
// - `computedStyleMap()`(타입이 있는 계산 값)을 쓴다. `getComputedStyle`의 **사용된 값**(레이아웃으로 정해지는 px)이 아니라 CSS가 정한 값이라
//   (`width: auto`는 `auto`, `margin: auto`는 `auto`) 글꼴·화면 크기·텍스트 길이에 흔들리지 않는다. 그래서 JSON을 커밋하고 어느 머신에서나 비교할 수 있다.
// - 위치를 JS가 재서 넣는 값(`top`/`left`/`right`/`bottom`)은 뺀다(텍스트 크기에 따라 달라진다).
// - 상속되는 속성은 부모와 같으면, 상속되지 않는 속성은 같은 태그의 기본값과 같으면 기록하지 않는다. 그래서 "이 요소에서 CSS가 실제로 바꾼 것"만 남는다.
// - 의사 요소(::before/::after)는 content가 있을 때만 기록한다(할 일 체크 표시, 각주 번호 등).
export const PROPS = [
  "display", "position", "float", "clear", "overflow-x", "overflow-y", "box-sizing", "visibility", "opacity", "z-index",
  "flex-direction", "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "align-items", "align-self", "align-content", "justify-content", "justify-items", "justify-self", "row-gap", "column-gap", "order",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
  "color", "background-color", "background-image", "background-size", "background-position-x", "background-position-y", "background-repeat",
  "box-shadow", "outline-style", "outline-width", "outline-color",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-decoration-line", "text-transform", "text-overflow", "text-indent",
  "white-space", "word-break", "overflow-wrap", "vertical-align", "list-style-type", "list-style-position", "cursor", "pointer-events", "user-select", "resize", "transform", "appearance",
  "border-collapse", "table-layout", "caret-color", "scroll-margin-top", "outline-offset",
];

export const INHERITED = [
  "visibility", "color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-transform", "text-indent",
  "white-space", "word-break", "overflow-wrap", "list-style-type", "list-style-position", "cursor", "caret-color", "border-collapse", "text-decoration-line", "pointer-events",
];

/** 브라우저 안에서 실행된다(직렬화되므로 바깥 변수를 쓰지 않는다). */
export function dumpSubtree({ selector, props, inherited, maxChildren = 12 }) {
  const root = document.querySelector(selector);
  if (!root) return null;
  const inheritedSet = new Set(inherited);

  // 같은 태그의 "아무 스타일도 없는" 기본값을 빈 iframe에서 얻는다.
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const blank = frame.contentDocument;
  const defaults = new Map();
  const defaultsFor = (el) => {
    const key = `${el.namespaceURI}|${el.localName}`;
    if (!defaults.has(key)) {
      const probe = blank.createElementNS(el.namespaceURI, el.localName);
      blank.body.appendChild(probe);
      const map = probe.computedStyleMap();
      const values = {};
      for (const p of props) {
        const v = map.get(p);
        values[p] = v === undefined ? null : String(v);
      }
      defaults.set(key, values);
    }
    return defaults.get(key);
  };

  const valuesOf = (el) => {
    const map = el.computedStyleMap();
    const out = {};
    for (const p of props) {
      const v = map.get(p);
      out[p] = v === undefined ? null : String(v);
    }
    return out;
  };

  const result = {};
  const label = (el, index) => `${el.localName}${index > 1 ? `[${index}]` : ""}`;

  const pseudo = (el, which) => {
    const cs = getComputedStyle(el, which);
    const content = cs.getPropertyValue("content");
    if (content === "none" || content === "normal") return null;
    const out = { content };
    for (const p of ["display", "position", "color", "background-color", "font-size", "font-weight", "width", "height", "border-top-width", "border-top-color", "border-top-style", "border-radius", "margin-right", "margin-left", "padding-left", "counter-increment", "opacity"]) {
      out[p] = cs.getPropertyValue(p);
    }
    return out;
  };

  const visit = (el, path, parentValues) => {
    const own = valuesOf(el);
    const base = defaultsFor(el);
    const diff = {};
    for (const p of props) {
      const reference = inheritedSet.has(p) && parentValues ? parentValues[p] : base[p];
      if (own[p] !== reference) diff[p] = own[p];
    }
    for (const which of ["::before", "::after"]) {
      const pe = pseudo(el, which);
      if (pe) diff[which] = pe;
    }
    if (Object.keys(diff).length > 0) result[path] = diff;
    // SVG 안쪽(mermaid 그림)과 KaTeX가 그린 수식 안쪽은 글꼴·라이브러리 버전에 따라 달라서 보지 않는다(바깥 상자까지만).
    if (el.localName === "svg" || el.classList.contains("katex") || el.classList.contains("katex-display")) return;
    // 같은 모양이 길게 반복되는 목록(언어 선택의 193개 항목 등)은 앞쪽만 기록하고 개수를 남긴다 — 기준 파일이 커지는 것을 막는다.
    const children = [...el.children];
    if (children.length > maxChildren) {
      result[path] = { ...(result[path] ?? {}), __children: String(children.length) };
    }
    const seen = new Map();
    for (const child of children.slice(0, maxChildren)) {
      const n = (seen.get(child.localName) ?? 0) + 1;
      seen.set(child.localName, n);
      visit(child, `${path}/${label(child, n)}`, own);
    }
  };
  visit(root, root.localName, null);
  frame.remove();
  return result;
}

/** 두 덤프를 비교해 사람이 읽을 차이 목록을 만든다. */
export function diffDumps(before, after, limit = 40) {
  const lines = [];
  const scenes = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const scene of scenes) {
    const a = before[scene];
    const b = after[scene];
    if (!a || !b) {
      lines.push(`[${scene}] ${!a ? "기준에 없는 장면" : "이번에 만들어지지 않은 장면"}`);
      continue;
    }
    const paths = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const path of paths) {
      const x = a[path];
      const y = b[path];
      if (!x) lines.push(`[${scene}] 새 요소/스타일: ${path} ${JSON.stringify(y).slice(0, 120)}`);
      else if (!y) lines.push(`[${scene}] 사라진 요소/스타일: ${path} ${JSON.stringify(x).slice(0, 120)}`);
      else {
        for (const prop of new Set([...Object.keys(x), ...Object.keys(y)])) {
          const vx = JSON.stringify(x[prop] ?? null);
          const vy = JSON.stringify(y[prop] ?? null);
          if (vx !== vy) lines.push(`[${scene}] ${path} { ${prop}: ${vx} → ${vy} }`);
        }
      }
    }
  }
  return { count: lines.length, shown: lines.slice(0, limit), hidden: Math.max(0, lines.length - limit) };
}
