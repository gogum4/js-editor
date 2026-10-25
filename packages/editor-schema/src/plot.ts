/**
 * 수식 그래프 ` ```plot ` 코드 블록의 **글 → 명세 → 표본** 변환. 노드를 더하지 않는다 — 그래프는 언어가 `plot`인 평범한 코드 블록이고
 * (mermaid와 같은 방식), 편집기·렌더러가 이 글을 읽어 그림을 그린다. 그래서 본문 스키마와 Markdown 왕복은 그대로다.
 *
 * 문법(한 줄에 하나, 빈 줄과 `//` 줄은 무시, 줄 끝의 ` # 이름`은 범례 이름):
 * \`\`\`plot
 * title: 사인과 코사인
 * x: -2pi..2pi          // 가로 범위 (식 가능)
 * y: -1.5..1.5          // 세로 범위 (없으면 자동)
 * y = sin(x)            # 사인
 * y = cos(x)            # 코사인
 * \`\`\`
 * - **2D 함수** \`y = 식\`·\`f(x) = 식\`·그냥 \`식\`(x만 쓰면), **2D 매개변수** \`(cos(t), sin(t)), t = 0..2pi\`(\`for t in a..b\`도 된다).
 * - **3D 곡면** \`z = 식\`·\`z(x,y) = 식\`·그냥 \`식\`(y도 쓰면), **3D 곡선** \`(cos(t), sin(t), t/5), t = 0..6pi\`.
 * - 옵션: \`title:\`, \`x:\`·\`y:\`·\`z:\` 범위(\`a..b\`), \`grid: off\`, \`aspect: equal\`(2D에서 가로세로 비율을 같게).
 * 2D와 3D를 한 그림에 섞을 수 없다. 식은 \`mathExpr.ts\`의 안전한 계산기로만 계산한다.
 */

import { type CompiledExpr, type ExprErrorCode, compileExpr } from "./mathExpr";

export const PLOT_LANGUAGE = "plot";

/** 코드 블록의 언어가 그래프인지(대소문자 무시). */
export function isPlotLanguage(language: string | null | undefined): boolean {
  return typeof language === "string" && language.trim().toLowerCase() === PLOT_LANGUAGE;
}

export type PlotErrorCode = ExprErrorCode | "empty_plot" | "bad_line" | "bad_range" | "mixed_dims" | "too_many" | "bad_option";

export interface PlotError {
  code: PlotErrorCode;
  /** 글의 몇 번째 줄인지(1부터). `empty_plot`은 0. */
  line: number;
  /** 식 오류의 그 줄 안 위치(0부터, 대략). */
  pos?: number;
  name?: string;
}

export type Range = readonly [number, number];

interface SeriesBase {
  /** 그 줄의 식 원문(범례·접근성 이름에 쓴다). */
  source: string;
  /** 줄 끝 `# 이름`. 없으면 null. */
  label: string | null;
}
export type Series2D =
  | (SeriesBase & { type: "fn"; expr: CompiledExpr })
  | (SeriesBase & { type: "param"; x: CompiledExpr; y: CompiledExpr; t: Range });
export type Series3D =
  | (SeriesBase & { type: "surface"; expr: CompiledExpr })
  | (SeriesBase & { type: "curve"; x: CompiledExpr; y: CompiledExpr; z: CompiledExpr; t: Range });

export interface PlotSpec2D {
  kind: "2d";
  title: string | null;
  series: Series2D[];
  x: Range | null;
  y: Range | null;
  grid: boolean;
  equal: boolean;
}
export interface PlotSpec3D {
  kind: "3d";
  title: string | null;
  series: Series3D[];
  x: Range | null;
  y: Range | null;
  z: Range | null;
  grid: boolean;
}
export type PlotSpec = PlotSpec2D | PlotSpec3D;

export type ParsePlotResult = { ok: true; spec: PlotSpec } | { ok: false; error: PlotError };

const MAX_LINES = 40;
const MAX_SERIES_2D = 8;
const MAX_SERIES_3D = 3;
const MAX_LABEL = 60;

/** 상수 식(변수 없음)을 값으로. 범위 끝에 쓴다(`-2pi`, `3*pi/2`). */
function constant(source: string): number | null {
  const compiled = compileExpr(source, []);
  if (!compiled.ok) return null;
  const value = compiled.evaluate({ x: 0, y: 0, t: 0 });
  return Number.isFinite(value) ? value : null;
}

