// P4.12 Four Elements — Book world 3. Three Suppose rooms.
//  s1: suppose ab = a → insert e (ab = ae) → cancellation → b = e; clash with b ≠ e.
//  s2: suppose ab = b → insert e (ab = eb) → right cancellation → a = e; clash with a ≠ e.
//  s3: suppose ab = e → unique inverse: b = a⁻¹; H gives aa = e → a = a⁻¹; chain: b = a; clash with a ≠ b.
import { describe, expect, it } from 'vitest';
import { E, P, a, b, bookFloor, deliver, eq, insertE, join, lawRw, lv, pinGap, spool, targetsTrue, thm } from './kit-w123';
import { EARNED, given, kn, schema } from './lemmas-w123';

describe('P4.12 Four Elements', () => {
  const L = lv('P4.12');
  it('all three targets are true in every finite group under the givens', () => {
    const n = targetsTrue(L);
    for (const id of ['s1', 's2', 's3']) expect(n[id], id).toBeGreaterThan(0);
  });
  it('opens the Suppose room and the Joiner', () => {
    expect(L.tools.suppose).toBe(true);
    expect(L.tools.merge).toBe(true);
    expect(L.tools.classical).toBe(false);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const r1 = f.room({ x: 18, y: 4, w: 30, h: 10 }, 'suppose', P(a, b), a);
    const i1 = f.add(insertE(pinGap(eq(P(a, b), a), 'r', 1)), { x: 20, y: 8 });
    const t1 = f.add(thm(schema('cancel'), 0, { u: kn(a), v: kn(b), w: kn(E) }), { x: 26, y: 8 });
    const k1 = f.add(join({ k: 'clash' }), { x: 33, y: 8 });
    f.wire(r1.desk, i1); f.wire(i1, t1, 'p0'); f.wire(t1, k1, 'a'); f.wire(f.given('nb'), k1, 'b'); f.wire(k1, r1.gate); f.wire(r1.gate, f.socket('s1'));

    const r2 = f.room({ x: 18, y: 18, w: 30, h: 10 }, 'suppose', P(a, b), b);
    const i2 = f.add(insertE(pinGap(eq(P(a, b), b), 'r', 0)), { x: 20, y: 22 });
    const t2 = f.add(thm(schema('cancel', true), 0, { u: kn(b), v: kn(a), w: kn(E) }), { x: 26, y: 22 });
    const k2 = f.add(join({ k: 'clash' }), { x: 33, y: 22 });
    f.wire(r2.desk, i2); f.wire(i2, t2, 'p0'); f.wire(t2, k2, 'a'); f.wire(f.given('na'), k2, 'b'); f.wire(k2, r2.gate); f.wire(r2.gate, f.socket('s2'));

    const r3 = f.room({ x: 18, y: 32, w: 44, h: 14 }, 'suppose', P(a, b), E);
    const w1 = f.add(thm(schema('witness')), { x: 20, y: 34 });
    const sp = f.add(spool(P(a, a)), { x: 20, y: 40 });
    const rh = f.add(lawRw(given('H')), { x: 26, y: 40 });
    const w2 = f.add(thm(schema('witness')), { x: 32, y: 40 });
    const ch = f.add(join({ k: 'chain' }), { x: 40, y: 36 });
    const k3 = f.add(join({ k: 'clash' }), { x: 48, y: 36 });
    f.wire(r3.desk, w1, 'p0'); f.wire(sp, rh); f.wire(rh, w2, 'p0'); f.wire(w1, ch, 'a'); f.wire(w2, ch, 'b');
    f.wire(ch, k3, 'a'); f.wire(f.given('nab'), k3, 'b'); f.wire(k3, r3.gate); f.wire(r3.gate, f.socket('s3'));
    deliver(f);
  });
});
