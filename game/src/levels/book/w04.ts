// THE BOOK · World 4 — Subgroups (Pinter 5). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// P5.2, P5.3, P5.5, P5.s1 and P5.s2 are equational (phase A). P5.1 and P5.4 are the Members levels (phase B, KERNEL-EXT §4): a level
// subgroup H, membership facts `t ∈ H`, and the subgroup axioms `sub.mul` / `sub.inv` (always available where a subgroup is in scope).
// P5.1 EARNS `sub.e` (`unlocks: ['sub.e']`); it is not in P5.1's own toolset. P5.4 lists it, as every later subgroup level does.
//
// Notation: words (a⁴ = aaaa) — no integer exponents before ch. 10.
// Toolset: everything introduced up to P4.12 (lift, merge, suppose) and the earned cancel / witness / socks. No power laws, no press.
import type { LevelManifest, Pallet, PatFact, SubRef, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import { letterSlot } from '../../ui/letters';

const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const rep = (t: Term, n: number): Term => P(...Array.from({ length: n }, () => t));
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const a = A('a'), b = A('b'), c = A('c'), d = A('d');
const x = M('x'), y = M('y'), u = M('u');
/** The level's subgroup H, and memberships in it (a Pallet on belts and in givens, a PatFact inside a card). */
const H: SubRef = { k: 'sub', id: 'H' };
const mem = (t: Term): Pallet => ({ k: 'mem', t, sub: H });
const pmem = (t: Term): PatFact => ({ k: 'mem', t, sub: H });

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
/** Everything the Book has handed out by P4.5 (earned theorems; the player's saved lemmas are not listed). */
const EARNED = ['cancel', 'witness', 'socks'];
const atomsA = [{ id: 'a', label: 'a', hue: 0 }];
const SUBGROUP_H = [{ id: 'H', label: 'H' }];
const atomsAB = [...atomsA, { id: 'b', label: 'b', hue: 1 }];

export const LEVELS: LevelManifest[] = [
  {
    // Subgroup H with only its two closure axioms. Theorem: closed under inverses (a ∈ H ⟹ a⁻¹ ∈ H) · Theorem: closed under products
    // (a ∈ H and a⁻¹ ∈ H ⟹ aa⁻¹ ∈ H) · cancel inside the membership (aa⁻¹ ⟶ e). Earns sub.e.
    id: 'P5.1', index: 21, campaign: 'book', world: 4, chapter: 5, title: 'A Subgroup Contains e',
    method: 'Subgroup test', source: 'Pinter 5 (the definition of a subgroup)',
    insight: 'A member and its inverse multiply to e, and closure under products puts that product in H.',
    memo: 'H is a subgroup that contains a. Show H contains e.',
    atoms: atomsA, subgroups: SUBGROUP_H,
    givens: [{ id: 'g', name: 'a ∈ H', fact: mem(a) }],
    sockets: [{ id: 's', target: mem(e), allowedGivens: ['g'] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: ['sub.e'],
    idea: 'Why every subgroup contains the identity.',
    par: { parts: 3, axioms: 3 }, uses: ['P4.13'],
  },
  {
    // Three docks = the subgroup test for the centre. s1: Spool x₁ → insert e on each side. s2: Spool abx₁ → Hb, Ha.
    // s3: Spool ax₁ → Ha on the right rail → × a⁻¹ on the left, cancel → × a⁻¹ on the right, cancel → swap.
    id: 'P5.2', index: 22, campaign: 'book', world: 4, chapter: 5, title: 'The Centre',
    method: 'Subgroup test', source: 'Pinter 5.D3',
    insight: 'Closure under inverses comes from conjugating an instance of the law by a⁻¹ on both sides.',
    memo: 'a and b commute with everything. Check that e, ab and a⁻¹ do too.',
    atoms: atomsAB,
    givens: [
      { id: 'Ha', name: 'Hₐ', fact: { k: 'law', metas: ['x'], l: P(a, x), r: P(x, a) } },
      { id: 'Hb', name: 'H_b', fact: { k: 'law', metas: ['x'], l: P(b, x), r: P(x, b) } },
    ],
    sockets: [
      { id: 's1', target: { k: 'law', metas: ['x'], l: P(e, x), r: P(x, e) }, allowedGivens: [] },
      { id: 's2', target: { k: 'law', metas: ['x'], l: P(a, b, x), r: P(x, a, b) }, allowedGivens: ['Ha', 'Hb'] },
      { id: 's3', target: { k: 'law', metas: ['x'], l: P(I(a), x), r: P(x, I(a)) }, allowedGivens: ['Ha'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A subgroup test has one dock for each closure property.',
    par: { parts: 17, axioms: 15 }, uses: ['P4.5'],
  },
  {
    // Spool a(a⁻¹xa⁻¹)a(a⁻¹xa⁻¹) → H at x := a⁻¹x₁a⁻¹ on the right rail → four cancellations → swap → ∀.
    id: 'P5.3', index: 23, campaign: 'book', world: 4, chapter: 5, title: 'Closed Under Inverses',
    method: 'Subgroup test', source: 'Pinter 5.D4a',
    insight: 'Choose the instance of the law that makes the inverses cancel.',
    memo: 'a satisfies a law for every x. Show a⁻¹ satisfies it too.',
    atoms: atomsA,
    givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(a, x, a, x), r: P(x, a, x, a) } }],
    sockets: [{
      id: 's', allowedGivens: ['H'],
      target: { k: 'law', metas: ['x'], l: P(I(a), x, I(a), x), r: P(x, I(a), x, I(a)) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A law for every x can be used at any term.',
    par: { parts: 9, axioms: 11 }, uses: ['P4.8'],
  },
  {
    // Tower u₁ · Assume desk u₁ ∈ H · Theorem Kd (u₁ ∈ H ⟹ du₁d⁻¹ ∈ H) · Theorem Kc (at du₁d⁻¹) · inverse of a product backwards on d⁻¹c⁻¹ →
    // cdu₁(cd)⁻¹ ∈ H · gate · ∀.
    id: 'P5.4', index: 24, campaign: 'book', world: 4, chapter: 5, title: 'Conjugating by a Product',
    method: 'Subgroup test', source: 'Pinter 5.D7',
    insight: 'Conjugate by d first, then by c. The two conjugations together are one conjugation by cd.',
    memo: 'c and d each conjugate H into itself. Show cd does too.',
    atoms: [{ id: 'c', label: 'c', hue: 0 }, { id: 'd', label: 'd', hue: 1 }], subgroups: SUBGROUP_H,
    givens: [
      { id: 'Kc', name: 'K_c', fact: { k: 'cond', metas: ['u'], premises: [pmem(u)], concl: pmem(P(c, u, I(c))) } },
      { id: 'Kd', name: 'K_d', fact: { k: 'cond', metas: ['u'], premises: [pmem(u)], concl: pmem(P(d, u, I(d))) } },
    ],
    sockets: [{
      id: 's', allowedGivens: ['Kc', 'Kd'],
      target: { k: 'cond', metas: ['u'], premises: [pmem(u)], concl: pmem(P(c, d, u, I(P(c, d)))) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, 'sub.e'] }), unlocks: [],
    idea: 'A membership can be a hypothesis.',
    par: { parts: 5, axioms: 12 }, uses: ['P5.1', 'P4.5'],
  },
  {
    // s1: Spool bbbb → bb ⟶ aa (h₂ backwards) twice → a⁴ = e. s2: Spool abab → ba ⟶ abbb → s1 (routed) → pop.
    id: 'P5.5', index: 25, campaign: 'book', world: 4, chapter: 5, title: 'The Quaternion Relations',
    method: 'Computation', source: 'Pinter 5.F3',
    insight: 'A group given by relations: each table entry is a rewrite, and an early result is a rule for a later one.',
    memo: 'Three relations define a group of eight elements. Compute two of its products.',
    atoms: atomsAB,
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(rep(a, 4), e) },
      { id: 'h2', name: 'h₂', fact: eq(P(a, a), P(b, b)) },
      { id: 'h3', name: 'h₃', fact: eq(P(b, a), P(a, b, b, b)) },
    ],
    sockets: [
      { id: 's1', target: eq(rep(b, 4), e), allowedGivens: ['h1', 'h2'] },
      { id: 's2', target: eq(P(a, b, a, b), P(a, a)), allowedGivens: ['h1', 'h2', 'h3'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Defining relations are rewrite rules.',
    par: { parts: 7, axioms: 6 }, uses: ['P4.13'],
  },
  {
    // Side. h: a⁵ = a². Insert e before the right side, right cancellation (u = aa) → aaa = e → unique inverse (cut a | aa) → swap.
    id: 'P5.s1', index: 26, campaign: 'book', world: 4, chapter: 5, side: true, title: 'A Repeat Among Powers',
    method: 'Cancellation', source: 'Pinter 5.D5',
    insight: 'A repeated power gives a power equal to e, and a power equal to e gives an inverse.',
    memo: 'a⁵ equals a². Find the inverse of a.',
    atoms: atomsA,
    givens: [{ id: 'h', name: 'h', fact: eq(rep(a, 5), P(a, a)) }],
    sockets: [{ id: 's', target: eq(I(a), P(a, a)), allowedGivens: ['h'] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A repeat among powers makes an inverse.',
    par: { parts: 4, axioms: 11 }, uses: ['P4.3'],
  },
  {
    // Side. s1 (5.D4L): Spool ay₁y₁ → insert a⁻¹a twice → H at x := y₁a⁻¹ → cancel twice → ∀. s2 (5.D4b): Spool abxabx →
    // Hₐ at x := bx → H_b at x := xa → ∀.
    id: 'P5.s2', index: 27, campaign: 'book', world: 4, chapter: 5, side: true, title: 'Closed Under Products',
    method: 'Subgroup test', source: 'Pinter 5.D4L / 5.D4b',
    insight: 'The same law at two cleverly chosen instances: the product of two such elements is again one.',
    memo: 'a and b obey the same law. Show a commutes with squares, and ab obeys the law.',
    atoms: atomsAB,
    givens: [
      { id: 'Ha', name: 'Hₐ', fact: { k: 'law', metas: ['x'], l: P(a, x, a, x), r: P(x, a, x, a) } },
      { id: 'Hb', name: 'H_b', fact: { k: 'law', metas: ['x'], l: P(b, x, b, x), r: P(x, b, x, b) } },
    ],
    sockets: [
      { id: 's1', target: { k: 'law', metas: ['y'], l: P(a, y, y), r: P(y, y, a) }, allowedGivens: ['Ha'] },
      { id: 's2', target: { k: 'law', metas: ['x'], l: P(a, b, x, a, b, x), r: P(x, a, b, x, a, b) }, allowedGivens: ['Ha', 'Hb'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Choose where to apply a law.',
    par: { parts: 13, axioms: 13 }, uses: ['P5.3'],
  },
];

/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters: a letter keeps its shape on every card and floor). */
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: letterSlot(id) }));
void M; void y;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P5.1': [
    {
      title: 'Subgroups',
      body: 'A **subgroup** of a group $G$ is a nonempty set $H$ of elements of $G$ that is closed under products and closed under inverses. The statement $x \\in H$ says that $x$ is an element of $H$. On the floor, $H$ is drawn as a small set with its name inside:',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { label: 'closed under products', seq: ['p', '∈', 'H', ',', 'q', '∈', 'H', '⟹', 'pq', '∈', 'H'] },
        { label: 'closed under inverses', seq: ['p', '∈', 'H', '⟹', 'p^-1', '∈', 'H'] },
      ] }],
    },
    {
      title: 'Why a subgroup is nonempty',
      body: 'The empty set satisfies both closure properties, because it has no elements to test. Yet it is not a subgroup. That is why “nonempty” is part of the definition. In this order $H$ is nonempty, because the given says $a \\in H$.',
    },
    {
      title: 'Memberships on the floor',
      body: 'A membership such as $a \\in H$ travels on belts like an equation, but it has one term and no right side. Each closure property is a recipe of the Theorem machine, listed under the name of the subgroup. Equal terms are the same element, so a Rewriter can change the term inside a membership. With other letters:',
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { seq: ['q', '=', 'r', ',', 'pq', '∈', 'H', '⟹', 'pr', '∈', 'H'], why: 'A Rewriter with $q = r$ on its rule port.' },
      ] }],
    },
  ],

  'P5.2': [
    {
      title: 'The centre of a group',
      body: 'The **centre** of a group is the set of elements that commute with every element: $a$ belongs to it when $ax = xa$ for every $x$. A subgroup must contain $e$ and be closed under products and under inverses. The three docks check these properties for the centre. Each one asks for a new law of the same shape, built from the givens.',
    },
    {
      title: 'A law at a compound term',
      body: 'A law such as $\\forall z. pz = zp$ holds for every $z$, so you may apply it with $z$ standing for any term, not only a single letter. Choose the term when you set the recipe. Taking $z = vw$ moves $vw$ as one block:',
      figures: [{ k: 'math', atoms: AT('pzvw'), rows: [
        { label: 'the law', seq: ['pz', '=', 'zp'] },
        { label: 'at z = vw', seq: [{ t: 'p(vw)', br: [[1, 2, '$z = vw$', 'over']] }, '=', { t: '(vw)p', br: [[0, 1, '$z = vw$', 'over']] }] },
      ] }],
    },
  ],

  'P5.3': [
    {
      title: 'Closure under inverses',
      body: 'In a subgroup test, the elements with some property must be closed under inverses. Here the property is a law in $x$. The given says that $a$ satisfies it, and the dock asks the same of $a^{-1}$. Pinter builds a subgroup from this property in the exercises of chapter 5.',
    },
  ],

  'P5.4': [
    {
      title: 'A membership as a hypothesis',
      body: 'An Assume room can take a membership as its assumption, such as $u \\in H$ for a Tower variable $u$. The desk hands that fact out, and the gate lets out the conditional $u \\in H \\implies \\ldots$. A given of that form is applied by a Theorem machine, which needs its premise on a belt.',
    },
    {
      title: 'Conjugating a subgroup',
      body: 'The **conjugate** of $u$ by $g$ is $gug^{-1}$. A given of the form below says that conjugating by $g$ sends every member of $H$ to a member of $H$. This order has two such givens, one for $c$ and one for $d$. The dock asks the same of conjugating by their product.',
      figures: [{ k: 'math', atoms: AT('gu'), rows: [
        { seq: ['u', '∈', 'H', '⟹', 'gug^-1', '∈', 'H'], why: 'for every $u$' },
      ] }],
    },
  ],

  'P5.5': [
    {
      title: 'Groups given by relations',
      body: 'A group can be described by letters and **relations**, equations that the letters must satisfy. Every consequence of the relations holds in the group. Each relation is a rewrite rule: wherever its left side appears in a word, you may replace it by its right side. Computing a product in the group means rewriting. With the relation $zz = e$:',
      figures: [{ k: 'math', atoms: AT('zw'), rows: [
        { seq: [{ t: 'zzzw', br: [[0, 2, '$zz = e$', 'over']] }, '=', 'zw'] },
      ] }],
    },
  ],

  'P5.s1': [
    {
      title: 'Repeats among powers',
      body: 'In a finite group the powers $x, x^2, x^3, \\ldots$ cannot all be different, so some power repeats. This is why a finite, nonempty set of elements that is closed under products is also closed under inverses. Here the repeat is given to you as an equation between two powers of $a$.',
    },
  ],

  'P5.s2': [
    {
      title: 'Commuting with squares',
      body: 'A **square** is a product $yy$. The given $H_a$ says $(ax)(ax) = (xa)(xa)$ for every $x$. The first dock asks for a related property of $a$: it commutes with every square, $ayy = yya$ for every $y$. The second dock shows that the product $ab$ has the property of $H_a$ and $H_b$.',
    },
  ],
};
