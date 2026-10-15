// P10.s2 ab and ba — Book world 8 (side). Assume (xy)ⁿ = e · Spool (yx)ⁿ → insert x⁻¹x before y (inside the base) → power.conjugate → desk → cancel → gate → ∀.
import { describe, expect, it } from 'vitest';
import { E, P, bookFloor, cancel, deliver, eq, insertPair, lawRw, lv89, pinGap, pw, routed, spool, targetsTrue, tower, towerZ, x1, y1, Zv } from './kit-w89';
import { EARNED, sch } from './lemmas-w89';

describe('P10.s2 ab and ba', () => {
  const L = lv89('P10.s2');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 }); f.add(tower('y1', 'y₁'), { x: 4, y: 30 }); f.add(towerZ('n1', 'n₁'), { x: 6, y: 30 });
    const { desk, gate } = f.room({ x: 10, y: 4, w: 34, h: 12 }, 'assume', pw(P(x1, y1), Zv('n1')), E);
    const start = pw(P(y1, x1), Zv('n1'));
    const sp = f.add(spool(start), { x: 12, y: 12 });
    const ins = f.add(insertPair(x1, true, pinGap(eq(start, start), 'r', 0, [0])), { x: 16, y: 12 });
    const cj = f.add(lawRw(sch('power.conjugate')), { x: 21, y: 12 });
    const h = f.add(routed(), { x: 26, y: 12 });
    const cn = f.add(cancel(), { x: 31, y: 12 });
    const al = f.add({ kind: 'forall' }, { x: 48, y: 20 });
    f.wire(sp, ins); f.wire(ins, cj); f.wire(cj, h); f.wire(desk, h, 'rule'); f.wire(h, cn); f.wire(cn, gate); f.wire(gate, al); f.wire(al, f.socket());
    deliver(f);
  });
});
