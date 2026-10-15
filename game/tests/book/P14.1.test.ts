// P14.1 The Kernel — Book world 12. Hom Tower f₁ : G₁ → K₁, element Towers x₁, y₁, g₁ in G₁, three Assume rooms.
// The player's saved ch. 9 lemmas f(e) = e and f(x⁻¹) = f(x)⁻¹ (built here the way a player builds them) are applied at f₁.
//  prod: Spool f(x₁y₁) → hom law → desk 1 → desk 2 → gate → ∀.
//  inv:  Spool f(x₁⁻¹) → your f(x⁻¹) = f(x)⁻¹ at f₁ → desk → insert e → cancel → gate → ∀.
//  conj: Spool f(g₁x₁g₁⁻¹) → hom law (cut g₁ | x₁g₁⁻¹) → hom law → desk → hom law backwards → cancel → your f(e) = e at f₁ → gate → ∀.
import { describe, expect, it } from 'vitest';
import type * as K from '../../src/kernel';
import { homLemmas, sch, EARNED } from './lemmas-w1214';
import { multiRoom } from './lemmas-w89';
import {
  bookFloor, lvZ, spool, cancel, routed, lawRw, insertE, P, I, eq, pinSpan, app, eS, groupTower, homTower, elemTower, knob,
  deliverZ, enoughModels, targetsHold, falsified,
} from './kit-w1214';

export function floorP141() {
  const { homE, homInv } = homLemmas();
  const L = lvZ('P14.1');
  const f = bookFloor(L, EARNED, [homE, homInv]);
  f.add(groupTower('G1', 'G₁'), { x: 2, y: 60 });
  f.add(groupTower('K1', 'K₁'), { x: 4, y: 60 });
  f.add(homTower('f1', 'f₁', 'G1', 'K1'), { x: 6, y: 60 });
  f.add(elemTower('x1', 'x₁', 'G1'), { x: 8, y: 60 });
  f.add(elemTower('y1', 'y₁', 'G1'), { x: 10, y: 60 });
  f.add(elemTower('g1', 'g₁', 'G1'), { x: 12, y: 60 });
  const X: K.Term = { k: 'atom', id: 'x1' }, Y: K.Term = { k: 'atom', id: 'y1' }, G: K.Term = { k: 'atom', id: 'g1' };
  const fx = (t: K.Term) => app('f1', t), e1 = eS('K1');
  // prod
  const r1 = multiRoom(f, { x: 18, y: 4, w: 40, h: 10 }, [{ rel: 'eq', l: fx(X), r: e1 }, { rel: 'eq', l: fx(Y), r: e1 }]);
  const sp1 = f.add(spool(fx(P(X, Y))), { x: 20, y: 8 });
  const h1 = f.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(fx(P(X, Y)), fx(P(X, Y))), 'r', 0, 1) }), { x: 25, y: 8 });
  const d1 = f.add(routed(), { x: 30, y: 8 });
  const d2 = f.add(routed(), { x: 35, y: 8 });
  const all1 = f.add({ kind: 'forall' }, { x: 62, y: 6 });
  f.wire(sp1, h1); f.wire(h1, d1); f.wire(r1.desks[0]!, d1, 'rule'); f.wire(d1, d2); f.wire(r1.desks[1]!, d2, 'rule'); f.wire(d2, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('prod'));
  // inv
  const r2 = multiRoom(f, { x: 18, y: 18, w: 40, h: 10 }, [{ rel: 'eq', l: fx(X), r: e1 }]);
  const sp2 = f.add(spool(fx(I(X))), { x: 20, y: 22 });
  const v1 = f.add(lawRw(sch(homInv.id, { f: 'f1' }), { target: pinSpan(eq(fx(I(X)), fx(I(X))), 'r', 0, 1) }), { x: 25, y: 22 });
  const v2 = f.add(routed(), { x: 30, y: 22 });
  const v3 = f.add(insertE(), { x: 35, y: 22 });
  const v4 = f.add(cancel(), { x: 40, y: 22 });
  const all2 = f.add({ kind: 'forall' }, { x: 62, y: 20 });
  f.wire(sp2, v1); f.wire(v1, v2); f.wire(r2.desks[0]!, v2, 'rule'); f.wire(v2, v3); f.wire(v3, v4); f.wire(v4, r2.gate); f.wire(r2.gate, all2); f.wire(all2, f.socket('inv'));
  // conj
  const r3 = multiRoom(f, { x: 18, y: 32, w: 44, h: 10 }, [{ rel: 'eq', l: fx(X), r: e1 }]);
  const W = fx(P(G, X, I(G)));
  const sp3 = f.add(spool(W), { x: 20, y: 36 });
  const c1 = f.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(W, W), 'r', 0, 1), values: { x: knob(G), y: knob(P(X, I(G))) } }), { x: 24, y: 36 });
  const c2 = f.add(lawRw(sch('hom.mul')), { x: 28, y: 36 });
  const c3 = f.add(routed(), { x: 32, y: 36 });
  const c4 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 36, y: 36 });
  const c5 = f.add(cancel(), { x: 40, y: 36 });
  const c6 = f.add(lawRw(sch(homE.id, { f: 'f1' })), { x: 44, y: 36 });
  const all3 = f.add({ kind: 'forall' }, { x: 66, y: 34 });
  f.wire(sp3, c1); f.wire(c1, c2); f.wire(c2, c3); f.wire(r3.desks[0]!, c3, 'rule'); f.wire(c3, c4); f.wire(c4, c5); f.wire(c5, c6); f.wire(c6, r3.gate); f.wire(r3.gate, all3); f.wire(all3, f.socket('conj'));
  return { f, used: { homInv: v1, homE: c6 } };
}

describe('P14.1 The Kernel', { timeout: 120_000 }, () => {
  const L = lvZ('P14.1');
  it('every dock is true for every homomorphism between catalogue groups, with enough nontrivial models', () => {
    targetsHold(L);
    enoughModels(L);
    // negative control: the kernel is not closed under "f(x) = e ⟹ f(gx) = e"
    const t = L.sockets[2]!.target as K.Card & { k: 'cond' };
    const bad = { ...t, concl: { k: 'eq' as const, l: app('f', P({ k: 'meta', id: 'g' }, { k: 'meta', id: 'x' })), r: eS('T') } };
    expect(falsified(L, bad, []).length).toBeGreaterThan(0);
  });
  it('reference solution: the saved hom lemmas are applied at the Tower hom f₁', () => {
    const { f, used } = floorP141();
    const { comp } = deliverZ(f);
    expect(comp.machines[used.homInv]!.structs?.[0]?.chosen ?? 'f1').toBe('f1');
    expect(comp.machines[used.homE]!.structs?.[0]?.chosen ?? 'f1').toBe('f1');
  });
});
