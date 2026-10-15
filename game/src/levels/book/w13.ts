// THE BOOK · World 13 — Quotient Groups (Pinter 15). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// Phase-A level only: P15.4 (equational). P15.1 (normal Subgroup Tower), P15.2 and P15.3 (homomorphisms) need Members or Maps and are
// left as placeholders in LEVELS, in campaign order.
//
// Notation: pow nodes. aᵐ and aⁿ are pow nodes with ℤ Towers m₁, n₁; c, d and a are level constants.
// Toolset: lift, merge, suppose, press (P13.1), the earned cancel / witness / socks, and the power imports handed out by P10.4.
import type { LevelManifest, Monomial, Pallet, Poly, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
// Exponents: canonical polynomials written by hand (sparse, sorted, decimal-string coefficients).
const zm = (id: string): Monomial[number] => ({ ref: { k: 'zmeta', id }, degree: 1 });
const Z = (coefficient: number, ...monomial: Monomial): Poly => [{ coefficient: String(coefficient), monomial }];
const ZM = (id: string): Poly => Z(1, zm(id));
/** base^exp, one factor of its enclosing word (a pow node, never expanded). */
const PW = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });
const a = A('a'), c = A('c'), d = A('d');
const z = M('z');
void (null as unknown as Pallet);

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];

export const LEVELS: LevelManifest[] = [
  // P15.1 Coset Multiplication (normal Subgroup Tower), P15.2 An Abelian Quotient, P15.3 Commutators in the Kernel — need Members / Maps.
  {
    // Notation: pow nodes, ℤ Towers m₁, n₁. Two rails, one normal form d c a^(m+n):
    //  l: Spool c aᵐ d aⁿ → Zd backwards at z := aᵐ (aᵐd ⟶ d aᵐ) → Zc at z := d (cd ⟶ dc) → power.add (aᵐaⁿ ⟶ a^(m+n)).
    //  r: Spool d aⁿ c aᵐ → Zc backwards at z := aⁿ (aⁿc ⟶ c aⁿ) → power.add (aⁿaᵐ ⟶ a^(n+m) = a^(m+n)).
    // The Joiner chains the two equations (same right side) → ∀ binds m₁, n₁.
    id: 'P15.4', index: 66, campaign: 'book', world: 13, chapter: 15, title: 'Cyclic Over the Centre',
    method: 'Exponent arithmetic', source: 'Pinter 15.F3',
    insight: 'Central elements slide past any power of a, and m + n = n + m does the rest: both products reach the same normal form.',
    memo: 'c and d commute with everything. Show c·aᵐ and d·aⁿ commute for all m and n.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'c', label: 'c', hue: 1 }, { id: 'd', label: 'd', hue: 2 }],
    givens: [
      { id: 'Zc', name: 'Z_c', fact: { k: 'law', metas: ['z'], l: P(c, z), r: P(z, c) } },
      { id: 'Zd', name: 'Z_d', fact: { k: 'law', metas: ['z'], l: P(d, z), r: P(z, d) } },
    ],
    sockets: [{
      id: 's', allowedGivens: ['Zc', 'Zd'],
      target: { k: 'law', metas: ['m', 'n'], l: P(c, PW(a, ZM('m')), d, PW(a, ZM('n'))), r: P(d, PW(a, ZM('n')), c, PW(a, ZM('m'))) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, press: true, schemas: [...EARNED, ...POW] }), unlocks: [],
    idea: 'Exponent arithmetic: two sums, one normal form.',
    par: { parts: 11, axioms: 7 }, uses: ['P10.4'],
  },
];

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
void AT;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P15.4': [
    {
      title: 'Central elements',
      body: 'An element that commutes with every element is **central**. Its law, $\\forall z.\; pz = zp$, can be applied at any term, including a power such as $u^m$. With other letters, for a central $p$:',
      figures: [{ k: 'math', atoms: [{ id: 'p', label: 'p', hue: 0 }, { id: 'z', label: 'z', hue: 1 }, { id: 'u', label: 'u', hue: 2 }, { id: 'm', label: 'm', hue: 3, sort: 'Z' }], rows: [
        { label: 'the law', seq: ['pz', '=', 'zp'] },
        { label: 'at $z = u^m$', seq: [{ t: 'pu^(m)', br: [[1, 2, '$z$', 'over']] }, '=', { t: 'u^(m)p', br: [[0, 1, '$z$', 'over']] }] },
      ] }],
    },
    {
      title: 'Cyclic over the centre',
      body: 'Let $Z$ be the set of central elements of $G$. Suppose every element of $G$ has the form $za^m$ with $z$ in $Z$, which is what “$G$ modulo $Z$ is cyclic” means. Then $G$ is abelian. This level proves the key step, that two such elements commute, with $c$ and $d$ standing for the central parts.',
    },
  ],
};
