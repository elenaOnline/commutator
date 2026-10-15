// P14.s1 Commutators Force Normality — Book world 12 (side). Subgroup H that contains every commutator, and a ∈ H.
// Tower x₁ · Theorem C at u = x₁, v = a → x₁ax₁⁻¹a⁻¹ ∈ H · closed under products with a ∈ H → cancel a⁻¹a inside → ∀.
import { describe, expect, it } from 'vitest';
import { sch, given, EARNED } from './lemmas-w1214';
import { bookFloor, lvZ, thm, cancel, tower, x1, a, knob, deliverZ, enoughModels, targetsHold, falsified, outText } from './kit-w1214';

describe('P14.s1 Commutators Force Normality', { timeout: 120_000 }, () => {
  const L = lvZ('P14.s1');
  it('the target is true for every subgroup containing all commutators; both givens are needed', () => {
    targetsHold(L);
    enoughModels(L);
    expect(falsified(L, L.sockets[0]!.target, ['ha']).length).toBeGreaterThan(0);
    expect(falsified(L, L.sockets[0]!.target, ['C']).length).toBeGreaterThan(0);
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    const c = f.add(thm(given('C'), 0, { u: knob(x1), v: knob(a) }), { x: 10, y: 6 });
    const m = f.add(thm(sch('sub.mul', { H: 'H' })), { x: 16, y: 8 });
    const k = f.add(cancel(), { x: 22, y: 8 });
    const all = f.add({ kind: 'forall' }, { x: 28, y: 8 });
    f.wire(c, m, 'p0'); f.wire(f.given('ha'), m, 'p1'); f.wire(m, k); f.wire(k, all); f.wire(all, f.socket());
    const comp = f.compile();
    if (!comp.solvable) for (const id of [c, m, k, all]) console.log(id, outText(f, comp, id));
    deliverZ(f);
  });
});
