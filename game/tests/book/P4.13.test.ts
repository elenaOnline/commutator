// P4.13 Across the Seams — Book world 3. Spool (dad)³ → h at the span across the first two seams → cancel aa⁻¹ → h again.
import { describe, expect, it } from 'vitest';
import { P, a, bookFloor, cancel, deliver, eq, lawRw, lv, pinSpan, spool, targetsTrue } from './kit-w123';
import { EARNED, given } from './lemmas-w123';
import type * as K from '../../src/kernel';

const d: K.Term = { k: 'atom', id: 'd' };

describe('P4.13 Across the Seams', () => {
  const L = lv('P4.13');
  it('the target is true in every finite group satisfying the given', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const T = P(d, a, d, d, a, d, d, a, d);
    const sp = f.add(spool(T));
    const r1 = f.add(lawRw(given('h'), { target: pinSpan(eq(T, T), 'r', 2, 6) }));
    const cn = f.add(cancel());
    const r2 = f.add(lawRw(given('h')));
    f.wire(sp, r1); f.wire(r1, cn); f.wire(cn, r2); f.wire(r2, f.socket());
    deliver(f);
  });
});
