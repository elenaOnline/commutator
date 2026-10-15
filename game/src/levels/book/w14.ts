// THE BOOK · World 14 — The Fundamental Homomorphism Theorem (Pinter 16). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// P16.1 (Fibres Are Cosets, a Hom Tower; saved as the fibre lemma ⟹ / ⟸) and P16.2 (The Fundamental Theorem, the campaign finale,
// restated per reviews/synthesis-adversary.md M1: two level homs f : G → K and π : G → Q with the same kernel; the fibre lemma is used at
// both, in opposite directions) are phase C. The three side orders P16.s1–s3 are equational (phase A).
//
// Notation (state per level):
//  · P16.s1 is words and inverses only (no exponents).
//  · P16.s2 uses pow nodes: x³, x⁻², (x³)² are pow nodes, and the press is used in its power shape (`∀x. x⁶ = e` for |G| = 6).
//  · P16.s3 uses pow nodes with a ℤ Tower n₁: aⁿ is a pow node.
// Toolset: lift, merge, suppose, press (P13.1), the earned cancel / witness / socks, and the power imports handed out by P10.4.
// P16.s1 relies on the player's saved double inverse (P4.4).
import type { Card, LevelManifest, Monomial, Pallet, PatFact, Poly, SortRef, StructBinder, Term, Toolset } from '../../kernel/types';
import type { ConceptCard } from '../cards';

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
/** Homomorphism levels also list the import hom.pow (from P14.3 on). */
const W14H = (): Toolset => tools({ lift: true, merge: true, suppose: true, press: true, schemas: [...EARNED, ...POW, 'hom.pow'] });

const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
const eS = (s: string): Term => ({ k: 'e', s });
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
/** ∀S, T groups. ∀f : S → T (a Hom Tower generalized). */
const S: SortRef = { k: 'sortmeta', id: 'S' };
const HOM: StructBinder[] = [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: S, cod: { k: 'sortmeta', id: 'T' } }];
const fT = (t: Term): Term => app('f', t);
const homCond = (premises: PatFact[], concl: PatFact): Card => ({ k: 'cond', metas: ['a', 'b'], premises, concl, binds: HOM, metaSorts: { a: S, b: S } });
/** P16.2: G, and two homomorphisms out of it, f : G → K and π : G → Q. */
const GKQ = {
  sorts: [{ id: 'G', kind: 'group' as const, label: 'G' }, { id: 'K', kind: 'group' as const, label: 'K' }, { id: 'Q', kind: 'group' as const, label: 'Q' }],
  maps: [{ id: 'f', label: 'f', args: ['G'], res: 'K', kind: 'hom' as const }, { id: 'pi', label: 'π', args: ['G'], res: 'Q', kind: 'hom' as const }],
};
const condG = (metas: string[], premises: PatFact[], concl: PatFact): Card => ({ k: 'cond', metas, premises, concl, metaSorts: Object.fromEntries(metas.map((m) => [m, 'G'])) });

