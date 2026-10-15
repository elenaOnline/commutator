// Book phase A kernel tests: open docks (holes, Skolem witnesses) and multi-desk Assume rooms.
// Spec: design/pinter/KERNEL-EXT.md §1–§2.
import { describe, expect, it } from 'vitest';
import * as K from './index';
import { Player, mkCtx, span } from './testkit';
import { oracleCheck } from '../groups/oracle';
import type { Card, HoleDecl, LevelManifest, Pallet, SocketDecl, Term } from './types';
import { polyConst, polyZmeta } from './poly';

const a = K.atom('a'), b = K.atom('b'), c = K.atom('c'), d = K.atom('d');
const M = (id: string): Term => ({ k: 'meta', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]) => K.mul(fs);
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const neq = (l: Term, r: Term): Pallet => ({ k: 'neq', l, r });
const law = (metas: string[], l: Term, r: Term): Card => ({ k: 'law', metas, l, r });
const cond = (metas: string[], premises: Pallet[], concl: Pallet): Card =>
  ({ k: 'cond', metas, premises: premises as never, concl: concl as never });
const H = (id: string, extra: Partial<HoleDecl> = {}): HoleDecl => ({ id, ...extra });
const L = { a: 'a', b: 'b', c: 'c', d: 'd' };

/** A context with one socket `s`. */
function ctxWith(target: Pallet | Card, holes: HoleDecl[] | undefined, givens: LevelManifest['givens'] = [], allowed?: string[]): K.KernelCtx {
  const sock: SocketDecl = { id: 's', target, allowedGivens: allowed ?? givens.map((g) => g.id), ...(holes ? { holes } : {}) };
  return mkCtx({ givens, sockets: [sock] });
}
const given = (id: string, fact: K.Fact) => ({ id, name: id, fact });
const sock = (p: Player) => p.res.sockets.find((x) => x.id === 's')!;

/** Every accepted node passes the finite-group oracle (rooms with several desks included). */
function oracleOk(p: Player) {
  const vars = K.withVars(p.ctx, p.graph).vars;
  expect(oracleCheck(p.ctx.level, p.res.nodes, p.graph.rooms, vars)).toEqual([]);
}