function parseRange(text: string): Range | null {
  const at = text.search(/\.\.|~/);
  if (at < 0) return null;
  const sep = text.startsWith("~", at) ? 1 : 2;
  const lo = constant(text.slice(0, at));
  const hi = constant(text.slice(at + sep));
  return lo !== null && hi !== null && lo < hi ? [lo, hi] : null;
}

/** 괄호 깊이 0의 쉼표로 나눈다. 괄호가 안 맞으면 null. */
function splitTopLevel(text: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return null;
    } else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  parts.push(text.slice(start));
  return parts;
}

const PARAM = /^\((.*)\)\s*(?:,|;|\bfor\b)?\s*t\s*(?:=|\bin\b|∈)\s*(.+)$/i;
const FUNCTION_LINE = /^(?:(y|z|[fgh])\s*(?:\(\s*([xyXY](?:\s*,\s*[xyXY])?)\s*\))?)\s*=\s*(.+)$/i;
const BOOLEAN_ON = /^(on|true|yes|켜짐|켬)$/i;
const BOOLEAN_OFF = /^(off|false|no|꺼짐|끔)$/i;

type Line = { text: string; number: number };

/** 글을 줄로 나눈다: 빈 줄·주석(`//`) 제외, 줄 끝 `# 이름` 분리. */
function lines(source: string): Array<Line & { label: string | null }> {
  const out: Array<Line & { label: string | null }> = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    let text = raw.trim();
    if (text === "" || text.startsWith("//")) return;
    let label: string | null = null;
    const hash = text.search(/(^|\s)#/);
    if (hash >= 0) {
      const found = text.slice(hash).replace(/^\s*#\s*/, "").trim();
      label = found === "" ? null : found.slice(0, MAX_LABEL);
      text = text.slice(0, hash).trim();
    }
    if (text !== "") out.push({ text, number: index + 1, label });
  });
  return out;
}

export function parsePlot(source: string): ParsePlotResult {
  const all = lines(source);
  if (all.length === 0) return { ok: false, error: { code: "empty_plot", line: 0 } };
  if (all.length > MAX_LINES) return { ok: false, error: { code: "too_many", line: all[MAX_LINES]!.number } };

  let title: string | null = null;
  let rx: Range | null = null;
  let ry: Range | null = null;
  let rz: Range | null = null;
  let grid = true;
  let equal = false;
  const series2: Series2D[] = [];
  const series3: Series3D[] = [];

  for (const { text, number, label } of all) {
    const fail = (code: PlotErrorCode, extra: Partial<PlotError> = {}): ParsePlotResult => ({ ok: false, error: { code, line: number, ...extra } });
    const exprFail = (result: { ok: false; error: { code: ExprErrorCode; pos: number; name?: string } }, offset = 0) =>
      fail(result.error.code, { pos: result.error.pos + offset, ...(result.error.name !== undefined ? { name: result.error.name } : {}) });

    // 옵션 줄
    const option = /^([A-Za-z가-힣]+)\s*:\s*(.*)$/.exec(text);
    if (option) {
      const key = option[1]!.toLowerCase();
      const value = option[2]!.trim();
      if (key === "title" || key === "제목") {
        title = value === "" ? null : value.slice(0, 100);
        continue;
      }
      if (key === "x" || key === "y" || key === "z") {
        const range = parseRange(value);
        if (!range) return fail("bad_range");
        if (key === "x") rx = range;
        else if (key === "y") ry = range;
        else rz = range;
        continue;
      }
      if (key === "grid" || key === "격자") {
        if (BOOLEAN_ON.test(value)) grid = true;
        else if (BOOLEAN_OFF.test(value)) grid = false;
        else return fail("bad_option");
        continue;
      }
      if (key === "aspect" || key === "비율") {
        if (/^(equal|same|1:1|같게)$/i.test(value)) equal = true;
        else if (/^(auto|자동)$/i.test(value)) equal = false;
        else return fail("bad_option");
        continue;
      }
      return fail("bad_option", { name: option[1] });
    }

    // 매개변수 곡선 (…), t = a..b
    const param = PARAM.exec(text);
    if (param) {
      const parts = splitTopLevel(param[1]!);
      const range = parseRange(param[2]!.trim());
      if (!parts || (parts.length !== 2 && parts.length !== 3)) return fail("bad_line");
      if (!range) return fail("bad_range");
      const compiled = [];
      for (const part of parts) {
        const result = compileExpr(part, ["t"]);
        if (!result.ok) return exprFail(result);
        compiled.push(result);
      }
      if (compiled.length === 2) series2.push({ type: "param", x: compiled[0]!, y: compiled[1]!, t: range, source: text, label });
      else series3.push({ type: "curve", x: compiled[0]!, y: compiled[1]!, z: compiled[2]!, t: range, source: text, label });
      continue;
    }

    // 함수 줄: y = …, f(x) = …, z = …, z(x,y) = …, 또는 식만
    const fn = FUNCTION_LINE.exec(text);
    let kind: "2d" | "3d";
    let body: string;
    let offset = 0;
    if (fn) {
      const name = fn[1]!.toLowerCase();
      const args = fn[2] ? fn[2].split(",").length : 0;
      body = fn[3]!;
      offset = text.length - body.length;
      kind = name === "z" || args === 2 ? "3d" : "2d";
    } else {
      body = text;
      kind = "2d";
    }
    const vars: ("x" | "y")[] = kind === "3d" || !fn ? ["x", "y"] : ["x"];
    const compiled = compileExpr(body, vars);
    if (!compiled.ok) return exprFail(compiled, offset);
    if (!fn) kind = compiled.vars.has("y") ? "3d" : "2d";
    if (kind === "3d") series3.push({ type: "surface", expr: compiled, source: text, label });
    else series2.push({ type: "fn", expr: compiled, source: text, label });
  }

  if (series2.length > 0 && series3.length > 0) return { ok: false, error: { code: "mixed_dims", line: all[all.length - 1]!.number } };
  if (series2.length === 0 && series3.length === 0) return { ok: false, error: { code: "empty_plot", line: 0 } };
  if (series2.length > MAX_SERIES_2D || series3.length > MAX_SERIES_3D) return { ok: false, error: { code: "too_many", line: all[all.length - 1]!.number } };
  return series3.length > 0
    ? { ok: true, spec: { kind: "3d", title, series: series3, x: rx, y: ry, z: rz, grid } }
    : { ok: true, spec: { kind: "2d", title, series: series2, x: rx, y: ry, grid, equal } };
}

