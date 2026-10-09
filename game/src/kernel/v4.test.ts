// v4 kernel: variables (Towers), ∀-introduction with the eigenvariable condition, assume rooms
// (implication introduction), invert, product, card sockets, and the oracle over variables.
import { describe, expect, it } from 'vitest';
import * as K from './index';
import type { Card, Fact, ProofGraph, ProofNode, Term } from './types';
import { ROOT } from './types';
import { Player, ctxOf, mkCtx, span, gap } from './testkit';
import { oracleCheck } from '../groups/oracle';

const a = K.atom('a'), b = K.atom('b');
const I = K.inv, M = (...fs: Term[]) => K.mul(fs), e = K.E;
const X = K.meta('x'), Y = K.meta('y'), U = K.meta('u');
const law = (metas: string[], l: Term, r: Term): Card => ({ k: 'law', metas, l, r });

/** A ctx with a ∀ goal (law/cond card target) and no level constants beyond a, b. */
const toolsmith = (target: Card, extra: Parameters<typeof mkCtx>[0] = {}) =>
  mkCtx({ sockets: [{ id: 's', target, allowedGivens: [] }], ...extra });

function oracle(p: Player) {
  const vars = K.withVars(p.ctx, p.graph).vars;
  return oracleCheck(p.ctx.level, p.res.nodes, p.graph.rooms, vars);
}

describe('variables', () => {
  it('declared variables are elements anywhere; undeclared ones are not', () => {
    const p = new Player(mkCtx());
    const x = p.declareVar('x₁');
    const s = p.start('x₁ a');
    expect(p.text(s)).toBe('x₁a = x₁a');
    expect(p.tryNode({ scope: ROOT, k: 'start', term: K.atom('v:y₁') }).ok).toBe(false);
    const lifted = p.tryNode({ scope: ROOT, k: 'step', input: s, op: { k: 'lift', side: 'left', term: I(K.atom(x)) } });
    expect(lifted.ok).toBe(true);
  });
  it('a variable cannot reuse a constant’s name or another variable’s label', () => {
    const ctx = mkCtx();
    const clash: ProofGraph = { nodes: [], rooms: [], vars: [{ id: 'a', label: 'x₁', hue: 0, variable: true }] };
    expect(K.check(clash, ctx).ok).toBe(false);
    const dup: ProofGraph = { nodes: [], rooms: [], vars: [{ id: 'v1', label: 'x₁', hue: 0 }, { id: 'v2', label: 'x₁', hue: 0 }] };
    expect(K.check(dup, ctx).ok).toBe(false);
    // a name used by a given is a constant, never a fresh variable
    const c2 = mkCtx({ givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: K.atom('z'), r: e } }] });
    expect(K.withVars(c2, { nodes: [], rooms: [], vars: [{ id: 'z', label: 'z', hue: 0 }] }).error).toMatch(/That name is already an element/);
  });
  it('prints x₁ and TeX x_{1}; parses x₁, x1 and x_1', () => {
    const atoms = [...mkCtx().level.atoms, { id: 'v:x₁', label: 'x₁', hue: 5, variable: true }];
    const L = K.labelsOf(atoms);
    const t = M(K.atom('v:x₁'), I(K.atom('v:x₁')));
    expect(K.termText(t, L)).toBe('x₁x₁⁻¹');
    expect(K.termTex(t, L)).toBe('x_{1}x_{1}^{-1}');
    for (const src of ['x₁ x₁^-1', 'x1 x1^-1', 'x_1 x_1⁻¹']) {
      const r = K.parseTerm(src, atoms);
      expect(r.ok && K.termEq(r.term, t), src).toBe(true);
    }
  });
});

