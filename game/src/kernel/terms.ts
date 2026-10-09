// LEMMA WORKS kernel — terms, normalization, matching, addresses. Pure.
import type { Addr, Card, GapAddr, MetaId, Pallet, PatFact, Poly, Side, Subst, Term, ZRef } from './types';
import {
  polyEq, polyKey, polyNorm, polyRefs, polyRename, polySolve, polySubst,
} from './poly';

/** A kernel error whose message is shown to the player (mathematical language). */
import { KErr } from './errors';
export { KErr };

// ───────────── constructors ─────────────

export const atom = (id: string): Term => ({ k: 'atom', id });
export const E: Term = { k: 'e' };
export const meta = (id: MetaId): Term => ({ k: 'meta', id });
export function inv(t: Term): Term { return { k: 'inv', arg: norm(t) }; }
export function mul(fs: Term[]): Term {
  if (!fs.length) throw new KErr('An empty product is not an element.');
  return norm({ k: 'mul', fs });
}
/** v4 Phase B: the power node base^exp (normalized; never expanded). */
export function power(base: Term, exp: Poly): Term { return norm({ k: 'pow', base, exp }); }
/** An integer value (the value of a ℤ meta in a Subst). */
export function intVal(p: Poly): Term { return { k: 'int', val: polyNorm(p) }; }
/** The legacy repeated-factor word (alias of pow(t, n)). */
export function repeatWord(t: Term, n: number): Term { return pow(t, n); }
/** n copies of t, normalized (n >= 1). A WORD, not a power node (legacy certificates use words). */
export function pow(t: Term, n: number): Term {
  if (!Number.isInteger(n) || n < 1) throw new KErr('A power needs a whole number above 0.');
  return mul(Array.from({ length: n }, () => t));
}

/** The word of a term: fs for a mul, [t] otherwise. */
export function word(t: Term): Term[] { return t.k === 'mul' ? t.fs : [t]; }

// ───────────── normal form & equality ─────────────

/** Flatten nested products, collapse singletons; recurse into inv. Never removes e or inverses. */
export function norm(t: Term): Term {
  switch (t.k) {
    case 'atom': case 'e': case 'meta': return t;
    case 'inv': {
      const a = norm(t.arg);
      return a === t.arg ? t : { k: 'inv', arg: a };
    }
    case 'pow': {
      if (!t.base || typeof t.base !== 'object') throw new KErr('A power needs a base.');
      return { k: 'pow', base: norm(t.base), exp: polyNorm(t.exp) };
    }
    case 'int': return { k: 'int', val: polyNorm(t.val) };
    case 'mul': {
      if (!Array.isArray(t.fs) || !t.fs.length) throw new KErr('An empty product is not an element.');
      const out: Term[] = [];
      let changed = false;
      for (const f of t.fs) {
        const n = norm(f);
        if (n !== f) changed = true;
        if (n.k === 'mul') { out.push(...n.fs); changed = true; } else out.push(n);
      }
      if (out.length === 1) return out[0]!;
      return changed ? { k: 'mul', fs: out } : t;
    }
    default: throw new KErr('This term is malformed.');
  }
}

/** Structural equality of two NORMALIZED terms. */
export function same(a: Term, b: Term): boolean {
  if (a === b) return true;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'e': return true;
    case 'atom': return a.id === (b as { id: string }).id;
    case 'meta': return a.id === (b as { id: string }).id;
    case 'inv': return same(a.arg, (b as { arg: Term }).arg);
    case 'pow': { const q = b as { base: Term; exp: Poly }; return same(a.base, q.base) && polyEq(a.exp, q.exp); }
    case 'int': return polyEq(a.val, (b as { val: Poly }).val);
    case 'mul': {
      const bf = (b as { fs: Term[] }).fs;
      if (a.fs.length !== bf.length) return false;
      for (let i = 0; i < bf.length; i++) if (!same(a.fs[i]!, bf[i]!)) return false;
      return true;
    }
  }
}

/** Structural equality after norm. */
export function termEq(a: Term, b: Term): boolean { return same(norm(a), norm(b)); }

/** Canonical string of a normalized term (for keys and dedupe). */
export function termKey(t: Term): string {
  switch (t.k) {
    case 'atom': return `a${t.id.length}:${t.id}`;
    case 'meta': return `m${t.id.length}:${t.id}`;
    case 'e': return 'e';
    case 'inv': return `i(${termKey(t.arg)})`;
    case 'mul': return `[${t.fs.map(termKey).join(',')}]`;
    case 'pow': return `p(${termKey(t.base)})^(${polyKey(t.exp)})`;
    case 'int': return `z(${polyKey(t.val)})`;
  }
}

