// P11.3 Squaring in a Five-Element Cyclic Group — Book world 9. Given a⁵ = e. Two docks.
//  Side fact a⁶ = a (Spool a⁶ → power.add backwards (5, 1) → h → power.one) feeds both docks.
//  s (one-to-one): Assume (aⁱ)² = e · Spool aⁱ → a⁶ backwards → power.multiply → power.multiply backwards (2i, 3), (i, 2) → desk → power.identity → gate → ∀.
//  t (onto, open ℤ hole): Spool aⁱ → a⁶ backwards → power.multiply → power.multiply backwards (3i, 2) → ∀; the hole fills with 3i.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { E, a, bookFloor, deliver, intKnob, lawRw, lv89, pw, routed, spool, targetsTrue, towerZ, Zc, Zm, Zmul, Zv } from './kit-w89';
import { EARNED, given, sch } from './lemmas-w89';

const ik = intKnob;
/** The closed onto dock with the hole filled by k. */
const onto = (k: K.Poly): K.Card => ({ k: 'law', metas: ['i'], l: pw(a, Zm('i')), r: pw(pw(a, k), Zc(2)) });

describe('P11.3 Squaring in a Five-Element Cyclic Group', () => {
  const L = lv89('P11.3');
  it('both docks are true in every finite group satisfying a⁵ = e (onto at its answer 3i)', () => {
    expect(L.sockets[1]!.holes).toEqual([{ id: 'k', sort: 'Z' }]);
    const n = targetsTrue(L, { t: onto(Zmul(Zc(3), Zm('i'))) });
    expect(n.s).toBeGreaterThan(0);
    expect(n.t).toBeGreaterThan(0);
  });
  it('a wrong exponent is not true (the truth check has teeth)', () => {
    expect(() => targetsTrue(L, { t: onto(Zmul(Zc(2), Zm('i'))) })).toThrow();
  });
  it('reference solution; the onto dock fills in with 3i', () => {
    const f = bookFloor(L, EARNED);
    f.add(towerZ('i1', 'i₁'), { x: 2, y: 40 });
    // side fact a⁶ = a
    const s0 = f.add(spool(pw(a, Zc(6))), { x: 4, y: 24 });
    const q1 = f.add(lawRw(sch('power.add'), { dir: 'rev', values: { m: ik(Zc(5)), n: ik(Zc(1)) } }), { x: 9, y: 24 });
    const q2 = f.add(lawRw(given('h')), { x: 14, y: 24 });
    const q3 = f.add(lawRw(sch('power.one')), { x: 19, y: 24 });
    f.wire(s0, q1); f.wire(q1, q2); f.wire(q2, q3);
    // s: one-to-one
    const r = f.room({ x: 26, y: 4, w: 46, h: 12 }, 'assume', pw(pw(a, Zv('i1')), Zc(2)), E);
    const sp = f.add(spool(pw(a, Zv('i1'))), { x: 28, y: 10 });
    const w1 = f.add(routed({ dir: 'rev' }), { x: 33, y: 10 });
    const w2 = f.add(lawRw(sch('power.multiply')), { x: 38, y: 10 });
    const w3 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: ik(Zmul(Zc(2), Zv('i1'))), n: ik(Zc(3)) } }), { x: 43, y: 10 });
    const w4 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: ik(Zv('i1')), n: ik(Zc(2)) } }), { x: 48, y: 10 });
    const w5 = f.add(routed(), { x: 53, y: 10 });
    const w6 = f.add(lawRw(sch('power.identity')), { x: 58, y: 10 });
    const al1 = f.add({ kind: 'forall' }, { x: 78, y: 8 });
    f.wire(sp, w1); f.wire(q3, w1, 'rule'); f.wire(w1, w2); f.wire(w2, w3); f.wire(w3, w4); f.wire(w4, w5); f.wire(r.desk, w5, 'rule'); f.wire(w5, w6);
    f.wire(w6, r.gate); f.wire(r.gate, al1); f.wire(al1, f.socket('s'));
    // t: onto
    const sp2 = f.add(spool(pw(a, Zv('i1'))), { x: 28, y: 30 });
    const u1 = f.add(routed({ dir: 'rev' }), { x: 33, y: 30 });
    const u2 = f.add(lawRw(sch('power.multiply')), { x: 38, y: 30 });
    const u3 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: ik(Zmul(Zc(3), Zv('i1'))), n: ik(Zc(2)) } }), { x: 43, y: 30 });
    const al2 = f.add({ kind: 'forall' }, { x: 50, y: 30 });
    f.wire(sp2, u1); f.wire(q3, u1, 'rule'); f.wire(u1, u2); f.wire(u2, u3); f.wire(u3, al2); f.wire(al2, f.socket('t'));
    const { comp } = deliver(f);
    expect(K.factText(comp.sockets.t!.instance!, K.labelsOf(L.atoms))).toBe('∀i. a^i = (a^(3i))^2');
  });
});
