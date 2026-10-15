// LEMMA WORKS kernel — rules, single steps, apply, whole-graph check, generalize. Pure.
import type {
  DeskAssumption, AtomDecl, AxiomId, Card, Schema, CheckResult, Dep, Fact, LevelManifest, MetaId, NodeId, NodeResult, Pallet, PatFact,
  ProofGraph, ProofNode, Room, RuleRef, ScopeId, SocketResult, StepOp, Subst, Term,
} from './types';
import { ROOT } from './types';
import type { KernelCtx } from './index';
import {
  gmetasOf, zmetasOf, zvarsOf, refsInOrder, renameTerm, beads, termKey,
  E, KErr, atomsOf, instantiate, inv, isGround, locate, railOf, locateGap, meta, metasOf, mirrorCard, mul, norm, pow, same,
  spliceRail, withRail, word,
} from './terms';
import { MULTI_GROUP, actionMark, factText, labelsOf, registerLabels, termText, type Labels } from './print';
import { POLY_LIMITS, ResourceLimit, polyNorm, polyRefs, polyRename, resetPolyBudget } from './poly';
import { literalOf, powerAllowed, powerSchema } from './powers';
import { dockText, fillOpen, holesProblem, isOpen } from './open';
import { MAP_SCHEMAS, mapAllowed, mapSchema } from './maps';
import { DEFAULT_GROUP, checkEqSorts, eSortsOf, isGroupSort, isOneGroup, mapKind, mapsOf, retagE, sortEnv, sortOf, type SortEnv } from './sorts';
import { checkSubRef, factPats, factSubs, factTerms, instStructs, mapPat, patTerms, sameSub, subAllowed, subDecl, subSchema, submetasOf, subsIn } from './members';
import type { Poly, SortRef, StructBinder, StructDecl, SubRef, SubgroupDecl, ZRef } from './types';
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

export function pressCard(n: number, power = false, sort?: string): Card & { k: 'law' } {
  if (!validSize(n)) throw new KErr('A group order must be a whole number from 1 to 24.');
  // Book phase C: per group sort — ∀x:S. x^|S| = e_S (pin 7)
  const tagged = sort && sort !== 'G' ? { metaSorts: { x: sort } } : {};
  const e0: Term = sort && sort !== 'G' ? { k: 'e', s: sort } : E;
  if (power) return { k: 'law', metas: ['x'], l: norm({ k: 'pow', base: x, exp: polyNorm([{ coefficient: String(n), monomial: [] }]) }), r: e0, ...tagged };
  return { k: 'law', metas: ['x'], l: pow(x, n), r: e0, ...tagged };
}

const cardMetas = (c: Card): MetaId[] => {
  const out: MetaId[] = [];
  const add = (t: Term) => { for (const m of metasOf(t)) if (!out.includes(m)) out.push(m); };
  if (c.k === 'law') { add(c.l); add(c.r); } else { for (const p of [...c.premises, c.concl]) for (const t of patTerms(p)) add(t); }
  return out;
};

/** ℤ-sorted metas of a card (those occurring in exponents). A meta used with both sorts is ill-typed. */
export function cardZmetas(c: Card): Set<MetaId> {
  const g = new Set<MetaId>(), z = new Set<MetaId>();
  const add = (t: Term) => { for (const id of gmetasOf(t)) g.add(id); for (const id of zmetasOf(t)) z.add(id); };
  if (c.k === 'law') { add(c.l); add(c.r); } else { for (const p of [...c.premises, c.concl]) for (const t of patTerms(p)) add(t); }
  for (const id of z) if (g.has(id)) throw new KErr(`${id} is used as both an element and an integer. The statement is ill-typed.`);
  return z;
}

/** A card's Gᵒᵖ mirror is sound iff every map it applies is a homomorphism (a level hom or a hom parameter). */
export function mirrorSafe(c: Card, ctx: KernelCtx): boolean {
  if ((c.binds ?? []).some((b) => b.k === 'act')) return false;
  const homB = new Set((c.binds ?? []).filter((b) => b.k === 'hom').map((b) => b.id));
  const maps = new Map((ctx.level.maps ?? []).map((m) => [m.id, m]));
  return factTerms(c).every((t) => mapsOf(t).every((f) => homB.has(f) || (maps.get(f)?.kind ?? 'map') === 'hom'));
}

/** Display metadata of a schema id: kernel power imports first, then the registry. */
export function schemaInfo(id: string, ctx: KernelCtx): Schema | undefined {
  const sb = subSchema(id) ?? mapSchema(id); if (sb) return sb;
  try { const p = powerSchema(id); if (p) return p; } catch { /* unknown power id */ }
  return ctx.registry[id];
}

/**
 * Why a theorem id is not in the registry, in the player's words: a disabled saved lemma by its display name and
 * reason, a lemma gone from the Lemma Book, else an unknown theorem. Never prints a raw `lemma:…` id.
 */
export function missingTheorem(id: string, ctx: KernelCtx): string {
  const d = ctx.disabled?.[id];
  if (d) return `The lemma “${d.name}” isn't available. ${d.reason?.trim() || 'It is disabled in your Lemma Book.'}`;
  if (id.startsWith('lemma:')) return 'This floor uses a saved lemma that is no longer in your Lemma Book.';
  return `There is no theorem “${id}”.`;
}

/** Whether a registry schema may be used in the current level, with its (possibly mirrored) card. */
export function schemaCard(id: string, mirror: boolean | undefined, ctx: KernelCtx): Card {
  // Book phase C: the map kinds' laws are kernel-owned too
  const mb = typeof id === 'string' ? mapSchema(id) : null;
  if (mb) {
    if (!mapAllowed(id, ctx.level)) throw new KErr(`${mb.name} is not available here.`);
    if (mirror) throw new KErr(`${mb.name} has no mirror version.`);
    return mb.card;
  }
  // Book phase B: subgroup schemas are kernel-owned (a registry entry with the same id grants nothing)
  const sb = typeof id === 'string' ? subSchema(id) : null;
  if (sb) {
    if (!subAllowed(id, ctx.level)) throw new KErr(ctx.level.unlocks.includes(id) ? `${sb.name} is what this order proves. It can't prove itself.` : `${sb.name} is not available here.`);
    if (mirror && !sb.mirrorable) throw new KErr(`${sb.name} has no mirror version.`);
    return mirror ? mirrorCard(sb.card) : sb.card;
  }
  // imported power laws: kernel-owned authority; a registry entry with the same id grants nothing
  const imported = typeof id === 'string' ? powerSchema(id) : null;
  if (imported) {
    if (!powerAllowed(id, ctx.level.tools.schemas)) throw new KErr(`${imported.name} is not available here.`);
    if (mirror && !imported.mirrorable) throw new KErr(`${imported.name} has no mirror version.`);
    return mirror ? mirrorCard(imported.card) : imported.card;
  }
  const sc = ctx.registry[id];
  if (!sc) throw new KErr(missingTheorem(id, ctx));
  if (ctx.level.unlocks.includes(id)) throw new KErr(`${sc.name} is what this order proves. It can't prove itself.`);
  if (!ctx.level.tools.schemas.includes(id)) throw new KErr(`${sc.name} is not available here.`);
  if (mirror && !sc.mirrorable) throw new KErr(`${sc.name} has no mirror version.`);
  // Book phase C (pin 3): only cards whose maps are all homomorphisms have a sound Gᵒᵖ mirror
  if (mirror && !mirrorSafe(sc.card, ctx)) throw new KErr(`${sc.name} mentions a map that is not a homomorphism. It has no mirror version.`);
  return mirror ? mirrorCard(sc.card) : sc.card;
}