// ───────────────────────── 표본 ─────────────────────────

export interface Sampled2D {
  x: Range;
  y: Range;
  /** 계열마다 끊어진 선분들(데이터 좌표). 정의되지 않은 곳·점근선에서 끊긴다. */
  lines: Array<Array<Array<readonly [number, number]>>>;
}

const DEFAULT_SAMPLES_2D = 600;
const PARAM_SAMPLES = 800;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]!;
}

/**
 * 값들에서 범위를 자동으로 정한다. 대부분의 값(5~95%)이 놓인 폭의 4배를 넘게 퍼져 있으면(점근선·폭발) 극단값을 잘라 내고,
 * 그 폭의 절반만큼 여유를 둔다. 아니면 전체 범위에 6% 여유.
 */
export function autoRange(values: readonly number[]): Range {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return [-1, 1];
  const lo = finite[0]!;
  const hi = finite[finite.length - 1]!;
  const p5 = percentile(finite, 0.05);
  const p95 = percentile(finite, 0.95);
  const core = p95 - p5;
  let min = lo;
  let max = hi;
  if (hi - lo > 4 * Math.max(core, 1e-12)) {
    min = p5 - core * 0.5;
    max = p95 + core * 0.5;
  } else {
    const pad = (hi - lo) * 0.06;
    min = lo - pad;
    max = hi + pad;
  }
  if (!(max > min)) return [min - 1, min + 1];
  return [min, max];
}

