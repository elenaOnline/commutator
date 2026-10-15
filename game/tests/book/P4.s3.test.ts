// P4.s3 The Hardest Equation — Book world 3 (side). Givens (dad)³ = bd and dda = (da)⁻¹.
// Derive R: h₂ with the inverse of a product (u = d, v = a) → dda = a⁻¹d⁻¹ → × d on the right, cancel → ddad = a⁻¹.
// Spool bd → h₁ backwards (bd = (dad)³) → R across the seams, cancel, R again → bd = a⁻¹ → × b⁻¹ on the left, cancel → d = b⁻¹a⁻¹.
// Open dock `d = ?`: the dock reports d = b⁻¹a⁻¹ once filled.
import { describe, expect, it } from 'vitest';
import { I, P, a, b, bookFloor, cancel, deliver, dockAnswer, eq, lawRw, lv, mult, pinSpan, routed, spool, targetsTrue } from './kit-w123';
import { EARNED, given, kn, schema } from './lemmas-w123';
import type * as K from '../../src/kernel';

const d: K.Term = { k: 'atom', id: 'd' };

describe('P4.s3 The Hardest Equation', () => {
  const L = lv('P4.s3');
  it('the dock is open and the answer is true in every finite group satisfying the givens', () => {
    expect(L.sockets[0]!.holes).toEqual([{ id: 'h', notMentioning: ['d'] }]);
    expect(targetsTrue(L, { s: eq(d, P(I(b), I(a))) }).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const sk = f.add(lawRw(schema('socks'), { values: { u: kn(d), v: kn(a) } }));
    const m1 = f.add(mult('right', d));
    const c1 = f.add(cancel());
    f.wire(f.given('h2'), sk); f.wire(sk, m1); f.wire(m1, c1);
    const sp = f.add(spool(P(b, d)));
    const u0 = f.add(lawRw(given('h1'), { dir: 'rev', target: pinSpan(eq(P(b, d), P(b, d)), 'r', 0, 2) }));
    const T = P(d, a, d, d, a, d, d, a, d);
    const q1 = f.add(routed({ target: pinSpan(eq(P(b, d), T), 'r', 2, 6) }));
    const cn = f.add(cancel());
    const q2 = f.add(routed());
    f.wire(sp, u0); f.wire(u0, q1); f.wire(c1, q1, 'rule'); f.wire(q1, cn); f.wire(cn, q2); f.wire(c1, q2, 'rule');
    const m2 = f.add(mult('left', I(b)));
    const c2 = f.add(cancel());
    f.wire(q2, m2); f.wire(m2, c2); f.wire(c2, f.socket());
    const { comp } = deliver(f);
    expect(dockAnswer(comp, 's', L)).toBe('d = b⁻¹a⁻¹');
  });
});