export function substKey(s: Subst): string {
  return Object.keys(s).sort().map((k) => `${k}=${termKey(norm(s[k]!))}`).join(';');
}

export function isGround(t: Term): boolean {
  switch (t.k) {
    case 'meta': return false;
    case 'atom': case 'e': return true;
    case 'inv': return isGround(t.arg);
    case 'mul': return t.fs.every(isGround);
    case 'pow': return isGround(t.base) && !polyRefs(t.exp).some((r) => r.k === 'zmeta');
    case 'int': return !polyRefs(t.val).some((r) => r.k === 'zmeta');
  }
}

/** Every meta (both sorts), in order of first occurrence: bases before exponents. */
export function metasOf(t: Term): MetaId[] {
  const out: MetaId[] = [];
  walkMetas(t, (id) => { if (!out.includes(id)) out.push(id); }, (id) => { if (!out.includes(id)) out.push(id); });
  return out;
}
/** G-sorted metas (meta terms). */
export function gmetasOf(t: Term): MetaId[] {
  const out: MetaId[] = [];
  walkMetas(t, (id) => { if (!out.includes(id)) out.push(id); }, () => undefined);
  return out;
}
/** ℤ-sorted metas (zmeta refs in exponents / int values). */
export function zmetasOf(t: Term): MetaId[] {
  const out: MetaId[] = [];
  walkMetas(t, () => undefined, (id) => { if (!out.includes(id)) out.push(id); });
  return out;
}
function walkMetas(t: Term, g: (id: MetaId) => void, z: (id: MetaId) => void): void {
  switch (t.k) {
    case 'meta': g(t.id); return;
    case 'inv': walkMetas(t.arg, g, z); return;
    case 'mul': t.fs.forEach((f) => walkMetas(f, g, z)); return;
    case 'pow': walkMetas(t.base, g, z); for (const r of polyRefs(t.exp)) if (r.k === 'zmeta') z(r.id); return;
    case 'int': for (const r of polyRefs(t.val)) if (r.k === 'zmeta') z(r.id); return;
    default: return;
  }
}

/** G atoms (constants and G Towers) occurring; not ℤ Towers. */
export function atomsOf(t: Term, acc: Set<string> = new Set()): Set<string> {
  switch (t.k) {
    case 'atom': acc.add(t.id); break;
    case 'inv': atomsOf(t.arg, acc); break;
    case 'mul': t.fs.forEach((f) => atomsOf(f, acc)); break;
    case 'pow': atomsOf(t.base, acc); break;
    default: break;
  }
  return acc;
}
/** ℤ Towers (zvar refs) occurring in exponents, in order (bases before exponents). */
export function zvarsOf(t: Term, acc: Set<string> = new Set()): Set<string> {
  switch (t.k) {
    case 'inv': zvarsOf(t.arg, acc); break;
    case 'mul': t.fs.forEach((f) => zvarsOf(f, acc)); break;
    case 'pow': zvarsOf(t.base, acc); for (const r of polyRefs(t.exp)) if (r.k === 'zvar') acc.add(r.id); break;
    case 'int': for (const r of polyRefs(t.val)) if (r.k === 'zvar') acc.add(r.id); break;
    default: break;
  }
  return acc;
}
/** Every rigid reference (G atoms and ℤ Towers), in structural order — bases before exponents. */
export function refsInOrder(t: Term, out: string[] = []): string[] {
  switch (t.k) {
    case 'atom': if (!out.includes(t.id)) out.push(t.id); break;
    case 'inv': refsInOrder(t.arg, out); break;
    case 'mul': t.fs.forEach((f) => refsInOrder(f, out)); break;
    case 'pow': refsInOrder(t.base, out); for (const r of polyRefs(t.exp)) if (r.k === 'zvar' && !out.includes(r.id)) out.push(r.id); break;
    case 'int': for (const r of polyRefs(t.val)) if (r.k === 'zvar' && !out.includes(r.id)) out.push(r.id); break;
    default: break;
  }
  return out;
}

/** Substitute ℤ refs in an exponent from σ (int values). Unbound metas stay when `partial`. */
function zsubst(p: Poly, s: Subst, partial: boolean): Poly {
  return polySubst(p, (r: ZRef) => {
    if (r.k !== 'zmeta') return null;
    const v = s[r.id];
    if (!v) { if (partial) return null; throw new KErr(`Choose a value for ${r.id}.`); }
    if (v.k !== 'int') throw new KErr(`${r.id} is an integer. It can't stand for a group element.`);
    return v.val;
  });
}

