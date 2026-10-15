// Book phase C kernel tests: Maps — sorts, map terms, homomorphisms, actions, Hom Towers. Spec: KERNEL-EXT.md §5.
import { describe, expect, it } from 'vitest';
import * as K from './index';
import { Player, mkCtx, span } from './testkit';
import type { Card, LevelManifest, NodeId, Pallet, Term } from './types';
import { REGISTRY } from '../levels/levels';
import { oracleCheck } from '../groups/oracle';

function oracleOk(p: Player) {
  const vx = K.withVars(p.ctx, p.graph);
  expect(oracleCheck(p.ctx.level, p.res.nodes, p.graph.rooms, vx.vars, vx.structs)).toEqual([]);
}

const M = (id: string): Term => ({ k: 'meta', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]) => K.mul(fs);
const A = (id: string): Term => K.atom(id);
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
const eS = (s: string): Term => ({ k: 'e', s });
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });

/** "the only idempotent is e" as an earned one-group schema (P4.7), for reuse in another group. */
const IDEM: K.Schema = { id: 'idem', name: 'the only idempotent is e', textbook: 'the only idempotent is e', origin: 'earned', fromLevel: 'P4.7', mirrorable: false,
  card: { k: 'cond', metas: ['x'], premises: [{ k: 'eq', l: P(M('x'), M('x')), r: M('x') }], concl: { k: 'eq', l: M('x'), r: K.E } } };
const ctxWith = (p: Partial<LevelManifest>, schemas: K.Schema[] = []): K.KernelCtx => {
  const c = mkCtx({ ...p, tools: { schemas: schemas.map((s) => s.id), ...(p.tools ?? {}) } } as never);
  return { ...c, registry: { ...REGISTRY, ...Object.fromEntries(schemas.map((s) => [s.id, s])) } };
};

/** P9.1: f(e) = e for a Hom Tower f₁ : G₁ → H₁, via e = ee, the hom law, and the idempotent card in H₁. */
function fe(p: Player, f: string, G: string, H: string): NodeId {
  const fE = app(f, eS(G));
  const s = p.start(fE);
  const ee = p.step(s, { k: 'rewrite', rule: { k: 'axiom', id: 'unitL' }, dir: 'rev', at: { side: 'r', path: [0] }, subst: { x: eS(G) } });
  const hm = p.step(ee, { k: 'rewrite', rule: { k: 'schema', id: 'hom.mul' }, dir: 'fwd', at: span('r', 0, 1), subst: { x: eS(G), y: eS(G) }, structs: { f } });
  const sw = p.step(hm, { k: 'swap' });
  return p.apply({ k: 'schema', id: 'idem' }, [sw], { x: fE });
  void H;
}

