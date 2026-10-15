// P5.3 Closed Under Inverses — Book world 4. Tower x₁ · Spool a(a⁻¹x₁a⁻¹)a(a⁻¹x₁a⁻¹) → H at x := a⁻¹x₁a⁻¹ on the right rail →
// two cancellations on each rail → swap → ∀.
import { describe, expect, it } from 'vitest';
import { I, P, a, bookFloor, cancel, deliver, eq, lawRw, lvA, neededGivens, op, pinSpan, spool, targetsTrue, tower, x1 } from './kit-wA';
import { EARNED, given } from './lemmas-w123';

describe('P5.3 Closed Under Inverses', () => {
  const L = lvA('P5.3');
  it('the target is true in every finite group under H, and H is needed', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ H: true });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    const X = P(I(a), x1, I(a));
    const W = P(a, X, a, X);
    const sp = f.add(spool(W), { x: 10, y: 8 });
    const h = f.add(lawRw(given('H'), { target: pinSpan(eq(W, W), 'r', 0, 8) }), { x: 16, y: 8 });
    // left rail  a a⁻¹ x a⁻¹ a a⁻¹ x a⁻¹ : cancel (0,2), then (1,3)
    const L0 = W;
    const L1 = P(x1, I(a), a, I(a), x1, I(a));
    const R0 = P(X, a, X, a);
    const R1 = P(I(a), x1, I(a), x1, I(a), a);
    const c1 = f.add(cancel(pinSpan(eq(L0, R0), 'l', 0, 2)), { x: 22, y: 8 });
    const c2 = f.add(cancel(pinSpan(eq(L1, R0), 'l', 1, 3)), { x: 28, y: 8 });
    const c3 = f.add(cancel(pinSpan(eq(P(x1, I(a), x1, I(a)), R0), 'r', 2, 4)), { x: 34, y: 8 });
    const c4 = f.add(cancel(pinSpan(eq(P(x1, I(a), x1, I(a)), R1), 'r', 4, 6)), { x: 40, y: 8 });
    const sw = f.add(op({ k: 'swap' }), { x: 46, y: 8 });
    const al = f.add({ kind: 'forall' }, { x: 52, y: 8 });
    f.wire(sp, h); f.wire(h, c1); f.wire(c1, c2); f.wire(c2, c3); f.wire(c3, c4); f.wire(c4, sw); f.wire(sw, al); f.wire(al, f.socket());
    deliver(f);
  });
});
