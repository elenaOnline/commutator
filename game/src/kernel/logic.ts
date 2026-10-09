// LEMMA WORKS kernel — rules, single steps, apply, whole-graph check, generalize. Pure.
import type {
  AtomDecl, AxiomId, Card, Schema, CheckResult, Dep, Fact, LevelManifest, MetaId, NodeId, NodeResult, Pallet, PatFact,
  ProofGraph, ProofNode, Room, RuleRef, ScopeId, SocketResult, StepOp, Subst, Term,
} from './types';
import { ROOT } from './types';
import type { KernelCtx } from './index';
import {
  gmetasOf, zmetasOf, zvarsOf, refsInOrder, renameTerm, beads, termKey,
  E, KErr, atomsOf, instantiate, inv, locate, locateGap, meta, metasOf, mirrorCard, mul, norm, pow, same,
  spliceRail, withRail, word,
} from './terms';
import { factText, labelsOf, termText, type Labels } from './print';
import { POLY_LIMITS, ResourceLimit, polyNorm, polyRefs, polyRename, resetPolyBudget } from './poly';
import { literalOf, powerAllowed, powerSchema } from './powers';
import type { Poly, ZRef } from './types';
import { MIRROR_NAMES } from '../levels/levels';

// ───────────── rule cards ─────────────

const x = meta('x');
const AXIOMS: Record<AxiomId, Card & { k: 'law' }> = {
  unitL: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [E, x] }, r: x },
  unitR: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [x, E] }, r: x },
  invL: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [{ k: 'inv', arg: x }, x] }, r: E },
  invR: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [x, { k: 'inv', arg: x }] }, r: E },
};
export const AXIOM_IDS: AxiomId[] = ['unitL', 'unitR', 'invL', 'invR'];

export function axiomCard(id: AxiomId): Card & { k: 'law' } {
  const c = AXIOMS[id];
  if (!c) throw new KErr(`There is no group axiom ${String(id)}.`);
  return { k: 'law', metas: [...c.metas], l: c.l, r: c.r };
}

/** Size literals are positive whole numbers 1..24 (types.ts). */
export const validSize = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 24;

export function pressCard(n: number, power = false): Card & { k: 'law' } {
  if (!validSize(n)) throw new KErr('A group order must be a whole number from 1 to 24.');
  if (power) return { k: 'law', metas: ['x'], l: norm({ k: 'pow', base: x, exp: polyNorm([{ coefficient: String(n), monomial: [] }]) }), r: E };
  return { k: 'law', metas: ['x'], l: pow(x, n), r: E };
}

const cardMetas = (c: Card): MetaId[] => {
  const out: MetaId[] = [];
  const add = (t: Term) => { for (const m of metasOf(t)) if (!out.includes(m)) out.push(m); };
  if (c.k === 'law') { add(c.l); add(c.r); } else { for (const p of c.premises) { add(p.l); add(p.r); } add(c.concl.l); add(c.concl.r); }
  return out;
};

/** ℤ-sorted metas of a card (those occurring in exponents). A meta used with both sorts is ill-typed. */
export function cardZmetas(c: Card): Set<MetaId> {
  const g = new Set<MetaId>(), z = new Set<MetaId>();
  const add = (t: Term) => { for (const id of gmetasOf(t)) g.add(id); for (const id of zmetasOf(t)) z.add(id); };
  if (c.k === 'law') { add(c.l); add(c.r); } else { for (const p of [...c.premises, c.concl]) { add(p.l); add(p.r); } }
  for (const id of z) if (g.has(id)) throw new KErr(`${id} is used as both an element and an integer. The statement is ill-typed.`);
  return z;
}

/** Display metadata of a schema id: kernel power imports first, then the registry. */
export function schemaInfo(id: string, ctx: KernelCtx): Schema | undefined {
  try { const p = powerSchema(id); if (p) return p; } catch { /* unknown power id */ }
  return ctx.registry[id];
}

/** Whether a registry schema may be used in the current level, with its (possibly mirrored) card. */
export function schemaCard(id: string, mirror: boolean | undefined, ctx: KernelCtx): Card {
  // imported power laws: kernel-owned authority; a registry entry with the same id grants nothing
  const imported = typeof id === 'string' ? powerSchema(id) : null;
  if (imported) {
    if (!powerAllowed(id, ctx.level.tools.schemas)) throw new KErr(`${imported.name} is not available here.`);
    if (mirror && !imported.mirrorable) throw new KErr(`${imported.name} has no mirror version.`);
    return mirror ? mirrorCard(imported.card) : imported.card;
  }
  const sc = ctx.registry[id];
  if (!sc) throw new KErr(`There is no theorem “${id}”.`);
  if (ctx.level.unlocks.includes(id)) throw new KErr(`${sc.name} is what this order proves. It can't prove itself.`);
  if (!ctx.level.tools.schemas.includes(id)) throw new KErr(`${sc.name} is not available here.`);
  if (mirror && !sc.mirrorable) throw new KErr(`${sc.name} has no mirror version.`);
  return mirror ? mirrorCard(sc.card) : sc.card;
}

export interface Law { l: Term; r: Term; metas: MetaId[]; zmetas: Set<MetaId>; name: string }

export function ruleName(rule: RuleRef, ctx: KernelCtx): string {
  if (rule.k === 'axiom') return rule.id === 'unitL' || rule.id === 'unitR' ? 'the identity law' : 'the inverse law';
  if (rule.k === 'schema') {
    let sc = ctx.registry[rule.id];
    try { sc = powerSchema(rule.id) ?? sc; } catch { /* unknown */ }
    return sc ? (rule.mirror ? (MIRROR_NAMES[rule.id]?.name ?? `${sc.name} ᵒᵖ`) : sc.name) : rule.id;
  }
  return 'the cited fact';
}

