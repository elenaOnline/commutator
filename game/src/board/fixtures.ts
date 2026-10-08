// LEMMA WORKS board — DEV HARNESS ONLY. Hand-built proof graphs with
// hard-coded facts (the kernel is not consulted), taken from
// design/reviews/sol-math-adversary-r1.md §3 and paper-playtest-r1.md §6.
import type { Fact, ProofGraph, ProofNode, Room, Term } from '../kernel/types';

// ── tiny term parser for fixtures: "a b b' a'", "(ab)'", "(ab)^3", "e" ──
export function T(src: string): Term {
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const word = (): Term[] => {
    const out: Term[] = [];
    while (i < s.length && s[i] !== ')') {
      let base: Term[];
      if (s[i] === '(') { i++; const w = word(); i++; base = w; }
      else { const ch = s[i++]!; base = [ch === 'e' ? { k: 'e' } : /[uvwxyz]/.test(ch) ? { k: 'meta', id: ch } : { k: 'atom', id: ch }]; }
      let grouped: Term = base.length === 1 ? base[0]! : { k: 'mul', fs: base };
      let ninv = 0;
      while (s[i] === "'") { ninv++; i++; }
      for (let k = 0; k < ninv; k++) grouped = { k: 'inv', arg: grouped };
      let rep = 1;
      if (s[i] === '^') { i++; let n = ''; while (/\d/.test(s[i] ?? '')) n += s[i++]; rep = +n; }
      for (let k = 0; k < rep; k++) out.push(...(grouped.k === 'mul' ? grouped.fs : [grouped]));
    }
    return out;
  };
  const w = word();
  return w.length === 1 ? w[0]! : { k: 'mul', fs: w };
}

export function F(src: string): Fact {
  const s = src.trim();
  if (s === 'bot') return { k: 'bot' };
  let m = /^\|G\|\s*=\s*(\d+)$/.exec(s);
  if (m) return { k: 'size', n: +m[1]! };
  m = /^law\s+([a-z,]+):\s*(.*)=(.*)$/.exec(s);
  if (m) return { k: 'law', metas: m[1]!.split(','), l: T(m[2]!), r: T(m[3]!) };
  if (s.includes('!=')) { const [l, r] = s.split('!='); return { k: 'neq', l: T(l!), r: T(r!) }; }
  const [l, r] = s.split('='); return { k: 'eq', l: T(l!), r: T(r!) };
}

export interface Fixture {
  name: string;
  levelId: string;
  nodes: ProofNode[];
  rooms: Room[];
  facts: Record<string, string>;
  /** socket id → filling node id */
  filled: Record<string, string>;
  claims?: { id: string; fact: string; scope: string }[];
}

const step = (id: string, input: string, station: string, gesture: string, op: Extract<ProofNode, { k: 'step' }>['op'], scope = 'root'): ProofNode =>
  ({ id, scope, k: 'step', input, op, meta: { station, gesture } });
const rw = (id: 'unitL' | 'unitR' | 'invL' | 'invR', side: 'l' | 'r', range: [number, number], x: string, dir: 'fwd' | 'rev' = 'fwd') =>
  ({ k: 'rewrite' as const, rule: { k: 'axiom' as const, id }, dir, at: { side, path: [], range }, subst: { x: T(x) } });
const rwNode = (node: string, side: 'l' | 'r', range: [number, number] | undefined, dir: 'fwd' | 'rev', subst: Record<string, string> = {}) =>
  ({ k: 'rewrite' as const, rule: { k: 'node' as const, id: node }, dir, at: { side, path: [], ...(range ? { range } : {}) }, subst: Object.fromEntries(Object.entries(subst).map(([k, v]) => [k, T(v)])) });

export const SHOES: Fixture = {
  name: 'L06 Shoes and Socks — witness route', levelId: 'L06', rooms: [],
  nodes: [
    { id: 'n1', scope: 'root', k: 'start', term: T("a b b' a'") },
    step('n2', 'n1', 's1', 'cancel b·b⁻¹', rw('invR', 'r', [1, 3], 'b')),
    step('n3', 'n2', 's1', 'auto-tidy', rw('unitR', 'r', [0, 2], 'a')),
    step('n4', 'n3', 's2', 'cancel a·a⁻¹', rw('invR', 'r', [0, 2], 'a')),
    { id: 'n5', scope: 'root', k: 'apply', rule: { k: 'schema', id: 'witness' }, inputs: ['n4'], subst: { u: T('a b'), v: T("b' a'") }, meta: { station: 's3', gesture: 'Witness Stamp at u = ab, v = b⁻¹a⁻¹' } },
    step('n6', 'n5', 's4', 'auto-swap', { k: 'swap' }),
  ],
  facts: {
    n1: "a b b' a' = a b b' a'", n2: "a b b' a' = a e a'", n3: "a b b' a' = a a'", n4: "a b b' a' = e",
    n5: "b' a' = (ab)'", n6: "(ab)' = b' a'",
  },
  filled: { s: 'n6' },
};

