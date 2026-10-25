import { describe, expect, it } from "vitest";

import { compileExpr } from "./mathExpr";

const ev = (source: string, x = 0, y = 0, t = 0) => {
  const compiled = compileExpr(source, ["x", "y", "t"]);
  if (!compiled.ok) throw new Error(`${source}: ${compiled.error.code}@${compiled.error.pos}`);
  return compiled.evaluate({ x, y, t });
};
const err = (source: string, vars: readonly ("x" | "y" | "t")[] = ["x"]) => {
  const compiled = compileExpr(source, vars);
  if (compiled.ok) throw new Error(`${source}: 오류여야 한다`);
  return compiled.error;
};

describe("compileExpr: 계산", () => {
  it("연산 우선순위와 결합", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("2 ^ 3 ^ 2")).toBe(512); // 오른쪽 결합
    expect(ev("-2 ^ 2")).toBe(-4); // -(2^2)
    expect(ev("2 ^ -1")).toBe(0.5);
    expect(ev("10 - 4 - 3")).toBe(3);
    expect(ev("7 % 4")).toBe(3);
    expect(ev("2 ** 3")).toBe(8);
  });

  it("변수·상수·함수", () => {
    expect(ev("x^2 + y", 3, 4)).toBe(13);
    expect(ev("sin(pi / 2)")).toBeCloseTo(1);
    expect(ev("cos(π)")).toBeCloseTo(-1);
    expect(ev("tau")).toBeCloseTo(Math.PI * 2);
    expect(ev("e")).toBeCloseTo(Math.E);
    expect(ev("sqrt(16) + abs(-3) + max(1, 5, 2) + min(4, 2)")).toBe(4 + 3 + 5 + 2);
    expect(ev("log(100)")).toBe(2);
    expect(ev("log(8, 2)")).toBeCloseTo(3);
    expect(ev("atan2(1, 1)")).toBeCloseTo(Math.PI / 4);
    expect(ev("mod(-1, 3)")).toBe(2);
    expect(ev("SIN(0) + Cos(0)")).toBe(1); // 이름은 대소문자를 구분하지 않는다
    expect(ev("t * 2", 0, 0, 5)).toBe(10);
  });

  it("생략된 곱셈", () => {
    expect(ev("2x", 3)).toBe(6);
    expect(ev("2pi")).toBeCloseTo(Math.PI * 2);
    expect(ev("2(x + 1)", 2)).toBe(6);
    expect(ev("(x + 1)(x - 1)", 3)).toBe(8);
    expect(ev("x sin(x)", Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(ev("3x^2", 2)).toBe(12);
    expect(ev("x(x + 1)", 2)).toBe(6);
    expect(ev("2e")).toBeCloseTo(2 * Math.E);
    expect(ev("2e3")).toBe(2000);
  });

  it("한글 문서에서 흔한 기호", () => {
    expect(ev("3 × 4 ÷ 2")).toBe(6);
    expect(ev("5 − 2")).toBe(3);
    expect(ev("x²", 3)).toBe(9);
    expect(ev("2π")).toBeCloseTo(Math.PI * 2);
  });

  it("정의되지 않는 값은 NaN, 무한은 Infinity", () => {
    expect(ev("sqrt(-1)")).toBeNaN();
    expect(ev("1 / 0")).toBe(Infinity);
    expect(ev("ln(0)")).toBe(-Infinity);
    expect(ev("log(-1)")).toBeNaN();
  });

  it("쓰는 변수를 알려 준다", () => {
    const a = compileExpr("sin(x) * y", ["x", "y"]);
    expect(a.ok && [...a.vars].sort()).toEqual(["x", "y"]);
    const b = compileExpr("2 + pi", ["x"]);
    expect(b.ok && b.vars.size).toBe(0);
  });
});

describe("compileExpr: 오류", () => {
  it("빈 식·뜻밖의 글자·괄호", () => {
    expect(err("").code).toBe("empty");
    expect(err("   ").code).toBe("empty");
    expect(err("2 + ").code).toBe("unexpected");
    expect(err("2 $ 3")).toEqual({ code: "unexpected", pos: 2 });
    expect(err("(1 + 2").code).toBe("unbalanced");
    expect(err("1 + 2)").code).toBe("unbalanced");
    expect(err("2 3").code).toBe("unexpected");
    expect(err("sin(")).toMatchObject({ code: "unexpected" });
  });

  it("모르는 이름과 허용하지 않은 변수", () => {
    expect(err("foo(1)")).toMatchObject({ code: "unknown_name", name: "foo" });
    expect(err("sin x")).toMatchObject({ code: "unknown_name", name: "sin" });
    expect(err("y + 1", ["x"])).toMatchObject({ code: "unknown_name", name: "y" });
    expect(err("t", ["x"])).toMatchObject({ code: "unknown_name", name: "t" });
    expect(err("process")).toMatchObject({ code: "unknown_name" });
  });

  it("함수 인자 개수", () => {
    expect(err("sin(1, 2)")).toMatchObject({ code: "bad_args", name: "sin" });
    expect(err("atan2(1)")).toMatchObject({ code: "bad_args", name: "atan2" });
    expect(err("max(1)")).toMatchObject({ code: "bad_args", name: "max" });
  });

  it("너무 긴 식·너무 깊은 괄호", () => {
    expect(err("1+".repeat(300) + "1").code).toBe("too_long");
    expect(err("(".repeat(60) + "1" + ")".repeat(60)).code).toBe("too_deep");
  });

  it("코드를 실행하지 못한다 (이름은 허용 목록뿐)", () => {
    for (const evil of ["constructor", "__proto__", "this", "globalThis", "Function('return 1')()", "alert(1)", "x.constructor"]) {
      const compiled = compileExpr(evil, ["x"]);
      expect(compiled.ok, evil).toBe(false);
    }
  });
});
