// THE BOOK · World 13 — Quotient Groups (Pinter 15). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// P15.1 (Members: a normal Subgroup Tower), P15.2 and P15.3 (Maps: a level hom π : G → Q into the quotient, whose kernel is the
// normal subgroup, so π(x) = e_Q says x ∈ N), and P15.4 (equational, phase A).
// Cosets never become objects: Na = Nb is written ab⁻¹ ∈ N (Pinter 15 Thm 5), and "G/N has property P" is P over π-images.
// P15.2 and P15.3 use the player's saved commutator lemmas (P4.9) in Q and their saved f(x⁻¹) = f(x)⁻¹ (ch. 9) at π.
//
// Notation: words and inverses in P15.1–P15.3. P15.4: pow nodes; aᵐ and aⁿ are pow nodes with ℤ Towers m₁, n₁; c, d and a are
// level constants.
// Toolset: lift, merge, suppose, press (P13.1), the earned cancel / witness / socks, and the power imports handed out by P10.4;
// sub.e and sub.pow where a subgroup is in scope; hom.pow where a homomorphism is.
import type { Card, LevelManifest, Monomial, Pallet, PatFact, Poly, SubRef, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import { letterSlot } from '../../ui/letters';

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
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const eS = (s: string): Term => ({ k: 'e', s });
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
const x = M('x'), y = M('y');
/** A card's normal-subgroup parameter N (∀N ⊴ G), and memberships in it. */
const Nm: SubRef = { k: 'submeta', id: 'N' };
const pmem = (t: Term): PatFact => ({ k: 'mem', t, sub: Nm });
/** The quotient G/N as a group Q with the natural homomorphism π : G → Q. */
const GQ = { sorts: [{ id: 'G', kind: 'group' as const, label: 'G' }, { id: 'Q', kind: 'group' as const, label: 'Q' }],
  maps: [{ id: 'pi', label: 'π', args: ['G'], res: 'Q', kind: 'hom' as const }] };
const pi = (t: Term): Term => app('pi', t);
const eQ = eS('Q');
const lawGG = (l: Term, r: Term): Card => ({ k: 'law', metas: ['x', 'y'], metaSorts: { x: 'G', y: 'G' }, l, r });
const COMM = P(x, y, I(x), I(y));
void (null as unknown as Pallet);

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];
const W13 = (extra: string[]): Toolset => tools({ lift: true, merge: true, suppose: true, press: true, schemas: [...EARNED, ...POW, ...extra] });

