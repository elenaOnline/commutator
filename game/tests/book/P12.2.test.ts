// P12.2 Conjugacy — Book world 10. Witness docks `∃g. …` (element holes); words throughout, no exponents.
//  s1 (refl):  Spool aaa⁻¹ → cancel on the left rail: a = aaa⁻¹ (g = a).
//  s2 (symm):  h₁ → × c⁻¹ on the left → × c on the right → cancel twice → swap: b = c⁻¹ac (g = c).
//  s3 (trans): h₁ → b ⟶ dpd⁻¹ (h₂) → d⁻¹c⁻¹ ⟶ (cd)⁻¹ (inverse of a product, backwards): a = (cd)p(cd)⁻¹ (g = cd).
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { I, P, a, b, bookFloor, c, cancel, deliver, measured, dockAnswer, eq, lawRw, lvA, mult, neededGivens, op, pinSpan, spool, targetsTrue } from './kit-wA';
import { EARNED, given, schema } from './lemmas-w123';

const d: K.Term = { k: 'atom', id: 'd' }, p: K.Term = { k: 'atom', id: 'p' };

describe('P12.2 Conjugacy', () => {
  const L = lvA('P12.2');
  it('the docks are witness docks; each is true at its known witness (g = a, c, cd) in every finite group', () => {
    expect(L.sockets.map((s) => s.holes)).toEqual([[{ id: 'g' }], [{ id: 'g' }], [{ id: 'g' }]]);
    const n = targetsTrue(L, {
      s1: eq(a, P(a, a, I(a))),
      s2: eq(b, P(I(c), a, c)),
      s3: eq(a, P(P(c, d), p, I(P(c, d)))),
    });
    for (const id of ['s1', 's2', 's3']) expect(n[id], id).toBeGreaterThan(0);
  });
  it('each dock allows exactly the givens it needs', () => {
    expect(L.sockets.map((s) => s.allowedGivens)).toEqual([[], ['h1'], ['h1', 'h2']]);
    expect(neededGivens(L, 's2', eq(b, P(I(c), a, c)))).toEqual({ h1: true });
    expect(neededGivens(L, 's3', eq(a, P(P(c, d), p, I(P(c, d)))))).toEqual({ h1: true, h2: true });
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    // s1
    const T = P(a, a, I(a));
    const sp1 = f.add(spool(T), { x: 22, y: 4 });
    const k1 = f.add(cancel(), { x: 28, y: 4 });
    f.wire(sp1, k1); f.wire(k1, f.socket('s1'));
    // s2
    const m1 = f.add(mult('left', I(c)), { x: 22, y: 14 });
    const m2 = f.add(mult('right', c), { x: 28, y: 14 });
    const R1 = P(I(c), c, b, I(c), c);
    const q1 = f.add(cancel(pinSpan(eq(P(I(c), a, c), R1), 'r', 0, 2)), { x: 34, y: 14 });
    const q2 = f.add(cancel(pinSpan(eq(P(I(c), a, c), P(b, I(c), c)), 'r', 1, 3)), { x: 40, y: 14 });
    const sw = f.add(op({ k: 'swap' }), { x: 46, y: 14 });
    f.wire(f.given('h1'), m1); f.wire(m1, m2); f.wire(m2, q1); f.wire(q1, q2); f.wire(q2, sw); f.wire(sw, f.socket('s2'));
    // s3
    const t1 = f.add(lawRw(given('h2'), { target: pinSpan(eq(a, P(c, b, I(c))), 'r', 1, 2) }), { x: 22, y: 26 });
    const t2 = f.add(lawRw(schema('socks'), { dir: 'rev', target: pinSpan(eq(a, P(c, d, p, I(d), I(c))), 'r', 3, 5) }), { x: 30, y: 26 });
    f.wire(f.given('h1'), t1); f.wire(t1, t2); f.wire(t2, f.socket('s3'));
    const { comp } = deliver(f);
    expect(dockAnswer(comp, 's1', L)).toBe('a = aaa⁻¹');
    expect(dockAnswer(comp, 's2', L)).toBe('b = c⁻¹ac');
    expect(dockAnswer(comp, 's3', L)).toBe('a = cdp(cd)⁻¹');
  });
  it('a bare Spool of either side does not fill a dock', () => {
    for (const [sid, t] of [['s1', a], ['s2', b], ['s3', a]] as const) {
      const f = bookFloor(L, EARNED);
      f.wire(spool(t) && f.add(spool(t), { x: 22, y: 4 }), f.socket(sid));
      expect(f.compile().solvable, sid).toBe(false);
    }
  });
});
