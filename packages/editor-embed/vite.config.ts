import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 상대 경로(`base: "./"`)로 빌드해서 `file://`·로컬 에셋 서버·iframe 어디서 열어도 에셋을 찾는다.
// mermaid는 기본으로 뺀다(번들의 대부분이라 앱 에셋이 수 MB 늘어난다). 일정 설명에는 다이어그램을 쓰지 않는다고 본다 — `EMBED_MERMAID=1`로 켤 수 있다.
const includeMermaid = process.env.EMBED_MERMAID === "1";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: { alias: includeMermaid ? {} : { mermaid: fileURLToPath(new URL("./src/mermaid-stub.ts", import.meta.url)) } },
  build: { chunkSizeWarningLimit: 4000 },
});
