// P4.s2 A Surprising Answer — Book world 3 (side). Givens dd = aa and d⁵ = e (written out as ddddd).
// Spool d → h₂ backwards at the right end (d = d·ddddd = d⁶) → dd → aa three times: d = a⁶.
// Open dock `d = ?`: the dock reports d = a⁶ once filled.
import { describe, expect, it } from 'vitest';
import { P, a, bookFloor, deliver, dockAnswer, eq, lawRw, lv, pinGap, spool, targetsTrue } from './kit-w123';
import { EARNED, given } from './lemmas-w123';
import type * as K from '../../src/kernel';

const d: K.Term = { k: 'atom', id: 'd' };

describe('P4.s2 A Surprising Answer', () => {
  const L = lv('P4.s2');
  it('the dock is open and the answer is true in every finite group satisfying the givens', () => {
    expect(L.sockets[0]!.holes).toEqual([{ id: 'h', notMentioning: ['d'] }]);
    expect(targetsTrue(L, { s: eq(d, P(a, a, a, a, a, a)) }).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const sp = f.add(spool(d));
    const grow = f.add(lawRw(given('h2'), { dir: 'rev', gap: pinGap(eq(d, d), 'r', 1) }));
    const w = [0, 1, 2].map(() => f.add(lawRw(given('h1'))));
    f.wire(sp, grow); f.wire(grow, w[0]!); f.wire(w[0]!, w[1]!); f.wire(w[1]!, w[2]!); f.wire(w[2]!, f.socket());
    const { comp } = deliver(f);
    expect(dockAnswer(comp, 's', L)).toBe('d = a⁶');
  });
});
