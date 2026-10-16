// THE BOOK · World 8 — Order of Elements (Pinter 10). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
import type { LevelManifest, Monomial, Pallet, PatFact, Poly, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import { letterSlot } from '../../ui/letters';

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
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
const pneq = (l: Term, r: Term): PatFact => ({ k: 'neq', l, r });
// Exponents: canonical polynomials written by hand (sparse, sorted, decimal-string coefficients).
const zm = (id: string): Monomial[number] => ({ ref: { k: 'zmeta', id }, degree: 1 });
const Z = (coefficient: number, ...monomial: Monomial): Poly => [{ coefficient: String(coefficient), monomial }];
/** base^exp, one factor of its enclosing word (a pow node, never expanded). */
const PW = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });
const a = A('a');
/** The exponent consisting of the single ℤ meta `id`. */
const ZM = (id: string): Poly => Z(1, zm(id));
const x = M('x'), y = M('y');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
/** Earned theorems (unique inverse, cancellation, inverse of a product). */
const EARNED = ['cancel', 'witness', 'socks'];


/** Imports as the book hands them out, in order: P10.1 add, zero; P10.2 conjugate; P10.3 multiply, one; P10.4 identity. */
const POW1 = ['power.add', 'power.zero'];
const POW2 = [...POW1, 'power.conjugate'];
const POW3 = [...POW2, 'power.multiply', 'power.one'];
const POW4 = [...POW3, 'power.identity'];
/** 2m + 1, the odd exponent. */
const TWO_M_1: Poly = [{ coefficient: '2', monomial: [zm('m')] }, { coefficient: '1', monomial: [] }];