export const LEVELS: LevelManifest[] = [
  {
    // Hom Tower f₁ : G₁ → K₁, element Towers a₁, b₁ in G₁. Two Assume rooms.
    //  ⟹: desk f(a₁) = f(b₁) · Spool f(a₁b₁⁻¹) → hom law → your f(x⁻¹) = f(x)⁻¹ at f₁ → desk (f(a₁) ⟶ f(b₁)) → cancel → gate → ∀.
    //  ⟸: desk f(a₁b₁⁻¹) = e → hom law → your f(x⁻¹) = f(x)⁻¹ at f₁ → multiply right by f(b₁) → cancel → pop → gate → ∀.
    // Both ∀ outputs are saved: the fibre lemma ⟹ and ⟸, for every homomorphism.
    id: 'P16.1', index: 67, campaign: 'book', world: 14, chapter: 16, title: 'Fibres Are Cosets',
    method: 'Preservation', source: 'Pinter 16 Theorem 1',
    insight: 'f(a) = f(b) and f(ab⁻¹) = e say the same thing: two elements have the same image exactly when they lie in the same coset of the kernel.',
    memo: 'Let f be any homomorphism. Show f(a) = f(b) exactly when f(ab⁻¹) = e.',
    lemmaNames: ['fibre lemma ⟹', 'fibre lemma ⟸'],
    atoms: [], givens: [],
    sockets: [
      { id: 'fwd', target: homCond([peq(fT(u), fT(v))], peq(fT(P(u, I(v))), eS('T'))), allowedGivens: [] },
      { id: 'bwd', target: homCond([peq(fT(P(u, I(v))), eS('T'))], peq(fT(u), fT(v))), allowedGivens: [] },
    ],
    tools: W14H(), unlocks: [],
    idea: 'Same image means same coset of the kernel.',
    par: { parts: 17, axioms: 14 }, uses: ['P9.4', 'P14.1'],
  },
  {
    // Level homs f : G → K, π : G → Q with the same kernel (givens K1, K2). Element Towers a₁, b₁ in G. Two Assume rooms.
    //  wd:  desk π(a₁) = π(b₁) → your fibre ⟹ at π → Theorem K2 at a₁b₁⁻¹ → your fibre ⟸ at f → gate → ∀.
    //  inj: desk f(a₁) = f(b₁) → your fibre ⟹ at f → Theorem K1 at a₁b₁⁻¹ → your fibre ⟸ at π → gate → ∀.
    id: 'P16.2', index: 68, campaign: 'book', world: 14, chapter: 16, title: 'The Fundamental Theorem',
    method: 'If–then', source: 'Pinter 16 Theorem 2 (restated without the induced map)',
    insight: 'Your fibre lemma, used at π and then at f, moves a question about images into the shared kernel and back out. That is the whole content of G/ker f ≅ f(G).',
    memo: 'f and π have the same kernel. Show they identify exactly the same elements.',
    atoms: [], ...GKQ,
    givens: [
      { id: 'K1', name: 'ker f ⊆ ker π', fact: condG(['x'], [peq(app('f', x), eS('K'))], peq(app('pi', x), eS('Q'))) },
      { id: 'K2', name: 'ker π ⊆ ker f', fact: condG(['x'], [peq(app('pi', x), eS('Q'))], peq(app('f', x), eS('K'))) },
    ],
    sockets: [
      { id: 'wd', target: condG(['a', 'b'], [peq(app('pi', u), app('pi', v))], peq(app('f', u), app('f', v))), allowedGivens: ['K2'] },
      { id: 'inj', target: condG(['a', 'b'], [peq(app('f', u), app('f', v))], peq(app('pi', u), app('pi', v))), allowedGivens: ['K1'] },
    ],
    tools: W14H(), unlocks: [],
    idea: 'The Fundamental Homomorphism Theorem, from your own lemmas.',
    par: { parts: 10, axioms: 10 }, uses: ['P16.1', 'P14.1'],
  },
  {
    // Notation: words and inverses, Towers a₁, b₁, x₁, y₁. Relies on the player's saved double inverse (P4.4).
    // s1: Spool a(xy)a⁻¹ → insert a⁻¹a between x and y (right rail). s2: Spool a(bxb⁻¹)a⁻¹ → b⁻¹a⁻¹ ⟶ (ab)⁻¹ (inverse of a product, backwards).
    // s3: Spool a⁻¹(axa⁻¹)(a⁻¹)⁻¹ → cancel a⁻¹a → (a⁻¹)⁻¹ ⟶ a (double inverse) → cancel.
    id: 'P16.s1', index: 69, campaign: 'book', world: 14, chapter: 16, side: true, title: 'Conjugation as an Automorphism',
    method: 'Computation', source: 'Pinter 16.D2–D3',
    insight: 'Conjugating by a respects products, composes as conjugation by ab, and conjugating by a⁻¹ undoes it.',
    memo: 'Conjugation by a is a map from the group to itself. Check three of its properties.',
    lemmaNames: ['conjugation preserves products', 'conjugation by a product', 'conjugation by a⁻¹ undoes a'],
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

void y;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P16.1': [
    {
      title: 'Fibres',
      body: 'Let $f: G → K$ be a homomorphism. The **fibre** of $f$ over an element $k$ of $K$ is the set of all $x$ in $G$ with $f(x) = k$. Two elements lie in the same fibre when they have the same image. This order compares that with the kernel, for every homomorphism at once.',
    },
    {
      title: 'Save both directions',
      body: 'Each dock is one direction of an “exactly when”. Save each ∀ result to the Lemma Book. The last order of the book uses both of them.',
    },
  ],

  'P16.2': [
    {
      title: 'The Fundamental Homomorphism Theorem',
      long: true,
      body: 'Let $f: G → K$ be a homomorphism. Its **range**, $\\operatorname{ran} f$, is the set of all images $f(x)$. The **Fundamental Homomorphism Theorem** says that $G/\\ker f \\cong \\operatorname{ran} f$, read “is isomorphic to”: the quotient by the kernel is the range, up to renaming. The isomorphism matches the coset of $x$ with $f(x)$. Here $\\pi: G → Q$ stands for the natural homomorphism onto $G/\\ker f$, so $\\pi$ and $f$ have the same kernel. The dock **wd** says the matching is well defined: equal cosets give equal images. The dock **inj** says it is one-to-one. It respects products because $f$ and $\\pi$ do, and it reaches every image by definition.',
    },
    {
      title: 'Built from your own lemmas',
      body: 'This proof rests on results you proved and saved. In chapter 4 you showed that the only idempotent is $e$. In chapter 9 that gave $f(e) = e$ for every homomorphism, and then $f(x^{-1}) = f(x)^{-1}$. Those carried the kernel in chapter 14 and the fibre lemma in the last order, saved for every homomorphism.',
    },
    {
      title: 'Where the book goes next',
      long: true,
      body: 'Lagrange’s theorem says the order of a subgroup divides the order of the group. Its partial converses come next. **Cauchy’s theorem** says that if a prime $p$ divides the order of a finite group, then the group has an element of order $p$. The **Sylow theorems** say more. If $p^k$ is the largest power of $p$ that divides the order, then the group has a subgroup of order $p^k$, and any two such subgroups are conjugate. After groups, the book turns to rings and fields.',
    },
  ],

  'P16.s1': [
    {
      title: 'Conjugation by a',
      body: 'For an element $a$, **conjugation** by $a$ sends $x$ to $axa^{-1}$. The three docks show that it respects products, that conjugating by $b$ and then by $a$ is conjugating by $ab$, and that conjugating by $a^{-1}$ undoes it. These are the properties of an **automorphism**: a one-to-one, onto map from the group to itself that respects products.',
    },
  ],

  'P16.s2': [
    {
      title: 'Splitting an element',
      body: 'In a group of order 6, every element $x$ is a product of two of its own powers: one whose square is $e$ and one whose cube is $e$. Pinter states this for groups of order 12. Here the group has order 6. The Lagrange recipe turns $x^{|G|}$ into $e$ when a given states $|G|$.',
    },
  ],

  'P16.s3': [
    {
      title: 'Central powers',
      body: 'An element $a$ is **central** when $ay = ya$ for every $y$. The dock asks that every integer power $a^n$ is also unchanged by conjugation, for all $n$ at once. A Tower for $n$ binds the exponent, so the proof does not depend on one particular $n$.',
    },
  ],
};
