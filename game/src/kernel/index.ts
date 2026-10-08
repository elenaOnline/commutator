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
/** TeX, e.g. "(ab)^{-1} = b^{-1}a^{-1}". */
export function termTex(t: Term, L: Labels): string { return P.termTex(t, L); }
export function factTex(f: Fact, L: Labels): string { return P.factTex(f, L); }

/**
 * Parse player term entry against the level's atoms. Grammar:
 *   term := factor+ ; factor := base ('^' ('-1' | INT))* ; base := label | 'e' | '(' term ')'
 * Also accepts '⁻¹', "'" for a prime in labels (e' ↔ e′), whitespace, '·', '*'.
 * Positive INT n = n copies. Undeclared names are errors.
 */
export function parseTerm(src: string, atoms: AtomDecl[]):
  { ok: true; term: Term } | { ok: false; error: string } { return P.parseTerm(src, atoms); }

// ───────────── Rules ─────────────

/** The axiom laws: unitL ∀x. e x = x ; unitR ∀x. x e = x ; invL ∀x. x⁻¹x = e ; invR ∀x. x x⁻¹ = e. */
export function axiomCard(id: AxiomId): Card & { k: 'law' } { return Lg.axiomCard(id); }
/** Lagrange corollary card for |G| = n: ∀x. xⁿ = e. */
export function pressCard(n: number): Card & { k: 'law' } { return Lg.pressCard(n); }

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

/** Extra (test helper): card equality up to a bijective renaming of metas. */
export function sameCardUpToRenaming(a: Card, b: Card): boolean { return Lg.sameCardUpToRenaming(a, b); }

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
