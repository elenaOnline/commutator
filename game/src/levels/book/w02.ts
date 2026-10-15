// THE BOOK · World 2 — First Theorems (Pinter 4, text). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
import type { LevelManifest, Pallet, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import type { LibRef } from '../../factory/types';

const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const a = A('a'), b = A('b'), c = A('c'), e1 = A('e1');
const x = M('x'), y = M('y');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const atomsAB = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }];
const atomsABC = [...atomsAB, { id: 'c', label: 'c', hue: 2 }];

export const LEVELS: LevelManifest[] = [
  {
    // s: Spool e′e, branched: H at x = e on the left rail (e = e′e) and pop on the left rail (e′ = e′e); the Joiner chains the two
    // (same right side) into e = e′. t: Spool c → insert e → e = ab (h₂ backwards)
    // → ca = e (h₁) → c = b.
    id: 'P4.1', index: 4, campaign: 'book', world: 2, chapter: 4, title: 'Only One',
    method: 'Uniqueness argument', insight: 'Compute one product two ways', source: 'Pinter ch. 4 (uniqueness of e and of inverses)',
    memo: 'A rival identity e′ and a rival inverse. Settle both.',
    atoms: [...atomsABC, { id: 'e1', label: 'e′', hue: 3 }],
    givens: [
      { id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(e1, x), r: x } },
      { id: 'h1', name: 'h₁', fact: eq(P(c, a), e) },
      { id: 'h2', name: 'h₂', fact: eq(P(a, b), e) },
    ],
    sockets: [
      { id: 's', target: eq(e1, e), allowedGivens: ['H'] },
      { id: 't', target: eq(c, b), allowedGivens: ['h1', 'h2'] },
    ],
    tools: tools({ merge: true }), unlocks: [],
    idea: 'Uniqueness: compute one term two ways.',
    par: { parts: 7, axioms: 8 }, uses: ['P3.3'],
  },
  {
    // given → multiply left by a⁻¹ → cancel (both rails) → b = c.
    id: 'P4.2', index: 5, campaign: 'book', world: 2, chapter: 4, title: 'Cancellation',
    method: 'Cancellation', insight: 'Multiply by an inverse, then cancel', source: 'Pinter Thm 1',
    memo: 'ab and ac are equal. Show b and c are equal.',
    atoms: atomsABC,
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b), P(a, c)) }],
    sockets: [{ id: 's', target: eq(b, c), allowedGivens: ['h'] }],
    tools: tools({ lift: true, merge: true }), unlocks: ['cancel'],
    idea: 'Do the same to both sides, then cancel.',
    par: { parts: 3, axioms: 5 }, uses: ['P4.1'],
  },
  {
    // given ab = e → insert a a⁻¹ on the right rail → Theorem (cancellation, u = a) → b = a⁻¹.
    id: 'P4.3', index: 6, campaign: 'book', world: 2, chapter: 4, title: 'Undoing From One Side',
    method: 'Uniqueness argument', insight: 'Use cancellation as a theorem', source: 'Pinter Thm 2',
    memo: 'ab = e holds from one side only. Show b is the inverse of a.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b), e) }],
    sockets: [{ id: 's', target: eq(b, I(a)), allowedGivens: ['h'] }],
    tools: tools({ lift: true, merge: true, schemas: ['cancel'] }), unlocks: ['witness'],
    idea: 'A theorem is a machine: cancellation, applied.',
    par: { parts: 3, axioms: 8 }, uses: ['P4.2'],
  },
  {
    // Tower x₁ · Spool x₁⁻¹x₁ → cancel → Theorem (unique inverse, cut x₁⁻¹ | x₁) → swap → ∀ → dock. Save "double inverse".
    id: 'P4.4', index: 7, campaign: 'book', world: 2, chapter: 4, title: 'Undo the Undo',
    method: 'Computation', insight: 'Prove it for an arbitrary element, then keep it', source: 'Pinter Thm 3(ii)',
    memo: 'Inverting twice should change nothing. Prove it for every element, then save it.',
    lemmaNames: ['double inverse'],
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'law', metas: ['x'], l: I(I(x)), r: x }, allowedGivens: [] }],
    tools: tools({ lift: true, merge: true, schemas: ['cancel', 'witness'] }), unlocks: [],
    idea: 'Prove it for any x, then save it.',
    par: { parts: 6, axioms: 7 }, uses: ['P4.3'],
  },
  {
    // Towers x₁, y₁ · Spool (x₁y₁)(y₁⁻¹x₁⁻¹) → cancel twice → Theorem (unique inverse, u = x₁y₁) → swap → ∀ → dock.
    id: 'P4.5', index: 8, campaign: 'book', world: 2, chapter: 4, title: 'Shoes and Socks',
    method: 'Uniqueness argument', insight: 'To show T = u⁻¹, show uT = e', source: 'Pinter Thm 3(i)',
    memo: 'Customers keep removing socks before shoes. Write down the right return order.',
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'law', metas: ['x', 'y'], l: I(P(x, y)), r: P(I(y), I(x)) }, allowedGivens: [] }],
    tools: tools({ lift: true, merge: true, schemas: ['cancel', 'witness'] }), unlocks: ['socks'],
    idea: 'The inverse of a product reverses the order.',
    par: { parts: 7, axioms: 8 }, uses: ['P4.3', 'P4.4'],
  },
];

