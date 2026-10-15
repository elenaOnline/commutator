// LEMMA WORKS — kernel public API (signatures are the contract; bodies are the
// kernel builder's). Pure functions only. See KERNEL.md.
//
// Implementation map: terms.ts (terms, matching, addresses) · print.ts (text,
// TeX, parsing) · logic.ts (rules, steps, apply, check, generalize) ·
// offers.ts (bench offers) · describe.ts (families, justifications, metrics).
import type {
  AtomDecl, Addr, AxiomId, Card, CheckResult, Fact, GapAddr, LevelManifest,
  Family, MetaId, Offer, Pallet, PatFact, ProofGraph, ProofNode, NodeId, Schema, StepOp, Subst, Term,
} from './types';
import * as T from './terms';
import * as P from './print';
import * as Lg from './logic';
import * as D from './describe';
import * as O from './offers';
import * as Op from './open';

export * from './types';

// ───────────── Context ─────────────

export interface KernelCtx {
  level: LevelManifest;
  /** All schemas known to the game (earned + imported). Availability is level.tools.schemas. */
  registry: Record<string, Schema>;
}

// ───────────── Terms ─────────────

/** Constructors (always return normalized terms). mul([]) throws; mul([t]) = t. */
export const atom = (id: string): Term => ({ k: 'atom', id });
export const E: Term = { k: 'e' };
export const meta = (id: MetaId): Term => ({ k: 'meta', id });
export function inv(t: Term): Term { return { k: 'inv', arg: norm(t) }; }
export function mul(fs: Term[]): Term { return T.mul(fs); }
/** a^n as n copies of t, normalized (n >= 1). */
export function pow(t: Term, n: number): Term { return T.pow(t, n); }

/** Flatten nested products, collapse singletons; recurse into inv. Never removes e or inverses. */
export function norm(t: Term): Term { return T.norm(t); }
/** Structural equality after norm. */
export function termEq(a: Term, b: Term): boolean { return T.termEq(a, b); }
/** The word of a term: fs for a mul, [t] otherwise. */
export function word(t: Term): Term[] { return t.k === 'mul' ? t.fs : [t]; }
export function isGround(t: Term): boolean { return T.isGround(t); }
export function metasOf(t: Term): MetaId[] { return T.metasOf(t); }
/** Substitute and normalize. Throws if a meta is unbound. */
export function instantiate(t: Term, s: Subst): Term { return T.instantiate(t, s); }
/** Gᵒᵖ image: reverse every product's factor order (recursively, including inside inv). */
export function mirrorTerm(t: Term): Term { return T.mirrorTerm(t); }
export function mirrorCard(c: Card): Card { return T.mirrorCard(c); }

/** The term focused by addr in an eq/neq pallet, or null if the address is invalid. */
export function termAt(p: Pallet, a: Addr): Term | null { return T.termAt(p, a); }

/**
 * All substitutions σ (extending `partial`) with norm(instantiate(pattern, σ)) == target.
 * Metas bind non-empty runs (never empty); repeated metas bind the same term;
 * inv(pattern) matches only an inv(target) and matches the WHOLE argument.
 */
export function match(pattern: Term, target: Term, partial?: Subst): Subst[] {
  return T.match(pattern, target, partial);
}

// ───────────── Printing & parsing ─────────────

export type Labels = Record<string, string>; // AtomId → display label
export function labelsOf(atoms: AtomDecl[]): Labels {
  return Object.fromEntries(atoms.map((a) => [a.id, a.label]));
}
/** Unicode text, e.g. "(ab)⁻¹ = b⁻¹a⁻¹". Powers of a single atom run ≥ 3 may compress to a³. */
export function termText(t: Term, L: Labels): string { return P.termText(t, L); }
export function factText(f: Fact, L: Labels): string { return P.factText(f, L); }
/** v4 Phase B: an exponent polynomial as text ("5k₁", "n₁k₁", "-3") or TeX ("5k_{1}"). */
export function exponentText(p: import('./types').Poly, L: Labels, tex = false): string { return P.exponentText(p, L, tex); }
/** TeX, e.g. "(ab)^{-1} = b^{-1}a^{-1}". */
export function termTex(t: Term, L: Labels): string { return P.termTex(t, L); }
export function factTex(f: Fact, L: Labels): string { return P.factTex(f, L); }