/** Rename metas/refs inside a term (sort-preserving maps). */
export function renameTerm(t: Term, g: (id: MetaId) => MetaId, z: (r: ZRef) => ZRef, atom?: (id: string) => Term | null): Term {
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'meta': return { k: 'meta', id: g(u.id) };
      case 'atom': return (atom && atom(u.id)) || u;
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
      case 'pow': return { k: 'pow', base: go(u.base), exp: polyRename(u.exp, z) };
      case 'int': return { k: 'int', val: polyRename(u.val, z) };
      default: return u;
    }
  };
  return norm(go(t));
}

/** Substitute and normalize. Throws if a meta is unbound. */
export function instantiate(t: Term, s: Subst): Term {
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'meta': {
        const v = s[u.id];
        if (!v) throw new KErr(`Choose a value for ${u.id}.`);
        if (v.k === 'int') throw new KErr(`${u.id} stands for a group element. Give it a term, not an integer.`);
        return v;
      }
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
      case 'pow': return { k: 'pow', base: go(u.base), exp: zsubst(u.exp, s, false) };
      case 'int': return { k: 'int', val: zsubst(u.val, s, false) };
      default: return u;
    }
  };
  return norm(go(t));
}

/** Substitute bound metas only (unbound metas stay); normalized. For labels of partial offers. */
export function instantiatePartial(t: Term, s: Subst): Term {
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'meta': { const v = s[u.id]; return v && v.k !== 'int' ? v : u; }
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
      case 'pow': { let exp = u.exp; try { exp = zsubst(u.exp, s, true); } catch { /* keep */ } return { k: 'pow', base: go(u.base), exp }; }
      default: return u;
    }
  };
  return norm(go(t));
}

/** Gᵒᵖ image: reverse every product's factor order (recursively, including inside inv). */
export function mirrorTerm(t: Term): Term {
  switch (t.k) {
    case 'inv': return { k: 'inv', arg: mirrorTerm(t.arg) };
    case 'mul': return { k: 'mul', fs: t.fs.map(mirrorTerm).reverse() };
    // integer powers have the same value in G and Gᵒᵖ: mirror the base, keep the exponent
    case 'pow': return { k: 'pow', base: mirrorTerm(t.base), exp: t.exp };
    default: return t;
  }
}
const mirrorPat = (p: PatFact): PatFact => ({ k: p.k, l: mirrorTerm(p.l), r: mirrorTerm(p.r) });
export function mirrorCard(c: Card): Card {
  return c.k === 'law'
    ? { k: 'law', metas: [...c.metas], l: mirrorTerm(c.l), r: mirrorTerm(c.r) }
    : { k: 'cond', metas: [...c.metas], premises: c.premises.map(mirrorPat), concl: mirrorPat(c.concl) };
}

/** Bead count of a term: atoms/e count 1, crates count their contents. */
export function beads(t: Term): number {
  switch (t.k) {
    case 'mul': return t.fs.reduce((n, f) => n + beads(f), 0);
    case 'inv': return beads(t.arg);
    case 'pow': return beads(t.base) + 1;
    default: return 1;
  }
}

// ───────────── matching ─────────────
//
// G matching is the old exhaustive word matcher. Exponents use bounded inference (§4.2): a lone
// ℤ meta binds the whole target polynomial; c*M + R with a literal c infers (T-R)/c when exact;
// anything else is deferred and, if still unresolved, needs a knob (strict match drops it).

interface St { s: Subst; d: [Poly, Poly][] }

function unboundZ(p: Poly, s: Subst): Set<MetaId> {
  const u = new Set<MetaId>();
  for (const r of polyRefs(p)) if (r.k === 'zmeta' && !s[r.id]) u.add(r.id);
  return u;
}

/** Try to discharge one exponent constraint. 'keep' = undetermined (needs knobs or later bindings). */
function solveExp(P: Poly, T: Poly, s: Subst): Subst | null | 'keep' {
  let P1: Poly;
  try { P1 = zsubst(P, s, true); } catch { return null; }
  const U = unboundZ(P1, s);
  if (!U.size) return polyEq(P1, T) ? s : null;
  const r = polySolve(P1, T, U);
  if (r === null) return null;
  if (r === 'ambiguous') return 'keep';
  return { ...s, [r.id]: { k: 'int', val: r.val } };
}

