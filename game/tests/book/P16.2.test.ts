// P16.2 The Fundamental Theorem — Book world 14, the campaign finale (restated per reviews/synthesis-adversary.md M1).
// Level homs f : G → K, π : G → Q with the same kernel. Element Towers a₁, b₁ in G. The player's fibre lemmas (P16.1), saved
// "for every homomorphism", are applied at π and at f in opposite directions:
//  wd:  desk π(a₁) = π(b₁) → your fibre ⟹ at π → Theorem K2 → your fibre ⟸ at f → gate → ∀.
//  inj: desk f(a₁) = f(b₁) → your fibre ⟹ at f → Theorem K1 → your fibre ⟸ at π → gate → ∀.
import { describe, expect, it, vi } from 'vitest';
// Oracle-heavy (three group sorts × every hom between them): a per-file timeout instead of a global one.
vi.setConfig({ testTimeout: 30_000 });
import type * as K from '../../src/kernel';
import { buildFibre, sch, given, EARNED } from './lemmas-w1214';
import { multiRoom } from './lemmas-w89';
import { bookFloor, lvZ, thm, app, elemTower, deliverZ, enoughModels, targetsHold, falsified, outText } from './kit-w1214';

export function floorP162() {
  const { fwd, bwd } = buildFibre();
  const L = lvZ('P16.2');
  const f = bookFloor(L, EARNED, [fwd, bwd]);
  f.add(elemTower('a1', 'a₁'), { x: 2, y: 40 });
  f.add(elemTower('b1', 'b₁'), { x: 4, y: 40 });
  const a: K.Term = { k: 'atom', id: 'a1' }, b: K.Term = { k: 'atom', id: 'b1' };
  const side = (outer: string, inner: string, kernel: string, y: number, socket: string) => {
    const r = multiRoom(f, { x: 18, y, w: 30, h: 10 }, [{ rel: 'eq', l: app(outer, a), r: app(outer, b) }]);
    const t1 = f.add(thm(sch(fwd.id, { f: outer })), { x: 21, y: y + 4 });
    const t2 = f.add(thm(given(kernel)), { x: 27, y: y + 4 });
    const t3 = f.add(thm(sch(bwd.id, { f: inner })), { x: 33, y: y + 4 });
    const all = f.add({ kind: 'forall' }, { x: 52, y: y + 2 });
    f.wire(r.desks[0]!, t1, 'p0'); f.wire(t1, t2, 'p0'); f.wire(t2, t3, 'p0'); f.wire(t3, r.gate); f.wire(r.gate, all); f.wire(all, f.socket(socket));
    return [t1, t2, t3, all];
  };
  const wd = side('pi', 'f', 'K2', 4, 'wd');
  const inj = side('f', 'pi', 'K1', 18, 'inj');
  return { f, wd, inj, fwd, bwd };
}

describe('P16.2 The Fundamental Theorem', { timeout: 120_000 }, () => {
  const L = lvZ('P16.2');
  it('both docks hold for every pair of homomorphisms with the same kernel; each needs its given', () => {
    targetsHold(L);
    enoughModels(L);
    expect(falsified(L, L.sockets[0]!.target, []).length).toBeGreaterThan(0);
    expect(falsified(L, L.sockets[1]!.target, []).length).toBeGreaterThan(0);
    // the other inclusion is not enough: wd needs ker π ⊆ ker f, inj needs ker f ⊆ ker π
    expect(falsified(L, L.sockets[0]!.target, ['K1']).length).toBeGreaterThan(0);
    expect(falsified(L, L.sockets[1]!.target, ['K2']).length).toBeGreaterThan(0);
  });
  it('reference solution: the fibre lemma at π and at f, in opposite directions', () => {
    const { f, wd, inj } = floorP162();
    const comp = f.compile();
    if (!comp.solvable) for (const m of [...wd, ...inj]) console.log(m, outText(f, comp, m));
    deliverZ(f);
    expect(comp.machines[wd[0]!]!.structs?.[0]?.chosen).toBe('pi');
    expect(comp.machines[wd[2]!]!.structs?.[0]?.chosen).toBe('f');
    expect(comp.machines[inj[0]!]!.structs?.[0]?.chosen).toBe('f');
    expect(comp.machines[inj[2]!]!.structs?.[0]?.chosen).toBe('pi');
  });
});