/**
 * Parse player term entry against the level's atoms. Grammar:
 *   term := factor+ ; factor := base ('^' ('-1' | INT))* ; base := label | 'e' | '(' term ')'
 * Also accepts '⁻¹', "'" for a prime in labels (e' ↔ e′), whitespace, '·', '*'.
 * Positive INT n = n copies. Undeclared names are errors.
 */
export function parseTerm(src: string, atoms: AtomDecl[], extra?: P.ParseExtra):
  { ok: true; term: Term } | { ok: false; error: string } { return P.parseTerm(src, atoms, extra); }

// ───────────── Rules ─────────────

/** The axiom laws: unitL ∀x. e x = x ; unitR ∀x. x e = x ; invL ∀x. x⁻¹x = e ; invR ∀x. x x⁻¹ = e. */
export function axiomCard(id: AxiomId): Card & { k: 'law' } { return Lg.axiomCard(id); }
/** Lagrange corollary card for |G| = n: ∀x. xⁿ = e. */
export function pressCard(n: number, power = false, sort?: string): Card & { k: 'law' } { return Lg.pressCard(n, power, sort); }

// ───────────── Single-op evaluation ─────────────

/** Evaluate one step op on an eq (or neq for swap) pallet. ruleFact = resolved fact of op.rule when it is a node. */
export function evalStep(p: Pallet, op: StepOp, ctx: KernelCtx, ruleFact?: Fact):
  { ok: true; pallet: Pallet } | { ok: false; error: string } {
  try {
    return { ok: true, pallet: Lg.stepCore(p, op, ctx, ruleFact) };
  } catch (e) {
    return { ok: false, error: e instanceof T.KErr ? e.message : `malformed step (${(e as Error)?.message ?? 'unknown'})` };
  }
}

// ───────────── Whole-graph checking ─────────────

/** Re-check the whole graph from scratch (acyclicity, every node, scope, deps, sockets). */
export function check(g: ProofGraph, ctx: KernelCtx): CheckResult { return Lg.check(g, ctx); }

/** The universal theorem a solved socket proves (params → metas, allowed givens → premises), for tests. */
export function generalize(level: LevelManifest, socketId: string): Card | null { return Lg.generalize(level, socketId); }

/** v4: the context extended with a graph's declared variables (Towers), plus any declaration error. */
export function withVars(ctx: KernelCtx, g: ProofGraph | null | undefined): { ctx: KernelCtx; vars: AtomDecl[]; structs: import('./types').StructDecl[]; error?: string } { return Lg.withVars(ctx, g); }
/** v4: ∀-introduction on a fact (what a 'generalize' node computes). Throws a maths-language Error on
 *  failure (nothing to bind, or the eigenvariable condition: a bound variable appears in a hypothesis). */
export function generalizeFact(f: Fact, vars: AtomDecl[], hyps: import('./types').Room[] = [], reserved?: Set<string>, L?: Labels, structs?: import('./types').StructDecl[]): Card {
  return Lg.generalizeFact(f, vars, hyps, reserved, L, structs);
}

/** v4 Phase B: may this checked fact be saved to the Lemma Book? (statement-level gate; see logic.ts) */
export function lemmaEligibility(fact: Fact | undefined, deps: string[], g: ProofGraph, ctx: KernelCtx) { return Lg.lemmaEligibility(fact, deps, g, ctx); }
/** v4 Phase B exports: exact exponent polynomials, imported power laws, parsing of integer knobs. */
export { polyNorm, polyAdd, polySub, polyMul, polyNeg, polyPowNat, polyConst, polyZvar, polyZmeta, polyEq, polyEval, POLY_LIMITS } from './poly';
export { POWER_SCHEMAS, powerSchema, powerLiteralSchema, POWER_LITERAL_FAMILY } from './powers';
export { parseInteger } from './print';
export { power, intVal, repeatWord, matchOpen } from './terms';