export const LEVELS: LevelManifest[] = [
  {
    // Notation: powers are pow nodes (x^(n)); the exponent n is a ℤ Tower.
    // Tower x₁, n₁ · Spool xⁿx⁻ⁿ → power.add → power.zero → unique inverse (cut xⁿ | x⁻ⁿ) → ∀ → dock. Saved as "negative power".
    id: 'P10.1', index: 38, campaign: 'book', world: 8, chapter: 10, title: 'Negative Powers',
    method: 'Uniqueness argument',
    insight: 'A product equal to e fixes the inverse. Since x^n·x^(-n) = e, x^(-n) is the inverse of x^n for every integer n, with no case on the sign.',
    source: 'Pinter 10.A3',
    memo: 'Show that each negative power of x undoes the matching positive power.',
    lemmaNames: ['negative powers'],
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'law', metas: ['x', 'n'], l: PW(x, Z(-1, zm('n'))), r: I(PW(x, ZM('n'))) }, allowedGivens: [] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW1] }), unlocks: [],
    idea: 'Exponents can be any integer, and their laws can be proved.',
    par: { parts: 7, axioms: 7 }, uses: ['P4.3'],
  },
  {
    // Notation: powers are pow nodes; a conjugate is the word y⁻¹xy, raised as a unit: (y⁻¹xy)^(n).
    // s: Assume xⁿ = e · Spool (y⁻¹xy)ⁿ → power.conjugate → desk → cancel.
    // t: Assume (y⁻¹xy)ⁿ = e · Spool xⁿ → insert yy⁻¹ at both ends → power.conjugate backwards → desk → cancel.
    id: 'P10.2', index: 39, campaign: 'book', world: 8, chapter: 10, title: 'Conjugates Share an Order',
    method: 'Preservation',
    insight: 'A power of a conjugate is the conjugate of the power, (y⁻¹xy)^n = y⁻¹x^ny, and the frame y⁻¹ … y can be put on or taken off. So x^n = e exactly when (y⁻¹xy)^n = e.',
    source: 'Pinter 10.C4',
    memo: 'Show that x and its conjugate y⁻¹xy reach e at the same powers.',
    lemmaNames: ['conjugates share an order ⟹', 'conjugates share an order ⟸'],
    atoms: [], givens: [],
    sockets: [
      { id: 's', target: { k: 'cond', metas: ['x', 'y', 'n'], premises: [peq(PW(x, ZM('n')), e)], concl: peq(PW(P(I(y), x, y), ZM('n')), e) }, allowedGivens: [] },
      { id: 't', target: { k: 'cond', metas: ['x', 'y', 'n'], premises: [peq(PW(P(I(y), x, y), ZM('n')), e)], concl: peq(PW(x, ZM('n')), e) }, allowedGivens: [] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW2] }), unlocks: [],
    idea: 'Conjugating an element does not change when its powers reach e.',
    par: { parts: 15, axioms: 16 }, uses: ['P4.10'],
  },
  {
    // Open dock `x = (x²)^?` with a ℤ hole k; the answer is k = m + 1. Notation: pow nodes, x^(2m+1) and (x^(2))^(k).
    // Assume x^(2m+1) = e · Spool (x²)^(m+1) → power.multiply → power.add backwards (2m+1, 1) → desk → power.one → gate → ∀.
    id: 'P10.3', index: 40, campaign: 'book', world: 8, chapter: 10, title: 'Odd Order',
    method: 'Exponent arithmetic',
    insight: 'Odd order means x = x^(2m+2), which is (x²)^(m+1): x is a power of x². Splitting x^(2m+2) as x^(2m+1)·x brings in the given.',
    source: 'Pinter 10.D4',
    memo: 'x has odd order. Show that x is a power of its own square.',
    lemmaNames: ['odd order: x is a square'],
    atoms: [], givens: [],
    sockets: [{
      id: 's', allowedGivens: [], holes: [{ id: 'k', sort: 'Z' }],
      target: { k: 'cond', metas: ['x', 'm'], premises: [peq(PW(x, TWO_M_1), e)], concl: peq(x, PW(PW(x, Z(2)), ZM('k'))) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW3] }), unlocks: [],
    idea: 'A dock can ask for a missing exponent.',
    par: { parts: 8, axioms: 7 }, uses: [],
  },
  {
    // Notation: pow nodes x^(3), x^(5). First multi-desk Assume room (two desks).
    // Assume x³ = e, x⁵ = e · Spool x → power.one backwards → power.add backwards (6, −5) → power.multiply backwards (3, 2) →
    // desk 1 → power.identity (tidy off) → your negative power → desk 2 → cancel e·e⁻¹ → gate → ∀.
    id: 'P10.4', index: 41, campaign: 'book', world: 8, chapter: 10, title: 'Orders 3 and 5',
    method: 'Exponent arithmetic',
    insight: 'Since 1 = 2·3 − 5, x = (x³)²·(x⁵)⁻¹, and both factors are e. Two exponents that reach e can reach any combination of them.',
    source: 'Pinter 10.E2',
    memo: 'x³ = e and x⁵ = e. Show that x = e.',
    lemmaNames: ['exponents 3 and 5 force e'],
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'cond', metas: ['x'], premises: [peq(PW(x, Z(3)), e), peq(PW(x, Z(5)), e)], concl: peq(x, e) }, allowedGivens: [] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW4] }), unlocks: [],
    idea: 'An Assume room can hold two assumptions, one desk each.',
    par: { parts: 11, axioms: 10 }, uses: ['P10.1', 'P10.3'],
  },
  {
    // Notation: a² = e is the pow node a^(2) (so the saved conjugate lemma applies); U is stated with x^(2).
    // Tower y₁. Suppose y₁⁻¹ay₁ = e: Spool a → insert yy⁻¹ at both ends → desk → cancel → a = e, clash with a ≠ e.
    // Your conjugate lemma on a² = e (y := y₁); U on both → y₁⁻¹ay₁ = a → multiply left by y₁ → cancel → ∀.
    id: 'P10.5', index: 42, campaign: 'book', world: 8, chapter: 10, title: 'The Only Element of Order 2',
    method: 'Contradiction',
    insight: 'A conjugate of a has the same order as a, and it is not e. If a is the only such element, the conjugate is a itself, so a commutes with every y.',
    source: 'Pinter 10.D6',
    memo: 'a is the only element of order 2. Show that it commutes with every element.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [
      { id: 'h', name: 'a² = e', fact: eq(PW(a, Z(2)), e) },
      { id: 'n', name: 'a ≠ e', fact: { k: 'neq', l: a, r: e } },
      { id: 'U', name: 'only element of order 2', fact: { k: 'cond', metas: ['x'], premises: [peq(PW(x, Z(2)), e), pneq(x, e)], concl: peq(x, a) } },
    ],
    sockets: [{ id: 's', target: { k: 'law', metas: ['y'], l: P(a, y), r: P(y, a) }, allowedGivens: ['h', 'n', 'U'] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW4] }), unlocks: [],
    idea: 'Conjugation, contradiction and a uniqueness card, in one proof.',
    par: { parts: 12, axioms: 15 }, uses: ['P10.2', 'P4.12'],
  },
  {
    // Side order. Notation: pow nodes. Assume xⁿ = e · Spool x^(nk) → power.multiply backwards (n, k) → desk → power.identity → gate → ∀.
    id: 'P10.s1', index: 43, campaign: 'book', world: 8, chapter: 10, side: true, title: 'Multiples of an Exponent',
    method: 'Exponent arithmetic',
    insight: 'x^(nk) = (x^n)^k. If x^n = e then (x^n)^k = e^k = e, so every multiple of an exponent for e is an exponent for e.',
    source: 'Pinter ch. 10, Theorem 5',
    memo: 'If a power of x is e, so is every multiple of that power. Prove it, and save it.',
    lemmaNames: ['multiples of an exponent for e'],
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'cond', metas: ['x', 'n', 'k'], premises: [peq(PW(x, ZM('n')), e)], concl: peq(PW(x, Z(1, zm('k'), zm('n'))), e) }, allowedGivens: [] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW4] }), unlocks: [],
    idea: 'Every multiple of an exponent for e is again one.',
    par: { parts: 8, axioms: 5 }, uses: ['P10.3'],
  },
  {
    // Side order. Notation: pow nodes. Assume (xy)ⁿ = e · Spool (yx)ⁿ → insert x⁻¹x before y → power.conjugate → desk → cancel.
    id: 'P10.s2', index: 44, campaign: 'book', world: 8, chapter: 10, side: true, title: 'ab and ba',
    method: 'Preservation',
    insight: 'yx is the conjugate x⁻¹(xy)x of xy, so (yx)^n = x⁻¹(xy)^nx, and a conjugate of e is e.',
    source: 'Pinter 10.C6',
    memo: 'If a power of xy is e, the same power of yx is e. Prove it for every exponent.',
    lemmaNames: ['xy and yx share an order'],
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'cond', metas: ['x', 'y', 'n'], premises: [peq(PW(P(x, y), ZM('n')), e)], concl: peq(PW(P(y, x), ZM('n')), e) }, allowedGivens: [] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW4] }), unlocks: [],
    idea: 'Products xy and yx have the same order.',
    par: { parts: 9, axioms: 8 }, uses: ['P10.2', 'P4.10'],
  },
];


