// P5.s2 Closed Under Products — Book world 4 (side).
//  s1: Tower y₁ · Spool ay₁y₁ → insert a⁻¹a between the y₁'s and after the last y₁ → Hₐ at x := y₁a⁻¹ → cancel twice → ∀.
//  s2: Tower x₁ · Spool abx₁abx₁ → Hₐ at x := bx₁ → H_b at x := x₁a → ∀.
// Note: neither dock's fact can be saved as a lemma (both mention the constants a, b); s2 does not need s1.
import { describe, expect, it } from 'vitest';
import { I, P, a, b, bookFloor, cancel, deliver, eq, insertPair, lawRw, lvA, neededGivens, pinGap, pinSpan, spool, targetsTrue, tower, x1, y1 } from './kit-wA';
import { EARNED, given } from './lemmas-w123';

describe('P5.s2 Closed Under Products', () => {
  const L = lvA('P5.s2');
  it('both targets are true in every finite group under their docks’ givens; every allowed given is needed', () => {
    const n = targetsTrue(L);
    expect(n.s1).toBeGreaterThan(0);
    expect(n.s2).toBeGreaterThan(0);
    expect(neededGivens(L, 's1')).toEqual({ Ha: true });
    expect(neededGivens(L, 's2')).toEqual({ Ha: true, Hb: true });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 40 });
    f.add(tower('y1', 'y₁'), { x: 4, y: 40 });
    // s1
    const T = P(a, y1, y1);
    const sp1 = f.add(spool(T), { x: 12, y: 6 });
    const p1 = f.add(insertPair(a, true, pinGap(eq(T, T), 'l', 2)), { x: 18, y: 6 });
    const W1 = P(a, y1, I(a), a, y1);
    const p2 = f.add(insertPair(a, true, pinGap(eq(W1, T), 'l', 5)), { x: 24, y: 6 });
    const W2 = P(a, y1, I(a), a, y1, I(a), a);
    const h1 = f.add(lawRw(given('Ha'), { target: pinSpan(eq(W2, T), 'l', 0, 6) }), { x: 30, y: 6 });
    const W3 = P(y1, I(a), a, y1, I(a), a, a);
    const c1 = f.add(cancel(pinSpan(eq(W3, T), 'l', 1, 3)), { x: 36, y: 6 });
    const W4 = P(y1, y1, I(a), a, a);
    const c2 = f.add(cancel(pinSpan(eq(W4, T), 'l', 2, 4)), { x: 42, y: 6 });
    const al1 = f.add({ kind: 'forall' }, { x: 48, y: 6 });
    f.wire(sp1, p1); f.wire(p1, p2); f.wire(p2, h1); f.wire(h1, c1); f.wire(c1, c2); f.wire(c2, al1); f.wire(al1, f.socket('s1'));
    // s2
    const T2 = P(a, b, x1, a, b, x1);
    const sp2 = f.add(spool(T2), { x: 12, y: 20 });
    const g1 = f.add(lawRw(given('Ha'), { target: pinSpan(eq(T2, T2), 'r', 0, 6) }), { x: 20, y: 20 });
    const g2 = f.add(lawRw(given('Hb'), { target: pinSpan(eq(T2, P(b, x1, a, b, x1, a)), 'r', 0, 6) }), { x: 28, y: 20 });
    const al2 = f.add({ kind: 'forall' }, { x: 36, y: 20 });
    f.wire(sp2, g1); f.wire(g1, g2); f.wire(g2, al2); f.wire(al2, f.socket('s2'));
    deliver(f);
  });
});
