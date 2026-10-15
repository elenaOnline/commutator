// P13.s1 Six Elements — Book world 11 (side). Words. Suppose ba = bb → left cancellation (u = b): a = b →
// a ⟶ b in h₁ twice (routed): bb = e → bb ⟶ e in h₂ (routed): b = e → clash with h₃ (b ≠ e) → gate: ba ≠ bb.
import { describe, expect, it } from 'vitest';
import { E, P, a, b, bookFloor, deliver, eq, join, lvA, neededGivens, pinSpan, routed, targetsTrue, thm } from './kit-wA';
import { EARNED, kn, schema } from './lemmas-w123';

describe('P13.s1 Six Elements', () => {
  const L = lvA('P13.s1');
  it('the target is true in every group under the givens, and all three are needed', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ h1: true, h2: true, h3: true });
  });
  it('the unneeded bb = e of the catalogue is not a given', () => {
    expect(L.givens.map((g) => g.name)).toEqual(['h₁', 'h₂', 'h₃']);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const r = f.room({ x: 22, y: 4, w: 46, h: 16 }, 'suppose', P(b, a), P(b, b));
    const cn = f.add(thm(schema('cancel'), 0, { u: kn(b), v: kn(a), w: kn(b) }), { x: 25, y: 8 });
    const x1 = f.add(routed({ target: pinSpan(eq(P(a, a), E), 'l', 0, 1) }), { x: 31, y: 8 });
    const x2 = f.add(routed({ target: pinSpan(eq(P(b, a), E), 'l', 1, 2) }), { x: 37, y: 8 });
    const y1 = f.add(routed({ target: pinSpan(eq(P(b, b, b), E), 'l', 0, 2) }), { x: 43, y: 8 });
    const k = f.add(join({ k: 'clash' }), { x: 49, y: 8 });
    f.wire(r.desk, cn, 'p0');
    f.wire(f.given('h1'), x1); f.wire(cn, x1, 'rule');
    f.wire(x1, x2); f.wire(cn, x2, 'rule');
    f.wire(f.given('h2'), y1); f.wire(x2, y1, 'rule');
    f.wire(y1, k, 'a'); f.wire(f.given('h3'), k, 'b'); f.wire(k, r.gate); f.wire(r.gate, f.socket());
    deliver(f);
  });
});