describe('generalize (∀-introduction)', () => {
  it('∀x. (x⁻¹)⁻¹ = x from axioms alone, filling a law socket up to renaming', () => {
    const p = new Player(toolsmith(law(['u'], I(I(U)), U)));
    p.declareVar('x₁');
    let n = p.start('(x₁^-1)^-1');
    n = p.play(n, gap('r', 1), 'insert x⁻¹x', { x: 'x₁' });
    n = p.play(n, span('r', 0, 2), 'cancel (x₁⁻¹)⁻¹x₁⁻¹');
    expect(p.text(n)).toBe('(x₁⁻¹)⁻¹ = x₁');
    const g = p.generalize(n);
    expect(p.fact(g)).toEqual(law(['x'], I(I(X)), X));
    expect(p.res.nodes[g]!.deps).toEqual([]);
    expect(p.res.solved).toBe(true);
    expect(K.justify(p.graph.nodes.find((m) => m.id === g)!, p.graph, p.ctx)).toBe('x₁ was arbitrary: generalize');
    expect(oracle(p)).toEqual([]);
  });
  it('binds in order of first occurrence and names metas by base letter when unique', () => {
    const p = new Player(mkCtx());
    p.declareVar('y₁'); p.declareVar('x₁'); p.declareVar('x₂');
    const s = p.start('x₂ y₁ x₁');
    const g = p.generalize(s);
    // x₂ first, then y₁, then x₁; x is ambiguous (x₁, x₂) so those take pool names
    const f = p.fact(g) as Card & { k: 'law' };
    expect(f.metas.length).toBe(3);
    expect(f.metas[1]).toBe('y');
    expect(K.sameCardUpToRenaming(f, law(['p', 'q', 'r'], M(K.meta('p'), K.meta('q'), K.meta('r')), M(K.meta('p'), K.meta('q'), K.meta('r'))))).toBe(true);
  });
  it('neq → cond with no premises; level constants stay constants', () => {
    const ctx = mkCtx({ givens: [{ id: 'n', name: 'n', fact: { k: 'neq', l: a, r: e } }], tools: { schemas: ['nofix'] } });
    const p = new Player(ctx);
    const x = p.declareVar('x₁');
    const ap = p.tryNode({ scope: ROOT, k: 'apply', rule: { k: 'schema', id: 'nofix' }, inputs: ['g:n'], subst: { u: a, v: K.atom(x) } });
    expect(ap.ok).toBe(true);
    const g = p.tryNode({ scope: ROOT, k: 'generalize', input: p.graph.nodes.at(-1)!.id });
    expect(g.fact).toEqual({ k: 'cond', metas: ['x'], premises: [], concl: { k: 'neq', l: M(a, X), r: X } });
    expect(g.deps).toEqual(['g:n']);
    expect(oracle(p)).toEqual([]);
  });
  it('law/cond inputs get the new metas prepended without capture', () => {
    const vars = [{ id: 'v:x₁', label: 'x₁', hue: 0, variable: true }];
    const x1 = K.atom('v:x₁');
    const out = K.generalizeFact(law(['x'], M(X, x1), M(x1, X)), vars);
    expect(out.k).toBe('law');
    const c = out as Card & { k: 'law' };
    expect(c.metas[0]).not.toBe('x'); // x is taken by the card's own variable
    expect(c.metas).toHaveLength(2);
    expect(c.metas[1]).toBe('x');
    expect(K.sameCardUpToRenaming(c, law(['p', 'q'], M(K.meta('q'), K.meta('p')), M(K.meta('p'), K.meta('q'))))).toBe(true);
    // a level constant's name is never used as a meta (printing would conflate them)
    const vs = [{ id: 'v:a₁', label: 'a₁', hue: 0, variable: true }];
    const c2 = K.generalizeFact({ k: 'eq', l: M(K.atom('v:a₁'), a), r: e }, vs, [], new Set(['a', 'b']));
    expect((c2 as { metas: string[] }).metas).toEqual(['x']);
  });
  it('nothing to generalize; ⊥ and sizes refuse', () => {
    const p = new Player(mkCtx());
    p.declareVar('x₁');
    const s = p.start('ab');
    const r = p.tryNode({ scope: ROOT, k: 'generalize', input: s });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/No Tower appears in ab = ab\. There is nothing to generalize\./);
    expect(() => K.generalizeFact({ k: 'bot' }, [])).toThrow();
  });
});