/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters: a letter keeps its shape on every card and floor). */
const AT = (str: string): AtomSpec[] => [...str].map((id) => ({ id, label: id, hue: letterSlot(id) }));
/** Tower variables: TW('xy') → x, y in the variable look (∈G, or ∈ℤ for exponents). */
const TW = (str: string, sort: 'G' | 'Z' = 'G'): AtomSpec[] => [...str].map((id) => ({ id, label: id, hue: letterSlot(id), sort }));
// Card figures draw exponents as numbers: a figure's letters are elements, so u^(3) renders and u^(n) would not.

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {
  'P10.1': [
    {
      title: 'Integer exponents',
      body: 'The power $u^k$ means $k$ copies of $u$ multiplied together, and $u^0 = e$. A negative exponent counts copies of the inverse: $u^{-2} = u^{-1}u^{-1}$. In this chapter an exponent can be any integer. Write $k \\in ℤ$, read “$k$ is an element of ℤ”, where ℤ is the set of integers.',
      figures: [{ k: 'math', atoms: TW('u'), rows: [
        { seq: ['u^(3)', '=', 'uuu'] },
        { seq: ['u^(0)', '=', 'e'] },
        { seq: ['u^(-2)', '=', 'u^-1u^-1'] },
      ] }],
    },
    {
      title: 'Integer Towers and imported laws',
      body: 'An integer Tower declares a variable $n \\in ℤ$ that can appear only in exponents. Two laws of exponents are imported: **product of powers**, $u^mu^n = u^{m+n}$, and **zeroth power**, $u^0 = e$. They are proved elsewhere by counting copies, and the checker trusts them.',
      machines: ['tower'],
      figures: [{ k: 'scene', spec: {
        machines: [{ x: 0, y: 0, config: { kind: 'tower', label: 'x', sort: 'G' } }, { x: 1.8, y: 0, config: { kind: 'tower', label: 'n', sort: 'Z' } }],
        notes: [
          { at: [0.5, 0.5, 1.65], text: 'An element Tower: $x \\in G$.' },
          { at: [2.3, 0.5, 1.65], text: 'An integer Tower: $n \\in ℤ$, for exponents.' },
        ] } }],
    },
    {
      title: 'A law you prove yourself',
      body: 'Not every law of exponents is imported. When a dock asks for one that is not, prove it. Then save it from the ∀ machine, and it becomes a recipe in every later order.',
      machines: ['forall', 'lemmabook'],
    },
  ],

  'P10.2': [
    {
      title: 'Order, written with powers',
      body: 'The **order** of $x$ is the least positive $n$ with $x^n = e$, and infinite if there is none. The integers $n$ with $x^n = e$ are exactly the multiples of the order (only $0$ if it is infinite). So two elements have the same order exactly when the same integers $n$ give $e$ for both. “Same order” is therefore two if–thens, one for each direction.',
    },
    {
      title: 'Power of a conjugate',
      body: 'The imported law **power of a conjugate** says $(u^{-1}vu)^n = u^{-1}v^nu$ for every integer $n$. Its mirror image, $(uvu^{-1})^n = uv^nu^{-1}$, is chosen with the side toggle. At $n = 3$ you can see why it holds.',
      figures: [{ k: 'math', atoms: [...AT('pq'), ...TW('n', 'Z')], rows: [
        { seq: ['(p^-1qp)^(n)', '=', 'p^-1q^(n)p'], why: 'The law.' },
        { seq: ['(p^-1qp)^(3)', '=', { t: 'p^-1q(pp^-1)q(pp^-1)qp', br: [[2, 3, '$e$'], [4, 5, '$e$']] }] },
        { seq: ['=', 'p^-1q^(3)p'], why: 'At $n = 3$: the inner pairs cancel.' },
      ] }],
    },
  ],

  'P10.3': [
    {
      title: 'Odd exponents',
      body: 'Every odd integer can be written $2m + 1$ for some integer $m$. That turns “odd” into an exponent the checker can compute with. Two more laws are imported here, **power of a power** and **first power**:',
      figures: [{ k: 'math', atoms: [...TW('u'), ...TW('ab', 'Z')], rows: [
        { label: 'power of a power', seq: ['(u^(a))^(b)', '=', 'u^(ab)'] },
        { label: 'first power', seq: ['u^(1)', '=', 'u'] },
      ] }],
    },
    {
      title: 'Reading a law backwards',
      body: 'A Rewriter can use a law from right to left. To read $u^{a+b}$ as $u^au^b$, the machine must be told how to split the exponent, so its lens asks for $a$ and $b$. Any integer expressions in the Tower variables work.',
      figures: [{ k: 'math', atoms: TW('u'), rows: [
        { seq: ['u^(5)', '=', { t: 'u^(2)u^(3)', br: [[0, 1, '$a = 2$'], [1, 2, '$b = 3$']] }] },
      ] }],
    },
    {
      title: 'An open exponent',
      body: 'A dock may leave an exponent blank, shown as ?. Any exponent that makes the statement true fills it, and the exponent you choose comes from what you prove. The blank may use the variables bound by ∀. Once the dock is delivered it shows the exponent you found.',
    },
  ],

  'P10.4': [
    {
      title: 'Two assumptions',
      body: 'An Assume room can hold more than one assumption, up to three. It has one desk for each, and the gate lets out an if–then with all of them as premises. Premises are not ordered: the gate’s card matches a dock that lists them in any order.',
      machines: ['room:assume'],
      figures: [{ k: 'math', atoms: AT('pqrs'), rows: [
        { seq: ['p', '=', 'q', ',', 'r', '=', 's', '⟹', 'pr', '=', 'qs'], why: 'Two premises, one conclusion.' },
      ] }],
    },
    {
      title: 'Powers of e',
      body: 'The imported law **power of e** says $e^n = e$ for every integer $n$: any number of copies of $e$ is still $e$.',
    },
  ],

  'P10.5': [
    {
      title: 'A given that is an if–then',
      body: 'A given can be an if–then with several premises, such as $V$: for every $x$, if $x^3 = e$ and $x \\neq e$, then $x = c$. A Theorem machine set to a given like this has one input for each premise, and every premise must arrive before it fires.',
      machines: ['theorem'],
      figures: [{ k: 'math', atoms: [...TW('x'), ...AT('c')], rows: [
        { label: 'V', seq: ['x^(3)', '=', 'e', ',', 'x', '≠', 'e', '⟹', 'x', '=', 'c'] },
      ] }],
    },
    {
      title: 'Central elements',
      body: 'An element $c$ is **central** if $cy = yc$ for every $y$ in the group. The central elements form the **centre** of the group, which you met in chapter 5.',
    },
  ],

  'P10.s1': [
    {
      title: 'Multiples',
      body: 'An integer $m$ is a **multiple** of $n$ when $m = nk$ for some integer $k$. Pinter’s Theorem 5 says that $x^m = e$ exactly when $m$ is a multiple of the order of $x$. This order proves the easier half, for an exponent $n$ with $x^n = e$ that need not be the order. Save it: it is a recipe from now on.',
    },
  ],

  'P10.s2': [
    {
      title: 'Same order, different elements',
      body: 'The products $xy$ and $yx$ are usually different elements. In S₃, $(12)(13) = (132)$ but $(13)(12) = (123)$. Yet $xy$ and $yx$ always have the same order. Here both are rotations of a triangle by a third of a turn, one in each direction, so both have order 3.',
    },
  ],
};
