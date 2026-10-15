// v4 Phase B acceptance cases E01–E70 (design/v4/proposals/sol-exponents.md §8).
// a,b,c constants; x₁,y₁ G Towers; n₁,k₁ ℤ Towers; M,N ℤ metas; X a G meta.
import { describe, expect, it } from 'vitest';
import * as K from './index';
import type { Card, Fact, Pallet, Poly, ProofGraph, StepOp, Subst, Term } from './types';
import { ROOT } from './types';
import { Player, mkCtx } from './testkit';
import { oracleCheck } from '../groups/oracle';
import { REGISTRY } from '../levels/levels';

const ALL = ['power.add', 'power.multiply', 'power.zero', 'power.one', 'power.identity', 'power.inverseBase', 'power.negate', 'power.conjugate', 'power.literal'];
const a = K.atom('a'), b = K.atom('b'), c = K.atom('c'), e = K.E;
const M = (...fs: Term[]) => K.mul(fs);
const ZM = (id: string) => K.polyZmeta(id);
const pw = (t: Term, p: Poly) => K.power(t, p);
const lit = (n: number | string) => K.polyConst(BigInt(n));
const int = (p: Poly): Term => K.intVal(p);

function world(schemas = ALL, extra: Parameters<typeof mkCtx>[0] = {}) {
  const p = new Player(mkCtx({ ...extra, tools: { schemas, ...(extra.tools ?? {}) } }));
  const n1 = p.declareInt('n₁'), k1 = p.declareInt('k₁');
  const x1 = p.declareVar('x₁'), y1 = p.declareVar('y₁');
  const v = () => K.withVars(p.ctx, p.graph).ctx;
  const T = (src: string) => p.parse(src);
  const Zp = (src: string): Poly => { const r = K.parseInteger(src, v().level.atoms); if (!r.ok) throw new Error(r.error); return (r.term as { val: Poly }).val; };
  const Zt = (src: string) => int(Zp(src));
  /** Rewrite the whole right rail t (or [s,e)) with an imported schema; returns the new rail or 'ERR: …'. */
  const rw = (t: Term, id: string, dir: 'fwd' | 'rev', subst: Subst, range?: [number, number], mirror = false): Term | string => {
    const op: StepOp = { k: 'rewrite', rule: mirror ? { k: 'schema', id, mirror: true } : { k: 'schema', id }, dir, at: { side: 'r', path: [], range: range ?? [0, K.word(t).length] }, subst };
    const r = K.evalStep({ k: 'eq', l: e, r: t }, op, v());
    return r.ok ? (r.pallet as { r: Term }).r : `ERR: ${r.error}`;
  };
  return { p, n1, k1, x1, y1, v, T, Zp, Zt, rw, X1: K.atom(x1), Y1: K.atom(y1), N1: K.polyZvar(n1), K1: K.polyZvar(k1) };
}
const ok = (r: Term | string, want: Term) => { expect(typeof r, String(r)).toBe('object'); expect(K.termEq(r as Term, want)).toBe(true); };
const rej = (r: Term | string, re?: RegExp) => { expect(r).toMatch(/^ERR/); if (re) expect(r).toMatch(re); };
const law = (metas: string[], l: Term, r: Term): Card => ({ k: 'law', metas, l, r });

describe('E01–E09 normalization is conservative', () => {
  const w = world();
  it('E01 associativity unchanged', () => expect(K.termEq(M(M(a, b), c), M(a, M(b, c)))).toBe(true));
  it('E02 no unit/cancellation/involution', () => {
    expect(K.norm(M(a, e))).toEqual({ k: 'mul', fs: [a, e] });
    expect(K.norm(M(a, K.inv(a))).k).toBe('mul');
    expect(K.norm(K.inv(K.inv(a))).k).toBe('inv');
  });
  it('E03 integer arithmetic in exponents', () => expect(K.termEq(w.T('a^(2n₁+3n₁)'), w.T('a^(5n₁)'))).toBe(true));
  it('E04 integer distribution only', () => expect(K.termEq(w.T('a^((n₁+k₁)*n₁)'), w.T('a^(n₁^2+n₁k₁)'))).toBe(true));
  it('E05 a^(n₁-n₁) is a⁰, still a power', () => {
    const t = w.T('a^(n₁-n₁)');
    expect(t).toEqual({ k: 'pow', base: a, exp: [] });
    expect(K.termEq(t, e)).toBe(false);
  });
  it('E06 a¹ ≠ a; power.one', () => { expect(K.termEq(w.T('a^(1)'), a)).toBe(false); ok(w.rw(w.T('a^(1)'), 'power.one', 'fwd', { x: a }), a); });
  it('E07 eⁿ ≠ e; power.identity', () => { expect(K.termEq(w.T('e^n₁'), e)).toBe(false); ok(w.rw(w.T('e^n₁'), 'power.identity', 'fwd', { n: int(w.N1) }), e); });
  it('E08 a^(5) ≠ aaaaa; literal(5) both ways', () => {
    const five = K.pow(a, 5);
    expect(K.termEq(w.T('a^(5)'), five)).toBe(false);
    ok(w.rw(w.T('a^(5)'), 'power.literal:5', 'fwd', { x: a }), five);
    ok(w.rw(five, 'power.literal:5', 'rev', { x: a }), w.T('a^(5)'));
  });
  it('E09 (aⁿ)ᵏ ≠ a^(nk); power.multiply', () => {
    expect(K.termEq(w.T('(a^n₁)^k₁'), w.T('a^(n₁k₁)'))).toBe(false);
    ok(w.rw(w.T('(a^n₁)^k₁'), 'power.multiply', 'fwd', { x: a, m: int(w.N1), n: int(w.K1) }), w.T('a^(n₁k₁)'));
  });
});

