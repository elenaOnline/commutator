// THE BOOK · World 14 — The Fundamental Homomorphism Theorem (Pinter 16). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// Phase-A levels only: the three side orders P16.s1, P16.s2, P16.s3 (equational, no new kernel objects). P16.1 (Fibres Are Cosets) and
// P16.2 (The Fundamental Theorem) need Maps and are left as placeholders in LEVELS, in campaign order.
//
// Notation (state per level):
//  · P16.s1 is words and inverses only (no exponents).
//  · P16.s2 uses pow nodes: x³, x⁻², (x³)² are pow nodes, and the press is used in its power shape (`∀x. x⁶ = e` for |G| = 6).
//  · P16.s3 uses pow nodes with a ℤ Tower n₁: aⁿ is a pow node.
// Toolset: lift, merge, suppose, press (P13.1), the earned cancel / witness / socks, and the power imports handed out by P10.4.
// P16.s1 relies on the player's saved double inverse (P4.4).
import type { LevelManifest, Monomial, Pallet, Poly, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
// Exponents: canonical polynomials written by hand (sparse, sorted, decimal-string coefficients).
const zm = (id: string): Monomial[number] => ({ ref: { k: 'zmeta', id }, degree: 1 });
const Z = (coefficient: number, ...monomial: Monomial): Poly => (coefficient === 0 ? [] : [{ coefficient: String(coefficient), monomial }]);
const ZM = (id: string): Poly => Z(1, zm(id));
/** base^exp, one factor of its enclosing word (a pow node, never expanded). */
const PW = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });
const a = A('a');
const x = M('x'), y = M('y'), u = M('a'), v = M('b');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];
const W14 = (): Toolset => tools({ lift: true, merge: true, suppose: true, press: true, schemas: [...EARNED, ...POW] });

