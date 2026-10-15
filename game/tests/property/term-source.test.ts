// Text fields pre-fill with K.termSource: parseTerm(termSource(t)) must give back t (normalised) for every term
// the slots can hold — words, inverses, powers with literal and ℤ-Tower exponents, map frames, actions and
// sorted identities. (Display text does not round-trip: `a⁶` is a word to the reader, `a^6` is the word too.)
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { same } from '../../src/kernel/terms';
import type { AtomDecl, MapDecl, Poly, SortDecl, Term } from '../../src/kernel/types';

function rng(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
}

// awkward labels on purpose: a prime, subscripts, and "ab" (which a juxtaposed a·b must not turn into)
const atoms: AtomDecl[] = [
  { id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'ab', label: 'ab', hue: 2 },
  { id: 'c', label: 'c′', hue: 3 }, { id: 'x1', label: 'x₁', hue: 4, variable: true },
  { id: 'n1', label: 'n₁', hue: 5, variable: true, sort: 'Z' }, { id: 'k', label: 'k', hue: 0, variable: true, sort: 'Z' },
];
const sorts: SortDecl[] = [{ id: 'G', kind: 'group', label: 'G' }, { id: 'K', kind: 'group', label: 'K' }, { id: 'O', kind: 'set', label: 'Ω' }];
const maps: MapDecl[] = [
  { id: 'f', label: 'f', args: ['G'], res: 'K', kind: 'hom' },
  { id: 'pi', label: 'π', args: ['G'], res: 'K', kind: 'hom' },
  { id: 'sig', label: 'σ', args: ['G', 'O'], res: 'O', kind: 'action' },
];
const L: K.Labels = {
  ...K.labelsOf(atoms), ...Object.fromEntries(sorts.map((s) => [s.id, s.label])), ...Object.fromEntries(maps.map((m) => [m.id, m.label])),
};

describe('termSource round-trips through the slot parser', () => {
  it('fixed cases', () => {
    const a: Term = { k: 'atom', id: 'a' }, b: Term = { k: 'atom', id: 'b' };
    const cases: [Term, string][] = [
      [{ k: 'pow', base: a, exp: K.polyConst(6) }, 'a^(6)'],
      [{ k: 'mul', fs: [a, a, a, a, a, a] }, 'a⁶'],
      [{ k: 'mul', fs: [a, b] }, 'a b'],
      [{ k: 'inv', arg: { k: 'mul', fs: [a, b] } }, '(a b)⁻¹'],
      [{ k: 'e', s: 'K' }, 'e_K'],
      [{ k: 'app', fn: 'pi', args: [a] }, 'π(a)'],
      [{ k: 'app', fn: 'sig', args: [a, b] }, 'σ(a, b)'],
    ];
    for (const [t, src] of cases) {
      expect(K.termSource(t, L)).toBe(src);
      const p = K.parseTerm(src, atoms, { maps, sorts });
      expect(p.ok && same(p.term, K.norm(t)), src).toBe(true);
    }
  });

  it('random terms: pow (literal and ℤ exponents), inverses, map frames, actions, sorted e', () => {
    const random = rng(0x5eed);
    const G = ['a', 'b', 'ab', 'c', 'x1'];
    const poly = (): Poly => {
      const pick = random(4);
      if (pick === 0) return K.polyConst(random(13) - 6);
      const n: Poly = [{ coefficient: '1', monomial: [{ ref: { k: 'zvar', id: random(2) ? 'n1' : 'k' }, degree: 1 + random(2) }] }];
      return K.polyAdd(K.polyMul(n, K.polyConst(random(7) - 3 || 1)), K.polyConst(random(5) - 2));
    };
    const gen = (d: number): Term => {
      const r = random(d > 0 ? 8 : 3);
      if (r === 0) return { k: 'atom', id: G[random(G.length)]! };
      if (r === 1) return random(2) ? { k: 'e' } : { k: 'e', s: 'K' };
      if (r === 2) return { k: 'atom', id: G[random(G.length)]! };
      if (r === 3) return { k: 'inv', arg: gen(d - 1) };
      if (r === 4) return { k: 'pow', base: gen(d - 1), exp: poly() };
      if (r === 5) return { k: 'app', fn: random(2) ? 'f' : 'pi', args: [gen(d - 1)] };
      if (r === 6) return { k: 'app', fn: 'sig', args: [gen(d - 1), gen(d - 1)] };
      const n = 2 + random(4);
      const one = gen(d - 1);
      return { k: 'mul', fs: Array.from({ length: n }, () => (random(3) ? one : gen(d - 1))) };
    };
    let n = 0;
    for (let i = 0; i < 1500; i++) {
      const t = K.norm(gen(3));
      const src = K.termSource(t, L);
      const p = K.parseTerm(src, atoms, { maps, sorts });
      if (!p.ok) throw new Error(`${src}: ${p.error}`);
      expect(same(p.term, t), `${src} → ${K.termText(p.term, L)}`).toBe(true);
      if (src.includes('^(')) n++;
    }
    expect(n).toBeGreaterThan(100);
  });

  it('factSource prints both sides as source', () => {
    const a: Term = { k: 'atom', id: 'a' };
    expect(K.factSource({ k: 'eq', l: { k: 'pow', base: a, exp: K.polyConst(2) }, r: { k: 'e' } }, L)).toBe('a^(2) = e');
  });
});