describe('E10–E20 the imported laws', () => {
  const w = world();
  it('E10 power.add, inferred by matching', () => {
    const t = w.T('a^n₁ a^k₁');
    const card = K.powerSchema('power.add')!.card as Card & { k: 'law' };
    const [s] = K.match(card.l, t);
    expect(s).toBeDefined();
    ok(w.rw(t, 'power.add', 'fwd', s!), w.T('a^(n₁+k₁)'));
  });
  it('E11 different bases do not add', () => {
    const card = K.powerSchema('power.add')!.card as Card & { k: 'law' };
    expect(K.match(card.l, w.T('a^n₁ b^k₁'))).toEqual([]);
    rej(w.rw(w.T('a^n₁ b^k₁'), 'power.add', 'fwd', { x: a, m: int(w.N1), n: int(w.K1) }));
  });
  it('E12 signed multiply', () => ok(w.rw(w.T('(a^-2)^-3'), 'power.multiply', 'fwd', { x: a, m: int(lit(-2)), n: int(lit(-3)) }), w.T('a^(6)')));
  it('E13 negate at n = -3', () => ok(w.rw(w.T('a^(3)'), 'power.negate', 'fwd', { x: a, n: int(lit(-3)) }), K.inv(w.T('a^-3'))));
  it('E14 inverse base at n = -2', () => ok(w.rw(w.T('(a^-1)^-2'), 'power.inverseBase', 'fwd', { x: a, n: int(lit(-2)) }), w.T('a^(2)')));
  it('E15 e⁰ = e by power.zero (not numerical 0⁰)', () => ok(w.rw(w.T('e^0'), 'power.zero', 'fwd', { x: e }), e));
  it('E16 numbers are not group elements; no empty base', () => {
    const atoms = w.v().level.atoms;
    expect(K.parseTerm('0^0', atoms).ok).toBe(false);
    expect(K.parseTerm('(0)^n₁', atoms).ok).toBe(false);
    expect(K.parseTerm('()^n₁', atoms).ok).toBe(false);
  });
  it('E17 a^-3 is an opaque power', () => expect(w.T('a^-3')).toEqual({ k: 'pow', base: a, exp: [{ coefficient: '-3', monomial: [] }] }));
  it('E18 no product-power distribution', () => {
    expect(K.termEq(w.T('(ab)^n₁'), w.T('a^n₁ b^n₁'))).toBe(false);
    const g: ProofGraph = { ...w.p.graph, nodes: [{ id: 's', scope: ROOT, k: 'start', term: w.T('(ab)^n₁') }] };
    const offers = K.offersAt(g, K.check(g, w.p.ctx), 's', { side: 'r', path: [], range: [0, 1] }, w.p.ctx);
    expect(offers.some((o) => o.preview?.k === 'eq' && K.termEq(o.preview.r, w.T('a^n₁ b^n₁')))).toBe(false);
  });
  it('E19 the distribution claim is semantically false (S₃, n = 2)', () => {
    const level = w.v().level;
    const bad = oracleCheck(level, { d: { ok: true, deps: [], fact: { k: 'eq', l: w.T('(ab)^n₁'), r: w.T('a^n₁ b^n₁') } } }, [], []);
    expect(bad.length).toBe(1);
  });
  it('E20 conjugation at n = 0 and n = -4', () => {
    for (const n of [0, -4]) {
      const t = pw(M(K.inv(a), b, a), lit(n));
      ok(w.rw(t, 'power.conjugate', 'fwd', { u: a, v: b, n: int(lit(n)) }), M(K.inv(a), pw(b, lit(n)), a));
    }
  });
});