/** Resolve a rewrite rule to an equation l = r with metas. */
export function resolveLaw(rule: RuleRef, ctx: KernelCtx, ruleFact: Fact | undefined, L: Labels): Law {
  if (!rule || typeof rule !== 'object') throw new KErr('This rule is malformed.');
  if (rule.k === 'axiom') {
    const c = axiomCard(rule.id);
    return { l: c.l, r: c.r, metas: ['x'], zmetas: new Set(), name: ruleName(rule, ctx) };
  }
  if (rule.k === 'schema') {
    const c = schemaCard(rule.id, rule.mirror, ctx);
    if (c.k !== 'law') {
      throw new KErr(`${cap(ruleName(rule, ctx))} is an if–then theorem. Feed it its premises first.`);
    }
    return { l: norm(c.l), r: norm(c.r), metas: cardMetas(c), zmetas: cardZmetas(c), name: ruleName(rule, ctx) };
  }
  if (rule.k === 'node') {
    if (!ruleFact) throw new KErr('The cited fact is missing.');
    switch (ruleFact.k) {
      case 'eq': return { l: norm(ruleFact.l), r: norm(ruleFact.r), metas: [], zmetas: new Set(), name: factText(ruleFact, L) };
      case 'law': return { l: norm(ruleFact.l), r: norm(ruleFact.r), metas: cardMetas(ruleFact), zmetas: cardZmetas(ruleFact), name: factText(ruleFact, L) };
      case 'neq': throw new KErr(`${factText(ruleFact, L)} is an inequation. It can't rewrite anything.`);
      case 'bot': throw new KErr("⊥ has no sides. It can't rewrite anything.");
      case 'size': throw new KErr(`|G| = ${ruleFact.n} is the group's size, not an equation. It can't rewrite anything.`);
      case 'cond': throw new KErr(`${factText(ruleFact, L)} is if–then. Apply it to its premise first.`);
    }
  }
  throw new KErr('This rule is malformed.');
}

export interface CondCard { metas: MetaId[]; zmetas: Set<MetaId>; premises: PatFact[]; concl: PatFact; name: string }

/** Resolve an apply rule to a conditional card (laws become zero-premise cards emitting an eq). */
export function resolveCond(rule: RuleRef, ctx: KernelCtx, ruleFact: Fact | undefined, L: Labels): CondCard {
  let c: Card;
  let name: string;
  if (!rule || typeof rule !== 'object') throw new KErr('This rule is malformed.');
  if (rule.k === 'axiom') { c = axiomCard(rule.id); name = ruleName(rule, ctx); }
  else if (rule.k === 'schema') { c = schemaCard(rule.id, rule.mirror, ctx); name = ruleName(rule, ctx); }
  else if (rule.k === 'node') {
    if (!ruleFact) throw new KErr('The cited fact is missing.');
    if (ruleFact.k !== 'law' && ruleFact.k !== 'cond') {
      throw new KErr(`${factText(ruleFact, L)} has no ∀. There is nothing to apply.`);
    }
    c = ruleFact;
    name = factText(ruleFact, L);
  } else throw new KErr('This rule is malformed.');
  if (c.k === 'law') return { metas: cardMetas(c), zmetas: cardZmetas(c), premises: [], concl: { k: 'eq', l: norm(c.l), r: norm(c.r) }, name };
  return { metas: cardMetas(c), zmetas: cardZmetas(c), premises: c.premises, concl: c.concl, name };
}

// ───────────── term hygiene ─────────────

/** Declared G elements (level atoms + G Towers). */
export function declaredSet(ctx: KernelCtx): Set<string> { return new Set(ctx.level.atoms.filter((a) => a.sort !== 'Z').map((a) => a.id)); }
/** Declared ℤ Towers. */
export function declaredZ(ctx: KernelCtx): Set<string> { return new Set(ctx.level.atoms.filter((a) => a.sort === 'Z').map((a) => a.id)); }

/** Validate a raw term (before normalization can erase anything): structure, depth, size, references. */
function validateRaw(t: unknown, ctx: KernelCtx, what: string, allowMetas: boolean): void {
  const G = declaredSet(ctx), Z = declaredZ(ctx);
  let nodes = 0;
  const label = (id: string) => ctx.level.atoms.find((a) => a.id === id)?.label ?? id;
  const exp = (p: Poly) => {
    const n = polyNorm(p); // validates syntax, sizes and coefficients exactly
    void n;
    for (const e of p) for (const mm of e.monomial) {
      const r = mm.ref as ZRef;
      if (r.k === 'zmeta') { if (!allowMetas) throw new KErr(`${cap(what)} still has the integer variable ${r.id}. Choose an integer.`); continue; }
      if (!Z.has(r.id)) throw new KErr(G.has(r.id) ? `${label(r.id)} is a group element, not an integer.` : `${r.id} is not an integer variable here.`);
    }
  };
  const go = (u: unknown, depth: number): void => {
    if (depth > POLY_LIMITS.astDepth) throw new ResourceLimit(`this term is nested over ${POLY_LIMITS.astDepth} deep.`);
    if (++nodes > POLY_LIMITS.termNodes) throw new ResourceLimit(`this term has over ${POLY_LIMITS.termNodes} parts.`);
    if (!u || typeof u !== 'object') throw new KErr(`${cap(what)} is not an element.`);
    const v = u as Term;
    switch (v.k) {
      case 'e': return;
      case 'atom':
        if (typeof v.id !== 'string') throw new KErr(`${cap(what)} is not an element.`);
        if (Z.has(v.id)) throw new KErr(`${label(v.id)} is an integer, not a group element.`);
        if (!G.has(v.id)) throw new KErr(`${v.id} is not an element here.`);
        return;
      case 'meta': if (!allowMetas) throw new KErr(`${cap(what)} still has the variable ${v.id}. Choose an element for it.`); return;
      case 'inv': go(v.arg, depth + 1); return;
      case 'mul': if (!Array.isArray(v.fs) || !v.fs.length) throw new KErr('An empty product is not an element.'); v.fs.forEach((f) => go(f, depth + 1)); return;
      case 'pow': go(v.base, depth + 1); exp(v.exp); return;
      case 'int': throw new KErr(`${cap(what)} is an integer, not a group element.`);
      default: throw new KErr(`${cap(what)} is not an element.`);
    }
  };
  go(t, 0);
}

/** A concrete element of this level: no variables, declared atoms only. Returns the normalized term. */
export function checkGround(t: Term, ctx: KernelCtx, what = 'that term'): Term {
  validateRaw(t, ctx, what, false);
  return norm(t);
}

/** A concrete integer (value of a ℤ meta): an int value over declared ℤ Towers. */
export function checkInt(t: Term, ctx: KernelCtx, what = 'that integer'): Term {
  if (!t || typeof t !== 'object' || t.k !== 'int') throw new KErr(`${cap(what)} must be an integer, not a group element.`);
  const Z = declaredZ(ctx), G = declaredSet(ctx);
  const n = polyNorm(t.val);
  for (const e of t.val) for (const mm of e.monomial) {
    const r = mm.ref as ZRef;
    if (r.k === 'zmeta') throw new KErr(`${cap(what)} mentions the variable ${r.id}. Use only numbers and ℤ Towers.`);
    if (!Z.has(r.id)) throw new KErr(G.has(r.id) ? `${r.id} is a group element, not an integer.` : `${r.id} is not an integer variable here.`);
  }
  return { k: 'int', val: n };
}

