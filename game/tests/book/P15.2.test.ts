// P15.2 An Abelian Quotient — Book world 13. Level hom π : G → Q; Towers x₁, y₁ in G.
// Spool π(x₁y₁x₁⁻¹y₁⁻¹) → D on the right → hom law three times → your f(x⁻¹) = f(x)⁻¹ at π, twice →
// your commutator ⟸ (P4.9), used in Q → ∀.
import { describe, expect, it, vi } from 'vitest';
// Oracle-heavy (three group sorts × every hom between them): a per-file timeout instead of a global one.
vi.setConfig({ testTimeout: 30_000 });
import type * as K from '../../src/kernel';
import { sch, given, EARNED, homLemmas, commutatorLemmas } from './lemmas-w1214';
import { bookFloor, lvZ, thm, spool, lawRw, P, I, eq, pinSpan, app, elemTower, deliverZ, enoughModels, targetsHold, falsified } from './kit-w1214';

describe('P15.2 An Abelian Quotient', { timeout: 120_000 }, () => {
  const L = lvZ('P15.2');
  it('the target is true for every homomorphism killing commutators, and needs the given', () => {
    targetsHold(L);
    enoughModels(L);
    expect(falsified(L, L.sockets[0]!.target, []).length).toBeGreaterThan(0);
  });
  it('reference solution: your ch. 9 lemma at π, your ch. 4 lemma in Q', () => {
    const { homInv } = homLemmas();
    const { bwd } = commutatorLemmas();
    const f = bookFloor(L, EARNED, [bwd, homInv]);
    f.add(elemTower('x1', 'x₁'), { x: 2, y: 40 }); f.add(elemTower('y1', 'y₁'), { x: 4, y: 40 });
    const X: K.Term = { k: 'atom', id: 'x1' }, Y: K.Term = { k: 'atom', id: 'y1' };
    const W = app('pi', P(X, Y, I(X), I(Y)));
    const sp = f.add(spool(W), { x: 10, y: 6 });
    const d = f.add(lawRw(given('D'), { target: pinSpan(eq(W, W), 'r', 0, 1) }), { x: 14, y: 6 });
    const h1 = f.add(lawRw(sch('hom.mul')), { x: 18, y: 6 });
    const h2 = f.add(lawRw(sch('hom.mul')), { x: 22, y: 6 });
    const h3 = f.add(lawRw(sch('hom.mul')), { x: 26, y: 6 });
    const v1 = f.add(lawRw(sch(homInv.id, { f: 'pi' })), { x: 30, y: 6 });
    const v2 = f.add(lawRw(sch(homInv.id, { f: 'pi' })), { x: 34, y: 6 });
    const c = f.add(thm(sch(bwd.id)), { x: 38, y: 6 });
    const all = f.add({ kind: 'forall' }, { x: 42, y: 6 });
    f.wire(sp, d); f.wire(d, h1); f.wire(h1, h2); f.wire(h2, h3); f.wire(h3, v1); f.wire(v1, v2); f.wire(v2, c, 'p0'); f.wire(c, all); f.wire(all, f.socket());
    deliverZ(f);
  });
});
