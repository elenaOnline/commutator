// P16.s3 Powers of a Central Element — Book world 14 (side). Pow nodes, ℤ Tower n₁, Tower x₁; a a level constant.
// Spool x₁aⁿx₁⁻¹ → power.conjugate (mirrored) backwards: (x₁ax₁⁻¹)ⁿ → h backwards at y := x₁ inside the base (x₁a ⟶ ax₁) → cancel x₁x₁⁻¹.
import { describe, expect, it } from 'vitest';
import { I, P, a, bookFloor, cancel, deliver, eq, lawRw, lvA, neededGivens, pinSpan, pw, spool, targetsTrue, tower, towerZ, x1, Zv } from './kit-wA';
import { EARNED, given, schema } from './lemmas-w123';

describe('P16.s3 Powers of a Central Element', () => {
  const L = lvA('P16.s3');
  it('the target is true in every finite group under h, and h is needed', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ h: true });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    f.add(towerZ('n1', 'n₁'), { x: 4, y: 30 });
    const an = pw(a, Zv('n1'));
    const T = P(x1, an, I(x1));
    const sp = f.add(spool(T), { x: 22, y: 6 });
    const cj = f.add(lawRw(schema('power.conjugate', true), { dir: 'rev', target: pinSpan(eq(T, T), 'r', 0, 3) }), { x: 28, y: 6 });
    const base = P(x1, a, I(x1));
    const h = f.add(lawRw(given('h'), { dir: 'rev', target: pinSpan(eq(T, pw(base, Zv('n1'))), 'r', 0, 2, [0]) }), { x: 34, y: 6 });
    const cn = f.add(cancel(pinSpan(eq(T, pw(P(a, x1, I(x1)), Zv('n1'))), 'r', 1, 3, [0])), { x: 40, y: 6 });
    const al = f.add({ kind: 'forall' }, { x: 48, y: 6 });
    f.wire(sp, cj); f.wire(cj, h); f.wire(h, cn); f.wire(cn, al); f.wire(al, f.socket());
    deliver(f);
  });
});
