// P5.s1 A Repeat Among Powers — Book world 4 (side). h: a⁵ = a² → insert e on the left of a² → right cancellation (u = aa) → a³ = e
// → unique inverse (u = a, v = aa) → aa = a⁻¹ → swap.
import { describe, expect, it } from 'vitest';
import { P, a, bookFloor, deliver, eq, insertE, lvA, neededGivens, op, pinGap, targetsTrue, thm } from './kit-wA';
import { EARNED, kn, schema } from './lemmas-w123';

describe('P5.s1 A Repeat Among Powers', () => {
  const L = lvA('P5.s1');
  it('the target is true in every finite group under h, and h is needed', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ h: true });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const lhs = P(a, a, a, a, a);
    const ie = f.add(insertE(pinGap(eq(lhs, P(a, a)), 'r', 0)), { x: 14, y: 8 });
    const rc = f.add(thm(schema('cancel', true), 1), { x: 22, y: 8 }); // the second cut: u = aa, v = aaa, w = e
    const ui = f.add(thm(schema('witness'), 0, { u: kn(a), v: kn(P(a, a)) }), { x: 30, y: 8 });
    const sw = f.add(op({ k: 'swap' }), { x: 38, y: 8 });
    f.wire(f.given('h'), ie); f.wire(ie, rc, 'p0'); f.wire(rc, ui, 'p0'); f.wire(ui, sw); f.wire(sw, f.socket());
    deliver(f);
  });
});
