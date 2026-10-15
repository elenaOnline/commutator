// P10.1 Negative Powers — Book world 8. Tower x₁, n₁ · Spool xⁿx⁻ⁿ → power.add → power.zero → unique inverse (cut xⁿ | x⁻ⁿ) → ∀ → dock.
// The ∀ output is saved as "negative power": power.negate is never imported, the player proves it.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliver, lv89, targetsTrue } from './kit-w89';
import { buildNegPower } from './lemmas-w89';

describe('P10.1 Negative Powers', () => {
  const L = lv89('P10.1');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('power.negate is withheld; add and zero are the imports', () => {
    expect(L.tools.schemas.filter((s) => s.startsWith('power.')).sort()).toEqual(['power.add', 'power.zero']);
  });
  it('reference solution; the proof saves and re-verifies as the player’s negative power', () => {
    const { f, lemma } = buildNegPower();
    deliver(f);
    expect(K.sameCardUpToRenaming(lemma.card, L.sockets[0]!.target as K.Card)).toBe(true);
  });
});
