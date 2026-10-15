// P12.1 Same Coset — Book world 10. A Subgroup Tower H₁; refl, symm and trans, each saved "for every subgroup".
//  s1: sub.e (H₁) → insert x₁x₁⁻¹ at the gap of e → ∀.   s2: Assume x₁y₁⁻¹ ∈ H₁ → inverses → inverse of a product → double inverse (P4.4) → ∀.
//  s3: two desks x₁y₁⁻¹, y₁z₁⁻¹ ∈ H₁ → products → cancel → ∀.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliver, expectNontrivial, lvM, memTruth } from './kit-members';
import { buildSameCoset } from './lemmas-members';

describe('P12.1 Same Coset', () => {
  const L = lvM('P12.1');
  it('truth: refl, symm and trans hold for every subgroup of every catalogue group (the cards quantify over H)', () => {
    for (const id of ['s1', 's2', 's3']) { expect(memTruth(L, id), id).toBeGreaterThan(0); expect(expectNontrivial(L, id), id).toBeGreaterThanOrEqual(10); }
  });
  it('the docks are premise-order-free cards; sub.e is listed (earned in P5.1), not unlocked here', () => {
    expect(L.tools.schemas).toContain('sub.e');
    expect(L.unlocks).toEqual([]);
    expect(L.subgroups).toBeUndefined();
    expect(L.sockets.every((s) => (s.target as K.Card).k === 'cond' && (s.target as K.Card).binds?.[0]?.k === 'sub')).toBe(true);
  });
  it('reference solution; all three docks are saved as lemmas for every subgroup and re-verify', () => {
    const { f, a1, a2, a3, save } = buildSameCoset();
    const { comp } = deliver(f);
    const L2 = K.levelLabels(K.withVars(f.ctx, comp.graph).ctx.level);
    const card = (m: string) => K.factText((comp.machines[m]!.out as { card: K.Card }).card, L2);
    expect(card(a1)).toBe('∀H ≤ G. ∀x. xx⁻¹ ∈ H');
    expect(card(a2)).toBe('∀H ≤ G. ∀x, y. xy⁻¹ ∈ H ⟹ yx⁻¹ ∈ H');
    expect(card(a3)).toBe('∀H ≤ G. ∀x, y, z. xy⁻¹ ∈ H, yz⁻¹ ∈ H ⟹ xz⁻¹ ∈ H');
    const lemmas = save();
    for (const l of Object.values(lemmas)) expect(l.card.binds?.[0]).toMatchObject({ k: 'sub', normal: false });
  });
});
