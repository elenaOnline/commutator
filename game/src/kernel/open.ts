// LEMMA WORKS kernel — Book phase A: open docks (holes in socket targets). Pure.
// Spec: design/pinter/KERNEL-EXT.md §1.
//
// Representation. A hole is a META of the socket's target whose id is listed in `SocketDecl.holes`:
// a `{k:'meta'}` term for a G hole, a `{k:'zmeta'}` exponent ref for a ℤ hole. No new term kind: the
// matcher, instantiation and printing already handle metas, and a hole can never reach a fact because
// every fact on a belt is ground (pallets) or closed (cards bind every meta they contain).
//
// Reading. A pallet target with holes ȳ reads ∃ȳ. l = r (or ≠). A card target with binders x̄ and holes ȳ
// reads ∀x̄ ∃ȳ. (premises ⇒ concl): each hole is a Skolem term over x̄. A delivered fact equal to
// target[ȳ := T̄] proves the open statement by ∃-introduction with the explicit witnesses T̄.
import type { Card, Fact, HoleDecl, MetaId, Pallet, PatFact, Poly, SocketDecl, SubRef, Subst, Term, ZRef } from './types';
import { factPats, mapPat, patTerms, sameSub, submetasOf } from './members';
import { beads, gmetasOf, instantiate, match, metasOf, norm, same, substKey, zmetasOf } from './terms';
import { polyRefs, polyRename, polySubst } from './poly';
import type { Labels } from './print';
import { factTex, factText } from './print';

/** A successful fill: the hole values, the closed instance the dock now shows, and the orientation used. */
export interface OpenFill {
  /** Hole id → value. G holes: a term; ℤ holes: { k: 'int' }. For a ∀ target, over the target's binders. */
  holes: Subst;
  /** target[holes := values], in the target's own shape and orientation. */
  instance: Pallet | Card;
  /** The fact matched only read the other way round (= or ≠ swapped; a card's = conclusion swapped). */
  flipped: boolean;
}

export const isOpen = (sock: Pick<SocketDecl, 'holes'> | undefined | null): boolean => Array.isArray(sock?.holes) && sock!.holes!.length > 0;

const sortOf = (h: HoleDecl) => (h.sort === 'Z' ? 'Z' : 'G');
const MAX_HOLES = 6;

const targetFacts = (t: Pallet | Card): PatFact[] => factPats(t);
function occurring(t: Pallet | Card): { g: Set<MetaId>; z: Set<MetaId> } {
  const g = new Set<MetaId>(), z = new Set<MetaId>();
  for (const p of targetFacts(t)) for (const s of patTerms(p)) { for (const m of gmetasOf(s)) g.add(m); for (const m of zmetasOf(s)) z.add(m); }
  return { g, z };
}