describe('sorts and map terms', () => {
  const ctx = () => ctxWith({
    sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'H', kind: 'group', label: 'H' }, { id: 'A', kind: 'set', label: 'A' }],
    maps: [{ id: 'f', label: 'f', args: ['G'], res: 'H', kind: 'hom' }, { id: 's', label: 's', args: ['A'], res: 'A' }],
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'h', label: 'h', hue: 1, carrier: 'H' }, { id: 'p', label: 'p', hue: 2, carrier: 'A' }],
  });
  it('ill-sorted terms and equations are refused in words', () => {
    const p = new Player(ctx());
    expect(p.tryNode({ scope: K.ROOT, k: 'start', term: P(A('a'), A('h')) }).error).toMatch(/mixes elements of G and H/);
    expect(p.tryNode({ scope: K.ROOT, k: 'start', term: app('f', A('h')) }).error).toMatch(/takes an element of G there, but this one is in H/);
    expect(p.tryNode({ scope: K.ROOT, k: 'start', term: I(A('p')) }).error).toMatch(/is a set, not a group/);
    expect(p.tryNode({ scope: K.ROOT, k: 'start', term: app('g', A('a')) }).error).toMatch(/not a map here/);
    const s = p.start(app('f', A('a')));
    expect(p.text(s)).toBe('f(a) = f(a)');
    // lift by an element of another group: the equation would mix groups
    expect(p.tryNode({ scope: K.ROOT, k: 'step', input: s, op: { k: 'lift', side: 'left', term: A('a') } }).error).toMatch(/mixes elements of G and H/);
    const ok = p.step(s, { k: 'lift', side: 'left', term: A('h') });
    expect(p.text(ok)).toBe('hf(a) = hf(a)');
    oracleOk(p);
  });
  it('insert e takes the word’s own group; e carries its sort', () => {
    const p = new Player(ctx());
    const s = p.start(A('h'));
    const e = p.step(s, { k: 'insertE', at: { side: 'r', path: [], gap: 0 } });
    expect(p.text(e)).toBe('h = e_Hh');
    expect((p.fact(e) as { r: Term }).r).toEqual(P(eS('H'), A('h')));
    expect(K.termEq(eS('G'), K.E)).toBe(true);
    expect(K.termEq(eS('H'), K.E)).toBe(false);
  });
  it('apply a map to both sides (an equation; never an inequation)', () => {
    const p = new Player(ctx());
    const s = p.start(P(A('a'), I(A('a'))));
    const c = p.step(s, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'fwd', at: span('r', 0, 2), subst: { x: A('a') } });
    const f = p.step(c, { k: 'applyMap', fn: 'f' });
    expect(p.text(f)).toBe('f(aa⁻¹) = f(e)');
    // rewriting inside the frame is congruence
    const in1 = p.step(f, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'fwd', at: { side: 'l', path: [0], range: [0, 2] }, subst: { x: A('a') } });
    expect(p.text(in1)).toBe('f(e) = f(e)');
    expect(p.tryNode({ scope: K.ROOT, k: 'step', input: s, op: { k: 'applyMap', fn: 's' } }).error).toMatch(/takes an element of A/);
  });
  it('a one-group law used in another group reads with that group’s e (sort polymorphism)', () => {
    const p = new Player(ctx());
    const s = p.start(P(A('h'), I(A('h'))));
    const c = p.step(s, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'fwd', at: span('r', 0, 2), subst: { x: A('h') } });
    expect(p.text(c)).toBe('hh⁻¹ = e_H');
    oracleOk(p);
  });
});

