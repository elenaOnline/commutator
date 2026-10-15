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
