// THE BOOK · World 9 — Cyclic Groups (Pinter 11). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
import type { LevelManifest, Monomial, Pallet, PatFact, Poly, Term, Toolset } from '../../kernel/types';
import type { ConceptCard } from '../cards';
import { polyAdd, polyConst, polyMul } from '../../kernel/poly';

// ── local builders (normalized terms) ──
const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
// Exponents: canonical polynomials written by hand (sparse, sorted, decimal-string coefficients).
const zm = (id: string): Monomial[number] => ({ ref: { k: 'zmeta', id }, degree: 1 });
const Z = (coefficient: number, ...monomial: Monomial): Poly => [{ coefficient: String(coefficient), monomial }];
/** base^exp, one factor of its enclosing word (a pow node, never expanded). */
const PW = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });
const a = A('a');
/** The exponent consisting of the single ℤ meta `id`. */
const ZM = (id: string): Poly => Z(1, zm(id));
const x = M('x');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
/** Earned theorems (unique inverse, cancellation, inverse of a product). */
const EARNED = ['cancel', 'witness', 'socks'];


/** Every import the book has handed out by chapter 11 (worked out in world 8). */
const POWERS = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];

// P11.1 Subgroups of a Cyclic Group (Thm 2 core) is the Members level of this world (KERNEL-EXT §4): a level subgroup H, memberships
// `t ∈ H`, and the IMPORT `sub.pow` ("powers of a member are members", listed in its toolset like the power laws). Its pow nodes are
// built with the kernel's polynomial helpers. P11.1 has index 45; P11.2 and P11.3 keep 46 and 47.

/** The exponent 3q + r (q, r ℤ metas of the dock). */
const THREE_Q_PLUS_R: Poly = polyAdd(polyMul(polyConst(3), ZM('q')), ZM('r'));
const mem = (t: Term): Pallet => ({ k: 'mem', t, sub: { k: 'sub', id: 'H' } });
const pmem = (t: Term): PatFact => ({ k: 'mem', t, sub: { k: 'sub', id: 'H' } });

export const LEVELS: LevelManifest[] = [
  {
    // Notation: pow nodes (a³ = a^(3)). H is a level subgroup; the given is a³ ∈ H. Towers q₁, r₁ (ℤ). Imports: sub.pow and the power laws.
    // Assume desk a^(3q₁+r₁) ∈ H · Theorem sub.pow on the given at n := −q₁: (a³)^(−q₁) ∈ H · Theorem closed under products on the desk and that:
    // a^(3q₁+r₁)(a³)^(−q₁) ∈ H · power.multiply on (a³)^(−q₁) → a^(−3q₁) · power.add on a^(3q₁+r₁)a^(−3q₁) → a^(r₁) ∈ H · gate · ∀.
    id: 'P11.1', index: 45, campaign: 'book', world: 9, chapter: 11, title: 'Subgroups of a Cyclic Group',
    method: 'Subgroup test', source: 'Pinter 11, Theorem 2',
    insight: 'Multiply a member by a power of a³ to cut the exponent down to the remainder r.',
    memo: 'H contains a³. If a raised to 3q + r is in H, show aʳ is too.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }], subgroups: [{ id: 'H', label: 'H' }],
    givens: [{ id: 'g', name: 'a³ ∈ H', fact: mem(PW(a, Z(3))) }],
    sockets: [{
      id: 's', allowedGivens: ['g'],
      target: { k: 'cond', metas: ['q', 'r'], premises: [pmem(PW(a, THREE_Q_PLUS_R))], concl: pmem(PW(a, ZM('r'))) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POWERS, 'sub.e', 'sub.pow'] }), unlocks: [],
    idea: 'The powers of a member are members.',
    par: { parts: 7, axioms: 6 }, uses: ['P5.1', 'P10.3'],
  },
  {
    // Notation: pow nodes. Assume nothing. Tower x₁, i₁, j₁, m₁.
    // Spool (xⁱxʲ)ᵐ → power.add (inside the base) → power.multiply → power.add backwards (im, jm) → power.multiply backwards (i, m) and (j, m) → dock.
    id: 'P11.2', index: 46, campaign: 'book', world: 9, chapter: 11, title: 'Powers of One Element Commute',
    method: 'Exponent arithmetic',
    insight: 'Powers of one element combine by adding exponents, and addition does not care about order. So (x^ix^j)^m splits as (x^i)^m(x^j)^m.',
    source: 'Pinter 11.B2 / 11.C3',
    memo: 'Multiply two powers of one element, then raise the product to the power m. Show that it splits into the m-th powers of each.',
    lemmaNames: ['powers of a product of powers'],
    atoms: [], givens: [],
    sockets: [{
      id: 's', allowedGivens: [],
      target: { k: 'law', metas: ['x', 'i', 'j', 'm'], l: PW(P(PW(x, ZM('i')), PW(x, ZM('j'))), ZM('m')), r: P(PW(PW(x, ZM('i')), ZM('m')), PW(PW(x, ZM('j')), ZM('m'))) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POWERS] }), unlocks: [],
    idea: 'Powers of one element combine by plain arithmetic on exponents.',
    par: { parts: 11, axioms: 6 }, uses: ['P10.3'],
  },
  {
    // Notation: a⁵ = e is the pow node a^(5); the docks are pow nodes. Open dock `aⁱ = (a^?)²` with a ℤ hole k; the answer is k = 3i.
    // Side fact a⁶ = a: Spool a⁶ → power.add backwards (5, 1) → h → power.one. It feeds both docks.
    // s: Assume (aⁱ)² = e · Spool aⁱ → side fact backwards → power.multiply → power.multiply backwards (2i, 3) and (i, 2) → desk → power.identity → gate → ∀.
    // t: Spool aⁱ → side fact backwards → power.multiply → power.multiply backwards (3i, 2) → ∀.
    // The hom dock (squaring respects products) is dropped: it is P11.2 applied twice (SYNTHESIS §3, adversary M5).
    id: 'P11.3', index: 47, campaign: 'book', world: 9, chapter: 11, title: 'Squaring in a Five-Element Cyclic Group',
    method: 'Exponent arithmetic',
    insight: 'In a group where a⁵ = e, a⁶ = a. That lets a^i be written as a^(6i), which is (a^(3i))² (onto) and also ((a^i)²)³ (one-to-one).',
    source: 'Pinter 11.B6',
    memo: 'Here a⁵ = e. Show that squaring the powers of a is one-to-one and onto.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [{ id: 'h', name: 'a⁵ = e', fact: eq(PW(a, Z(5)), e) }],
    sockets: [
      { id: 's', target: { k: 'cond', metas: ['i'], premises: [peq(PW(PW(a, ZM('i')), Z(2)), e)], concl: peq(PW(a, ZM('i')), e) }, allowedGivens: ['h'] },
      {
        id: 't', allowedGivens: ['h'], holes: [{ id: 'k', sort: 'Z' }],
        target: { k: 'law', metas: ['i'], l: PW(a, ZM('i')), r: PW(PW(a, ZM('k')), Z(2)) },
      },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POWERS] }), unlocks: [],
    idea: 'Squaring is one-to-one and onto in a cyclic group of odd order.',
    par: { parts: 18, axioms: 16 }, uses: ['P10.3', 'P11.2'],
  },
];