/** v4 Phase B: the ℤ-sorted metas of a card (those used inside exponents). Throws if a meta has both sorts. */
export function cardZmetas(c: Card): Set<MetaId> { return Lg.cardZmetas(c); }

/** Extra (test helper): card equality up to a bijective renaming of metas. */
export function sameCardUpToRenaming(a: Card, b: Card): boolean { return Lg.sameCardUpToRenaming(a, b); }

// ───────────── Book phase A (design/pinter/KERNEL-EXT.md) ─────────────

/** Card equality up to binder renaming AND premise order (a conjunction). Sockets and Lemma Book identity use this. */
export function sameCardUpToPermutation(a: Card, b: Card): boolean { return Lg.sameCardUpToPermutation(a, b); }
/** Multi-desk Assume rooms: every assumption of a room in desk (slot) order; the dep token of a desk and its inverse. */
export { assumptionsOf, assumptionFact, roomDep, depRoom, MAX_DESKS } from './logic';
/**
 * Open docks. isOpen(sock): has holes. fillOpen(sock, fact, opts): the hole values and closed instance a fact
 * would deliver (null = it does not fill). openDisplay(sock): the target with holes as `?` placeholders plus
 * their labels. dockText(sock, L, answer?, tex?): `d = ?`, or the filled instance once SocketResult.holes is known.
 * plugHoles(target, holes): target[holes := values]. holesProblem(sock): why a hole declaration is malformed.
 */
export { isOpen, fillOpen, openDisplay, dockText, plugHoles, holesProblem } from './open';
/** Authoring check (SYNTHESIS §4.1 pin 5): the trivial statement a bare Spool of one side would deliver, if it fills the dock. */
export function trivialFill(sock: import('./types').SocketDecl): Pallet | Card | null { return Op.trivialFill(sock, Lg.sameCardUpToPermutation); }
export type { OpenFill, FillOpts } from './open';

// ───────────── Book phase B: Members (design/pinter/KERNEL-EXT.md §4) ─────────────

/** Walk statements: patTerms(p) (eq/neq → [l, r], mem → [t]), mapPat(p, f, subMap?), factPats(fact), factTerms(fact),
 *  factSubs(fact) (rigid subgroup ids), submetasOf(card) (subgroup binders in first-occurrence order). */
export { patTerms, mapPat, factPats, factTerms, factSubs, submetasOf, sameSub, subsIn, subDecl, instStructs } from './members';
/** Kernel-owned subgroup schemas: sub.mul, sub.inv, sub.conj (axioms of the kind), sub.e (earned in P5.1, unconditional),
 *  sub.pow (imported). subAllowed(id, level) says whether a level may use one. Merge SUB_SCHEMAS into a registry for names. */
export { SUB_SCHEMAS, SUB_AXIOMS, subSchema, subAllowed } from './members';
// ───────────── Book phase C: Maps (design/pinter/KERNEL-EXT.md §5) ─────────────

/** Sorts: sortEnv(level) (sorts, maps, atom carriers; multi = many-sorted), sortOf(term, env), DEFAULT_GROUP ('G'),
 *  mapsOf / eSortsOf (map heads, identity tags), isOneGroup(card) (sort-polymorphic), retagE(term, S). */
export { sortEnv, sortOf, checkEqSorts, mapsOf, eSortsOf, isOneGroup, retagE, isGroupSort, mapKind, DEFAULT_GROUP } from './sorts';
export type { SortEnv } from './sorts';
/** The map kinds' laws: hom.mul (f(xy) = f(x)f(y)), hom.pow (imported), act.mul, act.e — schematic over the hom /
 *  action; use with structs { f: <hom id> } / { σ: <action id> }. mapAllowed(id, level). */
