// P15.4 Cyclic Over the Centre — Book world 13. Pow nodes with ℤ Towers m₁, n₁. Two Spools, one normal form d c a^(m+n):
//  l: c aᵐ d aⁿ → Z_d backwards at z := aᵐ → Z_c at z := d → power.add.
//  r: d aⁿ c aᵐ → Z_c backwards at z := aⁿ → power.add (a^(n+m) is a^(m+n)).
// A Joiner chains the two (same right side); ∀ binds m₁ and n₁.
import { describe, expect, it } from 'vitest';
import { P, a, bookFloor, c, deliver, eq, join, lawRw, lvA, neededGivens, pinSpan, pw, spool, targetsTrue, towerZ, Zv } from './kit-wA';
import { EARNED, given, kn, schema } from './lemmas-w123';
import type * as K from '../../src/kernel';

const d: K.Term = { k: 'atom', id: 'd' };

describe('P15.4 Cyclic Over the Centre', () => {
  const L = lvA('P15.4');
  it('the target is true in every finite group under Z_c and Z_d (both needed)', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ Zc: true, Zd: true });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(towerZ('m1', 'm₁'), { x: 2, y: 40 });
    f.add(towerZ('n1', 'n₁'), { x: 4, y: 40 });
    const am = pw(a, Zv('m1')), an = pw(a, Zv('n1'));
    const T1 = P(c, am, d, an);
    const sp1 = f.add(spool(T1), { x: 22, y: 4 });
    const u1 = f.add(lawRw(given('Zd'), { dir: 'rev', target: pinSpan(eq(T1, T1), 'r', 1, 3), values: { z: kn(am) } }), { x: 28, y: 4 });
    const u2 = f.add(lawRw(given('Zc'), { target: pinSpan(eq(T1, P(c, d, am, an)), 'r', 0, 2), values: { z: kn(d) } }), { x: 34, y: 4 });
    const u3 = f.add(lawRw(schema('power.add'), { target: pinSpan(eq(T1, P(d, c, am, an)), 'r', 2, 4) }), { x: 40, y: 4 });
    const T2 = P(d, an, c, am);
    const sp2 = f.add(spool(T2), { x: 22, y: 16 });
    const v1 = f.add(lawRw(given('Zc'), { dir: 'rev', target: pinSpan(eq(T2, T2), 'r', 1, 3), values: { z: kn(an) } }), { x: 28, y: 16 });
    const v2 = f.add(lawRw(schema('power.add'), { target: pinSpan(eq(T2, P(d, c, an, am)), 'r', 2, 4) }), { x: 34, y: 16 });
    const ch = f.add(join({ k: 'chain' }), { x: 48, y: 10 });
    const al = f.add({ kind: 'forall' }, { x: 54, y: 10 });
    f.wire(sp1, u1); f.wire(u1, u2); f.wire(u2, u3); f.wire(sp2, v1); f.wire(v1, v2);
    f.wire(u3, ch, 'a'); f.wire(v2, ch, 'b'); f.wire(ch, al); f.wire(al, f.socket());
    deliver(f);
  }, 120_000);
});
