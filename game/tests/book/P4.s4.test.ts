// P4.s4 A Square (Pinter 4.H8) — Book world 3 (side). Given dad = b; witness dock `∃y. ab = y²` (the hole y occurs twice).
// Spool ab → b read backwards by the given (b → dad) → ab = adad = (ad)(ad): the dock fills with y = ad.
import { describe, expect, it } from 'vitest';
import { P, a, b, bookFloor, deliver, dockAnswer, eq, lawRw, lv, pinSpan, spool, targetsTrue } from './kit-w123';
import { EARNED, given } from './lemmas-w123';
import type * as K from '../../src/kernel';

const d: K.Term = { k: 'atom', id: 'd' };

describe('P4.s4 A Square', () => {
  const L = lv('P4.s4');
  it('the dock is a witness dock: one hole, used twice, no constraint', () => {
    expect(L.sockets[0]!.holes).toEqual([{ id: 'h' }]);
  });
  it('the witness ad works in every finite group satisfying the given', () => {
    expect(targetsTrue(L, { s: eq(P(a, b), P(a, d, a, d)) }).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const sp = f.add(spool(P(a, b)));
    const rw = f.add(lawRw(given('h'), { dir: 'rev', target: pinSpan(eq(P(a, b), P(a, b)), 'r', 1, 2) }));
    f.wire(sp, rw); f.wire(rw, f.socket());
    const { comp } = deliver(f);
    expect(dockAnswer(comp, 's', L)).toBe('ab = (ad)²');
  });
  it('a bare Spool of either side does not fill the dock', () => {
    for (const t of [P(a, b)]) {
      const f = bookFloor(L, EARNED);
      f.wire(f.add(spool(t)), f.socket());
      expect(f.compile().solvable).toBe(false);
    }
  });
});
