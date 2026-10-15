// P3.3 When Every Square Is e — Book world 1. Spool ba; H backwards at the two ends (x = a, x = b) so the rail reads
// a·abab·b; H forwards at x = ab turns abab into e; the e is absorbed: ba = ab.
import { describe, expect, it } from 'vitest';
import { P, a, b, bookFloor, deliver, eq, lawRw, lv, pinGap, pinSpan, spool, targetsTrue } from './kit-w123';
import type * as K from '../../src/kernel';

const kn = (t: K.Term) => ({ k: 'knob', term: t } as const);

describe('P3.3 When Every Square Is e', () => {
  const L = lv('P3.3');
  it('the target is true in every finite group satisfying H', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution: three uses of H, at x = a, x = b and x = ab', () => {
    const f = bookFloor(L);
    const H = { k: 'given', givenId: 'H' } as const;
    const sp = f.add(spool(P(b, a)));
    const r1 = f.add(lawRw(H, { dir: 'rev', values: { x: kn(a) }, gap: pinGap(eq(P(b, a), P(b, a)), 'r', 0) }));
    const r2 = f.add(lawRw(H, { dir: 'rev', values: { x: kn(b) }, gap: pinGap(eq(P(b, a), P(a, a, b, a)), 'r', 4) }));
    const r3 = f.add(lawRw(H, { values: { x: kn(P(a, b)) }, target: pinSpan(eq(P(b, a), P(a, a, b, a, b, b)), 'r', 1, 5) }));
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, r3); f.wire(r3, f.socket());
    deliver(f);
  });
});