/** Resolve deferred exponent constraints to a fixpoint. */
function settle(st: St): St | null {
  let { s, d } = st;
  for (let changed = true; changed && d.length;) {
    changed = false;
    const rest: [Poly, Poly][] = [];
    for (const [P, T] of d) {
      const r = solveExp(P, T, s);
      if (r === null) return null;
      if (r === 'keep') rest.push([P, T]);
      else { if (r !== s) changed = true; s = r; }
    }
    d = rest;
  }
  return { s, d };
}

function matchT(p: Term, t: Term, st: St, out: St[]): void {
  const s = st.s;
  switch (p.k) {
    case 'meta': {
      const b = s[p.id];
      if (b) { if (b.k !== 'int' && same(b, t)) out.push(st); return; }
      if (t.k === 'int') return;
      out.push({ s: { ...s, [p.id]: t }, d: st.d });
      return;
    }
    case 'atom': if (t.k === 'atom' && t.id === p.id) out.push(st); return;
    case 'e': if (t.k === 'e') out.push(st); return;
    case 'inv': if (t.k === 'inv') matchT(p.arg, t.arg, st, out); return;
    case 'mul': matchW(p.fs, 0, word(t), 0, st, out); return;
    case 'pow': {
      if (t.k !== 'pow') return;
      const mid: St[] = [];
      matchT(p.base, t.base, st, mid);
      for (const m of mid) {
        const r = solveExp(p.exp, t.exp, m.s);
        if (r === null) continue;
        if (r === 'keep') out.push({ s: m.s, d: [...m.d, [p.exp, t.exp]] });
        else out.push({ s: r, d: m.d });
      }
      return;
    }
    case 'int': {
      if (t.k !== 'int') return;
      const r = solveExp(p.val, t.val, s);
      if (r === null) return;
      if (r === 'keep') out.push({ s, d: [...st.d, [p.val, t.val]] });
      else out.push({ s: r, d: st.d });
      return;
    }
  }
}

function matchW(ps: Term[], i: number, ts: Term[], j: number, st: St, out: St[]): void {
  if (i === ps.length) { if (j === ts.length) out.push(st); return; }
  const rest = ps.length - i - 1;
  const p = ps[i]!;
  const s = st.s;
  if (p.k === 'meta') {
    const b = s[p.id];
    if (b) {
      if (b.k === 'int') return;
      const w = word(b);
      if (j + w.length > ts.length) return;
      for (let k = 0; k < w.length; k++) if (!same(w[k]!, ts[j + k]!)) return;
      matchW(ps, i + 1, ts, j + w.length, st, out);
      return;
    }
    const maxLen = ts.length - j - rest;
    for (let len = 1; len <= maxLen; len++) {
      const v: Term = len === 1 ? ts[j]! : { k: 'mul', fs: ts.slice(j, j + len) };
      matchW(ps, i + 1, ts, j + len, { s: { ...s, [p.id]: v }, d: st.d }, out);
    }
    return;
  }
  if (j >= ts.length) return;
  const mid: St[] = [];
  matchT(p, ts[j]!, st, mid);
  for (const s2 of mid) matchW(ps, i + 1, ts, j + 1, s2, out);
}

