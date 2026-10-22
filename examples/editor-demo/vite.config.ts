import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 두 페이지: index(Tailwind 위에서)와 plain(Tailwind 없이 패키지 스타일만 — 소비자가 Tailwind를 안 쓰는 경우)
  build: { chunkSizeWarningLimit: 4000, rollupOptions: { input: { main: "index.html", plain: "plain.html" } } },
});
