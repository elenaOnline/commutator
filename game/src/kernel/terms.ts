// LEMMA WORKS kernel — terms, normalization, matching, addresses. Pure.
import type { Addr, Card, GapAddr, MetaId, Pallet, PatFact, Side, Subst, Term } from './types';

/** A kernel error whose message is shown to the player (mathematical language). */
export class KErr extends Error {}

// ───────────── constructors ─────────────

export const atom = (id: string): Term => ({ k: 'atom', id });
export const E: Term = { k: 'e' };
export const meta = (id: MetaId): Term => ({ k: 'meta', id });
export function inv(t: Term): Term { return { k: 'inv', arg: norm(t) }; }
export function mul(fs: Term[]): Term {
  if (!fs.length) throw new KErr('an empty product is not an element');
  return norm({ k: 'mul', fs });
}
/** n copies of t, normalized (n >= 1). */
export function pow(t: Term, n: number): Term {
  if (!Number.isInteger(n) || n < 1) throw new KErr('a power must be a positive whole number');
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
    case 'mul': {
      if (!Array.isArray(t.fs) || !t.fs.length) throw new KErr('an empty product is not an element');
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
    default: throw new KErr('malformed term');
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
  }
}

export function metasOf(t: Term): MetaId[] {
  const out: MetaId[] = [];
  const walk = (u: Term) => {
    switch (u.k) {
      case 'meta': if (!out.includes(u.id)) out.push(u.id); return;
      case 'inv': walk(u.arg); return;
      case 'mul': u.fs.forEach(walk); return;
      default: return;
    }
  };
  walk(t);
  return out;
}

export function atomsOf(t: Term, acc: Set<string> = new Set()): Set<string> {
  switch (t.k) {
    case 'atom': acc.add(t.id); break;
    case 'inv': atomsOf(t.arg, acc); break;
    case 'mul': t.fs.forEach((f) => atomsOf(f, acc)); break;
    default: break;
  }
  return acc;
}

/** Substitute and normalize. Throws if a meta is unbound. */
export function instantiate(t: Term, s: Subst): Term {
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'meta': {
        const v = s[u.id];
        if (!v) throw new KErr(`no value was chosen for ${u.id}`);
        return v;
      }
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
      default: return u;
    }
  };
  return norm(go(t));
}

/** Substitute bound metas only (unbound metas stay); normalized. For labels of partial offers. */
export function instantiatePartial(t: Term, s: Subst): Term {
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'meta': return s[u.id] ?? u;
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
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
    default: return 1;
  }
}

// ───────────── matching ─────────────

function matchT(p: Term, t: Term, s: Subst, out: Subst[]): void {
  switch (p.k) {
    case 'meta': {
      const b = s[p.id];
      if (b) { if (same(b, t)) out.push(s); return; }
      out.push({ ...s, [p.id]: t });
      return;
    }
    case 'atom': if (t.k === 'atom' && t.id === p.id) out.push(s); return;
    case 'e': if (t.k === 'e') out.push(s); return;
    case 'inv': if (t.k === 'inv') matchT(p.arg, t.arg, s, out); return;
    case 'mul': matchW(p.fs, 0, word(t), 0, s, out); return;
  }
}

function matchW(ps: Term[], i: number, ts: Term[], j: number, s: Subst, out: Subst[]): void {
  if (i === ps.length) { if (j === ts.length) out.push(s); return; }
  const rest = ps.length - i - 1;
  const p = ps[i]!;
  if (p.k === 'meta') {
    const b = s[p.id];
    if (b) {
      const w = word(b);
      if (j + w.length > ts.length) return;
      for (let k = 0; k < w.length; k++) if (!same(w[k]!, ts[j + k]!)) return;
      matchW(ps, i + 1, ts, j + w.length, s, out);
      return;
    }
    const maxLen = ts.length - j - rest;
    for (let len = 1; len <= maxLen; len++) {
      const v: Term = len === 1 ? ts[j]! : { k: 'mul', fs: ts.slice(j, j + len) };
      matchW(ps, i + 1, ts, j + len, { ...s, [p.id]: v }, out);
    }
    return;
  }
  if (j >= ts.length) return;
  const mid: Subst[] = [];
  matchT(p, ts[j]!, s, mid);
  for (const s2 of mid) matchW(ps, i + 1, ts, j + 1, s2, out);
}

/**
 * All substitutions σ (extending `partial`) with norm(instantiate(pattern, σ)) == target.
 * Candidates are re-verified by instantiation (the final authority).
 */
export function match(pattern: Term, target: Term, partial: Subst = {}): Subst[] {
  const p = norm(pattern), t = norm(target);
  const start: Subst = {};
  for (const k of Object.keys(partial)) start[k] = norm(partial[k]!);
  const raw: Subst[] = [];
  matchT(p, t, start, raw);
  const seen = new Set<string>();
  const out: Subst[] = [];
  for (const s of raw) {
    let ok = false;
    try { ok = same(instantiate(p, s), t); } catch { ok = false; }
    if (!ok) continue;
    const k = substKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
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
    throw new KErr('that position does not exist');
  };
  return go(rail, 0);
}

export function withRail(p: Pallet & { k: 'eq' | 'neq' }, side: Side, rail: Term): Pallet {
  return side === 'l' ? { k: p.k, l: rail, r: p.r } : { k: p.k, l: p.l, r: rail };
}