describe('eigenvariable condition', () => {
  it('a variable in an assumption the fact rests on is not arbitrary', () => {
    const p = new Player(mkCtx());
    p.declareVar('x₁');
    const { room, assume } = p.openRoom('assume', 'x₁', 'e', ROOT, 'eq');
    const s = p.start('x₁', room);
    const q = p.step(s, { k: 'rewrite', rule: { k: 'node', id: assume }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 1] }, subst: {} });
    expect(p.text(q)).toBe('x₁ = e');
    const bad = p.tryNode({ scope: room, k: 'generalize', input: q });
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe("x₁ appears in the assumption x₁ = e, so it isn't arbitrary. Exit the room first.");
    // the same in a suppose room reads 'supposition'
    const p2 = new Player(mkCtx());
    p2.declareVar('x₁');
    const r2 = p2.openRoom('suppose', 'x₁', 'e');
    const bad2 = p2.tryNode({ scope: r2.room, k: 'generalize', input: r2.assume });
    expect(bad2.error).toMatch(/appears in the supposition x₁ = e/);
    // a fact in the room that does not rest on the assumption may be generalized
    const free = p.start('x₁ x₁^-1', room);
    expect(p.tryNode({ scope: room, k: 'generalize', input: free }).ok).toBe(true);
    // once the assumption is discharged, generalizing is fine
    const ex = p.exit(room, q);
    expect(p.fact(ex)).toEqual({ k: 'cond', metas: [], premises: [{ k: 'eq', l: K.atom('v:x₁'), r: e }], concl: { k: 'eq', l: K.atom('v:x₁'), r: e } });
    const g = p.generalize(ex);
    expect(p.fact(g)).toEqual({ k: 'cond', metas: ['x'], premises: [{ k: 'eq', l: X, r: e }], concl: { k: 'eq', l: X, r: e } });
    expect(oracle(p)).toEqual([]);
  });
  it('a variable not in the assumption may be bound inside the room', () => {
    const p = new Player(mkCtx());
    p.declareVar('x₁');
    const { room, assume } = p.openRoom('assume', 'a', 'e');
    const s = p.start('x₁ a', room);
    const q = p.step(s, { k: 'rewrite', rule: { k: 'node', id: assume }, dir: 'fwd', at: { side: 'r', path: [], range: [1, 2] }, subst: {} });
    const g = p.generalize(q, room);
    expect(p.fact(g)).toEqual(law(['x'], M(X, a), M(X, e)));
    expect(p.res.nodes[g]!.deps).toEqual([`a:${room}`]);
    expect(oracle(p)).toEqual([]);
  });
});

