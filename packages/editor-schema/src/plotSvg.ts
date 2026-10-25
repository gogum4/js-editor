/**
 * 수식 그래프를 **SVG 글자**로 그린다(`plot.ts`의 명세 → 그림). 의존성 없는 순수 함수라 서버(블로그·렌더러)와 브라우저(편집기 미리보기)가 같은 그림을 낸다.
 * 색은 `currentColor`와 CSS 변수(`--md-plot-1` … `--md-plot-8`, 없으면 기본 색)라 라이트/다크에서 모두 읽힌다. 글자는 모두 이스케이프한다.
 * 3D는 직교 투영 + 화가 알고리즘(먼 면부터)이고, 시점(`yaw`·`pitch`, 도)을 바꿔 다시 그리면 회전한다.
 */

import { type PlotSpec, type PlotSpec2D, type PlotSpec3D, type Range, sample2D, sample3D } from "./plot";

export interface PlotSvgOptions {
  width?: number;
  height?: number;
  /** 3D 시점(도): 가로 회전과 위에서 내려다보는 각. */
  yaw?: number;
  pitch?: number;
  /** 한 문서에 그림이 여럿일 때 `clipPath` id가 겹치지 않게 하는 접두사. */
  id?: string;
}

export const DEFAULT_YAW = -35;
export const DEFAULT_PITCH = 28;
const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];
/** viridis 근사(어두운 배경과 밝은 배경 모두에서 읽힌다). */
const GRADIENT: ReadonlyArray<readonly [number, number, number]> = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();
const color = (index: number) => `var(--md-plot-${(index % PALETTE.length) + 1},${PALETTE[index % PALETTE.length]})`;
const FONT = 'font-family="system-ui,-apple-system,sans-serif"';

/** 눈금: 1·2·5 × 10ⁿ 간격으로 `target`개 안팎. */
export function niceTicks(min: number, max: number, target = 6): { ticks: number[]; step: number } {
  const span = max - min;
  if (!(span > 0)) return { ticks: [min], step: 1 };
  const raw = span / Math.max(1, target);
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const base = raw / power;
  const step = (base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10) * power;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { ticks, step };
}

export function formatTick(value: number, step: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e6 || (abs < 1e-3 && abs > 0)) return value.toExponential(1).replace(/\.0e/, "e").replace("e+", "e");
  const decimals = Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  const text = value.toFixed(decimals);
  // 소수점 아래의 불필요한 0만 뗀다(정수 10이 1이 되면 안 된다).
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** 접근성 이름: 제목이 있으면 제목, 없으면 식들. */
export function plotDescription(spec: PlotSpec): string {
  const sources = spec.series.map((s) => s.source).join("; ");
  return spec.title ? `${spec.title} (${sources})` : sources;
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function svgOpen(width: number, height: number, spec: PlotSpec): string {
  const description = esc(plotDescription(spec));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${description}" class="md-plot-svg" style="max-width:${width}px;height:auto"><title>${description}</title>`;
}

function legend(items: Array<{ text: string; color: string }>, x: number, y: number): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item, i) => {
      const cy = y + i * 16;
      return `<line x1="${x}" x2="${x + 18}" y1="${cy}" y2="${cy}" stroke="${item.color}" stroke-width="2.5" stroke-linecap="round"/><text x="${x + 24}" y="${cy + 4}" font-size="11" fill="currentColor" ${FONT}>${esc(item.text)}</text>`;
    })
    .join("");
  const longest = Math.max(...items.map((i) => i.text.length));
  return `<g><rect x="${x - 6}" y="${y - 12}" width="${Math.min(260, 36 + longest * 6.2)}" height="${items.length * 16 + 6}" rx="4" fill="currentColor" fill-opacity=".06"/>${rows}</g>`;
}

// ───────────────────────── 2D ─────────────────────────

