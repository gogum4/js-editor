import type { ReactNode } from "react";

// 렌더러 스타일: 기본 모양, 코드 강조 색, 수식(KaTeX) 글꼴. 수식을 서버에서 그렸다면 katex.css가 꼭 필요하다.
import "@gogum4/editor-render/styles.css";
import "@gogum4/editor-render/highlight.css";
import "@gogum4/editor-render/katex.css";
import "./globals.css";

export const metadata = { title: "블로그 샘플", description: "@gogum4/editor-render로 렌더한 Next.js 블로그" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