describe('assume rooms (implication introduction)', () => {
  it('Toolsmith: ∀x,y. (xy)⁵ = e ⇒ (yx)⁵ = e with towers, an assume room and ∀', () => {
    const target: Card = { k: 'cond', metas: ['u', 'v'], premises: [{ k: 'eq', l: K.pow(M(U, K.meta('v')), 5), r: e }], concl: { k: 'eq', l: K.pow(M(K.meta('v'), U), 5), r: e } };
    const p = new Player(toolsmith(target));
    p.declareVar('x₁'); p.declareVar('y₁');
    const { room } = p.openRoom('assume', '(x₁ y₁)^5', 'e', ROOT, 'eq');
    let n = p.start('(y₁ x₁)^5', room);
    n = p.play(n, gap('r', 0), 'insert x⁻¹x', { x: 'x₁' });
    n = p.play(n, span('r', 1, 11), /→ e \(by the supposition\)/);
    n = p.play(n, span('r', 0, 2), 'cancel x₁⁻¹x₁');
    expect(p.text(n)).toBe('(y₁x₁)⁵ = e');
    const ex = p.exit(room, n);
    expect(p.res.nodes[ex]!.deps).toEqual([]);
    const g = p.generalize(ex);
    const f = p.fact(g) as Card & { k: 'cond' };
    expect(f.metas).toEqual(['x', 'y']);
    expect(p.text(g)).toBe('∀x, y. (xy)⁵ = e ⇒ (yx)⁵ = e');
    expect(p.res.solved).toBe(true);
    expect(oracle(p)).toEqual([]);
  });
  it('rel neq assumes an inequation; exports need an equation or inequation from that very room', () => {
    const p = new Player(mkCtx());
    const { room, assume } = p.openRoom('assume', 'a', 'e', ROOT, 'neq');
    expect(p.fact(assume)).toEqual({ k: 'neq', l: a, r: e });
    const ex = p.exit(room, assume);
    expect(p.fact(ex)).toEqual({ k: 'cond', metas: [], premises: [{ k: 'neq', l: a, r: e }], concl: { k: 'neq', l: a, r: e } });
    // inner room facts cannot leave through the outer gate; a root fact cannot be exported by it
    const outer = p.openRoom('assume', 'b', 'e');
    const inner = p.openRoom('assume', 'a', 'b', outer.room);
    expect(p.tryNode({ scope: ROOT, k: 'exit', room: outer.room, input: inner.assume }).ok).toBe(false);
    const rootStart = p.start('a');
    expect(p.tryNode({ scope: ROOT, k: 'exit', room: outer.room, input: rootStart }).ok).toBe(false);
    // ⊥ is not exported as an implication
    const c2 = mkCtx({ givens: [{ id: 'n', name: 'n', fact: { k: 'neq', l: a, r: e } }] });
    const q = new Player(c2);
    const r = q.openRoom('assume', 'a', 'e');
    const bot = q.tryNode({ id: 'bot', scope: r.room, k: 'clash', inputs: [r.assume, 'g:n'] });
    expect(bot.ok).toBe(true);
    expect(q.tryNode({ scope: ROOT, k: 'exit', room: r.room, input: 'bot' }).ok).toBe(false);
  });
  it('the exported implication can be applied (modus ponens)', () => {
    const c = mkCtx({ givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: M(a, b), r: e } }] });
    const p = new Player(c);
    const { room, assume } = p.openRoom('assume', 'ab', 'e');
    const s = p.start('ab', room);
    const q = p.step(s, { k: 'rewrite', rule: { k: 'node', id: assume }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 2] }, subst: {} });
    const ex = p.exit(room, q);
    const mp = p.tryNode({ scope: ROOT, k: 'apply', rule: { k: 'node', id: ex }, inputs: ['g:h'], subst: {} });
    expect(mp.fact).toEqual({ k: 'eq', l: M(a, b), r: e });
    expect(mp.deps).toEqual(['g:h']);
  });
});

describe('invert and product', () => {
  it('invert both sides of = and ≠', () => {
    const r = K.evalStep({ k: 'eq', l: M(a, b), r: e }, { k: 'invert' }, mkCtx());
    expect(r.ok && r.pallet).toEqual({ k: 'eq', l: I(M(a, b)), r: I(e) });
    const n = K.evalStep({ k: 'neq', l: a, r: e }, { k: 'invert' }, mkCtx());
    expect(n.ok && n.pallet).toEqual({ k: 'neq', l: I(a), r: I(e) });
    expect(K.evalStep({ k: 'bot' }, { k: 'invert' }, mkCtx()).ok).toBe(false);
  });
  it('product: A = B, C = D ⟹ AC = BD, with both dependencies; equations only; needs lift', () => {
    const c = mkCtx({ givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: M(a, b), r: e } }, { id: 'k', name: 'k', fact: { k: 'eq', l: b, r: a } }, { id: 'n', name: 'n', fact: { k: 'neq', l: a, r: e } }] });
    const p = new Player(c);
    const x = p.product('g:h', 'g:k');
    expect(p.fact(x)).toEqual({ k: 'eq', l: M(a, b, b), r: M(e, a) });
    expect(p.res.nodes[x]!.deps).toEqual(['g:h', 'g:k']);
    expect(p.tryNode({ scope: ROOT, k: 'product', inputs: ['g:h', 'g:n'] }).ok).toBe(false);
    const noLift = new Player({ ...c, level: { ...c.level, tools: { ...c.level.tools, lift: false } } });
    expect(noLift.tryNode({ scope: ROOT, k: 'product', inputs: ['g:h', 'g:k'] }).error).toMatch(/not available/);
    expect(oracle(p)).toEqual([]);
  });
  it('invert is offered as a whole-pallet move', () => {
    const p = new Player(ctxOf('L06'));
    const s = p.play(p.start('ab'), gap('r', 2), 'insert e'); // ab = abe
    const o = p.offers(s, null).find((x) => x.group === 'invert')!;
    expect(o.label).toBe('invert both sides');
    expect(o.preview).toEqual({ k: 'eq', l: I(M(a, b)), r: I(M(a, b, e)) });
  });
});

