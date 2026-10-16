// final W8–14 N5: a law's own letters never read as the floor's Tower letters in a lens (P10.3, P11.2, P15.4).
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import type { Card, Term } from '../kernel/types';
import { metaNames, renameMetas, zMetas } from './metas';

const X: Term = { k: 'meta', id: 'x' };
const pw = (id: string): Term => ({ k: 'pow', base: X, exp: [{ coefficient: '1', monomial: [{ ref: { k: 'zmeta', id }, degree: 1 }] }] } as Term);
// product of powers: ∀x, m, n. xᵐxⁿ = x^(m+n)
const pp: Card = { k: 'law', metas: ['x', 'm', 'n'], l: { k: 'mul', fs: [pw('m'), pw('n')] }, r: { k: 'pow', base: X, exp: [
  { coefficient: '1', monomial: [{ ref: { k: 'zmeta', id: 'm' }, degree: 1 }] }, { coefficient: '1', monomial: [{ ref: { k: 'zmeta', id: 'n' }, degree: 1 }] }] } as Term };

describe('law letters beside Tower letters (N5)', () => {
  it('a ℤ Tower m: the law’s m is shown as a fresh integer letter, n keeps its own', () => {
    const nm = metaNames(pp, ['x', 'm'], [...zMetas(pp)]);
    expect(nm).toEqual({ m: 'a' });
    const shown = renameMetas(pp, nm);
    expect(K.factText(shown, {})).toBe(K.factText(pp, {}).replace(/m/g, 'a'));
    expect(shown.metas).toEqual(['x', 'a', 'n']);
    expect(pp.metas).toEqual(['x', 'm', 'n']); // the card itself is untouched (configs stay keyed by m)
  });
  it('Towers m and n (P15.4): both are renamed, to different letters, never to a floor letter', () => {
    expect(metaNames(pp, ['m', 'n', 'a'], ['m', 'n'])).toEqual({ m: 'b', n: 'c' });
  });
  it('only the metas asked for are renamed (a matched x keeps its letter); no clash, no change', () => {
    expect(metaNames(pp, ['x', 'y'], ['m', 'n'])).toEqual({});
    expect(renameMetas(pp, {})).toBe(pp);
  });
});