/** σ must bind exactly the rule's metas — group metas to concrete elements, ℤ metas to integers. */
export function checkSubst(s: Subst, metas: MetaId[], ctx: KernelCtx, zmetas: Set<MetaId> = new Set()): Subst {
  if (!s || typeof s !== 'object') throw new KErr('These values are malformed.');
  const out: Subst = {};
  for (const k of Object.keys(s)) if (!metas.includes(k)) throw new KErr(`${k} is not a variable of this rule.`);
  for (const m of metas) {
    const v = s[m];
    if (!v) throw new KErr(`The rule needs a value for ${m}.`);
    out[m] = zmetas.has(m) ? checkInt(v, ctx, `the value chosen for ${m}`) : checkGround(v, ctx, `the value chosen for ${m}`);
  }
  return out;
}

/** Capitalize the first letter of a message clause (maths symbols are left alone). */
export const cap = (s: string) => (/^[a-z]/.test(s) ? s[0]!.toUpperCase() + s.slice(1) : s);

// ───────────── stacks vs words (v4 playtest r1 #9) ─────────────

const loc_redex = (t: Term) => norm(t);
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const numWord = (n: number) => NUM[n] ?? String(n);

/** Replace every power with a small positive literal exponent by its word (for confusability only). */
function unfoldLiterals(t: Term): Term {
  switch (t.k) {
    case 'inv': return norm({ k: 'inv', arg: unfoldLiterals(t.arg) });
    case 'mul': return norm({ k: 'mul', fs: t.fs.map(unfoldLiterals) });
    case 'pow': {
      const b = unfoldLiterals(t.base);
      const lit = t.exp.length === 1 && t.exp[0]!.monomial.length === 0 ? Number(t.exp[0]!.coefficient) : t.exp.length === 0 ? 0 : null;
      if (lit !== null && lit >= 1 && lit <= 200) return pow(b, lit);
      return norm({ k: 'pow', base: b, exp: t.exp });
    }
    default: return t;
  }
}
const countPows = (t: Term): number => (t.k === 'pow' ? 1 + countPows(t.base) : t.k === 'inv' ? countPows(t.arg) : t.k === 'mul' ? t.fs.reduce((n, f) => n + countPows(f), 0) : 0);

/** "the power a⁵" / "the product aaaaa (five factors)" / plain text. Copy says terms, never beads (review 2026-10). */
export function stackOrWord(t: Term, L: Labels): string {
  const txt = termText(t, L);
  if (t.k === 'pow') return `the power ${txt}`;
  if (t.k === 'mul' && t.fs.every((f) => same(f, t.fs[0]!)) && t.fs.length >= 2) return `the product ${txt} (${numWord(t.fs.length)} factors)`;
  if (t.k === 'mul' && countPows(t) === 0) return `the product ${txt} (${numWord(t.fs.length)} factors)`;
  return txt;
}

/**
 * When two terms differ only by stacks (powers with literal exponents) versus their words, say so and
 * point to Literal Power. `have` is what is there, `want` what was needed.
 */
export function stackWordHint(have: Term, want: Term, L: Labels): { have: string; want: string; hint: string } | null {
  if (same(norm(have), norm(want))) return null;
  if (!same(unfoldLiterals(have), unfoldLiterals(want))) return null;
  const toWord = countPows(have) > countPows(want);
  return {
    have: stackOrWord(norm(have), L),
    want: stackOrWord(norm(want), L),
    hint: toWord ? 'use literal power to write the power out as a product' : 'use literal power to write the product as a power',
  };
}

// ───────────── single steps ─────────────

function mismatch(rule: RuleRef, srcInst: Term, redex: Term, s: Subst, L: Labels, name: string): string {
  const R = termText(redex, L);
  if (rule.k === 'axiom') {
    const w = word(redex);
    if (rule.id === 'invL' || rule.id === 'invR') {
      if (w.length === 2) return `${termText(w[0]!, L)} and ${termText(w[1]!, L)} are not inverses of each other.`;
      if (w.length === 1 && redex.k !== 'e') return `${R} is a single factor. Cancelling needs an element next to its inverse.`;
      return `${R} is not an element next to its inverse.`;
    }
    if (!w.some((f) => f.k === 'e')) return `There is no e in ${R} to remove.`;
    return `${R} is not e next to an element.`;
  }
  const at = Object.keys(s).length ? ` at ${Object.keys(s).sort().map((k) => `${k} = ${termText(s[k]!, L)}`).join(', ')}` : '';
  const conf = stackWordHint(loc_redex(redex), srcInst, L);
  if (conf) return `The selection is ${conf.have}, but ${name}${at} needs ${conf.want}. ${cap(conf.hint)}.`;
  return `The selection is ${R}, but ${name}${at} needs ${termText(srcInst, L)}.`;
}

export function stepCore(p: Pallet, op: StepOp, ctx: KernelCtx, ruleFact: Fact | undefined): Pallet {
  const L = labelsOf(ctx.level.atoms);
  if (!op || typeof op !== 'object') throw new KErr('This step is malformed.');
  if (op.k === 'swap') {
    if (p.k !== 'eq' && p.k !== 'neq') throw new KErr(p.k === 'bot' ? '⊥ has no sides to swap.' : 'Only an equation or inequation can be swapped.');
    return { k: p.k, l: p.r, r: p.l };
  }
  if (op.k === 'invert') {
    // L = R ⟹ L⁻¹ = R⁻¹ (congruence); L ≠ R ⟹ L⁻¹ ≠ R⁻¹ (inversion is injective)
    if (p.k !== 'eq' && p.k !== 'neq') throw new KErr('Only an equation or inequation can be inverted.');
    return { k: p.k, l: inv(p.l), r: inv(p.r) };
  }
  if (p.k !== 'eq') {
    if (p.k === 'neq') throw new KErr('This is an inequation. Only equations can be rewritten or multiplied.');
    if (p.k === 'bot') throw new KErr('⊥ cannot be rewritten.');
    throw new KErr('Only an equation between elements can be rewritten.');
  }
  switch (op.k) {
    case 'insertE': {
      const g = locateGap(p, op.at);
      if (!g) throw new KErr('That gap is gone. Pick the gap again.');
      return withRail(p, g.side, spliceRail(p[g.side], g.wordPath, g.gap, g.gap, [E]));
    }
    case 'lift': {
      if (!ctx.level.tools.lift) throw new KErr('Multiplying both sides is not available here.');
      const t = checkGround(op.term, ctx, 'the multiplier');
      if (op.side === 'left') return { k: 'eq', l: mul([t, p.l]), r: mul([t, p.r]) };
      if (op.side === 'right') return { k: 'eq', l: mul([p.l, t]), r: mul([p.r, t]) };
      throw new KErr('Multiply on the left or the right.');
    }
    case 'rewrite': {
      const law = resolveLaw(op.rule, ctx, ruleFact, L);
      const s = checkSubst(op.subst, law.metas, ctx, law.zmetas);
      if (op.rule.k === 'schema') {
        const r = literalOf(op.rule.id);
        if (r !== null && s.x && Number(r) * beads(s.x) > POLY_LIMITS.termNodes) throw new ResourceLimit(`that expansion is over ${POLY_LIMITS.termNodes} factors.`);
      }
      if (op.dir !== 'fwd' && op.dir !== 'rev') throw new KErr('This direction is malformed.');
      const [src, dst] = op.dir === 'fwd' ? [law.l, law.r] : [law.r, law.l];
      const loc = locate(p, op.at);
      if (!loc) throw new KErr('That part of the equation is gone. Select it again.');
      const srcInst = instantiate(src, s);
      if (!same(srcInst, norm(loc.redex))) throw new KErr(mismatch(op.rule, srcInst, loc.redex, s, L, law.name));
      const dstInst = instantiate(dst, s);
      return withRail(p, loc.side, spliceRail(p[loc.side], loc.wordPath, loc.s, loc.e, word(dstInst)));
    }
    default: throw new KErr('This step is malformed.');
  }
}