export const LEVELS: LevelManifest[] = [
  {
    // Normal Subgroup Tower N₁, element Towers a₁, b₁, c₁, d₁. Assume room, two membership desks ac⁻¹ ∈ N₁, bd⁻¹ ∈ N₁.
    // closed under conjugation (desk 2 by c₁) → closed under products (desk 1, that) → cancel c⁻¹c inside → inverse of a product
    // backwards inside (d⁻¹c⁻¹ ⟶ (cd)⁻¹) → gate → ∀.
    id: 'P15.1', index: 63, campaign: 'book', world: 13, chapter: 15, title: 'Coset Multiplication',
    method: 'Subgroup test', source: 'Pinter 15 Theorem 2',
    insight: 'Conjugating the second hypothesis by c makes the two memberships fit together: (ac⁻¹)(c·bd⁻¹·c⁻¹) is (ab)(cd)⁻¹. Normality is exactly what allows the conjugation.',
    memo: 'N is normal. Show that multiplying cosets does not depend on the representatives.',
    lemmaNames: ['coset multiplication is well defined'],
    atoms: [],
    givens: [],
    sockets: [{
      id: 's', allowedGivens: [],
      target: { k: 'cond', metas: ['a', 'b', 'c', 'd'], binds: [{ k: 'sub', id: 'N', normal: true }],
        premises: [pmem(P(M('a'), I(M('c')))), pmem(P(M('b'), I(M('d'))))], concl: pmem(P(M('a'), M('b'), I(P(M('c'), M('d'))))) },
    }],
    tools: W13(['sub.e', 'sub.pow']), unlocks: [],
    idea: 'Why the subgroup must be normal for G/N to be a group.',
    par: { parts: 10, axioms: 14 }, uses: ['P4.5', 'P12.1'],
  },
  {
    // Level hom π : G → Q. Towers x₁, y₁ in G. Spool π(x₁y₁x₁⁻¹y₁⁻¹) → D on the right → hom law three times on the left →
    // your f(x⁻¹) = f(x)⁻¹ at π, twice → your commutator ⟸ in Q (P4.9) → ∀.
    id: 'P15.2', index: 64, campaign: 'book', world: 13, chapter: 15, title: 'An Abelian Quotient',
    method: 'Preservation', source: 'Pinter 15 (the commutator example)',
    insight: 'π carries the commutator xyx⁻¹y⁻¹ to the commutator of π(x) and π(y), so your ch. 4 criterion applies inside Q.',
    memo: 'π sends every commutator to e. Show the images of π commute.',
    atoms: [], ...GQ,
    givens: [{ id: 'D', name: 'commutators in ker π', fact: lawGG(pi(COMM), eQ) }],
    sockets: [{ id: 's', target: lawGG(P(pi(x), pi(y)), P(pi(y), pi(x))), allowedGivens: ['D'] }],
    tools: W13(['hom.pow']), unlocks: [],
    idea: 'A quotient is abelian when the kernel holds every commutator.',
    par: { parts: 11, axioms: 8 }, uses: ['P4.9', 'P9.4'],
  },
  {
    // Level hom π : G → Q. Towers x₁, y₁ in G. Spool π(x₁)π(y₁) → A → your commutator ⟹ in Q (P4.9) → your f(x⁻¹) = f(x)⁻¹ at π
    // backwards, twice → hom law backwards three times → ∀.
    id: 'P15.3', index: 65, campaign: 'book', world: 13, chapter: 15, title: 'Commutators in the Kernel',
    method: 'Preservation', source: 'Pinter 15.C7',
    insight: 'The converse runs the same chain backwards: commuting images give a trivial commutator in Q, and the homomorphism law folds it back into π of one word.',
    memo: 'The images of π commute. Show π sends every commutator to e.',
    atoms: [], ...GQ,
    givens: [{ id: 'A', name: 'Q is abelian', fact: lawGG(P(pi(x), pi(y)), P(pi(y), pi(x))) }],
    sockets: [{ id: 's', target: lawGG(pi(COMM), eQ), allowedGivens: ['A'] }],
    tools: W13(['hom.pow']), unlocks: [],
    idea: 'The kernel of an abelian quotient holds every commutator.',
    par: { parts: 11, axioms: 8 }, uses: ['P4.9', 'P9.4', 'P15.2'],
  },
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

/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters). A name before a bracket that is not a letter here is a map. */
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: letterSlot(id) }));

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P15.1': [
    {
      title: 'Cosets as memberships',
      body: 'For a subgroup $N$ of $G$, the **coset** $Na$ is the set of all products $na$ with $n$ in $N$. Two cosets are equal, $Na = Nc$, exactly when $ac^{-1} \\in N$. So every statement about equal cosets can be written as a membership, and that is how this world states them. A Normal Subgroup Tower declares $N_1 \\trianglelefteq G$.',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { seq: ['pq^-1', '∈', '⊴N'], why: 'says that the cosets $Np$ and $Nq$ are equal' },
      ] }],
    },
    {
      title: 'Multiplying cosets',
      body: 'The cosets of $N$ become a group $G/N$, read “$G$ modulo $N$”, with the product $Na \\cdot Nb = N(ab)$. That rule must not depend on the names chosen: if $Na = Nc$ and $Nb = Nd$, then $N(ab)$ must equal $N(cd)$. The dock asks for this for every normal subgroup. For a subgroup that is not normal it can fail, for example for a subgroup of order 2 in $S_3$.',
    },
  ],

  'P15.2': [
    {
      title: 'The quotient as a group Q',
      body: 'For a normal subgroup $N$, the map $\\pi(x) = Nx$ from $G$ to $G/N$ is a homomorphism, the **natural homomorphism**. Its kernel is $N$. In this world a group $Q$ and a homomorphism $\\pi: G → Q$ play $G/N$ and the natural homomorphism. So $\\pi(x) = e_Q$ says that $x$ lies in $N$, and statements about $G/N$ become statements about images $\\pi(x)$.',
    },
    {
      title: 'Abelian quotients',
      body: 'A group is **abelian** when any two of its elements commute. The given “commutators in $\\ker \\pi$” says that $\\pi$ sends every commutator $xyx^{-1}y^{-1}$ to $e_Q$, that is, $N$ contains every commutator. The dock says that any two images commute, which is what “$G/N$ is abelian” means. Every lemma you saved about one group applies in any group, $Q$ included.',
    },
  ],

  'P15.3': [
    {
      title: 'The converse',
      body: 'The last order went from commutators in the kernel to an abelian quotient. This one goes back. Together they say that $G/N$ is abelian exactly when $N$ contains every commutator of $G$. A Rewriter can use the homomorphism law backwards, to join two images into one. With other letters:',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { seq: ['h(p)h(q)', '=', 'h(pq)'], why: 'The homomorphism law, read from right to left.' },
      ] }],
    },
  ],

  'P15.4': [
    {
      title: 'Cyclic over the centre',
      body: 'Let $Z$ be the centre of $G$, the set of its central elements. Suppose every element of $G$ has the form $za^m$ with $z$ in $Z$, which is what “$G$ modulo $Z$ is cyclic” means. Then $G$ is abelian. This level proves the key step, that two such elements commute, with $c$ and $d$ standing for the central parts.',
    },
  ],
};