describe('P9.1 / P9.2: f(e) = e for every homomorphism, then applied at another Hom Tower (adversary B1)', () => {
  const target: Card = { k: 'law', metas: [], l: app('f', eS('G₁')), r: eS('H₁'),
    binds: [{ k: 'grp', id: 'G₁' }, { k: 'grp', id: 'H₁' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'G₁' }, cod: { k: 'sortmeta', id: 'H₁' } }] };
  it('proves ∀f : G₁ → H₁. f(e) = e with a Hom Tower and saves it', () => {
    const p = new Player(ctxWith({ sockets: [{ id: 's', target, allowedGivens: [] }] }, [IDEM]));
    p.graph = { ...p.graph, structs: [{ k: 'grp', id: 'G1', label: 'G₁' }, { k: 'grp', id: 'H1', label: 'H₁' }, { k: 'hom', id: 'f1', label: 'f₁', dom: 'G1', cod: 'H1' }] };
    p.res = K.check(p.graph, p.ctx);
    const r = fe(p, 'f1', 'G1', 'H1');
    expect(p.text(r)).toBe('f₁(e_G₁) = e_H₁');
    const g = p.generalize(r);
    expect(p.text(g)).toBe('∀G₁ a group. ∀H a group. ∀f : G₁ → H. f(e_G₁) = e_H');
    expect(K.lemmaEligibility(p.fact(g), [], p.graph, p.ctx)).toEqual({ ok: true });
    const sock = p.res.sockets[0]!;
    expect(sock.ok, sock.error).toBe(true);
    oracleOk(p);
  });
  it('the saved card applies at any hom in scope with matching sorts: a Hom Tower, a level hom; never a plain map', () => {
    const fcard: Card = { k: 'law', metas: [], l: app('f', eS('S')), r: eS('T'),
      binds: [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'T' } }] };
    const FE: K.Schema = { id: 'lemma:fe', name: 'f(e) = e', textbook: 'f(e) = e', origin: 'authored', mirrorable: false, card: fcard };
    const p = new Player(ctxWith({
      sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'Q', kind: 'group', label: 'Q' }],
      maps: [{ id: 'pi', label: 'π', args: ['G'], res: 'Q', kind: 'hom' }, { id: 'g', label: 'g', args: ['G'], res: 'Q' }],
    }, [FE]));
    p.graph = { ...p.graph, structs: [{ k: 'grp', id: 'G1', label: 'G₁' }, { k: 'hom', id: 'k1', label: 'k₁', dom: 'G1', cod: 'G1' }] };
    p.res = K.check(p.graph, p.ctx);
    const atTower = p.apply({ k: 'schema', id: 'lemma:fe' }, [], {}, { f: 'k1' });
    expect(p.text(atTower)).toBe('k₁(e_G₁) = e_G₁');
    const atPi = p.apply({ k: 'schema', id: 'lemma:fe' }, [], {}, { f: 'pi' });
    expect(p.text(atPi)).toBe('π(e) = e_Q');
    expect(p.tryNode({ scope: K.ROOT, k: 'apply', rule: { k: 'schema', id: 'lemma:fe' }, inputs: [], subst: {}, structs: { f: 'g' } }).error).toMatch(/not a homomorphism/);
    expect(p.tryNode({ scope: K.ROOT, k: 'apply', rule: { k: 'schema', id: 'lemma:fe' }, inputs: [], subst: {} }).error).toMatch(/Choose which homomorphism plays f/);
    oracleOk(p);
    // an endomorphism card refuses a hom between different groups
    const endo: Card = { k: 'law', metas: [], l: app('f', eS('S')), r: eS('S'), binds: [{ k: 'grp', id: 'S' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'S' } }] };
    const q = new Player(ctxWith({ sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'Q', kind: 'group', label: 'Q' }], maps: [{ id: 'pi', label: 'π', args: ['G'], res: 'Q', kind: 'hom' }] },
      [{ ...FE, id: 'lemma:endo', card: endo }]));
    expect(q.tryNode({ scope: K.ROOT, k: 'apply', rule: { k: 'schema', id: 'lemma:endo' }, inputs: [], subst: {}, structs: { f: 'pi' } }).error).toMatch(/needs one group for S/);
  });
  it('a card naming a level hom is not saveable; a free Hom Tower must be generalized first', () => {
    const p = new Player(ctxWith({ sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'Q', kind: 'group', label: 'Q' }], maps: [{ id: 'pi', label: 'π', args: ['G'], res: 'Q', kind: 'hom' }] }, [IDEM]));
    const r = fe(p, 'pi', 'G', 'Q');
    expect(p.text(r)).toBe('π(e) = e_Q');
    const card: Card = { k: 'law', metas: [], l: app('pi', K.E), r: eS('Q') };
    expect(K.lemmaEligibility(card, [], p.graph, p.ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/Mentions the map π/) });
  });
});

