// Representative cases from design/reviews/sol-math-adversary-r1.md §4 (K01–K118),
// adapted to the v2 contract (KERNEL.md). The full suite lives in tests/ (acceptance builder).
import { describe, expect, it } from 'vitest';
import * as K from './index';
import type { Fact, Pallet, ProofGraph, ProofNode, StepOp, Subst, Term } from './types';
import { ROOT } from './types';
import { ctxOf, mkCtx } from './testkit';
import { REGISTRY } from '../levels/levels';

const a = K.atom('a'), b = K.atom('b'), c = K.atom('c'), d = K.atom('d'), e1 = K.atom('e1');
const x = K.meta('x');
const I = K.inv, M = (...fs: Term[]) => K.mul(fs), e = K.E;
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const neq = (l: Term, r: Term): Pallet => ({ k: 'neq', l, r });
const ax = (id: K.AxiomId): K.RuleRef => ({ k: 'axiom', id });
const at = (side: 'l' | 'r', s: number, t: number, path: number[] = []): K.Addr => ({ side, path, range: [s, t] });
const rw = (rule: K.RuleRef, dir: 'fwd' | 'rev', where: K.Addr, subst: Subst = {}): StepOp => ({ k: 'rewrite', rule, dir, at: where, subst });

const CTX = mkCtx({ tools: { schemas: ['witness', 'cancel', 'socks', 'nofix'] } });
/** Evaluate a step on a rail `t = t` style pallet whose right rail is `r`. Returns the right rail or the error. */
function onR(r: Term, op: StepOp, ruleFact?: Fact, ctx = CTX): Term | string {
  const res = K.evalStep(eq(a, r), op, ctx, ruleFact);
  return res.ok ? (res.pallet as { r: Term }).r : `ERR: ${res.error}`;
}
const ok = (t: Term | string, want: Term) => { expect(typeof t).toBe('object'); expect(K.termEq(t as Term, want)).toBe(true); };
const rejects = (t: Term | string) => expect(t).toMatch(/^ERR/);

/** Build and check a small graph. */
function run(nodes: ProofNode[], ctx = CTX, rooms: K.Room[] = []) {
  const g: ProofGraph = { nodes, rooms };
  return K.check(g, ctx);
}
const S = (id: string, term: Term, scope = ROOT): ProofNode => ({ id, scope, k: 'start', term });
const step = (id: string, input: string, op: StepOp, scope = ROOT): ProofNode => ({ id, scope, k: 'step', input, op });
const apply = (id: string, rule: K.RuleRef, inputs: string[], subst: Subst, scope = ROOT): ProofNode => ({ id, scope, k: 'apply', rule, inputs, subst });
const given = (id: string, scope = ROOT): ProofNode => ({ id: `g:${id}`, scope, k: 'given', givenId: id });

describe('K01–K06 normal form', () => {
  it('K01 flattens in order', () => expect(K.norm({ k: 'mul', fs: [a, { k: 'mul', fs: [b, c] }] })).toEqual(M(a, b, c)));
  it('K02 singleton collapses', () => expect(K.norm({ k: 'mul', fs: [a] })).toEqual(a));
  it('K03 empty product rejected', () => { expect(() => K.norm({ k: 'mul', fs: [] })).toThrow(); expect(run([S('s', { k: 'mul', fs: [] })]).ok).toBe(false); });
  it('K04 no simplification', () => expect(K.norm(M(a, e, I(a)))).toEqual({ k: 'mul', fs: [a, e, { k: 'inv', arg: a }] }));
  it('K05 no double-inverse', () => expect(K.norm(I(I(a)))).toEqual({ k: 'inv', arg: { k: 'inv', arg: a } }));
  it('K06 cap retained', () => expect(K.norm({ k: 'inv', arg: { k: 'mul', fs: [a, { k: 'mul', fs: [b, c] }] } })).toEqual(I(M(a, b, c))));
});