/** Apply a (resolved) card to premise facts under σ. Returns the conclusion pallet. */
export function applyCore(card: CondCard, inputs: Fact[], s0: Subst, ctx: KernelCtx): Pallet {
  const L = labelsOf(ctx.level.atoms);
  const s = checkSubst(s0, card.metas, ctx, card.zmetas);
  if (inputs.length !== card.premises.length) {
    const n = card.premises.length;
    throw new KErr(`${cap(card.name)} takes ${n} premise${n === 1 ? '' : 's'}. It got ${inputs.length}.`);
  }
  card.premises.forEach((pr, i) => {
    const want: PatFact = { k: pr.k, l: instantiate(pr.l, s), r: instantiate(pr.r, s) };
    const got = inputs[i]!;
    const ok = (got.k === 'eq' || got.k === 'neq') && got.k === want.k && same(norm(got.l), want.l) && same(norm(got.r), want.r);
    if (!ok) {
      const which = card.premises.length > 1 ? `Premise ${i + 1}` : 'The premise';
      throw new KErr(`${which} must read ${factText(want, L)}. It reads ${factText(got, L)}.`);
    }
  });
  return { k: card.concl.k, l: instantiate(card.concl.l, s), r: instantiate(card.concl.r, s) };
}

// ───────────── whole-graph check ─────────────

export function nodeUses(n: ProofNode): { inputs: NodeId[]; rule?: NodeId } {
  switch (n.k) {
    case 'step': return { inputs: [n.input], rule: n.op?.k === 'rewrite' && n.op.rule?.k === 'node' ? n.op.rule.id : undefined };
    case 'apply': return { inputs: Array.isArray(n.inputs) ? [...n.inputs] : [], rule: n.rule?.k === 'node' ? n.rule.id : undefined };
    case 'merge': case 'clash': case 'product': return { inputs: Array.isArray(n.inputs) ? [...n.inputs] : [] };
    case 'exit': case 'press': case 'generalize': return { inputs: [n.input] };
    default: return { inputs: [] };
  }
}

/** Is `inner` equal to `outer` or nested inside it? (rooms only; ROOT contains everything) */
export function scopeWithin(inner: ScopeId, outer: ScopeId, rooms: Map<ScopeId, Room>): boolean {
  let cur: ScopeId | undefined = inner;
  for (let guard = 0; cur !== undefined && guard < 1000; guard++) {
    if (cur === outer) return true;
    if (cur === ROOT) return false;
    cur = rooms.get(cur)?.parent;
  }
  return false;
}

const isPallet = (f: Fact | undefined): f is Pallet => !!f && (f.k === 'eq' || f.k === 'neq' || f.k === 'bot' || f.k === 'size');

export function check(g: ProofGraph, ctx0: KernelCtx): CheckResult {
  resetPolyBudget();
  const vx = withVars(ctx0, g);
  const ctx = vx.ctx;
  const L = labelsOf(ctx.level.atoms);
  const nodes = Array.isArray(g?.nodes) ? g.nodes : [];
  const roomsArr = Array.isArray(g?.rooms) ? g.rooms : [];
  const results: Record<NodeId, NodeResult> = {};
  let ok = !vx.error;

  // ids
  const byId = new Map<NodeId, ProofNode>();
  const dupes = new Set<NodeId>();
  for (const n of nodes) { if (byId.has(n.id)) dupes.add(n.id); else byId.set(n.id, n); }

  // rooms
  const rooms = new Map<ScopeId, Room>();
  const roomErr = new Map<ScopeId, string>();
  for (const r of roomsArr) {
    if (rooms.has(r.id) || r.id === ROOT) { roomErr.set(r.id, 'Two rooms share one name.'); continue; }
    rooms.set(r.id, r);
  }
  for (const r of rooms.values()) {
    if (roomErr.has(r.id)) continue;
    // parent chain must reach ROOT without cycles
    let cur: ScopeId = r.parent;
    const seen = new Set<ScopeId>([r.id]);
    let bad: string | null = null;
    while (cur !== ROOT) {
      if (seen.has(cur)) { bad = "A room can't be inside itself."; break; }
      seen.add(cur);
      const p = rooms.get(cur);
      if (!p) { bad = 'This room is inside a room that no longer exists.'; break; }
      cur = p.parent;
    }
    if (!bad && r.kind === 'suppose' && !ctx.level.tools.suppose) bad = 'Supposing is not available here.';
    if (!bad && r.kind === 'classical' && !ctx.level.tools.classical) bad = 'Proof by contradiction is not available here.';
    if (!bad && r.kind !== 'suppose' && r.kind !== 'classical' && r.kind !== 'assume') bad = 'Unknown kind of room.';
    if (!bad && r.kind === 'assume' && r.rel !== undefined && r.rel !== 'eq' && r.rel !== 'neq') bad = 'An assumption must be an equation or inequation.';
    if (!bad) {
      const what = r.kind === 'suppose' ? 'the supposition' : 'the assumption';
      try { checkGround(r.l, ctx, what); checkGround(r.r, ctx, what); }
      catch (e) { bad = (e as Error).message; }
    }
    if (bad) roomErr.set(r.id, bad);
  }
  // a room nested in a bad room is bad
  for (const r of rooms.values()) {
    if (roomErr.has(r.id)) continue;
    let cur = r.parent;
    for (let guard = 0; cur !== ROOT && guard < 1000; guard++) {
      if (roomErr.has(cur)) { roomErr.set(r.id, 'This room is inside a broken room.'); break; }
      cur = rooms.get(cur)?.parent ?? ROOT;
    }
  }

  // cycles (rejected before anything else)
  const color = new Map<NodeId, 0 | 1 | 2>();
  const inCycle = new Set<NodeId>();
  const order: NodeId[] = [];
  const visit = (id: NodeId, stack: NodeId[]) => {
    const c = color.get(id) ?? 0;
    if (c === 2) return;
    if (c === 1) { const i = stack.indexOf(id); for (const s of stack.slice(i)) inCycle.add(s); return; }
    const n = byId.get(id);
    if (!n) return;
    color.set(id, 1);
    stack.push(id);
    const u = nodeUses(n);
    for (const d of [...u.inputs, ...(u.rule ? [u.rule] : [])]) visit(d, stack);
    stack.pop();
    color.set(id, 2);
    order.push(id);
  };
  for (const n of nodes) visit(n.id, []);
  if (inCycle.size || dupes.size) ok = false;

  const fail = (id: NodeId, error: string): NodeResult => ({ id, ok: false, deps: [], classical: false, error });

  for (const id of order) {
    const n = byId.get(id)!;
    if (dupes.has(id)) { results[id] = fail(id, 'Two steps share one name.'); continue; }
    if (inCycle.has(id)) { results[id] = fail(id, 'This step depends on itself. That is circular.'); continue; }
    try {
      results[id] = evalNode(n, ctx, L, results, byId, rooms, roomErr, vx.vars);
    } catch (e) {
      results[id] = fail(id, e instanceof KErr ? e.message : `This step is malformed (${(e as Error)?.message ?? 'unknown'}).`);
    }
  }
  for (const id of dupes) if (!results[id]) results[id] = fail(id, 'Two steps share one name.');
  for (const r of Object.values(results)) if (!r.ok) ok = false;

  const sockets = ctx.level.sockets.map((sock) => socketResult(sock, nodes, results, L));
  return { ok, nodes: results, sockets, solved: sockets.length > 0 && sockets.every((s) => s.ok) };
}

