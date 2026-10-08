// LEMMA WORKS v3 — deterministic first-match targeting and structural pins (owner: COMPILER builder).
// Reference: design/v3/proposals/sol-compiler.md §6. Pure; syntax only (the kernel decides legality).
//
//  • Candidate order: right rail first, then left. On each rail visit the root word — every nonempty
//    interval [s,e) by increasing s, then increasing e — then descend depth-first into inverse arguments
//    (factor indices increasing). Gaps: 0..len at each visited word before descending.
//  • Every location is canonical (the same one kernel `locate` / `locateGap` resolve), so no duplicates.
//  • A pin is structural: the selected term, its neighbours (radius r) and the ancestor route (inverse
//    descents and product-factor descents with sibling guards). It re-resolves after any upstream
//    change; zero or several matches are reported, never silently replaced by another occurrence.
import type { Addr, GapAddr, Pallet, Side, Term } from '../kernel/types';
import { locate, locateGap, norm, railOf, same, word } from '../kernel/terms';
import type { Anchor, GapTarget, Neighbours, SpanTarget } from './types';

/** Rail order used everywhere: right first (the work rail), then left. */
export const RAIL_ORDER: Side[] = ['r', 'l'];

/** A canonical span location. */
export interface SpanLoc { side: Side; wordPath: number[]; s: number; e: number; word: Term[]; redex: Term }
/** A canonical gap location. */
export interface GapLoc { side: Side; wordPath: number[]; gap: number; word: Term[] }

export const spanAddr = (l: SpanLoc): Addr => ({ side: l.side, path: [...l.wordPath], range: [l.s, l.e] });
export const gapAddr = (g: GapLoc): GapAddr => ({ side: g.side, path: [...g.wordPath], gap: g.gap });
export const spanKey = (l: { side: Side; wordPath: number[]; s: number; e: number }) => `${l.side}/${l.wordPath.join('.')}/${l.s}-${l.e}`;
export const gapKey = (g: { side: Side; wordPath: number[]; gap: number }) => `${g.side}/${g.wordPath.join('.')}/^${g.gap}`;

/** Visit every canonical word of a rail, depth-first (root word first, then inverse arguments by factor index). */
function visitWords(rail: Term, cb: (path: number[], w: Term[]) => void): void {
  const go = (t: Term, path: number[]) => {
    const w = word(t);
    cb(path, w);
    if (t.k === 'mul') t.fs.forEach((f, i) => { if (f.k === 'inv') go(f.arg, [...path, i, 0]); });
    else if (t.k === 'inv') go(t.arg, [...path, 0]);
  };
  go(rail, []);
}

const sliceTerm = (w: Term[], s: number, e: number): Term => (e - s === 1 ? w[s]! : { k: 'mul', fs: w.slice(s, e) });

/**
 * Every canonical span on an eq/neq pallet in first-match order (§6). With `len`, only intervals of that
 * many factors (same order, far cheaper: pins and single-factor machines use it).
 */
export function spanCandidates(p: Pallet, sides: Side[] = RAIL_ORDER, len?: number): SpanLoc[] {
  const out: SpanLoc[] = [];
  for (const side of sides) {
    const rail = railOf(p, side);
    if (!rail) continue;
    visitWords(rail, (path, w) => {
      for (let s = 0; s < w.length; s++) {
        if (len !== undefined) {
          if (s + len <= w.length) out.push({ side, wordPath: path, s, e: s + len, word: w, redex: sliceTerm(w, s, s + len) });
          continue;
        }
        for (let e = s + 1; e <= w.length; e++) out.push({ side, wordPath: path, s, e, word: w, redex: sliceTerm(w, s, e) });
      }
    });
  }
  return out;
}

/** How many intervals spanCandidates(p) would produce (preflight for the matching budget). */
export function spanCount(p: Pallet, sides: Side[] = RAIL_ORDER): number {
  let n = 0;
  for (const side of sides) {
    const rail = railOf(p, side);
    if (rail) visitWords(rail, (_path, w) => { n += (w.length * (w.length + 1)) / 2; });
  }
  return n;
}

/**
 * Canceller candidates in §6 order without trying every interval: an interval matches x⁻¹x (invL) iff it
 * is inv(T) followed by the factors of T, and x x⁻¹ (invR) iff it is the factors of T followed by inv(T).
 * At one interval invL is preferred. σ = {x: T}. (The kernel re-checks every one it is given.)
 */
