// P11.1 Subgroups of a Cyclic Group — Book world 9 (the sub.pow import). Pow nodes; Towers q₁, r₁ (ℤ). Assume desk a^(3q₁+r₁) ∈ H ·
// Theorem sub.pow on the given a³ ∈ H at n := −q₁ · Theorem closed under products (desk, that) · power.multiply on (a³)^(−q₁) ·
// power.add on a^(3q₁+r₁)a^(−3q₁) → a^(r₁) ∈ H · gate · ∀ · dock.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { a, deliver, expectNontrivial, gv, intKnob, lawRw, lvM, memA, membersFloor, memRoom, memTruth, neededGivensM, pinSpanM, pw, sc, thm, towerZ, Zc, Zmul, Zv } from './kit-members';
import { EARNED, schema } from './lemmas-w123';
import { polyAdd } from '../../src/kernel/poly';

describe('P11.1 Subgroups of a Cyclic Group', () => {
  const L = lvM('P11.1');
  const q = Zv('q1'), r = Zv('r1');
  it('truth: a³ ∈ H and a^(3q+r) ∈ H give a^r ∈ H, over every subgroup of every catalogue group (ℤ metas over −6..6)', () => {
    expect(memTruth(L)).toBeGreaterThan(0);
    expect(expectNontrivial(L)).toBeGreaterThanOrEqual(10);
  });
  it('the given is needed', () => { expect(neededGivensM(L)).toEqual({ g: true }); });
  it('sub.pow is an import listed in the toolset; sub.e is earned and listed; the level earns nothing', () => {
    expect(L.tools.schemas).toEqual(expect.arrayContaining(['sub.pow', 'sub.e']));
    expect(L.unlocks).toEqual([]);
    expect(K.subSchema('sub.pow')!.origin).toBe('import');
  });
  it('reference solution', () => {
    const f = membersFloor(L, EARNED);
    f.add(towerZ('q1', 'q₁'), { x: 2, y: 30 }); f.add(towerZ('r1', 'r₁'), { x: 4, y: 30 });
    const big = pw(a, polyAdd(Zmul(Zc(3), q), r));
    const r1 = memRoom(f, { x: 18, y: 4, w: 40, h: 12 }, [memA(big, 'H')], a);
    const sp = f.add(thm(sc('sub.pow', { H: 'H' }), 0, { n: intKnob(Zmul(Zc(-1), q)) }), { x: 21, y: 9 });
    const ml = f.add(thm(sc('sub.mul', { H: 'H' })), { x: 27, y: 9 });
    const a3 = pw(a, Zc(3));
    const word = { k: 'mul', fs: [big, pw(a3, Zmul(Zc(-1), q))] } as K.Term;
    const pm = f.add(lawRw(schema('power.multiply'), { target: pinSpanM(word, 1, 2) }), { x: 33, y: 9 });
    const word2 = { k: 'mul', fs: [big, pw(a, Zmul(Zc(3), Zmul(Zc(-1), q)))] } as K.Term;
    const pa = f.add(lawRw(schema('power.add'), { target: pinSpanM(word2, 0, 2) }), { x: 39, y: 9 });
    const all = f.add({ kind: 'forall' }, { x: 62, y: 9 });
    f.wire(f.given('g'), sp, 'p0'); f.wire(r1.desks[0]!, ml, 'p0'); f.wire(sp, ml, 'p1'); f.wire(ml, pm); f.wire(pm, pa); f.wire(pa, r1.gate); f.wire(r1.gate, all); f.wire(all, f.socket());
    const { comp } = deliver(f);
    expect(K.factText((comp.machines[all]!.out as { card: K.Card }).card, K.levelLabels(K.withVars(f.ctx, comp.graph).ctx.level))).toMatch(/∀q, r\. a.*∈ H ⟹ a.*∈ H/);
    void gv;
  });
});
