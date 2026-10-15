// P13.1 Cosets Are Equal or Disjoint — Book world 11. H is a level subgroup; Towers x₁, a₁, b₁, h₁. Assume room, three desks:
// x₁a₁⁻¹ ∈ H, x₁b₁⁻¹ ∈ H, h₁a₁⁻¹ ∈ H. Saved P12.1 lemmas: symmetric (x₁a₁⁻¹ → a₁x₁⁻¹), transitive (h₁a₁⁻¹, a₁x₁⁻¹ → h₁x₁⁻¹),
// transitive again (h₁x₁⁻¹, x₁b₁⁻¹ → h₁b₁⁻¹) → gate → ∀ → dock. On ∎ the level unlocks Lagrange: the press is in the next levels' toolsets.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { I, P, deliver, expectNontrivial, lvM, memA, memRoom, membersFloor, memTruth, sc, thm, tower, x1 } from './kit-members';
import { EARNED } from './lemmas-w123';
import { COSET_SYMM_ID, COSET_TRANS_ID, buildSameCoset } from './lemmas-members';

const a1: K.Term = { k: 'atom', id: 'a1' }, b1: K.Term = { k: 'atom', id: 'b1' }, h1: K.Term = { k: 'atom', id: 'h1' };

describe('P13.1 Cosets Are Equal or Disjoint', () => {
  const L = lvM('P13.1');
  it('truth: x ∈ Ha ∩ Hb and h ∈ Ha give h ∈ Hb, for every subgroup of every catalogue group', () => {
    expect(memTruth(L)).toBeGreaterThan(0);
    expect(expectNontrivial(L)).toBeGreaterThanOrEqual(10);
  });
  it('the dock has three membership premises; the level has no atoms and a level subgroup H', () => {
    expect(L.subgroups).toEqual([{ id: 'H', label: 'H' }]);
    expect(L.atoms).toEqual([]);
    expect((L.sockets[0]!.target as K.Card & { k: 'cond' }).premises).toHaveLength(3);
  });
  it('unlocks Lagrange: no press here, the press in every later level of the world', () => {
    expect(L.tools.press).toBe(false);
    expect(L.unlocks).toEqual([]);
  });
  it('reference solution (the player’s lemmas from P12.1: symmetric once, transitive twice)', () => {
    const { save } = buildSameCoset();
    const { symm, trans, refl } = save();
    const f = membersFloor(L, EARNED, [refl, symm, trans]);
    f.add(tower('x1', 'x₁'), { x: 2, y: 40 }); f.add(tower('a1', 'a₁'), { x: 4, y: 40 }); f.add(tower('b1', 'b₁'), { x: 6, y: 40 }); f.add(tower('h1', 'h₁'), { x: 8, y: 40 });
    const r = memRoom(f, { x: 18, y: 4, w: 40, h: 14 }, [memA(P(x1, I(a1)), 'H'), memA(P(x1, I(b1)), 'H'), memA(P(h1, I(a1)), 'H')], x1);
    const sy = f.add(thm(sc(COSET_SYMM_ID, { H: 'H' })), { x: 22, y: 6 });
    const t1 = f.add(thm(sc(COSET_TRANS_ID, { H: 'H' })), { x: 29, y: 10 });
    const t2 = f.add(thm(sc(COSET_TRANS_ID, { H: 'H' })), { x: 36, y: 10 });
    const all = f.add({ kind: 'forall' }, { x: 62, y: 10 });
    f.wire(r.desks[0]!, sy, 'p0'); f.wire(r.desks[2]!, t1, 'p0'); f.wire(sy, t1, 'p1'); f.wire(t1, t2, 'p0'); f.wire(r.desks[1]!, t2, 'p1');
    f.wire(t2, r.gate); f.wire(r.gate, all); f.wire(all, f.socket());
    const { comp } = deliver(f);
    expect(K.factText((comp.machines[all]!.out as { card: K.Card }).card, K.levelLabels(K.withVars(f.ctx, comp.graph).ctx.level))).toBe('∀x, a, b, h. xa⁻¹ ∈ H, xb⁻¹ ∈ H, ha⁻¹ ∈ H ⟹ hb⁻¹ ∈ H');
  });
});