describe('open docks: solve for d (pallet targets)', () => {
  const target = eq(d, M('h'));
  const holes = [H('h', { notMentioning: ['d'] })];

  it('a fact of the shape d = T with T free of d fills the dock and reports T', () => {
    const p = new Player(ctxWith(target, holes, [given('g', eq(d, P(a, b)))]));
    const s = sock(p);
    expect(s.ok, s.error).toBe(true);
    expect(K.termEq(s.holes!.h!, P(a, b))).toBe(true);
    expect(K.factText(s.instance!, L)).toBe('d = ab');
    expect(K.dockText(p.ctx.level.sockets[0]!, L)).toBe('d = ?');
    expect(K.dockText(p.ctx.level.sockets[0]!, L, s.holes)).toBe('d = ab');
    oracleOk(p);
  });

  it('notMentioning: an answer that mentions d never fills, however it is dressed', () => {
    const p = new Player(ctxWith(target, holes));
    const s1 = p.start('d');                                                  // d = d
    const s2 = p.step(s1, { k: 'insertE', at: { side: 'r', path: [], gap: 0 } }); // d = e d
    expect(K.factText(p.fact(s2)!, L)).toBe('d = ed');
    const r = sock(p);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('d = ? is not proved yet.');
    expect(r.holes).toBeUndefined();
  });

  it('the matcher binds the WHOLE right side: d = ab⁻¹d is not an answer (it mentions d)', () => {
    const p = new Player(ctxWith(target, holes, [given('g', eq(d, P(a, I(b), d)))]));
    expect(sock(p).ok).toBe(false);
  });

  it('orientation is exact in the kernel (the factory records a swap); ab = d does not fill d = ?', () => {
    const p = new Player(ctxWith(target, holes, [given('g', eq(P(a, b), d))]));
    expect(sock(p).ok).toBe(false);
    const fill = K.fillOpen(p.ctx.level.sockets[0]!, eq(P(a, b), d), { allowFlip: true, sameCard: K.sameCardUpToPermutation });
    expect(fill?.flipped).toBe(true);
    expect(K.factText(fill!.instance, L)).toBe('d = ab');
  });

  it('dependencies must lie within the allowed givens', () => {
    const p = new Player(ctxWith(target, holes, [given('g', eq(d, a))], []));
    const s = sock(p);
    expect(s.ok).toBe(false);
    expect(s.error).toContain('rests on the given g');
  });

  it('a hole never binds a free Tower variable', () => {
    const q = new Player(ctxWith(eq(a, M('h')), [H('h')]));
    q.declareVar('x₁');
    const t1 = q.start('a');
    const t2 = q.step(t1, { k: 'insertE', at: { side: 'r', path: [], gap: 0 } });
    const t3 = q.step(t2, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'rev', at: span('r', 0, 1), subst: { x: K.atom('v:x₁') } });
    expect(q.text(t3)).toBe('a = x₁x₁⁻¹a');
    // only t3 sits at the end of its belt; the kernel takes the first root node in graph order, so test t3 alone
    const only = new Player(q.ctx, { ...q.graph, nodes: q.graph.nodes.map((n) => (n.id === t3 ? n : { ...n, scope: n.scope })) });
    const sd = only.ctx.level.sockets[0]!;
    expect(K.fillOpen(sd, only.fact(t3)!, { rigid: new Set(['v:x₁']), sameCard: K.sameCardUpToPermutation })).toBeNull();
    expect(K.fillOpen(sd, only.fact(t3)!, { sameCard: K.sameCardUpToPermutation })).not.toBeNull();
    // and in the full check, the dock is filled by a = a (h = a), never by the Tower answer
    expect(K.termEq(q.res.sockets[0]!.holes!.h!, a)).toBe(true);
  });

  it('repeated holes bind one term', () => {
    const tg = eq(P(M('h'), M('h')), a);
    expect(new Player(ctxWith(tg, [H('h')], [given('g', eq(P(b, b), a))])).res.sockets[0]!.ok).toBe(true);
    expect(new Player(ctxWith(tg, [H('h')], [given('g', eq(P(b, c), a))])).res.sockets[0]!.ok).toBe(false);
    // a run: (bc)(bc) = a binds h = bc
    const r = new Player(ctxWith(tg, [H('h')], [given('g', eq(P(b, c, b, c), a))])).res.sockets[0]!;
    expect(r.ok).toBe(true);
    expect(K.termEq(r.holes!.h!, P(b, c))).toBe(true);
    // and bcb·c is not of the shape h h
    expect(new Player(ctxWith(tg, [H('h')], [given('g', eq(P(b, c, b), a))])).res.sockets[0]!.ok).toBe(false);
  });

  it('the shape around holes is rigid: ?·b⁻¹ = c needs a b⁻¹ factor at the end', () => {
    const tg = eq(P(M('h'), I(b)), c);
    expect(new Player(ctxWith(tg, [H('h')], [given('g', eq(P(a, a, I(b)), c))])).res.sockets[0]!.ok).toBe(true);
    expect(new Player(ctxWith(tg, [H('h')], [given('g', eq(P(a, a, b), c))])).res.sockets[0]!.ok).toBe(false);
    // a hole binds a non-empty run: b⁻¹ = c alone does not fill (no empty witness)
    expect(new Player(ctxWith(tg, [H('h')], [given('g', eq(I(b), c))])).res.sockets[0]!.ok).toBe(false);
  });

  it('≠ docks with holes: a ≠ ? is filled by a ≠ T', () => {
    const p = new Player(ctxWith(neq(a, M('h')), [H('h')], [given('g', neq(a, P(b, c)))]));
    expect(p.res.sockets[0]!.ok).toBe(true);
    expect(K.factText(p.res.sockets[0]!.instance!, L)).toBe('a ≠ bc');
    // an equation of the same shape does not fill a ≠ dock
    expect(new Player(ctxWith(neq(a, M('h')), [H('h')], [given('g', eq(a, b))])).res.sockets[0]!.ok).toBe(false);
  });

  it('a ℤ hole in an exponent: a^? = e', () => {
    const tg = eq({ k: 'pow', base: a, exp: polyZmeta('n') }, K.E);
    const p = new Player(ctxWith(tg, [H('n', { sort: 'Z' })], [given('g', eq({ k: 'pow', base: a, exp: polyConst(5) }, K.E))]));
    const s = p.res.sockets[0]!;
    expect(s.ok, s.error).toBe(true);
    expect(s.holes!.n).toEqual({ k: 'int', val: polyConst(5) });
    expect(K.dockText(p.ctx.level.sockets[0]!, L)).toBe('a^? = e');
    expect(K.dockText(p.ctx.level.sockets[0]!, L, s.holes)).toBe('a^5 = e');
  });

  it('several holes display as ?₁, ?₂ and fill independently', () => {
    const sd: SocketDecl = { id: 's', target: eq(P(M('p'), M('q')), a), allowedGivens: [], holes: [H('p'), H('q')] };
    expect(K.dockText(sd, L)).toBe('?₁?₂ = a');
  });
});

