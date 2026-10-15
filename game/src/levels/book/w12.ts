// THE BOOK · World 12 — Homomorphisms (Pinter 14). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// Phase C (Maps) and phase B (Members). Second groups are K (never H, which names subgroups). The identity of a second group
// is written e_K; a card's binders read "for every group S, T and every homomorphism f : S → T".
//  · P14.1 and P14.3's lemma use the player's saved hom lemmas f(e) = e and f(x⁻¹) = f(x)⁻¹ (ch. 9) at the Tower / level hom.
//  · P14.4 closes with the player's saved commutator ⟸ (P4.9). Its subgroups are M and N (H, K stay free for their usual jobs).
// Notation: words and inverses; P14.3 uses pow nodes (x^(5)), the press in its power shape, and the import hom.pow.
// Toolset: lift, merge, suppose, press (P13.1), the earned cancel / witness / socks, the power imports handed out by P10.4,
// sub.e (earned in P5.1) and sub.pow (imported in ch. 11) where a subgroup is in scope, and hom.pow from P14.3 on.
import type { Card, LevelManifest, Pallet, PatFact, SortRef, StructBinder, SubRef, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import { letterSlot } from '../../ui/letters';

const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const eS = (s: string): Term => ({ k: 'e', s });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
const PW = (base: Term, n: number): Term => ({ k: 'pow', base, exp: [{ coefficient: String(n), monomial: [] }] });
const a = A('a'), b = A('b');
const x = M('x'), y = M('y'), g = M('g');

/** ∀S, T groups. ∀f : S → T — the binders of a card about every homomorphism (a Hom Tower generalized). */
const S: SortRef = { k: 'sortmeta', id: 'S' };
const HOM: StructBinder[] = [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: S, cod: { k: 'sortmeta', id: 'T' } }];
const f = (t: Term): Term => app('f', t);
const eT = eS('T');
const homCond = (metas: string[], premises: PatFact[], concl: PatFact): Card =>
  ({ k: 'cond', metas, premises, concl, binds: HOM, metaSorts: Object.fromEntries(metas.map((m) => [m, S])) });

/** Two groups G, K and a homomorphism f : G → K (P14.2, P14.3). */
const GK = { sorts: [{ id: 'G', kind: 'group' as const, label: 'G' }, { id: 'K', kind: 'group' as const, label: 'K' }],
  maps: [{ id: 'f', label: 'f', args: ['G'], res: 'K', kind: 'hom' as const }] };
const eK = eS('K');

const mem = (t: Term, s: SubRef): Pallet => ({ k: 'mem', t, sub: s });
const pmem = (t: Term, s: SubRef): PatFact => ({ k: 'mem', t, sub: s });
const Ms: SubRef = { k: 'sub', id: 'M' }, Ns: SubRef = { k: 'sub', id: 'N' }, Hs: SubRef = { k: 'sub', id: 'H' };

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];
/** The power imports as the book has handed them out by P10.4 (add, zero; conjugate; multiply, one; identity). */
const POW = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];
/** sub.e is earned in P5.1 and sub.pow imported in ch. 11: listed wherever a subgroup is in scope. */
const SUB = ['sub.e', 'sub.pow'];
const W12 = (extra: string[] = []): Toolset => tools({ lift: true, merge: true, suppose: true, press: true, schemas: [...EARNED, ...POW, ...extra] });