describe('K07–K18 inverse and unit stamps', () => {
  it('K07 IR on whole a b (ab)⁻¹, x=ab', () => ok(onR(M(a, b, I(M(a, b))), rw(ax('invR'), 'fwd', at('r', 0, 3), { x: M(a, b) })), e));
  it('K08 IL on whole (ab)⁻¹ a b', () => ok(onR(M(I(M(a, b)), a, b), rw(ax('invL'), 'fwd', at('r', 0, 3), { x: M(a, b) })), e));
  it('K09 IR on a (ab)⁻¹ rejected', () => rejects(onR(M(a, I(M(a, b))), rw(ax('invR'), 'fwd', at('r', 0, 2), { x: M(a, b) }))));
  it('K10 no cross-crate cancel', () => {
    rejects(onR(M(a, I(M(a, b))), rw(ax('invR'), 'fwd', at('r', 0, 2), { x: a })));
    expect(K.termAt(eq(a, M(a, I(M(a, b)))), at('r', 0, 2, [1, 0]))).toEqual(M(a, b)); // inside only
  });
  it('K11 noncontiguous rejected', () => rejects(onR(M(a, b, I(a)), rw(ax('invR'), 'fwd', at('r', 0, 3), { x: a }))));
  it('K12 IR in the middle', () => ok(onR(M(a, b, I(b), c), rw(ax('invR'), 'fwd', at('r', 1, 3), { x: b })), M(a, e, c)));
  it('K13 no hidden unit step', () => expect(K.termEq(onR(M(a, b, I(b), c), rw(ax('invR'), 'fwd', at('r', 1, 3), { x: b })) as Term, M(a, c))).toBe(false));
  it('K14 UL on a sole e', () => { rejects(onR(e, rw(ax('unitL'), 'fwd', at('r', 0, 1), { x: e }))); rejects(onR(e, rw(ax('unitL'), 'fwd', at('r', 0, 1), {}))); });
  it('K15 UL on e e with x=e', () => ok(onR(M(e, e), rw(ax('unitL'), 'fwd', at('r', 0, 2), { x: e })), e));
  it('K16 reverse UL on sole e', () => ok(onR(e, rw(ax('unitL'), 'rev', at('r', 0, 1), { x: e })), M(e, e)));
  it('K17 reverse IL on e, x=ab', () => ok(onR(e, rw(ax('invL'), 'rev', at('r', 0, 1), { x: M(a, b) })), M(I(M(a, b)), a, b)));
  it('K18 reverse IR without x', () => rejects(onR(e, rw(ax('invR'), 'rev', at('r', 0, 1), {}))));
  it('inverse mismatch speaks mathematics', () => expect(onR(M(a, I(b)), rw(ax('invR'), 'fwd', at('r', 0, 2), { x: a }))).toMatch(/a and b⁻¹ are not inverses of each other/));
});

describe('K19–K27 laws and rigid atoms', () => {
  const ctx2 = mkCtx({ atoms: [{ id: 'e1', label: 'e′', hue: 0 }, { id: 'a', label: 'a', hue: 1 }, { id: 'b', label: 'b', hue: 2 }], givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: M(e1, x), r: x } }] });
  const H: Fact = { k: 'law', metas: ['x'], l: M(e1, x), r: x };
  const sq: Fact = { k: 'law', metas: ['x'], l: M(x, x), r: e };
  it('K19 e′ is not e', () => rejects(onR(M(e1, a), rw(ax('unitL'), 'fwd', at('r', 0, 2), { x: a }), undefined, ctx2)));
  it('K20 H at x=e, with dependency H', () => {
    const r = run([given('H'), S('s', M(e1, e)), step('1', 's', rw({ k: 'node', id: 'g:H' }, 'fwd', at('r', 0, 2), { x: e }))], ctx2);
    expect(r.nodes['1']!.fact).toEqual(eq(M(e1, e), e));
    expect(r.nodes['1']!.deps).toEqual(['g:H']);
  });
  it('K21 e′ is rigid', () => {
    rejects(onR(M(b, a), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 2), { x: a }), H, ctx2));
    rejects(onR(M(e1, a), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 2), { x: a, e1: b }), H, ctx2));
  });
  it('K22 xx=e at x=ab', () => ok(onR(M(a, b, a, b), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 4), { x: M(a, b) }), sq), e));
  it('K23 extra factor', () => rejects(onR(M(a, a, a), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 3), { x: a }), sq)));
  it('K24 occurrences bind the same term', () => { expect(K.match(M(x, x), M(a, b))).toEqual([]); rejects(onR(M(a, b), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 2), { x: a }), sq)); });
  it('K25 prefix of a⁵ with x=aa', () => ok(onR(K.pow(a, 5), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 4), { x: M(a, a) }), sq), M(e, a)));
  it('K26 reversed at x=ba', () => ok(onR(e, rw({ k: 'node', id: 'H' }, 'rev', at('r', 0, 1), { x: M(b, a) }), sq), M(b, a, b, a)));
  it('K27 I(x)I(x) on I(a)I(b)', () => rejects(onR(M(I(a), I(b)), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 2), { x: a }), { k: 'law', metas: ['x'], l: M(I(x), I(x)), r: e })));
});

