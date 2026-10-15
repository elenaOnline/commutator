// P7.2 The Stabilizer — Book world 6. An action σ(g, p) of G on Ω; the laws σ(gh, p) = σ(g, σ(h, p)) and σ(e, p) = p are free.
//   s1: Spool σ(αβ, p) → action law → σ(β, p) = p (h_b) → σ(α, p) = p (h_a).
//   s2: Spool σ(α⁻¹, p) → p ⟶ σ(α, p) (h_a backwards, in the point slot) → action law backwards → cancel α⁻¹α → σ(e, p) = p.
import { describe, expect, it } from 'vitest';
import type * as K from '../../src/kernel';
import { bookFloor, deliverC, lvC, nontrivialAll, targetsTrueC, app, given, schema, lawRw, spool, cancel, I, P } from './kit-wC';

const L = lvC('P7.2');
const A = (id: string): K.Term => ({ k: 'atom', id });
const a = A('a'), b = A('b'), p = A('p');
const sig = (g: K.Term, pt: K.Term) => app('act', g, pt);

export function buildP72() {
  const f = bookFloor(L, ['cancel', 'witness', 'socks']);
  // s1
  const sp1 = f.add(spool(sig(P(a, b), p)));
  const m1 = f.add(lawRw(schema('act.mul')));
  const hb = f.add(lawRw(given('hb')));
  const ha = f.add(lawRw(given('ha')));
  f.wire(sp1, m1); f.wire(m1, hb); f.wire(hb, ha); f.wire(ha, f.socket('s1'));
  // s2
  const sp2 = f.add(spool(sig(I(a), p)));
  const back = f.add(lawRw(given('ha'), { dir: 'rev' }));
  const m2 = f.add(lawRw(schema('act.mul'), { dir: 'rev' }));
  const cn = f.add(cancel());
  const e = f.add(lawRw(schema('act.e')));
  f.wire(sp2, back); f.wire(back, m2); f.wire(m2, cn); f.wire(cn, e); f.wire(e, f.socket('s2'));
  return f;
}

describe('P7.2 The Stabilizer', () => {
  it('both docks are true in every model of their givens, with at least 10 nontrivial models each', () => {
    targetsTrueC(L);
    const n = nontrivialAll(L);
    expect(n.s1).toBeGreaterThanOrEqual(10);
    expect(n.s2).toBeGreaterThanOrEqual(10);
  });
  it('s2 needs h_a', () => {
    const weak = { ...L, sockets: [{ ...L.sockets[1]!, allowedGivens: [] }] };
    expect(() => targetsTrueC(weak)).toThrow();
  });
  it('reference solution', () => {
    deliverC(buildP72());
  }, 60_000);
});
