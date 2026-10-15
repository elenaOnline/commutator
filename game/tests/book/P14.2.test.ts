// P14.2 Trivial Kernel — Book world 12. Level hom f : G → K; the player's saved f(x⁻¹) = f(x)⁻¹ is applied at f.
// Spool f(ab⁻¹) → hom law → your f(x⁻¹) = f(x)⁻¹ at f → h (f(a) ⟶ f(b)) → cancel: f(ab⁻¹) = e_K → Theorem T → ab⁻¹ = e
// → multiply right by b → cancel → pop the e → a = b.
import { describe, expect, it } from 'vitest';
import { homLemmas, sch, given, EARNED } from './lemmas-w1214';
import {
  bookFloor, lvZ, spool, cancel, pop, lawRw, thm, mult, P, I, a, b, eq, pinSpan, app, deliverZ, enoughModels, targetsHold, falsified, outText,
} from './kit-w1214';

describe('P14.2 Trivial Kernel', { timeout: 120_000 }, () => {
  const L = lvZ('P14.2');
  it('the target is true for every homomorphism with trivial kernel; both givens are needed', () => {
    targetsHold(L);
    expect(enoughModels(L).s).toBeGreaterThanOrEqual(10);
    expect(falsified(L, L.sockets[0]!.target, ['h']).length).toBeGreaterThan(0);
    expect(falsified(L, L.sockets[0]!.target, ['T']).length).toBeGreaterThan(0);
  });
  it('reference solution: your f(x⁻¹) = f(x)⁻¹ at the level hom f', () => {
    const { homInv } = homLemmas();
    const f = bookFloor(L, EARNED, [homInv]);
    const W = app('f', P(a, I(b)));
    const sp = f.add(spool(W), { x: 10, y: 6 });
    const h1 = f.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(W, W), 'r', 0, 1) }), { x: 14, y: 6 });
    const h2 = f.add(lawRw(sch(homInv.id, { f: 'f' })), { x: 18, y: 6 });
    const h3 = f.add(lawRw(given('h')), { x: 22, y: 6 });
    const h4 = f.add(cancel(), { x: 26, y: 6 });
    const t = f.add(thm(given('T')), { x: 30, y: 6 });
    const m = f.add(mult('right', b), { x: 34, y: 6 });
    const c = f.add(cancel(), { x: 38, y: 6 });
    const pp = f.add(pop(), { x: 42, y: 6 });
    f.wire(sp, h1); f.wire(h1, h2); f.wire(h2, h3); f.wire(h3, h4); f.wire(h4, t, 'p0'); f.wire(t, m); f.wire(m, c); f.wire(c, pp); f.wire(pp, f.socket());
    const comp = f.compile();
    if (!comp.solvable) for (const id of [sp, h1, h2, h3, h4, t, m, c]) console.log(id, outText(f, comp, id));
    deliverZ(f);
  });
});