describe('actions (adversary B3): laws without dependencies, not mirrorable', () => {
  it('P7.2: the stabilizer is closed under products', () => {
    const ctx = ctxWith({
      sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'O', kind: 'set', label: 'Ω' }],
      maps: [{ id: 'ev', label: 'ev', args: ['G', 'O'], res: 'O', kind: 'action' }],
      atoms: [{ id: 'a', label: 'α', hue: 0 }, { id: 'b', label: 'β', hue: 1 }, { id: 'p', label: 'p', hue: 2, carrier: 'O' }],
      givens: [{ id: 'ha', name: 'ha', fact: eq(app('ev', A('a'), A('p')), A('p')) }, { id: 'hb', name: 'hb', fact: eq(app('ev', A('b'), A('p')), A('p')) }],
      sockets: [{ id: 's', target: eq(app('ev', P(A('a'), A('b')), A('p')), A('p')), allowedGivens: ['ha', 'hb'] }],
    });
    const p = new Player(ctx);
    const s = p.start(app('ev', P(A('a'), A('b')), A('p')));
    const m = p.step(s, { k: 'rewrite', rule: { k: 'schema', id: 'act.mul' }, dir: 'fwd', at: span('r', 0, 1), subst: { g: A('a'), h: A('b'), p: A('p') }, structs: { σ: 'ev' } });
    expect(p.text(m)).toBe('ev(αβ, p) = ev(α, ev(β, p))');
    const r1 = p.step(m, { k: 'rewrite', rule: { k: 'node', id: 'g:hb' }, dir: 'fwd', at: { side: 'r', path: [1] }, subst: {} });
    const r2 = p.step(r1, { k: 'rewrite', rule: { k: 'node', id: 'g:ha' }, dir: 'fwd', at: span('r', 0, 1), subst: {} });
    expect(p.text(r2)).toBe('ev(αβ, p) = p');
    expect(p.res.sockets[0]!.ok, p.res.sockets[0]!.error).toBe(true);
    expect(K.MAP_SCHEMAS['act.mul']!.mirrorable).toBe(false);
    oracleOk(p);
    expect(K.MAP_SCHEMAS['act.e']!.card.k).toBe('law');
  });
});