export const LEVELS: LevelManifest[] = [
  // P16.1 Fibres Are Cosets, P16.2 The Fundamental Theorem — need Maps (Hom Tower, two homomorphisms). Not authored here.
  {
    // Notation: words and inverses, Towers a₁, b₁, x₁, y₁. Relies on the player's saved double inverse (P4.4).
    // s1: Spool a(xy)a⁻¹ → insert a⁻¹a between x and y (right rail). s2: Spool a(bxb⁻¹)a⁻¹ → b⁻¹a⁻¹ ⟶ (ab)⁻¹ (inverse of a product, backwards).
    // s3: Spool a⁻¹(axa⁻¹)(a⁻¹)⁻¹ → cancel a⁻¹a → (a⁻¹)⁻¹ ⟶ a (double inverse) → cancel.
    id: 'P16.s1', index: 69, campaign: 'book', world: 14, chapter: 16, side: true, title: 'Conjugation as an Automorphism',
    method: 'Computation', source: 'Pinter 16.D2–D3',
    insight: 'Conjugating by a respects products, composes as conjugation by ab, and conjugating by a⁻¹ undoes it.',
    memo: 'Conjugation by a is a map from the group to itself. Check three of its properties.',
    atoms: [],
    givens: [],
    sockets: [
      { id: 's1', target: { k: 'law', metas: ['a', 'x', 'y'], l: P(u, x, y, I(u)), r: P(u, x, I(u), u, y, I(u)) }, allowedGivens: [] },
      { id: 's2', target: { k: 'law', metas: ['a', 'b', 'x'], l: P(u, v, x, I(v), I(u)), r: P(u, v, x, I(P(u, v))) }, allowedGivens: [] },
      { id: 's3', target: { k: 'law', metas: ['a', 'x'], l: P(I(u), u, x, I(u), I(I(u))), r: x }, allowedGivens: [] },
    ],
    tools: W14(), unlocks: [],
    idea: 'Conjugation is a map that keeps products.',
    par: { parts: 15, axioms: 18 }, uses: ['P4.4', 'P4.5', 'P4.8'],
  },
  {
    // Notation: pow nodes; the press in its power shape. Splitting x into a part killed by 2 and a part killed by 3 (|G| = 6 is the oracle-sized
    // instance of the book's |G| = 12).
    // s1: Spool x₁ → x₁¹ (power.one backwards) → x₁³x₁⁻² (power.add backwards, m = 3, n = −2).
    // s2 [|G| = 6]: Spool (x₁³)² → power.multiply (x₁⁶) → Lagrange.
    // s3 [|G| = 6]: Spool (x₁⁻²)³ → power.multiply (x₁⁻⁶) → power.multiply backwards (m = 6, n = −1: (x₁⁶)⁻¹) → Lagrange → power.identity.
    id: 'P16.s2', index: 70, campaign: 'book', world: 14, chapter: 16, side: true, title: 'Splitting an Element',
    method: 'Lagrange', source: 'Pinter 16.P2 (|G| = 6)',
    insight: 'Since 3 − 2 = 1, x splits into x³ and x⁻², and the group order kills each part after two or three steps.',
    memo: 'A group has six elements. Split each element into a part killed by 2 and one killed by 3.',
    atoms: [],
    givens: [{ id: 's', name: '|G|', fact: { k: 'size', n: 6 } }],
    sockets: [
      { id: 's1', target: { k: 'law', metas: ['x'], l: x, r: P(PW(x, Z(3)), PW(x, Z(-2))) }, allowedGivens: [] },
      { id: 's2', target: { k: 'law', metas: ['x'], l: PW(PW(x, Z(3)), Z(2)), r: e }, allowedGivens: ['s'] },
      { id: 's3', target: { k: 'law', metas: ['x'], l: PW(PW(x, Z(-2)), Z(3)), r: e }, allowedGivens: ['s'] },
    ],
    tools: W14(), unlocks: [],
    idea: 'Write 1 as a sum of exponents.',
    par: { parts: 15, axioms: 12 }, uses: ['P13.2'],
  },
  {
    // Notation: pow nodes, ℤ Tower n₁, Tower x₁; a is a level constant. Spool x₁aⁿx₁⁻¹ → power.conjugate (mirrored) backwards: (x₁ax₁⁻¹)ⁿ
    // → h backwards at y := x₁ (x₁a ⟶ ax₁) inside the base → cancel x₁x₁⁻¹.
    id: 'P16.s3', index: 71, campaign: 'book', world: 14, chapter: 16, side: true, title: 'Powers of a Central Element',
    method: 'Exponent arithmetic', source: 'Pinter 16.L2',
    insight: 'A central element is fixed by conjugation, so conjugating its power just conjugates the base first.',
    memo: 'a commutes with everything. Show conjugating any power of a leaves it unchanged.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [{ id: 'h', name: 'h', fact: { k: 'law', metas: ['y'], l: P(a, y), r: P(y, a) } }],
    sockets: [{
      id: 's', allowedGivens: ['h'],
      target: { k: 'law', metas: ['x', 'n'], l: P(x, PW(a, ZM('n')), I(x)), r: PW(a, ZM('n')) },
    }],
    tools: W14(), unlocks: [],
    idea: 'Conjugating a power means conjugating its base.',
    par: { parts: 7, axioms: 5 }, uses: ['P10.2'],
  },
];

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
void AT; void y;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P16.s1': [
    {
      title: 'Conjugation by a',
      body: 'For an element $a$, **conjugation** by $a$ sends $x$ to $axa^{-1}$. The three docks show that it respects products, that conjugating by $b$ and then by $a$ is conjugating by $ab$, and that conjugating by $a^{-1}$ undoes it. These are the properties of an **automorphism**: a one-to-one, onto map from the group to itself that respects products.',
    },
  ],

  'P16.s2': [
    {
      title: 'One as a sum of exponents',
      body: 'If two exponents add up to 1, an element splits into two powers. For example $2 \\cdot 3 + (-1) \\cdot 5 = 1$, so $x = x^6x^{-5}$. The imported laws $x^mx^n = x^{m+n}$ and $x^1 = x$ work in either direction. The Lagrange recipe turns $x^{|G|}$ into $e$ when a given states $|G|$.',
      figures: [{ k: 'math', atoms: AT('x'), rows: [
        { seq: ['x', '=', 'x^(1)', '=', { t: 'x^(6)x^(-5)', br: [[0, 2, '$6 + (-5) = 1$']] }] },
      ] }],
    },
  ],

  'P16.s3': [
    {
      title: 'Central powers',
      body: 'An element $a$ is **central** when $ay = ya$ for every $y$. The dock asks that every integer power $a^n$ is also unchanged by conjugation, for all $n$ at once. A Tower for $n$ binds the exponent, so the proof does not depend on one particular $n$.',
    },
  ],
};
