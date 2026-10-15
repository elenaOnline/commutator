// P11.2 Powers of One Element Commute — Book world 9. Spool (xⁱxʲ)ᵐ → power.add (inside the base) → power.multiply →
// power.add backwards (im, jm) → power.multiply backwards (i, m) and (j, m) → ∀ → dock.
import { describe, expect, it } from 'vitest';
import { bookFloor, deliver, intKnob, lawRw, lv89, pw, spool, targetsTrue, tower, towerZ, x1, Zmul, Zv } from './kit-w89';
import { EARNED, sch } from './lemmas-w89';
import { P } from './kit-w89';

describe('P11.2 Powers of One Element Commute', () => {
  const L = lv89('P11.2');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 }); f.add(towerZ('i1', 'i₁'), { x: 4, y: 30 }); f.add(towerZ('j1', 'j₁'), { x: 6, y: 30 }); f.add(towerZ('m1', 'm₁'), { x: 8, y: 30 });
    const xi = pw(x1, Zv('i1')), xj = pw(x1, Zv('j1'));
    const sp = f.add(spool(pw(P(xi, xj), Zv('m1'))), { x: 12, y: 12 });
    const r1 = f.add(lawRw(sch('power.add')), { x: 17, y: 12 });
    const r2 = f.add(lawRw(sch('power.multiply')), { x: 22, y: 12 });
    const r3 = f.add(lawRw(sch('power.add'), { dir: 'rev', values: { m: intKnob(Zmul(Zv('i1'), Zv('m1'))), n: intKnob(Zmul(Zv('j1'), Zv('m1'))) } }), { x: 27, y: 12 });
    const r4 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: intKnob(Zv('i1')), n: intKnob(Zv('m1')) } }), { x: 32, y: 12 });
    const r5 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: intKnob(Zv('j1')), n: intKnob(Zv('m1')) } }), { x: 37, y: 12 });
    const al = f.add({ kind: 'forall' }, { x: 43, y: 12 });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, r3); f.wire(r3, r4); f.wire(r4, r5); f.wire(r5, al); f.wire(al, f.socket());
    deliver(f);
  });
});
