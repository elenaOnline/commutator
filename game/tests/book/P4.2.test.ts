// P4.2 Cancellation — Book world 2. Given ab = ac → multiply left by a⁻¹ → cancel on each rail → b = c. Earns cancellation.
import { describe, expect, it } from 'vitest';
import { I, a, bookFloor, cancel, deliver, lv, mult, targetsTrue } from './kit-w123';

describe('P4.2 Cancellation', () => {
  const L = lv('P4.2');
  it('the target is true in every finite group satisfying the given', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('earns cancellation, and the level cannot use it on itself', () => {
    expect(L.unlocks).toEqual(['cancel']);
    const f = bookFloor(L, ['cancel']);
    expect(f.ctx.level.tools.schemas).not.toContain('cancel');
  });
  it('reference solution: multiply by a⁻¹, cancel, cancel', () => {
    const f = bookFloor(L);
    const m = f.add(mult('left', I(a)));
    const c1 = f.add(cancel());
    const c2 = f.add(cancel());
    f.wire(f.given('h'), m); f.wire(m, c1); f.wire(c1, c2); f.wire(c2, f.socket());
    deliver(f);
  });
});
