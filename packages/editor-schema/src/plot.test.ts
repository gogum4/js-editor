import { describe, expect, it } from "vitest";

import { autoRange, isPlotLanguage, parsePlot, sample2D, sample3D, type PlotSpec2D, type PlotSpec3D } from "./plot";

const ok = (source: string) => {
  const result = parsePlot(source);
  if (!result.ok) throw new Error(`${result.error.code}@${result.error.line}`);
  return result.spec;
};
const fail = (source: string) => {
  const result = parsePlot(source);
  if (result.ok) throw new Error("오류여야 한다");
  return result.error;
};

describe("isPlotLanguage", () => {
  it("plot만, 대소문자와 공백은 무시", () => {
    expect(isPlotLanguage("plot")).toBe(true);
    expect(isPlotLanguage(" Plot ")).toBe(true);
    expect(isPlotLanguage("mermaid")).toBe(false);
    expect(isPlotLanguage(null)).toBe(false);
  });
});

describe("parsePlot: 2D", () => {
  it("함수 줄의 여러 표기와 옵션", () => {
    const spec = ok("title: 사인\nx: -2pi..2pi\ny: -1.5..1.5\ny = sin(x)  # 사인\nf(x) = cos(x)\nx^2 / 10\ngrid: off\naspect: equal") as PlotSpec2D;
    expect(spec.kind).toBe("2d");
    expect(spec.title).toBe("사인");
    expect(spec.series.map((s) => s.label)).toEqual(["사인", null, null]);
    expect(spec.series.every((s) => s.type === "fn")).toBe(true);
    expect(spec.x?.[0]).toBeCloseTo(-Math.PI * 2);
    expect(spec.y).toEqual([-1.5, 1.5]);
    expect(spec.grid).toBe(false);
    expect(spec.equal).toBe(true);
  });

  it("매개변수 곡선 (두 가지 표기)", () => {
    const a = ok("(cos(t), sin(t)), t = 0..2pi") as PlotSpec2D;
    expect(a.series[0]).toMatchObject({ type: "param" });
    const b = ok("(t, t^2) for t in -1..1") as PlotSpec2D;
    expect(b.series[0]).toMatchObject({ type: "param", t: [-1, 1] });
  });

  it("주석·빈 줄은 무시, ~도 범위 구분자", () => {
    const spec = ok("// 설명\n\nx: -3~3\ny = x") as PlotSpec2D;
    expect(spec.x).toEqual([-3, 3]);
    expect(spec.series).toHaveLength(1);
  });
});

describe("parsePlot: 3D", () => {
  it("z 식·y를 쓰는 식은 곡면", () => {
    expect((ok("z = x^2 + y^2") as PlotSpec3D).kind).toBe("3d");
    expect((ok("z(x, y) = sin(x) cos(y)") as PlotSpec3D).series[0]).toMatchObject({ type: "surface" });
    expect((ok("sin(x) * cos(y)") as PlotSpec3D).kind).toBe("3d");
    expect((ok("f(x,y) = x*y") as PlotSpec3D).kind).toBe("3d");
  });

  it("3차원 매개변수 곡선", () => {
    const spec = ok("(cos(t), sin(t), t/5), t = 0..6pi") as PlotSpec3D;
    expect(spec.series[0]).toMatchObject({ type: "curve" });
  });
});

describe("parsePlot: 오류", () => {
  it("빈 그래프·섞인 차원·너무 많은 계열", () => {
    expect(fail("")).toEqual({ code: "empty_plot", line: 0 });
    expect(fail("title: 제목만").code).toBe("empty_plot");
    expect(fail("y = x\nz = x*y")).toMatchObject({ code: "mixed_dims" });
    expect(fail(Array.from({ length: 9 }, (_, i) => `y = x + ${i}`).join("\n")).code).toBe("too_many");
    expect(fail(Array.from({ length: 50 }, () => "y = x").join("\n")).code).toBe("too_many");
  });

  it("식 오류는 줄 번호와 이름을 알려 준다", () => {
    expect(fail("y = x\ny = foo(x)")).toMatchObject({ code: "unknown_name", line: 2, name: "foo" });
    expect(fail("y = sin(")).toMatchObject({ code: "unexpected", line: 1 });
    expect(fail("y = x +")).toMatchObject({ code: "unexpected" });
    expect(fail("y = z + 1")).toMatchObject({ code: "unknown_name", name: "z" });
    expect(fail("y = y")).toMatchObject({ code: "unknown_name", name: "y" }); // 2D 함수는 x만
  });

  it("범위·옵션·줄 모양", () => {
    expect(fail("x: 3..1\ny = x").code).toBe("bad_range");
    expect(fail("x: abc\ny = x").code).toBe("bad_range");
    expect(fail("grid: maybe\ny = x").code).toBe("bad_option");
    expect(fail("color: red\ny = x")).toMatchObject({ code: "bad_option", name: "color" });
    expect(fail("(1), t = 0..1").code).toBe("bad_line");
    expect(fail("(t, t), t = 3..1").code).toBe("bad_range");
  });

  it("코드를 실행하지 못한다", () => {
    for (const evil of ["y = constructor", "y = process.exit(1)", "z = alert(1)", "y = x; while(true){}", "(constructor, 1), t = 0..1"]) {
      expect(parsePlot(evil).ok, evil).toBe(false);
    }
  });
});

