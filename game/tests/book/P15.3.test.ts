// P15.3 Commutators in the Kernel — Book world 13. Level hom π : G → Q; Towers x₁, y₁ in G.
// Spool π(x₁)π(y₁) → A on the right → your commutator ⟹ (P4.9), used in Q → your f(x⁻¹) = f(x)⁻¹ at π backwards, twice →
// hom law backwards three times → ∀.
import { describe, expect, it, vi } from 'vitest';
// Oracle-heavy (three group sorts × every hom between them): a per-file timeout instead of a global one.
vi.setConfig({ testTimeout: 30_000 });
import type * as K from '../../src/kernel';
import { sch, given, EARNED, homLemmas, commutatorLemmas } from './lemmas-w1214';
import { bookFloor, lvZ, thm, spool, lawRw, P, eq, pinSpan, app, elemTower, deliverZ, enoughModels, targetsHold, falsified, outText } from './kit-w1214';

describe('P15.3 Commutators in the Kernel', { timeout: 120_000 }, () => {
  const L = lvZ('P15.3');
  it('the target is true for every homomorphism with commuting images, and needs the given', () => {
    targetsHold(L);
    enoughModels(L);
    expect(falsified(L, L.sockets[0]!.target, []).length).toBeGreaterThan(0);
  });
  it('reference solution: your ch. 4 lemma in Q, your ch. 9 lemma at π backwards', () => {
    const { homInv } = homLemmas();
    const { fwd } = commutatorLemmas();
    const f = bookFloor(L, EARNED, [fwd, homInv]);
    f.add(elemTower('x1', 'x₁'), { x: 2, y: 40 }); f.add(elemTower('y1', 'y₁'), { x: 4, y: 40 });
    const X: K.Term = { k: 'atom', id: 'x1' }, Y: K.Term = { k: 'atom', id: 'y1' };
    const W = P(app('pi', X), app('pi', Y));
    const sp = f.add(spool(W), { x: 10, y: 6 });
    const a = f.add(lawRw(given('A'), { target: pinSpan(eq(W, W), 'r', 0, 2) }), { x: 14, y: 6 });
    const c = f.add(thm(sch(fwd.id)), { x: 18, y: 6 });
    const v1 = f.add(lawRw(sch(homInv.id, { f: 'pi' }), { dir: 'rev' }), { x: 22, y: 6 });
    const v2 = f.add(lawRw(sch(homInv.id, { f: 'pi' }), { dir: 'rev' }), { x: 26, y: 6 });
    const h1 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 30, y: 6 });
    const h2 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 34, y: 6 });
    const h3 = f.add(lawRw(sch('hom.mul'), { dir: 'rev' }), { x: 38, y: 6 });
    const all = f.add({ kind: 'forall' }, { x: 42, y: 6 });
    f.wire(sp, a); f.wire(a, c, 'p0'); f.wire(c, v1); f.wire(v1, v2); f.wire(v2, h1); f.wire(h1, h2); f.wire(h2, h3); f.wire(h3, all); f.wire(all, f.socket());
    const comp = f.compile();
    if (!comp.solvable) for (const m of [sp, a, c, v1, v2, h1, h2, h3, all]) console.log(m, outText(f, comp, m));
    deliverZ(f);
  });
});