describe('W5 functions on sets: P6.1 injective ∘ injective, P6.3 witness dock (onto ∘ onto)', () => {
  const sets = [{ id: 'A', kind: 'set' as const, label: 'A' }, { id: 'B', kind: 'set' as const, label: 'B' }, { id: 'C', kind: 'set' as const, label: 'C' }];
  const maps = [{ id: 'f', label: 'f', args: ['A'], res: 'B' }, { id: 'g', label: 'g', args: ['B'], res: 'C' }];
  const x = M('x'), y = M('y');
  it('P6.1: ∀x,y ∈ A. g(f(x)) = g(f(y)) ⇒ x = y from two injectivity givens', () => {
    const injF: Card = { k: 'cond', metas: ['x', 'y'], metaSorts: { x: 'A', y: 'A' }, premises: [{ k: 'eq', l: app('f', x), r: app('f', y) }], concl: { k: 'eq', l: x, r: y } };
    const injG: Card = { k: 'cond', metas: ['u', 'v'], metaSorts: { u: 'B', v: 'B' }, premises: [{ k: 'eq', l: app('g', M('u')), r: app('g', M('v')) }], concl: { k: 'eq', l: M('u'), r: M('v') } };
    const target: Card = { k: 'cond', metas: ['x', 'y'], metaSorts: { x: 'A', y: 'A' }, premises: [{ k: 'eq', l: app('g', app('f', x)), r: app('g', app('f', y)) }], concl: { k: 'eq', l: x, r: y } };
    const p = new Player(ctxWith({ sorts: sets, maps, atoms: [], givens: [{ id: 'if', name: 'injective f', fact: injF }, { id: 'ig', name: 'injective g', fact: injG }],
      sockets: [{ id: 's', target, allowedGivens: ['if', 'ig'] }] }));
    p.graph = { ...p.graph, vars: [{ id: 'x1', label: 'x₁', hue: 0, variable: true, carrier: 'A' }, { id: 'y1', label: 'y₁', hue: 1, variable: true, carrier: 'A' }] };
    p.res = K.check(p.graph, p.ctx);
    const X = A('x1'), Y = A('y1');
    const { room, desks } = p.openDesks([['eq', app('g', app('f', X)), app('g', app('f', Y))]]);
    const fx = p.apply({ k: 'node', id: 'g:ig' }, [desks[0]!], { u: app('f', X), v: app('f', Y) });
    const xy = p.apply({ k: 'node', id: 'g:if' }, [fx], { x: X, y: Y });
    const g = p.generalize(p.exit(room, xy));
    expect(p.text(g)).toBe('∀x, y. g(f(x)) = g(f(y)) ⇒ x = y');
    expect((p.fact(g) as Card).metaSorts).toEqual({ x: 'A', y: 'A' });
    expect(p.res.sockets[0]!.ok, p.res.sockets[0]!.error).toBe(true);
    // a value of the wrong set is refused
    expect(p.tryNode({ scope: room, k: 'apply', rule: { k: 'node', id: 'g:if' }, inputs: [fx], subst: { x: app('f', X), y: Y } }).ok).toBe(false);
    oracleOk(p);
  });
  it('P6.3: the witness dock ∀z ∃x. g(f(x)) = z, filled with x = s(t(z))', () => {
    const allMaps = [...maps, { id: 's', label: 's', args: ['B'], res: 'A' }, { id: 't', label: 't', args: ['C'], res: 'B' }];
    const secF: Card = { k: 'law', metas: ['y'], metaSorts: { y: 'B' }, l: app('f', app('s', y)), r: y };
    const secG: Card = { k: 'law', metas: ['z'], metaSorts: { z: 'C' }, l: app('g', app('t', M('z'))), r: M('z') };
    const target: Card = { k: 'law', metas: ['z'], metaSorts: { z: 'C' }, l: app('g', app('f', M('w'))), r: M('z') };
    const p = new Player(ctxWith({ sorts: sets, maps: allMaps, atoms: [], givens: [{ id: 'sf', name: 'sf', fact: secF }, { id: 'sg', name: 'sg', fact: secG }],
      sockets: [{ id: 's', target, allowedGivens: ['sf', 'sg'], holes: [{ id: 'w' }] }] }));
    p.graph = { ...p.graph, vars: [{ id: 'z1', label: 'z₁', hue: 0, variable: true, carrier: 'C' }] };
    p.res = K.check(p.graph, p.ctx);
    const Z = A('z1');
    const st = p.start(app('g', app('f', app('s', app('t', Z)))));
    const r1 = p.step(st, { k: 'rewrite', rule: { k: 'node', id: 'g:sf' }, dir: 'fwd', at: { side: 'r', path: [0] }, subst: { y: app('t', Z) } });
    const r2 = p.step(r1, { k: 'rewrite', rule: { k: 'node', id: 'g:sg' }, dir: 'fwd', at: span('r', 0, 1), subst: { z: Z } });
    expect(p.text(r2)).toBe('g(f(s(t(z₁)))) = z₁');
    p.generalize(r2);
    const sock = p.res.sockets[0]!;
    expect(sock.ok, sock.error).toBe(true);
    expect(sock.holes!.w).toEqual(app('s', app('t', M('z'))));
    expect(K.dockText(p.ctx.level.sockets[0]!, K.levelLabels(p.ctx.level))).toBe('∀z. g(f(?)) = z');
    oracleOk(p);
  });
});

describe('mirrors with maps (pin 3)', () => {
  it('a lemma about a plain map or an action has no mirror; a hom-only card keeps one', () => {
    const plain: K.Schema = { id: 'lemma:p', name: 'plain', textbook: 'plain', origin: 'authored', mirrorable: true,
      card: { k: 'law', metas: ['x', 'y'], l: app('g', P(M('x'), M('y'))), r: app('g', P(M('x'), M('y'))) } };
    const homc: K.Schema = { ...plain, id: 'lemma:h', card: { k: 'law', metas: ['x', 'y'], l: app('f', P(M('x'), M('y'))), r: P(app('f', M('x')), app('f', M('y'))) } };
    const ctx = ctxWith({ sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'H', kind: 'group', label: 'H' }],
      maps: [{ id: 'g', label: 'g', args: ['G'], res: 'H' }, { id: 'f', label: 'f', args: ['G'], res: 'H', kind: 'hom' }] }, [plain, homc]);
    expect(() => K.schemaCardOf('lemma:p', true, ctx)).toThrow(/not a homomorphism/);
    expect(() => K.schemaCardOf('lemma:h', true, ctx)).not.toThrow();
  });
});
