import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    environment: "node",
    // 렌더 패키지의 CSS 파일은 시험이 원문(?raw)으로 읽는다. vitest는 기본으로 CSS를 빈 글자로 바꾸므로 이 폴더만 살린다.
    css: { include: [/editor-render\/styles\/.*\.css/] },
  },
});