export const NOFIX: Fixture = {
  name: 'L09 No Fixed Points — suppose room', levelId: 'L09',
  rooms: [{ id: 'r1', parent: 'root', kind: 'suppose', l: T('a b'), r: T('b') }],
  nodes: [
    { id: 'g:n', scope: 'root', k: 'given', givenId: 'n' },
    { id: 'h1', scope: 'r1', k: 'assume', room: 'r1', meta: { station: 'sA', gesture: 'suppose' } },
    step('s1', 'h1', 'st1', 'multiply on the right by b⁻¹', { k: 'lift', side: 'right', term: T("b'") }, 'r1'),
    step('s2', 's1', 'st2', 'cancel b·b⁻¹', rw('invR', 'l', [1, 3], 'b'), 'r1'),
    step('s3', 's2', 'st2', 'auto-tidy', rw('unitR', 'l', [0, 2], 'a'), 'r1'),
    step('s4', 's3', 'st3', 'cancel b·b⁻¹', rw('invR', 'r', [0, 2], 'b'), 'r1'),
    { id: 'c1', scope: 'r1', k: 'clash', inputs: ['s4', 'g:n'], meta: { station: 'st4', gesture: 'clash with n' } },
    { id: 'x1', scope: 'root', k: 'exit', room: 'r1', input: 'c1', meta: { station: 'st4', gesture: 'discharge' } },
  ],
  facts: {
    'g:n': 'a != e', h1: 'a b = b', s1: "a b b' = b b'", s2: "a e = b b'", s3: "a = b b'", s4: 'a = e', c1: 'bot', x1: 'a b != b',
  },
  filled: { s: 'x1' },
};

const L12nodes: ProofNode[] = [
  { id: 'g:s', scope: 'root', k: 'given', givenId: 's' },
  { id: 'g:n', scope: 'root', k: 'given', givenId: 'n' },
  { id: 'p1', scope: 'root', k: 'press', input: 'g:s', meta: { station: 'sp', gesture: 'Lagrange press' } },
  { id: 'h1', scope: 'r1', k: 'assume', room: 'r1', meta: { station: 'sh', gesture: 'suppose' } },
  { id: 'a0', scope: 'r1', k: 'start', term: T('a b') },
  step('a1', 'a0', 'sa1', 'insert (ab)³ by h', { k: 'insertE', at: { side: 'r', path: [], gap: 2 } }, 'r1'),
  step('a2', 'a1', 'sa1', 'h, reversed', rwNode('h1', 'r', [2, 3], 'rev'), 'r1'),
  step('a3', 'a2', 'sa2', 'insert (ab)³ by h', { k: 'insertE', at: { side: 'r', path: [], gap: 8 } }, 'r1'),
  step('a4', 'a3', 'sa2', 'h, reversed', rwNode('h1', 'r', [8, 9], 'rev'), 'r1'),
  step('a5', 'a4', 'sa3', 'Lagrange at x = ab', rwNode('p1', 'r', undefined, 'fwd', { x: 'a b' }), 'r1'),
  { id: 'w1', scope: 'r1', k: 'apply', rule: { k: 'schema', id: 'witness' }, inputs: ['a5'], subst: { u: T('a'), v: T('b') }, meta: { station: 'sw', gesture: 'Witness Stamp at u = a, v = b' } },
  { id: 'b0', scope: 'r1', k: 'start', term: T('b a') },
  step('b1', 'b0', 'sb1', 'b = a⁻¹ (from the Witness Stamp)', rwNode('w1', 'r', [0, 1], 'fwd'), 'r1'),
  step('b2', 'b1', 'sb2', 'cancel a⁻¹·a', rw('invL', 'r', [0, 2], 'a'), 'r1'),
  { id: 'c1', scope: 'r1', k: 'clash', inputs: ['b2', 'g:n'], meta: { station: 'sc', gesture: 'clash with n' } },
  { id: 'x1', scope: 'root', k: 'exit', room: 'r1', input: 'c1', meta: { station: 'sc', gesture: 'discharge' } },
];
const L12facts: Record<string, string> = {
  'g:s': '|G|=7', 'g:n': 'b a != e', p1: 'law x: x^7 = e', h1: '(ab)^3 = e',
  a0: 'a b = a b', a1: 'a b = a b e', a2: 'a b = (ab)^4', a3: 'a b = (ab)^4 e', a4: 'a b = (ab)^7', a5: 'a b = e',
  w1: "b = a'", b0: 'b a = b a', b1: "b a = a' a", b2: 'b a = e', c1: 'bot', x1: '(ab)^3 != e',
};

