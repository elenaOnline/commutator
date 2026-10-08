// LEMMA WORKS board — isometric geometry. Everything is laid out in GRID units
// and projected with a 2:1 dimetric projection (visual-direction.md §3):
//   P(gx, gy, z) = ((gx − gy)·TW/2, (gx + gy)·TH/2 − z·TZ)
// Only surfaces are projected; text is always upright.

export const TW = 84;
export const TH = 42;
export const TZ = 42;

export type G2 = [number, number];
export type S2 = [number, number];

export const P = (gx: number, gy: number, z = 0): S2 => [(gx - gy) * TW / 2, (gx + gy) * TH / 2 - z * TZ];

/** Screen unit vector of the +gx direction (the belt run direction). */
export const RUN: S2 = (() => { const a = P(1, 0); const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; })();
/** Screen length of one grid unit along +gx. */
export const RUN_LEN = Math.hypot(TW / 2, TH / 2);
export const RUN_ANGLE = Math.atan2(RUN[1], RUN[0]) * 180 / Math.PI;

export const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
export const pts = (a: S2[]) => a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
export const dPoly = (a: S2[]) => 'M' + a.map((p) => `${f1(p[0])},${f1(p[1])}`).join('L') + 'Z';

/** Quadratic-sampled rounded polygon in GRID space (keeps curvature isometric). */
export function roundGrid(poly: G2[], r: number, n = 8): G2[] {
  const out: G2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i - 1 + poly.length) % poly.length]!, b = poly[i]!, c = poly[(i + 1) % poly.length]!;
    const v1: G2 = [a[0] - b[0], a[1] - b[1]], v2: G2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: G2 = [b[0] + v1[0] / l1 * rr, b[1] + v1[1] / l1 * rr];
    const p2: G2 = [b[0] + v2[0] / l2 * rr, b[1] + v2[1] / l2 * rr];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push([(1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]]);
    }
  }
  return out;
}

export const gridRect = (x0: number, y0: number, x1: number, y1: number): G2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Andrew's monotone chain convex hull. */
export function hull(points: S2[]): S2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: S2, a: S2, b: S2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: S2[] = [], up: S2[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]!; while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/** Tile outline (rounded square of half-size e in grid space) at height z, relative to the tile centre. */
export function tileOutline(e: number, z: number, r = 0.2): S2[] {
  return roundGrid(gridRect(-e, -e, e, e), r * e * 2, 6).map(([x, y]) => P(x, y, z));
}

export interface TileShape { base: string; top: string; inset: string; hull: string; band: string; upper: string; h: number; e: number }
const shapeCache = new Map<string, TileShape>();
/** Cached, translation-invariant tile paths (screen space, centred on the tile's ground centre). */
export function tileShape(e: number, h: number): TileShape {
  const key = `${e}|${h}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const at = (z: number, k = 0) => tileOutline(e - k, z);
  const hz = (z0: number, z1: number) => dPoly(hull([...at(z0), ...at(z1)]));
  const s: TileShape = {
    base: dPoly(at(0)), top: dPoly(at(h)), inset: dPoly(at(h, Math.min(0.2, e * 0.24))),
    hull: hz(0, h), band: hz(h * 0.18, h * 0.46), upper: hz(h * 0.46, h), h, e,
  };
  shapeCache.set(key, s);
  return s;
}

/** Isometric ellipse (a grid-space circle of radius r) as rx/ry. */
export const isoEllipse = (r: number) => ({ rx: r * Math.SQRT2 * TW / 2, ry: r * Math.SQRT2 * TH / 2 });

/** Sample a grid-space cubic Bézier. */
export function cubic(p0: G2, p1: G2, p2: G2, p3: G2, n = 24): G2[] {
  const out: G2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** Offset a grid-space centreline by o (perpendicular, grid units). */
export function offsetLine(line: G2[], o: number): G2[] {
  return line.map((p, i) => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!;
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [p[0] - ty / l * o, p[1] + tx / l * o];
  });
}

/** A ribbon polygon (screen points) of width w centred at offset o from the centreline. */
export function ribbon(line: G2[], o: number, w: number): S2[] {
  const A = offsetLine(line, o - w / 2), B = offsetLine(line, o + w / 2);
  return [...A, ...B.reverse()].map(([x, y]) => P(x, y));
}

/** Cut a polyline to its first fraction t of arclength. */
export function cutLine(line: G2[], t: number): G2[] {
  if (t >= 1) return line;
  const seg: number[] = []; let total = 0;
  for (let i = 1; i < line.length; i++) { const d = Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]); seg.push(d); total += d; }
  let want = Math.max(0.0001, t) * total; const out: G2[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const d = seg[i - 1]!;
    if (want <= d) { const k = want / d; out.push([line[i - 1]![0] + (line[i]![0] - line[i - 1]![0]) * k, line[i - 1]![1] + (line[i]![1] - line[i - 1]![1]) * k]); return out; }
    want -= d; out.push(line[i]!);
  }
  return out;
}

export const shade = (hex: string, t: number) => {
  const a = parseInt(hex.slice(1), 16);
  return '#' + [a >> 16, (a >> 8) & 255, a & 255].map((v) => Math.round(v * (1 - t)).toString(16).padStart(2, '0')).join('');
};
export const tint = (hex: string, t: number) => {
  const a = parseInt(hex.slice(1), 16);
  return '#' + [a >> 16, (a >> 8) & 255, a & 255].map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
};
