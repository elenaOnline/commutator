// LEMMA WORKS v3 floor — live items. Packets are drawn as themselves: facts ride
// the twin rails as two bead strings (L on the upper rail, R on the lower, an
// '=' rung leading), terms as one bead string, cards as navy/aqua tiles, ⊥ as an
// orange seal. Positions interpolate between runtime ticks.
import type { Term } from '../kernel/types';
import type { ItemValue, Packet, RunState } from '../factory/types';
import { FAMILY, FONT, INK, VAR } from '../ui/tokens';
import { eulerBlobSVG } from '../ui/euler';
import { P, f1, shade, type G2, type S2 } from '../board/geom';
import { beadPath, beadShape } from '../bench/shapes';
import type { Labels } from '../board/mathsvg';
import type { Geo } from './geo';
import { faceVec } from './adapt';
import { ORANGE, esc } from './svg';
import { polyText } from './math';

const R = 6.5;           // bead radius px
const PITCH = 2 * R + 1.9;
const LANE = 0.2;       // grid offset of each rail from the belt centre-line

type Tok = { k: 'atom'; label: string; slot: number } | { k: 'inv'; label: string; slot: number } | { k: 'var'; label: string; inv: boolean; sort: 'G' | 'Z' } | { k: 'e' } | { k: 'crate'; inv: boolean; inner: Tok[]; exp?: string } | { k: 'more'; n: number };

let VARS: Map<string, 'G' | 'Z'> = new Map();
function toks(t: Term, L: Labels, S: Record<string, number>): Tok[] {
  const word = t.k === 'mul' ? t.fs : [t];
  return word.map((f): Tok => {
    switch (f.k) {
      case 'atom': return VARS.has(f.id) ? { k: 'var', label: L[f.id] ?? f.id, inv: false, sort: VARS.get(f.id)! } : { k: 'atom', label: L[f.id] ?? f.id, slot: S[f.id] ?? 0 };
      case 'meta': return { k: 'atom', label: f.id, slot: 0 };
      case 'e': return { k: 'e' };
      case 'inv':
        if (f.arg.k === 'atom' && VARS.has(f.arg.id)) return { k: 'var', label: L[f.arg.id] ?? f.arg.id, inv: true, sort: VARS.get(f.arg.id)! };
        if (f.arg.k === 'atom' || f.arg.k === 'meta') return { k: 'inv', label: f.arg.k === 'atom' ? L[f.arg.id] ?? f.arg.id : f.arg.id, slot: f.arg.k === 'atom' ? S[f.arg.id] ?? 0 : 0 };
        return { k: 'crate', inv: true, inner: toks(f.arg, L, S) };
      case 'mul': return { k: 'crate', inv: false, inner: toks(f, L, S) };
      // a stack: base^exponent (symbolic exponents) — a crate with its exponent printed on its corner
      case 'pow': return { k: 'crate', inv: false, inner: toks(f.base, L, S), exp: polyText(f.exp, L) };
      case 'int': return { k: 'atom', label: polyText(f.val, L), slot: 0 };
      // Book phase C: f(x) rides as a crate labelled by its map (plain until the Maps visuals land)
      case 'app': return { k: 'crate', inv: false, inner: f.args.flatMap((a) => toks(a, L, S)), exp: L[f.fn] ?? f.fn };
    }
  });
}
/** A variable's label split into its letter and a real subscript (x₁₂ → x, 12). */
const splitVar = (label: string): { base: string; sub: string } => {
  const m = /^(.*?)([₀-₉0-9]+)$/.exec(label);
  return m ? { base: m[1]!, sub: m[2]!.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080)) } : { base: label, sub: '' };
};
const SUB_W = 4.3;         // px per subscript digit (7px Latin Modern)
const SUP_W = 7.6;         // px for a ⁻¹ (6.5px) inside an inverted variable's pill
/** Pill width of a variable bead: a circle for x, wider for each subscript digit and for its own ⁻¹. */
const varW = (label: string, inv = false) => 2 * R + Math.max(0, splitVar(label).sub.length * SUB_W + (inv ? SUP_W : 0) - 2);
/** Room a crate's own ⁻¹ needs after its rim (so it never sits on an inner ⁻¹). */
const CRATE_INV = 0.62;
const units = (t: Tok): number => {
  if (t.k === 'crate') return t.inner.reduce((s, x) => s + units(x), 0) + 0.5 + (t.exp ? 0.35 + t.exp.length * 0.32 : 0) + (t.inv ? CRATE_INV : 0);
  if (t.k === 'more') return 1.6;
  // a variable widens for its subscript and for its own ⁻¹ (the track is diagonal: 1.12 ≈ 1 / cos of its slope)
  if (t.k === 'var') return Math.max(1, (varW(t.label, t.inv) + 1.9) * 1.12 / PITCH);
  return 1;
};
const count = (t: Tok): number => (t.k === 'crate' ? t.inner.reduce((s, x) => s + count(x), 0) : t.k === 'more' ? t.n : 1);
function compress(ts: Tok[], MAXU = 6): Tok[] {
  const total = ts.reduce((s, t) => s + units(t), 0);
  if (total <= MAXU) return ts;
  const kept: Tok[] = []; let u = 0;
  for (const t of ts) {
    if (u + units(t) > MAXU - 1.6 && kept.length) break;
    if (t.k === 'crate' && units(t) > MAXU - 1.6) {
      // too wide to show whole: keep the crate (and its exponent) with its contents counted, never a bare "+n"
      if (!kept.length) { kept.push({ ...t, inner: [{ k: 'more', n: count(t) }] }); u += units(kept[0]!); }
      break;
    }
    kept.push(t); u += units(t);
  }
  const hidden = ts.slice(kept.length).reduce((s, t) => s + count(t), 0);
  return hidden ? [...kept, { k: 'more', n: hidden }] : kept;
}
const wordUnits = (ts: Tok[]) => ts.reduce((s, t) => s + units(t), 0);

