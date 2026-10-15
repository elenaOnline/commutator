// P5.2 The Centre — Book world 4. Three docks.
//  s1: Tower x₁ · Spool x₁ → insert e on the left of the left rail, on the right of the right rail → ∀.
//  s2: Spool abx₁ → Hb on bx₁ → Ha on ax₁ (right rail) → ∀.
//  s3: Spool ax₁ → Ha on the right rail → × a⁻¹ on the left → cancel → × a⁻¹ on the right → cancel → swap → ∀.
import { describe, expect, it } from 'vitest';
import { E, I, P, a, b, bookFloor, cancel, deliver, eq, insertE, lawRw, lvA, mult, neededGivens, op, pinGap, pinSpan, spool, targetsTrue, tower, x1 } from './kit-wA';
import { EARNED, given, kn } from './lemmas-w123';

describe('P5.2 The Centre', () => {
  const L = lvA('P5.2');
  it('all three targets are true in every finite group under their docks’ givens', () => {
    const n = targetsTrue(L);
    for (const id of ['s1', 's2', 's3']) expect(n[id], id).toBeGreaterThan(0);
  });
  it('each dock allows exactly the givens it needs', () => {
    expect(L.sockets.map((s) => s.allowedGivens)).toEqual([[], ['Ha', 'Hb'], ['Ha']]);
    for (const id of ['s2', 's3']) expect(neededGivens(L, id), id).toEqual(Object.fromEntries(L.sockets.find((s) => s.id === id)!.allowedGivens.map((g) => [g, true])));
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 50 });
    // s1
    const s1 = f.add(spool(x1), { x: 20, y: 4 });
    const i1 = f.add(insertE(pinGap(eq(x1, x1), 'l', 0)), { x: 26, y: 4 });
    const i2 = f.add(insertE(pinGap(eq(P(E, x1), x1), 'r', 1)), { x: 32, y: 4 });
    const a1 = f.add({ kind: 'forall' }, { x: 38, y: 4 });
    f.wire(s1, i1); f.wire(i1, i2); f.wire(i2, a1); f.wire(a1, f.socket('s1'));
    // s2
    const s2 = f.add(spool(P(a, b, x1)), { x: 20, y: 16 });
    const r1 = f.add(lawRw({ k: 'given', givenId: 'Hb' }, { target: pinSpan(eq(P(a, b, x1), P(a, b, x1)), 'r', 1, 3) }), { x: 26, y: 16 });
    const r2 = f.add(lawRw({ k: 'given', givenId: 'Ha' }, { target: pinSpan(eq(P(a, b, x1), P(a, x1, b)), 'r', 0, 2) }), { x: 32, y: 16 });
    const a2 = f.add({ kind: 'forall' }, { x: 38, y: 16 });
    f.wire(s2, r1); f.wire(r1, r2); f.wire(r2, a2); f.wire(a2, f.socket('s2'));
    // s3
    const s3 = f.add(spool(P(a, x1)), { x: 20, y: 28 });
    const q1 = f.add(lawRw({ k: 'given', givenId: 'Ha' }, { target: pinSpan(eq(P(a, x1), P(a, x1)), 'r', 0, 2) }), { x: 26, y: 28 });
    const m1 = f.add(mult('left', I(a)), { x: 32, y: 28 });
    const c1 = f.add(cancel(), { x: 38, y: 28 });
    const m2 = f.add(mult('right', I(a)), { x: 44, y: 28 });
    const c2 = f.add(cancel(pinSpan(eq(P(x1, I(a)), P(I(a), x1, a, I(a))), 'r', 2, 4)), { x: 50, y: 28 });
    const sw = f.add(op({ k: 'swap' }), { x: 56, y: 28 });
    const a3 = f.add({ kind: 'forall' }, { x: 62, y: 28 });
    f.wire(s3, q1); f.wire(q1, m1); f.wire(m1, c1); f.wire(c1, m2); f.wire(m2, c2); f.wire(c2, sw); f.wire(sw, a3); f.wire(a3, f.socket('s3'));
    void kn;
    deliver(f);
  });
});