/** Why a socket's hole declaration is malformed (null = fine, or no holes). */
export function holesProblem(sock: SocketDecl): string | null {
  if (sock.holes === undefined) return null;
  const hs = sock.holes;
  if (!Array.isArray(hs)) return 'Its holes are malformed.';
  if (hs.length > MAX_HOLES) return `A goal has at most ${MAX_HOLES} holes.`;
  const t = sock.target;
  if (!t || (t.k !== 'eq' && t.k !== 'neq' && t.k !== 'mem' && t.k !== 'law' && t.k !== 'cond')) return 'Only an equation, inequation, membership or ∀ goal can have holes.';
  const { g, z } = occurring(t);
  const ids = new Set<string>();
  for (const h of hs) {
    if (!h || typeof h.id !== 'string' || !h.id) return 'A hole has no name.';
    if (ids.has(h.id)) return `Two holes are both called ${h.id}.`;
    ids.add(h.id);
    if (h.sort !== undefined && h.sort !== 'G' && h.sort !== 'Z') return `The hole ${h.id} has an unknown sort.`;
    if (h.notMentioning !== undefined && (!Array.isArray(h.notMentioning) || h.notMentioning.some((a) => typeof a !== 'string'))) return `The hole ${h.id} has a malformed constraint.`;
    const s = sortOf(h);
    if (s === 'G' && (!g.has(h.id) || z.has(h.id))) return `The hole ${h.id} must stand for an element of the goal.`;
    if (s === 'Z' && (!z.has(h.id) || g.has(h.id))) return `The hole ${h.id} must stand for an exponent of the goal.`;
    if ((t.k === 'law' || t.k === 'cond') && Array.isArray(t.metas) && t.metas.includes(h.id)) return `The hole ${h.id} is also bound by ∀.`;
  }
  if (t.k === 'eq' || t.k === 'neq' || t.k === 'mem') {
    for (const m of [...g, ...z]) if (!ids.has(m)) return `The goal has the variable ${m}, which is not a hole.`;
    if (t.k === 'mem' && t.sub.k !== 'sub') return 'A membership goal names a subgroup of this order.';
  }
  // SYNTHESIS §4.1 pin 5 (m6): holes only in the conclusion — a hole in a premise would let the answer make
  // the premise vacuous
  if (t.k === 'cond') {
    for (const p of t.premises) for (const u of patTerms(p)) {
      const hit = [...gmetasOf(u), ...zmetasOf(u)].find((m) => ids.has(m));
      if (hit) return `The hole ${hit} is in a premise. Holes go in the conclusion only.`;
    }
  }
  return null;
}

/**
 * Authoring check (SYNTHESIS §4.1 pin 5): does a BARE Spool of a hole-free side fill this dock? For a pallet
 * target that is `s = s`; for a ∀ target the same through ∀ (and an Assume room for a cond target's premises).
 * Returns the trivial statement that fills it, or null. A shipped open dock must return null.
 */
export function trivialFill(sock: SocketDecl, sameCard: (a: Card, b: Card) => boolean): Pallet | Card | null {
  if (!isOpen(sock) || holesProblem(sock)) return null;
  const t = sock.target;
  const ids = new Set(sock.holes!.map((h) => h.id));
  const free = (u: Term) => ![...gmetasOf(u), ...zmetasOf(u)].some((m) => ids.has(m));
  // a membership can't come from a bare Spool (t = t), so only (in)equation shapes are at risk
  const sides = (t.k === 'eq' || t.k === 'neq') ? [t.l, t.r] : t.k === 'law' ? [t.l, t.r] : t.k === 'cond' && t.concl.k !== 'mem' ? [t.concl.l, t.concl.r] : [];
  for (const s of sides.filter(free)) {
    let cand: Pallet | Card;
    if (t.k === 'eq' || t.k === 'neq') cand = { k: 'eq', l: s, r: s };
    else if (t.k === 'law') cand = { k: 'law', metas: metasOf(s), l: s, r: s };
    else if (t.k === 'cond') {
      const pm = t.premises.flatMap((p) => patTerms(p).flatMap((u) => metasOf(u)));
      cand = { k: 'cond', metas: [...new Set([...pm, ...metasOf(s)])], premises: t.premises, concl: { k: 'eq', l: s, r: s }, ...(t.binds ? { binds: t.binds } : {}) };
    } else continue;
    if (fillOpen(sock, cand, { allowFlip: true, sameCard })) return cand;
  }
  return null;
}

// ───────────── skolemization of the delivered card ─────────────

/** Skolem constants for a card's binders. Never a level id: the prefix is a control character. */
const SK = (i: number) => `\u0001sk${i}`;
const isSk = (id: string) => id.startsWith('\u0001sk');

function mapTerm(t: Term, gm: (id: MetaId) => Term | null, z: (r: ZRef) => ZRef): Term {
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'meta': return gm(u.id) ?? u;
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
      case 'app': return { k: 'app', fn: u.fn, args: u.args.map(go) };
      case 'pow': return { k: 'pow', base: go(u.base), exp: polyRename(u.exp, z) };
      case 'int': return { k: 'int', val: polyRename(u.val, z) };
      default: return u;
    }
  };
  return norm(go(t));
}

