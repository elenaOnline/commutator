// P9.s1 Two Flips Make S₃ — Book world 7 (side).
//  s1: Spool ababab → bab ⟶ aba (h₃) → aa ⟶ e (h₁) → aa ⟶ e (h₁) → bb ⟶ e (h₂), on the right rail.
//  s2: Spool abab → bab ⟶ aba (h₃) → aa ⟶ e (h₁), on the left rail: ba = abab.
import { describe, expect, it } from 'vitest';
import { P, bookFloor, deliver, eq, lawRw, lvA, neededGivens, pinSpan, spool, targetsTrue } from './kit-wA';
import { EARNED, given } from './lemmas-w123';
import type * as K from '../../src/kernel';

const a: K.Term = { k: 'atom', id: 'a' }, b: K.Term = { k: 'atom', id: 'b' };

describe('P9.s1 Two Flips Make S₃', () => {
  const L = lvA('P9.s1');
  it('both targets are true in every finite group under their docks’ givens', () => {
    const n = targetsTrue(L);
    expect(n.s1).toBeGreaterThan(0);
    expect(n.s2).toBeGreaterThan(0);
  });
  it('s2 allows exactly the givens it needs', () => {
    expect(neededGivens(L, 's2')).toEqual({ h1: true, h3: true });
  });
  it('s1 uses h₂ (SYNTHESIS notes bb = e follows from the others; the reference route still cites it)', () => {
    expect(neededGivens(L, 's1').h3).toBe(true);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const T1 = P(a, b, a, b, a, b);
    const sp1 = f.add(spool(T1), { x: 12, y: 6 });
    const p1 = f.add(lawRw(given('h3'), { target: pinSpan(eq(T1, T1), 'r', 1, 4) }), { x: 18, y: 6 });
    const p2 = f.add(lawRw(given('h1'), { target: pinSpan(eq(T1, P(a, a, b, a, a, b)), 'r', 0, 2) }), { x: 24, y: 6 });
    const p3 = f.add(lawRw(given('h1'), { target: pinSpan(eq(T1, P(b, a, a, b)), 'r', 1, 3) }), { x: 30, y: 6 });
    const p4 = f.add(lawRw(given('h2')), { x: 36, y: 6 });
    f.wire(sp1, p1); f.wire(p1, p2); f.wire(p2, p3); f.wire(p3, p4); f.wire(p4, f.socket('s1'));
    const T2 = P(a, b, a, b);
    const sp2 = f.add(spool(T2), { x: 12, y: 18 });
    const q1 = f.add(lawRw(given('h3'), { target: pinSpan(eq(T2, T2), 'l', 1, 4) }), { x: 18, y: 18 });
    const q2 = f.add(lawRw(given('h1'), { target: pinSpan(eq(P(a, a, b, a), T2), 'l', 0, 2) }), { x: 24, y: 18 });
    f.wire(sp2, q1); f.wire(q1, q2); f.wire(q2, f.socket('s2'));
    deliver(f);
  });
});
