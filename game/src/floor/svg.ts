// LEMMA WORKS v3 floor — SVG primitives in the Overprint language (flat riso
// inks, multiply where they overlap, upright type, isometric surfaces only).
import { FAMILY, FONT, INK } from '../ui/tokens';
import type { Family } from '../kernel/types';
import type { ItemKind } from '../factory/types';
import { P, dPoly, f1, gridRect, hull, roundGrid, shade, type G2, type S2 } from '../board/geom';

export const VIOLET = FAMILY.scope.ink;
export const ORANGE = FAMILY.contradiction.ink;
/** Jam red: never orange (orange = a successful ⊥). */
export const JAM = '#B3261E';
export const OK = '#3CC7AE';

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Glyph text colour on a family tile. */
export const ON: Record<Family, string> = {
  identity: INK.navy, inverse: '#FFFFFF', structure: '#FFFFFF', equation: INK.navy,
  scope: '#FFFFFF', contradiction: INK.navy, lemma: '#FFFFFF', given: INK.navy,
};
export const railOpacity = (f: Family) => (f === 'lemma' ? 0.34 : f === 'identity' ? 0.62 : 0.52);

/** Machine glyphs typeset as maths: letters italic, ⁻¹/ⁿ as superscripts, operators upright. */
export function glyphSVG(g: string): string {
  const sup = (x: string) => `<tspan font-size="64%" baseline-shift="42%">${esc(x)}</tspan>`;
  const sub = /^([a-zA-Z])([₀-₉0-9′']+)$/.exec(g);
  if (sub) {
    const digits = sub[2]!.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
    return /^\d+$/.test(digits)
      ? `<tspan font-style="italic">${esc(sub[1]!)}</tspan><tspan font-size="62%" baseline-shift="-22%">${digits}</tspan>`
      : `<tspan font-style="italic">${esc(sub[1]!)}</tspan>${esc(sub[2]!)}`;
  }
  const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n' };
  let o = '';
  for (let i = 0; i < g.length;) {
    if (g.startsWith('⁻¹', i)) { o += sup('−1'); i += 2; continue; }
    const ch = g[i]!;
    if (SUP[ch]) { o += sup(SUP[ch]!); i++; continue; }
    if (/[a-zA-Z]/.test(ch) && !(g === '|G|' && false)) o += `<tspan font-style="italic">${esc(ch)}</tspan>`;
    // multiply's t* / *t: the asterisk enlarged and lifted to the maths axis (review 2026-10)
    else if (ch === '*') o += '<tspan font-size="150%" baseline-shift="-34%" dx="1">*</tspan>';
    else if (ch === '=' || ch === '→' || ch === '⇄' || ch === '·') o += `<tspan dx="1">${esc(ch)}</tspan>`;
    else o += esc(ch);
    i++;
  }
  return o;
}

// ───────────── extruded rectangular tiles ─────────────

export interface Box { base: string; hull: string; band: string; upper: string; top: string; inset: string; shadow: string }
const boxCache = new Map<string, Box>();
/**
 * A rounded rectangular tile over grid rect [x0,x1)×[y0,y1) with height h (grid units of TZ). `ch` chamfers the
 * east corner (x1, y0) by that many grid units: the Given Inlet's folded sheet.
 */
export function box(x0: number, y0: number, x1: number, y1: number, h: number, m = 0.09, r = 0.2, ch = 0): Box {
  const key = `${x0}|${y0}|${x1}|${y1}|${h}|${m}|${r}|${ch}`;
  const hit = boxCache.get(key); if (hit) return hit;
  const outline = (z: number, k = 0) => {
    void z;
    const X0 = x0 + m + k, Y0 = y0 + m + k, X1 = x1 - m - k, Y1 = y1 - m - k, c = Math.max(0, ch - k * 0.4);
    return roundGrid(c ? [[X0, Y0], [X1 - c, Y0], [X1, Y0 + c], [X1, Y1], [X0, Y1]] : gridRect(X0, Y0, X1, Y1), r, 6);
  };
  const at = (z: number, k = 0): S2[] => outline(z, k).map(([x, y]) => P(x, y, z));
  const hz = (z0: number, z1: number) => dPoly(hull([...at(z0), ...at(z1)]));
  const sh = outline(0).map(([x, y]) => P(x + 0.13, y + 0.13, 0));
  const b: Box = {
    base: dPoly(at(0)), hull: hz(0, h), band: hz(h * 0.18, h * 0.5), upper: hz(h * 0.5, h),
    top: dPoly(at(h)), inset: dPoly(at(h, 0.12)), shadow: dPoly(sh),
  };
  if (boxCache.size > 4000) boxCache.clear();
  boxCache.set(key, b);
  return b;
}

/** Flat rounded rect on the ground (footprints, selection marks). */
export function groundRect(x0: number, y0: number, x1: number, y1: number, m = 0.04, r = 0.16): string {
  return dPoly(roundGrid(gridRect(x0 + m, y0 + m, x1 - m, y1 - m), r, 5).map(([x, y]) => P(x, y)));
}

// ───────────── open polylines (belts) ─────────────

/** Round the corners of an open grid polyline with radius r (quadratic samples). */
export function roundOpen(line: G2[], r = 0.38, n = 6): G2[] {
  if (line.length < 3) return line;
  const out: G2[] = [line[0]!];
  for (let i = 1; i < line.length - 1; i++) {
    const a = line[i - 1]!, b = line[i]!, c = line[i + 1]!;
    const v1: G2 = [a[0] - b[0], a[1] - b[1]], v2: G2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    if (Math.abs(cross) < 1e-6 || l1 === 0 || l2 === 0) { out.push(b); continue; }
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1: G2 = [b[0] + v1[0] / l1 * rr, b[1] + v1[1] / l1 * rr];
    const p2: G2 = [b[0] + v2[0] / l2 * rr, b[1] + v2[1] / l2 * rr];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push([(1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]]);
    }
  }
  out.push(line[line.length - 1]!);
  return out;
}

/** Ribbon polygon at perpendicular offset o, width w — with per-point normals that respect direction. */
export function band(line: G2[], o: number, w: number): string {
  const norm = (i: number): G2 => {
    const a = line[Math.max(0, i - 1)]!, b = line[Math.min(line.length - 1, i + 1)]!;
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [-ty / l, tx / l];
  };
  const A: S2[] = [], B: S2[] = [];
  line.forEach((p, i) => {
    const n = norm(i);
    A.push(P(p[0] + n[0] * (o - w / 2), p[1] + n[1] * (o - w / 2)));
    B.push(P(p[0] + n[0] * (o + w / 2), p[1] + n[1] * (o + w / 2)));
  });
  return dPoly([...A, ...B.reverse()]);
}
export const polyD = (line: G2[]) => 'M' + line.map(([x, y]) => { const p = P(x, y); return `${f1(p[0])},${f1(p[1])}`; }).join('L');

/** A ground arrow (isometric triangle) at grid point c pointing along unit grid dir d. */
export function groundArrow(c: G2, d: G2, len = 0.2, half = 0.15): string {
  const n: G2 = [-d[1], d[0]];
  const tip: G2 = [c[0] + d[0] * len * 0.6, c[1] + d[1] * len * 0.6];
  const b1: G2 = [c[0] - d[0] * len * 0.4 + n[0] * half, c[1] - d[1] * len * 0.4 + n[1] * half];
  const b2: G2 = [c[0] - d[0] * len * 0.4 - n[0] * half, c[1] - d[1] * len * 0.4 - n[1] * half];
  return dPoly([tip, b1, b2].map(([x, y]) => P(x, y)));
}

/** Chevron (open) on the ground. */
export function groundChevron(c: G2, d: G2, s = 0.1): string {
  const n: G2 = [-d[1], d[0]];
  const tip: G2 = [c[0] + d[0] * s, c[1] + d[1] * s];
  const a: G2 = [c[0] - d[0] * s + n[0] * s * 1.25, c[1] - d[1] * s + n[1] * s * 1.25];
  const b: G2 = [c[0] - d[0] * s - n[0] * s * 1.25, c[1] - d[1] * s - n[1] * s * 1.25];
  const pa = P(a[0], a[1]), pt = P(tip[0], tip[1]), pb = P(b[0], b[1]);
  return `M${f1(pa[0])},${f1(pa[1])}L${f1(pt[0])},${f1(pt[1])}L${f1(pb[0])},${f1(pb[1])}`;
}

// ───────────── item-kind silhouettes (port ghosts) ─────────────

/** A small upright ghost of the item a port wants, centred at screen (x, y). */
export function kindGhost(kind: ItemKind, x: number, y: number, ink: string = INK.navy3, role?: string): string {
  const st = `fill="#fff" stroke="${ink}" stroke-width="1.1" stroke-dasharray="2 1.8"`;
  const tx = (s: string, size = 9.5, dy = 3.3, font: string = FONT.math) => `<text x="${f1(x)}" y="${f1(y + dy)}" text-anchor="middle" font-family="${font}" font-size="${size}" fill="${ink}">${s}</text>`;
  if (role === 'rule' || kind === 'law' || kind === 'cond') return `<rect x="${f1(x - 8)}" y="${f1(y - 6)}" width="16" height="12" rx="2.2" ${st}/>${tx(kind === 'cond' ? '⟹' : '∀', 9)}`;
  switch (kind) {
    case 'term': return `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.2" ${st}/><circle cx="${f1(x)}" cy="${f1(y)}" r="1.4" fill="${ink}"/>`;
    case 'size': return `<rect x="${f1(x - 9)}" y="${f1(y - 6)}" width="18" height="12" rx="2" ${st}/>${tx('|<tspan font-style="italic">G</tspan>|', 8)}`;
    case 'bot': {
      const pts: string[] = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; pts.push(`${f1(x + 6.4 * Math.cos(a))},${f1(y + 6.4 * Math.sin(a))}`); }
      return `<polygon points="${pts.join(' ')}" ${st}/>${tx('⊥', 9)}`;
    }
    case 'neq': return `<rect x="${f1(x - 9)}" y="${f1(y - 6.5)}" width="18" height="13" rx="6.5" ${st}/>${tx('≠', 10.5, 3.5)}`;
    default: return `<rect x="${f1(x - 9)}" y="${f1(y - 6.5)}" width="18" height="13" rx="6.5" ${st}/>${tx('=', 10.5, 3.5)}`;
  }
}

