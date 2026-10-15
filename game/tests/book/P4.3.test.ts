// P4.3 Undoing From One Side — Book world 2. Given ab = e → e read as aa⁻¹ on the right rail (inverse rule backwards) →
// pop the leftover e → Theorem: cancellation (u = a) → b = a⁻¹. Earns unique inverse.
import { describe, expect, it } from 'vitest';
import { E, I, P, a, b, bookFloor, deliver, eq, lawRw, lv, pinGap, pop, targetsTrue, thm } from './kit-w123';

describe('P4.3 Undoing From One Side', () => {
  const L = lv('P4.3');
  it('the target is true in every finite group satisfying the given', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('earns unique inverse and starts with cancellation only', () => {
    expect(L.unlocks).toEqual(['witness']);
    expect(L.tools.schemas).toEqual(['cancel']);
  });
  it('reference solution: invert-rule backwards, pop, cancellation as a Theorem', () => {
    const f = bookFloor(L, ['cancel']);
    const r = f.add(lawRw({ k: 'axiom', id: 'invR' }, { dir: 'rev', values: { x: { k: 'knob', term: a } }, gap: pinGap(eq(P(a, b), E), 'r', 0) }));
    const po = f.add(pop());
    const t = f.add(thm({ k: 'schema', id: 'cancel' }));
    f.wire(f.given('h'), r); f.wire(r, po); f.wire(po, t, 'p0'); f.wire(t, f.socket());
    deliver(f);
    void I;
  });
  it('the Theorem machine cannot yet use unique inverse (it is what this order proves)', () => {
    const f = bookFloor(L, ['cancel', 'witness']);
    expect(f.ctx.level.tools.schemas).not.toContain('witness');
  });
});