describe('K28–K36 gaps, crates, rule kinds', () => {
  it('K28 insert e inside a crate', () => ok(onR(I(M(a, b)), { k: 'insertE', at: { side: 'r', path: [0], gap: 1 } }), I(M(a, e, b))));
  it('K29 insert e in I(e)', () => ok(onR(I(e), { k: 'insertE', at: { side: 'r', path: [0], gap: 0 } }), I(M(e, e))));
  it('K30 cannot pop the sole e in I(e)', () => rejects(onR(I(e), rw(ax('unitL'), 'fwd', at('r', 0, 1, [0]), { x: e }))));
  it('K31/K32 rewrite inside a crate keeps the cap and the dependency', () => {
    const ctx = mkCtx({ givens: [{ id: 'q', name: 'q', fact: eq(b, e) }] });
    const r = run([given('q'), S('s', I(M(a, b))), step('1', 's', rw({ k: 'node', id: 'g:q' }, 'fwd', at('r', 1, 2, [0])))], ctx);
    expect(r.nodes['1']!.fact).toEqual(eq(I(M(a, b)), I(M(a, e))));
    expect(r.nodes['1']!.deps).toEqual(['g:q']);
  });
  it('K33 a ≠ cannot rewrite', () => expect(onR(a, rw({ k: 'node', id: 'n' }, 'fwd', at('r', 0, 1)), neq(a, e))).toMatch(/is an inequation. It can't rewrite anything/));
  it('K34 ⊥ cannot rewrite', () => rejects(onR(a, rw({ k: 'node', id: 'n' }, 'fwd', at('r', 0, 1)), { k: 'bot' })));
  it('K35 a conditional cannot rewrite', () => {
    rejects(onR(M(a, a), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 2), { x: a }), { k: 'cond', metas: ['x'], premises: [{ k: 'neq', l: x, r: e }], concl: { k: 'eq', l: M(a, x), r: x } }));
    rejects(onR(M(a, b), rw({ k: 'schema', id: 'witness' }, 'fwd', at('r', 0, 2), { u: a, v: b })));
  });
  it('K36 ground facts are not schemas', () => rejects(onR(M(c, b), rw({ k: 'node', id: 'h' }, 'fwd', at('r', 0, 2), { a: c }), eq(M(a, b), e))));
});

describe('K37–K40 lift', () => {
  it('K37 lift by a b⁻¹', () => {
    const r = K.evalStep(eq(a, b), { k: 'lift', side: 'left', term: M(a, I(b)) }, CTX);
    expect(r.ok && r.pallet).toEqual(eq(M(a, I(b), a), M(a, I(b), b)));
  });
  it('K38/K39 undeclared multiplier', () => {
    const r = K.evalStep(eq(a, b), { k: 'lift', side: 'left', term: K.atom('z') }, CTX);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/z is not an element/);
  });
  it('K40 lift a ≠ or ⊥', () => {
    expect(K.evalStep(neq(a, b), { k: 'lift', side: 'left', term: a }, CTX).ok).toBe(false);
    expect(K.evalStep({ k: 'bot' }, { k: 'lift', side: 'left', term: a }, CTX).ok).toBe(false);
  });
  it('lift is unavailable when the level withholds it', () => {
    expect(K.evalStep(eq(a, b), { k: 'lift', side: 'left', term: a }, ctxOf('L03')).ok).toBe(false);
  });
});