function socketResult(
  sock: LevelManifest['sockets'][number], nodes: ProofNode[], results: Record<NodeId, NodeResult>, L: Labels,
): SocketResult {
  const t = sock.target;
  const allowed = new Set(sock.allowedGivens.map((g) => `g:${g}`));
  let nearly: string | undefined;
  const reliesOn = (extra: string[]) => extra.map((d) => (d.startsWith('a:') ? 'an open assumption' : `given ${d.slice(2)}`)).join(', ');
  if (t.k === 'law' || t.k === 'cond') {
    // a ∀ goal: a root card equal to the target up to renaming of its variables
    for (const n of nodes) {
      if (n.scope !== ROOT) continue;
      const r = results[n.id];
      if (!r?.ok || !r.fact || (r.fact.k !== 'law' && r.fact.k !== 'cond')) continue;
      // equality is symmetric under ∀ and ⇒: a flipped law or a cond with a flipped = conclusion also fills
      // (premises must match exactly)
      if (!sameCardUpToRenaming(r.fact, t) && !sameCardUpToRenaming(flipConclusion(r.fact), t)) continue;
      const extra = r.deps.filter((d) => !allowed.has(d));
      if (extra.length) { nearly = `This proof rests on ${reliesOn(extra)}. This goal doesn't allow that.`; continue; }
      return { id: sock.id, ok: true, filledBy: n.id };
    }
    return { id: sock.id, ok: false, error: nearly ?? `${factText(t, L)} is not proved yet.` };
  }
  if (t.k !== 'eq' && t.k !== 'neq') return { id: sock.id, ok: false, error: 'This goal is malformed.' };
  for (const n of nodes) {
    if (n.scope !== ROOT) continue;
    const r = results[n.id];
    if (!r?.ok || !r.fact) continue;
    const f = r.fact;
    if (f.k !== t.k) continue;
    const exact = same(norm(f.l), norm(t.l)) && same(norm(f.r), norm(t.r));
    if (!exact) {
      if (!nearly && same(norm(f.l), norm(t.r)) && same(norm(f.r), norm(t.l))) nearly = 'The goal is proved backwards. Swap the sides.';
      if (!nearly) {
        const hl = stackWordHint(f.l, t.l, L), hr = stackWordHint(f.r, t.r, L);
        const sideOk = (x: Term, y: Term, h: unknown) => h || same(norm(x), norm(y));
        const h = hl ?? hr;
        if (h && sideOk(f.l, t.l, hl) && sideOk(f.r, t.r, hr)) nearly = `This proves ${h.have}, but the goal has ${h.want}. ${cap(h.hint)}.`;
      }
      continue;
    }
    const extra = r.deps.filter((d) => !allowed.has(d));
    if (extra.length) {
      nearly = `This proof rests on ${extra.map((d) => (d.startsWith('a:') ? 'an open assumption' : `given ${d.slice(2)}`)).join(', ')}. This goal doesn't allow that.`;
      continue;
    }
    return { id: sock.id, ok: true, filledBy: n.id };
  }
  return { id: sock.id, ok: false, error: nearly ?? `${factText(t, L)} is not proved yet.` };
}

