// THE BOOK · World 10 — Equivalence Relations (Pinter 12). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// Phase-A levels only: P12.2 (witness docks) and P12.s1 (exponent holes). P12.1 Same Coset needs Members (a Subgroup Tower) and is
// left as a placeholder in LEVELS, in campaign order.
//
// Notation: P12.2 is words (no exponents; the power imports are still in its toolset, as the book has handed them out). P12.s1 uses pow nodes with ℤ exponents: c^n is a pow node, n a ℤ Tower.
// Holes: P12.2 has element holes (`∃g. a = g p g⁻¹`); P12.s1 has ℤ holes (`c^?`), both open docks (SocketDecl.holes).
// Multi-desk rooms: P12.s1 trans is a two-desk Assume room. The saved lemmas it relies on are the player's own: double inverse (P4.4)
// and negative power (P10.1).
// Toolset: lift, merge, suppose, the earned cancel / witness / socks; P12.s1 also lists the power imports handed out by P10.4.
import type { HoleDecl, LevelManifest, Monomial, Pallet, PatFact, Poly, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
// Exponents: canonical polynomials written by hand (sparse, sorted, decimal-string coefficients).
const zm = (id: string): Monomial[number] => ({ ref: { k: 'zmeta', id }, degree: 1 });
const Z = (coefficient: number, ...monomial: Monomial): Poly => [{ coefficient: String(coefficient), monomial }];
const ZM = (id: string): Poly => Z(1, zm(id));
/** base^exp, one factor of its enclosing word (a pow node, never expanded). */
const PW = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });
const a = A('a'), b = A('b'), p = A('p'), c = A('c'), d = A('d');
const x = M('x'), y = M('y'), z = M('z'), g = M('g');
/** The witness hole of an `∃g.` dock: any element built from the level's letters. */
const WITNESS: HoleDecl = { id: 'g' };
/** The exponent hole of a `c^?` dock. */
const EXPONENT: HoleDecl = { id: 'k', sort: 'Z' };

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];

export const LEVELS: LevelManifest[] = [
  // P12.1 Same Coset — needs Members (Subgroup Tower, closure recipes). Not authored here.
  {
    // Relation: a ~ b means a = g b g⁻¹ for some g. Words. Docks are witness docks (element holes), no multi-desk room needed.
    // refl: Spool aaa⁻¹, cancel on the left rail: a = aaa⁻¹ (g = a).
    // symm [h₁ : a = cbc⁻¹]: × c⁻¹ on the left, × c on the right, cancel twice on the right rail, swap: b = c⁻¹ac (g = c).
    // trans [h₁, h₂ : b = dpd⁻¹]: h₁ with b ⟶ dpd⁻¹ (h₂), then d⁻¹c⁻¹ ⟶ (cd)⁻¹ (inverse of a product): a = (cd)p(cd)⁻¹ (g = cd).
    id: 'P12.2', index: 51, campaign: 'book', world: 10, chapter: 12, title: 'Conjugacy',
    method: 'Equivalence relation', source: 'Pinter 12.D3',
    insight: 'Each property needs a conjugator: a (or e) for reflexive, c⁻¹ for symmetric, and the product cd for transitive.',
    memo: 'a is conjugate to b when a = gbg⁻¹ for some g. Prove the three properties.',
    atoms: [
      { id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'p', label: 'p', hue: 2 },
      { id: 'c', label: 'c', hue: 3 }, { id: 'd', label: 'd', hue: 4 },
    ],
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(a, P(c, b, I(c))) },
      { id: 'h2', name: 'h₂', fact: eq(b, P(d, p, I(d))) },
    ],
    sockets: [
      { id: 's1', target: eq(a, P(g, a, I(g))), allowedGivens: [], holes: [WITNESS] },
      { id: 's2', target: eq(b, P(I(g), a, g)), allowedGivens: ['h1'], holes: [WITNESS] },
      { id: 's3', target: eq(a, P(g, p, I(g))), allowedGivens: ['h1', 'h2'], holes: [WITNESS] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW] }), unlocks: [],
    idea: 'To show something exists, build it.',
    par: { parts: 9, axioms: 19 }, uses: ['P4.5', 'P4.s4'],
  },
  {
    // Notation: c^n is a pow node, n a ℤ Tower; c is a level constant. ℤ holes: the exponent of the conclusion.
    // refl (k = 0): Spool x₁x₁⁻¹ → cancel on the right rail → power.zero backwards (x := c): x₁x₁⁻¹ = c⁰.
    // symm (k = −n): Assume x₁y₁⁻¹ = cⁿ · invert → inverse of a product → double inverse (saved) → negative power backwards (saved): y₁x₁⁻¹ = c⁻ⁿ.
    // trans (k = n + m): two-desk Assume · product of the desks → cancel y₁⁻¹y₁ → power.add: x₁z₁⁻¹ = cⁿ⁺ᵐ.
    id: 'P12.s1', index: 52, campaign: 'book', world: 10, chapter: 12, side: true, title: 'Differ by a Power',
    method: 'Equivalence relation', source: 'Pinter 12.D6',
    insight: 'Differing by a power of c is an equivalence relation: the exponents are 0, −n and n + m.',
    memo: 'x and y are related when xy⁻¹ is a power of c. Find the exponent each property needs.',
    atoms: [{ id: 'c', label: 'c', hue: 0 }],
    givens: [],
    sockets: [
      { id: 's1', target: { k: 'law', metas: ['x'], l: P(x, I(x)), r: PW(c, ZM('k')) }, allowedGivens: [], holes: [EXPONENT] },
      {
        id: 's2', allowedGivens: [], holes: [EXPONENT],
        target: { k: 'cond', metas: ['x', 'y', 'n'], premises: [peq(P(x, I(y)), PW(c, ZM('n')))], concl: peq(P(y, I(x)), PW(c, ZM('k'))) },
      },
      {
        id: 's3', allowedGivens: [], holes: [EXPONENT],
        target: {
          k: 'cond', metas: ['x', 'y', 'z', 'n', 'm'],
          premises: [peq(P(x, I(y)), PW(c, ZM('n'))), peq(P(y, I(z)), PW(c, ZM('m')))],
          concl: peq(P(x, I(z)), PW(c, ZM('k'))),
        },
      },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW] }), unlocks: [],
    idea: 'An exponent can be an unknown to solve for.',
    par: { parts: 19, axioms: 24 }, uses: ['P4.4', 'P10.1'],
  },
];

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
void y; void z; void AT;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P12.2': [
    {
      title: 'Conjugate elements',
      body: 'Elements $u$ and $v$ of a group are **conjugate** when $u = gvg^{-1}$ for some element $g$. The group splits into classes of conjugate elements. In each dock the element $g$ is left blank, shown as ?, and the same blank stands for the same element each time. You fill it by proving the equation for one particular $g$ built from the letters you have.',
    },
    {
      title: 'Equivalence relations',
      body: 'A relation is an **equivalence relation** when it is reflexive (everything is related to itself), symmetric (if $u$ is related to $v$, then $v$ is related to $u$) and transitive (if $u$ is related to $v$ and $v$ to $w$, then $u$ to $w$). Conjugacy is one. Each dock checks one of the three properties.',
    },
  ],

  'P12.s1': [
    {
      title: 'Differing by a power',
      body: 'Fix an element $c$. Call $x$ and $y$ related when $xy^{-1} = c^n$ for some integer $n$. This is an equivalence relation, and each dock states one of its three properties with the exponent left blank (?). The blank may use the integer variables named in the premises of the dock. Your saved lemmas are recipes here too.',
    },
  ],
};
