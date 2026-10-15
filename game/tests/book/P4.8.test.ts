// P4.8 Commuting in a Frame — Book world 3. Tower x₁ · Spool (x₁ax₁⁻¹)(x₁bx₁⁻¹) → on the right rail: cancel x₁⁻¹x₁ →
// h (ab → ba) → insert the pair x₁⁻¹x₁ between b and a → ∀ → dock.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { I, P, a, b, bookFloor, cancel, deliver, eq, insertPair, lawRw, lv, pinGap, pinSpan, spool, targetsTrue, tower, x1 } from './kit-w123';
import { EARNED, given } from './lemmas-w123';

describe('P4.8 Commuting in a Frame', () => {
  const L = lv('P4.8');
  it('the target is true in every finite group satisfying the given', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    const T: K.Term = P(x1, a, I(x1), x1, b, I(x1));
    const sp = f.add(spool(T));
    const c1 = f.add(cancel(pinSpan(eq(T, T), 'r', 2, 4)));
    const r1 = f.add(lawRw(given('h'), { target: pinSpan(eq(T, P(x1, a, b, I(x1))), 'r', 1, 3) }));
    const ip = f.add(insertPair(x1, true, pinGap(eq(T, P(x1, b, a, I(x1))), 'r', 2)));
    const all = f.add({ kind: 'forall' });
    f.wire(sp, c1); f.wire(c1, r1); f.wire(r1, ip); f.wire(ip, all); f.wire(all, f.socket());
    deliver(f);
  });
});
