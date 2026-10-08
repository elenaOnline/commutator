import type { Fact, PatFact, Term } from '../kernel/types';
import type { Assignment, FiniteGroup } from './index';

/** False short-circuits enumeration. An empty list has one assignment. */
export function everyAssignment(ids: string[], order: number, s: Assignment, visit: () => boolean): boolean {
  const walk = (at: number): boolean => {
    if (at === ids.length) return visit();
    const id = ids[at]!;
    for (let i = 0; i < order; i++) {
      s[id] = i;
      if (!walk(at + 1)) return false;
    }
    return true;
  };
  return walk(0);
}

export function evaluate(G: FiniteGroup, t: Term, atoms: Assignment, metas?: Assignment): number {
  switch (t.k) {
    case 'e': return 0;
    case 'atom': {
      const value = Object.hasOwn(atoms, t.id) ? atoms[t.id] : undefined;
      if (value === undefined || !Number.isInteger(value) || value < 0 || value >= G.order) throw new Error(`Missing or invalid atom assignment: ${t.id}`);
      return value;
    }
    case 'meta': {
      const value = metas && Object.hasOwn(metas, t.id) ? metas[t.id] : undefined;
      if (value === undefined) throw new Error(`Cannot evaluate unassigned meta: ${t.id}`);
      return value;
    }
    case 'inv': return G.inv(evaluate(G, t.arg, atoms, metas));
    case 'mul': {
      let value = 0;
      for (const f of t.fs) value = G.mul(value, evaluate(G, f, atoms, metas));
      return value;
    }
  }
}
function patternHolds(G: FiniteGroup, f: PatFact, s: Assignment, metas?: Assignment): boolean {
  const equal = evaluate(G, f.l, s, metas) === evaluate(G, f.r, s, metas);
  return f.k === 'eq' ? equal : !equal;
}
export function factHolds(G: FiniteGroup, f: Fact, s: Assignment): boolean {
  switch (f.k) {
    case 'eq': case 'neq': return patternHolds(G, f, s);
    case 'bot': return false;
    case 'size': return G.order === f.n;
    case 'law': {
      const metas: Assignment = Object.create(null);
      return everyAssignment(f.metas, G.order, metas, () => evaluate(G, f.l, s, metas) === evaluate(G, f.r, s, metas));
    }
    case 'cond': {
      const metas: Assignment = Object.create(null);
      return everyAssignment(f.metas, G.order, metas, () =>
        !f.premises.every(p => patternHolds(G, p, s, metas)) || patternHolds(G, f.concl, s, metas));
    }
  }
}
export function labeledAssignment(s: Assignment, G: FiniteGroup): Record<string, string> {
  return Object.fromEntries(Object.entries(s).map(([id, value]) => [id, G.labels[value]!]));
}