function evalNode(
  n: ProofNode, ctx: KernelCtx, L: Labels, results: Record<NodeId, NodeResult>,
  byId: Map<NodeId, ProofNode>, rooms: Map<ScopeId, Room>, roomErr: Map<ScopeId, string>,
  vars: AtomDecl[] = [],
): NodeResult {
  const id = n.id;
  const scope = n.scope;
  if (typeof scope !== 'string') throw new KErr('This step has no scope.');
  if (scope !== ROOT) {
    if (!rooms.has(scope)) throw new KErr('This step is in a room that no longer exists.');
    const re = roomErr.get(scope);
    if (re) throw new KErr(re);
  }
  const deps = new Set<Dep>();
  let classical = false;

  /** Fetch an upstream node's result, enforcing existence, validity and the scope law. */
  const use = (ref: NodeId, role: string): { fact: Fact; node: ProofNode } => {
    const m = byId.get(ref);
    if (!m) throw new KErr(`${cap(role)} is missing.`);
    const r = results[ref];
    if (!r || !r.ok || !r.fact) throw new KErr(`${cap(role)} is broken. Fix it first.`);
    if (!scopeWithin(scope, m.scope, rooms)) {
      throw new KErr(`${cap(role)} rests on an assumption that doesn't hold here. Use it inside that room.`);
    }
    for (const d of r.deps) deps.add(d);
    if (r.classical) classical = true;
    return { fact: r.fact, node: m };
  };

  const done = (fact: Fact): NodeResult => ({ id, ok: true, fact, deps: [...deps].sort(), classical });

  switch (n.k) {
    case 'start': {
      const t = checkGround(n.term, ctx, 'the starting element');
      return done({ k: 'eq', l: t, r: t });
    }
    case 'given': {
      const gd = ctx.level.givens.find((x) => x.id === n.givenId);
      if (!gd) throw new KErr(`There is no given “${String(n.givenId)}” here.`);
      if (gd.fact.k === 'size' && !validSize(gd.fact.n)) throw new KErr('A group order must be a whole number from 1 to 24.');
      deps.add(`g:${gd.id}`);
      const f = gd.fact;
      return done(f.k === 'eq' || f.k === 'neq' ? { k: f.k, l: norm(f.l), r: norm(f.r) } : f);
    }
    case 'assume': {
      const room = rooms.get(n.room);
      if (!room) throw new KErr('There is no such room.');
      if (scope !== n.room) throw new KErr('A supposition belongs inside its own room.');
      deps.add(`a:${room.id}`);
      return done(assumptionOf(room));
    }
    case 'step': {
      const inp = use(n.input, 'the equation this step continues');
      if (!isPallet(inp.fact)) throw new KErr("A ∀ statement can't be rewritten. Use it as a rule instead.");
      let ruleFact: Fact | undefined;
      if (n.op?.k === 'rewrite' && n.op.rule?.k === 'node') ruleFact = use(n.op.rule.id, 'the cited fact').fact;
      return done(stepCore(inp.fact, n.op, ctx, ruleFact));
    }
    case 'apply': {
      let ruleFact: Fact | undefined;
      if (n.rule?.k === 'node') ruleFact = use(n.rule.id, 'the cited statement').fact;
      const card = resolveCond(n.rule, ctx, ruleFact, L);
      const ins = (Array.isArray(n.inputs) ? n.inputs : []).map((ref, i) => {
        const f = use(ref, `premise ${i + 1}`).fact;
        if (f.k !== 'eq' && f.k !== 'neq') throw new KErr(`Premise ${i + 1} must be an equation or inequation.`);
        return f;
      });
      return done(applyCore(card, ins, n.subst ?? {}, ctx));
    }
    case 'merge': {
      if (!ctx.level.tools.merge) throw new KErr('Merging is not available here.');
      if (!Array.isArray(n.inputs) || n.inputs.length !== 2) throw new KErr('Merging needs exactly two equations.');
      const a = use(n.inputs[0], 'the first equation').fact;
      const b = use(n.inputs[1], 'the second equation').fact;
      if (a.k !== 'eq' || b.k !== 'eq') throw new KErr('Only equations can be merged.');
      if (!same(norm(a.r), norm(b.r))) {
        throw new KErr(`The right sides ${termText(a.r, L)} and ${termText(b.r, L)} differ. Both must end the same.`);
      }
      return done({ k: 'eq', l: norm(a.l), r: norm(b.l) });
    }
    case 'clash': {
      if (!Array.isArray(n.inputs) || n.inputs.length !== 2) throw new KErr('A contradiction needs an equation and an inequation.');
      const a = use(n.inputs[0], 'the equation').fact;
      const b = use(n.inputs[1], 'the inequation').fact;
      // accept either order: clash is symmetric in its two inputs
      const [q, ne] = a.k === 'eq' && b.k === 'neq' ? [a, b] : b.k === 'eq' && a.k === 'neq' ? [b, a] : [null, null];
      if (!q || !ne) throw new KErr('A contradiction needs one equation and one inequation.');
      const ql = norm(q.l), qr = norm(q.r), nl = norm(ne.l), nr = norm(ne.r);
      const hit = (same(ql, nl) && same(qr, nr)) || (same(ql, nr) && same(qr, nl));
      if (!hit) throw new KErr(`${factText(q, L)} and ${factText(ne, L)} don't contradict each other.`);
      return done({ k: 'bot' });
    }
    case 'exit': {
      const room = rooms.get(n.room);
      if (!room) throw new KErr('There is no such room to close.');
      if (scope !== room.parent) throw new KErr('A room’s result lands just outside the room.');
      const m = byId.get(n.input);
      if (!m) throw new KErr('The contradiction closing this room is missing.');
      if (m.scope !== room.id) throw new KErr('The contradiction must be reached inside this room.');
      const r = results[n.input];
      if (room.kind === 'assume') {
        // implication introduction: any equation/inequation Q proved in the room ⟹ (P ⇒ Q)
        if (!r || !r.ok || !r.fact) throw new KErr('The result leaving this room is broken.');
        const q = r.fact;
        if (q.k !== 'eq' && q.k !== 'neq') throw new KErr('An assume room exports an equation or inequation proved inside it.');
        for (const d of r.deps) if (d !== `a:${room.id}`) deps.add(d);
        classical = r.classical;
        return done({ k: 'cond', metas: [], premises: [assumptionOf(room)], concl: { k: q.k, l: norm(q.l), r: norm(q.r) } });
      }
      if (!r || !r.ok || !r.fact) throw new KErr('The contradiction closing this room is broken.');
      if (r.fact.k !== 'bot') throw new KErr('The assumption is still open. Only a contradiction (⊥) closes this room.');
      for (const d of r.deps) if (d !== `a:${room.id}`) deps.add(d);
      classical = r.classical || room.kind === 'classical';
      const l = norm(room.l), rr = norm(room.r);
      return done(room.kind === 'suppose' ? { k: 'neq', l, r: rr } : { k: 'eq', l, r: rr });
    }
    case 'press': {
      if (!ctx.level.tools.press) throw new KErr('The Lagrange press is not available here.');
      const inp = use(n.input, 'the group order');
      if (inp.fact.k !== 'size') throw new KErr('The Lagrange press needs the group order (|G| = n).');
      return done(pressCard(inp.fact.n, n.power === true));
    }
    case 'product': {
      // A = B , C = D ⟹ AC = BD. Multiplying by a reflexive C = C is lifting, so it shares lift's authority.
      if (!ctx.level.tools.lift) throw new KErr('Multiplying equations is not available here.');
      if (!Array.isArray(n.inputs) || n.inputs.length !== 2) throw new KErr('Multiplying needs exactly two equations.');
      const a = use(n.inputs[0], 'the first equation').fact;
      const b = use(n.inputs[1], 'the second equation').fact;
      if (a.k !== 'eq' || b.k !== 'eq') throw new KErr('Only equations can be multiplied.');
      return done({ k: 'eq', l: mul([a.l, b.l]), r: mul([a.r, b.r]) });
    }
    case 'generalize': {
      const inp = use(n.input, 'the statement to generalize');
      const varIds = new Set(vars.map((v) => v.id));
      const reserved = new Set<string>();
      for (const a of ctx.level.atoms) if (!varIds.has(a.id)) { reserved.add(a.id); reserved.add(a.label); }
      const hyps = [...deps].filter((d) => d.startsWith('a:')).map((d) => rooms.get(d.slice(2))).filter((r): r is Room => !!r);
      return done(generalizeFact(inp.fact, vars, hyps, reserved, L));
    }
    default: throw new KErr('Unknown kind of step.');
  }
}

