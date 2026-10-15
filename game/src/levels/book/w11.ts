// THE BOOK · World 11 — Lagrange (Pinter 13). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// Phase-A levels only: P13.2, P13.3, P13.4 and P13.s1. P13.1 Cosets Are Equal or Disjoint needs Members (three desks, Subgroup Towers)
// and is left as a placeholder in LEVELS, in campaign order. **Lagrange (the press) is unlocked by P13.1.** These levels are authored as
// if P13.1 were done: `press: true`, and P13.2 carries its `|G| = 5` given.
//
// Notation: every relation here is a WORD (b⁵ = bbbbb), including the Lagrange press, which is used in its word shape
// (`∀x. xxxxx = e` for |G| = 5). The power imports handed out by P10.4 are in the toolset, but no route here needs them.
// Toolset: lift, merge, suppose, press, the earned cancel / witness / socks.
import type { LevelManifest, Pallet, Term, Toolset } from '../../kernel/types';
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

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];
/** Everything handed out by P13.1: the press joins the toolset. */
const W11 = (): Toolset => tools({ lift: true, merge: true, suppose: true, press: true, schemas: [...EARNED, ...POW] });
const atomsAB = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }];

export const LEVELS: LevelManifest[] = [
  // P13.1 Cosets Are Equal or Disjoint — needs Members (Subgroup Tower, three desks). Not authored here. It unlocks Lagrange.
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
    par: { parts: 5, axioms: 7 }, uses: ['P8.1'],
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
    par: { parts: 6, axioms: 10 }, uses: ['P13.2'],
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
    par: { parts: 10, axioms: 12 }, uses: ['P13.3'],
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
    par: { parts: 5, axioms: 11 }, uses: ['P4.12'],
  },
];

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
void AT;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

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