describe('K41–K56 cancellation, witness, socks', () => {
  const ctx = CTX;
  const ap = (rule: K.RuleRef, fact: Pallet, subst: Subst) => {
    const r = run([S('s', a), { id: 'f', scope: ROOT, k: 'given', givenId: 'f' }, apply('x', rule, ['g:f'], subst)].filter((n) => n.id !== 'f').map((n) => n) as ProofNode[],
      { ...ctx, level: { ...ctx.level, givens: [{ id: 'f', name: 'f', fact }] } });
    return r;
  };
  const withGiven = (fact: Pallet, rule: K.RuleRef, subst: Subst) => {
    const c2 = { ...ctx, level: { ...ctx.level, givens: [{ id: 'f', name: 'f', fact }] } };
    const r = run([given('f'), apply('x', rule, ['g:f'], subst)], c2);
    return r.nodes['x']!;
  };
  const LC: K.RuleRef = { k: 'schema', id: 'cancel' };
  const RC: K.RuleRef = { k: 'schema', id: 'cancel', mirror: true };
  const RI: K.RuleRef = { k: 'schema', id: 'witness' };
  void ap;
  it('K41 ab = ac ⟹ b = c', () => expect(withGiven(eq(M(a, b), M(a, c)), LC, { u: a, v: b, w: c }).fact).toEqual(eq(b, c)));
  it('K42 compound prefix', () => expect(withGiven(eq(M(a, b, c), M(a, b, d)), LC, { u: M(a, b), v: c, w: d }).fact).toEqual(eq(c, d)));
  it('K43 empty remainder impossible', () => expect(withGiven(eq(M(a, b), M(a, c)), LC, { u: M(a, b), w: c }).ok).toBe(false));
  it('K44 aa = a with implicit e', () => expect(withGiven(eq(M(a, a), a), LC, { u: a, v: a, w: e }).ok).toBe(false));
  it('K45 aa = ae', () => expect(withGiven(eq(M(a, a), M(a, e)), LC, { u: a, v: a, w: e }).fact).toEqual(eq(a, e)));
  it('K46 u = e', () => expect(withGiven(eq(M(e, b), M(e, c)), LC, { u: e, v: b, w: c }).fact).toEqual(eq(b, c)));
  it('K47 right cancellation (mirror)', () => expect(withGiven(eq(M(a, b), M(e, b)), RC, { u: b, v: a, w: e }).fact).toEqual(eq(a, e)));
  it('K48/K49 both witness cuts', () => {
    expect(withGiven(eq(M(a, b, c), e), RI, { u: a, v: M(b, c) }).fact).toEqual(eq(M(b, c), I(a)));
    expect(withGiven(eq(M(a, b, c), e), RI, { u: M(a, b), v: c }).fact).toEqual(eq(c, I(M(a, b))));
  });
  it('K50 unconsumed factor', () => expect(withGiven(eq(M(a, b, c), e), RI, { u: a, v: b }).ok).toBe(false));
  it('K51 no cut of e', () => expect(withGiven(eq(e, e), RI, { u: e, v: e }).ok).toBe(false));
  it('K52 e a = e', () => expect(withGiven(eq(M(e, a), e), RI, { u: e, v: a }).fact).toEqual(eq(a, I(e))));
  it('K53 no cut through a crate', () => {
    expect(withGiven(eq(M(I(M(a, b)), c), e), RI, { u: M(I(a), b), v: c }).ok).toBe(false);
    expect(withGiven(eq(M(I(M(a, b)), c), e), RI, { u: I(M(a, b)), v: c }).ok).toBe(true);
  });
  it('K54 I(a) a = e ⟹ a = I(I(a)); goal still needs swap', () => {
    const c2 = mkCtx({ atoms: [{ id: 'a', label: 'a', hue: 0 }], sockets: [{ id: 's', target: eq(I(I(a)), a), allowedGivens: [] }], tools: { schemas: ['witness'] } });
    const r = run([S('s', M(I(a), a)), step('1', 's', rw(ax('invL'), 'fwd', at('r', 0, 2), { x: a })), apply('2', RI, ['1'], { u: I(a), v: a })], c2);
    expect(r.nodes['2']!.fact).toEqual(eq(a, I(I(a))));
    expect(r.solved).toBe(false);
    expect(r.sockets[0]!.error).toMatch(/Swap the sides/);
  });
  it('K55 Sock Drawer at u=ab, v=c', () => ok(onR(I(M(a, b, c)), rw({ k: 'schema', id: 'socks' }, 'fwd', at('r', 0, 1), { u: M(a, b), v: c })), M(I(c), I(M(a, b)))));
  it('K56 nothing opens (ab)⁻¹ to a⁻¹b⁻¹', () => {
    const c2 = ctxOf('L07'); // has socks
    const g: ProofGraph = { nodes: [S('s', I(M(a, b)))], rooms: [] };
    const offers = K.offersAt(g, K.check(g, c2), 's', at('r', 0, 1), c2);
    expect(offers.some((o) => o.preview && o.preview.k === 'eq' && K.termEq(o.preview.r, M(I(a), I(b))))).toBe(false);
    expect(offers.some((o) => o.preview && o.preview.k === 'eq' && K.termEq(o.preview.r, M(I(b), I(a))))).toBe(true);
  });
  it('K116 I(uv) on I(abc) with u=ab, v=c', () => ok(onR(I(M(a, b, c)), rw({ k: 'schema', id: 'socks' }, 'fwd', at('r', 0, 1), { u: M(a, b), v: c })), M(I(c), I(M(a, b)))));
  it('K115 bare I(x) must take the whole argument', () => {
    expect(K.match(I(x), I(M(a, b)), { x: a })).toEqual([]);
    rejects(onR(I(M(a, b)), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 1), { x: a }), { k: 'law', metas: ['x'], l: I(x), r: x }));
  });
});

describe('K57–K64 merge and clash', () => {
  const gv = (fs: Pallet[]) => ({ ...CTX, level: { ...CTX.level, givens: fs.map((f, i) => ({ id: `f${i}`, name: `f${i}`, fact: f })) } });
  const pair = (k: 'merge' | 'clash', f0: Pallet, f1: Pallet) =>
    run([given('f0'), given('f1'), { id: 'x', scope: ROOT, k, inputs: ['g:f0', 'g:f1'] } as ProofNode], gv([f0, f1])).nodes['x']!;
  it('K57 merge a=c, b=c', () => expect(pair('merge', eq(a, c), eq(b, c)).fact).toEqual(eq(a, b)));
  it('K58 merge needs equal right sides', () => expect(pair('merge', eq(a, c), eq(c, b)).ok).toBe(false));
  it('K59 multisets are not equal', () => expect(pair('merge', eq(a, M(a, b)), eq(b, M(b, a))).ok).toBe(false));
  it('K60 merge inequations', () => expect(pair('merge', neq(a, c), neq(b, c)).ok).toBe(false));
  it('merge needs the merge machine', () => {
    const c2 = { ...gv([eq(a, c), eq(b, c)]) };
    c2.level = { ...c2.level, tools: { ...c2.level.tools, merge: false } };
    expect(run([given('f0'), given('f1'), { id: 'x', scope: ROOT, k: 'merge', inputs: ['g:f0', 'g:f1'] }], c2).nodes['x']!.ok).toBe(false);
  });
  it('K61 clash', () => expect(pair('clash', eq(a, b), neq(a, b)).fact).toEqual({ k: 'bot' }));
  it('K62 clash either orientation', () => expect(pair('clash', eq(a, b), neq(b, a)).ok).toBe(true));
  it('K63 clash needs the same sides', () => expect(pair('clash', eq(a, b), neq(a, c)).ok).toBe(false));
  it('K64 printed names do not identify atoms', () => {
    const c2 = mkCtx({ atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'a2', label: 'a', hue: 1 }, { id: 'b', label: 'b', hue: 2 }], givens: [{ id: 'f0', name: 'f0', fact: eq(a, b) }, { id: 'f1', name: 'f1', fact: neq(K.atom('a2'), b) }] });
    expect(run([given('f0'), given('f1'), { id: 'x', scope: ROOT, k: 'clash', inputs: ['g:f0', 'g:f1'] }], c2).nodes['x']!.ok).toBe(false);
  });
  it('clash inputs may come in either order (active ≠ against a visible =)', () => expect(pair('clash', neq(a, b), eq(a, b)).ok).toBe(true));
});

