// P16.s2 Splitting an Element — Book world 14 (side). |G| = 6. Pow nodes; the press in its power shape.
//  s1: Spool x₁ → power.one backwards (x₁¹) → power.add backwards (m = 3, n = −2): x₁ = x₁³x₁⁻².
//  s2: Spool (x₁³)² → power.multiply → Lagrange (x₁⁶ ⟶ e).
//  s3: Spool (x₁⁻²)³ → power.multiply (x₁⁻⁶) → power.multiply backwards (m = 6, n = −1: (x₁⁶)⁻¹) → Lagrange → power.identity.
import { describe, expect, it } from 'vitest';
import { E, bookFloor, deliver, eq, intKnob, lawRw, lvA, neededGivens, pinSpan, pw, spool, targetsTrue, tower, x1, Zc } from './kit-wA';
import { EARNED, schema } from './lemmas-w123';

describe('P16.s2 Splitting an Element', () => {
  const L = lvA('P16.s2');
  it('all three targets are true in every group of order 6 (s2 and s3 need the size)', () => {
    const n = targetsTrue(L);
    for (const id of ['s1', 's2', 's3']) expect(n[id], id).toBeGreaterThan(0);
    expect(neededGivens(L, 's2')).toEqual({ s: true });
    expect(neededGivens(L, 's3')).toEqual({ s: true });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 50 });
    // s1
    const sp1 = f.add(spool(x1), { x: 22, y: 4 });
    const o1 = f.add(lawRw(schema('power.one'), { dir: 'rev', target: pinSpan(eq(x1, x1), 'r', 0, 1) }), { x: 28, y: 4 });
    const ad = f.add(lawRw(schema('power.add'), { dir: 'rev', values: { m: intKnob(Zc(3)), n: intKnob(Zc(-2)) } }), { x: 34, y: 4 });
    const al1 = f.add({ kind: 'forall' }, { x: 42, y: 4 });
    f.wire(sp1, o1); f.wire(o1, ad); f.wire(ad, al1); f.wire(al1, f.socket('s1'));
    // s2
    const T2 = pw(pw(x1, Zc(3)), Zc(2));
    const sp2 = f.add(spool(T2), { x: 22, y: 14 });
    const mu = f.add(lawRw(schema('power.multiply'), { target: pinSpan(eq(T2, T2), 'r', 0, 1) }), { x: 28, y: 14 });
    const lg = f.add(lawRw({ k: 'lagrange' }), { x: 34, y: 14 });
    const al2 = f.add({ kind: 'forall' }, { x: 42, y: 14 });
    f.wire(sp2, mu); f.wire(mu, lg); f.wire(lg, al2); f.wire(al2, f.socket('s2'));
    // s3
    const T3 = pw(pw(x1, Zc(-2)), Zc(3));
    const sp3 = f.add(spool(T3), { x: 22, y: 24 });
    const m1 = f.add(lawRw(schema('power.multiply'), { target: pinSpan(eq(T3, T3), 'r', 0, 1) }), { x: 28, y: 24 });
    const m2 = f.add(lawRw(schema('power.multiply'), { dir: 'rev', values: { m: intKnob(Zc(6)), n: intKnob(Zc(-1)) } }), { x: 34, y: 24 });
    const lg2 = f.add(lawRw({ k: 'lagrange' }), { x: 40, y: 24 });
    const idn = f.add(lawRw(schema('power.identity')), { x: 46, y: 24 });
    const al3 = f.add({ kind: 'forall' }, { x: 52, y: 24 });
    f.wire(sp3, m1); f.wire(m1, m2); f.wire(m2, lg2); f.wire(lg2, idn); f.wire(idn, al3); f.wire(al3, f.socket('s3'));
    void E;
    deliver(f);
  }, 120_000);
});