export const famInk = (f: Family) => FAMILY[f].ink;
export const famText = (f: Family) => FAMILY[f].text;
export const hullFill = (f: Family) => shade(FAMILY[f].ink, f === 'identity' ? 0.2 : 0.26);

/** <defs> shared by the floor (patterns for registration crosses, grid, hatches). */
export function defsSVG(): string {
  // lattice vectors for crosses every 2 grid units: P(2,0) = (84,42), P(0,2) = (-84,42) → rect 168×84 pattern
  const cross = (x: number, y: number) => `M${x - 3.5},${y}h7M${x},${y - 3.5}v7`;
  return `<defs>
    <pattern id="fl-cross" patternUnits="userSpaceOnUse" width="168" height="84"><path d="${cross(0, 0)}${cross(168, 0)}${cross(0, 84)}${cross(168, 84)}${cross(84, 42)}" stroke="${INK.grid}" stroke-width="1" fill="none"/></pattern>
    <pattern id="fl-grid" patternUnits="userSpaceOnUse" width="84" height="42"><path d="M0,0L84,42M0,42L84,0" fill="none" stroke="${INK.navy}" stroke-width=".7" opacity=".42"/></pattern>
    <radialGradient id="fl-gridfade"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".45" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="fl-gridmask" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"><circle id="fl-gridspot" cx="0" cy="0" r="250" fill="url(#fl-gridfade)"/></mask>
    <pattern id="fl-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(-30)"><rect width="7" height="7" fill="${INK.navy}"/><rect width="3.6" height="7" fill="${INK.gold}"/></pattern>
    <linearGradient id="fl-mast" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#5A6488"/><stop offset=".45" stop-color="#2A3358"/><stop offset="1" stop-color="${INK.hullDark}"/></linearGradient>
    <pattern id="fl-jam" patternUnits="userSpaceOnUse" width="5" height="5"><rect width="5" height="5" fill="${JAM}"/><path d="M0,0L5,5M5,0L0,5" stroke="#fff" stroke-width=".9" opacity=".75"/></pattern>
    <pattern id="fl-bad" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect width="8" height="8" fill="${JAM}" opacity=".08"/><rect width="2" height="8" fill="${JAM}" opacity=".32"/></pattern>
  </defs>`;
}