describe('E21–E35 typed matching, bounded inference, total substitutions', () => {
  const w = world();
  const X = K.meta('X');
  const pat = (p: Poly) => pw(X, p);
  const zs = (s: Subst, id: string) => (s[id] as { val: Poly }).val;
  it('E21 a lone meta binds the whole polynomial', () => {
    const [s] = K.match(pat(ZM('M')), w.T('a^(5k₁-2)'));
    expect(K.polyEq(zs(s!, 'M'), w.Zp('5k₁-2'))).toBe(true);
  });
  it('E22 2M+1 against 6k₁+1 infers M = 3k₁', () => {
    const [s] = K.match(pat(K.polyAdd(K.polyMul(lit(2), ZM('M')), lit(1))), w.T('a^(6k₁+1)'));
    expect(K.polyEq(zs(s!, 'M'), w.Zp('3k₁'))).toBe(true);
  });
  it('E23 2M against k₁: no offer; fractions are not integers', () => {
    expect(K.match(pat(K.polyMul(lit(2), ZM('M'))), w.T('a^k₁'))).toEqual([]);
    expect(K.parseInteger('1/2', w.v().level.atoms).ok).toBe(false);
  });
  it('E24/E25 M+N against 5k₁ needs knobs; M = 5 makes N = 5k₁-5', () => {
    const P = pat(K.polyAdd(ZM('M'), ZM('N')));
    expect(K.match(P, w.T('a^(5k₁)'))).toEqual([]);
    const open = K.matchOpen(P, w.T('a^(5k₁)'));
    expect(open.length).toBe(1);
    expect(open[0]!.M).toBeUndefined();
    const [s] = K.match(P, w.T('a^(5k₁)'), { M: int(lit(5)) });
    expect(K.polyEq(zs(s!, 'N'), w.Zp('5k₁-5'))).toBe(true);
  });
  it('E26 reverse multiply with m = 5, n = k₁', () => ok(w.rw(w.T('a^(5k₁)'), 'power.multiply', 'rev', { x: a, m: int(lit(5)), n: int(w.K1) }), w.T('(a^(5))^k₁')));
  it('E27 M*M with M = -k₁', () => {
    const sq = law(['M'], pw(a, K.polyMul(ZM('M'), ZM('M'))), e);
    const r = K.evalStep({ k: 'eq', l: e, r: w.T('a^(k₁^2)') }, { k: 'rewrite', rule: { k: 'node', id: 'L' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: { M: w.Zt('-k₁') } }, w.v(), sq);
    expect(r.ok).toBe(true);
  });
  it('E28 a repeated meta binds one polynomial', () => {
    const P = M(pw(a, ZM('M')), pw(a, ZM('M')));
    expect(K.match(P, w.T('a^n₁ a^k₁'))).toEqual([]);
    expect(K.match(P, w.T('a^n₁ a^n₁')).length).toBe(1);
  });
  it('E29 reverse identity without its integer is incomplete', () => rej(w.rw(e, 'power.identity', 'rev', {}), /needs a value for n/));
  it('E30 non-integers rejected', () => {
    for (const src of ['1/2', '2.5', 'NaN', 'Infinity']) expect(K.parseInteger(src, w.v().level.atoms).ok).toBe(false);
    rej(w.rw(e, 'power.identity', 'rev', { n: { k: 'int', val: [{ coefficient: '2.5', monomial: [] }] } }));
    rej(w.rw(e, 'power.identity', 'rev', { n: { k: 'int', val: [{ coefficient: 5 as unknown as string, monomial: [] }] } }), /decimal strings/);
  });
  it('E31 sort mismatches', () => {
    rej(w.rw(e, 'power.identity', 'rev', { n: a }), /must be an integer/);
    rej(w.rw(w.T('a^(1)'), 'power.one', 'fwd', { x: w.Zt('5') }), /integer, not a group element/);
    expect(K.parseTerm('n₁ a', w.v().level.atoms).ok).toBe(false);
  });
  it('E32 undeclared integer variable', () => rej(w.rw(e, 'power.identity', 'rev', { n: int(K.polyZvar('z:q')) }), /not an integer variable/));
  it('E33 residual / cyclic meta values', () => {
    rej(w.rw(e, 'power.identity', 'rev', { n: int(ZM('N')) }), /Use only numbers and ℤ Towers/);
    rej(w.rw(e, 'power.identity', 'rev', { n: int(K.polyAdd(ZM('n'), lit(1))) }), /Use only numbers and ℤ Towers/);
  });
  it('E34 a rigid Tower is never captured by a binder of the same name', () => {
    const P = M(pw(X, ZM('M')), pw(X, ZM('n')));
    const [s] = K.match(P, M(pw(a, w.N1), pw(a, lit(3))));
    expect(K.polyEq(zs(s!, 'M'), w.N1)).toBe(true);
    expect(K.polyEq(zs(s!, 'n'), lit(3))).toBe(true);
  });
  it('E35 a partial selection is not a redex', () => rej(w.rw(K.pow(a, 5), 'power.literal:5', 'rev', { x: a }, [0, 3])));
});

describe('E36–E40 congruence, rule kinds, lemma application', () => {
  it('E36 rewrite inside a power base keeps the exponent and the dependency', () => {
    const w = world(ALL, { givens: [{ id: 'q', name: 'q', fact: { k: 'eq', l: M(a, b), r: c } }] });
    const s = w.p.start('(ab)^n₁');
    const r = w.p.tryNode({ id: 'r1', scope: ROOT, k: 'step', input: s, op: { k: 'rewrite', rule: { k: 'node', id: 'g:q' }, dir: 'fwd', at: { side: 'r', path: [0], range: [0, 2] }, subst: {} } });
    expect(r.ok, r.error).toBe(true);
    expect(K.termEq((r.fact as { r: Term }).r, w.T('c^n₁'))).toBe(true);
    expect(r.deps).toEqual(['g:q']);
  });
  it('E37 the exponent has no address; integers are not group terms', () => {
    const w = world();
    const t = w.T('a^n₁');
    expect(K.termAt({ k: 'eq', l: t, r: t }, { side: 'r', path: [1] })).toBeNull();
    expect(w.p.tryNode({ scope: ROOT, k: 'start', term: K.atom(w.n1) }).ok).toBe(false);
  });
  it('E38 ≠, ⊥, sizes and unapplied conditionals are not rewrite rules', () => {
    const w = world();
    const t = w.T('a^n₁');
    for (const f of [{ k: 'neq', l: t, r: e }, { k: 'bot' }, { k: 'size', n: 5 }, { k: 'cond', metas: [], premises: [{ k: 'eq', l: t, r: e }], concl: { k: 'eq', l: t, r: e } }] as Fact[]) {
      expect(K.evalStep({ k: 'eq', l: e, r: t }, { k: 'rewrite', rule: { k: 'node', id: 'f' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: {} }, w.v(), f).ok).toBe(false);
    }
  });
  const reset: Card = { k: 'cond', metas: ['x', 'n', 'k'], premises: [{ k: 'eq', l: pw(K.meta('x'), ZM('n')), r: e }], concl: { k: 'eq', l: pw(K.meta('x'), K.polyMul(ZM('n'), ZM('k'))), r: e } };
  it('E39 the multiple-reset lemma at k = -7', () => {
    const w = world(ALL, { givens: [{ id: 'R', name: 'Reset', fact: reset }] });
    const { room, assume } = w.p.openRoom('assume', 'x₁^n₁', 'e');
    const r = w.p.tryNode({ scope: room, k: 'apply', rule: { k: 'node', id: 'g:R' }, inputs: [assume], subst: { x: w.X1, n: int(w.N1), k: int(lit(-7)) } });
    expect(r.ok, r.error).toBe(true);
    expect(K.termEq((r.fact as { l: Term }).l, w.T('x₁^(-7n₁)'))).toBe(true);
  });
  it('E40 premise order matters; an explicit swap fixes it', () => {
    const w = world(ALL, { givens: [{ id: 'R', name: 'Reset', fact: reset }] });
    const { room, assume } = w.p.openRoom('assume', 'e', 'x₁^n₁');
    const subst = { x: w.X1, n: int(w.N1), k: int(lit(2)) };
    expect(w.p.tryNode({ scope: room, k: 'apply', rule: { k: 'node', id: 'g:R' }, inputs: [assume], subst }).ok).toBe(false);
    const sw = w.p.step(assume, { k: 'swap' });
    expect(w.p.tryNode({ scope: room, k: 'apply', rule: { k: 'node', id: 'g:R' }, inputs: [sw], subst }).ok).toBe(true);
  });
});

describe('E41–E50 generalization, eigenvariables, alpha-equivalence', () => {
  it('E41 a ℤ Tower becomes a ℤ binder', () => {
    const w = world();
    const s = w.p.start('a^n₁');
    const g = w.p.generalize(s);
    const f = w.p.fact(g) as Card & { k: 'law' };
    expect(f.metas).toEqual(['n']);
    expect(f.l).toEqual({ k: 'pow', base: a, exp: ZM('n') });
    expect(w.p.text(g)).toBe('∀n. a^n = a^n');
  });
  it('E42 eigenvariable: n₁ in an assumption exponent', () => {
    const w = world();
    const { room, assume } = w.p.openRoom('assume', 'a^n₁', 'e');
    const r = w.p.tryNode({ scope: room, k: 'generalize', input: assume });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/n₁ appears in the assumption a\^n₁ = e, so it isn't arbitrary/);
  });
  it('E43 B02 Reset Multipliers: exit first, then ∀ binds x, n, k', () => {
    const target: Card = { k: 'cond', metas: ['x', 'n', 'k'], premises: [{ k: 'eq', l: pw(K.meta('x'), ZM('n')), r: e }], concl: { k: 'eq', l: pw(K.meta('x'), K.polyMul(ZM('n'), ZM('k'))), r: e } };
    const w = world(ALL, { sockets: [{ id: 's', target, allowedGivens: [] }] });
    const { room, assume } = w.p.openRoom('assume', 'x₁^n₁', 'e');
    let n = w.p.start('x₁^(n₁k₁)', room);
    n = w.p.step(n, { k: 'rewrite', rule: { k: 'schema', id: 'power.multiply' }, dir: 'rev', at: { side: 'r', path: [], range: [0, 1] }, subst: { x: w.X1, m: int(w.N1), n: int(w.K1) } });
    n = w.p.step(n, { k: 'rewrite', rule: { k: 'node', id: assume }, dir: 'fwd', at: { side: 'r', path: [0], range: [0, 1] }, subst: {} });
    expect(w.p.text(n)).toBe('x₁^(k₁n₁) = e^k₁'); // canonical monomial order
    n = w.p.step(n, { k: 'rewrite', rule: { k: 'schema', id: 'power.identity' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: { n: int(w.K1) } });
    const ex = w.p.exit(room, n);
    const g = w.p.generalize(ex);
    expect(w.p.res.nodes[g]!.deps).toEqual([]);
    expect((w.p.fact(g) as Card).metas).toEqual(['x', 'n', 'k']);
    expect(w.p.res.solved).toBe(true);
    expect(K.lemmaEligibility(w.p.fact(g), w.p.res.nodes[g]!.deps, w.p.graph, w.p.ctx)).toEqual({ ok: true });
    expect(oracleCheck(w.v().level, w.p.res.nodes, w.p.graph.rooms, K.withVars(w.p.ctx, w.p.graph).vars)).toEqual([]);
  });
  it('E44 a Tower only in the premise is bound too', () => {
    const w = world();
    const { room } = w.p.openRoom('assume', 'x₁^n₁', 'e');
    const ex = w.p.exit(room, w.p.start('e', room));
    const g = w.p.generalize(ex);
    const f = w.p.fact(g) as Card & { k: 'cond' };
    expect(f.metas).toEqual(['x', 'n']);
  });
  it('E45 constants and size literals are never quantified', () => {
    const w = world();
    const r = w.p.tryNode({ scope: ROOT, k: 'generalize', input: w.p.start('a^(5)') });
    expect(r.error).toMatch(/nothing to generalize/);
  });
  it('E46/E47 Lemma Book gate: free Towers, constants, givens', () => {
    const w = world(ALL, { givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: K.pow(M(a, b), 5), r: e } }] });
    const free: Fact = { k: 'law', metas: ['x'], l: pw(K.meta('x'), w.N1), r: e };
    expect(K.lemmaEligibility(free, [], w.p.graph, w.p.ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/n₁ is still free/) });
    const constant: Fact = { k: 'law', metas: ['n'], l: pw(a, ZM('n')), r: e };
    expect(K.lemmaEligibility(constant, [], w.p.graph, w.p.ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/a is a constant/) });
    const clean: Fact = { k: 'law', metas: ['n'], l: pw(e, ZM('n')), r: e };
    expect(K.lemmaEligibility(clean, ['g:h'], w.p.graph, w.p.ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/rests on h: \(ab\)⁵ = e/) });
    expect(K.lemmaEligibility(clean, [], w.p.graph, w.p.ctx)).toEqual({ ok: true });
  });
  it('E48 alpha-equivalence across sorts and binder order', () => {
    const A = law(['x', 'n'], pw(K.meta('x'), ZM('n')), pw(K.meta('x'), ZM('n')));
    const B = law(['m', 'y'], pw(K.meta('y'), ZM('m')), pw(K.meta('y'), ZM('m')));
    expect(K.sameCardUpToRenaming(A, B)).toBe(true);
    const C = law(['m', 'n'], pw(a, K.polyAdd(ZM('m'), K.polyMul(lit(2), ZM('n')))), pw(a, ZM('n')));
    const D = law(['q', 'p'], pw(a, K.polyAdd(K.polyMul(lit(2), ZM('p')), ZM('q'))), pw(a, ZM('p')));
    expect(K.sameCardUpToRenaming(C, D)).toBe(true);
  });
  it('E49 no sort swap, no collapse, no rigid/bound exchange', () => {
    const A = law(['x', 'n'], pw(K.meta('x'), ZM('n')), e);
    expect(K.sameCardUpToRenaming(A, law(['x', 'n'], { k: 'meta', id: 'x' }, e))).toBe(false);
    const two = law(['m', 'n'], pw(a, K.polyAdd(ZM('m'), ZM('n'))), e);
    expect(K.sameCardUpToRenaming(two, law(['m'], pw(a, K.polyMul(lit(2), ZM('m'))), e))).toBe(false);
    expect(K.sameCardUpToRenaming(law(['n'], pw(a, ZM('n')), e), law([], pw(a, K.polyZvar('z:n₁')), e))).toBe(false);
  });
  it('E50 re-generalizing keeps both variables (fresh binder)', () => {
    const vars = [{ id: 'z:n₁', label: 'n₁', hue: 0, variable: true, sort: 'Z' as const }];
    const out = K.generalizeFact(law(['n'], pw(a, K.polyAdd(ZM('n'), K.polyZvar('z:n₁'))), e), vars) as Card & { k: 'law' };
    expect(out.metas).toHaveLength(2);
    expect(out.metas[0]).not.toBe('n');
    expect(out.metas[1]).toBe('n');
  });
});

