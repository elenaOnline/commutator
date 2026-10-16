// COMMUTATOR — which metas a lens asks the player for. Pure (kernel only, no DOM, no store), shared by the lens
// (lens.ts) and the pointer-reachability check (reach.ts), so the check reads exactly the knobs the lens shows.
import * as K from '../kernel';
import type { Card, Fact, MetaId, Term } from '../kernel/types';
import type { Param } from '../factory/types';

/** Metas of a rule that the matched side does not bind: the player supplies them (Rewriter / Operator knobs). */
export const freeMetas = (rule: Fact | null | undefined, dir: 'fwd' | 'rev', values: Record<MetaId, Param>): MetaId[] => {
  const out = new Set(Object.keys(values));
  if (rule && rule.k === 'law') {
    const src = dir === 'fwd' ? rule.l : rule.r;
    let bound: Set<MetaId>;
    try { bound = new Set(K.metasOf(src)); } catch { bound = new Set(); }
    // an exponent on the matched side determines its integer only when it IS that integer (n, or −n): m·n, n², and
    // sums like m + n (a law of exponents read backwards, W4–9 blocker 1) leave m and n to be set — ask for them
    const walk = (t: Term) => {
      if (t.k === 'pow') {
        const plain = t.exp.length === 1 && t.exp[0]!.monomial.length === 1 && t.exp[0]!.monomial[0]!.degree === 1 && /^-?1$/.test(t.exp[0]!.coefficient);
        if (!plain) for (const term of t.exp) for (const x of term.monomial) if (x.ref.k === 'zmeta') bound.delete(x.ref.id);
        walk(t.base);
      } else if (t.k === 'inv') walk(t.arg); else if (t.k === 'mul') t.fs.forEach(walk);
      else if (t.k === 'app') t.args.forEach(walk);
    };
    walk(src);
    for (const mm of rule.metas) if (!bound.has(mm)) out.add(mm);
  }
  return [...out].sort();
};

/** ℤ-sorted metas of a card: those occurring inside exponents (they get an integer knob, never a term slot). */
export const zMetas = (f: Fact | null | undefined): Set<string> => {
  const out = new Set<string>();
  const walk = (t: Term) => {
    if (t.k === 'pow') { for (const term of t.exp) for (const mm of term.monomial) if (mm.ref.k === 'zmeta') out.add(mm.ref.id); walk(t.base); }
    else if (t.k === 'inv') walk(t.arg); else if (t.k === 'mul') t.fs.forEach(walk);
    else if (t.k === 'app') t.args.forEach(walk);
  };
  // every statement shape: (in)equations and memberships (powers of a member, W4–9 blocker 2), in laws and cards
  const pat = (p: { k: string; l?: Term; r?: Term; t?: Term }) => { if (p.k === 'mem' && p.t) walk(p.t); else { if (p.l) walk(p.l); if (p.r) walk(p.r); } };
  if (f && (f.k === 'law' || f.k === 'eq' || f.k === 'neq' || f.k === 'mem')) pat(f as never);
  if (f && f.k === 'cond') { for (const p of f.premises) pat(p); pat(f.concl); }
  return out;
};

/**
 * The Theorem lens's knobs for a card: a meta the premises bind is read off the arriving facts (memberships bind
 * through their term), so only the rest — plus any value already set — is asked for.
 */
export const theoremFree = (card: Card, values: Record<MetaId, Param>): MetaId[] => {
  const inPrem = new Set(card.k === 'cond' ? card.premises.flatMap((p) => (p.k === 'eq' || p.k === 'neq' ? [...K.metasOf(p.l), ...K.metasOf(p.r)] : p.k === 'mem' ? [...K.metasOf(p.t)] : [])) : []);
  return [...new Set([...card.metas.filter((x) => !inPrem.has(x)), ...Object.keys(values)])].sort();
};

// ───────── a card's own letters on this floor (final W8–14 N5) ─────────

const INT_LETTERS = ['a', 'b', 'c', 'd', 'j', 'k', 'i', 'l'];
const EL_LETTERS = ['x', 'y', 'z', 'u', 'v', 'w', 's', 't'];

/**
 * Display names for a card's metas (those in `only`, when given): a meta whose letter is already a letter on the floor (a ℤ Tower m beside the
 * law's m, a Tower x beside the card's x) is shown with a fresh letter — integers a, b, c …, elements x, y, z … —
 * so `m := 2, n := m+1` never mixes two different m's. Metas that do not clash keep their own letter. Display only:
 * configs stay keyed by the meta's id.
 */
export const metaNames = (card: Fact | null | undefined, floorLetters: Iterable<string>, only?: readonly MetaId[]): Record<MetaId, string> => {
  const metas: MetaId[] = card && (card.k === 'law' || card.k === 'cond') ? [...card.metas] : [];
  const floor = new Set([...floorLetters].map((l) => l.replace(/[₀-₉0-9′']+$/, '')));
  // only the metas the lens asks for (its knobs) are renamed: a matched x is never typed, so it keeps its letter
  const clash = metas.filter((m) => floor.has(m) && (!only || only.includes(m)));
  if (!clash.length) return {};
  const zs = zMetas(card);
  const taken = new Set([...floor, ...metas.filter((m) => !floor.has(m))]);
  const out: Record<MetaId, string> = {};
  for (const m of clash) {
    const pick = (zs.has(m) ? INT_LETTERS : EL_LETTERS).find((l) => !taken.has(l));
    if (!pick) continue;
    taken.add(pick);
    out[m] = pick;
  }
  return out;
};

/** The card with its metas shown under `names` (statements, direction pills, picker figures). Identity when empty. */
export const renameMetas = <C extends Fact>(card: C, names: Record<MetaId, string>): C => {
  if (!Object.keys(names).length) return card;
  const go = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(go);
    if (!x || typeof x !== 'object') return x;
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'metas' && Array.isArray(v)) out[k] = v.map((m) => (typeof m === 'string' ? names[m] ?? m : m));
      else if (k === 'metaSorts' && v && typeof v === 'object') out[k] = Object.fromEntries(Object.entries(v).map(([m, s]) => [names[m] ?? m, s]));
      else out[k] = go(v);
    }
    if ((o.k === 'meta' || o.k === 'zmeta') && typeof o.id === 'string' && names[o.id]) out.id = names[o.id];
    return out;
  };
  return go(card) as C;
};
