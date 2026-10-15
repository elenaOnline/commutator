// P4.9 The Commutator — Book world 3. Two Assume rooms, two docks; both ∀ outputs are saved.
//  s: assume xy = yx; Spool xyx⁻¹y⁻¹ → rewrite xy by the desk → cancel twice → gate → ∀.
//  t: assume xyx⁻¹y⁻¹ = e; multiply right by yx → cancel twice → pop the e → gate → ∀.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliver, lv, targetsTrue } from './kit-w123';
import { buildCommutator } from './lemmas-w123';

describe('P4.9 The Commutator', () => {
  const L = lv('P4.9');
  it('both targets are true in every finite group', () => {
    const n = targetsTrue(L);
    expect(n.s).toBeGreaterThan(0);
    expect(n.t).toBeGreaterThan(0);
  });
  it('reference solution; both lemmas save and re-verify', () => {
    const { f, fwd, bwd } = buildCommutator();
    deliver(f);
    expect(K.sameCardUpToRenaming(fwd.card, L.sockets[0]!.target as K.Card)).toBe(true);
    expect(K.sameCardUpToRenaming(bwd.card, L.sockets[1]!.target as K.Card)).toBe(true);
  });
});