describe('open docks: declaration hygiene', () => {
  const bad = (target: Pallet | Card, holes: HoleDecl[]) => K.holesProblem({ id: 's', target, allowedGivens: [], holes });
  it('rejects malformed hole declarations', () => {
    expect(bad(eq(d, M('h')), [H('k')])).toMatch(/must stand for an element/);
    expect(bad(eq(d, P(M('h'), M('y'))), [H('h')])).toMatch(/not a hole/);
    expect(bad(eq(d, M('h')), [H('h'), H('h')])).toMatch(/both called/);
    expect(bad(eq(d, M('h')), [H('h', { sort: 'Z' })])).toMatch(/exponent/);
    expect(bad(law(['x', 'h'], P(M('x'), M('h')), K.E), [H('h')])).toMatch(/also bound/);
    expect(bad(eq(d, M('h')), [H('h')])).toBeNull();
    // a malformed dock is reported, never filled
    const p = new Player(ctxWith(eq(d, P(M('h'), M('y'))), [H('h')], [given('g', eq(d, P(a, b)))]));
    expect(p.res.sockets[0]!.ok).toBe(false);
    expect(p.res.sockets[0]!.error).toMatch(/malformed/);
  });

  it('holes never ride belts: an equation given with a variable is refused', () => {
    const p = new Player(ctxWith(eq(d, a), undefined));
    const r = p.tryNode({ scope: K.ROOT, k: 'given', givenId: 'zz' });
    expect(r.ok).toBe(false);
    const q = new Player(mkCtx({ givens: [given('g', eq(d, M('h')))], sockets: [] }), { nodes: [], rooms: [] });
    expect(q.tryNode({ scope: K.ROOT, k: 'given', givenId: 'g' }).error).toMatch(/has a variable/);
  });

  it('an open dock is ∃, so generalize() gives no card, and an open card never enters the Lemma Book', () => {
    const lv = mkCtx({ sockets: [{ id: 's', target: law(['x'], P(M('x'), M('y')), K.E), allowedGivens: [], holes: [H('y')] }] });
    expect(K.generalize(lv.level, 's')).toBeNull();
    const elig = K.lemmaEligibility(law(['x'], P(M('x'), M('y')), K.E), [], { nodes: [], rooms: [] }, lv);
    expect(elig.ok).toBe(false);
  });
});