function bead(t: Tok, x: number, y: number): string {
  const tx = `<text x="${f1(x)}" y="${f1(y + 3.3)}" text-anchor="middle" font-family="${FONT.math}" font-style="italic" font-size="11.6"`;
  const shape = (slot: number, r: number, attrs: string) => {
    const size = 2 * r + 2;
    return `<path d="${beadPath(beadShape(slot), size, 1)}" transform="translate(${f1(x - size / 2)},${f1(y - size / 2)})" stroke-linejoin="round" ${attrs}/>`;
  };
  if (t.k === 'e') return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${R - 0.5}" fill="${FAMILY.identity.ink}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${R - 0.5}" fill="none" stroke="${FAMILY.identity.text}" stroke-width=".8" opacity=".7"/>${tx} fill="${INK.navy}">e</text>`;
  if (t.k === 'inv') return shape(t.slot, R - 0.8, `fill="#fff" stroke="${INK.navy}" stroke-width="1.7"`) + `${tx} fill="${INK.navy}">${esc(t.label)}</text>`;
  if (t.k === 'atom') return shape(t.slot, R, `fill="${INK.navy}"`) + `${tx} fill="#fff">${esc(t.label)}</text>`;
  if (t.k === 'var') {
    // a variable bead: a SOLID tinted fill (violet for elements, teal for integers), never hatching.
    // Inverted: white with a heavy ring in the same ink, plus ⁻¹ — like a hollow atom bead.
    // The bead is a pill that widens for its label: x₁₂'s digits smaller and lowered, an inverse's ⁻¹ raised,
    // all inside the pill (nothing spills onto a neighbour or the other rail).
    const V = VAR[t.sort];
    const { base, sub } = splitVar(t.label);
    const w = varW(t.label, t.inv);
    const tw = 6.2 + sub.length * SUB_W + (t.inv ? SUP_W : 0); // label width: italic letter, digits, ⁻¹
    const supDy = sub ? -6.6 : -4.4;
    return `<rect x="${f1(x - w / 2)}" y="${f1(y - R)}" width="${f1(w)}" height="${f1(2 * R)}" rx="${R}" fill="${t.inv ? '#fff' : V.fill}" stroke="${V.ring}" stroke-width="${t.inv ? 2.2 : 1.4}"/>` +
      `<text x="${f1(x - tw / 2 + 0.4)}" y="${f1(y + 3.6)}" font-family="${FONT.math}" font-style="italic" font-size="11.5" fill="${V.ink}">${esc(base)}` +
      `${sub ? `<tspan font-style="normal" font-size="7" dy="2.2">${sub}</tspan>` : ''}${t.inv ? `<tspan font-style="normal" font-size="6.5" dx=".4" dy="${supDy}">−1</tspan>` : ''}</text>`;
  }
  return '';
}

