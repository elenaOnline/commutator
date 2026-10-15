// THE BOOK · World 11 — Lagrange (Pinter 13). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// P13.2, P13.3, P13.4 and P13.s1 are phase A. P13.1 Cosets Are Equal or Disjoint is the Members level of this world (KERNEL-EXT §4):
// a level subgroup H, a three-desk Assume room, and the lemmas the player saved in P12.1 (reflexive / symmetric / transitive, for every subgroup).
// **Lagrange (the press) is unlocked by P13.1.** The kernel has no "unlock the press" event: `tools.press` is a static per-level flag
// (the main campaign's L11 and B04 do the same). So P13.1 has `press: false` and every later level of this world has `press: true`; the
// Lagrange card on P13.1 explains the counting step, and the next levels use the press. P13.2 carries its `|G| = 5` given.
//
// Notation: every relation here is a WORD (b⁵ = bbbbb), including the Lagrange press, which is used in its word shape
// (`∀x. xxxxx = e` for |G| = 5). The power imports handed out by P10.4 are in the toolset, but no route here needs them.
// Toolset: lift, merge, suppose, press, the earned cancel / witness / socks.
import type { LevelManifest, Pallet, PatFact, SubRef, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

const A = (id: string): Term => ({ k: 'atom', id });
const e: Term = { k: 'e' };
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const rep = (t: Term, n: number): Term => P(...Array.from({ length: n }, () => t));
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const neq = (l: Term, r: Term): Pallet => ({ k: 'neq', l, r });
const a = A('a'), b = A('b');
const M = (id: string): Term => ({ k: 'meta', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
/** P13.1: the level's subgroup H, and a membership `t ∈ H` as a card statement. */
const H: SubRef = { k: 'sub', id: 'H' };
const pmem = (t: Term): PatFact => ({ k: 'mem', t, sub: H });

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];
/** What P13.1 itself has: the earned and imported subgroup results, but not yet the press (it unlocks Lagrange on ∎). */
const W11_1 = (): Toolset => tools({ lift: true, merge: true, suppose: true, press: false, schemas: [...EARNED, ...POW, 'sub.e', 'sub.pow'] });
/** Everything handed out by P13.1: the press joins the toolset. */
const W11 = (): Toolset => tools({ lift: true, merge: true, suppose: true, press: true, schemas: [...EARNED, ...POW] });
const atomsAB = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }];