describe('K65–K74 scope and rooms', () => {
  const ctx9 = ctxOf('L09');
  const room = (id: string, l: Term, r: Term, kind: K.Room['kind'] = 'suppose', parent = ROOT): K.Room => ({ id, parent, kind, l, r });
  it('K65 root cannot cite a room-derived equation', () => {
    const r = run([{ id: 'h', scope: 'R', k: 'assume', room: 'R' }, S('s', M(a, b)), step('1', 's', rw({ k: 'node', id: 'h' }, 'fwd', at('r', 0, 2)))], ctx9, [room('R', M(a, b), b)]);
    expect(r.nodes['1']!.ok).toBe(false);
    expect(r.nodes['1']!.error).toMatch(/rests on an assumption that doesn't hold here/);
  });
  it('K66 inner cites a root given', () => {
    const c2 = mkCtx({ givens: [{ id: 'q', name: 'q', fact: eq(b, e) }] });
    const r = run([given('q'), S('s', b, 'R'), step('1', 's', rw({ k: 'node', id: 'g:q' }, 'fwd', at('r', 0, 1)), 'R')], c2, [room('R', a, b)]);
    expect(r.nodes['1']!.ok).toBe(true);
    expect(r.nodes['1']!.deps).toEqual(['g:q']);
  });
  it('K67 sibling rooms are invisible', () => {
    const r = run([{ id: 'h', scope: 'R1', k: 'assume', room: 'R1' }, S('s', a, 'R2'), step('1', 's', rw({ k: 'node', id: 'h' }, 'fwd', at('r', 0, 1)), 'R2')], CTX, [room('R1', a, b), room('R2', a, c)]);
    expect(r.nodes['1']!.ok).toBe(false);
  });
  it('K68/K69 L09 trace: exit discharges exactly its own assumption', () => {
    const r = run([
      given('n'), { id: 'h', scope: 'R', k: 'assume', room: 'R' },
      step('1', 'h', { k: 'lift', side: 'right', term: I(b) }, 'R'),
      step('2', '1', rw(ax('invR'), 'fwd', at('l', 1, 3), { x: b }), 'R'),
      step('3', '2', rw(ax('unitR'), 'fwd', at('l', 0, 2), { x: a }), 'R'),
      step('4', '3', rw(ax('invR'), 'fwd', at('r', 0, 2), { x: b }), 'R'),
      { id: '5', scope: 'R', k: 'clash', inputs: ['4', 'g:n'] },
      { id: '6', scope: ROOT, k: 'exit', room: 'R', input: '5' },
    ], ctx9, [room('R', M(a, b), b)]);
    expect(r.nodes['5']!.deps).toEqual(['a:R', 'g:n']);
    expect(r.nodes['6']!.fact).toEqual(neq(M(a, b), b));
    expect(r.nodes['6']!.deps).toEqual(['g:n']);
    expect(r.solved).toBe(true);
  });
  it('K70 no direct export of an interior fact', () => {
    const r = run([{ id: 'h', scope: 'R', k: 'assume', room: 'R' }, step('1', 'h', { k: 'swap' }, ROOT)], ctx9, [room('R', M(a, b), b)]);
    expect(r.nodes['1']!.ok).toBe(false);
  });
  it('K72 an exit needs ⊥', () => {
    const r = run([{ id: 'h', scope: 'R', k: 'assume', room: 'R' }, { id: 'x', scope: ROOT, k: 'exit', room: 'R', input: 'h' }], ctx9, [room('R', M(a, b), b)]);
    expect(r.nodes['x']!.error).toMatch(/assumption is still open/);
  });
  it('exit must land in the parent scope and read the room’s own target (K71)', () => {
    const nodes: ProofNode[] = [given('n'), { id: 'h', scope: 'R', k: 'assume', room: 'R' }, S('s', a, 'R'),
      step('1', 's', rw({ k: 'node', id: 'h' }, 'rev', at('r', 0, 1)), 'R')];
    void nodes;
    const r = run([given('n'), { id: 'h', scope: 'R', k: 'assume', room: 'R' }, { id: 'c', scope: 'R', k: 'clash', inputs: ['h', 'g:n'] }, { id: 'x', scope: 'R', k: 'exit', room: 'R', input: 'c' }], ctxOf('L09'), [room('R', a, e)]);
    expect(r.nodes['c']!.ok).toBe(true);
    expect(r.nodes['x']!.ok).toBe(false);
  });
  it('K73 classical exit preserves other deps and marks classical', () => {
    const r = run([given('H'), { id: 'n', scope: 'R', k: 'assume', room: 'R' }, apply('1', { k: 'node', id: 'g:H' }, ['n'], { x: a }, 'R'),
      step('2', '1', { k: 'insertE', at: { side: 'r', path: [], gap: 1 } }, 'R'),
      apply('3', { k: 'schema', id: 'cancel' }, ['2'], { u: a, v: a, w: e }, 'R'),
      { id: '4', scope: 'R', k: 'clash', inputs: ['3', 'n'] }, { id: '5', scope: ROOT, k: 'exit', room: 'R', input: '4' }], ctxOf('L10'), [room('R', a, e, 'classical')]);
    expect(r.nodes['5']!.fact).toEqual(eq(a, e));
    expect(r.nodes['5']!.deps).toEqual(['g:H']);
    expect(r.nodes['5']!.classical).toBe(true);
    expect(r.solved).toBe(true);
  });
  it('K74 rooms need their tool and concrete targets', () => {
    expect(run([{ id: 'h', scope: 'R', k: 'assume', room: 'R' }], ctxOf('L08'), [room('R', a, b)]).nodes['h']!.ok).toBe(false);
    expect(run([{ id: 'h', scope: 'R', k: 'assume', room: 'R' }], ctxOf('L09'), [room('R', a, b, 'classical')]).nodes['h']!.ok).toBe(false);
    expect(run([{ id: 'h', scope: 'R', k: 'assume', room: 'R' }], CTX, [room('R', x, b)]).nodes['h']!.ok).toBe(false);
  });
});

describe('K76–K90 conditional givens, sockets, generalize', () => {
  const ctx10 = ctxOf('L10');
  const H = (inp: string, subst: Subst) => run([given('H'), { id: 'n', scope: 'R', k: 'assume', room: 'R' }, apply('1', { k: 'node', id: 'g:H' }, [inp], subst, 'R')], ctx10,
    [{ id: 'R', parent: ROOT, kind: 'classical', l: a, r: e }]).nodes['1']!;
  it('K76 H at x=a on a ≠ e', () => { const r = H('n', { x: a }); expect(r.fact).toEqual(eq(M(a, a), a)); expect(r.deps).toEqual(['a:R', 'g:H']); });
  it('K77 x=e needs e ≠ e', () => expect(H('n', { x: e }).ok).toBe(false));
  it('K78 the rigid a cannot be substituted', () => expect(H('n', { x: a, a: e }).ok).toBe(false));
  const socket = (allowed: string[], target: Pallet) => mkCtx({ givens: [{ id: 'hL', name: 'hL', fact: eq(M(a, b), M(a, c)) }, { id: 'hR', name: 'hR', fact: eq(M(b, a), M(c, a)) }], sockets: [{ id: 's', target, allowedGivens: allowed }], tools: { schemas: ['cancel'] } });
  const proof = (ctx: K.KernelCtx) => run([given('hL'), apply('1', { k: 'schema', id: 'cancel' }, ['g:hL'], { u: a, v: b, w: c })], ctx);
  it('K79 allowed given', () => expect(proof(socket(['hL'], eq(b, c))).solved).toBe(true));
  it('K80/K83 unlisted given', () => { const r = proof(socket(['hR'], eq(b, c))); expect(r.solved).toBe(false); expect(r.sockets[0]!.error).toMatch(/hL/); });
  it('K81 wrong kind', () => expect(proof(socket(['hL'], neq(b, c))).solved).toBe(false));
  it('K82 reversed orientation', () => { const r = proof(socket(['hL'], eq(c, b))); expect(r.solved).toBe(false); expect(r.sockets[0]!.error).toMatch(/Swap the sides/); });
  it('a socket never accepts an open assumption', () => {
    const c2 = socket(['hL'], eq(a, b));
    const r = run([{ id: 'h', scope: 'R', k: 'assume', room: 'R' }], c2, [{ id: 'R', parent: ROOT, kind: 'suppose', l: a, r: b }]);
    expect(r.solved).toBe(false);
  });
  it('K85/K86 generalize discharges premises before binding', () => {
    const g = K.generalize(ctxOf('L03').level, 's')!;
    expect(K.sameCardUpToRenaming(g, REGISTRY.witness!.card)).toBe(true);
  });
  it('K87/K88 laws and sizes cannot be exported as one card', () => {
    expect(K.generalize(ctxOf('L08').level, 's')).toBeNull();
    expect(K.generalize(ctxOf('L11').level, 's')).toBeNull();
  });
  it('K90 an atom named x is not the variable x', () => {
    const c2 = mkCtx({ atoms: [{ id: 'x', label: 'x', hue: 0 }, { id: 'a', label: 'a', hue: 1 }] });
    const sq: Fact = { k: 'law', metas: ['x'], l: M(x, x), r: e };
    const X = K.atom('x');
    rejects(onR(M(X, X), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 2), { x: a }), sq, c2));
    ok(onR(M(X, X), rw({ k: 'node', id: 'H' }, 'fwd', at('r', 0, 2), { x: X }), sq, c2), e);
  });
});