export function sample2D(spec: PlotSpec2D, options: { samples?: number } = {}): Sampled2D {
  const samples = options.samples ?? DEFAULT_SAMPLES_2D;
  const scope = { x: 0, y: 0, t: 0 };
  const hasFn = spec.series.some((s) => s.type === "fn");
  const x: Range = spec.x ?? (hasFn ? [-10, 10] : [0, 0]);

  // 1) 점 계산 (데이터 좌표)
  const raw: Array<Array<readonly [number, number]>> = spec.series.map((series) => {
    const points: Array<readonly [number, number]> = [];
    if (series.type === "fn") {
      for (let i = 0; i <= samples; i += 1) {
        scope.x = x[0] + ((x[1] - x[0]) * i) / samples;
        points.push([scope.x, series.expr.evaluate(scope)]);
      }
    } else {
      for (let i = 0; i <= PARAM_SAMPLES; i += 1) {
        scope.t = series.t[0] + ((series.t[1] - series.t[0]) * i) / PARAM_SAMPLES;
        points.push([series.x.evaluate(scope), series.y.evaluate(scope)]);
      }
    }
    return points;
  });

  // 2) 범위
  let xRange: Range = x;
  if (!spec.x && !hasFn) {
    const xs = raw.flat().map((p) => p[0]);
    xRange = autoRange(xs);
  }
  const yRange: Range = spec.y ?? autoRange(raw.flatMap((points, index) => (spec.series[index]!.type === "fn" ? points.filter((p) => p[0] >= xRange[0] && p[0] <= xRange[1]) : points).map((p) => p[1])));

  // 3) 끊기: 정의되지 않은 곳과, 보이는 세로 폭의 몇 배를 한 걸음에 뛰어넘는 곳(점근선)
  const span = yRange[1] - yRange[0];
  const lines = raw.map((points) => {
    const segments: Array<Array<readonly [number, number]>> = [];
    let current: Array<readonly [number, number]> = [];
    let previous: readonly [number, number] | null = null;
    for (const point of points) {
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        if (current.length > 0) segments.push(current);
        current = [];
        previous = null;
        continue;
      }
      if (previous && Math.abs(point[1] - previous[1]) > 4 * span) {
        if (current.length > 0) segments.push(current);
        current = [];
      }
      current.push(point);
      previous = point;
    }
    if (current.length > 0) segments.push(current);
    return segments;
  });
  return { x: xRange, y: yRange, lines };
}

export interface Surface {
  /** 계열 번호. */
  series: number;
  nx: number;
  ny: number;
  /** nx×ny 값(행 우선: `z[j * nx + i]`). 정의되지 않은 곳은 NaN. */
  z: Float64Array;
}
export interface Curve3D {
  series: number;
  points: Array<readonly [number, number, number] | null>;
}
export interface Sampled3D {
  x: Range;
  y: Range;
  z: Range;
  surfaces: Surface[];
  curves: Curve3D[];
}

const DEFAULT_GRID_3D = 40;
const CURVE_SAMPLES_3D = 400;

export function sample3D(spec: PlotSpec3D, options: { grid?: number } = {}): Sampled3D {
  const n = Math.min(80, Math.max(8, options.grid ?? DEFAULT_GRID_3D));
  const x: Range = spec.x ?? [-5, 5];
  const y: Range = spec.y ?? [-5, 5];
  const scope = { x: 0, y: 0, t: 0 };

  const surfaces: Surface[] = [];
  const curves: Curve3D[] = [];
  spec.series.forEach((series, index) => {
    if (series.type === "surface") {
      const z = new Float64Array(n * n);
      for (let j = 0; j < n; j += 1) {
        scope.y = y[0] + ((y[1] - y[0]) * j) / (n - 1);
        for (let i = 0; i < n; i += 1) {
          scope.x = x[0] + ((x[1] - x[0]) * i) / (n - 1);
          const value = series.expr.evaluate(scope);
          z[j * n + i] = Number.isFinite(value) ? value : NaN;
        }
      }
      surfaces.push({ series: index, nx: n, ny: n, z });
    } else {
      const points: Curve3D["points"] = [];
      for (let i = 0; i <= CURVE_SAMPLES_3D; i += 1) {
        scope.t = series.t[0] + ((series.t[1] - series.t[0]) * i) / CURVE_SAMPLES_3D;
        const p: [number, number, number] = [series.x.evaluate(scope), series.y.evaluate(scope), series.z.evaluate(scope)];
        points.push(p.every(Number.isFinite) ? p : null);
      }
      curves.push({ series: index, points });
    }
  });

  // 곡선만 있고 범위를 안 정했으면 곡선이 놓인 곳으로
  let xr: Range = x;
  let yr: Range = y;
  if (surfaces.length === 0) {
    const pts = curves.flatMap((c) => c.points).filter((p): p is readonly [number, number, number] => p !== null);
    if (!spec.x) xr = autoRange(pts.map((p) => p[0]));
    if (!spec.y) yr = autoRange(pts.map((p) => p[1]));
  }
  const zr: Range = spec.z ?? autoRange([...surfaces.flatMap((s) => Array.from(s.z)), ...curves.flatMap((c) => c.points.map((p) => (p ? p[2] : NaN)))]);
  return { x: xr, y: yr, z: zr, surfaces, curves };
}
