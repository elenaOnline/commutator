// Book phase B kernel tests: Members (t ∈ S). Spec: design/pinter/KERNEL-EXT.md §4.
// Acceptance cases plus the kernel-level shapes of P5.1, P12.1, P13.1 and P14.4.
import { describe, expect, it } from 'vitest';
import * as K from './index';
import { Player, mkCtx, span } from './testkit';
import { oracleCheck } from '../groups/oracle';
import { subgroupsOf } from '../groups/semantics';
import { catalogue } from '../groups';
import type { Card, LevelManifest, MemPat, NodeId, Pallet, SubRef, Term } from './types';

const a = K.atom('a'), b = K.atom('b'), c = K.atom('c');
const M = (id: string): Term => ({ k: 'meta', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]) => K.mul(fs);
const sub = (id: string): SubRef => ({ k: 'sub', id });
const smeta = (id: string): SubRef => ({ k: 'submeta', id });
const mem = (t: Term, s: SubRef): MemPat & Pallet => ({ k: 'mem', t, sub: s });
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const SCH = (id: string): K.RuleRef => ({ k: 'schema', id });
const given = (id: string, fact: K.Fact) => ({ id, name: id, fact });
const H = { id: 'H', label: 'H' }, Kn = { id: 'K', label: 'K', normal: true }, Hn = { id: 'H', label: 'H', normal: true };

function oracleOk(p: Player) {
  const vx = K.withVars(p.ctx, p.graph);
  expect(oracleCheck(p.ctx.level, p.res.nodes, p.graph.rooms, vx.vars, vx.structs)).toEqual([]);
}
const sockOk = (p: Player, id = 's') => { const r = p.res.sockets.find((x) => x.id === id)!; expect(r.ok, r.error).toBe(true); };

describe('Members: the fact kind and its steps', () => {
  const ctx = (extra: Partial<LevelManifest> = {}) => mkCtx({ subgroups: [H], givens: [given('g', mem(a, sub('H'))), given('h', eq(a, P(b, c)))], ...extra } as never);

  it('rewriting inside a membership is Leibniz; insert e works on its rail', () => {
    const p = new Player(ctx());
    const r = p.step('g:g', { k: 'rewrite', rule: { k: 'node', id: 'g:h' }, dir: 'fwd', at: span('l', 0, 1), subst: {} });
    expect(p.text(r)).toBe('bc ∈ H');
    const e = p.step(r, { k: 'insertE', at: { side: 'l', path: [], gap: 1 } });
    expect(p.text(e)).toBe('bec ∈ H');
    expect(p.res.nodes[e]!.deps).toEqual(['g:g', 'g:h']);
    oracleOk(p);
  });

  it('swap, invert and lift reject a membership (no ∉; closure is a card, not congruence)', () => {
    const p = new Player(ctx());
    for (const op of [{ k: 'swap' }, { k: 'invert' }, { k: 'lift', side: 'left', term: b }] as K.StepOp[]) {
      const r = p.tryNode({ scope: K.ROOT, k: 'step', input: 'g:g', op });
      expect(r.ok, JSON.stringify(op)).toBe(false);
    }
  });

  it('a membership given must name a declared subgroup and be ground', () => {
    const p = new Player(mkCtx({ givens: [given('g', mem(a, sub('Q')))] } as never), { nodes: [], rooms: [] });
    expect(p.tryNode({ scope: K.ROOT, k: 'given', givenId: 'g' }).error).toMatch(/not a subgroup here/);
    const q = new Player(mkCtx({ subgroups: [H], givens: [given('g', mem(M('x'), sub('H')))] } as never), { nodes: [], rooms: [] });
    expect(q.tryNode({ scope: K.ROOT, k: 'given', givenId: 'g' }).error).toMatch(/has a variable/);
  });

  it('closure axioms need their subgroup chosen; conj needs a normal one', () => {
    const p = new Player(mkCtx({ subgroups: [H, Kn], givens: [given('g', mem(a, sub('H'))), given('k', mem(a, sub('K')))] } as never));
    expect(p.tryNode({ scope: K.ROOT, k: 'apply', rule: SCH('sub.inv'), inputs: ['g:g'], subst: { x: a } }).error).toMatch(/Choose which subgroup plays H/);
    expect(p.tryNode({ scope: K.ROOT, k: 'apply', rule: SCH('sub.inv'), inputs: ['g:g'], subst: { x: a }, structs: { H: 'K' } }).error).toMatch(/must read a ∈ K/);
    const iv = p.apply(SCH('sub.inv'), ['g:g'], { x: a }, { H: 'H' });
    expect(p.text(iv)).toBe('a⁻¹ ∈ H');
    expect(p.tryNode({ scope: K.ROOT, k: 'apply', rule: SCH('sub.conj'), inputs: ['g:g'], subst: { g: b, x: a }, structs: { N: 'H' } }).error).toMatch(/needs a normal subgroup/);
    const cj = p.apply(SCH('sub.conj'), ['g:k'], { g: b, x: a }, { N: 'K' });
    expect(p.text(cj)).toBe('bab⁻¹ ∈ K');
    oracleOk(p);
  });

  it('a membership dock; open docks reach inside memberships', () => {
    const p = new Player(mkCtx({ subgroups: [H], givens: [given('g', mem(P(b, a), sub('H')))], sockets: [
      { id: 's', target: mem(P(b, a), sub('H')), allowedGivens: ['g'] },
      { id: 'o', target: mem(P(M('h'), a), sub('H')), allowedGivens: ['g'], holes: [{ id: 'h' }] },
    ] } as never));
    sockOk(p); sockOk(p, 'o');
    expect(p.res.sockets[1]!.holes!.h).toEqual(b);
  });

  it('Suppose and Classical rooms never hold a membership; an Assume desk may', () => {
    const base = new Player(mkCtx({ subgroups: [H] } as never));
    const room: K.Room = { id: 'R', parent: K.ROOT, kind: 'suppose', l: a, r: a, assumes: [{ rel: 'mem', t: a, sub: sub('H') }] };
    expect(K.check({ nodes: [{ id: 'n', scope: 'R', k: 'assume', room: 'R' }], rooms: [room] }, base.ctx).nodes.n!.error).toMatch(/Only an Assume room/);
    const p = new Player(mkCtx({ subgroups: [H] } as never));
    const { room: r, desks } = p.openDesks([['mem', 'a', 'H']]);
    const iv = p.apply(SCH('sub.inv'), [desks[0]!], { x: a }, { H: 'H' });
    const ex = p.exit(r, iv);
    expect(p.text(ex)).toBe('a ∈ H ⟹ a⁻¹ ∈ H');
    oracleOk(p);
  });
});

