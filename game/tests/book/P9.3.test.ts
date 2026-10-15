// P9.3 e Goes to e — Book world 7. Group Towers G₁, H₁ · Hom Tower f₁ : G₁ → H₁ · Spool f₁(e) · e ⟶ ee inside f₁ ·
// the hom law · swap · the saved "the only idempotent is e" (P4.7), read in H₁ · ∀ → dock. The ∀ output is saved as "f(e) = e".
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliverC, lvC, nontrivialHoms, nontrivialModels, targetsTrueC } from './kit-wC';
import { buildFE } from './lemmas-wC';

const L = lvC('P9.3');

describe('P9.3 e Goes to e', () => {
  it('the target holds for every homomorphism between catalogue groups; nontrivial models', () => {
    targetsTrueC(L);
    expect(nontrivialHoms()).toBeGreaterThanOrEqual(10);
    expect(nontrivialModels(L, 's').ok).toBe(true);
  });
  it('reference solution; the lemma saves and re-verifies for every homomorphism', () => {
    const { f, lemma } = buildFE();
    const r = deliverC(f);
    expect(K.sameCardUpToRenaming(lemma.card, L.sockets[0]!.target as K.Card)).toBe(true);
  }, 60_000);
});
