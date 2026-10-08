import type { Fact, LevelManifest, Term } from '../kernel/types';
import { catalogue, holds, type Assignment } from './index';
import { everyAssignment, labeledAssignment } from './semantics';

/** Exhaustive finite-model check; reports the first witness per node. */
export function oracleCheck(level: LevelManifest, factsByNode: Record<string, {fact?: Fact; deps: string[]; ok: boolean}>, rooms: {id: string; kind: 'suppose'|'classical'; l: Term; r: Term}[]): string[] {
  const violations: string[] = [];
  const dependencies = new Map<string, Fact>();
  for (const given of level.givens) dependencies.set(`g:${given.id}`, given.fact);
  for (const room of rooms) dependencies.set(`a:${room.id}`, { k: room.kind === 'suppose' ? 'eq' : 'neq', l: room.l, r: room.r });
  for (const [id, node] of Object.entries(factsByNode)) {
    const fact = node.fact;
    if (!node.ok || !fact || fact.k === 'size') continue;
    const missing = node.deps.filter(dep => !dependencies.has(dep));
    if (missing.length) { violations.push(`Node ${id}: unresolved dependencies ${missing.join(', ')}`); continue; }
    const premises = node.deps.map(dep => dependencies.get(dep)!);
    for (const G of catalogue()) {
      if (premises.some(f => f.k === 'size' && f.n !== G.order)) continue;
      const s: Assignment = Object.create(null);
      const sound = everyAssignment(level.atoms.map(a => a.id), G.order, s, () => {
        if (!premises.every(p => holds(G, p, s)) || holds(G, fact, s)) return true;
        violations.push(`Node ${id}: ${fact.k} fails in ${G.name} with ${JSON.stringify(labeledAssignment(s, G))} (dependencies: ${node.deps.join(', ') || 'none'})`);
        return false;
      });
      if (!sound) break;
    }
  }
  return violations;
}