export { MAP_SCHEMAS, mapSchema, mapAllowed } from './maps';
/** Lemma closure for maps and sorts (pin 1): null = closed, else the reason it can't be saved. */
export { mapClosureProblem, checkFactSorts, mirrorSafe } from './logic';
/** A registry / kernel schema's card as this level may use it (mirror included); throws a maths-language error. */
export function schemaCardOf(id: string, mirror: boolean | undefined, ctx: KernelCtx): Card { return Lg.schemaCard(id, mirror, ctx); }
export type { ParseExtra } from './print';
/** Labels key that marks a map as an action (levelLabels sets it): actions print as g(p), not σ(g, p). */
export { actionMark } from './print';

/** Display labels of a level including its subgroups (and, after withVars, Subgroup Towers). */
export { levelLabels, instPat, samePat } from './logic';

// ───────────── Bench offers ─────────────

/**
 * Every legal move for the active node given a selection:
 *  - Addr: rewrites whose source side matches the selected span (both directions, every rule in scope),
 *          with auto-tidy appended when the result is a lone e beside another factor;
 *  - GapAddr: insertE, and insertE + reversed rule for every rule with an e side (pairs, laws, givens);
 *  - null: whole-pallet moves — lift (needs term), swap, apply (cond cards whose premise matches;
 *          one offer per distinct σ, e.g. each Witness Stamp cut), clash (neq in scope), merge.
 * Offers never include anything the kernel would reject.
 */
export function offersAt(g: ProofGraph, res: CheckResult, nodeId: NodeId,
  sel: Addr | GapAddr | null, ctx: KernelCtx): Offer[] {
  return O.offersAt(g, res, nodeId, sel, ctx);
}

/** Supply needed metas (offer.needs) and get a ready offer (needs = [], preview set) or an error. */
export function fillOffer(o: Offer, values: Subst, g: ProofGraph, res: CheckResult, nodeId: NodeId, ctx: KernelCtx):
  { ok: true; offer: Offer } | { ok: false; error: string } {
  return O.fillOffer(o, values, g, res, nodeId, ctx);
}

// ───────────── Metrics ─────────────

export interface Metrics {
  /** Stations + machines reachable from filled sockets (distinct meta.station groups; non-step nodes count 1; sources/givens/exits count 0). */
  parts: number;
  /** Primitive kernel ops reachable from filled sockets; earned schema applications count their level's par.axioms. */
  axioms: number;
  /** Longest word (beads, recursively counting inside crates) on any reachable pallet rail. */
  peak: number;
}
export function metrics(g: ProofGraph, res: CheckResult, ctx: KernelCtx): Metrics { return D.metrics(g, res, ctx); }

// ───────────── Families (shared colouring) ─────────────

/**
 * The rule family a node is drawn in (board wire ink, transcript margin, bench offer chip):
 * start→equation · given→given · assume/exit→scope · clash/bot→contradiction · press→lemma ·
 * apply→lemma (cond givens → given) · merge/swap→equation · lift→structure ·
 * insertE→identity (an insertE station that also expands a pair → inverse) ·
 * rewrite: unit→identity, inv→inverse, node rule→given, schema→lemma.
 * A station takes the family of its first node.
 */
export function familyOf(n: ProofNode, g: ProofGraph): Family { return D.familyOf(n, g); }

/** Short justification for a node in mathematical language, e.g. 'inverse', 'unit', 'h', 'H at x = ba',
 *  'multiply on the left by a⁻¹', 'symmetry', 'Witness Stamp (uniqueness of inverses)', 'Lagrange (imported)'. */
export function justify(n: ProofNode, g: ProofGraph, ctx: KernelCtx): string { return D.justify(n, g, ctx); }

// Re-export helper types for consumers.
export type { PatFact, GapAddr, Addr };
