// P8.2 Conjugation Relabels — Book world 6. Spool σ(παπ⁻¹, r) → action law twice → σ(π, σ(α, σ(π⁻¹, r))) →
// r ⟶ σ(π, p) (h₁ backwards) → action law backwards → cancel π⁻¹π → σ(e, p) = p → σ(α, p) = q (h₃) → σ(π, q) = s (h₂).
import { describe, expect, it } from 'vitest';
import type * as K from '../../src/kernel';
import * as F from '../../src/factory';
import { bookFloor, deliverC, lvC, nontrivialAll, targetsTrueC, app, given, schema, lawRw, spool, cancel, I, P, eq } from './kit-wC';

const L = lvC('P8.2');
const A = (id: string): K.Term => ({ k: 'atom', id });
const pi = A('pi'), a = A('a'), r = A('r');
const sig = (g: K.Term, pt: K.Term) => app('act', g, pt);

export function buildP82() {
  const f = bookFloor(L, ['cancel', 'witness', 'socks']);
  const sp = f.add(spool(sig(P(pi, a, I(pi)), r)));
  const m1 = f.add(lawRw(schema('act.mul')));
  const m2 = f.add(lawRw(schema('act.mul')));
  const h1 = f.add(lawRw(given('h1'), { dir: 'rev' }));
  // the inner pair σ(π⁻¹, σ(π, p)) sits at arguments 1, 1 of σ(π, σ(α, σ(π⁻¹, σ(π, p))))
  const arriving = eq(sig(P(pi, a, I(pi)), r), sig(pi, sig(a, sig(I(pi), sig(A('pi'), A('p'))))));
  const inner = F.pinFromAddr(arriving, { side: 'r', path: [1, 1] });
  if (!inner) throw new Error('no inner pin');
  const m3 = f.add(lawRw(schema('act.mul'), { dir: 'rev', target: inner }));
  const cn = f.add(cancel());
  const e = f.add(lawRw(schema('act.e')));
  const h3 = f.add(lawRw(given('h3')));
  const h2 = f.add(lawRw(given('h2')));
  f.wire(sp, m1); f.wire(m1, m2); f.wire(m2, h1); f.wire(h1, m3); f.wire(m3, cn); f.wire(cn, e); f.wire(e, h3); f.wire(h3, h2); f.wire(h2, f.socket());
  return f;
}

describe('P8.2 Conjugation Relabels', () => {
  it('the dock is true in every model of its givens, with at least 10 nontrivial models', () => {
    targetsTrueC(L);
    expect(nontrivialAll(L).s).toBeGreaterThanOrEqual(10);
  });
  it('every given is needed', () => {
    for (const drop of L.sockets[0]!.allowedGivens) {
      const weak = { ...L, sockets: [{ ...L.sockets[0]!, allowedGivens: L.sockets[0]!.allowedGivens.filter((g) => g !== drop) }] };
      expect(() => targetsTrueC(weak), `dropping ${drop}`).toThrow();
    }
  });
  it('reference solution', () => {
    deliverC(buildP82());
  }, 60_000);
});