describe('card sockets', () => {
  const dbl = law(['u'], I(I(U)), U);
  function build(ctx: K.KernelCtx) {
    const p = new Player(ctx);
    p.declareVar('x₁');
    let n = p.start('(x₁^-1)^-1');
    n = p.play(n, gap('r', 1), 'insert x⁻¹x', { x: 'x₁' });
    n = p.play(n, span('r', 0, 2), /^cancel/);
    p.generalize(n);
    return p;
  }
  it('filled up to renaming; not by a different card or a ground fact', () => {
    expect(build(toolsmith(dbl)).res.solved).toBe(true);
    expect(build(toolsmith(law(['u'], I(I(U)), I(U)))).res.solved).toBe(false);
    const p = build(toolsmith({ k: 'cond', metas: ['u'], premises: [], concl: { k: 'eq', l: I(I(U)), r: U } }));
    expect(p.res.solved).toBe(false);
  });
  it('deps must lie within the allowed givens', () => {
    const c = mkCtx({ givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: a, r: e } }], sockets: [{ id: 's', target: law(['u'], M(U, a), U), allowedGivens: [] }] });
    const p = new Player(c);
    p.declareVar('x₁');
    const s = p.start('x₁ a');
    const q = p.step(s, { k: 'rewrite', rule: { k: 'node', id: 'g:h' }, dir: 'fwd', at: { side: 'r', path: [], range: [1, 2] }, subst: {} });
    const q2 = p.step(q, { k: 'rewrite', rule: { k: 'axiom', id: 'unitR' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 2] }, subst: { x: K.atom('v:x₁') } });
    p.generalize(q2);
    expect(p.res.solved).toBe(false);
    expect(p.res.sockets[0]!.error).toMatch(/rests on given h/);
    const ok = new Player({ ...c, level: { ...c.level, sockets: [{ id: 's', target: law(['u'], M(U, a), U), allowedGivens: ['h'] }] } });
    ok.graph = p.graph; ok.res = K.check(p.graph, ok.ctx);
    expect(ok.res.solved).toBe(true);
  });
});

describe('oracle over variables', () => {
  it('catches a false fact about a variable and a false generalized law', () => {
    const level = mkCtx().level;
    const vars = [{ id: 'v:x₁', label: 'x₁', hue: 0, variable: true }];
    const node = (fact: Fact, deps: string[] = []) => ({ ok: true, fact, deps });
    expect(oracleCheck(level, { fake: node({ k: 'eq', l: K.atom('v:x₁'), r: e }) }, [], vars)).toHaveLength(1);
    expect(oracleCheck(level, { ok: node({ k: 'eq', l: M(K.atom('v:x₁'), I(K.atom('v:x₁'))), r: e }) }, [], vars)).toEqual([]);
    expect(oracleCheck(level, { fakeLaw: node(law(['x', 'y'], M(X, Y), M(Y, X))) }, [], vars)).toHaveLength(1);
    // assume-room hypotheses are honoured
    const rooms = [{ id: 'R', kind: 'assume' as const, l: K.atom('v:x₁'), r: e, rel: 'eq' as const }];
    expect(oracleCheck(level, { inRoom: node({ k: 'eq', l: K.atom('v:x₁'), r: e }, ['a:R']) }, rooms, vars)).toEqual([]);
  });
});

