import type { AtomDecl, DeskAssumption, Fact, LevelManifest, StructDecl, Term } from '../kernel/types';
import { catalogue, holds, type Assignment } from './index';
import { everySortedAssignment, labeledAssignment, subKeyOf, subModels } from './semantics';
import { nontrivialModelsM, oracleCheckM } from './models';
export { modelLog, homsBetween, actionsOn } from './models';

/** G atoms into `acc`, ℤ Towers (zvar refs in exponents) into `zacc`. */
function termAtomIds(t: Term, acc: Set<string>, zacc: Set<string>): void {
  if (t.k === 'atom') acc.add(t.id);
  else if (t.k === 'inv') termAtomIds(t.arg, acc, zacc);
  else if (t.k === 'mul') t.fs.forEach(f => termAtomIds(f, acc, zacc));
  else if (t.k === 'pow') { termAtomIds(t.base, acc, zacc); for (const e of t.exp) for (const m of e.monomial) if (m.ref.k === 'zvar') zacc.add(m.ref.id); }
}
function factAtomIds(f: Fact, acc: Set<string>, zacc: Set<string>, sacc?: Set<string>): void {
  if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { termAtomIds(f.l, acc, zacc); termAtomIds(f.r, acc, zacc); }
  else if (f.k === 'mem') { termAtomIds(f.t, acc, zacc); if (f.sub.k === 'sub') sacc?.add(f.sub.id); }
  else if (f.k === 'cond') for (const p of [...f.premises, f.concl]) {
    if (p.k === 'mem') { termAtomIds(p.t, acc, zacc); if (p.sub.k === 'sub') sacc?.add(p.sub.id); }
    else { termAtomIds(p.l, acc, zacc); termAtomIds(p.r, acc, zacc); }
  }
}

/** A room's hypotheses as facts, in desk order (suppose: l = r; classical: l ≠ r; v4 assume: per rel, default =;
 *  Book phase A: a multi-desk Assume room has one per declared assumption). */
function roomFacts(room: OracleRoom): Fact[] {
  if (room.kind === 'assume' && Array.isArray(room.assumes) && room.assumes.length) {
    return room.assumes.map((a): Fact => {
      if (a.rel === 'mem') return { k: 'mem', t: a.t, sub: a.sub };
      if (a.rel !== 'eq' && a.rel !== 'neq') throw new Error(`oracle: unknown assumption kind ${String((a as { rel: unknown }).rel)}`);
      return { k: a.rel, l: a.l, r: a.r };
    });
  }
  const k = room.kind === 'suppose' ? 'eq' : room.kind === 'classical' ? 'neq' : room.rel === 'neq' ? 'neq' : 'eq';
  return [{ k, l: room.l, r: room.r }];
}
export interface OracleRoom { id: string; kind: 'suppose' | 'classical' | 'assume'; l: Term; r: Term; rel?: 'eq' | 'neq'; assumes?: DeskAssumption[] }

/**
 * Exhaustive finite-model check; reports the first witness per node.
 * v4: graph variables (Towers) are universally quantified exactly like level atoms — every node's fact
 * must hold under every assignment of atoms AND variables satisfying its dependencies. Cards produced
 * by generalize/assume exits are checked as laws/conds by `holds`.
 */
