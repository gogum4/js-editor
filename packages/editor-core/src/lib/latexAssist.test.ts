import katex from "katex";
import { describe, expect, it } from "vitest";

import {
  applyEdit,
  commandEdit,
  commandQuery,
  deletePairEdit,
  insertPreview,
  openPairEdit,
  shouldAutoOpen,
  skipCloserEdit,
  suggest,
  tabJump,
} from "./latexAssist";
import { LATEX_COMMANDS } from "./latexCommands";

const find = (name: string) => {
  const command = LATEX_COMMANDS.find((c) => c.name === name);
  if (!command) throw new Error(`명령 없음: ${name}`);
  return command;
};

describe("명령 목록", () => {
  it("이름이 겹치지 않고 모든 항목에 설명·예시·삽입 글자가 있다", () => {
    const names = LATEX_COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of LATEX_COMMANDS) {
      expect(c.desc.length, c.name).toBeGreaterThan(0);
      expect(c.example.length, c.name).toBeGreaterThan(0);
      expect(c.insert.startsWith("\\"), c.name).toBe(true);
      expect(c.insert.split("$0").length - 1, c.name).toBeLessThanOrEqual(1);
    }
  });

  it("예시와 삽입 글자가 모두 KaTeX로 문법 오류 없이 그려진다", () => {
    for (const c of LATEX_COMMANDS) {
      expect(() => katex.renderToString(c.example, { throwOnError: true, strict: "ignore" }), `예시 ${c.name}`).not.toThrow();
      // 삽입 글자는 커서 자리에 임의의 글자를 넣고, `\right)`처럼 짝이 있는 것은 짝을 채워서 확인한다.
      let filled = c.insert.replace("$0", "x");
      if (c.name === "right") filled = `\\left(x${filled}`;
      if (c.name === "not") filled = `${filled}=`;
      if (c.name === "hspace") filled = "\\hspace{1em}";
      expect(() => katex.renderToString(filled, { throwOnError: true, strict: "ignore", displayMode: true }), `삽입 ${c.name}`).not.toThrow();
    }
  });
});

describe("commandQuery", () => {
  it("커서 앞의 \\글자들을 찾는다", () => {
    expect(commandQuery("a+\\fr", 5)).toEqual({ start: 2, end: 5, prefix: "fr", hasBackslash: true });
  });

  it("커서가 단어 가운데면 뒤에 이어진 글자까지 바꿀 범위에 넣는다", () => {
    expect(commandQuery("\\frac", 3)).toEqual({ start: 0, end: 5, prefix: "fr", hasBackslash: true });
  });

  it("역슬래시만 있으면 빈 접두", () => {
    expect(commandQuery("x\\", 2)).toEqual({ start: 1, end: 2, prefix: "", hasBackslash: true });
  });

  it("역슬래시가 없거나 글자가 아닌 것이 끼면 null", () => {
    expect(commandQuery("frac", 4)).toBeNull();
    expect(commandQuery("\\frac{a", 7)).toBeNull();
    expect(commandQuery("", 0)).toBeNull();
  });

  it("줄바꿈(\\\\) 뒤의 글자는 명령이 아니다", () => {
    expect(commandQuery("a \\\\ b", 6)).toBeNull();
    expect(commandQuery("a \\\\fr", 6)).toBeNull();
    expect(commandQuery("a \\\\\\fr", 7)?.start).toBe(4);
  });

  it("한글 낱말도 접두로 본다", () => {
    expect(commandQuery("\\분수", 3)?.prefix).toBe("분수");
  });
});

describe("shouldAutoOpen", () => {
  it("영문은 두 글자부터, 한글은 한 글자부터 연다", () => {
    expect(shouldAutoOpen({ start: 0, end: 2, prefix: "f", hasBackslash: true })).toBe(false);
    expect(shouldAutoOpen({ start: 0, end: 3, prefix: "fr", hasBackslash: true })).toBe(true);
    expect(shouldAutoOpen({ start: 0, end: 2, prefix: "분", hasBackslash: true })).toBe(true);
    expect(shouldAutoOpen({ start: 0, end: 0, prefix: "", hasBackslash: false })).toBe(false);
  });
});

describe("suggest", () => {
  it("\\fr 은 frac 계열이 먼저 나온다", () => {
    const names = suggest("fr", 8).map((c) => c.name);
    expect(names[0]).toBe("frac");
  });

  it("이름이 같은 것이 가장 먼저", () => {
    expect(suggest("sum", 3)[0]!.name).toBe("sum");
    expect(suggest("int", 3)[0]!.name).toBe("int");
  });

  it("대소문자를 가려 먼저 맞춘다 (Delta/delta)", () => {
    expect(suggest("Del", 2)[0]!.name).toBe("Delta");
    expect(suggest("del", 2)[0]!.name).toBe("delta");
  });

  it("한글·영어 설명 낱말로도 찾는다", () => {
    expect(suggest("분수", 5).map((c) => c.name)).toContain("frac");
    expect(suggest("루트", 5)[0]!.name).toBe("sqrt");
    expect(suggest("행렬", 20).map((c) => c.name)).toContain("pmatrix");
    expect(suggest("begin", 20).map((c) => c.name)).toContain("cases");
  });

  it("빈 접두는 목록 앞쪽을 돌려주고 개수를 제한한다", () => {
    expect(suggest("", 5)).toHaveLength(5);
    expect(suggest("zzzzzz", 5)).toEqual([]);
  });
});

