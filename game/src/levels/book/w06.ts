// THE BOOK · World 6 — Permutations (Pinter 7–8). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// Phase-A levels only: P7.1 and P8.1 (equational). P7.2 (The Stabilizer) and P8.2 (Conjugation Relabels) need Maps (the action
// kind) and are left as placeholders in LEVELS, in campaign order.
//
// Notation: words (r⁴ = rrrr, α³ = ααα) — no integer exponents before ch. 10.
// Toolset: lift, merge, suppose and the earned cancel / witness / socks. No power laws, no press.
import type { LevelManifest, Pallet, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

const A = (id: string): Term => ({ k: 'atom', id });
const e: Term = { k: 'e' };
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const rep = (t: Term, n: number): Term => P(...Array.from({ length: n }, () => t));
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const r = A('r'), f = A('f'), a = A('a'), b = A('b');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];

export const LEVELS: LevelManifest[] = [
  {
    // r⁴ = e is essential: without it (fr)(fr) = e is false in the semidihedral group of order 16 (beyond the oracle's catalogue).
    // s1: Spool frfr → fr ⟶ rrrf (h₃) on the right rail → ff ⟶ e (h₂) → rrrr ⟶ e (h₁).
    // s2: Spool frr → fr ⟶ rrrf twice (h₃) → rrrr ⟶ e (h₁), on the left rail → swap-free: rrf = frr.
    id: 'P7.1', index: 31, campaign: 'book', world: 6, chapter: 7, title: 'Symmetries of the Square',
    method: 'Computation', source: 'Pinter ch. 7 (D₄) / 5.F2',
    insight: 'Push every flip to one end with the relation. The rotations then collapse because r⁴ = e.',
    memo: 'A square has a quarter turn r and a flip f. Compute two products from the relations.',
    atoms: [{ id: 'r', label: 'r', hue: 0 }, { id: 'f', label: 'f', hue: 1 }],
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(rep(r, 4), e) },
      { id: 'h2', name: 'h₂', fact: eq(P(f, f), e) },
      { id: 'h3', name: 'h₃', fact: eq(P(f, r), P(r, r, r, f)) },
    ],
    sockets: [
      { id: 's1', target: eq(P(f, r, f, r), e), allowedGivens: ['h1', 'h2', 'h3'] },
      { id: 's2', target: eq(P(r, r, f), P(f, r, r)), allowedGivens: ['h1', 'h3'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Relations rewrite one word into another.',
    par: { parts: 8, axioms: 8 }, uses: ['P5.5'],
  },
  // P7.2 The Stabilizer — needs Maps (action kind). Not authored here.
  {
    // Notation: α, β are permutations of a finite set; the level is purely equational (ids a, b; labels α, β).
    // Spool α → insert αα α at the end (h₁ backwards) → αα ⟶ ββ twice (h₃) → βββ ⟶ e (h₂).
    id: 'P8.1', index: 33, campaign: 'book', world: 6, chapter: 8, title: 'Determined by Its Square',
    method: 'Uniqueness argument', source: 'Pinter 8.D6 (corrected: odd order)',
    insight: 'An element of odd order is a power of its own square, so equal squares force equal elements.',
    memo: 'α and β both cube to e and have the same square. Show they are equal.',
    atoms: [{ id: 'a', label: 'α', hue: 0 }, { id: 'b', label: 'β', hue: 1 }],
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(rep(a, 3), e) },
      { id: 'h2', name: 'h₂', fact: eq(rep(b, 3), e) },
      { id: 'h3', name: 'h₃', fact: eq(P(a, a), P(b, b)) },
    ],
    sockets: [{ id: 's', target: eq(a, b), allowedGivens: ['h1', 'h2', 'h3'] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Write e as a power to reach the square.',
    par: { parts: 5, axioms: 6 }, uses: ['P4.s1'],
  },
  // P8.2 Conjugation Relabels — needs Maps (action kind). Not authored here.
];

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
void AT;

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P7.1': [
    {
      title: 'Symmetries of a square',
      body: 'A square can be turned by a quarter turn $r$ and flipped by a reflection $f$. Four quarter turns return the square to the start, so $r^4 = e$. Two flips return it too, so $ff = e$. A third relation says how a flip and a turn trade places. Together they describe all eight symmetries, the **dihedral group** $D_4$.',
    },
    {
      title: 'Four copies of a letter',
      body: 'The relation $r^4 = e$ is shorthand for $rrrr = e$. Four copies of $r$ in a row can be deleted wherever they stand in a word, and four copies can be inserted at any gap. A longer run is shortened four letters at a time.',
      figures: [{ k: 'math', atoms: AT('s'), rows: [
        { seq: [{ t: 'ssssss', br: [[0, 4, '$s^4 = e$', 'over']] }, '=', 'ss'] },
      ] }],
    },
  ],

  'P8.1': [
    {
      title: 'Permutations and order',
      body: 'The permutations of a finite set form a group under composition, and the identity permutation plays the part of $e$. The **order** of $\\alpha$ is the least $n > 0$ with $\\alpha^n = e$. The proof here uses only the group rules and the three givens, so its result holds for any elements satisfying them.',
    },
  ],
};
