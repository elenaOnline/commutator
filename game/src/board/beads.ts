// LEMMA WORKS board — pallets as bead strings riding the twin wires.
// Navy disc + white letter = element; hollow navy ring = inverse; sunflower
// disc = e; blue field = crate, navy frame + −1 = inverted crate. L rides the
// screen-upper lane, R the lower; strings read left → right; '=' rung leads.
import type { Fact, Term } from '../kernel/types';
import { termText as K_termText } from '../kernel';
import { FAMILY, FONT, INK } from '../ui/tokens';
import { P, RUN, RUN_ANGLE, f1, type S2 } from './geom';
import type { Labels } from './mathsvg';
import { beadPath, beadShape } from '../bench/shapes';

export const LANE = 0.27;     // grid offset of each lane from the centreline
export const LANE_W = 0.2;   // grid width of each lane ribbon
const R = 7.4;                // bead radius px
const GAP = 2.2;
const PITCH = 2 * R + GAP;

type Tok = { k: 'atom'; label: string; slot: number } | { k: 'inv'; label: string; slot: number } | { k: 'e' } | { k: 'crate'; inv: boolean; inner: Tok[] }
  /** board-only compression: a repeated block drawn once with a ×n tag */
  | { k: 'rep'; inner: Tok[]; n: number }
  /** board-only: k more beads not drawn (the bench shows every bead) */
  | { k: 'more'; n: number };

/** Atom id → shape slot (AtomDecl.hue). Identity is carried by SHAPE; colour stays reserved for mechanics. */
export type Slots = Record<string, number>;
let SLOTS: Slots = {};
export const setSlots = (s: Slots) => { SLOTS = s; };

/** Bead outline by slot, from the bench's shared helper (identity by SHAPE; inverses hollow). */
export function beadShapeSVG(slot: number, x: number, y: number, r: number, attrs: string): string {
  const size = 2 * r + 2;
  return `<path d="${beadPath(beadShape(slot), size, 1)}" transform="translate(${f1(x - size / 2)},${f1(y - size / 2)})" stroke-linejoin="round" ${attrs}/>`;
}

function toks(t: Term, L: Labels): Tok[] {
  const word = t.k === 'mul' ? t.fs : [t];
  return word.map((f): Tok => {
    switch (f.k) {
      case 'atom': return { k: 'atom', label: L[f.id] ?? f.id, slot: SLOTS[f.id] ?? 0 };
      case 'meta': return { k: 'atom', label: f.id, slot: 0 };
      case 'e': return { k: 'e' };
      case 'inv':
        if (f.arg.k === 'atom' || f.arg.k === 'meta') return { k: 'inv', label: f.arg.k === 'atom' ? L[f.arg.id] ?? f.arg.id : f.arg.id, slot: f.arg.k === 'atom' ? SLOTS[f.arg.id] ?? 0 : 0 };
        return { k: 'crate', inv: true, inner: toks(f.arg, L) };
      case 'mul': return { k: 'crate', inv: false, inner: toks(f, L) };
      // v4 Phase B placeholder: a power is one labelled bead, e.g. (ab)^n₁ (the floor polishes visuals)
      case 'pow': return { k: 'atom', label: K_termText(f, L), slot: 0 };
      case 'int': return { k: 'atom', label: K_termText(f, L), slot: 0 };
      case 'app': return { k: 'atom', label: K_termText(f, L), slot: 0 }; // Book phase C placeholder
    }
  });
}
const units = (t: Tok): number => (t.k === 'crate' ? t.inner.reduce((s, x) => s + units(x), 0) + (t.inner.length - 1) * 0.12 + 0.55
  : t.k === 'rep' ? t.inner.reduce((s, x) => s + units(x), 0) + (t.inner.length - 1) * 0.12 + 0.45 + 1.0
  : t.k === 'more' ? 1.5 : 1);