describe('kernel extras stay consistent', () => {
  it('families and metrics for the new nodes', () => {
    const p = new Player(toolsmith(law(['u'], I(I(U)), U)));
    p.declareVar('x₁');
    let n = p.start('(x₁^-1)^-1');
    n = p.play(n, gap('r', 1), 'insert x⁻¹x', { x: 'x₁' });
    n = p.play(n, span('r', 0, 2), /^cancel/);
    const g = p.generalize(n);
    const node = p.graph.nodes.find((m) => m.id === g) as ProofNode;
    expect(K.familyOf(node, p.graph)).toBe('lemma');
    expect(K.metrics(p.graph, p.res, p.ctx)).toMatchObject({ parts: 3, axioms: 5 });
  });
});

describe('graph order and cycles through v4 nodes', () => {
  const vars = [{ id: 'v:x₁', label: 'x₁', hue: 5, variable: true }];
  it('a cycle through a generalize node is rejected before anything else', () => {
    const ctx = mkCtx();
    const g: ProofGraph = { vars, rooms: [], nodes: [
      { id: 'G', scope: ROOT, k: 'generalize', input: 'S' },
      { id: 'S', scope: ROOT, k: 'step', input: 'G', op: { k: 'swap' } },
      { id: 's', scope: ROOT, k: 'start', term: K.atom('v:x₁') },
    ] };
    const r = K.check(g, ctx);
    expect(r.ok).toBe(false);
    expect(r.nodes['G']!.error).toMatch(/circular/);
    expect(r.nodes['S']!.error).toMatch(/circular/);
    expect(r.nodes['s']!.ok).toBe(true);
  });
  it('cycles through product and through an assume exit are rejected', () => {
    const ctx = mkCtx();
    const prod: ProofGraph = { rooms: [], nodes: [
      { id: 'P', scope: ROOT, k: 'product', inputs: ['s', 'Q'] },
      { id: 'Q', scope: ROOT, k: 'step', input: 'P', op: { k: 'swap' } },
      { id: 's', scope: ROOT, k: 'start', term: a },
    ] };
    expect(K.check(prod, ctx).nodes['P']!.error).toMatch(/circular/);
    const ex: ProofGraph = { rooms: [{ id: 'R', parent: ROOT, kind: 'assume', l: a, r: e }], nodes: [
      { id: 'X', scope: ROOT, k: 'exit', room: 'R', input: 'T' },
      { id: 'T', scope: 'R', k: 'apply', rule: { k: 'node', id: 'X' }, inputs: ['h'], subst: {} },
      { id: 'h', scope: 'R', k: 'assume', room: 'R' },
    ] };
    const r = K.check(ex, ctx);
    expect(r.ok).toBe(false);
    expect(r.nodes['X']!.error).toMatch(/circular/);
  });
  it('product and generalize evaluate after their inputs, whatever the listing order', () => {
    const ctx = mkCtx();
    const g: ProofGraph = { vars, rooms: [], nodes: [
      { id: 'G', scope: ROOT, k: 'generalize', input: 'P' },
      { id: 'P', scope: ROOT, k: 'product', inputs: ['s1', 's2'] },
      { id: 's1', scope: ROOT, k: 'start', term: K.atom('v:x₁') },
      { id: 's2', scope: ROOT, k: 'start', term: a },
    ] };
    const r = K.check(g, ctx);
    expect(r.ok).toBe(true);
    expect(r.nodes['P']!.fact).toEqual({ k: 'eq', l: M(K.atom('v:x₁'), a), r: M(K.atom('v:x₁'), a) });
    expect(r.nodes['G']!.fact).toEqual(law(['x'], M(X, a), M(X, a)));
  });
});