describe("commandEdit", () => {
  it("\\fr → \\frac{}{} 로 바꾸고 커서를 첫 {} 안에 둔다", () => {
    const text = "x = \\fr";
    const query = commandQuery(text, text.length)!;
    const result = applyEdit(text, commandEdit(query, find("frac")));
    expect(result.text).toBe("x = \\frac{}{}");
    expect(result.caret).toBe("x = \\frac{".length);
  });

  it("기호 명령은 끝에 커서를 둔다", () => {
    const text = "\\alph";
    const result = applyEdit(text, commandEdit(commandQuery(text, 5)!, find("alpha")));
    expect(result).toEqual({ text: "\\alpha", caret: 6 });
  });

  it("환경은 begin/end와 가운데 줄을 넣는다", () => {
    const text = "\\pmat";
    const result = applyEdit(text, commandEdit(commandQuery(text, 5)!, find("pmatrix")));
    expect(result.text).toBe("\\begin{pmatrix}\n\n\\end{pmatrix}");
    expect(result.caret).toBe("\\begin{pmatrix}\n".length);
  });

  it("역슬래시 없이 부른 경우(Ctrl+Space)에도 삽입된다", () => {
    const query = { start: 3, end: 3, prefix: "", hasBackslash: false };
    expect(applyEdit("a+b", commandEdit(query, find("sqrt"))).text).toBe("a+b\\sqrt{}");
  });
});

describe("괄호 자동 닫기", () => {
  it("{ 를 치면 {} 로 만들고 커서를 사이에 둔다", () => {
    expect(applyEdit("", openPairEdit("", 0, 0, "{")!)).toEqual({ text: "{}", caret: 1 });
    expect(applyEdit("a ", openPairEdit("a ", 2, 2, "(")!)).toEqual({ text: "a ()", caret: 3 });
  });

  it("고른 글자가 있으면 감싼다", () => {
    expect(applyEdit("abc", openPairEdit("abc", 1, 2, "[")!)).toEqual({ text: "a[b]c", caret: 4 });
  });

  it("다음이 단어의 일부이거나 \\{ 이면 짝을 넣지 않는다", () => {
    expect(openPairEdit("x2", 1, 1, "{")).toBeNull();
    expect(openPairEdit("\\", 1, 1, "{")).toBeNull();
    expect(openPairEdit("a", 0, 0, "x")).toBeNull();
  });

  it("닫는 괄호를 치면 뒤에 같은 괄호가 있을 때 건너뛴다", () => {
    expect(applyEdit("{a}", skipCloserEdit("{a}", 2, 2, "}")!).caret).toBe(3);
    expect(skipCloserEdit("{a}", 1, 1, "}")).toBeNull();
    expect(skipCloserEdit("{a)", 2, 2, "}")).toBeNull();
  });

  it("빈 쌍 사이에서 Backspace는 짝까지 지운다", () => {
    expect(applyEdit("a{}b", deletePairEdit("a{}b", 2, 2)!)).toEqual({ text: "ab", caret: 1 });
    expect(deletePairEdit("a{x}b", 3, 3)).toBeNull();
    expect(deletePairEdit("{}", 0, 0)).toBeNull();
  });
});

describe("tabJump", () => {
  it("닫는 괄호 앞에서 Tab은 그 뒤로 나간다", () => {
    expect(tabJump("\\frac{a}{b}", 7)).toBe(9); // a| } { b → { 안으로
  });

  it("} 뒤에 { 가 이어지면 그 안으로 들어간다", () => {
    const text = "\\frac{a}{b}";
    expect(text.slice(7, 9)).toBe("}{");
    expect(tabJump(text, 7)).toBe(9);
    expect(tabJump(text, 10)).toBe(11);
  });

  it("해당이 없으면 null", () => {
    expect(tabJump("abc", 1)).toBeNull();
    expect(tabJump("abc", 3)).toBeNull();
  });
});

describe("insertPreview", () => {
  it("커서 자리와 줄바꿈을 눈에 보이게 한다", () => {
    expect(insertPreview(find("frac"))).toBe("\\frac{▮}{}");
    expect(insertPreview(find("pmatrix"))).toBe("\\begin{pmatrix} ⏎ ▮ ⏎ \\end{pmatrix}");
  });
});