export const LEVELS: LevelManifest[] = [
  {
    // H is a level subgroup; x, a, b, h are Towers. Assume room with three desks: xa⁻¹ ∈ H, xb⁻¹ ∈ H, ha⁻¹ ∈ H (the coset Ha holds x and h; Hb holds x).
    // Theorem same coset: symmetric (H) on xa⁻¹ ∈ H: ax⁻¹ ∈ H · Theorem same coset: transitive (H) on ha⁻¹ ∈ H and ax⁻¹ ∈ H: hx⁻¹ ∈ H ·
    // transitive again on hx⁻¹ ∈ H and xb⁻¹ ∈ H: hb⁻¹ ∈ H · gate · ∀. The lemmas are the player's own (P12.1). Unlocks Lagrange (press) for the next levels.
    id: 'P13.1', index: 53, campaign: 'book', world: 11, chapter: 13, title: 'Cosets Are Equal or Disjoint',
    method: 'Equivalence relation', source: 'Pinter 13, Theorem 1',
    insight: 'The relation of P12.1 used twice: x joins a and b, so everything related to a is related to b.',
    memo: 'x lies in both Ha and Hb. Show everything in Ha lies in Hb.',
    atoms: [], subgroups: [{ id: 'H', label: 'H' }], givens: [],
    sockets: [{
      id: 's', allowedGivens: [],
      target: {
        k: 'cond', metas: ['x', 'a', 'b', 'h'],
        premises: [pmem(P(M('x'), I(M('a')))), pmem(P(M('x'), I(M('b')))), pmem(P(M('h'), I(M('a'))))],
        concl: pmem(P(M('h'), I(M('b')))),
      },
    }],
    tools: W11_1(), unlocks: [],
    idea: 'Two cosets that share an element are equal.',
    par: { parts: 8, axioms: 5 }, uses: ['P12.1'],
  },
  {
    // Words. Spool a → Lagrange backwards at the end gap (e ⟶ aaaaa, a ⟶ a·aaaaa) → aaa ⟶ bbb twice (h) → Lagrange (bbbbb ⟶ e), pop.
    id: 'P13.2', index: 54, campaign: 'book', world: 11, chapter: 13, title: 'Unique Cube Roots',
    method: 'Lagrange', source: 'Pinter 13.D6',
    insight: 'In a group of order 5 cubing is undone by cubing again: a = a⁶ = (a³)² = (b³)² = b⁶ = b.',
    memo: 'In a group of five elements, a and b have the same cube. Show a equals b.',
    atoms: atomsAB,
    givens: [
      { id: 's', name: '|G|', fact: { k: 'size', n: 5 } },
      { id: 'h', name: 'h', fact: eq(rep(a, 3), rep(b, 3)) },
    ],
    sockets: [{ id: 's', target: eq(a, b), allowedGivens: ['s', 'h'] }],
    tools: W11(), unlocks: [],
    idea: 'Lagrange turns a size into a power equal to e.',
    par: { parts: 5, axioms: 7 }, uses: ['P13.1', 'P8.1'],
  },
  {
    // Words. Spool baa → ba ⟶ aab twice (h₂) → aaaa ⟶ e (h₁): baa = b. Then insert e on the right of b and cancel on the left (u = b).
    id: 'P13.3', index: 55, campaign: 'book', world: 11, chapter: 13, title: 'Eight Elements',
    method: 'Computation', source: 'Pinter 13.H2',
    insight: 'Move every a past b with the relation; the a-powers collect to e, and cancellation finishes.',
    memo: 'The relation ba = aab moves b past a. Show a² is e.',
    atoms: atomsAB,
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(rep(a, 4), e) },
      { id: 'h2', name: 'h₂', fact: eq(P(b, a), P(a, a, b)) },
    ],
    sockets: [{ id: 's', target: eq(P(a, a), e), allowedGivens: ['h1', 'h2'] }],
    tools: W11(), unlocks: [],
    idea: 'Collect one letter on one side.',
    par: { parts: 6, axioms: 10 }, uses: ['P13.1', 'P13.2'],
  },
  {
    // Words. b = b·aa (h₁ backwards) → ba ⟶ abb three times (h₃) → aa ⟶ e: b = bbbb. Then × b on the left and h₂ on the right rail: bb = e.
    // Then bb ⟶ e twice in b = bbbb (routed): b = e.
    id: 'P13.4', index: 56, campaign: 'book', world: 11, chapter: 13, title: 'Ten Elements',
    method: 'Computation', source: 'Pinter 13.G4',
    insight: 'Push every a to the left, squaring b as you go. The collected b-power then meets b⁵ = e.',
    memo: 'a² = e, b⁵ = e and ba = abb. Show b is e.',
    atoms: atomsAB,
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(P(a, a), e) },
      { id: 'h2', name: 'h₂', fact: eq(rep(b, 5), e) },
      { id: 'h3', name: 'h₃', fact: eq(P(b, a), P(a, b, b)) },
    ],
    sockets: [{ id: 's', target: eq(b, e), allowedGivens: ['h1', 'h2', 'h3'] }],
    tools: W11(), unlocks: [],
    idea: 'Reach a normal form, then use b⁵ = e.',
    par: { parts: 10, axioms: 12 }, uses: ['P13.1', 'P13.3'],
  },
  {
    // Side. Words. Suppose ba = bb → left cancellation (u = b): a = b → rewrite a ⟶ b in h₁ twice (routed): bb = e → rewrite bb ⟶ e in h₂ (routed): b = e
    // → clash with h₃ (b ≠ e) → gate: ba ≠ bb.
    id: 'P13.s1', index: 57, campaign: 'book', world: 11, chapter: 13, side: true, title: 'Six Elements',
    method: 'Contradiction', source: 'Pinter 13.F1',
    insight: 'One case of a classification: ba = bb would force a = b, and then the two relations together force b = e.',
    memo: 'a² = e, b³ = e and b is not e. Rule out ba = bb.',
    atoms: atomsAB,
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(P(a, a), e) },
      { id: 'h2', name: 'h₂', fact: eq(rep(b, 3), e) },
      { id: 'h3', name: 'h₃', fact: neq(b, e) },
    ],
    sockets: [{ id: 's', target: neq(P(b, a), P(b, b)), allowedGivens: ['h1', 'h2', 'h3'] }],
    tools: W11(), unlocks: [],
    idea: 'Suppose a case, and let the relations clash.',
    par: { parts: 5, axioms: 11 }, uses: ['P13.1', 'P4.12'],
  },
];

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
void AT;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P13.1': [
    {
      title: 'Cosets',
      body: 'For a subgroup $H$ of $G$ and an element $a$, the **coset** $Ha$ is the set of all products $ka$ with $k \\in H$. An element $g$ lies in $Ha$ exactly when $ga^{-1} \\in H$. In the dock, the first two memberships say that $x$ lies in $Ha$ and in $Hb$, and the third says that $h$ lies in $Ha$.',
    },
    {
      title: 'Lagrange’s theorem',
      long: true,
      body: 'Finishing this order unlocks **Lagrange’s theorem**. It is proved by counting. Two cosets of $H$ with an element in common are equal, so the cosets of $H$ split $G$ into blocks that do not overlap. Multiplying the elements of $H$ on the right by $a$ gives a block with as many elements as $H$, because right cancellation keeps different elements different. So every block has $|H|$ elements, and $|G|$, the size of $G$, is the number of blocks times $|H|$. Hence $|H|$ divides $|G|$. For an element $x$, the powers of $x$ form a subgroup whose size $n$ is the order of $x$. Then $n$ divides $|G|$, so $x^{|G|} = e$. From the next order on, the Rewriter has a Lagrange recipe. It needs a given that states $|G|$.',
    },
  ],

  'P13.2': [
    {
      title: 'Using the size of the group',
      body: 'The size of a group $G$, written $|G|$, is its number of elements. **Lagrange’s theorem** says that $x^{|G|} = e$ for every $x$ in $G$. The Lagrange recipe of a Rewriter applies this law, and it needs a given that states $|G|$. With $|G| = 3$ it reads:',
      figures: [{ k: 'math', atoms: AT('p'), rows: [{ seq: ['ppp', '=', 'e'], why: 'for every element $p$' }] }],
    },
  ],

  'P13.3': [
    {
      title: 'Moving a letter past another',
      body: 'A relation such as $vu = uuuv$ moves $v$ to the right of $u$, at the cost of extra copies of $u$. Using it again and again collects the copies of $u$ on one side, where a power relation or cancellation can shorten them. With other letters, one use of it reads:',
      figures: [{ k: 'math', atoms: AT('xuv'), rows: [{ seq: [{ t: 'xvu', br: [[1, 3, '$vu$ rewritten', 'over']] }, '=', 'xuuuv'] }] }],
    },
  ],

  'P13.4': [
    {
      title: 'Normal forms',
      body: 'When relations let you move letters past each other, every word can be rewritten so that all copies of one letter come first. Such a word is in **normal form**. Two words with the same normal form are equal, and a power relation can shorten a normal form further. Keep rewriting until no relation applies.',
    },
  ],

  'P13.s1': [
    {
      title: 'Classifying by cases',
      body: 'To find which group a set of relations describes, list where a product such as $ba$ could land, and rule the cases out one at a time. Each case is a Suppose room: assume the case, reach a clash with the relations or a known inequation, and the gate lets out the opposite of the case.',
    },
  ],
};