/** A card with its (equation) conclusion read the other way round; ≠ conclusions and premises unchanged. */
export function flipConclusion(c: Card): Card {
  if (c.k === 'law') return { ...c, l: c.r, r: c.l };
  if (c.concl.k !== 'eq') return c;
  return { ...c, concl: { k: 'eq', l: c.concl.r, r: c.concl.l } };
}

/** The fact a room's inlet provides. */
export function assumptionOf(room: Room): PatFact & Pallet {
  const l = norm(room.l), r = norm(room.r);
  if (room.kind === 'suppose') return { k: 'eq', l, r };
  if (room.kind === 'classical') return { k: 'neq', l, r };
  return room.rel === 'neq' ? { k: 'neq', l, r } : { k: 'eq', l, r };
}

// ───────────── variables (v4 Towers) ─────────────

function factAtoms(f: Fact, acc: Set<string>): Set<string> {
  switch (f.k) {
    case 'eq': case 'neq': case 'law': atomsOf(f.l, acc); atomsOf(f.r, acc); zvarsOf(f.l, acc); zvarsOf(f.r, acc); break;
    case 'cond': for (const p of [...f.premises, f.concl]) { atomsOf(p.l, acc); atomsOf(p.r, acc); zvarsOf(p.l, acc); zvarsOf(p.r, acc); } break;
    default: break;
  }
  return acc;
}

/**
 * The context extended with the graph's declared variables. A variable must be fresh: its id may not
 * be a level atom or appear in any given or goal, and labels are unique. Invalid declarations are
 * ignored (so terms using them fail as undeclared) and reported in `error`.
 */
export function withVars(ctx: KernelCtx, g: ProofGraph | undefined | null): { ctx: KernelCtx; vars: AtomDecl[]; error?: string } {
  const decl = Array.isArray(g?.vars) ? g!.vars! : [];
  if (!decl.length) return { ctx, vars: [] };
  const taken = new Set(ctx.level.atoms.map((a) => a.id));
  for (const gd of ctx.level.givens) factAtoms(gd.fact, taken);
  for (const sk of ctx.level.sockets) if (sk.target.k !== 'bot' && sk.target.k !== 'size') factAtoms(sk.target, taken);
  const labels = new Set(ctx.level.atoms.map((a) => a.label));
  const ok: AtomDecl[] = [];
  let error: string | undefined;
  for (const v of decl) {
    if (!v || typeof v.id !== 'string' || !v.id) { error = 'A variable has no name.'; continue; }
    const label = typeof v.label === 'string' && v.label ? v.label : v.id;
    if (taken.has(v.id)) { error = `${label} can't be a variable here. That name is already an element.`; continue; }
    if (labels.has(label)) { error = `Two elements are both called ${label}.`; continue; }
    taken.add(v.id); labels.add(label);
    ok.push({ ...v, label, variable: true });
  }
  if (!ok.length) return { ctx, vars: [], error };
  return { ctx: { ...ctx, level: { ...ctx.level, atoms: [...ctx.level.atoms, ...ok] } }, vars: ok, error };
}

const META_POOL = ['x', 'y', 'z', 'u', 'v', 'w', 's', 't', 'p', 'q', 'r'];

/**
 * ∀-introduction. Binds every variable (of `vars`) occurring in `f`, in order of first occurrence, as
 * fresh metas: eq → law, neq → cond(no premises), law/cond → same kind with the metas prepended.
 * Eigenvariable condition: no hypothesis in `hyps` (the room assumptions the fact rests on) may
 * mention a bound variable. `reserved` names are never used as metas (level constants).
 */
