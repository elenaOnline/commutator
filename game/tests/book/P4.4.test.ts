// P4.4 Undo the Undo — Book world 2. Tower x₁ · Spool x₁⁻¹x₁ → cancel → unique inverse (cut x₁⁻¹ | x₁) → swap → ∀ → dock.
// The ∀ output is saved as "double inverse".
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { deliver, lv, targetsTrue } from './kit-w123';
import { buildDoubleInverse } from './lemmas-w123';

describe('P4.4 Undo the Undo', () => {
  const L = lv('P4.4');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution; the proof saves and re-verifies as the player’s double inverse', () => {
    const { f, lemma } = buildDoubleInverse();
    deliver(f);
    const x = { k: 'meta', id: 'x' } as K.Term;
    const I = (t: K.Term): K.Term => ({ k: 'inv', arg: t });
    expect(lemma.card.k).toBe('law');
    expect(K.sameCardUpToRenaming(lemma.card, { k: 'law', metas: ['x'], l: I(I(x)), r: x })).toBe(true);
  });
});