/** Rigid ids (atoms and ℤ Towers) of a term, including skolems. */
function rigidRefs(t: Term, out: Set<string> = new Set()): Set<string> {
  switch (t.k) {
    case 'atom': out.add(t.id); break;
    case 'inv': rigidRefs(t.arg, out); break;
    case 'mul': t.fs.forEach((f) => rigidRefs(f, out)); break;
    case 'app': t.args.forEach((f) => rigidRefs(f, out)); break;
    case 'pow': rigidRefs(t.base, out); for (const r of polyRefs(t.exp)) if (r.k === 'zvar') out.add(r.id); break;
    case 'int': for (const r of polyRefs(t.val)) if (r.k === 'zvar') out.add(r.id); break;
    default: break;
  }
  return out;
}

function matchFacts(ps: PatFact[], fs: PatFact[], s0: Subst, cap: number): Subst[] {
  let ss: Subst[] = [s0];
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!, f = fs[i]!;
    if (p.k !== f.k) return [];
    const next: Subst[] = [];
    if (p.k === 'mem' && f.k === 'mem') {
      if (!sameSub(p.sub, f.sub)) return [];
      for (const s of ss) { for (const s1 of match(p.t, f.t, s)) { next.push(s1); if (next.length >= cap) break; } if (next.length >= cap) break; }
    } else if (p.k !== 'mem' && f.k !== 'mem') for (const s of ss) {
      for (const s1 of match(p.l, f.l, s)) {
        for (const s2 of match(p.r, f.r, s1)) { next.push(s2); if (next.length >= cap) break; }
        if (next.length >= cap) break;
      }
      if (next.length >= cap) break;
    }
    if (!next.length) return [];
    ss = next;
  }
  return ss;
}

/** Deterministic preference among valid fills: smallest witnesses first, then a canonical key. */
function order(ss: Subst[], ids: MetaId[]): Subst[] {
  const size = (s: Subst) => ids.reduce((n, id) => n + (s[id] && s[id]!.k !== 'int' ? beads(norm(s[id]!)) : 0), 0);
  return [...ss].sort((a, b) => size(a) - size(b) || (substKey(a) < substKey(b) ? -1 : substKey(a) > substKey(b) ? 1 : 0));
}

/** Substitute holes only (binders stay). */
function plugTerm(t: Term, holes: Subst): Term {
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'meta': { const v = holes[u.id]; return v && v.k !== 'int' ? v : u; }
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
      case 'app': return { k: 'app', fn: u.fn, args: u.args.map(go) };
      case 'pow': return { k: 'pow', base: go(u.base), exp: polySubst(u.exp, (r) => (r.k === 'zmeta' && holes[r.id]?.k === 'int' ? (holes[r.id] as { val: Poly }).val : null)) };
      default: return u;
    }
  };
  return norm(go(t));
}

/** target[holes := values] (binders of a ∀ target untouched). */
export function plugHoles(target: Pallet | Card, holes: Subst): Pallet | Card {
  const pf = (p: PatFact): PatFact => mapPat(p, (u) => plugTerm(u, holes));
  const b = (target.k === 'law' || target.k === 'cond') ? { ...(target.binds ? { binds: target.binds } : {}), ...(target.metaSorts ? { metaSorts: target.metaSorts } : {}) } : {};
  switch (target.k) {
    case 'eq': case 'neq': case 'mem': return pf(target) as Pallet;
    case 'law': return { k: 'law', metas: [...target.metas], l: plugTerm(target.l, holes), r: plugTerm(target.r, holes), ...b };
    case 'cond': return { k: 'cond', metas: [...target.metas], premises: target.premises.map(pf), concl: pf(target.concl), ...b };
    default: return target;
  }
}