describe('E51–E55 exact arithmetic and resource limits', () => {
  it('E51 exact BigInt arithmetic', () => {
    const r = K.polyAdd([{ coefficient: '9007199254740993', monomial: [] }], [{ coefficient: '1', monomial: [] }]);
    expect(r).toEqual([{ coefficient: '9007199254740994', monomial: [] }]);
  });
  it('E52 JSON numbers are refused', () => expect(() => K.polyNorm([{ coefficient: 9007199254740993 as unknown as string, monomial: [] }])).toThrow(/decimal strings/));
  it('E53 limits refuse with RESOURCE_LIMIT and no fact', () => {
    const w = world();
    const big = [{ coefficient: (1n << 4100n).toString(), monomial: [] }];
    const r1 = w.p.tryNode({ scope: ROOT, k: 'start', term: { k: 'pow', base: a, exp: big } });
    expect(r1.ok).toBe(false); expect(r1.fact).toBeUndefined(); expect(r1.error).toMatch(/^RESOURCE_LIMIT/);
    const deg = [{ coefficient: '1', monomial: [{ ref: { k: 'zvar', id: w.n1 }, degree: 129 }] }] as Poly;
    expect(w.p.tryNode({ scope: ROOT, k: 'start', term: { k: 'pow', base: a, exp: deg } }).error).toMatch(/^RESOURCE_LIMIT/);
    // 64 × 64 + 1 distinct monomials n₁^i k₁^j (total degree ≤ 128) exceed the 4096-term limit
    const many: Poly = [];
    many.push({ coefficient: '7', monomial: [] });
    for (let i = 1; i <= 64; i++) for (let j = 1; j <= 64; j++) many.push({ coefficient: '1', monomial: [{ ref: { k: 'zvar', id: w.n1 }, degree: i }, { ref: { k: 'zvar', id: w.k1 }, degree: j }] });
    expect(() => K.polyNorm(many)).toThrow(/^RESOURCE_LIMIT/);
    expect(() => K.polyMul(K.polyPowNat(w.N1, 70), K.polyPowNat(w.K1, 70))).toThrow(/^RESOURCE_LIMIT/);
  });
  it('E54 literal family bounds', () => {
    const w = world();
    rej(w.rw(w.T('a^(10001)'), 'power.literal:10001', 'fwd', { x: a }), /RESOURCE_LIMIT/);
    rej(w.rw(w.T('a^0'), 'power.literal:0', 'fwd', { x: a }), /whole number above 0/);
    rej(w.rw(w.T('a^-3'), 'power.literal:-3', 'fwd', { x: a }), /whole number above 0/);
  });
  it('E55 the literal card is regenerated; a forged registry entry grants nothing', () => {
    const w = world();
    const forged = { id: 'power.literal:5', name: 'forged', textbook: 'x', origin: 'import' as const, mirrorable: false, card: law(['x'], pw(K.meta('x'), lit(5)), e) };
    const ctx = { ...w.v(), registry: { ...REGISTRY, 'power.literal:5': forged } };
    const r = K.evalStep({ k: 'eq', l: e, r: w.T('a^(5)') }, { k: 'rewrite', rule: { k: 'schema', id: 'power.literal:5' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: { x: a } }, ctx);
    expect(r.ok && K.termEq((r.pallet as { r: Term }).r, K.pow(a, 5))).toBe(true);
  });
});

describe('E56–E63 Lagrange, authority, mirror, replay', () => {
  it('E56 guarded Lagrange with size(5)', () => {
    const w = world(ALL, { givens: [{ id: 's', name: '|G|', fact: { k: 'size', n: 5 } }], sockets: [{ id: 'g', target: { k: 'eq', l: K.power(a, lit(5)), r: e }, allowedGivens: ['s'] }] });
    const pr = w.p.tryNode({ id: 'P', scope: ROOT, k: 'press', input: 'g:s', power: true });
    expect(pr.fact).toEqual({ k: 'law', metas: ['x'], l: pw(K.meta('x'), lit(5)), r: e });
    const s = w.p.start('a^(5)');
    const q = w.p.step(s, { k: 'rewrite', rule: { k: 'node', id: 'P' }, dir: 'fwd', at: { side: 'l', path: [], range: [0, 1] }, subst: { x: a } });
    expect(w.p.text(q)).toBe('e = a^5');
    w.p.step(q, { k: 'swap' });
    expect(w.p.res.solved).toBe(true);
    expect(w.p.res.sockets[0]!.filledBy && w.p.res.nodes[w.p.res.sockets[0]!.filledBy]!.deps).toEqual(['g:s']);
  });
  it('E57 no cardinality authority without a size given', () => {
    const w = world();
    expect(w.p.tryNode({ scope: ROOT, k: 'press', input: 'g:s', power: true }).ok).toBe(false);
    const s = w.p.start('a^n₁');
    expect(w.p.tryNode({ scope: ROOT, k: 'press', input: s, power: true }).ok).toBe(false);
  });
  it('E58 out-of-contract sizes', () => {
    for (const n of [0, -5, 2.5, 25]) {
      const ctx = mkCtx({ givens: [{ id: 's', name: '|G|', fact: { k: 'size', n } }], tools: { schemas: ALL } });
      const r = K.check({ rooms: [], nodes: [{ id: 'g:s', scope: ROOT, k: 'given', givenId: 's' }, { id: 'P', scope: ROOT, k: 'press', input: 'g:s', power: true }] }, ctx);
      expect(r.nodes['g:s']!.ok, String(n)).toBe(false);
      expect(r.nodes['P']!.ok, String(n)).toBe(false);
    }
  });
  it('E59 a socket not allowing the size dependency stays empty', () => {
    const w = world(ALL, { givens: [{ id: 's', name: '|G|', fact: { k: 'size', n: 5 } }], sockets: [{ id: 'g', target: { k: 'eq', l: e, r: K.power(a, lit(5)) }, allowedGivens: [] }] });
    w.p.tryNode({ id: 'P', scope: ROOT, k: 'press', input: 'g:s', power: true });
    const s = w.p.start('a^(5)');
    w.p.step(s, { k: 'rewrite', rule: { k: 'node', id: 'P' }, dir: 'fwd', at: { side: 'l', path: [], range: [0, 1] }, subst: { x: a } });
    expect(w.p.res.solved).toBe(false);
  });
  it('E60 a disabled import is unauthorized whatever the registry says', () => {
    const w = world(ALL.filter((x) => x !== 'power.conjugate'));
    const t = pw(M(K.inv(a), b, a), w.N1);
    rej(w.rw(t, 'power.conjugate', 'fwd', { u: a, v: b, n: int(w.N1) }), /not available/);
    const ctx = { ...w.v(), registry: { ...REGISTRY, 'power.conjugate': K.POWER_SCHEMAS['power.conjugate']! } };
    expect(K.evalStep({ k: 'eq', l: e, r: t }, { k: 'rewrite', rule: { k: 'schema', id: 'power.conjugate' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: { u: a, v: b, n: int(w.N1) } }, ctx).ok).toBe(false);
  });
  it('E61 mirror of a power keeps the exponent; the mirrored conjugation law is offered', () => {
    const w = world();
    expect(K.mirrorTerm(w.T('(ab)^n₁'))).toEqual(w.T('(ba)^n₁'));
    const t = pw(M(a, b, K.inv(a)), w.N1);
    ok(w.rw(t, 'power.conjugate', 'fwd', { u: a, v: b, n: int(w.N1) }, undefined, true), M(a, pw(b, w.N1), K.inv(a)));
  });
  it('E62 removing or re-sorting a Tower breaks replay', () => {
    const w = world();
    w.p.start('a^n₁');
    const gone: ProofGraph = { ...w.p.graph, vars: w.p.graph.vars!.filter((v) => v.id !== w.n1) };
    expect(K.check(gone, w.p.ctx).ok).toBe(false);
    const resorted: ProofGraph = { ...w.p.graph, vars: w.p.graph.vars!.map((v) => (v.id === w.n1 ? { ...v, sort: 'G' as const } : v)) };
    expect(K.check(resorted, w.p.ctx).ok).toBe(false);
  });
  it('E63 claimed outputs are never trusted', () => {
    const w = world();
    const s = w.p.start('a^n₁');
    const g = w.p.generalize(s);
    const real = w.p.fact(g) as Card;
    const claimed = law(['n'], pw(a, ZM('n')), e);
    expect(K.sameCardUpToRenaming(real, claimed)).toBe(false);
    const tampered = { ...w.p.graph, nodes: w.p.graph.nodes.map((n) => (n.id === g ? { ...n, fact: claimed, deps: [] } : n)) } as ProofGraph;
    expect(K.check(tampered, w.p.ctx).nodes[g]!.fact).toEqual(real);
  });
});

describe('E64–E70 induction is deferred', () => {
  it.todo('E64 upward induction (deferred: §6, build later)');
  it.todo('E65 upward result is not ∀i:Z (deferred)');
  it.todo('E66 anchored induction (deferred)');
  it.todo('E67 forged IH / fresh i in deps (deferred)');
  it.todo('E68 induction export fed back into its step (deferred)');
  it.todo('E69 two-sided integer induction (deferred)');
  it('E70 any induction/range construction is rejected in Phase B', () => {
    const w = world();
    for (const k of ['inductUp', 'inductZ', 'range']) {
      const r = K.check({ ...w.p.graph, nodes: [{ id: 'i', scope: ROOT, k } as never] }, w.p.ctx);
      expect(r.ok).toBe(false);
      expect(r.nodes['i']!.error).toMatch(/Unknown kind of step/);
    }
  });
});

void ({} as Pallet);

describe('offers expose needed sorts and infer the rest from the redex', () => {
  it('e² → (e^m)^n: m supplied, n inferred; needSorts marks both ℤ', () => {
    const w = world();
    const s = w.p.start('e^(2)');
    const o = w.p.offers(s, { side: 'r', path: [], range: [0, 1] }).find((x) => x.label.startsWith('e^2 → (e^m)^n'))!;
    expect(o.needSorts).toEqual({ m: 'Z', n: 'Z' });
    const f = K.fillOffer(o, { m: int(lit(2)) }, w.p.graph, w.p.res, s, w.p.ctx);
    expect(f.ok && f.offer.preview && K.termEq((f.offer.preview as { r: Term }).r, w.T('(e^(2))^(1)'))).toBe(true);
    const bad = K.fillOffer(o, { m: int(lit(-3)) }, w.p.graph, w.p.res, s, w.p.ctx);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/Choose an integer for n/);
    const g = w.p.offers(s, { side: 'r', path: [], gap: 1 }).find((x) => x.needs.length && x.needSorts?.n === 'Z');
    expect(g?.label).toMatch(/insert e\^n/);
  });
});

describe('v4 r2: card sockets up to symmetry; stacks versus words in messages', () => {
  const X = K.meta('x');
  const dblBuild = (target: Card, flip: boolean) => {
    const p = new Player(mkCtx({ sockets: [{ id: 's', target, allowedGivens: [] }] }));
    p.declareVar('x₁');
    let n = p.start('(x₁^-1)^-1');
    n = p.play(n, { side: 'r', path: [], gap: 1 }, 'insert x⁻¹x', { x: 'x₁' });
    n = p.play(n, { side: 'r', path: [], range: [0, 2] }, /^cancel/);
    if (flip) n = p.play(n, null, 'swap sides');
    p.generalize(n);
    return p;
  };
  it('∀x. x = (x⁻¹)⁻¹ fills ∀x. (x⁻¹)⁻¹ = x', () => {
    expect(dblBuild(law(['u'], K.inv(K.inv(K.meta('u'))), K.meta('u')), true).res.solved).toBe(true);
    expect(dblBuild(law(['u'], K.inv(K.inv(K.meta('u'))), K.meta('u')), false).res.solved).toBe(true);
  });
  it('a cond with its = conclusion flipped fills; flipped premises do not', () => {
    const w = world();
    const { room } = w.p.openRoom('assume', 'x₁', 'e');
    const s = w.p.start('x₁ x₁^-1', room);
    const q = w.p.step(s, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 2] }, subst: { x: w.X1 } });
    const g = w.p.generalize(w.p.exit(room, q)); // ∀x. x = e ⟹ x x⁻¹ = e
    const fact = w.p.fact(g) as Card;
    const flipped: Card = { k: 'cond', metas: ['y'], premises: [{ k: 'eq', l: K.meta('y'), r: e }], concl: { k: 'eq', l: e, r: M(K.meta('y'), K.inv(K.meta('y'))) } };
    const premFlipped: Card = { k: 'cond', metas: ['y'], premises: [{ k: 'eq', l: e, r: K.meta('y') }], concl: { k: 'eq', l: M(K.meta('y'), K.inv(K.meta('y'))), r: e } };
    const fills = (target: Card) => K.check(w.p.graph, { ...w.p.ctx, level: { ...w.p.ctx.level, sockets: [{ id: 's', target, allowedGivens: [] }] } }).solved;
    expect(fills(fact)).toBe(true);
    expect(fills(flipped)).toBe(true);
    expect(fills(premFlipped)).toBe(false);
  });
  it('a stack where a word was needed is named as such, with the Literal Power hint', () => {
    const w = world(ALL, { givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: K.pow(a, 5), r: e } }] });
    const s = w.p.start('a^(5)');
    const r = w.p.tryNode({ scope: ROOT, k: 'step', input: s, op: { k: 'rewrite', rule: { k: 'node', id: 'g:h' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: {} } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('The selection is the power a^5, but a⁵ = e needs the product a⁵ (five factors). Use literal power to write the power out as a product.');
  });
  it('and a word where a stack was needed', () => {
    const w = world(ALL, { givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: K.power(a, lit(5)), r: e } }] });
    const s = w.p.start('a^5');
    const r = w.p.tryNode({ scope: ROOT, k: 'step', input: s, op: { k: 'rewrite', rule: { k: 'node', id: 'g:h' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 5] }, subst: {} } });
    expect(r.error).toMatch(/the product a⁵ \(five factors\).*the power a\^5.*write the product as a power/);
  });
  it('a socket proved with a stack instead of the goal’s word says why', () => {
    const w = world(ALL, { givens: [{ id: 's', name: '|G|', fact: { k: 'size', n: 5 } }], sockets: [{ id: 'g', target: { k: 'eq', l: K.pow(a, 5), r: e }, allowedGivens: ['s'] }] });
    w.p.tryNode({ id: 'P', scope: ROOT, k: 'press', input: 'g:s', power: true });
    const s = w.p.start('a^(5)');
    const q = w.p.step(s, { k: 'rewrite', rule: { k: 'node', id: 'P' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: { x: a } });
    w.p.step(q, { k: 'swap' });
    expect(w.p.res.solved).toBe(false);
    expect(w.p.res.sockets[0]!.error).toMatch(/This proves the power a\^5, but the goal has the product a⁵ \(five factors\)\. Use literal power to write the power out as a product\./);
    void X;
  });
});
