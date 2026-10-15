// THE BOOK · World 3 — Group Algebra (Pinter 4, sets A–H). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// OPEN DOCKS: P4.6, P4.s1, P4.s2 and P4.s3 are "solve for d" levels. Their dock is `d = ?`: target eq(d, M('h')) with the hole h
// (`holes: [{ id: 'h', notMentioning: ['d'] }]`), so the answer is never named. The known answers (P4.6 a⁻¹cb⁻¹, P4.s1 bc⁻¹a⁻¹,
// P4.s2 a⁶, P4.s3 b⁻¹a⁻¹) live in the reference-solution tests, not here.
// P4.s4 is a WITNESS dock: `∃y. ab = y²`, a hole y that appears twice (the same term both times).
import type { HoleDecl, LevelManifest, Pallet, PatFact, Term, Toolset } from '../../kernel/types';
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
const neq = (l: Term, r: Term): Pallet => ({ k: 'neq', l, r });
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
const a = A('a'), b = A('b'), c = A('c'), d = A('d');
const x = M('x'), y = M('y'), h = M('h');
/** The hole of a `d = ?` dock: any answer that does not mention d. */
const UNKNOWN: HoleDecl = { id: 'h', notMentioning: ['d'] };

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
/** Everything the Book has handed out by P4.5 (earned theorems; the player's saved lemmas are not listed). */
const EARNED = ['cancel', 'witness', 'socks'];
const atomsAB = [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }];
const atomsABCD = [...atomsAB, { id: 'c', label: 'c', hue: 2 }, { id: 'd', label: 'd', hue: 3 }];

