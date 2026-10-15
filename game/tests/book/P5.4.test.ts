// P5.4 Conjugating by a Product — Book world 4. Tower u₁ · Assume desk u₁ ∈ H · Theorem K_d · Theorem K_c · inverse of a product
// backwards on d⁻¹c⁻¹ (cdu₁(cd)⁻¹ ∈ H) · gate · ∀ · dock.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { I, P, c, d, deliver, expectNontrivial, gv, lawRw, lvM, memA, membersFloor, memRoom, memTruth, neededGivensM, pinSpanM, thm, tower } from './kit-members';
import { EARNED, schema } from './lemmas-w123';

const u1: K.Term = { k: 'atom', id: 'u1' };
describe('P5.4 Conjugating by a Product', () => {
  const L = lvM('P5.4');
  it('truth: the dock holds whenever K_c and K_d do, for every subgroup of every catalogue group', () => {
    expect(memTruth(L)).toBeGreaterThan(0);
    expect(expectNontrivial(L)).toBeGreaterThanOrEqual(10);
  });
  it('both givens are needed (dropping either leaves a counterexample)', () => {
    expect(neededGivensM(L)).toEqual({ Kc: true, Kd: true });
  });
  it('reference solution', () => {
    const f = membersFloor(L, EARNED);
    f.add(tower('u1', 'u₁'), { x: 2, y: 30 });
    const r = memRoom(f, { x: 18, y: 4, w: 30, h: 10 }, [memA(u1, 'H')], u1);
    const kd = f.add(thm(gv('Kd')), { x: 21, y: 8 });
    const kc = f.add(thm(gv('Kc')), { x: 27, y: 8 });
    // after K_c the member is c·(du₁d⁻¹)·c⁻¹ = c d u₁ d⁻¹ c⁻¹; the factors d⁻¹ c⁻¹ are the span [3, 5)
    const word = P(c, d, u1, I(d), I(c));
    const sk = f.add(lawRw(schema('socks'), { dir: 'rev', target: pinSpanM(word, 3, 5) }), { x: 33, y: 8 });
    const all = f.add({ kind: 'forall' }, { x: 54, y: 8 });
    f.wire(r.desks[0]!, kd, 'p0'); f.wire(kd, kc, 'p0'); f.wire(kc, sk); f.wire(sk, r.gate); f.wire(r.gate, all); f.wire(all, f.socket());
    const { comp } = deliver(f);
    expect(K.factText((comp.machines[all]!.out as { card: K.Card }).card, K.levelLabels(K.withVars(f.ctx, comp.graph).ctx.level))).toBe('∀u. u ∈ H ⟹ cdu(cd)⁻¹ ∈ H');
  });
});
