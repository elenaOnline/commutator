// P3.1 Three Rules — Book world 1. Pre-placed Spool a⁻¹ab → Rewriter (cancel) → dock.
import { describe, expect, it } from 'vitest';
import { bookFloor, cancel, deliver, lv, targetsTrue } from './kit-w123';

describe('P3.1 Three Rules', () => {
  const L = lv('P3.1');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution: the pre-placed Spool, one cancel, the dock', () => {
    const f = bookFloor(L);
    const spool = f.c.machines.find((m) => m.kind === 'spool')!;
    expect(spool.locked).toBe(true);
    const can = f.add(cancel(), { x: 6, y: 3 });
    f.wire(spool.id, can); f.wire(can, f.socket());
    deliver(f);
  });
});
