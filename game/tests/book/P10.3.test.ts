// P10.3 Odd Order — Book world 8. Open dock `x = (x²)^?` with a ℤ hole; the answer is m + 1.
// Assume x^(2m+1) = e · Spool (x²)^(m+1) → power.multiply → power.add backwards (2m+1, 1) → desk → power.one → gate → ∀.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { polyAdd } from '../../src/kernel/poly';
import { E, bookFloor, deliver, lawRw, lv89, pw, routed, spool, targetsTrue, tower, towerZ, x1, Zc, Zm, Zmul, Zv, intKnob } from './kit-w89';
import { EARNED, sch } from './lemmas-w89';

const x = { k: 'meta', id: 'x' } as K.Term;
/** The closed statement the dock shows once filled with k := the given exponent. */
const answer = (k: K.Poly): K.Card => {
  const t = (lv89('P10.3').sockets[0]!.target as Extract<K.Card, { k: 'cond' }>);
  return { ...t, concl: { k: 'eq', l: x, r: pw(pw(x, Zc(2)), k) } };
};

describe('P10.3 Odd Order', () => {
  const L = lv89('P10.3');
  it('the dock is open (a ℤ hole), and the answer m + 1 is true in every finite group', () => {
    expect(L.sockets[0]!.holes).toEqual([{ id: 'k', sort: 'Z' }]);
    expect(targetsTrue(L, { s: answer(polyAdd(Zm('m'), Zc(1))) }).s).toBeGreaterThan(0);
  });
  it('a wrong exponent is not true (the truth check has teeth)', () => {
    expect(() => targetsTrue(L, { s: answer(Zm('m')) })).toThrow();
  });
  it('reference solution; the dock fills in with m + 1', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    f.add(towerZ('m1', 'm₁'), { x: 4, y: 30 });
    const odd = polyAdd(Zmul(Zc(2), Zv('m1')), Zc(1));
    const { desk, gate } = f.room({ x: 10, y: 4, w: 40, h: 12 }, 'assume', pw(x1, odd), E);
    const sp = f.add(spool(pw(pw(x1, Zc(2)), polyAdd(Zv('m1'), Zc(1)))), { x: 12, y: 12 });
    const r1 = f.add(lawRw(sch('power.multiply')), { x: 16, y: 12 });
    const r2 = f.add(lawRw(sch('power.add'), { dir: 'rev', values: { m: intKnob(odd), n: intKnob(Zc(1)) } }), { x: 22, y: 12 });
    const r3 = f.add(routed(), { x: 28, y: 12 });
    const r4 = f.add(lawRw(sch('power.one')), { x: 34, y: 12 });
    const al = f.add({ kind: 'forall' }, { x: 54, y: 20 });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, r3); f.wire(desk, r3, 'rule'); f.wire(r3, r4); f.wire(r4, gate); f.wire(gate, al); f.wire(al, f.socket());
    const { comp } = deliver(f);
    expect(K.factText(comp.sockets.s!.instance!, {})).toBe('∀x, m. x^(2m+1) = e ⟹ x = (x^2)^(m+1)');
  });
});