/** `poly`: a one-group card (axioms, schemas without sorts/maps) — used at a redex of group S it reads with e_S. */
export interface Law { l: Term; r: Term; metas: MetaId[]; zmetas: Set<MetaId>; name: string; poly?: boolean }

export function ruleName(rule: RuleRef, ctx: KernelCtx): string {
  if (rule.k === 'axiom') return rule.id === 'unitL' || rule.id === 'unitR' ? 'the identity law' : 'the inverse law';
  if (rule.k === 'schema') {
    let sc = subSchema(rule.id) ?? mapSchema(rule.id) ?? ctx.registry[rule.id];
    try { sc = powerSchema(rule.id) ?? sc; } catch { /* unknown */ }
    return sc ? (rule.mirror ? (MIRROR_NAMES[rule.id]?.name ?? `${sc.name} ᵒᵖ`) : sc.name) : rule.id;
  }
  return 'the cited fact';
}

/** Resolve a rewrite rule to an equation l = r with metas. */
export function resolveLaw(rule: RuleRef, ctx: KernelCtx, ruleFact: Fact | undefined, L: Labels, structs?: Record<MetaId, string>): Law {
  if (!rule || typeof rule !== 'object') throw new KErr('This rule is malformed.');
  if (rule.k === 'axiom') {
    const c = axiomCard(rule.id);
    return { l: c.l, r: c.r, metas: ['x'], zmetas: new Set(), name: ruleName(rule, ctx), poly: true };
  }
  if (rule.k === 'schema') {
    let c = schemaCard(rule.id, rule.mirror, ctx);
    if (c.k !== 'law') {
      throw new KErr(`${cap(ruleName(rule, ctx))} is an if–then theorem. Feed it its premises first.`);
    }
    const poly = isOneGroup(c);
    // Book phase C: a law over a hom / action (hom.mul, a saved "for every homomorphism f" card) is instantiated first
    if (c.binds?.length || structs && Object.keys(structs).length) c = instStructs(c, structs, ctx.level, ruleName(rule, ctx)) as typeof c;
    return { l: norm(c.l), r: norm(c.r), metas: cardMetas(c), zmetas: cardZmetas(c), name: ruleName(rule, ctx), poly };
  }
  if (rule.k === 'node') {
    if (!ruleFact) throw new KErr('The cited fact is missing.');
    switch (ruleFact.k) {
      case 'eq': return { l: norm(ruleFact.l), r: norm(ruleFact.r), metas: [], zmetas: new Set(), name: factText(ruleFact, L) };
      case 'law': {
        const c = ruleFact.binds?.length || structs && Object.keys(structs).length ? instStructs(ruleFact, structs, ctx.level, factText(ruleFact, L)) : ruleFact;
        return { l: norm(c.l), r: norm(c.r), metas: cardMetas(c), zmetas: cardZmetas(c), name: factText(ruleFact, L) };
      }
      case 'neq': throw new KErr(`${factText(ruleFact, L)} is an inequation. It can't rewrite anything.`);
      case 'bot': throw new KErr("⊥ has no sides. It can't rewrite anything.");
      case 'size': throw new KErr(`|G| = ${ruleFact.n} is the group's size, not an equation. It can't rewrite anything.`);
      case 'mem': throw new KErr(`${factText(ruleFact, L)} is a membership, not an equation. It can't rewrite anything.`);
      case 'cond': throw new KErr(`${factText(ruleFact, L)} is if–then. Apply it to its premise first.`);
    }
  }
  throw new KErr('This rule is malformed.');
}

export interface CondCard { metas: MetaId[]; zmetas: Set<MetaId>; premises: PatFact[]; concl: PatFact; name: string; poly?: boolean }

/** Resolve an apply rule to a conditional card (laws become zero-premise cards emitting an eq). */
export function resolveCond(rule: RuleRef, ctx: KernelCtx, ruleFact: Fact | undefined, L: Labels, structs?: Record<MetaId, string>): CondCard {
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
  // one-group cards (axioms and registry schemas without sorts or maps) are sort-polymorphic (§5.6)
  const poly = rule.k !== 'node' && isOneGroup(c);
  // Book phase B/C: a card schematic over structures is instantiated at the chosen ones first
  if (c.binds?.length || structs && Object.keys(structs).length) c = instStructs(c, structs, ctx.level, name);
  if (c.k === 'law') return { metas: cardMetas(c), zmetas: cardZmetas(c), premises: [], concl: { k: 'eq', l: norm(c.l), r: norm(c.r) }, name, poly };
  return { metas: cardMetas(c), zmetas: cardZmetas(c), premises: c.premises, concl: c.concl, name, poly };
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
      case 'e':
        if (v.s !== undefined && (typeof v.s !== 'string' || !sortEnv(ctx.level).sorts.has(v.s))) throw new KErr(`There is no group ${String(v.s)} here.`);
        return;
      case 'app': {
        // Book phase C: a declared map (or Hom Tower) applied to arguments
        if (typeof v.fn !== 'string' || !Array.isArray(v.args) || !v.args.length) throw new KErr(`${cap(what)} is not an element.`);
        if (!sortEnv(ctx.level).maps.has(v.fn)) throw new KErr(`${v.fn} is not a map here.`);
        v.args.forEach((a) => go(a, depth + 1));
        return;
      }
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
  const n = norm(t);
  // Book phase C: in a many-sorted level every element is well-sorted
  const env = sortEnv(ctx.level);
  if (env.multi) sortOf(n, env, undefined, levelLabels(ctx.level));
  return n;
}

