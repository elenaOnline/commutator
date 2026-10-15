// P4.10 One-Sided Inverses — Book world 3. Dock s (Assume xy = e → unique inverse → rewrite → ∀) is also routed, as a card, into a
// Theorem machine on the way to dock t: h × a on the right, cancel → (ba)(ca) = e → the card xy = e ⟹ yx = e → caba = e → unique left inverse.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliver, lv, targetsTrue } from './kit-w123';
import { buildOneSided } from './lemmas-w123';

describe('P4.10 One-Sided Inverses', () => {
  const L = lv('P4.10');
  it('both targets are true in every finite group (t under the given h, s under none)', () => {
    const n = targetsTrue(L);
    expect(n.s).toBeGreaterThan(0);
    expect(n.t).toBeGreaterThan(0);
  });
  it('dock s allows no givens; dock t allows h', () => {
    expect(L.sockets.map((s) => s.allowedGivens)).toEqual([[], ['h']]);
  });
  it('reference solution; the lemma xy = e ⟹ yx = e saves and re-verifies', () => {
    const { f, lemma } = buildOneSided();
    deliver(f);
    expect(K.sameCardUpToRenaming(lemma.card, L.sockets[0]!.target as K.Card)).toBe(true);
  });
});
