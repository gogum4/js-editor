import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PmNode } from "@9um4/editor-schema/pmDoc";
import { prepareRender, renderDoc } from "./index.ts";

const t = (text: string): PmNode => ({ type: "text", text });
const code = (language: string | null, source: string): PmNode => ({ type: "codeBlock", attrs: { language }, content: [t(source)] });
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });

async function render(d: PmNode): Promise<string> {
  return renderToStaticMarkup(renderDoc(d, { prepared: await prepareRender(d) }));
}

describe("수식 (KaTeX)", () => {
  it("인라인·블록 수식을 서버에서 KaTeX HTML로 만든다", async () => {
    const out = await render(
      doc(
        { type: "paragraph", content: [t("에너지 "), { type: "mathInline", attrs: { latex: "E=mc^2" } }] },
        { type: "mathBlock", attrs: { latex: "\\frac{a}{b}" } },
      ),
    );
    expect(out).toContain('class="math-inline"');
    expect(out).toContain('class="katex"');
    expect(out).toContain("katex-display"); // 블록은 디스플레이 모드
    expect(out).toContain('<annotation encoding="application/x-tex">E=mc^2</annotation>'); // 접근성용 MathML
  });

  it("틀린 수식은 던지지 않고 오류 표시가 있는 HTML이 된다", async () => {
    const out = await render(doc({ type: "mathBlock", attrs: { latex: "\\frac{" } }));
    expect(out).toContain("katex-error");
  });

  it("위험한 기능(\\href, \\includegraphics)은 링크·이미지가 되지 않는다", async () => {
    const out = await render(doc({ type: "mathBlock", attrs: { latex: "\\href{javascript:alert(1)}{x}\\includegraphics{a.png}" } }));
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("javascript:alert(1)\"");
  });

  it("준비하지 않으면 LaTeX 원문이 보인다", () => {
    const out = renderToStaticMarkup(renderDoc(doc({ type: "mathBlock", attrs: { latex: "x^2" } })));
    expect(out).toContain('<pre class="math-source">x^2</pre>');
  });

  it("수식·코드가 없는 문서는 빈 준비 결과를 낸다", async () => {
    const prepared = await prepareRender(doc({ type: "paragraph", content: [t("글")] }));
    expect(prepared.math.size).toBe(0);
    expect(prepared.code.size).toBe(0);
  });
});

describe("코드 강조 (lowlight)", () => {
  it("언어가 있는 코드를 hljs 클래스로 강조한다 (별칭 ts도)", async () => {
    const out = await render(doc(code("ts", "const x: number = 1;"), code("python", "def f():\n    return 1")));
    expect(out).toContain('class="hljs-keyword">const</span>');
    expect(out).toContain("hljs-keyword");
    expect(out).toContain("language-ts");
  });

  it("언어가 없거나 모르는 언어, mermaid는 강조하지 않는다", async () => {
    const prepared = await prepareRender(doc(code(null, "a"), code("no-such-language", "b"), code("mermaid", "graph TD;A-->B")));
    expect(prepared.code.size).toBe(0);
    const out = await render(doc(code("mermaid", "graph TD;A-->B")));
    expect(out).toContain('<pre class="mermaid">graph TD;A--&gt;B</pre>');
  });

  it("같은 코드는 한 번만 강조한다 (결과가 같다)", async () => {
    const d = doc(code("js", "let a = 1;"), code("js", "let a = 1;"));
    expect((await prepareRender(d)).code.size).toBe(1);
  });

  it("강조된 글자도 HTML로 이스케이프된다", async () => {
    const out = await render(doc(code("html", "<script>alert(1)</script>")));
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;");
  });
});
