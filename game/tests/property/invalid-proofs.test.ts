import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { mkCtx } from '../../src/kernel/testkit';
import { oracleCheck } from '../../src/groups/oracle';
import { LEVEL_BY_ID, REGISTRY } from '../../src/levels/levels';
import type { Fact, ProofGraph, ProofNode, Room, StepOp, RuleRef, Subst } from '../../src/kernel/types';

const a = K.atom('a'), b = K.atom('b'), x = K.meta('x');
const eq = (l = a, r = b): Fact => ({ k: 'eq', l, r });
const neq = (l = a, r = b): Fact => ({ k: 'neq', l, r });
const start = (id = 's', term = a, scope = K.ROOT): ProofNode => ({ id, scope, k: 'start', term });
const given = (givenId: string): ProofNode => ({ id: givenId, scope: K.ROOT, k: 'given', givenId });
const step = (op: StepOp, input = 's', scope = K.ROOT): ProofNode => ({ id: 'bad', scope, k: 'step', input, op });
const apply = (rule: RuleRef, inputs: string[] = [], subst: Subst = {}): ProofNode => ({ id: 'bad', scope: K.ROOT, k: 'apply', rule, inputs, subst });
const room = (id = 'R', parent = K.ROOT): Room => ({ id, parent, kind: 'suppose', l: a, r: b });
const assume = (id = 'h', scope = 'R'): ProofNode => ({ id, scope, k: 'assume', room: scope });
const rw = (rule: RuleRef, subst: Subst = {}, at: K.Addr = { side: 'l', path: [] }): StepOp => ({ k: 'rewrite', rule, dir: 'fwd', at, subst });
const ctx = (givens: Fact[] = [], overrides: Parameters<typeof mkCtx>[0] = {}): K.KernelCtx => mkCtx({
  atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }],
  givens: givens.map((fact, i) => ({ id: `g${i}`, name: `g${i}`, fact })), ...overrides,
});
type Case = { name: string; ctx?: K.KernelCtx; nodes: ProofNode[]; rooms?: Room[]; goalOnly?: boolean };
const cases: Case[] = [
  { name: 'room input leaks outward', rooms: [room()], nodes: [assume(), step({ k: 'swap' }, 'h')] },
  { name: 'room rule leaks outward', rooms: [room()], nodes: [assume(), start(), step(rw({ k: 'node', id: 'h' }))] },
  { name: 'sibling input invisible', rooms: [room(), room('S')], nodes: [assume(), step({ k: 'swap' }, 'h', 'S')] },
  { name: 'sibling rule invisible', rooms: [room(), room('S')], nodes: [assume(), start('s', a, 'S'), step(rw({ k: 'node', id: 'h' }), 's', 'S')] },
  { name: 'exit needs contradiction', rooms: [room()], nodes: [assume(), { id: 'bad', scope: K.ROOT, k: 'exit', room: 'R', input: 'h' }] },
  { name: 'exit input must belong to exact room', ctx: ctx([eq(), neq()]), rooms: [room()], nodes: [given('g0'), given('g1'), { id: 'bot', scope: K.ROOT, k: 'clash', inputs: ['g0', 'g1'] }, { id: 'bad', scope: K.ROOT, k: 'exit', room: 'R', input: 'bot' }] },
  { name: 'exit must sit at parent', ctx: ctx([eq(), neq()]), rooms: [room()], nodes: [given('g0'), given('g1'), { id: 'bot', scope: 'R', k: 'clash', inputs: ['g0', 'g1'] }, { id: 'bad', scope: 'R', k: 'exit', room: 'R', input: 'bot' }] },
  { name: 'self cycle', nodes: [step({ k: 'swap' }, 'bad')] },
  { name: 'two node cycle', nodes: [{ id: 's', scope: K.ROOT, k: 'step', input: 'bad', op: { k: 'swap' } }, step({ k: 'swap' })] },
  { name: 'rule dependency cycle', nodes: [start(), step(rw({ k: 'node', id: 'bad' }))] },
  { name: 'unknown given', nodes: [given('invented')] },
  ...([neq(), { k: 'bot' }, { k: 'size', n: 5 }, { k: 'cond', metas: ['x'], premises: [{ k: 'eq', l: x, r: x }], concl: { k: 'eq', l: x, r: x } }] as Fact[]).map(fact => ({
    name: `${fact.k} cannot rewrite`, ctx: ctx([fact]), nodes: [given('g0'), start(), step(rw({ k: 'node', id: 'g0' }))],
  })),
  { name: 'address selects wrong bead', nodes: [start('s', K.mul([K.E, a, b])), step(rw({ k: 'axiom', id: 'unitL' }, { x: b }, { side: 'l', path: [], range: [0, 2] }))] },
  { name: 'address exceeds word', nodes: [start(), step(rw({ k: 'axiom', id: 'unitL' }, { x: a }, { side: 'l', path: [], range: [0, 9] }))] },
  { name: 'rewrite path outside inverse', nodes: [start('s', K.inv(a)), step(rw({ k: 'axiom', id: 'unitL' }, { x: a }, { side: 'l', path: [1] }))] },
  { name: 'start with leftover meta', nodes: [start('s', x)] },
  { name: 'substitution with leftover meta', nodes: [apply({ k: 'axiom', id: 'unitL' }, [], { x })] },
  { name: 'missing substitution', nodes: [apply({ k: 'axiom', id: 'unitL' })] },
  { name: 'undeclared substitution letter', nodes: [apply({ k: 'axiom', id: 'unitL' }, [], { x: K.atom('alien') })] },
  { name: 'undeclared spool letter', nodes: [start('s', K.atom('alien'))] },
  { name: 'undeclared lift letter', nodes: [start(), step({ k: 'lift', side: 'left', term: K.atom('alien') })] },
  { name: 'theorem premise reversed', ctx: ctx([eq(K.E, K.mul([a, b]))], { tools: { schemas: ['witness'] } }), nodes: [given('g0'), apply({ k: 'schema', id: 'witness' }, ['g0'], { u: a, v: b })] },
  { name: 'theorem premises in wrong order', ctx: { ...ctx([eq(a, b), eq(b, K.E)], { tools: { schemas: ['trans'] } }), registry: { trans: { id: 'trans', name: 'transitivity', textbook: 'transitivity', origin: 'import', mirrorable: false, card: { k: 'cond', metas: ['x', 'y', 'z'], premises: [{ k: 'eq', l: x, r: K.meta('y') }, { k: 'eq', l: K.meta('y'), r: K.meta('z') }], concl: { k: 'eq', l: x, r: K.meta('z') } } } } }, nodes: [given('g0'), given('g1'), apply({ k: 'schema', id: 'trans' }, ['g1', 'g0'], { x: a, y: b, z: K.E })] },
  { name: 'nonmirrorable theorem', ctx: ctx([], { tools: { schemas: ['socks'] } }), nodes: [apply({ k: 'schema', id: 'socks', mirror: true }, [], { u: a, v: b })] },
  { name: 'unlisted theorem', nodes: [apply({ k: 'schema', id: 'dbl' }, [], { u: a })] },
  { name: 'own reward even if listed', ctx: { level: { ...LEVEL_BY_ID.S01!, tools: { ...LEVEL_BY_ID.S01!.tools, schemas: ['dbl'] } }, registry: REGISTRY }, nodes: [apply({ k: 'schema', id: 'dbl' }, [], { u: a })] },
  { name: 'press without tool', ctx: ctx([{ k: 'size', n: 5 }], { tools: { press: false } }), nodes: [given('g0'), { id: 'bad', scope: K.ROOT, k: 'press', input: 'g0' }] },
  { name: 'press needs size', nodes: [start(), { id: 'bad', scope: K.ROOT, k: 'press', input: 's' }] },
  { name: 'clash needs matching sides', ctx: ctx([eq(a, K.E), neq(b, K.E)]), nodes: [given('g0'), given('g1'), { id: 'bad', scope: K.ROOT, k: 'clash', inputs: ['g0', 'g1'] }] },
  { name: 'merge needs same middle', nodes: [start(), start('t', b), { id: 'bad', scope: K.ROOT, k: 'merge', inputs: ['s', 't'] }] },
  { name: 'insertE out of range path', nodes: [start(), step({ k: 'insertE', at: { side: 'l', path: [0], gap: 0 } })] },
  { name: 'insertE out of range gap', nodes: [start(), step({ k: 'insertE', at: { side: 'l', path: [], gap: 2 } })] },
  // Lift is a whole-equation op and has no path in the contract. Test its
  // corresponding malformed side and unavailable tool instead of inventing a path.
  { name: 'lift invalid side', nodes: [start(), step({ k: 'lift', side: 'up' as 'left', term: a })] },
  { name: 'lift without tool', ctx: ctx([], { tools: { lift: false } }), nodes: [start(), step({ k: 'lift', side: 'left', term: a })] },
  { name: 'goal inside room cannot fill root', ctx: ctx([], { sockets: [{ id: 'goal', target: { k: 'eq', l: a, r: b }, allowedGivens: [] }] }), rooms: [room()], nodes: [assume()], goalOnly: true },
  { name: 'goal with extra given hypothesis', ctx: ctx([eq()], { sockets: [{ id: 'goal', target: { k: 'eq', l: a, r: b }, allowedGivens: [] }] }), nodes: [given('g0')], goalOnly: true },
];

describe('invalid proof boundary', () => {
  for (const c of cases) it(c.name, () => {
    const context = c.ctx ?? ctx();
    const graph: ProofGraph = { nodes: c.nodes, rooms: c.rooms ?? [] };
    const res = K.check(graph, context);
    // Every accepted node, even in a partly rejected graph, gets a semantic audit.
    expect(oracleCheck(context.level, res.nodes, graph.rooms)).toEqual([]);
    if (c.goalOnly) {
      expect(res.ok, 'valid derivation, prohibited socket dependency/scope').toBe(true);
      expect(res.solved).toBe(false);
    } else expect(res.ok, JSON.stringify({ graph, res })).toBe(false);
  });
});
