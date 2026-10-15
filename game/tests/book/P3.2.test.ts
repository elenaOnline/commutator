// P3.2 Its Own Inverse — Book world 1. Spool a⁻¹ → H backwards at a gap (e → aa, x = a) → cancel a⁻¹a → a⁻¹ = a.
import { describe, expect, it } from 'vitest';
import { bookFloor, cancel, deliver, eq, I, a, lawRw, lv, pinGap, spool, targetsTrue } from './kit-w123';

describe('P3.2 Its Own Inverse', () => {
  const L = lv('P3.2');
  it('the target is true in every finite group satisfying H', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution: Spool, H read backwards, cancel', () => {
    const f = bookFloor(L);
    const sp = f.add(spool(I(a)));
    const h = f.add(lawRw({ k: 'given', givenId: 'H' }, { dir: 'rev', values: { x: { k: 'knob', term: a } }, gap: pinGap(eq(I(a), I(a)), 'r', 1) }));
    const can = f.add(cancel());
    f.wire(sp, h); f.wire(h, can); f.wire(can, f.socket());
    deliver(f);
  });
});