/** Lay a word centred at c along screen unit vector d. Returns svg + px length. */
function word(ts: Tok[], c: S2, d: S2, angle: number): { svg: string; len: number } {
  const len = wordUnits(ts) * PITCH;
  let s = -wordUnits(ts) / 2;
  let out = '', under = '';
  const at = (u: number): S2 => [c[0] + d[0] * u * PITCH, c[1] + d[1] * u * PITCH];
  // tray so beads read on the coloured rails
  under += `<g transform="translate(${f1(c[0])},${f1(c[1])}) rotate(${f1(angle)})"><rect x="${f1(-len / 2 - 2.5)}" y="${f1(-R - 2.4)}" width="${f1(len + 5)}" height="${f1(2 * R + 4.8)}" rx="${f1(R + 2.4)}" fill="#fff" opacity=".94"/></g>`;
  const put = (list: Tok[]) => {
    for (const t of list) {
      const w = units(t);
      if (t.k === 'crate') {
        // the crate's own ⁻¹ sits after its rim, in room of its own (never on an inner bead's ⁻¹)
        const body = w - (t.inv ? CRATE_INV : 0);
        const mid = at(s + body / 2), wpx = body * PITCH - 1, hpx = 2 * R + 3;
        under += `<g transform="translate(${f1(mid[0])},${f1(mid[1])}) rotate(${f1(angle)})"><rect x="${f1(-wpx / 2)}" y="${f1(-hpx / 2)}" width="${f1(wpx)}" height="${f1(hpx)}" rx="${f1(hpx / 2)}" fill="${FAMILY.structure.ink}" opacity=".24" class="mul"/>${t.inv ? `<rect x="${f1(-wpx / 2 + 1)}" y="${f1(-hpx / 2 + 1)}" width="${f1(wpx - 2)}" height="${f1(hpx - 2)}" rx="${f1(hpx / 2 - 1)}" fill="none" stroke="${INK.navy}" stroke-width="1.6"/>` : ''}</g>`;
        if (t.inv) { const e = at(s + body + 0.08); out += `<text x="${f1(e[0])}" y="${f1(e[1] - R + 1)}" font-family="${FONT.math}" font-size="8.5" fill="${INK.navy}" paint-order="stroke" stroke="#fff" stroke-width="2.4">−1</text>`; }
        if (t.exp) { const e = at(s + w - t.exp.length * 0.32 - 0.1); out += `<text x="${f1(e[0])}" y="${f1(e[1] - R + 1)}" font-family="${FONT.math}" font-style="italic" font-size="9.5" fill="${INK.navy}" paint-order="stroke" stroke="#fff" stroke-width="2.4">${esc(t.exp)}</text>`; }
        const s0 = s; s += 0.25; put(t.inner); s = s0 + w;
      } else if (t.k === 'more') {
        const m = at(s + w / 2);
        out += `<g transform="translate(${f1(m[0])},${f1(m[1])})"><rect x="-10" y="-6.5" width="20" height="13" rx="6.5" fill="#fff" stroke="${INK.navy}" stroke-width="1" stroke-dasharray="2 1.6"/><text y="3.3" text-anchor="middle" font-family="${FONT.ui}" font-size="8.6" font-weight="600" fill="${INK.navy}">+${t.n}</text></g>`;
        s += w;
      } else { const p = at(s + w / 2); out += bead(t, p[0], p[1]); s += w; }
    }
  };
  put(ts);
  return { svg: under + out, len };
}

export type Axis = 'x' | 'y';
const AX = (() => {
  const n = (v: S2): S2 => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  const dx = n(P(1, 0)), dy = n(P(0, -1));
  return {
    x: { d: dx, angle: Math.atan2(dx[1], dx[0]) * 180 / Math.PI, up: P(0, -LANE), dn: P(0, LANE) },
    y: { d: dy, angle: Math.atan2(dy[1], dy[0]) * 180 / Math.PI, up: P(-LANE, 0), dn: P(LANE, 0) },
  };
})();

const cache = new Map<string, { svg: string; len: number }>();
export const valueKey = (v: ItemValue) => JSON.stringify(v);

/**
 * Packet body centred at (0,0) on its belt, oriented along the belt axis. compact = a queued carrier on a
 * backed-up belt: the rung and the leading bead of each rail only, so a full belt reads as a queue.
 * Returns the svg and its run length in px.
 */
