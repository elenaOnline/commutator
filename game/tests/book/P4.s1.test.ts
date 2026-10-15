// P4.s1 Two Equations (Pinter 4.A3) — Book world 3 (side). Givens dda = bdc⁻¹ and acd = dac.
// h₁ × c on the right, cancel → ddac = bd → h₂ backwards at dac (→ acd) → dacd = bd → right cancellation (u = d) → dac = b
// → × c⁻¹a⁻¹ on the right, cancel twice → d = bc⁻¹a⁻¹.
// Open dock `d = ?`: the dock reports d = bc⁻¹a⁻¹ once filled.
import { describe, expect, it } from 'vitest';
import { I, P, a, b, bookFloor, c, cancel, deliver, dockAnswer, eq, lawRw, lv, mult, pinSpan, targetsTrue, thm } from './kit-w123';
import { EARNED, given, schema } from './lemmas-w123';
import type * as K from '../../src/kernel';

const d: K.Term = { k: 'atom', id: 'd' };

describe('P4.s1 Two Equations', () => {
  const L = lv('P4.s1');
  it('the dock is open and the answer is true in every finite group satisfying the givens', () => {
    expect(L.sockets[0]!.holes).toEqual([{ id: 'h', notMentioning: ['d'] }]);
    expect(targetsTrue(L, { s: eq(d, P(b, I(c), I(a))) }).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const m1 = f.add(mult('right', c));
    const c1 = f.add(cancel());
    const r2 = f.add(lawRw(given('h2'), { dir: 'rev', target: pinSpan(eq(P(d, d, a, c), P(b, d)), 'l', 1, 4) }));
    const t = f.add(thm(schema('cancel', true)));
    const m2 = f.add(mult('right', P(I(c), I(a))));
    const c2 = f.add(cancel());
    const c3 = f.add(cancel());
    f.wire(f.given('h1'), m1); f.wire(m1, c1); f.wire(c1, r2); f.wire(r2, t, 'p0'); f.wire(t, m2); f.wire(m2, c2); f.wire(c2, c3); f.wire(c3, f.socket());
    const { comp } = deliver(f);
    expect(dockAnswer(comp, 's', L)).toBe('d = bc⁻¹a⁻¹');
  });
});