function plot2dSvg(spec: PlotSpec2D, width: number, height: number, idPrefix: string): string {
  const sampled = sample2D(spec);
  let [x0, x1] = sampled.x;
  let [y0, y1] = sampled.y;
  const margin = { l: 50, r: 16, t: spec.title ? 36 : 16, b: 30 };
  const pw = width - margin.l - margin.r;
  const ph = height - margin.t - margin.b;

  if (spec.equal) {
    // 가로·세로의 한 칸이 같은 길이가 되게 더 좁은 쪽 범위를 넓힌다.
    const unitX = (x1 - x0) / pw;
    const unitY = (y1 - y0) / ph;
    if (unitX > unitY) {
      const mid = (y0 + y1) / 2;
      y0 = mid - (unitX * ph) / 2;
      y1 = mid + (unitX * ph) / 2;
    } else {
      const mid = (x0 + x1) / 2;
      x0 = mid - (unitY * pw) / 2;
      x1 = mid + (unitY * pw) / 2;
    }
  }
  const px = (x: number) => margin.l + ((x - x0) / (x1 - x0)) * pw;
  const py = (y: number) => margin.t + ph - ((y - y0) / (y1 - y0)) * ph;
  const clipId = `${idPrefix}-clip`;
  const xt = niceTicks(x0, x1, Math.round(pw / 80));
  const yt = niceTicks(y0, y1, Math.round(ph / 50));

  const parts: string[] = [svgOpen(width, height, spec), `<defs><clipPath id="${clipId}"><rect x="${margin.l}" y="${margin.t}" width="${pw}" height="${ph}"/></clipPath></defs>`];
  if (spec.title) parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="14" font-weight="600" fill="currentColor" ${FONT}>${esc(spec.title)}</text>`);
  if (spec.grid) {
    const g = [...xt.ticks.map((v) => `M${n1(px(v))} ${margin.t}V${margin.t + ph}`), ...yt.ticks.map((v) => `M${margin.l} ${n1(py(v))}H${margin.l + pw}`)];
    parts.push(`<path d="${g.join("")}" stroke="currentColor" stroke-opacity=".14" fill="none"/>`);
  }
  parts.push(`<rect x="${margin.l}" y="${margin.t}" width="${pw}" height="${ph}" fill="none" stroke="currentColor" stroke-opacity=".4"/>`);
  if (y0 < 0 && y1 > 0) parts.push(`<line x1="${margin.l}" x2="${margin.l + pw}" y1="${n1(py(0))}" y2="${n1(py(0))}" stroke="currentColor" stroke-opacity=".6" stroke-width="1.2"/>`);
  if (x0 < 0 && x1 > 0) parts.push(`<line y1="${margin.t}" y2="${margin.t + ph}" x1="${n1(px(0))}" x2="${n1(px(0))}" stroke="currentColor" stroke-opacity=".6" stroke-width="1.2"/>`);

  const curves = sampled.lines
    .map((segments, index) => {
      const d = segments
        .filter((segment) => segment.length > 1)
        .map((segment) => "M" + segment.map(([x, y]) => `${n1(px(x))} ${n1(py(y))}`).join("L"))
        .join("");
      return d === "" ? "" : `<path d="${d}" fill="none" stroke="${color(index)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    })
    .join("");
  parts.push(`<g clip-path="url(#${clipId})">${curves}</g>`);

  const labels: string[] = [];
  for (const v of xt.ticks) labels.push(`<text x="${n1(px(v))}" y="${margin.t + ph + 16}" text-anchor="middle">${esc(formatTick(v, xt.step))}</text>`);
  for (const v of yt.ticks) labels.push(`<text x="${margin.l - 6}" y="${n1(py(v) + 4)}" text-anchor="end">${esc(formatTick(v, yt.step))}</text>`);
  parts.push(`<g font-size="11" fill="currentColor" fill-opacity=".75" ${FONT}>${labels.join("")}</g>`);

  const named = spec.series.map((series, index) => ({ text: series.label ?? (spec.series.length > 1 ? series.source : ""), color: color(index) })).filter((item) => item.text !== "");
  parts.push(legend(named, margin.l + 12, margin.t + 18));
  parts.push("</svg>");
  return parts.join("");
}

// ───────────────────────── 3D ─────────────────────────