export function packetSVG(v: ItemValue, axis: Axis, L: Labels, S: Record<string, number>, compact = false, vars?: Map<string, 'G' | 'Z'>): { svg: string; len: number } {
  VARS = vars ?? new Map();
  const key = axis + (compact ? 'c' : '') + [...VARS].map(([k, s]) => k + s).join(',') + valueKey(v);
  const hit = cache.get(key); if (hit) return hit;
  const A = AX[axis];
  const MAX = compact ? 2.7 : 6;
  let o = '', len = 2 * R + 6;
  if (v.k === 'fact' && (v.fact.k === 'eq' || v.fact.k === 'neq')) {
    const tl = compress(toks(v.fact.l, L, S), MAX), tr = compress(toks(v.fact.r, L, S), MAX);
    const lw = wordUnits(tl) * PITCH, rw = wordUnits(tr) * PITCH, mx = Math.max(lw, rw);
    len = mx + 12;
    // both words start at the same leading edge so the rung reads as the front of the carrier
    const lc: S2 = [A.up[0] + A.d[0] * (lw - mx) / 2, A.up[1] + A.d[1] * (lw - mx) / 2];
    const rc: S2 = [A.dn[0] + A.d[0] * (rw - mx) / 2, A.dn[1] + A.d[1] * (rw - mx) / 2];
    const a = word(tl, lc, A.d, A.angle), b = word(tr, rc, A.d, A.angle);
    const off = -mx / 2 - 6;
    const ra: S2 = [A.up[0] + A.d[0] * off, A.up[1] + A.d[1] * off], rb: S2 = [A.dn[0] + A.d[0] * off, A.dn[1] + A.d[1] * off];
    let rung = `<line x1="${f1(ra[0])}" y1="${f1(ra[1])}" x2="${f1(rb[0])}" y2="${f1(rb[1])}" stroke="#fff" stroke-width="5" stroke-linecap="round"/><line x1="${f1(ra[0])}" y1="${f1(ra[1])}" x2="${f1(rb[0])}" y2="${f1(rb[1])}" stroke="${INK.navy}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<circle cx="${f1(ra[0])}" cy="${f1(ra[1])}" r="2.5" fill="${INK.navy}"/><circle cx="${f1(rb[0])}" cy="${f1(rb[1])}" r="2.5" fill="${INK.navy}"/>`;
    if (v.fact.k === 'neq') { const m: S2 = [(ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2]; rung += `<line x1="${f1(m[0] - 5)}" y1="${f1(m[1] + 6)}" x2="${f1(m[0] + 5)}" y2="${f1(m[1] - 6)}" stroke="${ORANGE}" stroke-width="2.4" stroke-linecap="round"/>`; }
    o = rung + a.svg + b.svg;
  } else if (v.k === 'fact' && v.fact.k === 'mem') {
    // Book phase B: a membership t ∈ H. ONE rail (its term, navy beads on the centre line), then ∈, then the
    // subgroup as an Euler blob in the subgroup ink: "this term sits in that set". No rung: it is not an equation.
    const tt = compress(toks(v.fact.t, L, S), MAX - 1.4);
    const wl = wordUnits(tt) * PITCH;
    const label = L[v.fact.sub.id] ?? v.fact.sub.id;
    const bw = 30 * 0.88 * (1 + (/[₀-₉]+$/.exec(label)?.[0].length ?? 0) * 0.16);
    const total = wl + 20 + bw;
    const along = (u: number): S2 => [A.d[0] * u, A.d[1] * u];
    const w = word(tt, along(wl / 2 - total / 2), A.d, A.angle);
    const ep = along(wl - total / 2 + 10), bp = along(total / 2 - bw / 2);
    o = w.svg +
      `<text x="${f1(ep[0])}" y="${f1(ep[1] + 4.2)}" text-anchor="middle" font-family="${FONT.math}" font-size="16" fill="${INK.navy}" paint-order="stroke" stroke="#fff" stroke-width="3.2">∈</text>` +
      eulerBlobSVG(label, bp[0], bp[1], 0.88);
    len = total + 6;
  } else if (v.k === 'fact' && v.fact.k === 'bot') {
    const pts: string[] = []; for (let i = 0; i < 6; i++) { const t = i * Math.PI / 3 + Math.PI / 6; pts.push(`${f1(9 * Math.cos(t))},${f1(9 * Math.sin(t) - 1)}`); }
    o = `<polygon points="${pts.join(' ')}" fill="${ORANGE}" stroke="#fff" stroke-width="1.5"/><text y="3.6" text-anchor="middle" font-family="${FONT.math}" font-size="12.5" fill="${INK.navy}">⊥</text>`;
  } else if (v.k === 'fact' && v.fact.k === 'size') {
    o = `<rect x="-22" y="-9" width="44" height="17" rx="3" fill="#fff" stroke="${INK.navy}" stroke-width="1.5"/><text y="3.6" text-anchor="middle" font-family="${FONT.math}" font-size="11.5" fill="${INK.navy}">|<tspan font-style="italic">G</tspan>| = ${v.fact.n}</text>`;
  } else if (v.k === 'term') {
    const t = compress(toks(v.term, L, S), MAX);
    const w = word(t, [0, 0], A.d, A.angle);
    o = w.svg; len = w.len + 5;
  } else if (v.k === 'card') {
    const earned = v.ref.k === 'schema';
    // a given's card wears the given green; any other card made on the floor the equation aqua
    const fam = v.ref.k === 'node' && v.ref.id.startsWith('lib#given:') ? FAMILY.given : FAMILY.equation;
    const fill = earned ? INK.navy : fam.ink;
    // a flat card tile lying on the track (iso rhombus, rounded), raised a touch
    const card = [P(-0.2, -0.2, 0.08), P(0.2, -0.2, 0.08), P(0.2, 0.2, 0.08), P(-0.2, 0.2, 0.08)];
    const side = [P(-0.2, 0.2, 0.08), P(0.2, 0.2, 0.08), P(0.2, 0.2, 0), P(-0.2, 0.2, 0)];
    const side2 = [P(0.2, -0.2, 0.08), P(0.2, 0.2, 0.08), P(0.2, 0.2, 0), P(0.2, -0.2, 0)];
    const pp = (a: S2[]) => a.map((p) => `${f1(p[0])},${f1(p[1])}`).join(' ');
    const edge = earned ? INK.gold : shade(fam.ink, 0.26);
    o = `<polygon points="${pp(side)}" fill="${edge}"/><polygon points="${pp(side2)}" fill="${edge}"/><polygon points="${pp(card)}" fill="${fill}" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>` +
      `<text y="${f1(P(0, 0, 0.08)[1] + 3.6)}" text-anchor="middle" font-family="${FONT.math}" font-size="11" fill="${earned ? '#fff' : INK.navy}">${v.card.k === 'cond' ? '⟹' : '∀'}</text>`;
  }
  const out = { svg: `<g transform="translate(0,-3)">${o}</g>`, len };
  if (cache.size > 2000) cache.clear();
  cache.set(key, out);
  return out;
}

// ───────────── positions ─────────────

export interface PPos { x: number; y: number; axis: Axis }

const axisOf = (a: G2, b: G2): Axis => (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 'x' : 'y');

/** Grid position of a packet location. */
export function packetGrid(at: Packet['at'], geo: Geo): { g: G2; axis: Axis } | null {
  if (at.k === 'belt') {
    const bg = geo.bs.get(at.belt);
    if (!bg) return null;
    const path = bg.b.path;
    if (at.i < 0) {
      const g = bg.line[0] ?? (path[0] ? [path[0].x + 0.5, path[0].y + 0.5] as G2 : null);
      if (!g) return null;
      const nx = bg.line[1] ?? g;
      return { g, axis: axisOf(g, nx) };
    }
    const t = path[Math.min(at.i, path.length - 1)];
    if (!t) return null;
    const li = Math.min(at.i + 1, bg.line.length - 1); // line[0] is the port edge
    const a = bg.line[Math.max(0, li - 1)]!, b = bg.line[Math.min(bg.line.length - 1, li + 1)]!;
    return { g: [t.x + 0.5, t.y + 0.5], axis: axisOf(a, b) };
  }
  const mg = geo.ms.get(at.m);
  const p = mg?.ports.find((x) => x.id === at.port);
  if (!mg || !p) return null;
  const d = faceVec(p.face);
  const inset = p.dir === 'in' ? 0.36 : 0.44;
  return { g: [p.tile.x + 0.5 + d[0] * inset, p.tile.y + 0.5 + d[1] * inset], axis: d[0] !== 0 ? 'x' : 'y' };
}

/** The location a packet came from one tick ago (for packets new to this tick). */
export function prevAt(at: Packet['at']): Packet['at'] | null {
  if (at.k === 'belt' && at.i >= 0) return { k: 'belt', belt: at.belt, i: at.i - 1 };
  return null;
}

export function packetsByBelt(run: RunState | null): Map<string, Packet[]> {
  const m = new Map<string, Packet[]>();
  for (const p of run?.packets ?? []) if (p.at.k === 'belt') { const a = m.get(p.at.belt) ?? []; a.push(p); m.set(p.at.belt, a); }
  return m;
}