export const PRIME: Fixture = {
  name: 'L12 Prime Time — two-belt finale', levelId: 'L12',
  rooms: [{ id: 'r1', parent: 'root', kind: 'suppose', l: T('(ab)^3'), r: T('e') }],
  nodes: L12nodes, facts: L12facts, filled: { s: 'x1' },
};

/** 25 nodes: the finale plus a long side belt and a claim (perf + readability). */
export const STRESS: Fixture = {
  name: 'Stress — 25 nodes', levelId: 'L12',
  rooms: PRIME.rooms,
  nodes: [
    ...L12nodes,
    { id: 'e0', scope: 'root', k: 'start', term: T("a b'") },
    step('e1', 'e0', 'se1', 'insert b⁻¹b', { k: 'insertE', at: { side: 'r', path: [], gap: 1 } }),
    step('e2', 'e1', 'se1', 'expand e', rw('invL', 'r', [1, 2], 'b', 'rev')),
    step('e3', 'e2', 'se2', 'multiply on the left by a⁻¹', { k: 'lift', side: 'left', term: T("a'") }),
    step('e4', 'e3', 'se3', 'cancel a⁻¹·a', rw('invL', 'l', [0, 2], 'a')),
    step('e5', 'e4', 'se3', 'auto-tidy', rw('unitL', 'l', [0, 2], "b'")),
    step('e6', 'e5', 'se4', 'cancel a⁻¹·a', rw('invL', 'r', [0, 2], 'a')),
    step('e7', 'e6', 'se4', 'auto-tidy', rw('unitL', 'r', [0, 2], "b'")),
    step('e8', 'e7', 'se5', 'symmetry', { k: 'swap' }),
  ],
  facts: {
    ...L12facts,
    e0: "a b' = a b'", e1: "a b' = a e b'", e2: "a b' = a b' b b'", e3: "a' a b' = a' a b' b b'",
    e4: "e b' = a' a b' b b'", e5: "b' = a' a b' b b'", e6: "b' = e b' b b'", e7: "b' = b' b b'", e8: "b' b b' = b'",
  },
  filled: { s: 'x1' },
  claims: [{ id: 'c:1', fact: "a b a' = b", scope: 'root' }],
};

/** R01 Shared Return: a² = e is delivered AND fed to the Witness Stamp (fan-out). */
export const SHARED: Fixture = {
  name: 'R01 Shared Return — fan-out', levelId: 'R01', rooms: [],
  nodes: [
    { id: 'g:h4', scope: 'root', k: 'given', givenId: 'h4' },
    { id: 'g:h6', scope: 'root', k: 'given', givenId: 'h6' },
    { id: 'a0', scope: 'root', k: 'start', term: T('a a') },
    step('a1', 'a0', 's1', 'insert a⁴ (by h₄)', { k: 'insertE', at: { side: 'r', path: [], gap: 2 } }),
    step('a2', 'a1', 's1', 'h₄, reversed', rwNode('g:h4', 'r', [2, 3], 'rev')),
    step('a3', 'a2', 's2', 'a⁶ → e (by h₆)', rwNode('g:h6', 'r', [0, 6], 'fwd')),
    { id: 'w1', scope: 'root', k: 'apply', rule: { k: 'schema', id: 'witness' }, inputs: ['a3'], subst: { u: T('a'), v: T('a') }, meta: { station: 's3', gesture: 'Witness Stamp at u = a, v = a' } },
    step('w2', 'w1', 's4', 'auto-swap', { k: 'swap' }),
  ],
  facts: { 'g:h4': 'a^4 = e', 'g:h6': 'a^6 = e', a0: 'a a = a a', a1: 'a a = a a e', a2: 'a a = a^6', a3: 'a a = e', w1: "a = a'", w2: "a' = a" },
  filled: { s: 'a3', t: 'w2' },
};

export const FIXTURES: Record<string, Fixture> = { shoes: SHOES, nofix: NOFIX, prime: PRIME, stress: STRESS, shared: SHARED };

export const graphOf = (f: Fixture, upto = Infinity): ProofGraph => {
  const nodes = f.nodes.slice(0, upto);
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, rooms: f.rooms.filter((r) => nodes.some((n) => n.scope === r.id) || ids.has(r.id)) };
};
