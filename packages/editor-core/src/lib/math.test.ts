import { describe, expect, it } from "vitest";

import { loadKatex, MAX_LATEX_CHARS, mathError, renderMathHtml } from "./math";

describe("수식 렌더링 (KaTeX)", () => {
  it("LaTeX를 HTML로 그리고 큰 수식은 display 클래스가 붙는다", async () => {
    const katex = await loadKatex();
    const inline = renderMathHtml(katex, "x^2 + y^2 = z^2", false);
    expect(inline).toContain('class="katex"');
    expect(inline).not.toContain("katex-display");
    expect(renderMathHtml(katex, "\\int_0^1 x\\,dx", true)).toContain("katex-display");
  });

  it("같은 모듈을 다시 불러도 한 번만 읽는다", async () => {
    expect(await loadKatex()).toBe(await loadKatex());
  });

  it("문법이 틀려도 던지지 않고 틀린 글자를 보여 준다", async () => {
    const katex = await loadKatex();
    const html = renderMathHtml(katex, "\\frac{1}{", false);
    expect(html).toContain("katex-error");
    expect(mathError(katex, "\\frac{1}{")).toEqual(expect.any(String));
    expect(mathError(katex, "\\frac{1}{2}")).toBeNull();
  });

  it("위험한 명령(링크·스타일 주입)은 실행하지 않는다", async () => {
    const katex = await loadKatex();
    const html = renderMathHtml(katex, "\\href{javascript:alert(1)}{x}", false);
    // 링크가 되지 않고(글자로만 남는다) 눌러서 실행되는 주소도 없다
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("href=");
  });

  it("글자 수 한도를 넘는 부분은 잘라서 그린다", async () => {
    const katex = await loadKatex();
    const long = "x+".repeat(MAX_LATEX_CHARS);
    expect(() => renderMathHtml(katex, long, false)).not.toThrow();
  });

  it("한글이 든 수식도 그린다", async () => {
    const katex = await loadKatex();
    expect(renderMathHtml(katex, "\\text{속도} = \\frac{거리}{시간}", false)).toContain("속도");
  });
});
