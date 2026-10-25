import { describe, expect, it } from "vitest";

import { formatTick, niceTicks, plotDescription, plotToSvg } from "./plotSvg";
import { parsePlot } from "./plot";

const svg = (source: string, options = {}) => {
  const parsed = parsePlot(source);
  if (!parsed.ok) throw new Error(parsed.error.code);
  return plotToSvg(parsed.spec, options);
};
const count = (text: string, token: string) => text.split(token).length - 1;

describe("niceTicks · formatTick", () => {
  it("1·2·5 간격의 눈금", () => {
    expect(niceTicks(0, 10, 5).ticks).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-1.5, 1.5, 6).ticks).toEqual([-1.5, -1, -0.5, 0, 0.5, 1, 1.5]);
    expect(niceTicks(0, 1000, 5).step).toBe(200);
    expect(niceTicks(3, 3).ticks).toEqual([3]);
  });

  it("눈금 글자: 불필요한 0을 떼고 -0은 0", () => {
    expect(formatTick(2, 2)).toBe("2");
    expect(formatTick(10, 2)).toBe("10");
    expect(formatTick(-10, 2)).toBe("-10");
    expect(formatTick(100, 50)).toBe("100");
    expect(formatTick(1.5, 0.5)).toBe("1.5");
    expect(formatTick(0.5, 0.5)).toBe("0.5");
    expect(formatTick(0.25, 0.05)).toBe("0.25");
    expect(formatTick(-0, 1)).toBe("0");
    expect(formatTick(1e7, 1e6)).toBe("1e7");
    expect(formatTick(0.0001, 0.0001)).toBe("1e-4");
  });
});

describe("plotToSvg: 2D", () => {
  it("눈금 글자가 잘리지 않는다 (10이 1이 되지 않는다)", () => {
    const out = svg("y = x");
    expect(out).toContain(">-10</text>");
    expect(out).toContain(">10</text>");
  });

  it("곡선·눈금·제목이 든 SVG를 낸다", () => {
    const out = svg("title: 사인\nx: -6..6\ny = sin(x)");
    expect(out.startsWith("<svg ")).toBe(true);
    expect(out.endsWith("</svg>")).toBe(true);
    expect(out).toContain('viewBox="0 0 640 400"');
    expect(out).toContain(">사인</text>");
    expect(count(out, "<path")).toBeGreaterThanOrEqual(2); // 격자 + 곡선
    expect(out).toContain('role="img"');
    expect(out).toContain('stroke="var(--md-plot-1,#2563eb)"');
    expect(out).toContain("<clipPath");
  });

  it("범례: 이름이 있거나 계열이 여럿일 때", () => {
    expect(svg("y = x")).not.toContain("stroke-linecap=\"round\"/><text"); // 범례 줄이 없다
    expect(svg("y = sin(x)  # 사인")).toContain(">사인</text>");
    const multi = svg("y = sin(x)\ny = cos(x)");
    expect(multi).toContain(">y = sin(x)</text>");
    expect(multi).toContain("--md-plot-2");
  });

  it("격자 끄기 · 같은 비율", () => {
    expect(svg("grid: off\ny = x")).not.toContain('stroke-opacity=".14"');
    const circle = svg("aspect: equal\n(cos(t), sin(t)), t = 0..2pi");
    expect(circle).toContain("<path");
  });

  it("같은 입력이면 같은 출력 (결정적)", () => {
    expect(svg("y = sin(x)")).toBe(svg("y = sin(x)"));
  });

  it("사용자 글을 이스케이프한다", () => {
    const out = svg('title: <script>alert("x")</script>\ny = x  # <img onerror=1>');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&quot;x&quot;");
  });

  it("그림 id가 달라 한 문서에 여럿 있어도 clipPath가 겹치지 않는다", () => {
    const a = svg("y = sin(x)").match(/clipPath id="([^"]+)"/)![1];
    const b = svg("y = cos(x)").match(/clipPath id="([^"]+)"/)![1];
    expect(a).not.toBe(b);
    expect(svg("y = x", { id: "mine" })).toContain('id="mine-clip"');
  });
});

describe("plotToSvg: 3D", () => {
  it("곡면은 다각형으로, 축 이름이 든다", () => {
    const out = svg("title: 포물면\nz = x^2 + y^2");
    expect(out).toContain('viewBox="0 0 640 460"');
    expect(count(out, "<polygon")).toBe(31 * 31);
    for (const axis of [">x: ", ">y: ", ">z</text>"]) expect(out).toContain(axis);
    expect(out).toContain("x: -5 … 5");
    expect(out).toContain("rgb(");
  });

  it("시점을 바꾸면 그림이 바뀐다", () => {
    const a = svg("z = x*y");
    const b = svg("z = x*y", { yaw: 40, pitch: 60 });
    expect(a).not.toBe(b);
    expect(count(a, "<polygon")).toBe(count(b, "<polygon"));
    expect(svg("z = x*y")).toBe(a);
  });

  it("정의되지 않은 칸은 건너뛴다", () => {
    const full = count(svg("x: -1..1\ny: -1..1\nz = x+y"), "<polygon");
    const part = count(svg("x: -1..1\ny: -1..1\nz = sqrt(x)"), "<polygon");
    expect(part).toBeLessThan(full);
    expect(part).toBeGreaterThan(0);
  });

  it("3차원 곡선은 선으로", () => {
    const out = svg("(cos(t), sin(t), t/5), t = 0..6pi");
    expect(count(out, "<polygon")).toBe(0);
    expect(out).toContain('stroke="var(--md-plot-1,#2563eb)"');
  });

  it("극단 시점(위·아래에서)에도 NaN이 없다", () => {
    for (const pitch of [-89, 0, 89, 120]) {
      const out = svg("z = sin(x)*cos(y)", { yaw: 0, pitch });
      expect(out).not.toContain("NaN");
      expect(out).not.toContain("Infinity");
    }
  });
});

describe("plotDescription", () => {
  it("제목이 있으면 제목과 식, 없으면 식들", () => {
    const a = parsePlot("title: T\ny = x");
    const b = parsePlot("y = x\ny = 2x");
    expect(a.ok && plotDescription(a.spec)).toBe("T (y = x)");
    expect(b.ok && plotDescription(b.spec)).toBe("y = x; y = 2x");
  });
});
