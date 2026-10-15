// P4.6 Solve for d (Pinter 4.A2) — Book world 3. Given ddb = da⁻¹c; open dock `d = ?`.
// Left cancellation with u = d, v = db, w = a⁻¹c (the unknown itself cancels) → db = a⁻¹c → × b⁻¹ on the right, cancel →
// d = a⁻¹cb⁻¹.
import { describe, expect, it } from 'vitest';
import { I, P, a, b, bookFloor, c, cancel, deliver, dockAnswer, eq, lv, mult, spool, targetsTrue, thm } from './kit-w123';
import { EARNED, kn, schema } from './lemmas-w123';
import type * as K from '../../src/kernel';

const d: K.Term = { k: 'atom', id: 'd' };

describe('P4.6 Solve for d', () => {
  const L = lv('P4.6');
  it('the dock is open and the answer is true in every finite group satisfying the given', () => {
    expect(L.sockets[0]!.holes).toEqual([{ id: 'h', notMentioning: ['d'] }]);
    expect(targetsTrue(L, { s: eq(d, P(I(a), c, I(b))) }).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const t = f.add(thm(schema('cancel'), 0, { u: kn(d), v: kn(P(d, b)), w: kn(P(I(a), c)) }));
    const m = f.add(mult('right', I(b)));
    const cn = f.add(cancel());
    f.wire(f.given('h'), t, 'p0'); f.wire(t, m); f.wire(m, cn); f.wire(cn, f.socket());
    const { comp } = deliver(f);
    expect(dockAnswer(comp, 's', L)).toBe('d = a⁻¹cb⁻¹');
  });
  it('a bare Spool of the unknown does not fill the open dock', () => {
    const f = bookFloor(L, EARNED);
    const sp = f.add(spool(d));
    f.wire(sp, f.socket());
    expect(f.compile().solvable).toBe(false);
  });
});
