// P10.2 Conjugates Share an Order — Book world 8. Two Assume rooms, two docks; both ∀ outputs are saved.
//  s: assume xⁿ = e; Spool (y⁻¹xy)ⁿ → power.conjugate → rewrite xⁿ by the desk → cancel y⁻¹y.
//  t: assume (y⁻¹xy)ⁿ = e; Spool xⁿ → insert yy⁻¹ at both ends → power.conjugate backwards → desk → cancel.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliver, lv89, targetsTrue } from './kit-w89';
import { buildConjugate } from './lemmas-w89';

describe('P10.2 Conjugates Share an Order', () => {
  const L = lv89('P10.2');
  it('both targets are true in every finite group', () => {
    const n = targetsTrue(L);
    expect(n.s).toBeGreaterThan(0);
    expect(n.t).toBeGreaterThan(0);
  });
  it('reference solution; both lemmas save and re-verify', () => {
    const { f, fwd, bwd } = buildConjugate();
    deliver(f);
    expect(K.sameCardUpToRenaming(fwd.card, L.sockets[0]!.target as K.Card)).toBe(true);
    expect(K.sameCardUpToRenaming(bwd.card, L.sockets[1]!.target as K.Card)).toBe(true);
  });
});