/** Book phase C: a node's (in)equation or membership must be well-sorted (both sides in one sort; t in S's group). */
export function checkFactSorts(f: Fact, ctx: KernelCtx): void {
  const env = sortEnv(ctx.level);
  if (!env.multi) return;
  const L = levelLabels(ctx.level);
  if (f.k === 'eq' || f.k === 'neq') checkEqSorts(f.l, f.r, env, L);
  else if (f.k === 'mem' && f.sub.k === 'sub') {
    const s = sortOf(f.t, env, undefined, L), want = subDecl(ctx.level, f.sub.id)?.sort ?? DEFAULT_GROUP;
    if (s !== want) throw new KErr(`${termText(f.t, L)} is in ${env.label(s)}, but ${L[f.sub.id] ?? f.sub.id} is a subgroup of ${env.label(want)}.`);
  }
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

/** Display labels of a level: atoms (and Towers) plus, Book phase B, its subgroups (and Subgroup Towers). */
export function levelLabels(level: LevelManifest): Labels {
  const L: Labels = {
    // two or more groups: every identity is subscripted in text (playtest W10–14 #3)
    ...([...sortEnv(level).sorts.values()].filter((x) => x.kind === 'group').length >= 2 ? { [MULTI_GROUP]: '1' } : {}),
    ...Object.fromEntries((level.maps ?? []).filter((m) => m.kind === 'action').map((m) => [actionMark(m.id), '1'])),
    ...Object.fromEntries([...(level.sorts ?? []), ...(level.maps ?? [])].map((x) => [x.id, x.label])),
    ...labelsOf(level.atoms), ...Object.fromEntries(subsIn(level).map((x) => [x.id, x.label])),
  };
  registerLabels(L);
  return L;
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
  const L = levelLabels(ctx.level);
  if (!op || typeof op !== 'object') throw new KErr('This step is malformed.');
  if (op.k === 'swap') {
    if (p.k === 'mem') throw new KErr('A membership t ∈ H has one side. There is nothing to swap.');
    if (p.k !== 'eq' && p.k !== 'neq') throw new KErr(p.k === 'bot' ? '⊥ has no sides to swap.' : 'Only an equation or inequation can be swapped.');
    return { k: p.k, l: p.r, r: p.l };
  }
  if (op.k === 'invert') {
    // L = R ⟹ L⁻¹ = R⁻¹ (congruence); L ≠ R ⟹ L⁻¹ ≠ R⁻¹ (inversion is injective)
    if (p.k === 'mem') throw new KErr('A membership is not inverted on both sides. Use “closed under inverses” on a Theorem.');
    if (p.k !== 'eq' && p.k !== 'neq') throw new KErr('Only an equation or inequation can be inverted.');
    return { k: p.k, l: inv(p.l), r: inv(p.r) };
  }
  if (op.k === 'applyMap') {
    // Book phase C: u = v ⟹ f(…u…) = f(…v…) (congruence). Not on ≠ (that would need injectivity, a given).
    if (p.k !== 'eq') throw new KErr(p.k === 'neq' ? 'From u ≠ v nothing follows about f(u) and f(v). Apply a map to an equation.' : 'Apply a map to an equation.');
    const env = sortEnv(ctx.level);
    const m = env.maps.get(op.fn);
    if (!m) throw new KErr(`${String(op.fn)} is not a map here.`);
    const slot = op.slot ?? 0;
    const others = Array.isArray(op.others) ? op.others : [];
    if (!Number.isInteger(slot) || slot < 0 || slot >= m.args.length) throw new KErr(`${m.label} has no argument ${slot + 1}.`);
    if (others.length !== m.args.length - 1) throw new KErr(`${m.label} takes ${m.args.length} arguments. Choose the other ${m.args.length - 1}.`);
    const fixed = others.map((o) => checkGround(o, ctx, 'the other argument'));
    const at = (u: Term): Term => ({ k: 'app', fn: m.id, args: [...fixed.slice(0, slot), u, ...fixed.slice(slot)] });
    return { k: 'eq', l: norm(at(p.l)), r: norm(at(p.r)) };
  }
  // Book phase B: inside a membership t ∈ S, rewriting t is Leibniz (t = t′, t ∈ S ⟹ t′ ∈ S); so is insert e
  if (p.k === 'mem' && op.k === 'lift') throw new KErr('A membership can’t be multiplied: t ∈ H does not give at ∈ H. Use “closed under products” on a Theorem.');
  if (p.k !== 'eq' && p.k !== 'mem') {
    if (p.k === 'neq') throw new KErr('This is an inequation. Only equations can be rewritten or multiplied.');
    if (p.k === 'bot') throw new KErr('⊥ cannot be rewritten.');
    throw new KErr('Only an equation between elements can be rewritten.');
  }
  switch (op.k) {
    case 'insertE': {
      const g = locateGap(p, op.at);
      if (!g) throw new KErr('That gap is gone. Pick the gap again.');
      // Book phase C: the identity of the word's own group
      const env = sortEnv(ctx.level);
      let e0: Term = E;
      if (env.multi) {
        const S = sortOf(g.word.length === 1 ? g.word[0]! : { k: 'mul', fs: g.word }, env, undefined, levelLabels(ctx.level));
        if (!isGroupSort(env, S)) throw new KErr(`${env.label(S)} is a set, not a group: there is no e to insert.`);
        e0 = norm({ k: 'e', s: S });
      }
      return withRail(p, g.side, spliceRail(railOf(p, g.side)!, g.wordPath, g.gap, g.gap, [e0]));
    }
    case 'lift': {
      if (p.k !== 'eq') throw new KErr('Only an equation can be multiplied on both sides.');
      if (!ctx.level.tools.lift) throw new KErr('Multiplying both sides is not available here.');
      const t = checkGround(op.term, ctx, 'the multiplier');
      if (op.side === 'left') return { k: 'eq', l: mul([t, p.l]), r: mul([t, p.r]) };
      if (op.side === 'right') return { k: 'eq', l: mul([p.l, t]), r: mul([p.r, t]) };
      throw new KErr('Multiply on the left or the right.');
    }
    case 'rewrite': {
      const law0 = resolveLaw(op.rule, ctx, ruleFact, L, op.structs);
      let law = law0;
      {
        // Book phase C: a one-group law used at a redex of group S reads with e_S (sort polymorphism, §5.6)
        const env = sortEnv(ctx.level);
        const loc0 = env.multi && law0.poly ? locate(p, op.at) : null;
        if (loc0) {
          const S = sortOf(norm(loc0.redex), env, undefined, levelLabels(ctx.level));
          law = { ...law0, l: norm(retagE(law0.l, S)), r: norm(retagE(law0.r, S)) };
        }
      }
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
      return withRail(p, loc.side, spliceRail(railOf(p, loc.side)!, loc.wordPath, loc.s, loc.e, word(dstInst)));
    }
    default: throw new KErr('This step is malformed.');
  }
}

/** Apply a (resolved) card to premise facts under σ. Returns the conclusion pallet. */
export function applyCore(card0: CondCard, inputs: Fact[], s0: Subst, ctx: KernelCtx): Pallet {
  const L = levelLabels(ctx.level);
  let card = card0;
  {
    // Book phase C: a one-group card reads in the group of its first premise (or of its first element value)
    const env = sortEnv(ctx.level);
    if (env.multi && card0.poly) {
      const first = inputs[0];
      const t0 = first && (first.k === 'eq' || first.k === 'neq') ? first.l : first && first.k === 'mem' ? first.t : Object.values(s0).find((v) => v && v.k !== 'int');
      let S: string = DEFAULT_GROUP;
      try { if (t0) S = sortOf(norm(t0), env); } catch { /* the sort check of the result reports it */ }
      const rt = (t: Term) => retagE(t, S);
      card = { ...card0, premises: card0.premises.map((pp) => mapPat(pp, rt)), concl: mapPat(card0.concl, rt) };
    }
  }
  const s = checkSubst(s0, card.metas, ctx, card.zmetas);
  if (inputs.length !== card.premises.length) {
    const n = card.premises.length;
    throw new KErr(`${cap(card.name)} takes ${n} premise${n === 1 ? '' : 's'}. It got ${inputs.length}.`);
  }
  card.premises.forEach((pr, i) => {
    const want = instPat(pr, s);
    const got = inputs[i]!;
    const ok = (got.k === 'eq' || got.k === 'neq' || got.k === 'mem') && samePat(got, want);
    if (!ok) {
      const which = card.premises.length > 1 ? `Premise ${i + 1}` : 'The premise';
      throw new KErr(`${which} must read ${factText(want, L)}. It reads ${factText(got, L)}.`);
    }
  });
  const out = instPat(card.concl, s);
  if (out.k === 'mem' && out.sub.k !== 'sub') throw new KErr(`${cap(card.name)} concludes about a subgroup it does not bind.`);
  return out as Pallet;
}

/** Instantiate a statement (σ for metas; subgroup refs unchanged). */
export function instPat(p: PatFact, s: Subst): PatFact {
  return mapPat(p, (t) => instantiate(t, s));
}
/** A ground statement of this level: declared atoms only, no metas; a membership names a subgroup in scope. */
export function checkStatement(p: PatFact, ctx: KernelCtx, what: string): void {
  for (const t of patTerms(p)) checkGround(t, ctx, what);
  if (p.k === 'mem') checkSubRef(p.sub, ctx.level, what);
}

/** Equality of two statements after norm (kinds, sides in order, same subgroup). */
export function samePat(a: PatFact | Pallet, b: PatFact | Pallet): boolean {
  if (a.k !== b.k) return false;
  if (a.k === 'mem' && b.k === 'mem') return sameSub(a.sub, b.sub) && same(norm(a.t), norm(b.t));
  if ((a.k === 'eq' || a.k === 'neq') && (b.k === 'eq' || b.k === 'neq')) return same(norm(a.l), norm(b.l)) && same(norm(a.r), norm(b.r));
  return false;
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

const isPallet = (f: Fact | undefined): f is Pallet => !!f && (f.k === 'eq' || f.k === 'neq' || f.k === 'bot' || f.k === 'size' || f.k === 'mem');

export function check(g: ProofGraph, ctx0: KernelCtx): CheckResult {
  resetPolyBudget();
  const vx = withVars(ctx0, g);
  const ctx = vx.ctx;
  const L = levelLabels(ctx.level);
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
    if (!bad && /\/\d+$/.test(r.id)) bad = 'A room name may not end in /<number>.';
    if (!bad && r.assumes !== undefined) bad = assumesProblem(r);
    if (!bad) {
      const what = r.kind === 'suppose' ? 'the supposition' : 'the assumption';
      try { for (const a of assumptionsOf(r)) checkStatement(a, ctx, what); }
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
      results[id] = evalNode(n, ctx, L, results, byId, rooms, roomErr, vx.vars, vx.structs);
    } catch (e) {
      results[id] = fail(id, e instanceof KErr ? e.message : `This step is malformed (${(e as Error)?.message ?? 'unknown'}).`);
    }
  }
  for (const id of dupes) if (!results[id]) results[id] = fail(id, 'Two steps share one name.');
  for (const r of Object.values(results)) if (!r.ok) ok = false;

  const rigid = new Set(vx.vars.map((v) => v.id));
  const sockets = ctx.level.sockets.map((sock) => socketResult(sock, nodes, results, L, rigid, ctx.level.givens));
  return { ok, nodes: results, sockets, solved: sockets.length > 0 && sockets.every((s) => s.ok) };
}

function socketResult(
  sock: LevelManifest['sockets'][number], nodes: ProofNode[], results: Record<NodeId, NodeResult>, L: Labels,
  rigid: Set<string> = new Set(), givens: LevelManifest['givens'] = [],
): SocketResult {
  const t = sock.target;
  const allowed = new Set(sock.allowedGivens.map((g) => `g:${g}`));
  let nearly: string | undefined;
  // display names, never ids (playtest W4–9: "rests on given injgf" → "rests on the given g∘f injective")
  const givenName = (id: string) => givens.find((g) => g.id === id)?.name ?? id;
  const reliesOn = (extra: string[]) =>
    [...new Set(extra.map((d) => (d.startsWith('a:') ? 'an open assumption' : `the given ${givenName(d.slice(2))}`)))].join(', ');
  if (sock.holes !== undefined) {
    // Book phase A: an open dock. Filled by the first root node whose fact is target[holes := T̄]
    // (pallets: ordered sides — the bench records a swap; cards: up to renaming, premise order, flip).
    const bad = holesProblem(sock);
    if (bad) return { id: sock.id, ok: false, error: `This goal is malformed. ${bad}` };
    if (isOpen(sock)) {
      for (const n of nodes) {
        if (n.scope !== ROOT) continue;
        const r = results[n.id];
        if (!r?.ok || !r.fact) continue;
        const fill = fillOpen(sock, r.fact, { rigid, sameCard: sameCardUpToPermutation });
        if (!fill) continue;
        const extra = r.deps.filter((d) => !allowed.has(d));
        if (extra.length) { nearly = `This proof rests on ${reliesOn(extra)}. This goal doesn't allow that.`; continue; }
        return { id: sock.id, ok: true, filledBy: n.id, holes: fill.holes, instance: fill.instance };
      }
      return { id: sock.id, ok: false, error: nearly ?? `${dockText(sock, L)} is not proved yet.` };
    }
  }
  if (t.k === 'law' || t.k === 'cond') {
    // a ∀ goal: a root card equal to the target up to renaming of its variables
    for (const n of nodes) {
      if (n.scope !== ROOT) continue;
      const r = results[n.id];
      if (!r?.ok || !r.fact || (r.fact.k !== 'law' && r.fact.k !== 'cond')) continue;
      // equality is symmetric under ∀ and ⇒: a flipped law or a cond with a flipped = conclusion also fills.
      // Book phase A: premises compare up to permutation (a conjunction; multi-desk rooms).
      if (!sameCardUpToPermutation(r.fact, t) && !sameCardUpToPermutation(flipConclusion(r.fact), t)) continue;
      const extra = r.deps.filter((d) => !allowed.has(d));
      if (extra.length) { nearly = `This proof rests on ${reliesOn(extra)}. This goal doesn't allow that.`; continue; }
      return { id: sock.id, ok: true, filledBy: n.id };
    }
    return { id: sock.id, ok: false, error: nearly ?? `${factText(t, L)} is not proved yet.` };
  }
  if (t.k === 'mem') {
    // Book phase B: a membership goal — the same term (norm-equal) in the same subgroup
    for (const n of nodes) {
      if (n.scope !== ROOT) continue;
      const r = results[n.id];
      if (!r?.ok || !r.fact || r.fact.k !== 'mem' || !samePat(r.fact, t)) continue;
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
      nearly = `This proof rests on ${reliesOn(extra)}. This goal doesn't allow that.`;
      continue;
    }
    return { id: sock.id, ok: true, filledBy: n.id };
  }
  return { id: sock.id, ok: false, error: nearly ?? `${factText(t, L)} is not proved yet.` };
}

function evalNode(
  n: ProofNode, ctx: KernelCtx, L: Labels, results: Record<NodeId, NodeResult>,
  byId: Map<NodeId, ProofNode>, rooms: Map<ScopeId, Room>, roomErr: Map<ScopeId, string>,
  vars: AtomDecl[] = [], structs: StructDecl[] = [],
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

  const done = (fact: Fact): NodeResult => { checkFactSorts(fact, ctx); return { id, ok: true, fact, deps: [...deps].sort(), classical }; };

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
      if ((f.k === 'eq' || f.k === 'neq') && (!isGround(f.l) || !isGround(f.r))) throw new KErr(`The given ${gd.name} has a variable. A given equation must be about elements.`);
      if (f.k === 'mem') {
        if (!isGround(f.t)) throw new KErr(`The given ${gd.name} has a variable. A given membership must be about elements.`);
        checkSubRef(f.sub, ctx.level, `the given ${gd.name}`);
        return done({ k: 'mem', t: norm(f.t), sub: f.sub });
      }
      return done(f.k === 'eq' || f.k === 'neq' ? { k: f.k, l: norm(f.l), r: norm(f.r) } : f);
    }
    case 'assume': {
      const room = rooms.get(n.room);
      if (!room) throw new KErr('There is no such room.');
      if (scope !== n.room) throw new KErr('A supposition belongs inside its own room.');
      const all = assumptionsOf(room);
      const slot = n.slot ?? 0;
      if (!Number.isInteger(slot) || slot < 0 || slot >= all.length) throw new KErr('This desk has no assumption in its room.');
      deps.add(roomDep(room.id, slot));
      return done(all[slot]!);
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
      const card = resolveCond(n.rule, ctx, ruleFact, L, n.structs);
      const ins = (Array.isArray(n.inputs) ? n.inputs : []).map((ref, i) => {
        const f = use(ref, `premise ${i + 1}`).fact;
        if (f.k !== 'eq' && f.k !== 'neq' && f.k !== 'mem') throw new KErr(`Premise ${i + 1} must be an equation, inequation or membership.`);
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
        if (q.k !== 'eq' && q.k !== 'neq' && q.k !== 'mem') throw new KErr('An assume room exports an equation, inequation or membership proved inside it.');
        for (const d of r.deps) if (depRoom(d)?.room !== room.id) deps.add(d);
        classical = r.classical;
        return done({ k: 'cond', metas: [], premises: assumptionsOf(room), concl: mapPat(q, norm) });
      }
      if (!r || !r.ok || !r.fact) throw new KErr('The contradiction closing this room is broken.');
      if (r.fact.k !== 'bot') throw new KErr('The assumption is still open. Only a contradiction (⊥) closes this room.');
      for (const d of r.deps) if (depRoom(d)?.room !== room.id) deps.add(d);
      classical = r.classical || room.kind === 'classical';
      const l = norm(room.l), rr = norm(room.r);
      return done(room.kind === 'suppose' ? { k: 'neq', l, r: rr } : { k: 'eq', l, r: rr });
    }
    case 'press': {
      if (!ctx.level.tools.press) throw new KErr('The Lagrange press is not available here.');
      const inp = use(n.input, 'the group order');
      if (inp.fact.k !== 'size') throw new KErr('The Lagrange press needs the group order (|G| = n).');
      return done(pressCard(inp.fact.n, n.power === true, inp.fact.s));
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
      // Book phase C: never a level sort's or map's name (an untagged e and map heads must stay unambiguous)
      for (const x of [...(ctx.level.sorts ?? []), ...(ctx.level.maps ?? [])]) if (!structs.some((st) => st.id === x.id)) { reserved.add(x.id); reserved.add(x.label); }
      const hyps: Room[] = [];
      for (const d of deps) {
        if (!d.startsWith('a:')) continue;
        const h = hypRoom(d, rooms);
        // every assumption a fact rests on must be inspected; an unresolvable one is never waved through
        if (!h) throw new KErr('This rests on an assumption that no longer exists.');
        hyps.push(h);
      }
      return done(generalizeFact(inp.fact, vars, hyps, reserved, L, structs, sortEnv(ctx.level)));
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

/** The fact a room's (first) desk provides. */
export function assumptionOf(room: Room): PatFact & Pallet {
  if (room.kind === 'assume' && Array.isArray(room.assumes) && room.assumes.length) return assumptionFact(room.assumes[0]!);
  const l = norm(room.l), r = norm(room.r);
  if (room.kind === 'suppose') return { k: 'eq', l, r };
  if (room.kind === 'classical') return { k: 'neq', l, r };
  return room.rel === 'neq' ? { k: 'neq', l, r } : { k: 'eq', l, r };
}

/** One declared assumption as a fact. Unknown kinds are refused. Book phase B: a membership t ∈ S. */
export function assumptionFact(a: DeskAssumption): PatFact & Pallet {
  if (!a || typeof a !== 'object') throw new KErr('An assumption must be an equation, inequation or membership.');
  if (a.rel === 'mem') return { k: 'mem', t: norm(a.t), sub: a.sub };
  if (a.rel !== 'eq' && a.rel !== 'neq') throw new KErr('An assumption must be an equation, inequation or membership.');
  return { k: a.rel, l: norm(a.l), r: norm(a.r) };
}

/** Book phase A: every assumption of a room, in desk (slot) order. A single-desk room has one. */
export function assumptionsOf(room: Room): (PatFact & Pallet)[] {
  if (room.kind === 'assume' && Array.isArray(room.assumes) && room.assumes.length) return room.assumes.map(assumptionFact);
  return [assumptionOf(room)];
}

/** Most desks an Assume room may hold (SYNTHESIS §4). */
export const MAX_DESKS = 3;

/** Why a room's `assumes` declaration is malformed, or null. */
function assumesProblem(r: Room): string | null {
  if (!Array.isArray(r.assumes)) return 'The room’s assumptions are malformed.';
  if (r.kind !== 'assume') return 'Only an Assume room holds several assumptions.';
  if (r.assumes.length < 1) return 'An Assume room needs an assumption.';
  if (r.assumes.length > MAX_DESKS) return `An Assume room holds at most ${MAX_DESKS} assumptions.`;
  for (const a of r.assumes) if (!a || (a.rel !== 'eq' && a.rel !== 'neq' && a.rel !== 'mem')) return 'An assumption must be an equation, inequation or membership.';
  return null;
}

/** The dependency token of desk `slot` of a room: 'a:<room>' for slot 0, 'a:<room>/<slot>' otherwise. */
export function roomDep(room: ScopeId, slot = 0): Dep { return slot ? `a:${room}/${slot}` : `a:${room}`; }

/** Parse a room dependency token (inverse of roomDep); null for givens and anything else. */
export function depRoom(d: Dep): { room: ScopeId; slot: number } | null {
  if (typeof d !== 'string' || !d.startsWith('a:')) return null;
  const m = /^a:(.*)\/(\d+)$/.exec(d);
  return m ? { room: m[1]!, slot: Number(m[2]) } : { room: d.slice(2), slot: 0 };
}

/** The single assumption a dependency token stands for, as a one-desk room (for eigenvariable checks and messages). */
export function hypRoom(d: Dep, rooms: Map<ScopeId, Room>): Room | null {
  const dr = depRoom(d);
  const room = dr ? rooms.get(dr.room) : undefined;
  if (!dr || !room) return null;
  if (room.kind !== 'assume' || !Array.isArray(room.assumes) || !room.assumes.length) return dr.slot === 0 ? room : null;
  const a = room.assumes[dr.slot];
  if (!a) return null;
  if (a.rel === 'mem') return { id: room.id, parent: room.parent, kind: 'assume', l: a.t, r: a.t, assumes: [a] };
  return { id: room.id, parent: room.parent, kind: 'assume', l: a.l, r: a.r, rel: a.rel };
}

// ───────────── variables (v4 Towers) ─────────────

function factAtoms(f: Fact, acc: Set<string>): Set<string> {
  for (const t of factTerms(f)) { atomsOf(t, acc); zvarsOf(t, acc); }
  return acc;
}

/**
 * The context extended with the graph's declared variables. A variable must be fresh: its id may not
 * be a level atom or appear in any given or goal, and labels are unique. Invalid declarations are
 * ignored (so terms using them fail as undeclared) and reported in `error`.
 */
export function withVars(ctx: KernelCtx, g: ProofGraph | undefined | null): { ctx: KernelCtx; vars: AtomDecl[]; structs: StructDecl[]; error?: string } {
  const a = withElementVars(ctx, g);
  const sdecl = Array.isArray(g?.structs) ? g!.structs! : [];
  if (!sdecl.length) {
    const bad = a.vars.find((v) => v.carrier !== undefined && v.carrier !== DEFAULT_GROUP && !sortEnv(ctx.level).sorts.has(v.carrier));
    if (!bad) return { ...a, structs: [] };
  }
  // Towers that declare structures are fresh: never a level symbol, never named by a given or goal.
  // Book phase B: Subgroup Towers. Book phase C: group Towers (G₁) and Hom Towers (f₁ : G₁ → H₁).
  const taken = new Set([...subsIn(ctx.level).map((x) => x.id), ...a.ctx.level.atoms.map((x) => x.id),
    ...(ctx.level.sorts ?? []).map((x) => x.id), ...(ctx.level.maps ?? []).map((x) => x.id), DEFAULT_GROUP, 'Z']);
  for (const f of [...ctx.level.givens.map((gd) => gd.fact), ...ctx.level.sockets.map((sk) => sk.target)]) {
    factSubs(f, taken);
    for (const t of factTerms(f)) { for (const m of mapsOf(t)) taken.add(m); for (const e of eSortsOf(t)) taken.add(e); }
  }
  const labels = new Set([...subsIn(ctx.level).map((x) => x.label), ...a.ctx.level.atoms.map((x) => x.label),
    ...(ctx.level.sorts ?? []).map((x) => x.label), ...(ctx.level.maps ?? []).map((x) => x.label)]);
  const ok: StructDecl[] = [];
  let error = a.error;
  const groupsKnown = new Set([...(ctx.level.sorts ?? []).filter((x) => x.kind === 'group').map((x) => x.id), DEFAULT_GROUP]);
  // group Towers first (Hom Towers may name them in any order)
  const ordered = [...sdecl.filter((x) => x?.k === 'grp'), ...sdecl.filter((x) => x?.k !== 'grp')];
  for (const st of ordered) {
    if (!st || (st.k !== 'sub' && st.k !== 'grp' && st.k !== 'hom') || typeof st.id !== 'string' || !st.id) { error = 'A Tower has no name.'; continue; }
    const label = typeof st.label === 'string' && st.label ? st.label : st.id;
    if (taken.has(st.id)) { error = `${label} can't be a Tower here. That name is already taken.`; continue; }
    if (labels.has(label)) { error = `Two things are both called ${label}.`; continue; }
    if (st.k === 'hom' && (!groupsKnown.has(st.dom) || !groupsKnown.has(st.cod))) { error = `${label} must go between groups of this floor.`; continue; }
    if (st.k === 'sub' && st.sort !== undefined && !groupsKnown.has(st.sort)) { error = `${label} must be a subgroup of a group here.`; continue; }
    taken.add(st.id); labels.add(label);
    if (st.k === 'grp') groupsKnown.add(st.id);
    ok.push(st.k === 'sub' ? { k: 'sub', id: st.id, label, normal: st.normal === true, ...(st.sort ? { sort: st.sort } : {}) }
      : st.k === 'grp' ? { k: 'grp', id: st.id, label } : { k: 'hom', id: st.id, label, dom: st.dom, cod: st.cod });
  }
  const subgroups: SubgroupDecl[] = [...subsIn(ctx.level), ...ok.flatMap((x) => (x.k === 'sub' ? [{ id: x.id, label: x.label, normal: x.normal, variable: true, ...(x.sort ? { sort: x.sort } : {}) }] : []))];
  const grps = ok.filter((x): x is StructDecl & { k: 'grp' } => x.k === 'grp');
  const homs = ok.filter((x): x is StructDecl & { k: 'hom' } => x.k === 'hom');
  const level = { ...a.ctx.level, subgroups };
  if (grps.length || homs.length) {
    const base = ctx.level.sorts?.length ? ctx.level.sorts : [{ id: DEFAULT_GROUP, kind: 'group' as const, label: 'G' }];
    level.sorts = [...base, ...grps.map((x) => ({ id: x.id, kind: 'group' as const, label: x.label }))];
    level.maps = [...(ctx.level.maps ?? []), ...homs.map((x) => ({ id: x.id, label: x.label, args: [x.dom], res: x.cod, kind: 'hom' as const }))];
  }
  // an element Tower lives in a declared group or set (its carrier)
  const env = sortEnv(level);
  const vars = a.vars.filter((v) => {
    if (v.sort === 'Z' || v.carrier === undefined || env.sorts.has(v.carrier)) return true;
    error = `${v.label} lives in ${v.carrier}, which is not a group or set here.`;
    return false;
  });
  if (vars.length !== a.vars.length) level.atoms = level.atoms.filter((x) => !x.variable || vars.some((v) => v.id === x.id));
  return { ctx: { ...a.ctx, level }, vars, structs: ok, error };
}

function withElementVars(ctx: KernelCtx, g: ProofGraph | undefined | null): { ctx: KernelCtx; vars: AtomDecl[]; error?: string } {
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
export function generalizeFact(f: Fact, vars: AtomDecl[], hyps: Room[], reserved: Set<string> = new Set(), L: Labels = {}, structs: StructDecl[] = [], env?: SortEnv): Card {
  const varIds = new Set(vars.map((v) => v.id));
  const towerSubs = new Set(structs.filter((x) => x.k === 'sub').map((x) => x.id));
  const towerGrps = new Set(structs.filter((x) => x.k === 'grp').map((x) => x.id));
  const towerHoms = new Map(structs.filter((x): x is StructDecl & { k: 'hom' } => x.k === 'hom').map((x) => [x.id, x] as const));
  const multi = !!env?.multi;
  const sortOf_ = (id: string) => (vars.find((v) => v.id === id)?.sort === 'Z' ? 'Z' : 'G');
  const carrierOf = (id: string) => vars.find((v) => v.id === id)?.carrier ?? DEFAULT_GROUP;
  if (f.k === 'bot') throw new KErr('⊥ cannot be generalized.');
  if (f.k === 'size') throw new KErr('|G| = n has no element in it. There is nothing to generalize.');
  // first occurrence in structural order: fact fields in order, bases before exponents
  const seen: string[] = [];
  for (const t of factTerms(f)) refsInOrder(t, seen);
  const order = seen.filter((id) => varIds.has(id));
  // Book phase B: Subgroup Towers occurring in memberships are bound too (as subgroup parameters)
  const subOrder: string[] = [];
  for (const p of factPats(f)) if (p.k === 'mem' && p.sub.k === 'sub' && towerSubs.has(p.sub.id) && !subOrder.includes(p.sub.id)) subOrder.push(p.sub.id);
  // Book phase C: Hom Towers occurring (map heads) and the group Towers anything bound lives in
  const homOrder: string[] = [];
  for (const t of factTerms(f)) for (const m of mapsOf(t)) if (towerHoms.has(m) && !homOrder.includes(m)) homOrder.push(m);
  const grpOrder: string[] = [];
  const addG = (s0: string | undefined) => { if (s0 && towerGrps.has(s0) && !grpOrder.includes(s0)) grpOrder.push(s0); };
  for (const h of homOrder) { addG(towerHoms.get(h)!.dom); addG(towerHoms.get(h)!.cod); }
  for (const v of order) addG(carrierOf(v));
  for (const t of factTerms(f)) for (const e of eSortsOf(t)) addG(e);
  for (const sb of subOrder) addG((structs.find((x) => x.id === sb) as { sort?: string } | undefined)?.sort);
  if ((f.k === 'law' || f.k === 'cond') && f.metaSorts) for (const r of Object.values(f.metaSorts)) if (typeof r === 'string') addG(r);
  const label = (id: string) => vars.find((v) => v.id === id)?.label ?? structs.find((x) => x.id === id)?.label ?? L[id] ?? id;
  if (!order.length && !subOrder.length && !homOrder.length) throw new KErr(`No Tower appears in ${factText(f, L)}. There is nothing to generalize.`);
  // eigenvariable condition (statements of the room assumptions the fact rests on: elements, exponents, subgroups,
  // and — phase C — maps and the groups their elements live in)
  const boundStructs = new Set([...order, ...subOrder, ...homOrder, ...grpOrder]);
  for (const room of hyps) {
    const mentioned = new Set<string>();
    for (const a of assumptionsOf(room)) {
      for (const t of patTerms(a)) {
        for (const id of refsInOrder(t, [])) { mentioned.add(id); mentioned.add(carrierOf(id)); }
        for (const m of mapsOf(t)) { mentioned.add(m); const h = towerHoms.get(m); if (h) { mentioned.add(h.dom); mentioned.add(h.cod); } }
        for (const e of eSortsOf(t)) mentioned.add(e);
      }
      if (a.k === 'mem' && a.sub.k === 'sub') mentioned.add(a.sub.id);
    }
    const hit = [...boundStructs].find((id) => mentioned.has(id));
    if (hit) {
      const noun = room.kind === 'suppose' ? 'supposition' : 'assumption';
      throw new KErr(`${label(hit)} appears in the ${noun} ${factText(assumptionOf(room), L)}, so it isn't arbitrary. Exit the room first.`);
    }
  }
  // fresh, readable binder names: distinct from the card's own binders (both sorts) and level constants
  const used = new Set<string>(reserved);
  if (multi) used.add(DEFAULT_GROUP);
  if (f.k === 'law' || f.k === 'cond') { for (const m of f.metas) used.add(m); for (const m of cardMetas(f)) used.add(m); for (const b of f.binds ?? []) used.add(b.id); }
  const base = (id: string) => label(id).replace(/[₀-₉0-9′'_]+$/u, '');
  const pick = (ids: string[], poolOf: (id: string) => string[]) => {
    const bases = ids.map(base);
    const out = new Map<string, string>();
    for (const [i, id] of ids.entries()) {
      const b = bases[i]!;
      const pool = poolOf(id);
      let name: string | undefined;
      if (/^[A-Za-zα-ωΑ-Ω]$/.test(b) && bases.filter((x) => x === b).length === 1 && !used.has(b)) name = b;
      if (!name && !used.has(label(id)) && pool === GRP_POOL) name = label(id);
      name ??= pool.find((m) => !used.has(m));
      for (let k = 1; !name; k++) if (!used.has(`${pool[0]}${k}`)) name = `${pool[0]}${k}`;
      used.add(name);
      out.set(id, name);
    }
    return out;
  };
  const grename = pick(grpOrder, () => GRP_POOL);
  const hrename = pick(homOrder, () => HOM_POOL);
  const rename = pick(order, (id) => (sortOf_(id) === 'Z' ? Z_POOL : META_POOL));
  const srename = pick(subOrder, () => SUB_POOL);
  const sref = (s0: string): SortRef => (grename.has(s0) ? { k: 'sortmeta', id: grename.get(s0)! } : s0);
  const sub = (t: Term): Term => renameTerm(t, (m) => m,
    (r) => (r.k === 'zvar' && rename.has(r.id) ? { k: 'zmeta', id: rename.get(r.id)! } : r),
    (id) => (rename.has(id) && sortOf_(id) === 'G' ? { k: 'meta', id: rename.get(id)! } : null),
    (fn) => hrename.get(fn) ?? fn, (s0) => grename.get(s0) ?? s0);
  const ssub = (r: SubRef): SubRef => (r.k === 'sub' && srename.has(r.id) ? { k: 'submeta', id: srename.get(r.id)! } : r);
  const fresh = order.map((id) => rename.get(id)!);
  const newBinds: StructBinder[] = [
    ...grpOrder.map((id): StructBinder => ({ k: 'grp', id: grename.get(id)! })),
    ...homOrder.map((id): StructBinder => { const h = towerHoms.get(id)!; return { k: 'hom', id: hrename.get(id)!, dom: sref(h.dom), cod: sref(h.cod) }; }),
    ...subOrder.map((id): StructBinder => {
      const st = structs.find((x) => x.id === id) as { normal?: boolean; sort?: string } | undefined;
      return { k: 'sub', id: srename.get(id)!, normal: st?.normal === true, ...(st?.sort ? { sort: sref(st.sort) } : {}) };
    }),
  ];
  // Book phase C: in a many-sorted context every bound element meta records its sort
  let metaSorts: Record<MetaId, SortRef> | undefined;
  if (multi) {
    metaSorts = {};
    for (const id of order) if (sortOf_(id) === 'G') metaSorts[rename.get(id)!] = sref(carrierOf(id));
    if ((f.k === 'law' || f.k === 'cond') && f.metaSorts) for (const [m, r] of Object.entries(f.metaSorts)) metaSorts[m] = typeof r === 'string' ? sref(r) : r;
  }
  const pf = (p: PatFact): PatFact => mapPat(p, sub, ssub);
  const withBinds = <C extends Card>(c: C, old?: StructBinder[]): C => {
    const all = [...newBinds, ...(old ?? [])];
    const ms = metaSorts && Object.keys(metaSorts).length ? { metaSorts } : {};
    return { ...c, ...(all.length ? { binds: all } : {}), ...ms };
  };
  let out: Card;
  switch (f.k) {
    case 'eq': out = withBinds({ k: 'law', metas: fresh, l: sub(f.l), r: sub(f.r) }); break;
    case 'neq': case 'mem': out = withBinds({ k: 'cond', metas: fresh, premises: [], concl: pf(f) }); break;
    case 'law': out = withBinds({ k: 'law', metas: [...fresh, ...f.metas], l: sub(f.l), r: sub(f.r) }, f.binds); break;
    case 'cond': out = withBinds({ k: 'cond', metas: [...fresh, ...f.metas], premises: f.premises.map(pf), concl: pf(f.concl) }, f.binds); break;
  }
  cardZmetas(out); // a well-typed card: no binder used with both sorts
  return out;
}

const GRP_POOL = ['G', 'K', 'Q', 'L', 'M', 'R']; // never H: the subgroup letter (playtest W10–14 #3)
const HOM_POOL = ['f', 'g', 'h', 'φ', 'ψ', 'π'];
const SUB_POOL = ['H', 'K', 'N', 'M', 'L', 'J'];
const Z_POOL = ['n', 'k', 'm', 'j', 'i', 'l', 'r', 's'];

// ───────────── generalize ─────────────

/** The universal theorem a solved socket proves (atoms → metas, allowed eq/neq givens → premises). */
export function generalize(level: LevelManifest, socketId: string): Card | null {
  const sock = level.sockets.find((s) => s.id === socketId);
  if (sock && isOpen(sock)) return null; // an open dock states ∃: not a single card
  if (sock && (sock.target.k === 'law' || sock.target.k === 'cond')) {
    // a ∀ goal is already universal; it exports as itself when it rests on nothing and names no constant
    return sock.allowedGivens.length === 0 && factAtoms(sock.target, new Set()).size === 0 && factSubs(sock.target).size === 0 ? sock.target : null;
  }
  if (!sock || (sock.target.k !== 'eq' && sock.target.k !== 'neq' && sock.target.k !== 'mem')) return null;
  const premises: PatFact[] = [];
  for (const gid of sock.allowedGivens) {
    const gd = level.givens.find((g) => g.id === gid);
    if (!gd) return null;
    if (gd.fact.k !== 'eq' && gd.fact.k !== 'neq' && gd.fact.k !== 'mem') return null;
    premises.push(mapPat(gd.fact, norm));
  }
  const toMeta = (t: Term): Term => renameTerm(t, (m) => m, (r) => r, (id) => ({ k: 'meta', id }));
  const used = new Set<string>();
  const usedSubs: string[] = [];
  // Book phase B: level subgroups become subgroup parameters (normal ones stay normal)
  const pf = (p: PatFact): PatFact => {
    for (const t of patTerms(p)) atomsOf(t, used);
    if (p.k === 'mem' && p.sub.k === 'sub' && !usedSubs.includes(p.sub.id)) usedSubs.push(p.sub.id);
    return mapPat(p, toMeta, (r) => (r.k === 'sub' ? { k: 'submeta', id: r.id } : r));
  };
  const prem = premises.map(pf);
  const concl = pf(mapPat(sock.target, norm));
  const metas = level.atoms.map((a) => a.id).filter((id) => used.has(id));
  const binds: StructBinder[] = usedSubs.map((id) => ({ k: 'sub', id, normal: subDecl(level, id)?.normal === true }));
  const b = binds.length ? { binds } : {};
  if (!prem.length && concl.k === 'eq') return { k: 'law', metas, l: concl.l, r: concl.r, ...b };
  return { k: 'cond', metas, premises: prem, concl, ...b };
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
  const gOrder = (c: Card) => { const o: MetaId[] = []; for (const p of facts(c)) for (const t of patTerms(p)) for (const id of gmetasOf(t)) if (!o.includes(id)) o.push(id); return o; };
  const ga = gOrder(a), gb = gOrder(b);
  if (ga.length !== gb.length) return false;
  // Book phase B: subgroup binders canonicalized by first occurrence; their normal flags must agree
  const sa = submetasOf(a), sb = submetasOf(b);
  if (sa.length !== sb.length) return false;
  if ((a.binds ?? []).length !== (b.binds ?? []).length) return false;
  const canon = (c: Card, gnames: MetaId[], zmap: (id: MetaId) => MetaId): string => {
    const gm = new Map(gnames.map((id, i) => [id, `#g${i}`] as const));
    const sm = submetasOf(c);
    // Book phase C: hom / action binders by first occurrence as a map head; group / set binders by first occurrence
    // in those binders' signatures, then in the meta sorts, then as identity tags
    const binds = c.binds ?? [];
    const isMapB = (id: string) => binds.some((x) => (x.k === 'hom' || x.k === 'act') && x.id === id);
    const isSortB = (id: string) => binds.some((x) => (x.k === 'grp' || x.k === 'set') && x.id === id);
    const hOrder: string[] = [];
    for (const p of facts(c)) for (const t of patTerms(p)) for (const m of mapsOf(t)) if (isMapB(m) && !hOrder.includes(m)) hOrder.push(m);
    for (const x of binds) if ((x.k === 'hom' || x.k === 'act') && !hOrder.includes(x.id)) hOrder.push(x.id);
    const sOrder: string[] = [];
    const addS = (r: SortRef | undefined) => { const id = r === undefined ? undefined : typeof r === 'string' ? r : r.id; if (id && isSortB(id) && !sOrder.includes(id)) sOrder.push(id); };
    for (const h of hOrder) { const x = binds.find((y) => y.id === h)!; if (x.k === 'hom') { addS(x.dom); addS(x.cod); } else if (x.k === 'act') { addS(x.grp); addS(x.on); } }
    for (const m of gnames) addS(c.metaSorts?.[m]);
    for (const p of facts(c)) for (const t of patTerms(p)) for (const e of eSortsOf(t)) addS(e);
    for (const x of binds) if (x.k === 'sub') addS(x.sort);
    for (const x of binds) if (x.k === 'grp' || x.k === 'set') addS(x.id);
    const hm = (id: string) => (hOrder.includes(id) ? `#h${hOrder.indexOf(id)}` : id);
    const smap = (id: string) => (sOrder.includes(id) ? `#S${sOrder.indexOf(id)}` : id);
    const srs = (r: SortRef | undefined) => (r === undefined ? '-' : smap(typeof r === 'string' ? r : r.id));
    const ser = (t: Term): string => {
      const r = renameTerm(t, (id) => gm.get(id) ?? `?${id}`, (z) => (z.k === 'zmeta' ? { k: 'zmeta', id: zmap(z.id) } : z), undefined, hm, smap);
      return termKey(r);
    };
    const sser = (r: SubRef) => (r.k === 'submeta' ? `#s${sm.indexOf(r.id)}${(binds.find((x) => x.id === r.id) as { normal?: boolean } | undefined)?.normal ? 'n' : ''}` : `sub:${r.id}`);
    const sigs = hOrder.map((h) => { const x = binds.find((y) => y.id === h); return x?.k === 'hom' ? `hom(${srs(x.dom)},${srs(x.cod)})` : x?.k === 'act' ? `act(${srs(x.grp)},${srs(x.on)})` : '?'; }).join(',');
    const kinds = sOrder.map((id) => binds.find((y) => y.id === id)?.k ?? '?').join(',');
    const ms = c.metaSorts ? gnames.map((m) => srs(c.metaSorts![m])).join(',') : '';
    return facts(c).map((p) => (p.k === 'mem' ? `mem(${ser(p.t)},${sser(p.sub)})` : `${p.k}(${ser(p.l)},${ser(p.r)})`)).join(';') + `|${c.k}|${sigs}|${kinds}|${ms}`;
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

/**
 * Book phase A: card equality up to binder renaming AND premise order (premises are a conjunction).
 * Used by sockets with ∀ targets and by Lemma Book identity checks. Exact for more than 6 premises.
 */
export function sameCardUpToPermutation(a: Card, b: Card): boolean {
  if (sameCardUpToRenaming(a, b)) return true;
  if (a.k !== 'cond' || b.k !== 'cond' || a.premises.length !== b.premises.length || a.premises.length < 2 || a.premises.length > 6) return false;
  const go = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => go([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  for (const p of go(b.premises.map((_, i) => i))) {
    if (p.every((x, i) => x === i)) continue;
    if (sameCardUpToRenaming(a, { ...b, premises: p.map((i) => b.premises[i]!) })) return true;
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
  const L = levelLabels(vx.ctx.level);
  if (!fact || (fact.k !== 'law' && fact.k !== 'cond')) return { ok: false, reason: 'Only a ∀ statement can go in the Lemma Book.' };
  // Book phase A: a card with an unbound meta (an open dock's hole) is not a statement; it is never saved
  const bound = new Set(fact.metas);
  if (cardMetas(fact).some((m) => !bound.has(m))) return { ok: false, reason: 'This statement has an unfilled hole. Only a proved statement can go in the Lemma Book.' };
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
  // Book phase B, lemma closure (SYNTHESIS §4.1 pin 1): every subgroup it mentions must be a parameter
  const SL = levelLabels(vx.ctx.level);
  const towers = new Set(vx.structs.map((x) => x.id));
  for (const id of factSubs(fact)) {
    if (towers.has(id)) return { ok: false, reason: `${SL[id] ?? id} is still free. Generalize it first.` };
    return { ok: false, reason: `${SL[id] ?? id} is a subgroup of this order. Rebuild it with a Subgroup Tower.` };
  }
  const binds = new Set((fact.binds ?? []).map((b) => b.id));
  for (const m of submetasOf(fact)) if (!binds.has(m)) return { ok: false, reason: 'This statement names a subgroup it does not bind.' };
  const why = mapClosureProblem(fact, vx.ctx, vx.structs);
  return why ? { ok: false, reason: why } : { ok: true };
}

/**
 * Book phase C, lemma closure (SYNTHESIS §4.1 pin 1): a saveable card mentions no level map, no level sort (in a
 * many-sorted level, not even the default group G) and no free Hom / group Tower. Null = closed.
 */
export function mapClosureProblem(card: Card, ctx: KernelCtx, structs: StructDecl[]): string | null {
  const env = sortEnv(ctx.level);
  const binds = new Set((card.binds ?? []).map((b) => b.id));
  const towers = new Map(structs.map((x) => [x.id, x.label] as const));
  const terms = factTerms(card);
  const lab = (id: string) => towers.get(id) ?? env.maps.get(id)?.label ?? env.label(id);
  for (const t of terms) for (const m of mapsOf(t)) if (!binds.has(m)) {
    return towers.has(m) ? `${lab(m)} is still free. Generalize it first.` : `Mentions the map ${lab(m)} of this order. Rebuild it with a Hom Tower.`;
  }
  if (!env.multi) return null;
  const sortsUsed = new Set<string>();
  for (const t of terms) for (const e of eSortsOf(t)) sortsUsed.add(e);
  for (const r of Object.values(card.metaSorts ?? {})) sortsUsed.add(typeof r === 'string' ? r : r.id);
  for (const b of card.binds ?? []) {
    if (b.k === 'hom') for (const r of [b.dom, b.cod]) sortsUsed.add(typeof r === 'string' ? r : r.id);
    if (b.k === 'act') for (const r of [b.grp, b.on]) sortsUsed.add(typeof r === 'string' ? r : r.id);
    if (b.k === 'sub' && b.sort) sortsUsed.add(typeof b.sort === 'string' ? b.sort : b.sort.id);
  }
  for (const s0 of sortsUsed) if (!binds.has(s0)) {
    return towers.has(s0) ? `${lab(s0)} is still free. Generalize it first.` : `Mentions the group ${lab(s0)} of this order. Rebuild it on a group Tower.`;
  }
  return null;
}
