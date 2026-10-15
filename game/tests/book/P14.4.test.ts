// P14.4 Normal Subgroups That Meet at e — Book world 12. Normal subgroups M, N; the player's saved commutator ⟸ (P4.9) closes it.
// In N: closed under conjugation (b by a) · closed under inverses (b⁻¹) · closed under products → aba⁻¹b⁻¹ ∈ N.
// In M: closed under inverses (a⁻¹) · closed under conjugation (a⁻¹ by b) · closed under products with a → aba⁻¹b⁻¹ ∈ M.
// Theorem I (M ∩ N = {e}) → aba⁻¹b⁻¹ = e → your commutator ⟸ → ab = ba.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { sch, given, EARNED, commutatorLemmas } from './lemmas-w1214';
import { bookFloor, lvZ, thm, a, b, knob, deliverZ, enoughModels, targetsHold, falsified } from './kit-w1214';

describe('P14.4 Normal Subgroups That Meet at e', { timeout: 120_000 }, () => {
  const L = lvZ('P14.4');
  it('the target is true for every pair of normal subgroups meeting at e; every given is needed', () => {
    targetsHold(L);
    enoughModels(L);
    for (const drop of ['ha', 'hb', 'I']) expect(falsified(L, L.sockets[0]!.target, ['ha', 'hb', 'I'].filter((g) => g !== drop)).length, `without ${drop}`).toBeGreaterThan(0);
    // normality matters: with plain subgroups the statement fails (S₃)
    const plain = { ...L, subgroups: L.subgroups!.map((s) => ({ ...s, normal: false })) };
    expect(falsified(plain, L.sockets[0]!.target, ['ha', 'hb', 'I']).length).toBeGreaterThan(0);
  });
  it('reference solution: one commutator in both subgroups, then your commutator ⟸', () => {
    const { bwd } = commutatorLemmas();
    const f = bookFloor(L, EARNED, [bwd]);
    const n1 = f.add(thm(sch('sub.conj', { N: 'N' }), 0, { g: knob(a) }), { x: 10, y: 6 });
    const n2 = f.add(thm(sch('sub.inv', { H: 'N' })), { x: 10, y: 12 });
    const n3 = f.add(thm(sch('sub.mul', { H: 'N' })), { x: 16, y: 9 });
    const m1 = f.add(thm(sch('sub.inv', { H: 'M' })), { x: 10, y: 20 });
    const m2 = f.add(thm(sch('sub.conj', { N: 'M' }), 0, { g: knob(b) }), { x: 14, y: 20 });
    const m3 = f.add(thm(sch('sub.mul', { H: 'M' })), { x: 18, y: 18 });
    const i1 = f.add(thm(given('I')), { x: 24, y: 12 });
    const c = f.add(thm(sch(bwd.id)), { x: 30, y: 12 });
    f.wire(f.given('hb'), n1, 'p0'); f.wire(f.given('hb'), n2, 'p0'); f.wire(n1, n3, 'p0'); f.wire(n2, n3, 'p1');
    f.wire(f.given('ha'), m1, 'p0'); f.wire(m1, m2, 'p0'); f.wire(f.given('ha'), m3, 'p0'); f.wire(m2, m3, 'p1');
    f.wire(m3, i1, 'p0'); f.wire(n3, i1, 'p1'); f.wire(i1, c, 'p0'); f.wire(c, f.socket());
    const { comp } = deliverZ(f);
    expect(comp.graph.nodes.some((n) => n.k === 'apply' && n.rule.k === 'schema' && n.rule.id === bwd.id)).toBe(true);
    void K;
  });
});
