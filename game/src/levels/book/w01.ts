// THE BOOK · World 1 — Groups (Pinter 2–3). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
// Three levels. The Book assumes nothing, so P3.1 re-teaches place → connect → deliver with a pre-placed Spool.
import type { LevelManifest, Pallet, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

// ── local builders (normalized terms) ──
const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const a = A('a'), b = A('b');
const x = M('x');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const atomsAB = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }];

export const LEVELS: LevelManifest[] = [
  {
    // Spool a⁻¹ab (pre-placed) → Rewriter (cancel a⁻¹a) → dock a⁻¹ab = b.
    id: 'P3.1', index: 1, campaign: 'book', world: 1, chapter: 3, title: 'Three Rules',
    method: 'Computation', insight: 'Each machine makes one checked move', source: 'Pinter 3.A (axioms)',
    memo: 'Calibration run. Make the right rail read b.',
    atoms: atomsAB, givens: [],
    sockets: [{ id: 's', target: eq(P(I(a), a, b), b), allowedGivens: [] }],
    tools: none, preStarts: [P(I(a), a, b)], unlocks: [],
    idea: 'Every proof starts from t = t.',
    par: { parts: 1, axioms: 2 }, uses: [],
  },
  {
    // Spool a⁻¹ → insert e on the right rail → H backwards at x = a (e → aa) → cancel a⁻¹a → a⁻¹ = a.
    id: 'P3.2', index: 2, campaign: 'book', world: 1, chapter: 3, title: 'Its Own Inverse',
    method: 'Computation', insight: 'An e can be written as xx for a chosen x', source: 'Pinter 3.C2 / 3.D / 3.F5 (shared property)',
    memo: 'Every element times itself is e. Show a⁻¹ and a are equal.',
    atoms: atomsAB,
    givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(x, x), r: e } }],
    sockets: [{ id: 's', target: eq(I(a), a), allowedGivens: ['H'] }],
    tools: none, unlocks: [],
    idea: 'A given law is a recipe, and a recipe can run backwards.',
    par: { parts: 3, axioms: 4 }, uses: ['P3.1'],
  },
  {
    // Spool ba → on one rail insert e at both ends, read them as aa and bb (H backwards), then abab → e (H at x = ab).
    id: 'P3.3', index: 3, campaign: 'book', world: 1, chapter: 3, title: 'When Every Square Is e',
    method: 'Computation', insight: 'A law holds at a product too', source: 'Pinter ch. 3 (abelian groups)',
    memo: 'Every element squared is e. Show any two elements commute.',
    atoms: atomsAB,
    givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(x, x), r: e } }],
    sockets: [{ id: 's', target: eq(P(a, b), P(b, a)), allowedGivens: ['H'] }],
    tools: none, unlocks: [],
    idea: 'A law holds at a product too: x can be ab.',
    par: { parts: 4, axioms: 7 }, uses: ['P3.2'],
  },
];

/**
 * Illustrative letters for card figures. One hue per letter across every card of these worlds, matching the level
 * constants (a b c d) on the floor, so a letter keeps its shape: AT('abc') → a, b, c in their own slots.
 */
const LETTER_HUE: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, p: 0, q: 1, r: 2, s: 3, u: 0, v: 1, w: 2, x: 2, y: 3, z: 4 };
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: LETTER_HUE[id]! }));

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {
  'P3.1': [
    {
      title: 'What a group is',
      body: 'A group is a set of elements with one way to combine two of them, written side by side: $ab$ is $a$ combined with $b$. Every group obeys three rules. Here $e$ is the **identity** and $a^{-1}$ is the **inverse** of $a$. Because of associativity, brackets can move freely, so the floor writes products without them.',
      figures: [{ k: 'math', atoms: AT('abc'), rows: [
        { label: 'associativity', seq: ['(ab)c', '=', 'a(bc)'] },
        { label: 'identity', seq: ['ea', '=', 'a', '=', 'ae'] },
        { label: 'inverses', seq: ['a^-1a', '=', 'e', '=', 'aa^-1'] },
      ] }],
    },
    {
      title: 'Spool and Rewriter',
      body: 'Every proof starts at a Spool, which turns a term $t$ into the equation $t = t$. After that, each machine makes one checked move. Pick a machine on the hotbar and place it, then drag from an output arrow to an input to lay a belt between them. The Spool for this order is already on the floor.',
      machines: ['spool', 'rewriter'],
      figures: [{ k: 'gif' }],
    },
    {
      title: 'What a proof is',
      long: true,
      body: 'A proof is an argument that a statement must be true, using only what was agreed at the start. Here that means the three group rules and any givens listed on the order. If the goal can be reached from those alone, it holds in every group at once: numbers under addition, the symmetries of a square, the shuffles of a deck. Checking examples can never do this, because there are infinitely many groups. A proof covers all of them.\n\nEach move is approved by a checker, so a finished proof has no gaps. You are done when the goal reaches the **Receiving Dock**, marked ∎, the traditional sign for the end of a proof.',
    },
  ],

  'P3.2': [
    {
      title: 'Givens are recipes',
      body: 'A given is a fact you may use as often as you like. This order gives $H$: $\\forall x. xx = e$, read “for every $x$, $xx = e$”. Because $H$ holds for every $x$, you may use it at any element you choose. In a Rewriter, a given is picked as a recipe. It does not travel by belt.',
      figures: [{ k: 'scene', atoms: AT('c'), spec: {
        machines: [{ x: 0, y: 0, config: { kind: 'spool' } }, { x: 3, y: 0, config: { kind: 'rewriter', recipe: { k: 'law', ref: { k: 'given', givenId: 'H' } }, dir: 'fwd' } }],
        belts: [[[1, 0.5], [3, 0.5]], [[5, 0.5], [6.8, 0.5]]],
        items: [{ at: [2, 0.5], t: 'cc = cc' }, { at: [6, 0.5], t: 'cc = e' }],
        notes: [
          { at: [0.5, 0.5, 0.9], text: 'The Spool’s equation travels by belt.' },
          { at: [4, 0.5, 1], text: 'The recipe is the given $H$, picked in the Rewriter’s lens.' },
          { at: [6.8, 0.5, 0], text: '$H$ at $x = c$ turns $cc$ into $e$.' },
        ] } }],
    },
    {
      title: 'Rules run both ways',
      body: 'A recipe can also run from right to left. Read $H$ backwards and it inserts $xx$ at a gap between factors, or at either end, for any $x$ you pick. Inserting $xx$ keeps the value, because $xx = e$. With other letters:',
      figures: [{ k: 'math', atoms: AT('dc'), rows: [
        { seq: ['d', '=', { t: 'd(cc)', br: [[1, 2, '$H$ backwards, $x = c$']] }] },
      ] }],
    },
  ],

  'P3.3': [
    {
      title: 'Choosing the instance',
      body: 'A law with a variable, like $x^{-1}x = e$, is one equation for every element. When you use it in a Rewriter, you choose which element your instance stands for, and you can type any term there.',
      figures: [{ k: 'math', atoms: AT('c'), rows: [
        { seq: [{ t: 'c^-1c', br: [[0, 1, 'the law at $x = c$']] }, '=', 'e'] },
      ] }],
    },
    {
      title: 'Commuting',
      body: 'Two elements $a$ and $b$ **commute** when $ab = ba$. A group where every pair commutes is **commutative**, also called **abelian**. In general, order matters. In V₄, the four-element group where every square is $e$, the table is symmetric across the diagonal, so every pair commutes.',
      figures: [{ k: 'table', group: 'V₄' }],
    },
  ],
};
