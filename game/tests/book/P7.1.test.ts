// P7.1 Symmetries of the Square — Book world 6.
//  s1: Spool frfr → fr ⟶ rrrf (h₃) → ff ⟶ e (h₂) → rrrr ⟶ e (h₁), on the right rail.
//  s2: Spool frr → fr ⟶ rrrf twice (h₃) → rrrr ⟶ e (h₁), on the left rail.
// r⁴ = e is essential. Without it both docks fail in the semidihedral group SD₁₆ (order 16, beyond the oracle's catalogue), so
// the oracle cannot see the omission: the reference solution is the proof of solvability.
import { describe, expect, it } from 'vitest';
import { P, bookFloor, deliver, eq, lawRw, lvA, neededGivens, pinSpan, spool, targetsTrue } from './kit-wA';
import { EARNED, given } from './lemmas-w123';
import type * as K from '../../src/kernel';

const r: K.Term = { k: 'atom', id: 'r' }, f: K.Term = { k: 'atom', id: 'f' };

describe('P7.1 Symmetries of the Square', () => {
  const L = lvA('P7.1');
  it('both targets are true in every finite group under their docks’ givens', () => {
    const n = targetsTrue(L);
    expect(n.s1).toBeGreaterThan(0);
    expect(n.s2).toBeGreaterThan(0);
  });
  it('the catalogue (order ≤ 8) shows h₂ and h₃ needed for s1. It cannot see the rest: every group of order ≤ 8 has r² central, so s2 holds there with no relation at all beyond r⁴ = e', () => {
    expect(neededGivens(L, 's1')).toMatchObject({ h2: true, h3: true });
  });
  it('reference solution', () => {
    const fl = bookFloor(L, EARNED);
    const T1 = P(f, r, f, r);
    const sp1 = fl.add(spool(T1), { x: 12, y: 6 });
    const a1 = fl.add(lawRw(given('h3'), { target: pinSpan(eq(T1, T1), 'r', 0, 2) }), { x: 18, y: 6 });
    const a2 = fl.add(lawRw(given('h2'), { target: pinSpan(eq(T1, P(r, r, r, f, f, r)), 'r', 3, 5) }), { x: 24, y: 6 });
    const a3 = fl.add(lawRw(given('h1')), { x: 30, y: 6 });
    fl.wire(sp1, a1); fl.wire(a1, a2); fl.wire(a2, a3); fl.wire(a3, fl.socket('s1'));
    const T2 = P(f, r, r);
    const sp2 = fl.add(spool(T2), { x: 12, y: 18 });
    const b1 = fl.add(lawRw(given('h3'), { target: pinSpan(eq(T2, T2), 'l', 0, 2) }), { x: 18, y: 18 });
    const b2 = fl.add(lawRw(given('h3'), { target: pinSpan(eq(P(r, r, r, f, r), T2), 'l', 3, 5) }), { x: 24, y: 18 });
    const b3 = fl.add(lawRw(given('h1'), { target: pinSpan(eq(P(r, r, r, r, r, r, f), T2), 'l', 0, 4) }), { x: 30, y: 18 });
    fl.wire(sp2, b1); fl.wire(b1, b2); fl.wire(b2, b3); fl.wire(b3, fl.socket('s2'));
    deliver(fl);
  });
});