const beadCount = (t: Tok): number => (t.k === 'crate' ? t.inner.reduce((s, x) => s + beadCount(x), 0) : t.k === 'rep' ? t.n * t.inner.reduce((s, x) => s + beadCount(x), 0) : t.k === 'more' ? t.n : 1);
const same = (a: Tok[], b: Tok[]) => JSON.stringify(a) === JSON.stringify(b);
/** Board legibility: words longer than ~8 beads compress repeated blocks ((ab)⁷ → [ab]×7), then cap at ~4 + a count. */
export const MAX_UNITS = 8;
function compress(ts: Tok[]): Tok[] {
  if (wordUnits(ts) <= MAX_UNITS) return ts;
  const out: Tok[] = [];
  for (let i = 0; i < ts.length;) {
    let best: { w: number; n: number } | null = null;
    for (let w = 1; w <= 4 && i + 2 * w <= ts.length; w++) {
      const block = ts.slice(i, i + w);
      let n = 1;
      while (i + (n + 1) * w <= ts.length && same(ts.slice(i + n * w, i + (n + 1) * w), block)) n++;
      if (n >= 2 && w * n >= 3 && (!best || w * n > best.w * best.n)) best = { w, n };
    }
    if (best) { out.push({ k: 'rep', inner: ts.slice(i, i + best.w), n: best.n }); i += best.w * best.n; }
    else { out.push(ts[i]!); i++; }
  }
  if (wordUnits(out) <= MAX_UNITS) return out;
  const kept: Tok[] = []; let u = 0;
  for (const t of out) { if (u + units(t) > 4.6 && kept.length) break; kept.push(t); u += units(t) + 0.12; }
  const hidden = out.slice(kept.length).reduce((s2, t) => s2 + beadCount(t), 0);
  return hidden ? [...kept, { k: 'more', n: hidden }] : kept;
}
const wordUnits = (ts: Tok[]) => ts.reduce((s, x) => s + units(x), 0) + Math.max(0, ts.length - 1) * 0.12;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function bead(t: Tok, x: number, y: number): string {
  const tx = `<text x="${f1(x)}" y="${f1(y + 4.1)}" text-anchor="middle" font-family="${FONT.math}" font-style="italic" font-size="13"`;
  if (t.k === 'e') return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${R - 0.6}" fill="#fff"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${R - 0.6}" fill="${FAMILY.identity.ink}" opacity=".62" class="mul"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${R - 0.6}" fill="none" stroke="${FAMILY.identity.text}" stroke-width=".9" opacity=".7"/>${tx} fill="${INK.navy}">e</text>`;
  if (t.k === 'inv') return beadShapeSVG(t.slot, x, y, R - 1, `fill="#fff" stroke="${INK.navy}" stroke-width="2"`) + `${tx} fill="${INK.navy}">${esc(t.label)}</text>`;
  if (t.k === 'atom') return beadShapeSVG(t.slot, x, y, R, `fill="${INK.navy}"`) + `${tx} fill="#fff">${esc(t.label)}</text>`;
  return '';
}

/** Lay one word along the run from screen point c (the lane start). */
function word(ts: Tok[], c: S2, tray = false): string {
  let s = 0; let out = ''; let crates = '';
  if (tray && ts.length) {
    const wpx = wordUnits(ts) * PITCH + 6, hpx = 2 * R + 6;
    const mid: S2 = [c[0] + RUN[0] * (wpx / 2 - 3), c[1] + RUN[1] * (wpx / 2 - 3)];
    crates += `<g transform="translate(${f1(mid[0])},${f1(mid[1])}) rotate(${f1(RUN_ANGLE)})"><rect x="${f1(-wpx / 2)}" y="${f1(-hpx / 2)}" width="${f1(wpx)}" height="${f1(hpx)}" rx="${f1(hpx / 2)}" fill="#fff" opacity=".92"/></g>`;
  }
  const at = (u: number): S2 => [c[0] + RUN[0] * u * PITCH, c[1] + RUN[1] * u * PITCH];
  const put = (list: Tok[], depth: number) => {
    list.forEach((t, i) => {
      const w = units(t);
      if (t.k === 'rep') {
        const iw = w - 1.0, mid = at(s + iw / 2), wpx = iw * PITCH, hpx = 2 * R + 5;
        crates += `<g transform="translate(${f1(mid[0])},${f1(mid[1])}) rotate(${f1(RUN_ANGLE)})"><rect x="${f1(-wpx / 2)}" y="${f1(-hpx / 2)}" width="${f1(wpx)}" height="${f1(hpx)}" rx="${f1(hpx / 2)}" fill="#fff" stroke="${INK.navy}" stroke-width="1.3"/></g>`;
        const tg = at(s + iw + 0.5);
        out += `<text x="${f1(tg[0])}" y="${f1(tg[1] + 4.5)}" text-anchor="middle" font-family="${FONT.math}" font-size="13.5" fill="${INK.navy}" paint-order="stroke" stroke="#fff" stroke-width="3">×${t.n}</text>`;
        const s0 = s; s += 0.225; put(t.inner, depth + 1); s = s0 + w;
      } else if (t.k === 'more') {
        const mid = at(s + 0.75);
        out += `<g transform="translate(${f1(mid[0])},${f1(mid[1])})"><rect x="-13" y="-8" width="26" height="16" rx="8" fill="#fff" stroke="${INK.navy}" stroke-width="1.2" stroke-dasharray="2.5 2"/><text y="4" text-anchor="middle" font-family="${FONT.ui}" font-size="10.5" font-weight="600" fill="${INK.navy}">+${t.n}</text></g>`;
        s += w;
      } else if (t.k === 'crate') {
        const mid = at(s + w / 2), wpx = w * PITCH, hpx = 2 * R + 5 - depth * 2;
        crates += `<g transform="translate(${f1(mid[0])},${f1(mid[1])}) rotate(${f1(RUN_ANGLE)})"><rect x="${f1(-wpx / 2)}" y="${f1(-hpx / 2)}" width="${f1(wpx)}" height="${f1(hpx)}" rx="${f1(hpx / 2)}" fill="${FAMILY.structure.ink}" opacity=".26" class="mul"/>` +
          (t.inv ? `<rect x="${f1(-wpx / 2 + 1.2)}" y="${f1(-hpx / 2 + 1.2)}" width="${f1(wpx - 2.4)}" height="${f1(hpx - 2.4)}" rx="${f1(hpx / 2 - 1.2)}" fill="none" stroke="${INK.navy}" stroke-width="2.2"/>` : '') + `</g>`;
        if (t.inv) { const e = at(s + w); crates += `<text x="${f1(e[0] - 3)}" y="${f1(e[1] - hpx / 2 - 1)}" font-family="${FONT.math}" font-size="10.5" fill="${INK.navy}">−1</text>`; }
        const s0 = s; s += 0.275; put(t.inner, depth + 1); s = s0 + w;
      } else {
        const p = at(s + 0.5);
        out += bead(t, p[0], p[1]);
        s += 1;
      }
      if (i < list.length - 1) s += 0.12;
    });
  };
  put(ts, 0);
  return crates + out;
}