function runMatch(pattern: Term, target: Term, partial: Subst, keepOpen: boolean): Subst[] {
  const p = norm(pattern), t = norm(target);
  const start: Subst = {};
  for (const k of Object.keys(partial)) start[k] = norm(partial[k]!);
  const raw: St[] = [];
  matchT(p, t, { s: start, d: [] }, raw);
  const seen = new Set<string>();
  const out: Subst[] = [];
  for (const st0 of raw) {
    const st = settle(st0);
    if (!st) continue;
    if (st.d.length) {
      if (!keepOpen) continue;
    } else {
      let ok = false;
      try { ok = same(instantiate(p, st.s), t); } catch { ok = false; }
      if (!ok) continue;
    }
    const k = substKey(st.s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(st.s);
  }
  return out;
}

/**
 * All substitutions σ (extending `partial`) with norm(instantiate(pattern, σ)) == target.
 * Candidates are re-verified by instantiation (the final authority). ℤ metas are inferred only in the
 * bounded cases of sol-exponents §4.2; anything needing a knob is not returned here (see matchOpen).
 */
export function match(pattern: Term, target: Term, partial: Subst = {}): Subst[] {
  return runMatch(pattern, target, partial, false);
}

/**
 * Like match, but also returns candidates whose remaining ℤ metas need knobs (they are simply unbound
 * in σ). Not verified: callers must instantiate once every meta is supplied.
 */
export function matchOpen(pattern: Term, target: Term, partial: Subst = {}): Subst[] {
  return runMatch(pattern, target, partial, true);
}

// ───────────── addresses ─────────────

export function railOf(p: Pallet, side: Side): Term | null {
  if (p.k !== 'eq' && p.k !== 'neq') return null;
  if (side !== 'l' && side !== 'r') return null;
  return p[side];
}

function descend(t: Term, path: number[]): Term | null {
  let cur = t;
  for (const i of path) {
    if (!Number.isInteger(i)) return null;
    if (cur.k === 'mul') { const n = cur.fs[i]; if (!n) return null; cur = n; }
    else if (cur.k === 'inv') { if (i !== 0) return null; cur = cur.arg; }
    else if (cur.k === 'pow') { if (i !== 0) return null; cur = cur.base; }
    else return null;
  }
  return cur;
}

/** A canonical location: an interval [s,e) of the word at wordPath (a mul, or a non-product not inside a mul). */
export interface Loc { side: Side; wordPath: number[]; s: number; e: number; word: Term[]; redex: Term }

export function locate(p: Pallet, a: Addr): Loc | null {
  if (!a || !Array.isArray(a.path)) return null;
  const rail = railOf(p, a.side);
  if (!rail) return null;
  const t = descend(rail, a.path);
  if (!t) return null;
  const w = word(t);
  let s: number, e: number;
  if (a.range) {
    [s, e] = a.range;
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > w.length || e - s < 1) return null;
  } else { s = 0; e = w.length; }
  let wordPath = a.path;
  let fullWord = w;
  if (t.k !== 'mul' && a.path.length > 0) {
    const parent = descend(rail, a.path.slice(0, -1))!;
    if (parent.k === 'mul') {
      const idx = a.path[a.path.length - 1]!;
      wordPath = a.path.slice(0, -1);
      fullWord = parent.fs;
      s = idx; e = idx + 1;
    }
  }
  const slice = fullWord.slice(s, e);
  const redex = slice.length === 1 ? slice[0]! : { k: 'mul' as const, fs: slice };
  return { side: a.side, wordPath: [...wordPath], s, e, word: fullWord, redex };
}

export interface GapLoc { side: Side; wordPath: number[]; gap: number; word: Term[] }

export function locateGap(p: Pallet, a: GapAddr): GapLoc | null {
  if (!a || !Array.isArray(a.path)) return null;
  const rail = railOf(p, a.side);
  if (!rail) return null;
  const t = descend(rail, a.path);
  if (!t) return null;
  const w = word(t);
  if (!Number.isInteger(a.gap) || a.gap < 0 || a.gap > w.length) return null;
  if (t.k !== 'mul' && a.path.length > 0) {
    const parent = descend(rail, a.path.slice(0, -1))!;
    if (parent.k === 'mul') {
      const idx = a.path[a.path.length - 1]!;
      return { side: a.side, wordPath: a.path.slice(0, -1), gap: idx + a.gap, word: parent.fs };
    }
  }
  return { side: a.side, wordPath: [...a.path], gap: a.gap, word: w };
}

/** The term focused by addr in an eq/neq pallet, or null if the address is invalid. */
export function termAt(p: Pallet, a: Addr): Term | null {
  const l = locate(p, a);
  return l ? l.redex : null;
}

/** Rebuild a rail, splicing `ins` in place of [s,e) of the word at wordPath. */
export function spliceRail(rail: Term, wordPath: number[], s: number, e: number, ins: Term[]): Term {
  const go = (t: Term, k: number): Term => {
    if (k === wordPath.length) {
      const w = word(t);
      return norm({ k: 'mul', fs: [...w.slice(0, s), ...ins, ...w.slice(e)] });
    }
    const i = wordPath[k]!;
    if (t.k === 'mul') { const fs = t.fs.slice(); fs[i] = go(t.fs[i]!, k + 1); return norm({ k: 'mul', fs }); }
    if (t.k === 'inv') return { k: 'inv', arg: go(t.arg, k + 1) };
    if (t.k === 'pow') return { k: 'pow', base: go(t.base, k + 1), exp: t.exp };
    throw new KErr('That position no longer exists.');
  };
  return go(rail, 0);
}

export function withRail(p: Pallet & { k: 'eq' | 'neq' }, side: Side, rail: Term): Pallet {
  return side === 'l' ? { k: p.k, l: rail, r: p.r } : { k: p.k, l: p.l, r: rail };
}
