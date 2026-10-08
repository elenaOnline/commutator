import { describe, expect, it } from 'vitest';
import type { Fact, Term } from '../kernel/types';
import { LEVELS } from '../levels/levels';
import { catalogue, evalTerm, holds, testClaim } from './index';
const a: Term = { k: 'atom', id: 'a' }, b: Term = { k: 'atom', id: 'b' };
const x: Term = { k: 'meta', id: 'x' }, y: Term = { k: 'meta', id: 'y' };
const e: Term = { k: 'e' };
const mul = (...fs: Term[]): Term => ({ k: 'mul', fs });
const inv = (arg: Term): Term => ({ k: 'inv', arg });
const eq = (l: Term, r: Term): Fact & { k: 'eq' } => ({ k: 'eq', l, r });
const atoms = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }];

describe('complete small-group catalogue', () => {
  it('has exactly the fourteen groups in increasing order', () => {
    expect(catalogue().map(G => [G.name, G.order])).toEqual([
      ['ℤ₁', 1], ['ℤ₂', 2], ['ℤ₃', 3], ['ℤ₄', 4], ['V₄', 4], ['ℤ₅', 5], ['ℤ₆', 6], ['S₃', 6],
      ['ℤ₇', 7], ['ℤ₈', 8], ['ℤ₄×ℤ₂', 8], ['ℤ₂³', 8], ['D₄', 8], ['Q₈', 8],
    ]);
  });
  for (const G of catalogue()) it(`${G.name}: closure, associativity, identity, inverses and commutativity`, () => {
    expect(new Set(G.labels).size).toBe(G.order);
    let abelian = true;
    for (let i = 0; i < G.order; i++) {
      expect(G.mul(0, i)).toBe(i); expect(G.mul(i, 0)).toBe(i);
      expect(G.mul(i, G.inv(i))).toBe(0); expect(G.mul(G.inv(i), i)).toBe(0);
      for (let j = 0; j < G.order; j++) {
        expect(G.mul(i, j)).toBeGreaterThanOrEqual(0); expect(G.mul(i, j)).toBeLessThan(G.order);
        if (G.mul(i, j) !== G.mul(j, i)) abelian = false;
        for (let k = 0; k < G.order; k++) expect(G.mul(G.mul(i, j), k)).toBe(G.mul(i, G.mul(j, k)));
      }
    }
    expect(abelian).toBe(!['S₃', 'D₄', 'Q₈'].includes(G.name));
  });
  it('uses the requested nonabelian labels and multiplication conventions', () => {
    const S = catalogue().find(G => G.name === 'S₃')!;
    expect(S.labels).toEqual(['e', '(12)', '(13)', '(23)', '(123)', '(132)']);
    expect(S.labels[S.mul(1, 3)]).toBe('(123)');
    const D = catalogue().find(G => G.name === 'D₄')!;
    expect(D.mul(1, 4)).toBe(7); expect(D.mul(4, 1)).toBe(5);
    const Q = catalogue().find(G => G.name === 'Q₈')!;
    expect(Q.mul(2, 4)).toBe(6); expect(Q.mul(4, 2)).toBe(7);
    expect(Q.mul(2, 2)).toBe(1);
  });
  it('distinguishes the five order-eight isomorphism types by element orders', () => {
    const orders = catalogue().filter(G => G.order === 8).map(G => {
      const os = G.labels.map((_, i) => { let p = 0; for (let n = 1; n <= 8; n++) { p = G.mul(p, i); if (p === 0) return n; } throw new Error('bad order'); });
      return os.sort((a, b) => a - b);
    });
    expect(orders).toEqual([[1, 2, 4, 4, 8, 8, 8, 8], [1, 2, 2, 2, 4, 4, 4, 4], [1, 2, 2, 2, 2, 2, 2, 2], [1, 2, 2, 2, 2, 2, 4, 4], [1, 2, 4, 4, 4, 4, 4, 4]]);
  });
});

