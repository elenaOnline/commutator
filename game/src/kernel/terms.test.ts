import { describe, expect, it } from 'vitest';
import * as K from './index';
import type { Term } from './types';

const a = K.atom('a'), b = K.atom('b'), c = K.atom('c');
const x = K.meta('x'), u = K.meta('u'), v = K.meta('v');
const I = K.inv, M = (...fs: Term[]) => K.mul(fs), e = K.E;
const L = { a: 'a', b: 'b', c: 'c', e1: 'e′' };
const atoms = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'e1', label: 'e′', hue: 3 }];
const txt = (t: Term) => K.termText(t, L);

describe('constructors and norm', () => {
  it('flattens, collapses singletons, keeps e and inverses', () => {
    expect(K.norm({ k: 'mul', fs: [a, { k: 'mul', fs: [b, c] }] })).toEqual({ k: 'mul', fs: [a, b, c] });
    expect(K.norm({ k: 'mul', fs: [a] })).toEqual(a);
    expect(() => K.norm({ k: 'mul', fs: [] })).toThrow();
    expect(() => K.mul([])).toThrow();
    expect(M(a, e, I(a))).toEqual({ k: 'mul', fs: [a, e, { k: 'inv', arg: a }] });
    expect(K.norm(I(I(a)))).toEqual({ k: 'inv', arg: { k: 'inv', arg: a } });
    expect(K.norm({ k: 'inv', arg: { k: 'mul', fs: [a, { k: 'mul', fs: [b, c] }] } })).toEqual(I(M(a, b, c)));
  });
  it('pow, termEq, ground, metas', () => {
    expect(K.pow(M(a, b), 3)).toEqual(M(a, b, a, b, a, b));
    expect(K.pow(a, 1)).toEqual(a);
    expect(() => K.pow(a, 0)).toThrow();
    expect(K.termEq({ k: 'mul', fs: [{ k: 'mul', fs: [a, b] }, c] }, M(a, b, c))).toBe(true);
    expect(K.termEq(M(a, b), M(b, a))).toBe(false);
    expect(K.isGround(M(a, x))).toBe(false);
    expect(K.metasOf(M(u, v, u, I(x)))).toEqual(['u', 'v', 'x']);
  });
  it('instantiate substitutes and flattens; throws when unbound', () => {
    expect(K.instantiate(M(x, x), { x: M(b, a) })).toEqual(M(b, a, b, a));
    expect(K.instantiate(I(M(u, v)), { u: a, v: M(b, c) })).toEqual(I(M(a, b, c)));
    expect(() => K.instantiate(M(x, u), { x: a })).toThrow();
  });
  it('mirror reverses every product including inside crates', () => {
    expect(K.mirrorTerm(M(a, I(M(b, c)), a))).toEqual(M(a, I(M(c, b)), a));
    const w = K.mirrorCard({ k: 'cond', metas: ['u', 'v'], premises: [{ k: 'eq', l: M(u, v), r: e }], concl: { k: 'eq', l: v, r: I(u) } });
    expect(w).toEqual({ k: 'cond', metas: ['u', 'v'], premises: [{ k: 'eq', l: M(v, u), r: e }], concl: { k: 'eq', l: v, r: I(u) } });
  });
});

describe('match', () => {
  const ms = (p: Term, t: Term) => K.match(p, t).map((s) => Object.fromEntries(Object.entries(s).map(([k, vv]) => [k, txt(vv)])));
  it('metas bind non-empty contiguous runs', () => {
    expect(ms(M(u, v), M(a, b, c))).toEqual([{ u: 'a', v: 'bc' }, { u: 'ab', v: 'c' }]);
    expect(ms(M(u, v), a)).toEqual([]);
  });
  it('repeated metas bind the same term', () => {
    expect(ms(M(x, x), M(a, b, a, b))).toEqual([{ x: 'ab' }]);
    expect(ms(M(x, x), M(a, a, a))).toEqual([]);
    expect(ms(M(x, x), M(a, b))).toEqual([]);
  });
  it('inv(pattern) matches only an inv and the whole argument', () => {
    expect(ms(I(x), I(M(a, b)))).toEqual([{ x: 'ab' }]);
    expect(ms(M(I(x), x), M(I(M(a, b)), a, b))).toEqual([{ x: 'ab' }]);
    expect(ms(M(x, I(x)), M(a, I(M(a, b))))).toEqual([]);
    expect(ms(I(M(u, v)), I(M(a, b, c)))).toEqual([{ u: 'a', v: 'bc' }, { u: 'ab', v: 'c' }]);
    expect(ms(I(x), a)).toEqual([]);
  });
  it('meta may bind e; partial substitutions are respected', () => {
    expect(ms(M(e, x), M(e, e))).toEqual([{ x: 'e' }]);
    expect(K.match(M(u, v), M(a, b, c), { u: M(a, b) }).length).toBe(1);
    expect(K.match(M(u, v), M(a, b, c), { u: b }).length).toBe(0);
  });
});

