// P4.7 Idle Twice — Book world 3. Tower x₁ · Assume xx = x → multiply left by x⁻¹ → cancel twice → x = e → gate → ∀ → dock.
// The ∀ output is saved as "the only idempotent is e".
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliver, lv, targetsTrue } from './kit-w123';
import { buildIdempotent } from './lemmas-w123';

describe('P4.7 Idle Twice', () => {
  const L = lv('P4.7');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution; the lemma saves and re-verifies', () => {
    const { f, lemma } = buildIdempotent();
    deliver(f);
    const x = { k: 'meta', id: 'x' } as K.Term;
    expect(K.sameCardUpToRenaming(lemma.card, { k: 'cond', metas: ['x'], premises: [{ k: 'eq', l: { k: 'mul', fs: [x, x] }, r: x }], concl: { k: 'eq', l: x, r: { k: 'e' } } })).toBe(true);
  });
});
