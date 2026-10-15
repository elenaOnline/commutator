// P10.4 Orders 3 and 5 — Book world 8. The first multi-desk Assume room (x³ = e, x⁵ = e); reuses the player's negative power.
// Spool x → power.one backwards → power.add backwards (6, −5) → power.multiply backwards (3, 2) → desk 1 → power.identity
// (tidy off, so the e stays) → negative power → desk 2 → cancel e·e⁻¹ → gate → ∀.
import { describe, expect, it } from 'vitest';
import { E, bookFloor, cancel, deliver, intKnob, lawRw, lv89, pw, routed, spool, targetsTrue, tower, x1, Zc } from './kit-w89';
import { EARNED, buildNegPower, multiRoom, sch } from './lemmas-w89';

describe('P10.4 Orders 3 and 5', () => {
  const L = lv89('P10.4');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution, with the player’s negative power', () => {
    const { lemma } = buildNegPower();
    const f = bookFloor(L, EARNED, [lemma]);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    const { desks, gate } = multiRoom(f, { x: 10, y: 4, w: 60, h: 14 }, [{ rel: 'eq', l: pw(x1, Zc(3)), r: E }, { rel: 'eq', l: pw(x1, Zc(5)), r: E }]);
    const sp = f.add(spool(x1), { x: 14, y: 12 });
    const r1 = f.add(lawRw(sch('power.one'), { dir: 'rev' }), { x: 18, y: 12 });
    const r2 = f.add(lawRw(sch('power.add'), { dir: 'rev', values: { m: intKnob(Zc(6)), n: intKnob(Zc(-5)) } }), { x: 22, y: 12 });
    const r3 = f.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: intKnob(Zc(3)), n: intKnob(Zc(2)) } }), { x: 26, y: 12 });
    const r4 = f.add(routed(), { x: 30, y: 12 });
    const r5 = f.add(lawRw(sch('power.identity'), { tidy: false }), { x: 34, y: 12 });
    const r6 = f.add(lawRw(sch(lemma.id)), { x: 38, y: 12 });
    const r7 = f.add(routed(), { x: 42, y: 12 });
    const r8 = f.add(cancel(), { x: 46, y: 12 });
    const all = f.add({ kind: 'forall' }, { x: 74, y: 20 });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, r3); f.wire(r3, r4); f.wire(desks[0]!, r4, 'rule'); f.wire(r4, r5); f.wire(r5, r6);
    f.wire(r6, r7); f.wire(desks[1]!, r7, 'rule'); f.wire(r7, r8); f.wire(r8, gate); f.wire(gate, all); f.wire(all, f.socket());
    deliver(f);
  });
  it('the room has two desks and the card compares up to premise order', () => {
    expect(L.sockets[0]!.target).toMatchObject({ k: 'cond' });
    expect((L.sockets[0]!.target as { premises: unknown[] }).premises).toHaveLength(2);
  });
});