export function generalizeFact(f: Fact, vars: AtomDecl[], hyps: Room[], reserved: Set<string> = new Set(), L: Labels = {}): Card {
  const varIds = new Set(vars.map((v) => v.id));
  const sortOf = (id: string) => (vars.find((v) => v.id === id)?.sort === 'Z' ? 'Z' : 'G');
  // first occurrence in structural order: fact fields in order, bases before exponents
  const seen: string[] = [];
  switch (f.k) {
    case 'eq': case 'neq': case 'law': refsInOrder(f.l, seen); refsInOrder(f.r, seen); break;
    case 'cond': for (const p of [...f.premises, f.concl]) { refsInOrder(p.l, seen); refsInOrder(p.r, seen); } break;
    case 'bot': throw new KErr('⊥ cannot be generalized.');
    case 'size': throw new KErr('|G| = n has no element in it. There is nothing to generalize.');
  }
  const order = seen.filter((id) => varIds.has(id));
  const label = (id: string) => vars.find((v) => v.id === id)?.label ?? L[id] ?? id;
  if (!order.length) throw new KErr(`No Tower appears in ${factText(f, L)}. There is nothing to generalize.`);
  // eigenvariable condition (statements of the room assumptions the fact rests on, exponents included)
  for (const room of hyps) {
    const mentioned = new Set(refsInOrder(room.r, refsInOrder(room.l, [])));
    const hit = order.find((id) => mentioned.has(id));
    if (hit) {
      const noun = room.kind === 'suppose' ? 'supposition' : 'assumption';
      throw new KErr(`${label(hit)} appears in the ${noun} ${factText(assumptionOf(room), L)}, so it isn't arbitrary. Exit the room first.`);
    }
  }
  // fresh, readable binder names: distinct from the card's own binders (both sorts) and level constants
  const used = new Set<string>(reserved);
  if (f.k === 'law' || f.k === 'cond') { for (const m of f.metas) used.add(m); for (const m of cardMetas(f)) used.add(m); }
  const base = (id: string) => label(id).replace(/[₀-₉0-9′'_]+$/u, '');
  const bases = order.map(base);
  const rename = new Map<string, string>();
  for (const [i, id] of order.entries()) {
    const b = bases[i]!;
    const pool = sortOf(id) === 'Z' ? Z_POOL : META_POOL;
    let name: string | undefined;
    if (/^[A-Za-z]$/.test(b) && bases.filter((x) => x === b).length === 1 && !used.has(b)) name = b;
    name ??= pool.find((m) => !used.has(m));
    for (let k = 1; !name; k++) if (!used.has(`${pool[0]}${k}`)) name = `${pool[0]}${k}`;
    used.add(name);
    rename.set(id, name);
  }
  const sub = (t: Term): Term => renameTerm(t, (m) => m,
    (r) => (r.k === 'zvar' && rename.has(r.id) ? { k: 'zmeta', id: rename.get(r.id)! } : r),
    (id) => (rename.has(id) && sortOf(id) === 'G' ? { k: 'meta', id: rename.get(id)! } : null));
  const fresh = order.map((id) => rename.get(id)!);
  const pf = (p: { k: 'eq' | 'neq'; l: Term; r: Term }): PatFact => ({ k: p.k, l: sub(p.l), r: sub(p.r) });
  let out: Card;
  switch (f.k) {
    case 'eq': out = { k: 'law', metas: fresh, l: sub(f.l), r: sub(f.r) }; break;
    case 'neq': out = { k: 'cond', metas: fresh, premises: [], concl: pf(f) }; break;
    case 'law': out = { k: 'law', metas: [...fresh, ...f.metas], l: sub(f.l), r: sub(f.r) }; break;
    case 'cond': out = { k: 'cond', metas: [...fresh, ...f.metas], premises: f.premises.map(pf), concl: pf(f.concl) }; break;
  }
  cardZmetas(out); // a well-typed card: no binder used with both sorts
  return out;
}

const Z_POOL = ['n', 'k', 'm', 'j', 'i', 'l', 'r', 's'];

// ───────────── generalize ─────────────

/** The universal theorem a solved socket proves (atoms → metas, allowed eq/neq givens → premises). */
export function generalize(level: LevelManifest, socketId: string): Card | null {
  const sock = level.sockets.find((s) => s.id === socketId);
  if (sock && (sock.target.k === 'law' || sock.target.k === 'cond')) {
    // a ∀ goal is already universal; it exports as itself when it rests on nothing and names no constant
    return sock.allowedGivens.length === 0 && factAtoms(sock.target, new Set()).size === 0 ? sock.target : null;
  }
  if (!sock || (sock.target.k !== 'eq' && sock.target.k !== 'neq')) return null;
  const premises: PatFact[] = [];
  for (const gid of sock.allowedGivens) {
    const gd = level.givens.find((g) => g.id === gid);
    if (!gd) return null;
    if (gd.fact.k !== 'eq' && gd.fact.k !== 'neq') return null;
    premises.push({ k: gd.fact.k, l: norm(gd.fact.l), r: norm(gd.fact.r) });
  }
  const toMeta = (t: Term): Term => renameTerm(t, (m) => m, (r) => r, (id) => ({ k: 'meta', id }));
  const used = new Set<string>();
  const pf = (p: PatFact): PatFact => {
    atomsOf(p.l, used); atomsOf(p.r, used);
    return { k: p.k, l: toMeta(p.l), r: toMeta(p.r) };
  };
  const prem = premises.map(pf);
  const concl = pf({ k: sock.target.k, l: norm(sock.target.l), r: norm(sock.target.r) });
  const metas = level.atoms.map((a) => a.id).filter((id) => used.has(id));
  if (!prem.length && concl.k === 'eq') return { k: 'law', metas, l: concl.l, r: concl.r };
  return { k: 'cond', metas, premises: prem, concl };
}

/**
 * Card equality up to a SORT-PRESERVING bijective renaming of bound metas (premise order, kinds, sides
 * and free rigid ids significant). G binders are canonicalized by first structural occurrence; ℤ
 * binders by trying bijections (exponent order depends on names, so first occurrence is not canonical),
 * re-normalizing exponents after each renaming.
 */
export function sameCardUpToRenaming(a: Card, b: Card): boolean {
  if (a.k !== b.k) return false;
  let za: Set<MetaId>, zb: Set<MetaId>;
  try { za = cardZmetas(a); zb = cardZmetas(b); } catch { return false; }
  if (za.size !== zb.size) return false;
  const facts = (c: Card): PatFact[] => (c.k === 'law' ? [{ k: 'eq', l: c.l, r: c.r }] : [...c.premises, c.concl]);
  if (a.k === 'cond' && b.k === 'cond' && a.premises.length !== b.premises.length) return false;
  const gOrder = (c: Card) => { const o: MetaId[] = []; for (const p of facts(c)) for (const t of [p.l, p.r]) for (const id of gmetasOf(t)) if (!o.includes(id)) o.push(id); return o; };
  const ga = gOrder(a), gb = gOrder(b);
  if (ga.length !== gb.length) return false;
  const canon = (c: Card, gnames: MetaId[], zmap: (id: MetaId) => MetaId): string => {
    const gm = new Map(gnames.map((id, i) => [id, `#g${i}`] as const));
    const ser = (t: Term): string => {
      const r = renameTerm(t, (id) => gm.get(id) ?? `?${id}`, (z) => (z.k === 'zmeta' ? { k: 'zmeta', id: zmap(z.id) } : z));
      return termKey(r);
    };
    return facts(c).map((p) => `${p.k}(${ser(p.l)},${ser(p.r)})`).join(';') + `|${c.k}`;
  };
  const zaL = [...za], zbL = [...zb];
  const target = canon(a, ga, (id) => `#z${zaL.indexOf(id)}`);
  if (zbL.length > 7) return canon(b, gb, (id) => `#z${zbL.indexOf(id)}`) === target; // incomplete beyond 7! permutations
  const perm = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perm([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  for (const p of perm(zbL.map((_, i) => i))) {
    if (canon(b, gb, (id) => `#z${p[zbL.indexOf(id)]}`) === target) return true;
  }
  return false;
}

// ───────────── Lemma Book eligibility (sol-exponents §5) ─────────────

/**
 * Whether a checked fact may be saved as a global lemma: a card, at root, with no dependencies (no
 * givens, no open assumptions), mentioning no free Tower and no level constant. Proof replay and
 * import auditing remain the compiler's job (verifyLemma); this is the statement-level gate.
 */
export function lemmaEligibility(fact: Fact | undefined, deps: string[], g: ProofGraph, ctx: KernelCtx):
  { ok: true } | { ok: false; reason: string } {
  const vx = withVars(ctx, g);
  const L = labelsOf(vx.ctx.level.atoms);
  if (!fact || (fact.k !== 'law' && fact.k !== 'cond')) return { ok: false, reason: 'Only a ∀ statement can go in the Lemma Book.' };
  if (deps.length) {
    const why = deps.map((d) => {
      if (d.startsWith('a:')) return 'an open assumption';
      const gd = ctx.level.givens.find((x) => `g:${x.id}` === d);
      return gd ? `${gd.name}: ${factText(gd.fact, L)}` : d;
    });
    return { ok: false, reason: `This rests on ${why.join(', ')}. It is not true in every group.` };
  }
  const refs = new Set<string>();
  factAtoms(fact, refs);
  const varIds = new Set(vx.vars.map((v) => v.id));
  for (const id of refs) {
    if (varIds.has(id)) return { ok: false, reason: `${L[id] ?? id} is still free. Generalize it first.` };
    return { ok: false, reason: `${L[id] ?? id} is a constant of this order. Rebuild it with a Tower.` };
  }
  return { ok: true };
}