describe('witness docks: holes under ∀ are Skolem terms over the binders', () => {
  const x = M('x');
  const target = law(['x'], P(x, M('y')), K.E); // ∀x ∃y. x y = e
  const ctx = () => ctxWith(target, [H('y')]);

  function rightInverse(p: Player, flip = false) {
    p.declareVar('x₁');
    const X = K.atom('v:x₁');
    const s = p.start(P(X, I(X)));
    const c1 = p.step(s, { k: 'rewrite', rule: { k: 'axiom', id: 'invR' }, dir: 'fwd', at: span('r', 0, 2), subst: { x: X } });
    return p.generalize(flip ? p.step(c1, { k: 'swap' }) : c1);
  }

  it('∀x. x x⁻¹ = e fills ∀x. x·? = e with the witness x⁻¹ (in the dock’s own binder)', () => {
    const p = new Player(ctx());
    rightInverse(p);
    const s = sock(p);
    expect(s.ok, s.error).toBe(true);
    expect(s.holes!.y).toEqual(I(x));
    expect(K.factText(s.instance!, {})).toBe('∀x. xx⁻¹ = e');
    expect(K.dockText(p.ctx.level.sockets[0]!, {})).toBe('∀x. x? = e');
    oracleOk(p);
  });

  it('a law read the other way round also fills (as for closed ∀ docks)', () => {
    const p = new Player(ctx());
    rightInverse(p, true);
    expect(sock(p).ok).toBe(true);
    expect(sock(p).holes!.y).toEqual(I(x));
  });

  it('a witness may not mention a variable the dock does not bind', () => {
    const tg = law(['x'], P(x, M('y')), P(x, M('y')));
    const f2 = law(['u', 'v'], P(M('u'), M('v')), P(M('u'), M('v')));
    const f1 = law(['u'], P(M('u'), M('u')), P(M('u'), M('u')));
    const sd: SocketDecl = { id: 's', target: tg, allowedGivens: [], holes: [H('y')] };
    expect(K.fillOpen(sd, f2, { sameCard: K.sameCardUpToPermutation })).toBeNull();
    const ok = K.fillOpen(sd, f1, { sameCard: K.sameCardUpToPermutation });
    expect(ok?.holes.y).toEqual(x);
  });

  it('binders map one-to-one: ∀u. u·u·u = e does not fill ∀x,z. x·?·z = e (x and z would both be u)', () => {
    const z = M('z');
    const sd: SocketDecl = { id: 's', target: law(['x', 'z'], P(x, M('h'), z), K.E), allowedGivens: [], holes: [H('h')] };
    expect(K.fillOpen(sd, law(['u'], P(M('u'), M('u'), M('u')), K.E), { sameCard: K.sameCardUpToPermutation })).toBeNull();
    const two = K.fillOpen(sd, law(['u', 'v'], P(M('u'), I(M('v')), M('v')), K.E), { sameCard: K.sameCardUpToPermutation });
    expect(two?.holes.h).toEqual(I(z));
    // shape only: the oracle, not the dock, is what knows ∀u,v. u v⁻¹ v = e is false; the kernel never proves it
  });

  it('cond witness docks: ∀x. x x = e ⟹ x⁻¹ = ?', () => {
    const tg = cond(['x'], [eq(P(x, x), K.E)], eq(I(x), M('w')));
    const sd: SocketDecl = { id: 's', target: tg, allowedGivens: [], holes: [H('w')] };
    const fact = cond(['u'], [eq(P(M('u'), M('u')), K.E)], eq(I(M('u')), M('u')));
    const f = K.fillOpen(sd, fact, { sameCard: K.sameCardUpToPermutation });
    expect(f?.holes.w).toEqual(x);
    // a different premise does not fill
    expect(K.fillOpen(sd, cond(['u'], [eq(P(M('u'), M('u'), M('u')), K.E)], eq(I(M('u')), M('u'))), { sameCard: K.sameCardUpToPermutation })).toBeNull();
  });

  it('ℤ binders and holes together: ∀x,n. (xⁿ)⁻¹ = x^?', () => {
    const pw = (t: Term, e: K.Poly): Term => ({ k: 'pow', base: t, exp: e });
    const tg = law(['x', 'n'], I(pw(x, polyZmeta('n'))), pw(x, polyZmeta('m')));
    const sd: SocketDecl = { id: 's', target: tg, allowedGivens: [], holes: [H('m', { sort: 'Z' })] };
    const neg = K.polyNeg(polyZmeta('k'));
    const fact = law(['u', 'k'], I(pw(M('u'), polyZmeta('k'))), pw(M('u'), neg));
    const f = K.fillOpen(sd, fact, { sameCard: K.sameCardUpToPermutation });
    expect(f?.holes.m).toEqual({ k: 'int', val: K.polyNeg(polyZmeta('n')) });
  });
});

