// P5.5 The Quaternion Relations — Book world 4.
//  s1: Spool bbbb → bb ⟶ aa (h₂ backwards, twice) → a⁴ → e (h₁).
//  s2: Spool abab → ba ⟶ abbb (h₃) → s1's fact (routed) on bbbb → (the rewrite tidies the e).
import { describe, expect, it } from 'vitest';
import { P, a, b, bookFloor, deliver, eq, lawRw, lvA, neededGivens, pinSpan, routed, spool, targetsTrue } from './kit-wA';
import { EARNED, given } from './lemmas-w123';

describe('P5.5 The Quaternion Relations', () => {
  const L = lvA('P5.5');
  it('both targets are true in every finite group under their docks’ givens', () => {
    const n = targetsTrue(L);
    expect(n.s1).toBeGreaterThan(0);
    expect(n.s2).toBeGreaterThan(0);
  });
  it('s1 needs h₁ and h₂ (the catalogue shows it)', () => {
    expect(neededGivens(L, 's1')).toEqual({ h1: true, h2: true });
  });
  it('reference solution; s2 routes the fact delivered at s1', () => {
    const f = bookFloor(L, EARNED);
    const T1 = P(b, b, b, b);
    const sp1 = f.add(spool(T1), { x: 12, y: 6 });
    const u1 = f.add(lawRw(given('h2'), { dir: 'rev', target: pinSpan(eq(T1, T1), 'r', 0, 2) }), { x: 18, y: 6 });
    const u2 = f.add(lawRw(given('h2'), { dir: 'rev', target: pinSpan(eq(T1, P(a, a, b, b)), 'r', 2, 4) }), { x: 24, y: 6 });
    const u3 = f.add(lawRw(given('h1')), { x: 30, y: 6 });
    f.wire(sp1, u1); f.wire(u1, u2); f.wire(u2, u3); f.wire(u3, f.socket('s1'));
    const T2 = P(a, b, a, b);
    const sp2 = f.add(spool(T2), { x: 12, y: 18 });
    const v1 = f.add(lawRw(given('h3'), { target: pinSpan(eq(T2, T2), 'r', 1, 3) }), { x: 18, y: 18 });
    const v2 = f.add(routed({ target: pinSpan(eq(T2, P(a, a, b, b, b, b)), 'r', 2, 6) }), { x: 26, y: 18 });
    f.wire(sp2, v1); f.wire(v1, v2); f.wire(u3, v2, 'rule'); f.wire(v2, f.socket('s2'));
    deliver(f);
  });
});