export function cancelCandidates(p: Pallet, sides: Side[] = RAIL_ORDER): { loc: SpanLoc; id: 'invL' | 'invR'; x: Term }[] {
  const out: { loc: SpanLoc; id: 'invL' | 'invR'; x: Term }[] = [];
  for (const side of sides) {
    const rail = railOf(p, side);
    if (!rail) continue;
    visitWords(rail, (path, w) => {
      const found: { s: number; e: number; id: 'invL' | 'invR'; x: Term }[] = [];
      for (let j = 0; j < w.length; j++) {
        const f = w[j]!;
        if (f.k !== 'inv') continue;
        const tw = word(f.arg);
        const eL = j + 1 + tw.length;
        if (eL <= w.length && tw.every((t, i) => same(t, w[j + 1 + i]!))) found.push({ s: j, e: eL, id: 'invL', x: f.arg });
        const sR = j - tw.length;
        if (sR >= 0 && tw.every((t, i) => same(t, w[sR + i]!))) found.push({ s: sR, e: j + 1, id: 'invR', x: f.arg });
      }
      found.sort((a, b) => a.s - b.s || a.e - b.e || (a.id === b.id ? 0 : a.id === 'invL' ? -1 : 1));
      let prev = '';
      for (const c of found) {
        const k = `${c.s}-${c.e}`;
        if (k === prev) continue;
        prev = k;
        out.push({ loc: { side, wordPath: path, s: c.s, e: c.e, word: w, redex: sliceTerm(w, c.s, c.e) }, id: c.id, x: c.x });
      }
    });
  }
  return out;
}

/** Every canonical gap on an eq/neq pallet in first-match order (§6): right root gap 0 first. */
export function gapCandidates(p: Pallet, sides: Side[] = RAIL_ORDER): GapLoc[] {
  const out: GapLoc[] = [];
  for (const side of sides) {
    const rail = railOf(p, side);
    if (!rail) continue;
    visitWords(rail, (path, w) => { for (let g = 0; g <= w.length; g++) out.push({ side, wordPath: path, gap: g, word: w }); });
  }
  return out;
}

// ───────────── structural fingerprints ─────────────

const seqSame = (a: Term[], b: Term[]) => a.length === b.length && a.every((t, i) => same(norm(t), b[i]!));

function neighboursAt(w: Term[], s: number, e: number, r: number): Neighbours {
  // fewer than r factors on a side: record them all and anchor to that word edge (§6)
  const ls = Math.max(0, s - r), re = Math.min(w.length, e + r);
  return { left: w.slice(ls, s), right: w.slice(e, re), leftEdge: s - r < 0, rightEdge: e + r > w.length };
}

function neighboursMatch(nb: Neighbours, w: Term[], s: number, e: number): boolean {
  const L = nb.left.length, R = nb.right.length;
  if (s - L < 0 || e + R > w.length) return false;
  if (!seqSame(nb.left, w.slice(s - L, s)) || !seqSame(nb.right, w.slice(e, e + R))) return false;
  if (nb.leftEdge && s - L !== 0) return false;
  if (nb.rightEdge && e + R !== w.length) return false;
  return true;
}

/** Ancestor frames from the rail root down to the word at `path` (no numeric offsets stored). */
function framesOf(rail: Term, path: number[], r: number): Anchor[] | null {
  const out: Anchor[] = [];
  let cur = rail;
  for (const i of path) {
    if (cur.k === 'mul') {
      const f = cur.fs[i];
      if (!f) return null;
      out.push({ k: 'factor', ...neighboursAt(cur.fs, i, i + 1, r) });
      cur = f;
    } else if (cur.k === 'inv') {
      if (i !== 0) return null;
      out.push({ k: 'inv' });
      cur = cur.arg;
    } else return null;
  }
  return out;
}

function framesMatch(stored: Anchor[], rail: Term, path: number[]): boolean {
  if (stored.length !== path.length) return false;
  let cur = rail;
  for (let k = 0; k < path.length; k++) {
    const i = path[k]!, fr = stored[k]!;
    if (cur.k === 'mul') {
      if (fr.k !== 'factor' || !neighboursMatch(fr, cur.fs, i, i + 1)) return false;
      cur = cur.fs[i]!;
    } else if (cur.k === 'inv') {
      if (fr.k !== 'inv') return false;
      cur = cur.arg;
    } else return false;
  }
  return true;
}

export type Resolved<T> = { ok: true; loc: T } | { ok: false; why: 'gone' | 'ambiguous' | 'malformed' };

