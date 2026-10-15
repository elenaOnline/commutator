// P13.3 Eight Elements — Book world 11. Words. Spool baa → ba ⟶ aab twice (h₂) → aaaa ⟶ e (h₁): baa = b (right rail).
// → insert e at the end of the right rail: baa = be → left cancellation (u = b, v = aa, w = e): aa = e.
import { describe, expect, it } from 'vitest';
import { E, P, a, b, bookFloor, deliver, eq, insertE, lawRw, lvA, neededGivens, pinGap, pinSpan, spool, targetsTrue, thm } from './kit-wA';
import { EARNED, given, kn, schema } from './lemmas-w123';

describe('P13.3 Eight Elements', () => {
  const L = lvA('P13.3');
  it('the target is true in every group under the givens, and both givens are needed (the unneeded bb = e is gone)', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ h1: true, h2: true });
    expect(L.givens.map((g) => g.id)).toEqual(['h1', 'h2']);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const T = P(b, a, a);
    const sp = f.add(spool(T), { x: 22, y: 6 });
    const r1 = f.add(lawRw(given('h2'), { target: pinSpan(eq(T, T), 'r', 0, 2) }), { x: 28, y: 6 });
    const r2 = f.add(lawRw(given('h2'), { target: pinSpan(eq(T, P(a, a, b, a)), 'r', 2, 4) }), { x: 34, y: 6 });
    const r3 = f.add(lawRw(given('h1')), { x: 40, y: 6 });
    const ie = f.add(insertE(pinGap(eq(T, b), 'r', 1)), { x: 46, y: 6 });
    const cn = f.add(thm(schema('cancel'), 0, { u: kn(b), v: kn(P(a, a)), w: kn(E) }), { x: 52, y: 6 });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, r3); f.wire(r3, ie); f.wire(ie, cn, 'p0'); f.wire(cn, f.socket());
    deliver(f);
  });
});
