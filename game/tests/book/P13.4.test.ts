// P13.4 Ten Elements — Book world 11. Words.
//  A: Spool b → h₁ backwards at the end gap (b = baa) → ba ⟶ abb three times (h₃) → aa ⟶ e (h₁): b = bbbb.
//  B: A × b on the left (bb = bbbbb) → bbbbb ⟶ e (h₂), right rail: bb = e.
//  C: A with bb ⟶ e (B, routed) twice, right rail: b = e.
import { describe, expect, it } from 'vitest';
import { E, P, a, b, bookFloor, deliver, eq, lawRw, lvA, mult, neededGivens, pinGap, pinSpan, routed, spool, targetsTrue } from './kit-wA';
import { EARNED, given } from './lemmas-w123';

describe('P13.4 Ten Elements', () => {
  const L = lvA('P13.4');
  it('the target is true in every group under the givens, and every given is needed (without aa = e it fails in Z₅ ⋊ Z₄, beyond the catalogue)', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    const need = neededGivens(L, 's');
    expect(need.h2).toBe(true);
    expect(need.h3).toBe(true);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const sp = f.add(spool(b), { x: 22, y: 6 });
    const g1 = f.add(lawRw(given('h1'), { dir: 'rev', gap: pinGap(eq(b, b), 'r', 1) }), { x: 28, y: 6 });
    const k1 = f.add(lawRw(given('h3'), { target: pinSpan(eq(b, P(b, a, a)), 'r', 0, 2) }), { x: 34, y: 6 });
    const k2 = f.add(lawRw(given('h3'), { target: pinSpan(eq(b, P(a, b, b, a)), 'r', 2, 4) }), { x: 40, y: 6 });
    const k3 = f.add(lawRw(given('h3'), { target: pinSpan(eq(b, P(a, b, a, b, b)), 'r', 1, 3) }), { x: 46, y: 6 });
    const k4 = f.add(lawRw(given('h1'), { target: pinSpan(eq(b, P(a, a, b, b, b, b)), 'r', 0, 2) }), { x: 52, y: 6 });
    f.wire(sp, g1); f.wire(g1, k1); f.wire(k1, k2); f.wire(k2, k3); f.wire(k3, k4);
    const m = f.add(mult('left', b), { x: 58, y: 14 });
    const n1 = f.add(lawRw(given('h2'), { target: pinSpan(eq(P(b, b), P(b, b, b, b, b)), 'r', 0, 5) }), { x: 64, y: 14 });
    f.wire(k4, m); f.wire(m, n1);
    const c1 = f.add(routed({ target: pinSpan(eq(b, P(b, b, b, b)), 'r', 0, 2) }), { x: 58, y: 22 });
    const c2 = f.add(routed({ target: pinSpan(eq(b, P(b, b)), 'r', 0, 2) }), { x: 64, y: 22 });
    f.wire(k4, c1); f.wire(n1, c1, 'rule'); f.wire(c1, c2); f.wire(n1, c2, 'rule'); f.wire(c2, f.socket());
    void E;
    deliver(f);
  });
});
