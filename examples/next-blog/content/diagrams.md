---
title: "다이어그램"
date: 2026-10-21
summary: "mermaid는 브라우저에서 그려집니다"
---

# 다이어그램

```mermaid
graph TD
  A[Markdown] --> B[본문 JSON]
  B --> C[React 요소]
  C --> D[HTML]
```

서버가 낸 HTML에는 소스를 담은 `<pre class="mermaid">`가 있고, 브라우저에서 mermaid가 SVG로 바꿉니다.