describe('K91–K102 press, authority, cycles, staleness', () => {
  const sizeCtx = (n: number, press = true) => mkCtx({ givens: [{ id: 's', name: '|G|', fact: { k: 'size', n } }], tools: { press } });
  it('K91 press makes ∀x. x¹⁰ = e with the size dependency', () => {
    const r = run([given('s'), { id: 'p', scope: ROOT, k: 'press', input: 'g:s' }], sizeCtx(10)).nodes['p']!;
    expect(r.fact).toEqual(K.pressCard(10));
    expect(r.deps).toEqual(['g:s']);
  });
  it('K92 press on an equation', () => {
    const c2 = mkCtx({ givens: [{ id: 's', name: 's', fact: eq(a, b) }] });
    expect(run([given('s'), { id: 'p', scope: ROOT, k: 'press', input: 'g:s' }], c2).nodes['p']!.ok).toBe(false);
  });
  it('K93 fabricated given', () => expect(run([given('size1')], CTX).nodes['g:size1']!.ok).toBe(false));
  it('K94 size 0 or negative', () => {
    expect(() => K.pressCard(0)).toThrow();
    expect(run([given('s'), { id: 'p', scope: ROOT, k: 'press', input: 'g:s' }], sizeCtx(0)).nodes['p']!.ok).toBe(false);
    expect(run([given('s'), { id: 'p', scope: ROOT, k: 'press', input: 'g:s' }], sizeCtx(-3)).nodes['p']!.ok).toBe(false);
  });
  it('K96 the press law at e and at ab', () => {
    const law = K.pressCard(10);
    ok(onR(K.pow(e, 10), rw({ k: 'node', id: 'p' }, 'fwd', at('r', 0, 10), { x: e }), law), e);
    ok(onR(K.pow(M(a, b), 10), rw({ k: 'node', id: 'p' }, 'fwd', at('r', 0, 20), { x: M(a, b) }), law), e);
    rejects(onR(M(K.pow(a, 10), K.pow(b, 10)), rw({ k: 'node', id: 'p' }, 'fwd', at('r', 0, 20), { x: M(a, b) }), law));
  });
  it('K98 unauthorized tools', () => {
    expect(run([given('s'), { id: 'p', scope: ROOT, k: 'press', input: 'g:s' }], sizeCtx(5, false)).nodes['p']!.ok).toBe(false);
    rejects(onR(I(M(a, b)), rw({ k: 'schema', id: 'socks' }, 'fwd', at('r', 0, 1), { u: a, v: b }), undefined, ctxOf('L01')));
  });
  it('K99 a level cannot use its own unlock', () => {
    const c3 = ctxOf('L03');
    const forged = { ...c3, level: { ...c3.level, tools: { ...c3.level.tools, schemas: ['witness'] } } };
    const r = run([given('h'), apply('1', { k: 'schema', id: 'witness' }, ['g:h'], { u: a, v: b })], forged);
    expect(r.nodes['1']!.ok).toBe(false);
    expect(r.nodes['1']!.error).toMatch(/what this order proves/);
  });
  it('K100 cycles are rejected before anything else', () => {
    const r = run([step('1', '2', { k: 'swap' }), step('2', '1', { k: 'swap' }), S('s', a)]);
    expect(r.ok).toBe(false);
    expect(r.nodes['1']!.error).toMatch(/circular/);
    expect(r.nodes['s']!.ok).toBe(true);
  });
  it('K101 stale addresses do not retarget', () => {
    rejects(onR(M(a, b), rw(ax('invL'), 'fwd', at('r', 1, 3), { x: a })));
    rejects(onR(M(I(a), a), rw(ax('invL'), 'fwd', at('r', 0, 2, [5]), { x: a })));
  });
  it('K102 outputs and deps are recomputed (no player-supplied fact field is trusted)', () => {
    const forged = { id: '1', scope: ROOT, k: 'start', term: a, fact: eq(a, b), deps: [] } as unknown as ProofNode;
    expect(run([forged]).nodes['1']!.fact).toEqual(eq(a, a));
  });
  it('duplicate node ids are rejected', () => expect(run([S('s', a), S('s', b)]).ok).toBe(false));
});