export const LEVELS: LevelManifest[] = [
  {
    // Hom Tower f₁ : G₁ → K₁, element Towers x₁, y₁, g₁ in G₁. Three Assume rooms.
    //  prod: desks f(x₁) = e, f(y₁) = e · Spool f(x₁y₁) → hom law → desk 1, desk 2 (the e's tidy away) → gate → ∀.
    //  inv:  desk f(x₁) = e · Spool f(x₁⁻¹) → your f(x⁻¹) = f(x)⁻¹ at f₁ → desk → insert e, cancel (e⁻¹ = e) → gate → ∀.
    //  conj: desk f(x₁) = e · Spool f(g₁x₁g₁⁻¹) → hom law twice → desk → hom law backwards → cancel → your f(e) = e at f₁ → gate → ∀.
    id: 'P14.1', index: 58, campaign: 'book', world: 12, chapter: 14, title: 'The Kernel',
    method: 'Subgroup test', source: 'Pinter 14 Theorem 2(i)',
    insight: 'Kernel membership is the equation f(x) = e, so the subgroup test and normality become three computations through the homomorphism law, finished by your own ch. 9 lemmas.',
    memo: 'Let f be any homomorphism. Show its kernel is a normal subgroup.',
    atoms: [], givens: [],
    sockets: [
      { id: 'prod', target: homCond(['x', 'y'], [peq(f(x), eT), peq(f(y), eT)], peq(f(P(x, y)), eT)), allowedGivens: [] },
      { id: 'inv', target: homCond(['x'], [peq(f(x), eT)], peq(f(I(x)), eT)), allowedGivens: [] },
      { id: 'conj', target: homCond(['x', 'g'], [peq(f(x), eT)], peq(f(P(g, x, I(g))), eT)), allowedGivens: [] },
    ],
    tools: W12(), unlocks: [],
    idea: 'The kernel of a homomorphism is a normal subgroup.',
    par: { parts: 25, axioms: 21 }, uses: ['P9.3', 'P9.4'],
  },
  {
    // Level hom f : G → K. Spool f(ab⁻¹) → hom law → your f(x⁻¹) = f(x)⁻¹ at f → h (f(a) ⟶ f(b)) → cancel: f(ab⁻¹) = e_K
    // → Theorem T → ab⁻¹ = e → multiply right by b → cancel → a = b.
    id: 'P14.2', index: 59, campaign: 'book', world: 12, chapter: 14, title: 'Trivial Kernel',
    method: 'Preservation', source: 'Pinter 14.C2 (⟸)',
    insight: 'Asking whether f(a) = f(b) forces a = b is asking whether ab⁻¹ lies in the kernel. A trivial kernel answers yes.',
    memo: 'Only e is sent to e. Show f(a) = f(b) forces a = b.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }], ...GK,
    givens: [
      { id: 'T', name: 'ker f = {e}', fact: { k: 'cond', metas: ['x'], premises: [peq(app('f', x), eK)], concl: peq(x, e) } },
      { id: 'h', name: 'h', fact: eq(app('f', a), app('f', b)) },
    ],
    sockets: [{ id: 's', target: eq(a, b), allowedGivens: ['T', 'h'] }],
    tools: W12(), unlocks: [],
    idea: 'A homomorphism with trivial kernel is one-to-one.',
    par: { parts: 9, axioms: 9 }, uses: ['P9.4', 'P14.1'],
  },
  {
    // Level hom f : G → K, |G| = 5, |K| = 3. Tower x₁ in G.
    // Spool f(x₁)⁵ → hom.pow backwards → Lagrange in G inside the frame → your f(e) = e at f: f(x₁)⁵ = e_K.
    // Spool f(x₁)³ → Lagrange in K: f(x₁)³ = e_K. Your P10.4 lemma (x³ = e, x⁵ = e ⟹ x = e) at f(x₁), in K → ∀.
    id: 'P14.3', index: 60, campaign: 'book', world: 12, chapter: 14, title: 'From Five to Three',
    method: 'Lagrange', source: 'Pinter 14.F2',
    insight: 'The order of f(x) divides 5, because f(x)⁵ = f(x⁵) = f(e), and it divides 3 by Lagrange in K. Only 1 divides both.',
    memo: 'G has five elements and K has three. Find every homomorphism f from G to K.',
    atoms: [], ...GK,
    givens: [
      { id: 'sG', name: '|G|', fact: { k: 'size', n: 5 } },
      { id: 'sK', name: '|K|', fact: { k: 'size', n: 3, s: 'K' } },
    ],
    sockets: [{ id: 's', target: { k: 'law', metas: ['x'], metaSorts: { x: 'G' }, l: app('f', x), r: eK }, allowedGivens: ['sG', 'sK'] }],
    tools: W12(['hom.pow']), unlocks: [],
    idea: 'Lagrange in two groups at once.',
    par: { parts: 9, axioms: 8 }, uses: ['P9.3', 'P10.4', 'P13.1'],
    oracleExempt: 'One catalogue model by nature: the only homomorphism ℤ₅ → ℤ₃ is trivial, and that is the theorem. Each size given is needed: dropping either leaves a counterexample (tests/book/P14.3.test.ts).',
  },
  {
    // Normal subgroups M, N. In N: conjugate b by a, invert b, multiply: aba⁻¹b⁻¹ ∈ N. In M: invert a, conjugate a⁻¹ by b,
    // multiply with a: aba⁻¹b⁻¹ ∈ M. Theorem I → aba⁻¹b⁻¹ = e → your commutator ⟸ (P4.9) → ab = ba.
    id: 'P14.4', index: 61, campaign: 'book', world: 12, chapter: 14, title: 'Normal Subgroups That Meet at e',
    method: 'Subgroup test', source: 'Pinter 14.H2',
    insight: 'The commutator aba⁻¹b⁻¹ read as a(ba⁻¹b⁻¹) lies in M and read as (aba⁻¹)b⁻¹ lies in N. The only element of both is e, and your ch. 4 lemma turns that into ab = ba.',
    memo: 'M and N are normal and share only e. Show their elements commute.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }],
    subgroups: [{ id: 'M', label: 'M', normal: true }, { id: 'N', label: 'N', normal: true }],
    givens: [
      { id: 'ha', name: 'a ∈ M', fact: mem(a, Ms) },
      { id: 'hb', name: 'b ∈ N', fact: mem(b, Ns) },
      { id: 'I', name: 'M ∩ N = {e}', fact: { k: 'cond', metas: ['x'], premises: [pmem(x, Ms), pmem(x, Ns)], concl: peq(x, e) } },
    ],
    sockets: [{ id: 's', target: eq(P(a, b), P(b, a)), allowedGivens: ['ha', 'hb', 'I'] }],
    tools: W12(SUB), unlocks: [],
    idea: 'One commutator, two bracketings, two subgroups.',
    par: { parts: 8, axioms: 8 }, uses: ['P4.9'],
  },
  {
    // Subgroup H. Tower x₁ · Theorem C at u = x₁, v = a: x₁ax₁⁻¹a⁻¹ ∈ H · closed under products with a ∈ H · cancel a⁻¹a → ∀.
    id: 'P14.s1', index: 62, campaign: 'book', world: 12, chapter: 14, side: true, title: 'Commutators Force Normality',
    method: 'Subgroup test', source: 'Pinter 14.E4',
    insight: 'A commutator xax⁻¹a⁻¹ is a conjugate of a with an extra a⁻¹ on the end, and multiplying by a removes it.',
    memo: 'H contains every commutator. Show H contains every conjugate of a.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    subgroups: [{ id: 'H', label: 'H' }],
    givens: [
      { id: 'C', name: 'commutators', fact: { k: 'cond', metas: ['u', 'v'], premises: [], concl: pmem(P(M('u'), M('v'), I(M('u')), I(M('v'))), Hs) } },
      { id: 'ha', name: 'a ∈ H', fact: mem(a, Hs) },
    ],
    sockets: [{ id: 's', target: { k: 'cond', metas: ['x'], premises: [], concl: pmem(P(x, a, I(x)), Hs) }, allowedGivens: ['C', 'ha'] }],
    tools: W12(SUB), unlocks: [],
    idea: 'Containing every commutator makes a subgroup normal.',
    par: { parts: 5, axioms: 5 }, uses: ['P5.4'],
  },
];