function permutations(n: number): number[][] {
  if (n > 6) return [Array.from({ length: n }, (_, i) => i)];
  const go = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => go([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  return go(Array.from({ length: n }, (_, i) => i));
}

export interface FillOpts {
  /** Ids no hole value may mention (the floor's free Tower variables). */
  rigid?: Set<string>;
  /** Pallet targets: also try the fact read the other way round (the compiler then records a swap). */
  allowFlip?: boolean;
  /** Final authority for card targets: card equality up to renaming and premise order (injected to avoid a cycle). */
  sameCard: (a: Card, b: Card) => boolean;
}

/** Is a hole value acceptable? `image` = skolems standing for the target's binders (card targets). */
function valueOk(h: HoleDecl, v: Term | undefined, rigid: Set<string>, image: Set<string>): boolean {
  if (!v) return false;
  if (sortOf(h) === 'Z' ? v.k !== 'int' : v.k === 'int') return false;
  if (v.k !== 'int' && metasOf(v).length) return false;
  if (v.k === 'int' && polyRefs(v.val).some((r) => r.k === 'zmeta')) return false;
  for (const id of rigidRefs(v)) {
    if (rigid.has(id)) return false;
    if (isSk(id) && !image.has(id)) return false;
    if (h.notMentioning?.includes(id)) return false;
  }
  return true;
}

/**
 * Fill an open dock with a fact: values T̄ for its holes such that fact = target[holes := T̄] (a pallet:
 * ordered sides, norm-equal; a card: up to binder renaming, premise order and a flipped = conclusion).
 * Hole constraints: sort; repeated holes agree; notMentioning; no free Tower; in a ∀ target a value may
 * mention only the target's binders, level constants and e. null = this fact does not fill the dock.
 * The returned instance is re-verified against the fact before it is returned.
 */
export function fillOpen(sock: SocketDecl, fact: Fact, opts: FillOpts): OpenFill | null {
  if (holesProblem(sock) || !isOpen(sock)) return null;
  const holes = sock.holes!;
  const ids = holes.map((h) => h.id);
  const t = sock.target;
  const rigid = opts.rigid ?? new Set<string>();
  const accept = (s: Subst, image: Set<string>, back: (v: Term) => Term): Subst | null => {
    const out: Subst = {};
    for (const h of holes) {
      const v = s[h.id];
      if (!valueOk(h, v, rigid, image)) return null;
      out[h.id] = back(v!);
    }
    return out;
  };

  if (t.k === 'mem') {
    // Book phase B: a membership dock — the same subgroup, the term filled
    if (fact.k !== 'mem' || !sameSub(fact.sub, t.sub)) return null;
    const f: PatFact = { k: 'mem', t: norm(fact.t), sub: fact.sub };
    for (const s of order(matchFacts([t], [f], {}, 4096), ids)) {
      const v = accept(s, new Set(), (x) => x);
      if (!v) continue;
      let it: Term;
      try { it = instantiate(t.t, v); } catch { continue; }
      if (!same(it, f.t)) continue;
      return { holes: v, instance: { k: 'mem', t: it, sub: t.sub }, flipped: false };
    }
    return null;
  }
  if (t.k === 'eq' || t.k === 'neq') {
    if (fact.k !== t.k) return null;
    for (const flipped of opts.allowFlip ? [false, true] : [false]) {
      const f: PatFact = flipped ? { k: fact.k, l: norm(fact.r), r: norm(fact.l) } : { k: fact.k, l: norm(fact.l), r: norm(fact.r) };
      for (const s of order(matchFacts([{ k: t.k, l: t.l, r: t.r }], [f], {}, 4096), ids)) {
        const v = accept(s, new Set(), (x) => x);
        if (!v) continue;
        let inst: Pallet & { l: Term; r: Term };
        try { inst = { k: t.k, l: instantiate(t.l, v), r: instantiate(t.r, v) }; } catch { continue; }
        if (!same(inst.l, (f as { l: Term }).l) || !same(inst.r, (f as { r: Term }).r)) continue; // the final authority
        return { holes: v, instance: inst, flipped };
      }
    }
    return null;
  }

  if (t.k !== 'law' && t.k !== 'cond') return null;
  if (fact.k !== t.k) return null;
  if (t.k === 'cond' && fact.k === 'cond' && t.premises.length !== fact.premises.length) return null;
  const holeSet = new Set(ids);
  const occ = occurring(t);
  const gB = [...occ.g].filter((m) => !holeSet.has(m)), zB = [...occ.z].filter((m) => !holeSet.has(m));
  const focc = occurring(fact as Card);
  const gF = [...focc.g], zF = [...focc.z];
  if (gB.length !== gF.length || zB.length !== zF.length) return null;
  if (gF.some((m) => zF.includes(m))) return null; // ill-typed card
  // skolemize the delivered card: its binders become rigid constants
  const skOf = new Map<MetaId, string>();
  [...gF, ...zF].forEach((m, i) => skOf.set(m, SK(i)));
  const sk = (u: Term) => mapTerm(u, (id) => (skOf.has(id) ? { k: 'atom', id: skOf.get(id)! } : null),
    (r) => (r.k === 'zmeta' && skOf.has(r.id) ? { k: 'zvar', id: skOf.get(r.id)! } : r));
  // subgroup binders: the fact's become rigid skolem subgroups; the target's are tried in every bijection below
  const tSubs = submetasOf(t), fSubs = submetasOf(fact as Card);
  if (tSubs.length !== fSubs.length) return null;
  const SS = (i: number) => `\u0001ss${i}`;
  const fsk = (r: SubRef): SubRef => (r.k === 'submeta' && fSubs.includes(r.id) ? { k: 'sub', id: SS(fSubs.indexOf(r.id)) } : r);
  const ffacts = targetFacts(fact as Card).map((p) => mapPat(p, sk, fsk));
  const normalOf = (c: Card, id: MetaId) => (c.binds?.find((x) => x.id === id) as { normal?: boolean } | undefined)?.normal === true;
  const tfacts0 = targetFacts(t);
  const nPrem = t.k === 'cond' ? t.premises.length : 0;
  const flips = [false, true];
  const zPerms = permutations(zB.length).slice(0, 5040);
  for (const zp of zPerms) {
    // ℤ binders are fixed by a bijection up front (exponent matching cannot infer products of binders)
    const s0: Subst = {};
    zB.forEach((m, i) => { s0[m] = { k: 'int', val: [{ coefficient: '1', monomial: [{ ref: { k: 'zvar', id: skOf.get(zF[zp[i]!]!)! }, degree: 1 }] }] }; });
    for (const flipped of flips) {
      const concl = tfacts0[tfacts0.length - 1]!;
      if (flipped && concl.k !== 'eq') continue;
      const c2: PatFact = flipped && concl.k === 'eq' ? { k: 'eq', l: concl.r, r: concl.l } : concl;
      for (const sp of permutations(tSubs.length)) {
      // target subgroup binder i ↦ the fact's binder sp[i] (normal flags must agree)
      if (tSubs.some((m, i) => normalOf(t, m) !== normalOf(fact as Card, fSubs[sp[i]!]!))) continue;
      const tsk = (r: SubRef): SubRef => (r.k === 'submeta' && tSubs.includes(r.id) ? { k: 'sub', id: SS(sp[tSubs.indexOf(r.id)]!) } : r);
      for (const pp of permutations(nPrem)) {
        const tf = [...pp.map((i) => tfacts0[i]!), c2].map((p) => mapPat(p, (u) => u, tsk));
        for (const s of order(matchFacts(tf, ffacts, s0, 4096), ids)) {
          // G binders ↦ distinct skolems (a bijection, since the counts agree)
          const image = new Set<string>();
          let ok = true;
          for (const m of gB) {
            const v = s[m];
            if (!v || v.k !== 'atom' || !isSk(v.id) || image.has(v.id)) { ok = false; break; }
            image.add(v.id);
          }
          if (!ok) continue;
          for (const m of zB) image.add(skOf.get(zF[zp[zB.indexOf(m)]!]!)!);
          // skolem → the target's own binder name
          const back = new Map<string, MetaId>();
          for (const m of gB) back.set((s[m] as { id: string }).id, m);
          zB.forEach((m, i) => back.set(skOf.get(zF[zp[i]!]!)!, m));
          const unsk = (v: Term) => mapTerm(v, () => null, (r) => (r.k === 'zvar' && back.has(r.id) ? { k: 'zmeta', id: back.get(r.id)! } : r));
          const unskG = (v: Term): Term => {
            const go = (u: Term): Term => {
              switch (u.k) {
                case 'atom': return back.has(u.id) ? { k: 'meta', id: back.get(u.id)! } : u;
                case 'inv': return { k: 'inv', arg: go(u.arg) };
                case 'mul': return { k: 'mul', fs: u.fs.map(go) };
                case 'app': return { k: 'app', fn: u.fn, args: u.args.map(go) };
      case 'app': return { k: 'app', fn: u.fn, args: u.args.map(go) };
                case 'pow': return { k: 'pow', base: go(u.base), exp: u.exp };
                default: return u;
              }
            };
            return unsk(norm(go(v)));
          };
          const v = accept(s, image, unskG);
          if (!v) continue;
          const inst = plugHoles(t, v) as Card;
          // the final authority: the closed instance must be the delivered card (renaming, premise order, flip)
          if (!opts.sameCard(fact as Card, inst) && !opts.sameCard(flipCard(fact as Card), inst)) continue;
          return { holes: v, instance: inst, flipped };
        }
      }
      }
    }
  }
  return null;
}

function flipCard(c: Card): Card {
  if (c.k === 'law') return { ...c, l: c.r, r: c.l };
  if (c.concl.k !== 'eq') return c;
  return { ...c, concl: { k: 'eq', l: c.concl.r, r: c.concl.l } };
}

// ───────────── display (the dock's face) ─────────────

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const subNum = (n: number) => String(n).split('').map((d) => SUB[+d]).join('');

/**
 * The open target for display: every hole replaced by a placeholder constant (`?`, or `?₁`, `?₂` … when
 * there are several, or the hole's own label), with the labels to print it. Never reveals an answer.
 */
export function openDisplay(sock: SocketDecl): { fact: Pallet | Card; labels: Labels } {
  const t = sock.target;
  if (!isOpen(sock)) return { fact: t, labels: {} };
  const hs = sock.holes!;
  const labels: Labels = {};
  const idOf = new Map<MetaId, string>();
  hs.forEach((h, i) => {
    const pid = `?${h.id}`;
    idOf.set(h.id, pid);
    labels[pid] = h.label ?? (hs.length === 1 ? '?' : `?${subNum(i + 1)}`);
  });
  const sub = (u: Term) => mapTerm(u, (id) => (idOf.has(id) ? { k: 'atom', id: idOf.get(id)! } : null),
    (r) => (r.k === 'zmeta' && idOf.has(r.id) ? { k: 'zvar', id: idOf.get(r.id)! } : r));
  const pf = (p: PatFact): PatFact => mapPat(p, sub);
  let fact: Pallet | Card;
  switch (t.k) {
    case 'eq': case 'neq': case 'mem': fact = pf(t) as Pallet; break;
    case 'law': fact = { k: 'law', metas: [...t.metas], l: sub(t.l), r: sub(t.r), ...(t.binds ? { binds: t.binds } : {}) }; break;
    case 'cond': fact = { k: 'cond', metas: [...t.metas], premises: t.premises.map(pf), concl: pf(t.concl), ...(t.binds ? { binds: t.binds } : {}) }; break;
    default: fact = t;
  }
  return { fact, labels };
}

/** The dock's text: the open shape (`d = ?`), or the filled instance when `answer` (SocketResult.holes) is given. */
export function dockText(sock: SocketDecl, L: Labels, answer?: Subst, tex = false): string {
  // NORMS: ⟹ for implication (factText / factTex print it already)
  const arrow = (x: string) => x;
  if (answer && isOpen(sock)) {
    const inst = plugHoles(sock.target, answer);
    return arrow(tex ? factTex(inst, L) : factText(inst, L));
  }
  const d = openDisplay(sock);
  const L2 = { ...L, ...d.labels };
  return arrow(tex ? factTex(d.fact, L2) : factText(d.fact, L2));
}