describe('K104–K118 traces and earned-card reuse', () => {
  it('K104 e e → e by unit at x = e; the sole e cannot be deleted', () => {
    ok(onR(M(e, e), rw(ax('unitL'), 'fwd', at('r', 0, 2), { x: e })), e);
    rejects(onR(e, rw(ax('unitR'), 'fwd', at('r', 0, 1), { x: e })));
  });
  it('K105 L02 intermediate-start shortcut is accepted', () => {
    const c2 = ctxOf('L02');
    const r = run([given('H'), S('s', M(e1, e)), step('1', 's', rw(ax('unitR'), 'fwd', at('l', 0, 2), { x: e1 })), step('2', '1', rw({ k: 'node', id: 'g:H' }, 'fwd', at('r', 0, 2), { x: e }))], c2);
    expect(r.solved).toBe(true);
  });
  it('K107 forward ribbon proof keeps both givens', () => {
    const c2 = mkCtx({ atoms: [{ id: 'a', label: 'a', hue: 0 }], givens: [{ id: 'h5', name: 'h5', fact: eq(K.pow(a, 5), e) }, { id: 'h3', name: 'h3', fact: eq(K.pow(a, 3), e) }], sockets: [{ id: 's', target: eq(a, e), allowedGivens: ['h5', 'h3'] }] });
    const r = run([given('h5'), given('h3'),
      step('1', 'g:h5', rw({ k: 'node', id: 'g:h3' }, 'fwd', at('l', 0, 3))),
      step('2', '1', rw(ax('unitL'), 'fwd', at('l', 0, 2), { x: a })),
      step('3', 'g:h3', rw({ k: 'node', id: '2' }, 'fwd', at('l', 0, 2))),
      step('4', '3', rw(ax('unitL'), 'fwd', at('l', 0, 2), { x: a }))], c2);
    expect(r.nodes['2']!.fact).toEqual(eq(M(a, a), e));
    expect(r.nodes['4']!.fact).toEqual(eq(a, e));
    expect(r.nodes['4']!.deps).toEqual(['g:h3', 'g:h5']);
    expect(r.solved).toBe(true);
  });
  const FL: K.Schema = { id: 'fl', name: 'First Light', textbook: 'cancel then drop e', card: { k: 'law', metas: ['p', 'q'], l: M(I(K.meta('p')), K.meta('p'), K.meta('q')), r: K.meta('q') }, origin: 'earned', fromLevel: 'L01', mirrorable: false };
  const flCtx = (on: boolean): K.KernelCtx => ({ level: { ...mkCtx().level, tools: { ...mkCtx().level.tools, schemas: on ? ['fl'] : [] } }, registry: { ...REGISTRY, fl: FL } });
  it('K109 authorized FL', () => ok(onR(M(I(a), a, b), rw({ k: 'schema', id: 'fl' }, 'fwd', at('r', 0, 3), { p: a, q: b }), undefined, flCtx(true)), b));
  it('K110 unauthorized FL', () => rejects(onR(M(I(a), a, b), rw({ k: 'schema', id: 'fl' }, 'fwd', at('r', 0, 3), { p: a, q: b }), undefined, flCtx(false))));
  it('K113 FL on the whole (ab)⁻¹abb⁻¹a⁻¹', () => ok(onR(M(I(M(a, b)), a, b, I(b), I(a)), rw({ k: 'schema', id: 'fl' }, 'fwd', at('r', 0, 5), { p: M(a, b), q: M(I(b), I(a)) }), undefined, flCtx(true)), M(I(b), I(a))));
  it('K117 witness at compound u = pq, v = rs', () => {
    const c2 = mkCtx({ atoms: ['p', 'q', 'r', 's'].map((id, i) => ({ id, label: id, hue: i })), givens: [{ id: 'f', name: 'f', fact: eq(M(K.atom('p'), K.atom('q'), K.atom('r'), K.atom('s')), e) }], tools: { schemas: ['witness'] } });
    const r = run([given('f'), apply('1', { k: 'schema', id: 'witness' }, ['g:f'], { u: M(K.atom('p'), K.atom('q')), v: M(K.atom('r'), K.atom('s')) })], c2);
    expect(r.nodes['1']!.fact).toEqual(eq(M(K.atom('r'), K.atom('s')), I(M(K.atom('p'), K.atom('q')))));
  });
  it('K118 a stale generic range does not select the premise', () => {
    const P = K.atom('p'), Q = K.atom('q'), R = K.atom('r'), S2 = K.atom('s');
    const c2 = mkCtx({ atoms: ['p', 'q', 'r', 's'].map((id, i) => ({ id, label: id, hue: i })) });
    const prem: Fact = eq(M(P, Q, R, S2), e);
    rejects(onR(M(I(M(P, Q)), P, Q, R, S2), rw({ k: 'node', id: 'f' }, 'fwd', at('r', 1, 3)), prem, c2));
    ok(onR(M(I(M(P, Q)), P, Q, R, S2), rw({ k: 'node', id: 'f' }, 'fwd', at('r', 1, 5)), prem, c2), M(I(M(P, Q)), e));
  });
});
