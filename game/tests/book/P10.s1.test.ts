// P10.s1 Multiples of an Exponent — Book world 8 (side). Assume xⁿ = e · Spool x^(nk) → power.multiply backwards (n, k) → desk → power.identity → gate → ∀.
import { describe, expect, it } from 'vitest';
import { E, bookFloor, deliver, intKnob, lawRw, lv89, pw, routed, spool, targetsTrue, tower, towerZ, x1, Zmul, Zv } from './kit-w89';
import { EARNED, sch } from './lemmas-w89';

describe('P10.s1 Multiples of an Exponent', () => {
  const L = lv89('P10.s1');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 }); f.add(towerZ('n1', 'n₁'), { x: 4, y: 30 }); f.add(towerZ('k1', 'k₁'), { x: 6, y: 30 });
    const { desk, gate } = f.room({ x: 10, y: 4, w: 30, h: 12 }, 'assume', pw(x1, Zv('n1')), E);
    const sp = f.add(spool(pw(x1, Zmul(Zv('n1'), Zv('k1')))), { x: 12, y: 12 });
    const r1 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: intKnob(Zv('n1')), n: intKnob(Zv('k1')) } }), { x: 16, y: 12 });
    const r2 = f.add(routed(), { x: 22, y: 12 });
    const r3 = f.add(lawRw(sch('power.identity')), { x: 28, y: 12 });
    const al = f.add({ kind: 'forall' }, { x: 44, y: 20 });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(desk, r2, 'rule'); f.wire(r2, r3); f.wire(r3, gate); f.wire(gate, al); f.wire(al, f.socket());
    deliver(f);
  });
});
