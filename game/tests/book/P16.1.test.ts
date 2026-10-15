// P16.1 Fibres Are Cosets — Book world 14. Hom Tower f₁ : G₁ → K₁, Towers a₁, b₁ in G₁; the player's saved f(x⁻¹) = f(x)⁻¹ at f₁.
// Floor and route: lemmas-w1214 buildFibre (both ∀ outputs are saved as the fibre lemma ⟹ / ⟸, reused in the finale).
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { buildFibre } from './lemmas-w1214';
import { lvZ, deliverZ, enoughModels, targetsHold, falsified, app, eS, P, I, M } from './kit-w1214';

describe('P16.1 Fibres Are Cosets', { timeout: 120_000 }, () => {
  const L = lvZ('P16.1');
  it('both docks hold for every homomorphism between catalogue groups', () => {
    targetsHold(L);
    enoughModels(L);
    // negative control: f(a) = f(b) does not give f(a⁻¹b⁻¹) = e
    const t = L.sockets[0]!.target as K.Card & { k: 'cond' };
    expect(falsified(L, { ...t, concl: { k: 'eq', l: app('f', P(I(M('a')), I(M('b')))), r: eS('T') } }, []).length).toBeGreaterThan(0);
  });
  it('reference solution; both lemmas save and re-verify, and match the docks', () => {
    const { f, fwd, bwd } = buildFibre();
    deliverZ(f);
    expect(K.sameCardUpToRenaming(fwd.card, L.sockets[0]!.target as K.Card)).toBe(true);
    expect(K.sameCardUpToRenaming(bwd.card, L.sockets[1]!.target as K.Card)).toBe(true);
  });
});