function gradient(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t)) * (GRADIENT.length - 1);
  const i = Math.min(GRADIENT.length - 2, Math.floor(clamped));
  const f = clamped - i;
  const a = GRADIENT[i]!;
  const b = GRADIENT[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

interface Projector {
  /** 정규화 좌표(-0.5~0.5)의 점 → 화면 x, y와 깊이(클수록 멀다). */
  point: (u: number, v: number, w: number) => [number, number, number];
  /** 방향 벡터(이동 없음) → 같은 변환. */
  vector: (u: number, v: number, w: number) => [number, number, number];
}

function projector(width: number, height: number, yawDeg: number, pitchDeg: number, topPad: number): Projector {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (Math.min(89, Math.max(-89, pitchDeg)) * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cx = width / 2;
  const cyScreen = (height + topPad) / 2;
  // 정육면체 한가운데에서 가장 먼 모서리까지가 √3/2 — 어떤 각도에서도 상자 안에 들어오게 한 번에 정한 배율.
  const scale = (Math.min(width - 90, height - topPad - 50) / 2) / 0.866;
  const vector = (u: number, v: number, w: number): [number, number, number] => {
    const x1 = u * cy - v * sy;
    const y1 = u * sy + v * cy;
    return [x1, w * cp + y1 * sp, y1 * cp - w * sp];
  };
  return {
    vector,
    point: (u, v, w) => {
      const [a, b, depth] = vector(u, v, w);
      return [cx + a * scale, cyScreen - b * scale, depth];
    },
  };
}

function plot3dSvg(spec: PlotSpec3D, width: number, height: number, yaw: number, pitch: number): string {
  const data = sample3D(spec, { grid: 32 });
  const [x0, x1] = data.x;
  const [y0, y1] = data.y;
  const [z0, z1] = data.z;
  const topPad = spec.title ? 30 : 8;
  const proj = projector(width, height, yaw, pitch, topPad);
  const nu = (x: number) => (x - x0) / (x1 - x0) - 0.5;
  const nv = (y: number) => (y - y0) / (y1 - y0) - 0.5;
  const nw = (z: number) => (Math.min(z1, Math.max(z0, z)) - z0) / (z1 - z0) - 0.5;

  const parts: string[] = [svgOpen(width, height, spec)];
  if (spec.title) parts.push(`<text x="${width / 2}" y="22" text-anchor="middle" font-size="14" font-weight="600" fill="currentColor" ${FONT}>${esc(spec.title)}</text>`);

  // 상자의 12개 모서리(곡면 뒤에 흐리게).
  const corners: Array<[number, number, number]> = [];
  for (const w of [-0.5, 0.5]) for (const v of [-0.5, 0.5]) for (const u of [-0.5, 0.5]) corners.push([u, v, w]);
  const edge = (a: number, b: number) => {
    const p = proj.point(...corners[a]!);
    const q = proj.point(...corners[b]!);
    return `M${n1(p[0])} ${n1(p[1])}L${n1(q[0])} ${n1(q[1])}`;
  };
  if (spec.grid) {
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
    parts.push(`<path d="${edges.map(([a, b]) => edge(a, b)).join("")}" stroke="currentColor" stroke-opacity=".22" fill="none"/>`);
  }

  // 곡면: 칸마다 사각형 → 먼 것부터.
  interface Face {
    depth: number;
    points: string;
    fill: string;
  }
  const faces: Face[] = [];
  for (const surface of data.surfaces) {
    const { nx, ny, z } = surface;
    const xs = (i: number) => x0 + ((x1 - x0) * i) / (nx - 1);
    const ys = (j: number) => y0 + ((y1 - y0) * j) / (ny - 1);
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const v00 = z[j * nx + i]!;
        const v10 = z[j * nx + i + 1]!;
        const v11 = z[(j + 1) * nx + i + 1]!;
        const v01 = z[(j + 1) * nx + i]!;
        if (Number.isNaN(v00) || Number.isNaN(v10) || Number.isNaN(v11) || Number.isNaN(v01)) continue;
        const p00 = proj.point(nu(xs(i)), nv(ys(j)), nw(v00));
        const p10 = proj.point(nu(xs(i + 1)), nv(ys(j)), nw(v10));
        const p11 = proj.point(nu(xs(i + 1)), nv(ys(j + 1)), nw(v11));
        const p01 = proj.point(nu(xs(i)), nv(ys(j + 1)), nw(v01));
        // 면의 기울기로 밝기를 조금 바꾼다: 화면을 정면으로 보는 면이 가장 밝다.
        const e1 = [p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]];
        const e2 = [p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]];
        const nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
        const nx3 = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
        const ny3 = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
        const len = Math.hypot(nx3, ny3, nz) || 1;
        const shade = 0.62 + 0.38 * Math.abs(nz / len);
        const t = ((v00 + v10 + v11 + v01) / 4 - z0) / (z1 - z0);
        const [r, g, b] = gradient(t).map((c) => Math.round(c * shade)) as [number, number, number];
        faces.push({
          depth: (p00[2] + p10[2] + p11[2] + p01[2]) / 4,
          points: [p00, p10, p11, p01].map((p) => `${n1(p[0])},${n1(p[1])}`).join(" "),
          fill: `rgb(${r},${g},${b})`,
        });
      }
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  if (faces.length > 0) parts.push(`<g stroke="rgba(0,0,0,.18)" stroke-width=".5" stroke-linejoin="round">${faces.map((f) => `<polygon points="${f.points}" fill="${f.fill}"/>`).join("")}</g>`);

  // 곡선
  for (const curve of data.curves) {
    let d = "";
    let pen = false;
    for (const p of curve.points) {
      if (!p) {
        pen = false;
        continue;
      }
      const s = proj.point(nu(p[0]), nv(p[1]), nw(p[2]));
      d += `${pen ? "L" : "M"}${n1(s[0])} ${n1(s[1])}`;
      pen = true;
    }
    if (d !== "") parts.push(`<path d="${d}" fill="none" stroke="${color(curve.series)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  // 축: 가장 가까운 아래 모서리에서 뻗는 x·y 축과, 가장 왼쪽 세로 모서리의 z 축.
  const bottom = [0, 1, 2, 3].map((index) => ({ index, p: proj.point(...corners[index]!) }));
  const nearest = bottom.reduce((best, c) => (c.p[2] < best.p[2] ? c : best));
  const leftmost = bottom.reduce((best, c) => (c.p[0] < best.p[0] ? c : best));
  const [nu0, nv0] = [corners[nearest.index]![0], corners[nearest.index]![1]];
  const otherU = nu0 > 0 ? -0.5 : 0.5;
  const otherV = nv0 > 0 ? -0.5 : 0.5;
  const center = proj.point(0, 0, 0);
  const label = (text: string, p: readonly [number, number, number], bold = false) => {
    const dx = p[0] - center[0];
    const dy = p[1] - center[1];
    const len = Math.hypot(dx, dy) || 1;
    const x = p[0] + (dx / len) * 12;
    const y = p[1] + (dy / len) * 12 + 4;
    const anchor = dx > 8 ? "start" : dx < -8 ? "end" : "middle";
    return `<text x="${n1(x)}" y="${n1(y)}" text-anchor="${anchor}"${bold ? ' font-weight="600"' : ""}>${esc(text)}</text>`;
  };
  const tick = (range: Range) => {
    const { step } = niceTicks(range[0], range[1], 4);
    return (value: number) => formatTick(value, step);
  };
  const fx = tick(data.x);
  const fy = tick(data.y);
  const fz = tick(data.z);
  const a0 = proj.point(nu0, nv0, -0.5);
  const ax = proj.point(otherU, nv0, -0.5);
  const ay = proj.point(nu0, otherV, -0.5);
  const lz = corners[leftmost.index]!;
  const z_lo = proj.point(lz[0], lz[1], -0.5);
  const z_hi = proj.point(lz[0], lz[1], 0.5);
  const axisLines = [
    `M${n1(a0[0])} ${n1(a0[1])}L${n1(ax[0])} ${n1(ax[1])}`,
    `M${n1(a0[0])} ${n1(a0[1])}L${n1(ay[0])} ${n1(ay[1])}`,
    `M${n1(z_lo[0])} ${n1(z_lo[1])}L${n1(z_hi[0])} ${n1(z_hi[1])}`,
  ].join("");
  parts.push(`<path d="${axisLines}" stroke="currentColor" stroke-opacity=".75" stroke-width="1.4" fill="none"/>`);
  const mid = (a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
  parts.push(
    `<g font-size="11" fill="currentColor" fill-opacity=".8" ${FONT}>`,
    // x·y 축은 두 축이 한 모서리에서 만나 끝 숫자가 겹치므로 축 이름에 범위를 함께 적는다.
    label(`x: ${fx(data.x[0])} … ${fx(data.x[1])}`, mid(a0, ax), true),
    label(`y: ${fy(data.y[0])} … ${fy(data.y[1])}`, mid(a0, ay), true),
    label(fz(data.z[0]), z_lo),
    label(fz(data.z[1]), z_hi),
    label("z", mid(z_lo, z_hi), true),
    "</g>",
  );

  const named = spec.series
    .map((series, index) => ({ text: series.label ?? (spec.series.length > 1 ? series.source : ""), color: series.type === "curve" ? color(index) : "rgb(33,145,140)" }))
    .filter((item) => item.text !== "");
  parts.push(legend(named, 14, topPad + 14));
  parts.push("</svg>");
  return parts.join("");
}

/**
 * 명세를 SVG 글자로. 기본 크기는 2D 640×400, 3D 640×460(`viewBox`라서 CSS로 줄어든다).
 * 호출하는 쪽은 이 글자를 그대로 HTML에 넣으면 된다(모든 사용자 글은 이스케이프돼 있다).
 */
export function plotToSvg(spec: PlotSpec, options: PlotSvgOptions = {}): string {
  const width = options.width ?? 640;
  const id = options.id ?? `plot-${hash(spec.series.map((s) => s.source).join("\n") + (spec.title ?? ""))}`;
  if (spec.kind === "2d") return plot2dSvg(spec, width, options.height ?? 400, id);
  return plot3dSvg(spec, width, options.height ?? 460, options.yaw ?? DEFAULT_YAW, options.pitch ?? DEFAULT_PITCH);
}