describe('P5.1: e ∈ H from a member, without sub.e (closed subsets, ∅ included)', () => {
  const lv = () => mkCtx({ subgroups: [H], givens: [given('g', mem(a, sub('H')))], sockets: [{ id: 's', target: mem(K.E, sub('H')), allowedGivens: ['g'] }], unlocks: ['sub.e'] } as never);
  it('e ∈ H = a a⁻¹ ∈ H by the two closures, and sub.e is not available on the level that earns it', () => {
    const p = new Player(lv());
    expect(p.tryNode({ scope: K.ROOT, k: 'apply', rule: SCH('sub.e'), inputs: [], subst: {}, structs: { H: 'H' } }).error).toMatch(/can't prove itself|not available/);
    const iv = p.apply(SCH('sub.inv'), ['g:g'], { x: a }, { H: 'H' });
    const ml = p.apply(SCH('sub.mul'), ['g:g', iv], { x: a, y: I(a) }, { H: 'H' });
    const e = p.step(ml, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'fwd', at: span('l', 0, 2), subst: { x: a } });
    expect(p.text(e)).toBe('e ∈ H');
    sockOk(p);
    oracleOk(p);
  });
  it('the oracle ranges over ∅ here: an unguarded e ∈ H would be refuted', () => {
    const bogus = { f: { fact: mem(K.E, sub('H')), deps: [], ok: true } };
    expect(oracleCheck(lv().level, bogus, []).length).toBeGreaterThan(0);
    const withE = mkCtx({ subgroups: [H], tools: { schemas: ['sub.e'] } } as never).level;
    expect(oracleCheck(withE, bogus, [])).toEqual([]);
  });
  it('the earned card is unconditional: ∀H ≤ G. e ∈ H', () => {
    expect(K.factText(K.SUB_SCHEMAS['sub.e']!.card, {})).toBe('∀H ≤ G. e ∈ H');
    expect(subgroupsOf(catalogue()[0]!).length).toBeGreaterThan(0);
  });
});