/** Authored levels waiting on the factory. Empty: P14.3 shipped once the factory had a Lagrange press per group sort. */
export const PENDING: LevelManifest[] = [];
void y; void g; void PW;

/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters: a letter keeps its shape on every card and floor). */
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: letterSlot(id) }));

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P14.1': [
    {
      title: 'Homomorphisms again',
      body: 'Chapter 9 introduced **homomorphisms**: maps $f: G → K$ between groups with $f(xy) = f(x)f(y)$ for all $x$ and $y$ in $G$. There you proved, without using one-to-one or onto, that $f(e_G) = e_K$ and $f(x^{-1}) = f(x)^{-1}$. Pinter names homomorphisms in this chapter, and this world studies them.',
    },
    {
      title: 'The kernel',
      body: 'The **kernel** of $f$, written $\\ker f$, is the set of elements $x$ of $G$ with $f(x) = e_K$. A subgroup $N$ is **normal** when $x \\in N$ gives $gxg^{-1} \\in N$ for every $g$ in $G$. Membership in the kernel is an equation, so the three docks state the subgroup test and normality for $\\ker f$ as implications between equations.',
    },
    {
      title: 'Your lemmas at a new homomorphism',
      body: 'A lemma saved for every homomorphism applies to any homomorphism on the floor, a Hom Tower’s included. The lens asks which homomorphism plays $f$. For example, a lemma about every $h: A → B$, used at $\\varphi: C → D$, speaks about $\\varphi$ and the identities $e_C$ and $e_D$.',
    },
  ],

  'P14.2': [
    {
      title: 'One-to-one',
      body: 'A map $f$ is **one-to-one** when $f(a) = f(b)$ forces $a = b$. The kernel of a homomorphism always contains $e_G$. The given “$\\ker f = \\{e\\}$” says it contains nothing else: the kernel is **trivial**. This order asks whether that is enough to make $f$ one-to-one.',
    },
    {
      title: 'A homomorphism of the level',
      body: 'Here $f: G → K$ is a homomorphism declared by the order, not by a Tower. Its homomorphism law is available as a recipe, and your lemmas saved for every homomorphism apply at $f$ as well. A result about $f$ itself cannot be saved, because $f$ belongs to this order.',
    },
  ],

  'P14.3': [
    {
      title: 'Lagrange in two groups',
      body: 'An order can now give the size of each group, such as $|G| = 5$ and $|K| = 3$. Lagrange’s theorem then holds in each group with that group’s own order: $x^5 = e_G$ for every $x$ in $G$, and $y^3 = e_K$ for every $y$ in $K$.',
    },
    {
      title: 'Powers through a homomorphism',
      body: 'For a homomorphism $f$ and any integer $n$, $f(x^n) = f(x)^n$. For positive $n$ this is the homomorphism law used $n − 1$ times. For zero and negative $n$ it also uses $f(e) = e$ and $f(x^{-1}) = f(x)^{-1}$. The game imports it as a recipe.',
    },
  ],

  'P14.4': [
    {
      title: 'Two normal subgroups',
      body: 'Here $M$ and $N$ are normal subgroups of $G$, written $M \\trianglelefteq G$ and read “$M$ is a normal subgroup of $G$”. On the floor a normal subgroup has a second outline inside. The given “$M \\cap N = \\{e\\}$” says that $e$ is the only element in both, where $M \\cap N$ is the set of elements common to $M$ and $N$.',
      figures: [{ k: 'math', atoms: AT('p'), rows: [{ seq: ['p', '∈', '⊴N'], why: 'a member of a normal subgroup' }] }],
    },
    {
      title: 'Closed under conjugation',
      body: 'A normal subgroup has one more recipe than other subgroups, **closed under conjugation**: a member conjugated by any element of $G$ is again a member.',
      figures: [{ k: 'math', atoms: AT('gp'), rows: [{ seq: ['p', '∈', '⊴N', '⟹', 'gpg^-1', '∈', '⊴N'], why: 'for every $g$' }] }],
    },
  ],

  'P14.s1': [
    {
      title: 'Commutators in a subgroup',
      body: 'The given “commutators” says that the subgroup $H$ contains every commutator $uvu^{-1}v^{-1}$, for all $u$ and $v$ in $G$. The dock asks that $H$ contains every conjugate $xax^{-1}$ of its member $a$. A subgroup that contains every conjugate of each of its members is normal.',
    },
  ],
};