/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {
  'P11.1': [
    {
      title: 'Powers of a member',
      body: 'Every subgroup $H$ now has a new recipe, **powers of a member are members**: if $x \\in H$ and $n$ is an integer, then $x^n \\in H$. It is imported, like the laws of exponents. It is proved by induction on $n$ with closure under products, and for negative $n$ with closure under inverses. The game does not ask you to prove it again.',
    },
    {
      title: 'Subgroups of a cyclic group',
      body: 'A group is **cyclic** when it consists of the powers of one element $a$. Every subgroup of a cyclic group is again made of the powers of one element. To show this, divide an exponent by a smaller one: $k = mq + r$ with remainder $r$. If $a^m$ and $a^k$ are in $H$, the dock shows that $a^r$ is in $H$ too.',
    },
  ],

  'P11.2': [
    {
      title: 'Exponent arithmetic',
      body: 'Exponents are integer expressions in the integer Tower variables. The checker does their arithmetic for you: $3(n + 1)$ and $3n + 3$ are the same exponent, and so are $2(3n)$ and $6n$. When a law of exponents is read backwards, its lens asks how to split the exponent.',
    },
    {
      title: 'Powers do not distribute',
      body: 'In S₃, take $a = (12)$ and $b = (23)$. Then $a^2b^2 = e$, but $(ab)^2 \\neq e$. So $(uv)^n = u^nv^n$ is not a rule in general. This order proves that it does hold when $u$ and $v$ are powers of one element.',
      figures: [{ k: 'table', group: 'S₃' }],
    },
  ],

  'P11.3': [
    {
      title: 'One-to-one and onto',
      body: 'A map from a group to itself is **one-to-one** if two different elements never go to the same place, and **onto** if every element is reached. In ℤ₇, the integers modulo 7 under addition, tripling sends $0, 1, \\ldots, 6$ to $0, 3, 6, 2, 5, 1, 4$. All seven are different, so tripling is both.',
    },
    {
      title: 'The missing dock',
      body: 'Squaring also respects products: $(uv)^2 = u^2v^2$ when $u$ and $v$ are powers of one element. That is the previous order with $m = 2$, so it is not asked again. Together the three properties make squaring an **automorphism**, an isomorphism of the group onto itself.',
    },
  ],
};