describe("sample2D", () => {
  const spec = (source: string) => ok(source) as PlotSpec2D;

  it("함수를 표본으로, 범위는 x 기본 -10..10", () => {
    const s = sample2D(spec("y = x"));
    expect(s.x).toEqual([-10, 10]);
    expect(s.lines[0]).toHaveLength(1);
    expect(s.lines[0]![0]![0]).toEqual([-10, -10]);
    expect(s.lines[0]![0]!.length).toBe(601);
    expect(s.y[0]).toBeLessThan(-10);
    expect(s.y[1]).toBeGreaterThan(10);
  });

  it("정의되지 않은 곳에서 끊긴다", () => {
    const s = sample2D(spec("x: -2..2\ny = sqrt(x)"));
    expect(s.lines[0]).toHaveLength(1);
    expect(s.lines[0]![0]![0]![0]).toBeGreaterThanOrEqual(0);
    const gap = sample2D(spec("x: -2..2\ny = 1 / x"));
    expect(gap.lines[0]!.length).toBeGreaterThanOrEqual(2); // 점근선에서 끊긴다
  });

  it("점근선이 있어도 세로 범위가 터지지 않는다", () => {
    const s = sample2D(spec("x: -6..6\ny = tan(x)"));
    expect(s.y[1] - s.y[0]).toBeLessThan(60);
    expect(s.lines[0]!.length).toBeGreaterThan(2);
  });

  it("세로 범위를 정하면 그대로", () => {
    expect(sample2D(spec("y: -2..2\ny = x^2")).y).toEqual([-2, 2]);
  });

  it("매개변수만 있으면 가로 범위도 곡선에 맞춘다", () => {
    const s = sample2D(spec("(cos(t), sin(t)), t = 0..2pi"));
    expect(s.x[0]).toBeLessThan(-1);
    expect(s.x[1]).toBeGreaterThan(1);
    expect(s.lines[0]).toHaveLength(1);
  });
});

describe("sample3D", () => {
  it("곡면은 격자로, z 범위는 자동", () => {
    const s = sample3D(ok("z = x^2 + y^2") as PlotSpec3D, { grid: 10 });
    expect(s.surfaces).toHaveLength(1);
    expect(s.surfaces[0]!.z).toHaveLength(100);
    expect(s.x).toEqual([-5, 5]);
    expect(s.z[0]).toBeLessThanOrEqual(0.5);
    expect(s.z[1]).toBeGreaterThan(40);
  });

  it("정의되지 않은 곳은 NaN", () => {
    const s = sample3D(ok("x: -1..1\ny: -1..1\nz = sqrt(x)") as PlotSpec3D, { grid: 8 });
    expect(Array.from(s.surfaces[0]!.z).some(Number.isNaN)).toBe(true);
    expect(Array.from(s.surfaces[0]!.z).some((v) => v > 0)).toBe(true);
  });

  it("곡선만 있으면 범위를 곡선에 맞춘다", () => {
    const s = sample3D(ok("(cos(t), sin(t), t/5), t = 0..6pi") as PlotSpec3D);
    expect(s.curves[0]!.points.length).toBe(401);
    expect(s.x[0]).toBeLessThan(-1);
    expect(s.z[1]).toBeGreaterThan(3);
  });

  it("격자 크기는 8~80으로 제한", () => {
    expect(sample3D(ok("z = x*y") as PlotSpec3D, { grid: 1000 }).surfaces[0]!.nx).toBe(80);
    expect(sample3D(ok("z = x*y") as PlotSpec3D, { grid: 1 }).surfaces[0]!.nx).toBe(8);
  });
});

describe("autoRange", () => {
  it("값이 없거나 하나뿐이어도 범위를 만든다", () => {
    expect(autoRange([])).toEqual([-1, 1]);
    expect(autoRange([NaN, Infinity])).toEqual([-1, 1]);
    const flat = autoRange([3, 3, 3]);
    expect(flat[0]).toBeLessThan(3);
    expect(flat[1]).toBeGreaterThan(3);
  });
});
