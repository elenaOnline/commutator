// LEMMA WORKS — concrete finite groups, evaluation, and the conjecture lab. Owner: groups builder (Sol).
import type { AtomDecl, Fact, LevelManifest, Pallet, Term } from '../kernel/types';
import { GROUPS } from './tables';
import { evaluate, everyAssignment, factHolds, labeledAssignment } from './semantics';

export interface FiniteGroup {
  name: string;          // 'S₃', 'ℤ₆', 'Q₈', 'D₄', 'V₄' ...
  order: number;
  labels: string[];      // element display labels, index 0 = identity
  mul: (i: number, j: number) => number;
  inv: (i: number) => number;
}
export type Assignment = Record<string, number>; // AtomId → element index

/** The test-bench catalogue: all fourteen groups of order ≤ 8 up to isomorphism. */
export function catalogue(): FiniteGroup[] { return [...GROUPS]; }
/** Evaluate a ground term. Throws on metas. */
export function evalTerm(G: FiniteGroup, t: Term, s: Assignment): number { return evaluate(G, t, s); }
/** Truth of a fact under an assignment (laws/conds quantify over all of G; size(n) ⇔ |G| = n; bot is false). */
export function holds(G: FiniteGroup, f: Fact, s: Assignment): boolean { return factHolds(G, f, s); }

export type ConjectureVerdict =
  | { k: 'counterexample'; group: string; assignment: Record<string, string>; lhs: string; rhs: string }
  | { k: 'survives'; groups: number; assignments: number }
  | { k: 'vacuous'; groups: number }; // no group/assignment satisfies the givens

/**
 * Test a claim against every catalogue group and every assignment of the level's atoms
 * that satisfies `assumptions` (the level's givens, plus room assumptions when inside a room).
 * Counts size-eligible groups and assignments satisfying every assumption.
 * Never proves anything; only refutes or reports survival.
 */
export function testClaim(claim: Pallet, atoms: AtomDecl[], assumptions: Fact[], level?: LevelManifest): ConjectureVerdict {
  // `assumptions` is authoritative; level supplies context only, not extra givens.
  void level;
  const eligible = catalogue().filter(G => assumptions.every(f => f.k !== 'size' || f.n === G.order));
  let assignments = 0;
  for (const G of eligible) {
    const s: Assignment = Object.create(null);
    let counterexample: ConjectureVerdict | undefined;
    everyAssignment(atoms.map(a => a.id), G.order, s, () => {
      if (!assumptions.every(f => holds(G, f, s))) return true;
      assignments++;
      if (holds(G, claim, s)) return true;
      counterexample = {
        k: 'counterexample', group: G.name, assignment: labeledAssignment(s, G),
        lhs: claim.k === 'eq' || claim.k === 'neq' ? G.labels[evalTerm(G, claim.l, s)]! : claim.k === 'size' ? String(G.order) : '⊥',
        rhs: claim.k === 'eq' || claim.k === 'neq' ? G.labels[evalTerm(G, claim.r, s)]! : claim.k === 'size' ? String(claim.n) : 'false',
      };
      return false;
    });
    if (counterexample) return counterexample;
  }
  return assignments ? { k: 'survives', groups: eligible.length, assignments } : { k: 'vacuous', groups: eligible.length };
}