/**
 * Illustrative letters for card figures. One hue per letter across every card of these worlds, matching the level
 * constants (a b c d) on the floor, so a letter keeps its shape: AT('abc') → a, b, c in their own slots.
 */
const LETTER_HUE: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, p: 0, q: 1, r: 2, s: 3, u: 0, v: 1, w: 2, x: 2, y: 3, z: 4 };
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: LETTER_HUE[id]! }));
/** Tower variables: TW('xy') → x, y as solid ∈G variables, in their letters' own hues. */
const TW = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: LETTER_HUE[id]!, sort: 'G' as const }));
const cancelL: LibRef = { k: 'schema', id: 'cancel' };

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {
  'P4.1': [
    {
      title: 'Uniqueness arguments',
      body: 'To show that only one thing has a property, take two things that have it and show they are equal. Associativity lets you regroup $(pq)r$ as $p(qr)$, and any term $p$ can be written $pe$. A given rewrites its left side wherever that side appears.',
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { label: 'regroup', seq: ['(pq)r', '=', 'p(qr)'] },
        { label: 'identity', seq: ['p', '=', 'pe'] },
      ] }],
    },
    {
      title: 'The Joiner',
      body: 'A **Joiner** combines two facts. Set to **chain**, it links two equations through a term they share: from $p = q$ and $q = r$ it makes $p = r$.',
      machines: ['joiner'],
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { label: 'first equation', seq: ['p', '=', 'q'] },
        { label: 'second equation', seq: ['q', '=', 'r'] },
        { label: 'chained', seq: ['p', '=', 'r'] },
      ] }],
    },
    {
      title: 'Two docks, a second identity',
      body: 'This order has two Receiving Docks, one for each statement, and each is proved on its own. The element $e′$ (read “e prime”) is a second candidate for the identity. The given $H$ says $e′x = x$ for every $x$, so it acts as an identity on the left.',
    },
  ],

  'P4.2': [
    {
      title: 'Same to both sides',
      body: 'Doing the same thing to both sides keeps an equation true: from $u = v$, multiplying on the left by any $t$ gives $tu = tv$. An Operator makes exactly this move, on both sides at once.',
      machines: ['operator'],
      figures: [
        { k: 'scene', atoms: AT('pqr'), spec: {
          machines: [{ x: 2, y: 0, config: { kind: 'operator', recipe: { k: 'multiply', side: 'left' } } }],
          belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [5.8, 0.5]]],
          items: [{ at: [1, 0.5], t: 'p = q' }, { at: [5, 0.5], t: 'rp = rq' }],
          notes: [
            { at: [3, 0.5, 1], text: 'An Operator set to **multiply left**, with $t := r$.' },
            { at: [5.8, 0.5, 0], text: 'Both sides change at once: $rp = rq$.' },
          ] } },
      ],
    },
    {
      title: 'A theorem to keep',
      body: 'Deliver this and you earn **cancellation**. On the left it says $uv = uw \\implies v = w$, where $\\implies$ reads “implies”. The mirror, right cancellation, says $vu = wu \\implies v = w$.',
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { label: 'left cancellation', seq: [{ t: 'pq', br: [[0, 1, 'shared', 'over']] }, '=', { t: 'pr', br: [[0, 1, 'shared', 'over']] }, '⟹', 'q', '=', 'r'] },
        { label: 'right cancellation', seq: [{ t: 'qp', br: [[1, 2, 'shared', 'over']] }, '=', { t: 'rp', br: [[1, 2, 'shared', 'over']] }, '⟹', 'q', '=', 'r'] },
        { seq: ['pq', '=', 'rp', '⟹', 'q', '=', 'r'], strike: true, why: 'Not valid: $p$ is on the left of one side and the right of the other.' },
      ] }],
    },
  ],

  'P4.3': [
    {
      title: 'Theorems are machines',
      body: 'A theorem you have earned stands in for its whole proof. A Theorem machine takes the theorem’s premises as equations on belts and gives back its conclusion in one move.',
      machines: ['theorem'],
      figures: [{ k: 'scene', atoms: AT('pqr'), spec: {
        machines: [{ x: 2, y: 0, config: { kind: 'theorem', recipe: { k: 'library', ref: cancelL } } }],
        belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [5.6, 0.5]]],
        items: [{ at: [1, 0.5], t: 'pq = pr' }, { at: [4.9, 0.5], t: 'q = r' }],
        notes: [
          { at: [3, 0.5, 1.1], text: 'A Theorem machine set to **left cancellation**.' },
          { at: [5.6, 0.5, 0], text: 'It strips the shared $p$ in one move.' },
        ] } }],
    },
    {
      title: 'Inserting an inverse pair',
      body: 'The inverse rule $xx^{-1} = e$, read backwards, inserts a pair $xx^{-1}$ at a gap for any $x$ you pick. The value does not change, since the pair is $e$. If an $e$ is left beside other terms, a Rewriter set to remove $e$ clears it. With other letters:',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { seq: ['p', '=', { t: 'p(qq^-1)', br: [[1, 2, 'inserted pair']] }] },
      ] }],
    },
    {
      title: 'A theorem to keep',
      body: 'Deliver this and you earn **unique inverse**: $uv = e \\implies v = u^{-1}$. If $uv = e$, then $v$ is the inverse of $u$ and nothing else can be. The mirror says $vu = e \\implies v = u^{-1}$.',
    },
  ],

  'P4.4': [
    {
      title: 'Proving for every x',
      body: 'To prove something about every element, prove it about one element you know nothing about. A Tower declares such an element: $x \\in G$, read “$x$ is an element of $G$”. Since the proof uses nothing special about $x$, it works for all elements, and the Generalizer records that: $\\forall x.$ reads “for every $x$”.',
      machines: ['tower', 'forall'],
      figures: [{ k: 'scene', atoms: TW('x'), spec: {
        machines: [{ x: 0, y: 1.6, config: { kind: 'tower', label: 'x', sort: 'G' } }, { x: 2, y: 0, config: { kind: 'forall' } }],
        belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [6, 0.5]]],
        items: [{ at: [1, 0.5], t: 'xx^-1 = e' }, { at: [5.1, 0.5], t: '∀x. xx^-1 = e' }],
        notes: [
          { at: [0.5, 2.1, 1.65], text: 'A **Tower** declares $x \\in G$.' },
          { at: [3, 0.5, 1], text: 'A fact about $x$ arrives at the **Generalizer**.' },
          { at: [6, 0.5, 0], text: 'Out comes $\\forall x. xx^{-1} = e$: true for every element.' },
        ] } }],
    },
    {
      title: 'Save what you prove',
      body: 'When the goal is delivered, save it to the Lemma Book as **double inverse**. A saved theorem becomes a recipe in every later order, so the next orders build on this one.',
      machines: ['theorem', 'lemmabook'],
    },
  ],

  'P4.5': [
    {
      title: 'Order matters',
      body: 'Group elements need not commute. In S₃, the symmetries of a triangle, $(12)(13) = (132)$ but $(13)(12) = (123)$.',
      figures: [{ k: 'table', group: 'S₃' }],
    },
    {
      title: 'Shoes and socks',
      body: 'You put on socks, then shoes. To undo that, the shoes come off first. Inverting a product works the same way.',
      figures: [{ k: 'math', atoms: AT('ab'), rows: [{ seq: ['(ab)^-1', '=', 'a^-1b^-1'], strike: true, why: 'Wrong order. Check it in S₃.' }] }],
    },
    {
      title: 'Matching a premise',
      body: 'A theorem’s premise is a pattern, such as $uv = e$. A Theorem machine lists the ways the equation it receives can match that pattern, and you pick the match.',
    },
  ],
};
