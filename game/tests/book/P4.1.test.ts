// P4.1 Only One — Book world 2. s (introduces the Joiner): Spool e′e, computed two ways (H at x = e; identity) and chained. t: Spool c → h₂ backwards at the right
// end (c = c·ab) → h₁ on ca → c = b.
import { describe, expect, it } from 'vitest';
import { E, P, bookFloor, c, deliver, e1, eq, join, lawRw, lv, pinGap, pinSpan, pop, spool, targetsTrue } from './kit-w123';
import type * as K from '../../src/kernel';

const kn = (t: K.Term) => ({ k: 'knob', term: t } as const);

describe('P4.1 Only One', () => {
  const L = lv('P4.1');
  it('both targets are true in every finite group under their allowed givens', () => {
    const n = targetsTrue(L);
    expect(n.s).toBeGreaterThan(0);
    expect(n.t).toBeGreaterThan(0);
  });
  it('each dock admits only its own givens', () => {
    expect(L.sockets.map((s) => s.allowedGivens)).toEqual([['H'], ['h1', 'h2']]);
  });
  it('reference solution: e′ = e from H, and c = b from h₁ and h₂', () => {
    const f = bookFloor(L);
    // e′e computed two ways, then chained: e = e′e (H at x = e) and e′ = e′e (identity); both end in e′e.
    const ee = P(e1, E);
    const s0 = f.add(spool(ee));
    const viaH = f.add(lawRw({ k: 'given', givenId: 'H' }, { values: { x: kn(E) }, target: pinSpan(eq(ee, ee), 'l', 0, 2) }));
    const viaE = f.add(pop(pinSpan(eq(ee, ee), 'l', 1, 2)));
    const ch = f.add(join({ k: 'chain' }));
    f.wire(s0, viaH); f.wire(s0, viaE); f.wire(viaH, ch, 'a'); f.wire(viaE, ch, 'b'); f.wire(ch, f.socket('s'));
    const s1 = f.add(spool(c));
    const r2 = f.add(lawRw({ k: 'given', givenId: 'h2' }, { dir: 'rev', gap: pinGap(eq(c, c), 'r', 1) }));
    const r1 = f.add(lawRw({ k: 'given', givenId: 'h1' }));
    f.wire(s1, r2); f.wire(r2, r1); f.wire(r1, f.socket('t'));
    deliver(f);
    void P;
  });
});
