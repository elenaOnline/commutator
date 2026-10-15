// P14.3 From Five to Three — Book world 12. Route: Tower x₁ in G. Spool f(x₁)⁵ → hom.pow backwards → Lagrange in G inside
// the frame → your f(e) = e at f. Spool f(x₁)³ → Lagrange in K. Your P10.4 lemma (x³ = e, x⁵ = e ⟹ x = e) at f(x₁), in K → ∀.
// Shipped 2026-10-15 once the factory offered a Lagrange press per group sort (LibRef { k: 'lagrange', sort }).
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { Player } from '../../src/kernel/testkit';
import { ctxFor } from '../../src/state/factoryStore';
import { homLemmas, sch, EARNED, buildOrders35 } from './lemmas-w1214';
import { nontrivialModels } from '../../src/groups/oracle';
import { bookFloor, lvZ, spool, lawRw, thm, eq, pinSpan, app, elemTower, pw, Zc, targetsHold, falsified, outText, deliverZ } from './kit-w1214';

describe('P14.3 From Five to Three', { timeout: 120_000 }, () => {
  const L = lvZ('P14.3');
  it('the target is true for every homomorphism from a group of order 5 to one of order 3; both sizes are needed', () => {
    targetsHold(L);
    // Pin 4 cannot be met by this statement: the catalogue has one model (ℤ₅, ℤ₃, the trivial hom), and that IS the theorem.
    // So the level carries a documented exemption, and instead each size given is shown to be needed: dropping either one
    // leaves a counterexample (ℤ₅ → ℤ₅ and ℤ₃ → ℤ₃, the identity).
    const nm = nontrivialModels(L, 's');
    expect(nm.count).toBe(1);
    expect(nm.exempt).toMatch(/only homomorphism ℤ₅ → ℤ₃ is trivial/);
    expect(nm.ok).toBe(true);
    expect(falsified(L, L.sockets[0]!.target, ['sG']).length).toBeGreaterThan(0);
    expect(falsified(L, L.sockets[0]!.target, ['sK']).length).toBeGreaterThan(0);
  });

  it('the kernel proves it with per-group Lagrange, hom.pow and the player’s saved lemmas', () => {
    const { homE } = homLemmas();
    const { lemma: c35 } = buildOrders35();
    const c0 = ctxFor(L, EARNED, [homE, c35]);
    const p = new Player({ ...c0, level: { ...c0.level, tools: { ...L.tools, schemas: c0.level.tools.schemas } } });
    p.graph = { ...p.graph, vars: [{ id: 'x1', label: 'x₁', hue: 0, variable: true, carrier: 'G' }] };
    p.res = K.check(p.graph, p.ctx);
    const X: K.Term = { k: 'atom', id: 'x1' };
    const press = (id: string, input: string) => { const r = p.tryNode({ id, scope: K.ROOT, k: 'press', input, power: true }); expect(r.ok, r.error).toBe(true); return id; };
    const pG = press('pG', 'g:sG'), pK = press('pK', 'g:sK');
    expect(p.text(pK)).toBe('∀x. x^3 = e_K');
    const s5 = p.start(pw(app('f', X), Zc(5)));
    const a1 = p.step(s5, { k: 'rewrite', rule: { k: 'schema', id: 'hom.pow' }, dir: 'rev', at: { side: 'r', path: [] }, subst: { x: X, n: { k: 'int', val: Zc(5) } }, structs: { f: 'f' } });
    const a2 = p.step(a1, { k: 'rewrite', rule: { k: 'node', id: pG }, dir: 'fwd', at: { side: 'r', path: [0] }, subst: { x: X } });
    const a3 = p.step(a2, { k: 'rewrite', rule: { k: 'schema', id: homE.id }, dir: 'fwd', at: { side: 'r', path: [] }, subst: {}, structs: { f: 'f' } });
    const s3 = p.start(pw(app('f', X), Zc(3)));
    const b1 = p.step(s3, { k: 'rewrite', rule: { k: 'node', id: pK }, dir: 'fwd', at: { side: 'r', path: [] }, subst: { x: app('f', X) } });
    const t = p.apply({ k: 'schema', id: c35.id }, [b1, a3], { x: app('f', X) });
    p.generalize(t);
    expect(p.text(t)).toBe('f(x₁) = e_K');
    expect(p.res.sockets[0]!.ok, p.res.sockets[0]!.error).toBe(true);
    // provisional par (re-measure on the floor once it ships): Tower, 2 Spools, hom.pow, 2 Lagrange, f(e) = e, the P10.4 Theorem, ∀ = 9 machines
    expect(K.metrics(p.graph, p.res, p.ctx).axioms).toBe(L.par.axioms);
  });

  it('reference solution: Lagrange in G inside the frame, Lagrange in K, your P10.4 lemma in K', () => {
    const { homE } = homLemmas();
    const { lemma: c35 } = buildOrders35();
    const f = bookFloor(L, EARNED, [homE, c35]);
    expect(f.ctx.level.tools.schemas).toContain('hom.pow');
    f.add(elemTower('x1', 'x₁', 'G'), { x: 2, y: 40 });
    const X: K.Term = { k: 'atom', id: 'x1' };
    const F5 = pw(app('f', X), Zc(5)), F3 = pw(app('f', X), Zc(3));
    const s5 = f.add(spool(F5), { x: 10, y: 6 });
    const a1 = f.add(lawRw(sch('hom.pow', { f: 'f' }), { dir: 'rev', target: pinSpan(eq(F5, F5), 'r', 0, 1) }), { x: 14, y: 6 });
    const a2 = f.add(lawRw({ k: 'lagrange', sort: 'G' }), { x: 18, y: 6 });
    const a3 = f.add(lawRw(sch(homE.id, { f: 'f' })), { x: 22, y: 6 });
    const s3 = f.add(spool(F3), { x: 10, y: 12 });
    const b1 = f.add(lawRw({ k: 'lagrange', sort: 'K' }, { target: pinSpan(eq(F3, F3), 'r', 0, 1) }), { x: 14, y: 12 });
    const t = f.add(thm(sch(c35.id)), { x: 28, y: 9 });
    const all = f.add({ kind: 'forall' }, { x: 34, y: 9 });
    f.wire(s5, a1); f.wire(a1, a2); f.wire(a2, a3); f.wire(s3, b1); f.wire(b1, t, 'p0'); f.wire(a3, t, 'p1'); f.wire(t, all); f.wire(all, f.socket());
    const comp0 = f.compile();
    expect(outText(f, comp0, a3)).toBe('(f(x₁))^5 = e_K');
    expect(outText(f, comp0, b1)).toBe('(f(x₁))^3 = e_K');
    deliverZ(f);
  });
});