export const LEVELS: LevelManifest[] = [
  {
    // Open dock `d = ?`; the answer is d = a⁻¹cb⁻¹ (Pinter 4.A2). Cancel d itself (left cancellation u = d, v = db, w = a⁻¹c).
    id: 'P4.6', index: 9, campaign: 'book', world: 3, chapter: 4, title: 'Solve for d',
    method: 'Solving an equation', insight: 'The unknown can itself be cancelled', source: 'Pinter 4.A2',
    memo: 'd appears on both sides. Solve for d.',
    atoms: atomsABCD,
    givens: [{ id: 'h', name: 'h', fact: eq(P(d, d, b), P(d, I(a), c)) }],
    sockets: [{ id: 's', target: eq(d, h), allowedGivens: ['h'], holes: [UNKNOWN] }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'To solve for d, rewrite until d stands alone.',
    par: { parts: 3, axioms: 8 }, uses: ['P4.2'],
  },

  {
    id: 'P4.7', index: 10, campaign: 'book', world: 3, chapter: 4, title: 'Idempotents',
    method: 'If–then', insight: 'Assume the if, derive the then', source: 'Pinter 4.B4 / 4.F1',
    memo: 'An element equal to its own square must be e. Certify it for every element.',
    lemmaNames: ['the only idempotent is e'],
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'cond', metas: ['x'], premises: [peq(P(x, x), x)], concl: peq(x, e) }, allowedGivens: [] }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'To prove an if–then, assume the if and derive the then.',
    par: { parts: 5, axioms: 6 }, uses: ['P4.2'],
  },
  {
    id: 'P4.8', index: 11, campaign: 'book', world: 3, chapter: 4, title: 'Commuting in a Frame',
    method: 'Computation', insight: 'Take the frame off, use the given, put the frame back', source: 'Pinter 4.C5',
    memo: 'a and b commute. Show their conjugates by any x commute.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b), P(b, a)) }],
    sockets: [{
      id: 's', allowedGivens: ['h'],
      target: { k: 'law', metas: ['x'], l: P(x, a, I(x), x, b, I(x)), r: P(x, b, I(x), x, a, I(x)) },
    }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'Take the frame off, use the given, put the frame back.',
    par: { parts: 6, axioms: 6 }, uses: ['P4.4'],
  },
  {
    id: 'P4.9', index: 12, campaign: 'book', world: 3, chapter: 4, title: 'The Commutator',
    method: 'If–then', insight: 'An if and only if is two if–thens', source: 'Pinter 4.C7',
    memo: 'The commutator xyx⁻¹y⁻¹ equals e exactly when x and y commute. Certify both directions.',
    lemmaNames: ['xy = yx ⟹ xyx⁻¹y⁻¹ = e', 'xyx⁻¹y⁻¹ = e ⟹ xy = yx'],
    atoms: [], givens: [],
    sockets: [
      { id: 's', target: { k: 'cond', metas: ['x', 'y'], premises: [peq(P(x, y), P(y, x))], concl: peq(P(x, y, I(x), I(y)), e) }, allowedGivens: [] },
      { id: 't', target: { k: 'cond', metas: ['x', 'y'], premises: [peq(P(x, y, I(x), I(y)), e)], concl: peq(P(x, y), P(y, x)) }, allowedGivens: [] },
    ],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'An if and only if is two if–thens.',
    par: { parts: 12, axioms: 14 }, uses: ['P4.7'],
  },
  {
    id: 'P4.10', index: 13, campaign: 'book', world: 3, chapter: 4, title: 'One-Sided Inverses',
    method: 'If–then', insight: 'Make the given equal e, then swap the factors', source: 'Pinter 4.D1 + 4.D4',
    memo: 'A product equal to e stays e when its two factors trade places. Certify that.',
    lemmaNames: ['xy = e ⟹ yx = e'],
    atoms: [...atomsAB, { id: 'c', label: 'c', hue: 2 }],
    givens: [{ id: 'h', name: 'h', fact: eq(P(b, a, c), I(a)) }],
    sockets: [
      { id: 's', target: { k: 'cond', metas: ['x', 'y'], premises: [peq(P(x, y), e)], concl: peq(P(y, x), e) }, allowedGivens: [] },
      { id: 't', target: eq(P(c, a, b), I(a)), allowedGivens: ['h'] },
    ],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'A card made on the floor can feed a Theorem machine.',
    par: { parts: 11, axioms: 15 }, uses: ['P4.3', 'P4.7'],
  },
  {
    id: 'P4.11', index: 14, campaign: 'book', world: 3, chapter: 4, title: 'Three Self-Inverse Elements',
    method: 'Uniqueness argument', insight: 'Choosing the cut', source: 'Pinter 4.D7',
    memo: 'Three elements are their own inverses, and ab = c. Show bc = a and ca = b.',
    atoms: [...atomsAB, { id: 'c', label: 'c', hue: 2 }],
    givens: [
      { id: 'ha', name: 'a⁻¹ = a', fact: eq(I(a), a) },
      { id: 'hb', name: 'b⁻¹ = b', fact: eq(I(b), b) },
      { id: 'hc', name: 'c⁻¹ = c', fact: eq(I(c), c) },
      { id: 'hab', name: 'ab = c', fact: eq(P(a, b), c) },
    ],
    sockets: [
      { id: 's', target: eq(P(b, c), a), allowedGivens: ['ha', 'hc', 'hab'] },
      { id: 't', target: eq(P(c, a), b), allowedGivens: ['hb', 'hc', 'hab'] },
    ],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'A product equal to e can be cut anywhere.',
    par: { parts: 9, axioms: 15 }, uses: ['P4.10'],
  },
  {
    id: 'P4.12', index: 15, campaign: 'book', world: 3, chapter: 4, title: 'Four Elements',
    method: 'Contradiction', insight: 'Suppose each product in turn and reach a clash', source: 'Pinter 4.F4',
    memo: 'Every element squares to e, and a, b, e are distinct. Rule out three products.',
    atoms: atomsAB,
    givens: [
      { id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(x, x), r: e } },
      { id: 'na', name: 'h₁', fact: neq(a, e) },
      { id: 'nb', name: 'h₂', fact: neq(b, e) },
      { id: 'nab', name: 'h₃', fact: neq(a, b) },
    ],
    sockets: [
      { id: 's1', target: neq(P(a, b), a), allowedGivens: ['H', 'na', 'nb', 'nab'] },
      { id: 's2', target: neq(P(a, b), b), allowedGivens: ['H', 'na', 'nb', 'nab'] },
      { id: 's3', target: neq(P(a, b), e), allowedGivens: ['H', 'na', 'nb', 'nab'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Suppose the product is each element in turn, and reach a clash.',
    par: { parts: 12, axioms: 28 }, uses: ['P4.2', 'P4.3'],
  },
  {
    id: 'P4.13', index: 16, campaign: 'book', world: 3, chapter: 4, title: 'A Cube Root',
    method: 'Computation', insight: 'A given can match across the seams between copies', source: 'Pinter 4.H7',
    memo: 'The word ddad equals a⁻¹. Show the cube of dad does too.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'd', label: 'd', hue: 3 }],
    givens: [{ id: 'h', name: 'h', fact: eq(P(d, d, a, d), I(a)) }],
    sockets: [{ id: 's', target: eq(rep(P(d, a, d), 3), I(a)), allowedGivens: ['h'] }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'A given can match across the seams between copies.',
    par: { parts: 4, axioms: 4 }, uses: ['P4.1'],
  },
  {
    // Open dock `d = ?`; the answer is d = bc⁻¹a⁻¹ (Pinter 4.A3).
    id: 'P4.s1', index: 17, campaign: 'book', world: 3, chapter: 4, side: true, title: 'Two Equations',
    method: 'Solving an equation', insight: 'Two givens must cooperate: find dac inside ddac', source: 'Pinter 4.A3',
    memo: 'Two equations in one unknown d. Solve for d.',
    atoms: atomsABCD,
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(P(d, d, a), P(b, d, I(c))) },
      { id: 'h2', name: 'h₂', fact: eq(P(a, c, d), P(d, a, c)) },
    ],
    sockets: [{ id: 's', target: eq(d, h), allowedGivens: ['h1', 'h2'], holes: [UNKNOWN] }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'To solve for d, rewrite until d stands alone.',
    par: { parts: 7, axioms: 14 }, uses: ['P4.6'],
  },  {
    // Open dock `d = ?`; the answer is d = a⁶.
    id: 'P4.s2', index: 18, campaign: 'book', world: 3, chapter: 4, side: true, title: 'A Surprising Answer',
    method: 'Solving an equation', insight: 'An e can be written as a power', source: 'Pinter 4.A5',
    memo: 'd squared equals a squared, and d to the fifth is e. Solve for d.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'd', label: 'd', hue: 3 }],
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(P(d, d), P(a, a)) },
      { id: 'h2', name: 'h₂', fact: eq(rep(d, 5), e) },
    ],
    sockets: [{ id: 's', target: eq(d, h), allowedGivens: ['h1', 'h2'], holes: [UNKNOWN] }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'An e can be written as a power.',
    par: { parts: 5, axioms: 5 }, uses: ['P4.s1'],
  },
  {
    // Open dock `d = ?`; the answer is d = b⁻¹a⁻¹.
    id: 'P4.s3', index: 19, campaign: 'book', world: 3, chapter: 4, side: true, title: 'The Hardest Equation',
    method: 'Solving an equation', insight: 'Build your own rewrite rule, then find it across the seams', source: 'Pinter 4.A6',
    memo: 'Two equations, one with a cube. Solve for d in terms of a and b.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'd', label: 'd', hue: 3 }],
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(rep(P(d, a, d), 3), P(b, d)) },
      { id: 'h2', name: 'h₂', fact: eq(P(d, d, a), I(P(d, a))) },
    ],
    sockets: [{ id: 's', target: eq(d, h), allowedGivens: ['h1', 'h2'], holes: [UNKNOWN] }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'Derive a rule, then find it across the seams.',
    par: { parts: 10, axioms: 19 }, uses: ['P4.5', 'P4.13'],
  },
  {
    // Witness dock `∃y. ab = y²`: the hole y occurs twice and takes one term. The witness is ad (Pinter 4.H8).
    id: 'P4.s4', index: 20, campaign: 'book', world: 3, chapter: 4, side: true, title: 'A Square',
    method: 'Witness', insight: 'Exhibit the element: ab = (ad)(ad)', source: 'Pinter 4.H8',
    memo: 'dad equals b. Show ab is the square of some element.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'd', label: 'd', hue: 3 }],
    givens: [{ id: 'h', name: 'h', fact: eq(P(d, a, d), b) }],
    sockets: [{ id: 's', target: eq(P(a, b), P(h, h)), allowedGivens: ['h'], holes: [{ id: 'h' }] }],
    tools: tools({ lift: true, merge: true, schemas: EARNED }), unlocks: [],
    idea: 'To show something exists, exhibit it.',
    par: { parts: 2, axioms: 1 }, uses: ['P4.s3'],
  },
];

