import type { AtomDecl, Fact, LevelManifest, Term } from '../kernel/types';
import { catalogue, holds, type Assignment } from './index';
import { everySortedAssignment, labeledAssignment } from './semantics';

/** G atoms into `acc`, ℤ Towers (zvar refs in exponents) into `zacc`. */
function termAtomIds(t: Term, acc: Set<string>, zacc: Set<string>): void {
  if (t.k === 'atom') acc.add(t.id);
  else if (t.k === 'inv') termAtomIds(t.arg, acc, zacc);
  else if (t.k === 'mul') t.fs.forEach(f => termAtomIds(f, acc, zacc));
  else if (t.k === 'pow') { termAtomIds(t.base, acc, zacc); for (const e of t.exp) for (const m of e.monomial) if (m.ref.k === 'zvar') zacc.add(m.ref.id); }
}
function factAtomIds(f: Fact, acc: Set<string>, zacc: Set<string>): void {
  if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { termAtomIds(f.l, acc, zacc); termAtomIds(f.r, acc, zacc); }
  else if (f.k === 'cond') for (const p of [...f.premises, f.concl]) { termAtomIds(p.l, acc, zacc); termAtomIds(p.r, acc, zacc); }
}

/** A room's hypothesis as a fact (suppose: l = r; classical: l ≠ r; v4 assume: per rel, default =). */
function roomFact(room: OracleRoom): Fact {
  const k = room.kind === 'suppose' ? 'eq' : room.kind === 'classical' ? 'neq' : room.rel === 'neq' ? 'neq' : 'eq';
  return { k, l: room.l, r: room.r };
}
export interface OracleRoom { id: string; kind: 'suppose' | 'classical' | 'assume'; l: Term; r: Term; rel?: 'eq' | 'neq' }

/**
 * Exhaustive finite-model check; reports the first witness per node.
 * v4: graph variables (Towers) are universally quantified exactly like level atoms — every node's fact
 * must hold under every assignment of atoms AND variables satisfying its dependencies. Cards produced
 * by generalize/assume exits are checked as laws/conds by `holds`.
 */
export function oracleCheck(level: LevelManifest, factsByNode: Record<string, {fact?: Fact; deps: string[]; ok: boolean}>, rooms: OracleRoom[], vars: AtomDecl[] = []): string[] {
  const ids = [...level.atoms.map(a => a.id), ...vars.map(v => v.id).filter(id => !level.atoms.some(a => a.id === id))];
  const violations: string[] = [];
  const dependencies = new Map<string, Fact>();
  for (const given of level.givens) dependencies.set(`g:${given.id}`, given.fact);
  for (const room of rooms) dependencies.set(`a:${room.id}`, roomFact(room));
  for (const [id, node] of Object.entries(factsByNode)) {
    const fact = node.fact;
    if (!node.ok || !fact || fact.k === 'size') continue;
    const missing = node.deps.filter(dep => !dependencies.has(dep));
    if (missing.length) { violations.push(`Node ${id}: unresolved dependencies ${missing.join(', ')}`); continue; }
    const premises = node.deps.map(dep => dependencies.get(dep)!);
    // Only atoms/variables that occur in the fact or its hypotheses affect truth; enumerate just those.
    const occurring = new Set<string>(), zOccurring = new Set<string>();
    for (const f of [fact, ...premises]) factAtomIds(f, occurring, zOccurring);
    // Atoms not declared by the level (graph variables) are universally quantified too.
    const used = [...ids.filter(id => occurring.has(id)), ...[...occurring].filter(id => !ids.includes(id))];
    for (const G of catalogue()) {
      if (premises.some(f => f.k === 'size' && f.n !== G.order)) continue;
      const s: Assignment = Object.create(null);
      // ℤ Towers range over Z_RANGE (−6..6), which covers every residue class for orders ≤ 13
      const sound = everySortedAssignment(used, [...zOccurring], G.order, s, () => {
        if (!premises.every(p => holds(G, p, s)) || holds(G, fact, s)) return true;
        violations.push(`Node ${id}: ${fact.k} fails in ${G.name} with ${JSON.stringify(labeledAssignment(s, G))} (dependencies: ${node.deps.join(', ') || 'none'})`);
        return false;
      });
      if (!sound) break;
    }
  }
  return violations;
}