describe('evaluation and quantified semantics', () => {
  const G = catalogue().find(G => G.name === 'S₃')!;
  it('evaluates atoms, identity, inverse and ordered products', () => {
    expect(evalTerm(G, a, { a: 1 })).toBe(1); expect(evalTerm(G, e, {})).toBe(0);
    expect(evalTerm(G, inv(a), { a: 4 })).toBe(5);
    expect(evalTerm(G, mul(a, b, inv(a)), { a: 1, b: 3 })).toBe(2);
    expect(() => evalTerm(G, x, { x: 1 })).toThrow(/meta/);
    expect(() => evalTerm(G, a, {})).toThrow(/assignment/);
  });
  it('handles equality, inequality, bottom and exact size', () => {
    expect(holds(G, eq(a, e), { a: 0 })).toBe(true);
    expect(holds(G, { k: 'neq', l: a, r: e }, { a: 1 })).toBe(true);
    expect(holds(G, { k: 'bot' }, {})).toBe(false);
    expect(holds(G, { k: 'size', n: 6 }, {})).toBe(true);
    expect(holds(G, { k: 'size', n: 7 }, {})).toBe(false);
  });
  it('quantifies all metas, preserves atoms and does not mutate the input', () => {
    const s = { a: 1, x: 0 };
    expect(holds(G, { k: 'law', metas: ['x'], l: x, r: e }, s)).toBe(false);
    expect(holds(G, { k: 'law', metas: ['x'], l: mul(inv(x), x), r: e }, s)).toBe(true);
    expect(holds(G, { k: 'law', metas: ['x', 'y'], l: mul(x, y), r: mul(y, x) }, s)).toBe(false);
    expect(holds(G, { k: 'law', metas: ['x'], l: mul(a, x), r: x }, s)).toBe(false);
    expect(s).toEqual({ a: 1, x: 0 });
    const atomX: Term = { k: 'atom', id: 'x' };
    expect(holds(G, { k: 'law', metas: ['x'], l: atomX, r: e }, { x: 0 })).toBe(true);
  });
  it('implements universal implication, multiple premises, and empty quantifiers', () => {
    expect(holds(G, { k: 'cond', metas: ['x', 'y'], premises: [eq(mul(x, y), e)], concl: eq(y, inv(x)) }, {})).toBe(true);
    expect(holds(G, { k: 'cond', metas: ['x'], premises: [{ k: 'neq', l: x, r: e }], concl: eq(x, e) }, {})).toBe(false);
    expect(holds(G, { k: 'cond', metas: ['x'], premises: [eq(x, e), { k: 'neq', l: x, r: e }], concl: eq(a, e) }, { a: 1 })).toBe(true);
    expect(holds(G, { k: 'cond', metas: ['x'], premises: [], concl: eq(x, e) }, {})).toBe(false);
    expect(holds(G, { k: 'law', metas: [], l: e, r: e }, {})).toBe(true);
  });
});

describe('conjecture lab', () => {
  it('returns the smallest labeled counterexample', () => {
    expect(testClaim(eq(mul(a, b), mul(b, a)), atoms, [])).toEqual({ k: 'counterexample', group: 'S₃', assignment: { a: '(12)', b: '(13)' }, lhs: '(132)', rhs: '(123)' });
  });
  it('counts eligible groups and satisfying assignments, including zero atoms', () => {
    const count = catalogue().reduce((sum, G) => sum + G.order ** 2, 0);
    expect(testClaim(eq(a, a), atoms, [])).toEqual({ k: 'survives', groups: 14, assignments: count });
    expect(testClaim(eq(e, e), [], [])).toEqual({ k: 'survives', groups: 14, assignments: 14 });
    expect(testClaim(eq(a, e), atoms.slice(0, 1), [eq(a, e)])).toEqual({ k: 'survives', groups: 14, assignments: 14 });
  });
  it('restricts size exactly, including unavailable or inconsistent orders', () => {
    expect(testClaim(eq(a, a), atoms, [{ k: 'size', n: 7 }])).toEqual({ k: 'survives', groups: 1, assignments: 49 });
    expect(testClaim(eq(a, a), atoms, [{ k: 'size', n: 9 }])).toEqual({ k: 'vacuous', groups: 0 });
    expect(testClaim(eq(a, a), atoms, [{ k: 'size', n: 7 }, { k: 'size', n: 6 }])).toEqual({ k: 'vacuous', groups: 0 });
    expect(testClaim(eq(a, a), atoms, [{ k: 'bot' }])).toEqual({ k: 'vacuous', groups: 14 });
  });
  it('respects universal assumptions and evaluates non-equality claims', () => {
    const squares: Fact = { k: 'law', metas: ['x'], l: mul(x, x), r: e };
    expect(testClaim(eq(mul(a, b), mul(b, a)), atoms, [squares]).k).toBe('survives');
    expect(testClaim({ k: 'neq', l: a, r: e }, atoms, []).k).toBe('counterexample');
    expect(testClaim({ k: 'bot' }, [], []).k).toBe('counterexample');
    expect(testClaim({ k: 'size', n: 2 }, [], []).k).toBe('counterexample');
  });
  for (const level of LEVELS) it(`${level.id}: declared goal survives its givens`, () => {
    for (const socket of level.sockets) {
      const t = socket.target;
      if (t.k === 'law' || t.k === 'cond') continue; // ∀ goals are checked by the oracle, not as claims
      expect(testClaim(t, level.atoms, level.givens.map(g => g.fact), level).k).toBe('survives');
    }
  });
  it('enumerates two atoms across the full catalogue in under 30 ms', () => {
    const claim = eq(inv(mul(a, b)), mul(inv(b), inv(a)));
    const start = performance.now();
    const result = testClaim(claim, atoms, []);
    const elapsed = performance.now() - start;
    console.log(`testClaim: ${elapsed.toFixed(3)} ms (two atoms, all 14 groups)`);
    expect(result.k).toBe('survives'); expect(elapsed).toBeLessThan(30);
  });
});
