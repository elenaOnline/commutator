// P10.5 The Only Element of Order 2 — Book world 8. Capstone: a Suppose room, the player's conjugate lemma, a two-premise given card.
//  Suppose y⁻¹ay = e · Spool a → insert yy⁻¹ at both ends → desk → cancel → a = e; clash with a ≠ e → y⁻¹ay ≠ e.
//  Your conjugate lemma on a² = e (y := y₁) → (y⁻¹ay)² = e. U on both → y⁻¹ay = a → multiply left by y → cancel → ∀.
import { describe, expect, it } from 'vitest';
import { E, I, P, a, bookFloor, cancel, deliver, eq, insertPair, join, knob, lv89, mult, pinGap, routed, spool, targetsTrue, thm, tower, y1 } from './kit-w89';
import { EARNED, buildConjugate, given } from './lemmas-w89';

describe('P10.5 The Only Element of Order 2', () => {
  const L = lv89('P10.5');
  it('the target is true in every finite group satisfying the givens', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('reference solution, with the player’s conjugate lemma', () => {
    const { fwd: lemma } = buildConjugate();
    const f = bookFloor(L, EARNED, [lemma]);
    f.add(tower('y1', 'y₁'), { x: 2, y: 30 });
    const r = f.room({ x: 12, y: 4, w: 46, h: 12 }, 'suppose', P(I(y1), a, y1), E);
    const sp = f.add(spool(a), { x: 14, y: 10 });
    const i1 = f.add(insertPair(y1, false), { x: 19, y: 10 });
    const i2 = f.add(insertPair(y1, false, pinGap(eq(a, P(y1, I(y1), a)), 'r', 3)), { x: 24, y: 10 });
    const rr = f.add(routed(), { x: 29, y: 10 });
    const cn = f.add(cancel(), { x: 35, y: 10 });
    const ck = f.add(join({ k: 'clash' }), { x: 41, y: 10 });
    f.wire(sp, i1); f.wire(i1, i2); f.wire(i2, rr); f.wire(r.desk, rr, 'rule'); f.wire(rr, cn); f.wire(cn, ck, 'a'); f.wire(f.given('n'), ck, 'b'); f.wire(ck, r.gate);
    const t1 = f.add(thm({ k: 'schema', id: lemma.id }, 0, { y: knob(y1) }), { x: 14, y: 24 });
    f.wire(f.given('h'), t1, 'p0');
    const t2 = f.add(thm(given('U')), { x: 24, y: 24 });
    f.wire(t1, t2, 'p0'); f.wire(r.gate, t2, 'p1');
    const m1 = f.add(mult('left', y1), { x: 34, y: 24 });
    const c2 = f.add(cancel(), { x: 40, y: 24 });
    const all = f.add({ kind: 'forall' }, { x: 48, y: 24 });
    f.wire(t2, m1); f.wire(m1, c2); f.wire(c2, all); f.wire(all, f.socket());
    deliver(f);
  });
});
