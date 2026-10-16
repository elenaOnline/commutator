// THE BOOK · World 6 — Permutations (Pinter 7–8). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// P7.1 and P8.1 are equational (phase A). P7.2 (The Stabilizer) and P8.2 (Conjugation Relabels) are the first ACTION levels
// (Maps, KERNEL-EXT §5): a group G acts on a set Ω by a map σ(g, p), a map of kind 'action' whose two laws
// σ(gh, p) = σ(g, σ(h, p)) and σ(e, p) = p are dependency-free. Pinter writes σ(g, p) as g(p).
//
// Notation: words (r⁴ = rrrr, α³ = ααα) — no integer exponents before ch. 10.
// Toolset: lift, merge, suppose and the earned cancel / witness / socks. No power laws, no press.
import type { LevelManifest, Pallet, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import { letterSlot } from '../../ui/letters';

const A = (id: string): Term => ({ k: 'atom', id });
const e: Term = { k: 'e' };
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const rep = (t: Term, n: number): Term => P(...Array.from({ length: n }, () => t));
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
/** The action σ(g, p) of the group on Ω (map id 'act', shown as σ). */
const act = (g: Term, p: Term): Term => ({ k: 'app', fn: 'act', args: [g, p] });
const r = A('r'), f = A('f'), a = A('a'), b = A('b'), pi = A('pi'), pt = A('p');

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
  {
    // s1: Spool σ(αβ, p) → action law σ(gh, p) = σ(g, σ(h, p)) → σ(β, p) = p (h_b) → σ(α, p) = p (h_a).
    // s2: Spool σ(α⁻¹, p) → p ⟶ σ(α, p) (h_a backwards) → action law backwards: σ(α⁻¹α, p) → α⁻¹α ⟶ e → σ(e, p) = p.
    id: 'P7.2', index: 32, campaign: 'book', world: 6, chapter: 7, title: 'The Stabilizer',
    method: 'Computation', source: 'Pinter 7.H1',
    insight: 'A point equation can be read right to left. Rewriting p as α(p) is what lets the inverse meet α.',
    memo: 'α and β both leave the point p where it is. Check what else does.',
    sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'O', kind: 'set', label: 'Ω' }],
    maps: [{ id: 'act', label: 'σ', args: ['G', 'O'], res: 'O', kind: 'action' }],
    atoms: [{ id: 'a', label: 'α', hue: 0 }, { id: 'b', label: 'β', hue: 1 }, { id: 'p', label: 'p', hue: 2, carrier: 'O' }],
    givens: [
      { id: 'ha', name: 'h₁', fact: eq(act(a, pt), pt) },
      { id: 'hb', name: 'h₂', fact: eq(act(b, pt), pt) },
    ],
    sockets: [
      { id: 's1', target: eq(act(P(a, b), pt), pt), allowedGivens: ['ha', 'hb'] },
      { id: 's2', target: eq(act(I(a), pt), pt), allowedGivens: ['ha'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A group element moves points, and some leave one fixed.',
    par: { parts: 9, axioms: 7 }, uses: ['P7.1'],
  },
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
  {
    // Spool σ(παπ⁻¹, r) → action law twice → σ(π, σ(α, σ(π⁻¹, r))) → r ⟶ σ(π, p) (h₁ backwards) → action law backwards:
    // σ(π⁻¹π, p) → π⁻¹π ⟶ e → σ(e, p) = p → σ(α, p) = q (h₃) → σ(π, q) = s (h₂).
    id: 'P8.2', index: 34, campaign: 'book', world: 6, chapter: 8, title: 'Conjugation Relabels',
    method: 'Computation', source: 'Pinter 8.E1',
    insight: 'Conjugating by π relabels the points: π carries p to r and q to s, so παπ⁻¹ carries r to s.',
    memo: 'π renames the points p and q as r and s. α sends p to q.',
    sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'O', kind: 'set', label: 'Ω' }],
    maps: [{ id: 'act', label: 'σ', args: ['G', 'O'], res: 'O', kind: 'action' }],
    atoms: [
      { id: 'pi', label: 'π', hue: 0 }, { id: 'a', label: 'α', hue: 1 },
      { id: 'p', label: 'p', hue: 2, carrier: 'O' }, { id: 'q', label: 'q', hue: 3, carrier: 'O' },
      { id: 'r', label: 'r', hue: 4, carrier: 'O' }, { id: 's', label: 's', hue: 5, carrier: 'O' },
    ],
    givens: [
      { id: 'h1', name: 'h₁', fact: eq(act(pi, A('p')), A('r')) },
      { id: 'h2', name: 'h₂', fact: eq(act(pi, A('q')), A('s')) },
      { id: 'h3', name: 'h₃', fact: eq(act(a, A('p')), A('q')) },
    ],
    sockets: [{ id: 's', target: eq(act(P(pi, a, I(pi)), A('r')), A('s')), allowedGivens: ['h1', 'h2', 'h3'] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A conjugate moves the relabelled points.',
    par: { parts: 9, axioms: 8 }, uses: ['P7.2'],
  },
];

/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters: a letter keeps its shape on every card and floor). */
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: letterSlot(id) }));

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P7.1': [
    {
      title: 'Symmetries of a square',
      body: 'A square can be turned by a quarter turn $r$ and flipped by a reflection $f$. Number its corners $0, 1, 2, 3$ as on the clock below. A quarter turn moves each corner one place on, and four bring it home: $r^4 = e$. Two flips return the square too: $ff = e$. A third says how a flip and a turn trade places. Together they give all eight symmetries, the **dihedral group** $D_4$.',
      figures: [{ k: 'clock', n: 4 }],
    },
    {
      title: 'Four copies of a letter',
      body: 'The relation $r^4 = e$ is shorthand for $rrrr = e$. Four copies of $r$ in a row can be deleted wherever they stand in a word, and four copies can be inserted at any gap. With other letters:',
      figures: [{ k: 'math', atoms: AT('s'), rows: [
        { seq: [{ t: 'ssssss', br: [[0, 4, '$s^4 = e$', 'over']] }, '=', 'ss'] },
      ] }],
    },
  ],

  'P7.2': [
    {
      title: 'A group acting on a set',
      body: 'A group $G$ **acts** on a set $Ω$ of points when each element $g$ of $G$ moves each point $p$ to a point $g(p)$. Two laws come with every action, and the game supplies them. The first is $(gh)(p) = g(h(p))$: a product acts with $h$ first and then $g$. The second is $e(p) = p$.',
    },
    {
      title: 'The stabilizer',
      body: 'The **stabilizer** of a point $p$ is the set of all $g$ in $G$ with $g(p) = p$, the elements that leave $p$ where it is. A given $g(p) = p$ says that $g$ is one of them. The docks ask whether a product of two such elements, and the inverse of one, stay in the stabilizer.',
    },
    {
      title: 'Writing an action in the Spool',
      body: 'The Spool’s chips build action terms. For elements $g$, $h$ and a point $q$: the chip $g(\\,)$ writes $g$ and opens a bracket, and the next chip goes inside it. So $g(\\,)$, then $h(\\,)$, then $q$ build $g(h(q))$. The $)$ chip closes the innermost open bracket. To let a product act, build it first: after $gh$, the $(□)(\\,)$ chip makes $(gh)(\\,)$, ready for a point. Open brackets close when you press Enter or click away.',
    },
  ],

  'P8.1': [
    {
      title: 'Permutations and order',
      body: 'The permutations of a finite set form a group under composition, and the identity permutation plays the part of $e$. The **order** of $\\alpha$ is the least $n > 0$ with $\\alpha^n = e$. The proof here uses only the group rules and the three givens, so its result holds for any elements satisfying them.',
    },
  ],

  'P8.2': [
    {
      title: 'Conjugates',
      body: 'For $π$ and $α$ in $G$, the **conjugate** of $α$ by $π$ is $παπ^{-1}$. When a product acts on a point, its right-hand factor acts first: $τρτ^{-1}$ acts with $τ^{-1}$ first, then $ρ$, then $τ$. In this order the letters $p, q, r, s$ are points of $Ω$, and $π$ and $α$ are elements of $G$.',
    },
  ],
};