describe('P12.1: refl, symm, trans for every subgroup (Subgroup Tower, one and two desks)', () => {
  const x = M('x'), y = M('y'), z = M('z'), Hm = smeta('H');
  const bind = [{ k: 'sub' as const, id: 'H', normal: false }];
  const refl: Card = { k: 'cond', metas: ['x'], binds: bind, premises: [], concl: mem(P(x, I(x)), Hm) };
  const symm: Card = { k: 'cond', metas: ['x', 'y'], binds: bind, premises: [mem(P(x, I(y)), Hm)], concl: mem(P(y, I(x)), Hm) };
  const trans: Card = { k: 'cond', metas: ['x', 'y', 'z'], binds: bind, premises: [mem(P(x, I(y)), Hm), mem(P(y, I(z)), Hm)], concl: mem(P(x, I(z)), Hm) };
  const ctx = () => mkCtx({ sockets: [
    { id: 'refl', target: refl, allowedGivens: [] }, { id: 'symm', target: symm, allowedGivens: [] }, { id: 'trans', target: trans, allowedGivens: [] },
  ], tools: { schemas: ['sub.e', 'socks', 'dbl'] } } as never);

  it('proves all three, generalizing the Subgroup Tower; the cards are saveable lemmas', () => {
    const p = new Player(ctx());
    const H1 = p.declareSub('H₁');
    const X = K.atom(p.declareVar('x₁')), Y = K.atom(p.declareVar('y₁')), Z = K.atom(p.declareVar('z₁'));
    // refl: e ∈ H₁ (sub.e), e → x₁x₁⁻¹, ∀
    const e = p.apply(SCH('sub.e'), [], {}, { H: H1 });
    const xx = p.step(e, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'rev', at: span('l', 0, 1), subst: { x: X } });
    const g1 = p.generalize(xx);
    expect(p.text(g1)).toBe('∀H ≤ G. ∀x. xx⁻¹ ∈ H');
    // symm: one desk x₁y₁⁻¹ ∈ H₁
    const r1 = p.openDesks([['mem', P(X, I(Y)), H1]]);
    const iv = p.apply(SCH('sub.inv'), [r1.desks[0]!], { x: P(X, I(Y)) }, { H: H1 });
    const sk = p.step(iv, { k: 'rewrite', rule: SCH('socks'), dir: 'fwd', at: span('l', 0, 1), subst: { u: X, v: I(Y) } });
    const db = p.step(sk, { k: 'rewrite', rule: SCH('dbl'), dir: 'fwd', at: span('l', 0, 1), subst: { u: Y } });
    expect(p.text(db)).toBe('y₁x₁⁻¹ ∈ H₁');
    // ∀ inside the room is refused: H₁ (and x₁, y₁) appear in the assumption
    expect(p.tryNode({ scope: r1.room, k: 'generalize', input: db }).error).toMatch(/isn't arbitrary/);
    const g2 = p.generalize(p.exit(r1.room, db));
    expect(p.text(g2)).toBe('∀H ≤ G. ∀x, y. xy⁻¹ ∈ H ⟹ yx⁻¹ ∈ H');
    // trans: two desks
    const r2 = p.openDesks([['mem', P(X, I(Y)), H1], ['mem', P(Y, I(Z)), H1]]);
    const ml = p.apply(SCH('sub.mul'), r2.desks, { x: P(X, I(Y)), y: P(Y, I(Z)) }, { H: H1 });
    const cn = p.step(ml, { k: 'rewrite', rule: { k: 'axiom', id: 'invL' }, dir: 'fwd', at: span('l', 1, 3), subst: { x: Y } });
    const un = p.step(cn, { k: 'rewrite', rule: { k: 'axiom', id: 'unitL' }, dir: 'fwd', at: span('l', 1, 3), subst: { x: I(Z) } });
    const g3 = p.generalize(p.exit(r2.room, un));
    expect(p.text(g3)).toBe('∀H ≤ G. ∀x, y, z. xy⁻¹ ∈ H, yz⁻¹ ∈ H ⟹ xz⁻¹ ∈ H');
    for (const s of ['refl', 'symm', 'trans']) sockOk(p, s);
    for (const g of [g1, g2, g3]) expect(K.lemmaEligibility(p.fact(g), p.res.nodes[g]!.deps, p.graph, p.ctx)).toEqual({ ok: true });
    oracleOk(p);
  });

  it('a card with a subgroup parameter applies at a level subgroup (and at no undeclared one)', () => {
    const p = new Player(mkCtx({ subgroups: [H], givens: [given('g', mem(P(a, I(b)), sub('H')))], tools: { schemas: ['socks', 'dbl'] } } as never));
    const H1 = p.declareSub('H₁');
    const X = K.atom(p.declareVar('x₁')), Y = K.atom(p.declareVar('y₁'));
    const r1 = p.openDesks([['mem', P(X, I(Y)), H1]]);
    const iv = p.apply(SCH('sub.inv'), [r1.desks[0]!], { x: P(X, I(Y)) }, { H: H1 });
    const sk = p.step(iv, { k: 'rewrite', rule: SCH('socks'), dir: 'fwd', at: span('l', 0, 1), subst: { u: X, v: I(Y) } });
    const db = p.step(sk, { k: 'rewrite', rule: SCH('dbl'), dir: 'fwd', at: span('l', 0, 1), subst: { u: Y } });
    const symm = p.generalize(p.exit(r1.room, db));
    const used = p.apply({ k: 'node', id: symm }, ['g:g'], { x: a, y: b }, { H: 'H' });
    expect(p.text(used)).toBe('ba⁻¹ ∈ H');
    expect(p.res.nodes[used]!.deps).toEqual(['g:g']);
    expect(p.tryNode({ scope: K.ROOT, k: 'apply', rule: { k: 'node', id: symm }, inputs: ['g:g'], subst: { x: a, y: b }, structs: { H: 'Q' } }).error).toMatch(/not a subgroup here/);
    oracleOk(p);
  });
});

