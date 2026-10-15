// THE BOOK · World 10 — Equivalence Relations (Pinter 12). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// P12.2 (witness docks) and P12.s1 (exponent holes) are phase A. P12.1 Same Coset is the Members level of this world (KERNEL-EXT §4):
// its three docks are cards `∀H ≤ G …` (no level subgroup), proved with a Subgroup Tower H₁ and saved "for every subgroup".
//
// Notation: P12.2 is words (no exponents; the power imports are still in its toolset, as the book has handed them out). P12.s1 uses pow nodes with ℤ exponents: c^n is a pow node, n a ℤ Tower.
// Holes: P12.2 has element holes (`∃g. a = g p g⁻¹`); P12.s1 has ℤ holes (`c^?`), both open docks (SocketDecl.holes).
// Multi-desk rooms: P12.s1 trans is a two-desk Assume room. The saved lemmas it relies on are the player's own: double inverse (P4.4)
// and negative power (P10.1).
// Toolset: lift, merge, suppose, the earned cancel / witness / socks; P12.s1 also lists the power imports handed out by P10.4.
import type { Card, HoleDecl, LevelManifest, Monomial, Pallet, PatFact, Poly, StructBinder, SubRef, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import { letterSlot } from '../../ui/letters';

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

/** P12.1: the subgroup parameter H of a dock (a card `∀H ≤ G …`), and memberships in it. */
const HB: StructBinder[] = [{ k: 'sub', id: 'H', normal: false }];
const HM: SubRef = { k: 'submeta', id: 'H' };
const pmem = (t: Term): PatFact => ({ k: 'mem', t, sub: HM });
const diff = (v: Term, w: Term): Term => P(v, I(w));
const SAME_COSET: Record<'s1' | 's2' | 's3', Card> = {
  // reflexive: ∀H ∀x. xx⁻¹ ∈ H
  s1: { k: 'cond', metas: ['x'], binds: HB, premises: [], concl: pmem(diff(x, x)) },
  // symmetric: ∀H ∀x,y. xy⁻¹ ∈ H ⟹ yx⁻¹ ∈ H
  s2: { k: 'cond', metas: ['x', 'y'], binds: HB, premises: [pmem(diff(x, y))], concl: pmem(diff(y, x)) },
  // transitive: ∀H ∀x,y,z. xy⁻¹ ∈ H, yz⁻¹ ∈ H ⟹ xz⁻¹ ∈ H
  s3: { k: 'cond', metas: ['x', 'y', 'z'], binds: HB, premises: [pmem(diff(x, y)), pmem(diff(y, z))], concl: pmem(diff(x, z)) },
};

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];

export const LEVELS: LevelManifest[] = [
  {
    // No level subgroup: each dock is a card `∀H ≤ G …`, so the proofs run on a Subgroup Tower H₁ and Towers x₁, y₁, z₁, and all three are SAVED.
    // refl: Theorem a subgroup contains e (H₁) → insert x₁x₁⁻¹ at the gap of e: x₁x₁⁻¹ ∈ H₁ → ∀.
    // symm: Assume x₁y₁⁻¹ ∈ H₁ · closed under inverses → inverse of a product → double inverse (saved P4.4): y₁x₁⁻¹ ∈ H₁ → gate → ∀.
    // trans: Assume x₁y₁⁻¹ ∈ H₁ and y₁z₁⁻¹ ∈ H₁ (two desks) · closed under products → cancel y₁⁻¹y₁: x₁z₁⁻¹ ∈ H₁ → gate → ∀.
    id: 'P12.1', index: 50, campaign: 'book', world: 10, chapter: 12, title: 'Same Coset',
    method: 'Equivalence relation', source: 'Pinter 12.D1',
    insight: 'The three properties use the three facts about a subgroup: it contains e, it is closed under inverses, and it is closed under products.',
    memo: 'x and y are related when xy⁻¹ is in H. Prove the three properties.',
    lemmaNames: ['coset relation is reflexive', 'coset relation is symmetric', 'coset relation is transitive'],
    atoms: [], givens: [],
    sockets: [
      { id: 's1', target: SAME_COSET.s1, allowedGivens: [] },
      { id: 's2', target: SAME_COSET.s2, allowedGivens: [] },
      { id: 's3', target: SAME_COSET.s3, allowedGivens: [] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POW, 'sub.e', 'sub.pow'] }), unlocks: [],
    idea: 'Each property of the relation uses one fact about H.',
    par: { parts: 15, axioms: 24 }, uses: ['P5.1', 'P4.4', 'P4.5'],
  },
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

/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters: a letter keeps its shape on every card and floor). */
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: letterSlot(id) }));
void y; void z;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P12.1': [
    {
      title: 'Equivalence relations',
      body: 'A relation is an **equivalence relation** when it is reflexive (everything is related to itself), symmetric (if $u$ is related to $v$, then $v$ is related to $u$) and transitive (if $u$ is related to $v$ and $v$ is related to $w$, then $u$ is related to $w$). Each dock checks one of the three properties.',
    },
    {
      title: 'Related by a subgroup',
      body: 'Let $H$ be a subgroup of $G$. Call $p$ and $q$ related when $pq^{-1} \\in H$. The set of all elements related to $q$ is the **coset** $Hq$, the set of all products $hq$ with $h \\in H$. Cosets are the classes of this relation. The next chapter counts them.',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { seq: ['pq^-1', '∈', 'H'], why: '$p$ and $q$ are related: $p$ lies in the coset $Hq$.' },
      ] }],
    },
    {
      title: 'A Subgroup Tower',
      body: 'To prove a statement for every subgroup, place a Subgroup Tower. It declares one subgroup $H_1$ of $G$, written $H_1 \\le G$ and read “$H_1$ is a subgroup of $G$”. You know nothing about $H_1$ beyond the definition. A ∀ machine binds it, so a saved lemma reads “for every subgroup $H$”. When you use that lemma, the lens asks which subgroup plays $H$.',
    },
  ],

  'P12.2': [
    {
      title: 'Conjugate elements',
      body: 'Elements $u$ and $v$ of a group are **conjugate** when $u = gvg^{-1}$ for some element $g$. In each dock the element $g$ is left blank, shown as ?, and the same blank stands for the same element each time. You fill it by proving the equation for one particular $g$ built from the letters you have.',
    },
    {
      title: 'Conjugacy classes',
      body: 'Conjugacy is an equivalence relation, so it splits a group into classes. In S₃ there are three: $e$ alone, the three flips $(12)$, $(13)$ and $(23)$, and the two rotations $(123)$ and $(132)$. Each dock checks one of the three properties of an equivalence relation.',
    },
  ],

  'P12.s1': [
    {
      title: 'Differing by a power',
      body: 'Fix an element $c$. Call $x$ and $y$ related when $xy^{-1} = c^n$ for some integer $n$. This is an equivalence relation, and each dock states one of its three properties with the exponent left blank (?). The blank may use the integer variables named in the premises of the dock. Your saved lemmas are recipes here too.',
    },
  ],
};