/** Re-resolve a pinned span structurally on `p`. Never falls back to another occurrence. */
export function resolveSpanPin(p: Pallet, pin: SpanTarget & { k: 'pin' }): Resolved<SpanLoc> {
  const rail = railOf(p, pin.side);
  if (!rail || !pin.selected || !pin.neighbours || !Array.isArray(pin.ancestors)) return { ok: false, why: 'malformed' };
  let sel: Term;
  try { sel = norm(pin.selected); } catch { return { ok: false, why: 'malformed' }; }
  const hits: SpanLoc[] = [];
  for (const c of spanCandidates(p, [pin.side], word(sel).length)) {
    if (!same(c.redex, sel)) continue;
    if (!neighboursMatch(pin.neighbours, c.word, c.s, c.e)) continue;
    if (!framesMatch(pin.ancestors, rail, c.wordPath)) continue;
    hits.push(c);
    if (hits.length > 1) return { ok: false, why: 'ambiguous' };
  }
  return hits.length === 1 ? { ok: true, loc: hits[0]! } : { ok: false, why: 'gone' };
}

/** Re-resolve a pinned gap structurally on `p`. */
export function resolveGapPin(p: Pallet, pin: GapTarget & { k: 'pin' }): Resolved<GapLoc> {
  const rail = railOf(p, pin.side);
  if (!rail || !pin.neighbours || !Array.isArray(pin.ancestors)) return { ok: false, why: 'malformed' };
  const hits: GapLoc[] = [];
  for (const g of gapCandidates(p, [pin.side])) {
    if (!neighboursMatch(pin.neighbours, g.word, g.gap, g.gap)) continue;
    if (!framesMatch(pin.ancestors, rail, g.wordPath)) continue;
    hits.push(g);
    if (hits.length > 1) return { ok: false, why: 'ambiguous' };
  }
  return hits.length === 1 ? { ok: true, loc: hits[0]! } : { ok: false, why: 'gone' };
}

/** Canonical span location of an address (kernel `locate`), or null if it does not exist. */
export function spanLocOf(p: Pallet, a: Addr): SpanLoc | null {
  const l = locate(p, a);
  if (!l) return null;
  return { side: l.side, wordPath: l.wordPath, s: l.s, e: l.e, word: l.word, redex: norm(l.redex) };
}
export function gapLocOf(p: Pallet, a: GapAddr): GapLoc | null {
  const g = locateGap(p, a);
  return g ? { side: g.side, wordPath: g.wordPath, gap: g.gap, word: g.word } : null;
}

/**
 * Lens helper: pin the clicked span. Grows the context radius until the fingerprint identifies exactly
 * one canonical occurrence on that rail. Returns null for an address that does not exist.
 */
export function pinFromAddr(p: Pallet, a: Addr): (SpanTarget & { k: 'pin' }) | null {
  const loc = spanLocOf(p, a);
  const rail = railOf(p, a.side);
  if (!loc || !rail) return null;
  const maxR = maxRadius(rail);
  let pin: SpanTarget & { k: 'pin' } = null!;
  for (let r = 1; r <= maxR; r++) {
    const ancestors = framesOf(rail, loc.wordPath, r);
    if (!ancestors) return null;
    pin = { k: 'pin', side: loc.side, selected: loc.redex, neighbours: neighboursAt(loc.word, loc.s, loc.e, r), ancestors, last: spanAddr(loc) };
    const res = resolveSpanPin(p, pin);
    if (res.ok) return pin;
  }
  return pin;
}

/** Lens helper: pin the clicked gap. */
export function pinFromGap(p: Pallet, a: GapAddr): (GapTarget & { k: 'pin' }) | null {
  const loc = gapLocOf(p, a);
  const rail = railOf(p, a.side);
  if (!loc || !rail) return null;
  const maxR = maxRadius(rail);
  let pin: GapTarget & { k: 'pin' } = null!;
  for (let r = 1; r <= maxR; r++) {
    const ancestors = framesOf(rail, loc.wordPath, r);
    if (!ancestors) return null;
    pin = { k: 'pin', side: loc.side, neighbours: neighboursAt(loc.word, loc.gap, loc.gap, r), ancestors, last: gapAddr(loc) };
    const res = resolveGapPin(p, pin);
    if (res.ok) return pin;
  }
  return pin;
}

/** Longest word anywhere on the rail (+1): beyond this radius every guard reaches its word edges. */
function maxRadius(rail: Term): number {
  let m = 1;
  visitWords(rail, (_p, w) => { if (w.length > m) m = w.length; });
  // ancestor words: products that contain an inverse factor are visited above too
  return m + 1;
}

/** The term a span pin selects (for "the pinned … is gone" messages). */
export const pinnedText = (pin: SpanTarget): Term | null => (pin.k === 'pin' ? pin.selected : null);
