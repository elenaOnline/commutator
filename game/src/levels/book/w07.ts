// THE BOOK · World 7 — Isomorphism (Pinter 9). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// P9.s1 is equational (phase A). P9.1–P9.4 are the Maps levels (KERNEL-EXT §5): two group sorts G and K, a level homomorphism
// f: G → K (its law f(xy) = f(x)f(y) is free), and Hom Towers. Cards call the kind "a map that preserves products"; Pinter's
// isomorphisms are the bijective ones, and the general kind is named in chapter 14.
//
// Notation: words (no integer exponents before ch. 10).
// Toolset: lift, merge, suppose and the earned cancel / witness / socks. No power laws, no press.
import type { Card, LevelManifest, Pallet, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

const A = (id: string): Term => ({ k: 'atom', id });
const e: Term = { k: 'e' };
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const a = A('a'), b = A('b');
const M = (id: string): Term => ({ k: 'meta', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
const eS = (s: string): Term => ({ k: 'e', s });
const GK = [{ id: 'G', kind: 'group' as const, label: 'G' }, { id: 'K', kind: 'group' as const, label: 'K' }];
/** Section: ∀y ∈ K. f(s(y)) = y. */
const section: Card = { k: 'law', metas: ['y'], metaSorts: { y: 'K' }, l: app('f', app('s', M('y'))), r: M('y') };

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];

export const LEVELS: LevelManifest[] = [
  {
    // Towers u₁, v₁ ∈ K · Spool u₁v₁ → u₁ ⟶ f(s(u₁)), v₁ ⟶ f(s(v₁)) (the section backwards) → hom law backwards: f(s(u₁)s(v₁))
    // → C inside f → hom law → section twice: v₁u₁ · ∀ · dock.
    id: 'P9.1', index: 35, campaign: 'book', world: 7, chapter: 9, title: 'Commutativity Survives',
    method: 'Preservation', source: 'Pinter ch. 9 (invariants)',
    insight: 'A map that preserves products carries a property of G to everything it reaches: pull u and v back into G, swap them there, push them forward.',
    memo: 'f carries G onto K, and G is commutative. Is K?',
    sorts: GK,
    maps: [{ id: 'f', label: 'f', args: ['G'], res: 'K', kind: 'hom' }, { id: 's', label: 's', args: ['K'], res: 'G' }],
    atoms: [],
    givens: [
      { id: 'sec', name: 'section', fact: section },
      { id: 'C', name: 'G commutes', fact: { k: 'law', metas: ['x', 'y'], metaSorts: { x: 'G', y: 'G' }, l: P(M('x'), M('y')), r: P(M('y'), M('x')) } },
    ],
    sockets: [{ id: 's', target: { k: 'law', metas: ['u', 'v'], metaSorts: { u: 'K', v: 'K' }, l: P(M('u'), M('v')), r: P(M('v'), M('u')) }, allowedGivens: ['sec', 'C'] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Commuting survives a map that preserves products.',
    par: { parts: 11, axioms: 8 }, uses: [],
  },
  {
    // Towers u₁, v₁ ∈ K · Spool g(u₁v₁) → u₁ ⟶ f(g(u₁)), v₁ ⟶ f(g(v₁)) (R backwards) → hom law backwards inside g → L · ∀ · dock.
    id: 'P9.2', index: 36, campaign: 'book', world: 7, chapter: 9, title: 'The Inverse of an Isomorphism',
    method: 'Preservation', source: 'Pinter 9.A2',
    insight: 'Insert f(g(·)) around u and v, fold the product into f, and let g undo f.',
    memo: 'f preserves products, and g undoes f both ways. Does g preserve them?',
    sorts: GK,
    maps: [{ id: 'f', label: 'f', args: ['G'], res: 'K', kind: 'hom' }, { id: 'g', label: 'g', args: ['K'], res: 'G' }],
    atoms: [],
    givens: [
      { id: 'L', name: 'g after f', fact: { k: 'law', metas: ['x'], metaSorts: { x: 'G' }, l: app('g', app('f', M('x'))), r: M('x') } },
      { id: 'R', name: 'f after g', fact: { k: 'law', metas: ['y'], metaSorts: { y: 'K' }, l: app('f', app('g', M('y'))), r: M('y') } },
    ],
    sockets: [{
      id: 's', allowedGivens: ['L', 'R'],
      target: { k: 'law', metas: ['u', 'v'], metaSorts: { u: 'K', v: 'K' }, l: app('g', P(M('u'), M('v'))), r: P(app('g', M('u')), app('g', M('v'))) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'An inverse map preserves products too.',
    par: { parts: 8, axioms: 5 }, uses: ['P9.1'],
  },
  {
    // Group Towers G₁, H₁ · Hom Tower f₁ : G₁ → H₁ · Spool f₁(e) → e ⟶ ee inside f · hom law: f₁(e) = f₁(e)f₁(e) · swap ·
    // "the only idempotent is e" (P4.7), read in H₁ · ∀ over f₁ and both groups · dock. Saved as "f(e) = e".
    id: 'P9.3', index: 37, campaign: 'book', world: 7, chapter: 9, title: 'e Goes to e',
    method: 'Preservation', source: 'Pinter 9.B1',
    insight: 'e = ee, so f(e) is idempotent in K. The only idempotent is e.',
    memo: 'For every map f that preserves products, f(e) is the identity.',
    atoms: [], givens: [],
    sockets: [{
      id: 's', allowedGivens: [],
      target: { k: 'law', metas: [], l: app('f', eS('S')), r: eS('T'),
        binds: [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'T' } }] },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A fact about every homomorphism needs a Hom Tower.',
    par: { parts: 9, axioms: 5 }, uses: ['P4.7'],
  },
  {
    // Group Towers G₁, H₁ · Hom Tower f₁ : G₁ → H₁ · Tower x₁ ∈ G₁ · Spool f₁(x₁)f₁(x₁⁻¹) → hom law backwards → x₁x₁⁻¹ ⟶ e inside f₁ →
    // the saved f(e) = e at f₁ → unique inverse (in H₁) → ∀ over x₁, f₁ and both groups · dock.
    id: 'P9.4', index: 38, campaign: 'book', world: 7, chapter: 9, title: 'Inverses Go to Inverses',
    method: 'Uniqueness argument', source: 'Pinter 9.B2',
    insight: 'f(x) times f(x⁻¹) is f(e), which is e. So f(x⁻¹) is the inverse of f(x).',
    memo: 'For every map f that preserves products, f(x⁻¹) = f(x)⁻¹.',
    atoms: [], givens: [],
    sockets: [{
      id: 's', allowedGivens: [],
      target: { k: 'law', metas: ['x'], metaSorts: { x: 'S' }, l: app('f', I(M('x'))), r: I(app('f', M('x'))),
        binds: [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'T' } }] },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A saved lemma about every homomorphism applies to a Tower.',
    par: { parts: 10, axioms: 8 }, uses: ['P9.3', 'P4.3'],
  },
  {
    // s1: Spool ababab → bab ⟶ aba (h₃) → aa ⟶ e (h₁) twice, pop → bb ⟶ e (h₂): (ab)³ = e on the right rail.
    // s2: Spool abab → bab ⟶ aba (h₃) → aa ⟶ e (h₁): ba = abab on the left rail.
    id: 'P9.s1', index: 39, campaign: 'book', world: 7, chapter: 9, side: true, title: 'Two Flips Make S₃',
    method: 'Computation', source: 'Pinter 9.F2',
    insight: 'The braid relation bab = aba turns ab into an element of order 3, so two flips generate S₃ without a table.',
    memo: 'Two flips a and b obey one braid relation. Compute (ab)³ and abab.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }],
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(P(a, a), e) },
      { id: 'h2', name: 'h₂', fact: eq(P(b, b), e) },
      { id: 'h3', name: 'h₃', fact: eq(P(b, a, b), P(a, b, a)) },
    ],
    sockets: [
      { id: 's1', target: eq(P(a, b, a, b, a, b), e), allowedGivens: ['h1', 'h2', 'h3'] },
      { id: 's2', target: eq(P(b, a), P(a, b, a, b)), allowedGivens: ['h1', 'h3'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Relations decide the order of a product.',
    par: { parts: 8, axioms: 9 }, uses: ['P8.1'],
  },
];

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
void AT;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P9.1': [
    {
      title: 'Two groups',
      body: 'A level can now have two groups, $G$ and $K$, each with its own identity ($e_G$ and $e_K$) and its own products. A product makes sense only inside one group: $uv$ needs $u$ and $v$ in the same group. A Tower says which group its variable lives in, as in $u_1 ∈ K$.',
    },
    {
      title: 'A map that preserves products',
      body: 'A map $f: G → K$ **preserves products** when $f(xy) = f(x)f(y)$ for all $x, y ∈ G$. The product on the left is taken in $G$ and the one on the right in $K$. The game supplies this law, and it can be used in either direction. Pinter calls such a map an isomorphism when it is also one-to-one and onto. Chapter 14 names the general kind a homomorphism.',
    },
    {
      title: 'Rewriting inside a map',
      body: 'A map term $h(…)$ is one factor of the word around it, but a Rewriter can still work inside its brackets. If $a = b$ is a rule, then $h(a)$ becomes $h(b)$, because equal inputs give equal outputs. Select the span you want inside the brackets.',
    },
  ],

  'P9.2': [
    {
      title: 'Inverse maps',
      body: 'A map $g: K → G$ is an **inverse** of $f: G → K$ when $g(f(x)) = x$ for every $x ∈ G$ and $f(g(y)) = y$ for every $y ∈ K$. A map with an inverse is one-to-one and onto. A one-to-one, onto map that preserves products is an isomorphism. This order asks whether its inverse map preserves products too.',
    },
  ],

  'P9.3': [
    {
      title: 'Any such map',
      body: 'A **Hom Tower** declares a map $f_1: G_1 → H_1$ that preserves products and has no other property. Its two groups $G_1$ and $H_1$ come from Group Towers. A proof about $f_1$ uses only the group rules and the product law, so ∀ can bind $f_1$ and both groups, and the result holds for every such map.',
    },
    {
      title: 'One identity per group',
      body: 'Each group has its own identity, written $e_{G_1}$ and $e_{H_1}$. A lemma you saved earlier about one group can be used in whichever group the terms live in. Nothing yet says where $f_1$ sends $e_{G_1}$.',
    },
  ],

  'P9.4': [
    {
      title: 'Which map plays f',
      body: 'A lemma saved for every map that preserves products asks which map plays $f$. Choose the map you want it to speak about, here a Tower map. The same lemma works for any other such map on the floor.',
    },
  ],

  'P9.s1': [
    {
      title: 'The group S₃',
      body: 'The group $S_3$ consists of all six permutations of three objects, and it is not commutative: its table is shown. Two flips $a$ and $b$ that undo themselves, together with the **braid relation** $bab = aba$, are all it takes to describe it. The docks compute with these relations only.',
      figures: [{ k: 'table', group: 'S₃' }],
    },
  ],
};
