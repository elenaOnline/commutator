// THE BOOK · World 7 — Isomorphism (Pinter 9). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// Phase-A level only: P9.s1 (equational). P9.1–P9.4 need Maps (homomorphisms, two group sorts) and are left as placeholders
// in LEVELS, in campaign order.
//
// Notation: words (no integer exponents before ch. 10).
// Toolset: lift, merge, suppose and the earned cancel / witness / socks. No power laws, no press.
import type { LevelManifest, Pallet, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

const A = (id: string): Term => ({ k: 'atom', id });
const e: Term = { k: 'e' };
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const a = A('a'), b = A('b');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];

export const LEVELS: LevelManifest[] = [
  // P9.1 Commutativity Survives, P9.2 The Inverse of an Isomorphism, P9.3 e Goes to e, P9.4 Inverses Go to Inverses — need Maps.
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

  'P9.s1': [
    {
      title: 'The group S₃',
      body: 'The group $S_3$ consists of all six permutations of three objects, and it is not commutative: its table is shown. Two flips $a$ and $b$ that undo themselves, together with the **braid relation** $bab = aba$, are all it takes to describe it. The docks compute with these relations only.',
      figures: [{ k: 'table', group: 'S₃' }],
    },
  ],
};