export function oracleCheck(level: LevelManifest, factsByNode: Record<string, {fact?: Fact; deps: string[]; ok: boolean}>, rooms: OracleRoom[], vars: AtomDecl[] = [], structs: StructDecl[] = []): string[] {
  // Book phase C: a many-sorted level (sorts, maps, group / Hom Towers) is checked by the many-sorted oracle
  if (level.sorts?.length || level.maps?.length || structs.some((x) => x.k === 'grp' || x.k === 'hom')) return oracleCheckM(level, factsByNode, rooms, vars, structs);
  // Book phase B: subgroup symbols (level subgroups and Subgroup Towers) range over every (normal) subgroup
  // of the model's group, plus ∅ when the level does not grant e ∈ S (P5.1: closed subsets, KERNEL-EXT §4.6)
  const subNormal = new Map<string, boolean>([...(level.subgroups ?? []).map((x) => [x.id, x.normal === true] as const), ...structs.flatMap((x) => (x.k === 'sub' ? [[x.id, x.normal] as const] : []))]);
  const withEmpty = !(level.tools.schemas.includes('sub.e') && !level.unlocks.includes('sub.e'));
  const ids = [...level.atoms.map(a => a.id), ...vars.map(v => v.id).filter(id => !level.atoms.some(a => a.id === id))];
  const violations: string[] = [];
  const dependencies = new Map<string, Fact>();
  for (const given of level.givens) dependencies.set(`g:${given.id}`, given.fact);
  // desk i of a room depends on 'a:<room>' (i = 0) or 'a:<room>/<i>' (kernel roomDep)
  for (const room of rooms) roomFacts(room).forEach((f, i) => dependencies.set(i ? `a:${room.id}/${i}` : `a:${room.id}`, f));
  for (const [id, node] of Object.entries(factsByNode)) {
    const fact = node.fact;
    if (!node.ok || !fact || fact.k === 'size') continue;
    const missing = node.deps.filter(dep => !dependencies.has(dep));
    if (missing.length) { violations.push(`Node ${id}: unresolved dependencies ${missing.join(', ')}`); continue; }
    const premises = node.deps.map(dep => dependencies.get(dep)!);
    // Only atoms/variables that occur in the fact or its hypotheses affect truth; enumerate just those.
    const occurring = new Set<string>(), zOccurring = new Set<string>(), sOccurring = new Set<string>();
    for (const f of [fact, ...premises]) factAtomIds(f, occurring, zOccurring, sOccurring);
    const subIds = [...sOccurring].sort();
    const unknownSub = subIds.find((x) => !subNormal.has(x));
    if (unknownSub) { violations.push(`Node ${id}: unknown subgroup ${unknownSub}`); continue; }
    // Atoms not declared by the level (graph variables) are universally quantified too.
    const used = [...ids.filter(id => occurring.has(id)), ...[...occurring].filter(id => !ids.includes(id))];
    for (const G of catalogue()) {
      if (premises.some(f => f.k === 'size' && f.n !== G.order)) continue;
      const s: Assignment = Object.create(null);
      const subsFirst = (i: number, visit: () => boolean): boolean => {
        if (i === subIds.length) return visit();
        for (const k of subModels(G, subNormal.get(subIds[i]!)!, withEmpty)) { s[subKeyOf(subIds[i]!)] = k; if (!subsFirst(i + 1, visit)) return false; }
        return true;
      };
      // ℤ Towers range over Z_RANGE (−6..6), which covers every residue class for orders ≤ 13
      const sound = subsFirst(0, () => everySortedAssignment(used, [...zOccurring], G.order, s, () => {
        if (!premises.every(p => holds(G, p, s)) || holds(G, fact, s)) return true;
        violations.push(`Node ${id}: ${fact.k} fails in ${G.name} with ${JSON.stringify(labeledAssignment(s, G))} (dependencies: ${node.deps.join(', ') || 'none'})`);
        return false;
      }));
      if (!sound) break;
    }
  }
  return violations;
}

/** Authoring threshold (SYNTHESIS §4.1 pin 4, architect 2026-10-15): a level needs at least this many nontrivial models. */
export const NONTRIVIAL_THRESHOLD = 10;

/**
 * How many NONTRIVIAL finite models satisfy a dock's allowed givens: a catalogue group of order ≥ 2, every subgroup
 * symbol the level declares ranging over its (normal) subgroups (plus ∅ where e ∈ S is not granted), and every
 * assignment of the level's atoms with at least one atom ≠ e (a level without atoms: any such group counts).
 * Counting stops at `cap`. Level authors: `expect(nontrivialModels(level, 's').ok).toBe(true)` in truth tests;
 * a vacuous or near-vacuous level (givens only the trivial group satisfies) fails here, not in a playtest.
 */
export function nontrivialModels(level: LevelManifest, socketId: string, cap = 10_000): { count: number; threshold: number; ok: boolean; capped: boolean } {
  const sock = level.sockets.find((s) => s.id === socketId);
  if (!sock) throw new Error(`nontrivialModels: no socket ${socketId} in ${level.id}`);
  if (level.sorts?.length || level.maps?.length) {
    const count = nontrivialModelsM(level, socketId, cap);
    return { count, threshold: NONTRIVIAL_THRESHOLD, ok: count >= NONTRIVIAL_THRESHOLD, capped: count >= cap };
  }
  const givens = level.givens.filter((g) => sock.allowedGivens.includes(g.id)).map((g) => g.fact);
  // only symbols the givens or the goal mention distinguish models
  const occ = new Set<string>(), zocc = new Set<string>(), socc = new Set<string>();
  for (const f of [...givens, sock.target]) factAtomIds(f, occ, zocc, socc);
  const atoms = level.atoms.map((a) => a.id).filter((id) => occ.has(id));
  const subs = (level.subgroups ?? []).filter((x) => socc.has(x.id));
  const withEmpty = !(level.tools.schemas.includes('sub.e') && !level.unlocks.includes('sub.e'));
  let count = 0;
  for (const G of catalogue()) {
    if (G.order < 2) continue;
    if (givens.some((f) => f.k === 'size' && f.n !== G.order)) continue;
    const s: Assignment = Object.create(null);
    const subsFirst = (i: number, visit: () => boolean): boolean => {
      if (i === subs.length) return visit();
      for (const k of subModels(G, subs[i]!.normal === true, withEmpty)) { s[subKeyOf(subs[i]!.id)] = k; if (!subsFirst(i + 1, visit)) return false; }
      return true;
    };
    const go = subsFirst(0, () => everySortedAssignment(atoms, [], G.order, s, () => {
      if (atoms.length && atoms.every((a) => s[a] === 0)) return true;
      if (givens.every((f) => holds(G, f, s))) count++;
      return count < cap;
    }));
    if (!go) break;
  }
  return { count, threshold: NONTRIVIAL_THRESHOLD, ok: count >= NONTRIVIAL_THRESHOLD, capped: count >= cap };
}