export interface PalletSVG { svg: string; len: number }

/**
 * Pallet riding a row at grid (gx, gy): the string starts at gx and extends
 * forward. Returns SVG (absolute coords) and its run length in px.
 */
export function palletSVG(f: Fact | undefined, gx: number, gy: number, L: Labels, tray = false): PalletSVG {
  if (!f) return { svg: '', len: 0 };
  const lead = 10;
  if (f.k === 'eq' || f.k === 'neq') {
    const a = P(gx, gy - LANE), b = P(gx, gy + LANE);
    const tl = compress(toks(f.l, L)), tr = compress(toks(f.r, L));
    const cl: S2 = [a[0] + RUN[0] * lead, a[1] + RUN[1] * lead];
    const cr: S2 = [b[0] + RUN[0] * lead, b[1] + RUN[1] * lead];
    const len = lead + Math.max(wordUnits(tl), wordUnits(tr)) * PITCH;
    const ra: S2 = [a[0] + RUN[0] * 2, a[1] + RUN[1] * 2], rb: S2 = [b[0] + RUN[0] * 2, b[1] + RUN[1] * 2];
    let rung = `<line x1="${f1(ra[0])}" y1="${f1(ra[1])}" x2="${f1(rb[0])}" y2="${f1(rb[1])}" stroke="${INK.navy}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<circle cx="${f1(ra[0])}" cy="${f1(ra[1])}" r="2.8" fill="${INK.navy}"/><circle cx="${f1(rb[0])}" cy="${f1(rb[1])}" r="2.8" fill="${INK.navy}"/>`;
    if (f.k === 'neq') {
      const m: S2 = [(ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2];
      rung += `<line x1="${f1(m[0] - 6)}" y1="${f1(m[1] + 7)}" x2="${f1(m[0] + 6)}" y2="${f1(m[1] - 7)}" stroke="${FAMILY.contradiction.ink}" stroke-width="2.6" stroke-linecap="round"/>`;
    }
    return { svg: rung + word(tl, cl, tray) + word(tr, cr, tray), len };
  }
  if (f.k === 'bot') {
    const c = P(gx, gy); const x = c[0] + RUN[0] * (lead + R), y = c[1] + RUN[1] * (lead + R);
    return { svg: `<circle cx="${f1(x)}" cy="${f1(y)}" r="${R + 1.5}" fill="${FAMILY.contradiction.ink}"/><text x="${f1(x)}" y="${f1(y + 4.6)}" text-anchor="middle" font-family="${FONT.math}" font-size="14" fill="${INK.navy}">⊥</text>`, len: lead + 2 * R };
  }
  if (f.k === 'size') {
    const c = P(gx, gy); const x = c[0] + RUN[0] * (lead + 22), y = c[1] + RUN[1] * (lead + 22);
    return { svg: `<rect x="${f1(x - 24)}" y="${f1(y - 9)}" width="48" height="18" rx="9" fill="#fff" stroke="${INK.navy}" stroke-width="1.6"/><text x="${f1(x)}" y="${f1(y + 4.4)}" text-anchor="middle" font-family="${FONT.math}" font-size="13" fill="${INK.navy}">|<tspan font-style="italic">G</tspan>| = ${f.n}</text>`, len: lead + 44 };
  }
  return { svg: '', len: 0 };
}