/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters: a letter keeps its shape on every card and floor). */
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: letterSlot(id) }));

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {
  'P4.6': [
    {
      title: 'Solving for an unknown',
      body: 'To solve for an unknown, rewrite the given until the unknown stands alone on one side. The other side is the answer. This dock reads $d = ?$. Any proved equation $d = t$ fills it, as long as $t$ does not mention $d$, and the dock then shows the answer you found. With other letters:',
      figures: [{ k: 'math', atoms: AT('xrw'), rows: [
        { seq: ['x', '=', 'rw^-1'], why: 'This fills the dock $x = ?$.' },
        { seq: ['x', '=', 'xrr^-1'], strike: true, why: 'This does not: the answer still mentions $x$.' },
      ] }],
    },
  ],

  'P4.7': [
    {
      title: 'If … then',
      long: true,
      body: 'Many theorems have a hypothesis: **if** $u = v$, **then** $wu = wv$, written $u = v \\implies wu = wv$. To prove an if–then, assume the “if” and derive the “then”. The result does not claim that $u = v$ is true. The condition stays as a premise, unproved, and the theorem promises the conclusion only when the premise holds.',
      example: 'Assume $s = t$. Multiply both sides on the right by $r$: $sr = tr$. That proves $s = t \\implies sr = tr$, without ever claiming $s = t$.',
      nearMiss: 'An assumption is not a fact. Outside the room that grants it, $x_1 = y_1$ cannot be used at all: it is not true for every pair.',
    },
    {
      title: 'The Assume room',
      body: 'An **Assume** room is a painted region with a desk (⊢) inside. The desk hands out the assumption, usable only inside. A fact carried to the gate (⊣) leaves as an if–then, “assumption $\\implies$ fact”. Outside the room, ∀ may bind the Tower.',
      machines: ['room:assume', 'operator'],
      figures: [{ k: 'scene', atoms: AT('uvw'), spec: {
        rooms: [{ x0: -0.2, y0: -0.6, x1: 6.5, y1: 1.6, label: 'ASSUME', kind: 'assume' }],
        machines: [{ x: 0.2, y: 0, config: { kind: 'desk' } }, { x: 2.8, y: 0, config: { kind: 'operator', recipe: { k: 'multiply', side: 'left' } } }, { x: 6, y: 0, config: { kind: 'gate' } }],
        belts: [[[1.2, 0.5], [2.8, 0.5]], [[4.8, 0.5], [6, 0.5]], [[7, 0.5], [9, 0.5]]],
        items: [{ at: [2, 0.5], t: 'u = v' }, { at: [5.4, 0.5], t: 'wu = wv', place: 'sw' }, { at: [8.4, 0.5], t: 'u = v ⟹ wu = wv', place: 'sw', off: [-4, -16] }],
        notes: [
          { at: [0.7, 0.5, 0.9], text: 'The desk (⊢) hands out $u = v$.' },
          { at: [3.8, 0.5, 1], text: 'An Operator multiplies both sides on the left by $w$.' },
          { at: [6.5, 0.5, 0.8], text: 'The gate (⊣) lets it out as an if–then.' },
        ] } }],
    },
  ],

  'P4.8': [
    {
      title: 'Conjugates',
      body: 'For elements $g$ and $u$, the element $gug^{-1}$ is the **conjugate** of $u$ by $g$. Conjugates behave like the elements they come from. This order shows one instance: if $a$ and $b$ commute, then their conjugates by any $x$ commute too.',
    },
    {
      title: 'Insert a pair',
      body: 'A Rewriter can insert a pair $uu^{-1}$ or $u^{-1}u$ at any gap in a word, either end included, and you choose $u$. The pair equals $e$, so the value does not change.',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { seq: ['p', '=', { t: 'p(qq^-1)', br: [[1, 2, 'inserted pair']] }] },
      ] }],
    },
  ],

  'P4.9': [
    {
      title: 'The commutator',
      body: 'The **commutator** of $x$ and $y$ is $xyx^{-1}y^{-1}$. It measures how far $x$ and $y$ are from commuting. This order proves the exact link in both directions, one dock for each.',
    },
    {
      title: 'If and only if',
      body: 'A statement “$P$ if and only if $Q$” is two if–thens: $P \\implies Q$ and $Q \\implies P$. Each is proved separately, and each needs its own Assume room. Save both: the Lemma Book keeps them for later.',
      machines: ['room:assume', 'lemmabook'],
    },
  ],

  'P4.10': [
    {
      title: 'One-sided inverses',
      body: 'If $uv = e$, then $v$ is an inverse of $u$ from the right and $u$ is an inverse of $v$ from the left. In a group one side is enough. The first dock says so in a general form: a product of two elements that equals $e$ still equals $e$ when its two factors trade places. The second dock uses the given $h$.',
    },
    {
      title: 'Cards on the floor',
      body: 'When ∀ finishes, its output is a card: a theorem that now exists on your floor. A belt can carry that card to the card port of a Theorem machine set to “routed”, and the machine applies it like any other theorem. The same card can also go to a dock. Equations travel the same way: one belted into a Rewriter’s rule port is used as a rewrite rule.',
      machines: ['theorem'],
    },
  ],

  'P4.11': [
    {
      title: 'Elements that undo themselves',
      body: 'An element with $x^{-1} = x$ undoes itself. In V₄ every element is like this. In its table, the product of any two different elements other than $e$ is the third one.',
      figures: [{ k: 'table', group: 'V₄' }],
    },
    {
      title: 'Reuse your saved lemma',
      body: 'Your saved lemmas are recipes. Pick one in a Theorem machine, just as you pick an earned theorem. The Lemma Book (L) lists them all.',
      machines: ['theorem', 'lemmabook'],
    },
  ],

  'P4.12': [
    {
      title: 'Proof by contradiction',
      long: true,
      body: 'To show a statement is false, suppose it is true and follow the consequences until two facts clash: some $u = v$ alongside $u \\neq v$. Such a clash is a **contradiction**, written ⊥ (read “bottom”: the impossible). Valid steps from true statements never reach ⊥, so the supposition must have been false, and its negation is proved.',
      figures: [{ k: 'math', atoms: AT('uv'), rows: [{ seq: ['u', '=', 'v', ',', 'u', '≠', 'v', '⟹', '⊥'], why: 'An equation and its negation together give ⊥.' }] }],
    },
    {
      title: 'The Suppose room',
      body: 'A **Suppose** room’s desk hands you the supposition. A Joiner set to **clash** takes an equation and its negation and makes ⊥. The gate turns ⊥ into the opposite of the supposition.',
      machines: ['room:suppose', 'joiner'],
      figures: [{ k: 'scene', atoms: AT('pqr'), spec: {
        scale: 0.75,
        rooms: [{ x0: -0.3, y0: -0.6, x1: 8.5, y1: 2.1, label: 'SUPPOSE', kind: 'suppose' }],
        machines: [
          { x: 0, y: 0, config: { kind: 'desk' } }, { x: 2, y: 0, config: { kind: 'operator', recipe: { k: 'multiply', side: 'right' } } },
          { x: 5, y: 0, config: { kind: 'joiner', recipe: { k: 'clash' } } }, { x: 8, y: 0, config: { kind: 'gate' } },
        ],
        belts: [[[1, 0.5], [2, 0.5]], [[4, 0.5], [5, 0.5]], [[3.2, 1.5], [5, 1.5]], [[7, 0.5], [8, 0.5]], [[9, 0.5], [10.4, 0.5]]],
        items: [
          { at: [1.5, 0.5], t: 'p = q', off: [8, 30] }, { at: [4.5, 0.5], t: 'pr = qr', off: [8, 22] }, { at: [3.8, 1.5], t: 'pr ≠ qr', place: 'sw' },
          { at: [7.5, 0.5], t: '⊥', off: [10, 22] }, { at: [9.8, 0.5], t: 'p ≠ q', place: 'sw' },
        ],
        notes: [
          { at: [0.5, 0.5, 0.55], text: 'The desk hands out the supposition, $p = q$.' },
          { at: [6, 1, 1], text: 'A result clashes with a known fact, $pr \\neq qr$: the Joiner makes ⊥.' },
          { at: [8.5, 0.5, 0.8], text: 'The gate lets out the opposite: $p \\neq q$.' },
        ] } }],
    },
  ],

  'P4.13': [
    {
      title: 'Powers are copies',
      body: 'Before chapter 10 a power is shorthand for a word: $(pq)^3$ means the block $pq$ written three times, $pqpqpq$. The letters interleave. They do not sort.',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { seq: ['(pq)^3', '=', { t: '(pq)(pq)(pq)', br: [[0, 3, '3 copies', 'over']] }] },
        { seq: ['(pq)^3', '=', 'p^3q^3'], strike: true, why: 'Only true when $p$ and $q$ commute.' },
      ] }],
    },
  ],

  'P4.s1': [
    {
      title: 'Right cancellation',
      body: 'Cancellation works from either end. A term shared at the **right** end of both sides can be removed too. The Theorem machine for cancellation has a toggle for the side.',
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { label: 'right cancellation', seq: [{ t: 'qp', br: [[1, 2, 'shared', 'over']] }, '=', { t: 'rp', br: [[1, 2, 'shared', 'over']] }, '⟹', 'q', '=', 'r'] },
      ] }],
    },
  ],

  'P4.s2': [
    {
      title: 'One unknown, two equations',
      body: 'Both givens are about the same unknown $d$. The first compares its square with $a^2$. The second says that five copies of $d$ make $e$. Neither one says what $d$ is on its own. As in the earlier orders, the dock accepts any answer that does not mention $d$.',
    },
  ],

  'P4.s3': [
    {
      title: 'The rule port',
      body: 'Any equation on a belt can serve as a rewrite rule. Belt it into a Rewriter’s rule port, on its north side, and the Rewriter uses it like a recipe. One equation can feed several Rewriters, so you can use it more than once.',
      figures: [{ k: 'scene', atoms: AT('pqr'), spec: {
        machines: [{ x: 0, y: 1, config: { kind: 'spool' } }, { x: 3, y: 1, config: { kind: 'rewriter', recipe: { k: 'routed' }, dir: 'fwd' } }],
        belts: [[[3.5, -0.6], [3.5, 1]], [[1, 1.5], [3, 1.5]], [[5, 1.5], [6.6, 1.5]]],
        items: [{ at: [3.5, 0.1], t: 'pq = e', off: [30, 4] }, { at: [2, 1.5], t: 'rpq = rpq', place: 'sw' }, { at: [5.9, 1.5], t: 'rpq = r' }],
        notes: [
          { at: [3.5, -0.6, 0], text: 'An equation you have proved arrives at the **rule port**, here $pq = e$.' },
          { at: [6.6, 1.5, 0], text: 'The Rewriter uses it like a recipe: it rewrites $pq$ to $e$, so $rpq = r$.' },
        ] } }],
    },
  ],

  'P4.s4': [
    {
      title: 'Showing that something exists',
      body: 'Some goals say “there is a $y$ with …”. The dock shows the statement with a gap for $y$. Prove the statement for one particular element, and that element fills the gap. The gap may appear more than once, and it stands for the same element each time. With other letters, the dock $py = yp$ is filled by $y = pp$:',
      figures: [{ k: 'math', atoms: AT('p'), rows: [
        { seq: [{ t: 'p(pp)', br: [[1, 2, '$y$']] }, '=', { t: '(pp)p', br: [[0, 1, '$y$']] }], why: 'A Spool on $ppp$ proves it.' },
      ] }],
    },
  ],
};