describe('termAt and addresses', () => {
  const p = { k: 'eq' as const, l: M(a, I(M(a, b)), c), r: e };
  it('selects spans, whole terms, and inside crates', () => {
    expect(K.termAt(p, { side: 'l', path: [], range: [0, 2] })).toEqual(M(a, I(M(a, b))));
    expect(K.termAt(p, { side: 'l', path: [1] })).toEqual(I(M(a, b)));
    expect(K.termAt(p, { side: 'l', path: [1, 0], range: [1, 2] })).toEqual(b);
    expect(K.termAt(p, { side: 'r', path: [] })).toEqual(e);
  });
  it('rejects invalid addresses', () => {
    expect(K.termAt(p, { side: 'l', path: [], range: [2, 2] })).toBeNull();
    expect(K.termAt(p, { side: 'l', path: [], range: [0, 4] })).toBeNull();
    expect(K.termAt(p, { side: 'l', path: [1, 1] })).toBeNull();
    expect(K.termAt(p, { side: 'l', path: [0, 0] })).toBeNull();
    expect(K.termAt({ k: 'bot' }, { side: 'l', path: [] })).toBeNull();
  });
});

describe('printing', () => {
  it('text', () => {
    expect(txt(I(M(a, b)))).toBe('(ab)⁻¹');
    expect(K.factText({ k: 'eq', l: I(M(a, b)), r: M(I(b), I(a)) }, L)).toBe('(ab)⁻¹ = b⁻¹a⁻¹');
    expect(txt(M(a, a, a, b))).toBe('a³b');
    expect(txt(K.pow(M(a, b), 5))).toBe('(ab)⁵');
    expect(txt(M(a, a, b, b))).toBe('aabb');
    expect(txt(I(I(a)))).toBe('(a⁻¹)⁻¹');
    expect(txt(K.atom('e1'))).toBe('e′');
    expect(K.factText({ k: 'neq', l: a, r: e }, L)).toBe('a ≠ e');
    expect(K.factText({ k: 'size', n: 7 }, L)).toBe('|G| = 7');
    expect(K.factText({ k: 'law', metas: ['x'], l: M(x, x), r: e }, L)).toBe('∀x. xx = e');
    expect(K.factText({ k: 'cond', metas: ['x'], premises: [{ k: 'neq', l: x, r: e }], concl: { k: 'eq', l: M(a, x), r: x } }, L)).toBe('∀x. x ≠ e ⇒ ax = x');
  });
  it('tex', () => {
    expect(K.factTex({ k: 'eq', l: I(M(a, b)), r: M(I(b), I(a)) }, L)).toBe('(ab)^{-1} = b^{-1}a^{-1}');
    expect(K.termTex(K.atom('e1'), L)).toBe("e'");
    expect(K.factTex({ k: 'neq', l: a, r: e }, L)).toBe('a \\neq e');
    expect(K.termTex(K.pow(a, 3), L)).toBe('a^{3}');
  });
});

describe('parseTerm', () => {
  const P = (s: string) => K.parseTerm(s, atoms);
  const ok = (s: string) => { const r = P(s); if (!r.ok) throw new Error(r.error); return r.term; };
  it('accepts the grammar and its spellings', () => {
    expect(ok('ab')).toEqual(M(a, b));
    expect(ok('a b^-1')).toEqual(M(a, I(b)));
    expect(ok('(ab)^-1')).toEqual(I(M(a, b)));
    expect(ok('(ab)⁻¹')).toEqual(I(M(a, b)));
    expect(ok('a^3')).toEqual(M(a, a, a));
    expect(ok('(ab)^2')).toEqual(M(a, b, a, b));
    expect(ok('a²')).toEqual(M(a, a));
    expect(ok("e'")).toEqual(K.atom('e1'));
    expect(ok('e′ e')).toEqual(M(K.atom('e1'), e));
    expect(ok('a·b*a')).toEqual(M(a, b, a));
    expect(ok('a^-1^-1')).toEqual(I(I(a)));
    expect(ok('a^{-1}')).toEqual(I(a));
    expect(ok('e')).toEqual(e);
  });
  it('rejects undeclared names and malformed input', () => {
    const z = P('az');
    expect(z.ok).toBe(false);
    if (!z.ok) expect(z.error).toMatch(/no element called/);
    expect(P('').ok).toBe(false);
    expect(P('(ab').ok).toBe(false);
    expect(P('ab)').ok).toBe(false);
    expect(P('a^0').ok).toBe(false);
    expect(P('a^').ok).toBe(false);
  });
});