describe('P13.1: three desks, cosets equal or disjoint', () => {
  it('xa⁻¹, xb⁻¹, ha⁻¹ ∈ H ⟹ hb⁻¹ ∈ H, docked with the premises in another order', () => {
    const x = M('x'), aa = M('a'), bb = M('b'), h = M('h'), Hm = smeta('H');
    const target: Card = { k: 'cond', metas: ['x', 'a', 'b', 'h'], binds: [{ k: 'sub', id: 'H', normal: false }],
      premises: [mem(P(h, I(aa)), Hm), mem(P(x, I(aa)), Hm), mem(P(x, I(bb)), Hm)], concl: mem(P(h, I(bb)), Hm) };
    const p = new Player(mkCtx({ sockets: [{ id: 's', target, allowedGivens: [] }], tools: { schemas: ['socks', 'dbl'] } } as never));
    const H1 = p.declareSub('H₁');
    const X = K.atom(p.declareVar('x₁')), A = K.atom(p.declareVar('a₁')), B = K.atom(p.declareVar('b₁')), Hh = K.atom(p.declareVar('h₁'));
    const { room, desks } = p.openDesks([['mem', P(X, I(A)), H1], ['mem', P(X, I(B)), H1], ['mem', P(Hh, I(A)), H1]]);
    const st = (n: NodeId, rule: K.RuleRef, dir: 'fwd' | 'rev', s0: number, e0: number, subst: K.Subst) => p.step(n, { k: 'rewrite', rule, dir, at: span('l', s0, e0), subst });
    const iv = p.apply(SCH('sub.inv'), [desks[0]!], { x: P(X, I(A)) }, { H: H1 });
    const ax = st(st(iv, SCH('socks'), 'fwd', 0, 1, { u: X, v: I(A) }), SCH('dbl'), 'fwd', 0, 1, { u: A }); // a₁x₁⁻¹
    const hx = st(st(p.apply(SCH('sub.mul'), [desks[2]!, ax], { x: P(Hh, I(A)), y: P(A, I(X)) }, { H: H1 }),
      { k: 'axiom', id: 'invL' }, 'fwd', 1, 3, { x: A }), { k: 'axiom', id: 'unitL' }, 'fwd', 1, 3, { x: I(X) });
    expect(p.text(hx)).toBe('h₁x₁⁻¹ ∈ H₁');
    const hb = st(st(p.apply(SCH('sub.mul'), [hx, desks[1]!], { x: P(Hh, I(X)), y: P(X, I(B)) }, { H: H1 }),
      { k: 'axiom', id: 'invL' }, 'fwd', 1, 3, { x: X }), { k: 'axiom', id: 'unitL' }, 'fwd', 1, 3, { x: I(B) });
    const g = p.generalize(p.exit(room, hb));
    expect(p.text(g)).toBe('∀H ≤ G. ∀x, y, z, h. xy⁻¹ ∈ H, xz⁻¹ ∈ H, hy⁻¹ ∈ H ⟹ hz⁻¹ ∈ H'); // a, b are this order's constants
    sockOk(p);
    oracleOk(p);
  });
});