describe('multi-desk Assume rooms', () => {
  const X = K.atom('v:x₁'), Y = K.atom('v:y₁');

  it('each desk emits its own assumption with its own dep; the gate exports every premise and drops every room dep', () => {
    const p = new Player(mkCtx());
    p.declareVar('x₁'); p.declareVar('y₁');
    const { room, desks } = p.openDesks([['eq', 'x₁', 'a'], ['eq', 'y₁', 'a']]);
    expect(p.res.nodes[desks[0]!]!.deps).toEqual([`a:${room}`]);
    expect(p.res.nodes[desks[1]!]!.deps).toEqual([`a:${room}/1`]);
    expect(K.depRoom(`a:${room}/1`)).toEqual({ room, slot: 1 });
    expect(K.depRoom(`a:${room}`)).toEqual({ room, slot: 0 });
    expect(K.roomDep(room, 2)).toBe(`a:${room}/2`);
    const m = p.merge(desks[0]!, desks[1]!);                  // x₁ = y₁
    const ex = p.exit(room, m);
    expect(p.res.nodes[ex]!.deps).toEqual([]);
    expect(p.text(ex)).toBe('x₁ = a, y₁ = a ⟹ x₁ = y₁');
    const g = p.generalize(ex);
    expect(p.text(g)).toBe('∀x, y. x = a, y = a ⟹ x = y');
    oracleOk(p);
  });

  it('the gate exports all k premises even when Q uses only one', () => {
    const p = new Player(mkCtx());
    const { room, desks } = p.openDesks([['eq', 'a', 'b'], ['neq', 'c', 'd'], ['eq', 'b', 'c']]);
    const ex = p.exit(room, desks[1]!);
    expect(p.text(ex)).toBe('a = b, c ≠ d, b = c ⟹ c ≠ d');
    expect(p.res.nodes[ex]!.deps).toEqual([]);
    oracleOk(p);
  });

  it('per-desk deps make the eigenvariable check exact: a fact resting only on desk 1 generalizes over a variable desk 0 mentions', () => {
    const p = new Player(mkCtx());
    p.declareVar('x₁'); p.declareVar('y₁');
    const { desks } = p.openDesks([['eq', 'x₁', 'a'], ['eq', 'y₁', 'b']]);
    const sy = p.start('y₁', p.graph.nodes.find((n) => n.id === desks[0])!.scope);
    const r1 = p.step(sy, { k: 'rewrite', rule: { k: 'node', id: desks[1]! }, dir: 'fwd', at: span('l', 0, 1), subst: {} });
    const r2 = p.step(r1, { k: 'rewrite', rule: { k: 'node', id: desks[1]! }, dir: 'fwd', at: span('r', 0, 1), subst: {} });
    expect(p.text(r2)).toBe('b = b');
    const sx = p.start('x₁', p.graph.nodes.find((n) => n.id === desks[0])!.scope);
    const pr = p.product(r2, sx, p.graph.nodes.find((n) => n.id === desks[0])!.scope); // b x₁ = b x₁, rests on desk 1 only
    expect(p.res.nodes[pr]!.deps.length).toBe(1);
    const g = p.tryNode({ scope: p.graph.nodes.find((n) => n.id === desks[0])!.scope, k: 'generalize', input: pr });
    expect(g.ok, g.error).toBe(true);
    // resting on desk 0 (which mentions x₁) is refused
    const pr2 = p.product(desks[0]!, sx, p.graph.nodes.find((n) => n.id === desks[0])!.scope);
    const g2 = p.tryNode({ scope: p.graph.nodes.find((n) => n.id === desks[0])!.scope, k: 'generalize', input: pr2 });
    expect(g2.ok).toBe(false);
    expect(g2.error).toMatch(/isn't arbitrary/);
    oracleOk(p);
    void X; void Y;
  });

  it('a ∀ dock with several premises is filled in any premise order (and the Lemma Book compares the same way)', () => {
    const x = M('x'), y = M('y');
    const target = cond(['x', 'y'], [eq(y, a), eq(x, a)], eq(x, y));
    const p = new Player(ctxWith(target, undefined));
    p.declareVar('x₁'); p.declareVar('y₁');
    const { room, desks } = p.openDesks([['eq', 'x₁', 'a'], ['eq', 'y₁', 'a']]);
    p.generalize(p.exit(room, p.merge(desks[0]!, desks[1]!)));
    expect(sock(p).ok, sock(p).error).toBe(true);
    const made = cond(['x', 'y'], [eq(x, a), eq(y, a)], eq(x, y));
    expect(K.sameCardUpToRenaming(made, target)).toBe(false);
    expect(K.sameCardUpToPermutation(made, target)).toBe(true);
    // permutation never identifies different statements
    expect(K.sameCardUpToPermutation(made, cond(['x', 'y'], [eq(x, a), eq(y, b)], eq(x, y)))).toBe(false);
    // (renaming x ↔ y with a premise swap is the same statement; a different conclusion is not)
    expect(K.sameCardUpToPermutation(made, cond(['x', 'y'], [eq(x, a), eq(y, a)], eq(y, x)))).toBe(true);
    expect(K.sameCardUpToPermutation(made, cond(['x', 'y'], [eq(x, a), eq(y, a)], eq(x, b)))).toBe(false);
  });

  it('desk/room hygiene: at most three, Assume rooms only, slots in range, names', () => {
    const base = new Player(mkCtx());
    const four = Array.from({ length: 4 }, () => ({ rel: 'eq' as const, l: a, r: a }));
    const roomOf = (over: Partial<K.Room>): K.Room => ({ id: 'R', parent: K.ROOT, kind: 'assume', l: a, r: a, ...over });
    const tryRoom = (room: K.Room, slot?: number) => K.check({ nodes: [{ id: 'n', scope: room.id, k: 'assume', room: room.id, ...(slot !== undefined ? { slot } : {}) }], rooms: [room] }, base.ctx).nodes.n!;
    expect(tryRoom(roomOf({ assumes: four })).error).toMatch(/at most 3/);
    expect(tryRoom(roomOf({ kind: 'suppose', assumes: [{ rel: 'eq', l: a, r: b }] })).error).toMatch(/Only an Assume room/);
    expect(tryRoom(roomOf({ assumes: [{ rel: 'eq', l: a, r: b }] }), 1).error).toMatch(/no assumption/);
    expect(tryRoom(roomOf({ assumes: [{ rel: 'foo' as never, l: a, r: b }] })).error).toMatch(/equation, inequation or membership/);
    expect(tryRoom(roomOf({ id: 'R/1' })).error).toMatch(/may not end/);
    expect(tryRoom(roomOf({ assumes: [{ rel: 'eq', l: K.atom('zz'), r: b }] })).error).toMatch(/not an element/);
    // a single-desk room is unchanged: slot 0, dep a:R, premise from l/r/rel
    const ok = tryRoom(roomOf({ rel: 'neq', l: a, r: b }));
    expect(ok.ok).toBe(true);
    expect(ok.deps).toEqual(['a:R']);
    expect(ok.fact).toEqual(neq(a, b));
  });
});

describe('open-dock pins (SYNTHESIS §4.1 pin 5)', () => {
  const x = M('x'), y = M('y');
  it('holes go in the conclusion only', () => {
    const tg = cond(['x'], [eq(P(x, M('h')), K.E)], eq(x, x));
    expect(K.holesProblem({ id: 's', target: tg, allowedGivens: [], holes: [H('h')] })).toMatch(/conclusion only/);
  });
  it('authoring check: a bare Spool of either side must not fill the dock', () => {
    // (xy)⁻¹ = ? is filled by t = t through ∀ — which is why it cannot replace shoes-and-socks
    const shoes: SocketDecl = { id: 's', target: law(['x', 'y'], I(P(x, y)), M('h')), allowedGivens: [], holes: [H('h')] };
    expect(K.trivialFill(shoes)).not.toBeNull();
    // solve for d: the spool d = d is barred by notMentioning
    expect(K.trivialFill({ id: 's', target: eq(d, M('h')), allowedGivens: [], holes: [H('h', { notMentioning: ['d'] })] })).toBeNull();
    // without the constraint, d = d would fill it
    expect(K.trivialFill({ id: 's', target: eq(d, M('h')), allowedGivens: [], holes: [H('h')] })).not.toBeNull();
    // ab = ?? (P4.s4) and a = ?b?⁻¹ (P12.2) are not trivially filled
    expect(K.trivialFill({ id: 's', target: eq(P(a, b), P(M('h'), M('h'))), allowedGivens: [], holes: [H('h')] })).toBeNull();
    expect(K.trivialFill({ id: 's', target: eq(a, P(M('h'), b, I(M('h')))), allowedGivens: [], holes: [H('h')] })).toBeNull();
    // cond: ∀x. xx = e ⟹ x⁻¹ = ? is not filled by xx = e ⟹ x⁻¹ = x⁻¹ only if ? may not be x⁻¹ — it may, so it is trivial
    expect(K.trivialFill({ id: 's', target: cond(['x'], [eq(P(x, x), K.E)], eq(I(x), M('w'))), allowedGivens: [], holes: [H('w')] })).not.toBeNull();
    void y;
  });
  it('witness levels: P4.s4 ab = ?? (witness ad) and P12.2 a = ?b?⁻¹ fill as intended', () => {
    const s4 = new Player(ctxWith(eq(P(a, b), P(M('h'), M('h'))), [H('h')], [given('g', eq(P(a, b), P(a, d, a, d)))]));
    expect(K.termEq(s4.res.sockets[0]!.holes!.h!, P(a, d))).toBe(true);
    const cj = new Player(ctxWith(eq(a, P(M('h'), b, I(M('h')))), [H('h')], [given('g', eq(a, P(c, d, b, I(P(c, d)))))]));
    expect(K.termEq(cj.res.sockets[0]!.holes!.h!, P(c, d))).toBe(true);
    // the distributed inverse is a different shape: the player must fold it (shoes and socks) first
    expect(new Player(ctxWith(eq(a, P(M('h'), b, I(M('h')))), [H('h')], [given('g', eq(a, P(c, d, b, I(d), I(c))))])).res.sockets[0]!.ok).toBe(false);
  });
});