describe('P14.4: two normal subgroups that meet only at e commute elementwise', () => {
  it('hk = kh from the commutator in H ∩ K', () => {
    const h = K.atom('h'), k = K.atom('k'), x = M('x');
    const ctx = mkCtx({
      atoms: [{ id: 'h', label: 'h', hue: 0 }, { id: 'k', label: 'k', hue: 1 }], subgroups: [Hn, Kn],
      givens: [given('gh', mem(h, sub('H'))), given('gk', mem(k, sub('K'))),
        given('meet', { k: 'cond', metas: ['x'], premises: [mem(x, sub('H')), mem(x, sub('K'))], concl: { k: 'eq', l: x, r: K.E } })],
      sockets: [{ id: 's', target: eq(P(h, k), P(k, h)), allowedGivens: ['gh', 'gk', 'meet'] }],
    } as never);
    const p = new Player(ctx);
    const comm = P(h, k, I(h), I(k));
    const n1 = p.apply(SCH('sub.inv'), ['g:gh'], { x: h }, { H: 'H' });
    const n2 = p.apply(SCH('sub.conj'), [n1], { g: k, x: I(h) }, { N: 'H' });
    const n3 = p.apply(SCH('sub.mul'), ['g:gh', n2], { x: h, y: P(k, I(h), I(k)) }, { H: 'H' });
    const m1 = p.apply(SCH('sub.conj'), ['g:gk'], { g: h, x: k }, { N: 'K' });
    const m2 = p.apply(SCH('sub.inv'), ['g:gk'], { x: k }, { H: 'K' });
    const m3 = p.apply(SCH('sub.mul'), [m1, m2], { x: P(h, k, I(h)), y: I(k) }, { H: 'K' });
    expect(p.text(n3)).toBe('hkh⁻¹k⁻¹ ∈ H');
    expect(p.text(m3)).toBe('hkh⁻¹k⁻¹ ∈ K');
    const q = p.apply({ k: 'node', id: 'g:meet' }, [n3, m3], { x: comm });
    const S = (n: NodeId, op: K.StepOp) => p.step(n, op);
    const rw = (n: NodeId, id: K.AxiomId, side: 'l' | 'r', s0: number, e0: number, xv: Term) => S(n, { k: 'rewrite', rule: { k: 'axiom', id }, dir: 'fwd', at: span(side, s0, e0), subst: { x: xv } });
    let n = S(q, { k: 'lift', side: 'right', term: k });
    n = rw(n, 'invL', 'l', 3, 5, k); n = rw(n, 'unitR', 'l', 2, 4, I(h)); n = rw(n, 'unitL', 'r', 0, 2, k);
    n = S(n, { k: 'lift', side: 'right', term: h });
    n = rw(n, 'invL', 'l', 2, 4, h); n = rw(n, 'unitR', 'l', 1, 3, k);
    expect(p.text(n)).toBe('hk = kh');
    sockOk(p);
    oracleOk(p);
  });
});

describe('lemma closure and card identity with subgroup parameters', () => {
  it('a card naming a level subgroup is not saveable; normal flags are part of a card’s identity', () => {
    const p = new Player(mkCtx({ subgroups: [H] } as never));
    const lv = p.ctx;
    const card: Card = { k: 'cond', metas: ['x'], premises: [mem(M('x'), sub('H'))], concl: mem(I(M('x')), sub('H')) };
    const r = K.lemmaEligibility(card, [], p.graph, lv);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/subgroup of this order/);
    const a1 = K.SUB_SCHEMAS['sub.inv']!.card;
    const a2: Card = { ...(a1 as Card & { k: 'cond' }), binds: [{ k: 'sub', id: 'H', normal: true }] };
    expect(K.sameCardUpToRenaming(a1, a1)).toBe(true);
    expect(K.sameCardUpToRenaming(a1, a2)).toBe(false);
    const renamed: Card = { k: 'cond', metas: ['u'], binds: [{ k: 'sub', id: 'K', normal: false }], premises: [mem(M('u'), smeta('K'))], concl: mem(I(M('u')), smeta('K')) };
    expect(K.sameCardUpToRenaming(a1, renamed)).toBe(true);
  });
});
