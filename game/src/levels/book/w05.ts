// THE BOOK · World 5 — Functions (Pinter 6). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
//
// The first Maps world (KERNEL-EXT §5): plain SETS A, B, C and plain maps f: A → B, g: B → C (not groups, no hom law).
// Injectivity is a given in its usual if–then form; a "section" (a chosen preimage) stands for surjectivity.
// Toolset: Towers (in a set), Assume rooms, Theorems from givens, ∀, and the Operator's "apply g to both sides".
// The earned group-theory schemas are listed for continuity; none of them acts in a set.
import type { Card, LevelManifest, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';
import { letterSlot } from '../../ui/letters';

const M = (id: string): Term => ({ k: 'meta', id });
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
const EARNED = ['cancel', 'witness', 'socks'];

const SETS = [
  { id: 'A', kind: 'set' as const, label: 'A' },
  { id: 'B', kind: 'set' as const, label: 'B' },
  { id: 'C', kind: 'set' as const, label: 'C' },
];
const f = (t: Term) => app('f', t), g = (t: Term) => app('g', t), s = (t: Term) => app('s', t), t_ = (t: Term) => app('t', t);
const x = M('x'), y = M('y'), z = M('z'), u = M('u'), v = M('v');

/** "f is injective": ∀u,v ∈ A. f(u) = f(v) ⟹ u = v. */
const injF: Card = { k: 'cond', metas: ['u', 'v'], metaSorts: { u: 'A', v: 'A' }, premises: [{ k: 'eq', l: f(u), r: f(v) }], concl: { k: 'eq', l: u, r: v } };
/** "g is injective": ∀u,v ∈ B. g(u) = g(v) ⟹ u = v. */
const injG: Card = { k: 'cond', metas: ['u', 'v'], metaSorts: { u: 'B', v: 'B' }, premises: [{ k: 'eq', l: g(u), r: g(v) }], concl: { k: 'eq', l: u, r: v } };
/** "g∘f is injective": ∀u,v ∈ A. g(f(u)) = g(f(v)) ⟹ u = v. */
const injGF: Card = { k: 'cond', metas: ['u', 'v'], metaSorts: { u: 'A', v: 'A' }, premises: [{ k: 'eq', l: g(f(u)), r: g(f(v)) }], concl: { k: 'eq', l: u, r: v } };

export const LEVELS: LevelManifest[] = [
  {
    // s1: Tower x₁, y₁ ∈ A · Assume g(f(x₁)) = g(f(y₁)) · inj g (u := f(x₁), v := f(y₁)) · inj f · gate · ∀ · dock.
    // s2: Tower x₁, y₁ ∈ A · Assume f(x₁) = f(y₁) · apply g to both sides · inj (g∘f) · gate · ∀ · dock.
    id: 'P6.1', index: 28, campaign: 'book', world: 5, chapter: 6, title: 'One-to-One',
    method: 'If–then', source: 'Pinter ch. 6 theorem + 6.G1',
    insight: 'Injectivity is cancellation for maps. Peel off the outer map first, then the inner one, or apply the outer map to start the peel.',
    memo: 'f sends A to B and g sends B to C. Settle injectivity of g∘f both ways.',
    sorts: SETS,
    maps: [{ id: 'f', label: 'f', args: ['A'], res: 'B' }, { id: 'g', label: 'g', args: ['B'], res: 'C' }],
    atoms: [],
    givens: [
      { id: 'injf', name: 'f injective', fact: injF },
      { id: 'injg', name: 'g injective', fact: injG },
      { id: 'injgf', name: 'g∘f injective', fact: injGF },
    ],
    sockets: [
      { id: 's1', target: { ...injGF, metas: ['x', 'y'], metaSorts: { x: 'A', y: 'A' }, premises: [{ k: 'eq', l: g(f(x)), r: g(f(y)) }], concl: { k: 'eq', l: x, r: y } }, allowedGivens: ['injf', 'injg'] },
      { id: 's2', target: { ...injF, metas: ['x', 'y'], metaSorts: { x: 'A', y: 'A' }, premises: [{ k: 'eq', l: f(x), r: f(y) }], concl: { k: 'eq', l: x, r: y } }, allowedGivens: ['injgf'] },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'An injective map can be cancelled, one map at a time.',
    par: { parts: 8, axioms: 8 }, uses: [],
  },
  {
    // Tower x₁ ∈ A · Spool f(s(f(x₁))) · section at y := f(x₁) · inj f · ∀ · dock.
    id: 'P6.2', index: 29, campaign: 'book', world: 5, chapter: 6, title: 'A Section That Inverts',
    method: 'Cancellation', source: 'Pinter ch. 6 (bijective ⟺ invertible)',
    insight: 'The section only undoes f on the image of f. Feeding it f(x) makes that image the whole input, and injectivity cancels the f.',
    memo: 'f is injective and s picks a preimage for each element of B.',
    sorts: SETS.slice(0, 2),
    maps: [{ id: 'f', label: 'f', args: ['A'], res: 'B' }, { id: 's', label: 's', args: ['B'], res: 'A' }],
    atoms: [],
    givens: [
      { id: 'injf', name: 'f injective', fact: injF },
      { id: 'sec', name: 'section', fact: { k: 'law', metas: ['y'], metaSorts: { y: 'B' }, l: f(s(y)), r: y } },
    ],
    sockets: [{ id: 's', target: { k: 'law', metas: ['x'], metaSorts: { x: 'A' }, l: s(f(x)), r: x }, allowedGivens: ['injf', 'sec'] }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'Use a law at a compound term, then cancel.',
    par: { parts: 5, axioms: 3 }, uses: ['P6.1'],
  },
  {
    // Tower z₁ ∈ C · Spool g(f(s(t(z₁)))) · section of f at y := t(z₁) · section of g at z := z₁ · ∀ · witness dock.
    id: 'P6.3', index: 30, campaign: 'book', world: 5, chapter: 6, title: 'Onto, Twice',
    method: 'Witness', source: 'Pinter ch. 6 theorem (composite of surjections)',
    insight: 'To show a composite hits z, build the preimage in stages: t(z) first, then s of that.',
    memo: 'Every element of B and of C has a chosen preimage. Find one for g∘f.',
    sorts: SETS,
    maps: [
      { id: 'f', label: 'f', args: ['A'], res: 'B' }, { id: 'g', label: 'g', args: ['B'], res: 'C' },
      { id: 's', label: 's', args: ['B'], res: 'A' }, { id: 't', label: 't', args: ['C'], res: 'B' },
    ],
    atoms: [],
    givens: [
      { id: 'secf', name: 'section of f', fact: { k: 'law', metas: ['y'], metaSorts: { y: 'B' }, l: f(s(y)), r: y } },
      { id: 'secg', name: 'section of g', fact: { k: 'law', metas: ['z'], metaSorts: { z: 'C' }, l: g(t_(z)), r: z } },
    ],
    sockets: [{
      id: 's', target: { k: 'law', metas: ['z'], metaSorts: { z: 'C' }, l: g(f(M('w'))), r: z }, allowedGivens: ['secf', 'secg'],
      holes: [{ id: 'w' }],
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: EARNED }), unlocks: [],
    idea: 'A witness is built by composing preimages.',
    par: { parts: 5, axioms: 3 }, uses: ['P6.2'],
  },
];

/** Card letters: AT('pq') → p, q, each in its own shape (ui/letters). A name before a bracket that is not a letter here is a map. */
const AT = (s: string): AtomSpec[] => [...s].map((id) => ({ id, label: id, hue: letterSlot(id) }));

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {

  'P6.1': [
    {
      title: 'Maps between sets',
      body: 'A **map** $f: A → B$ sends each element $x$ of the set $A$ to one element $f(x)$ of the set $B$. These sets have no product and no identity, only equality. If $g: B → C$ is another map, the **composite** $g ∘ f: A → C$ applies $f$ first and then $g$: $(g ∘ f)(x) = g(f(x))$. A Tower can declare $x_1 ∈ A$, and $f(x_1)$ is one term.',
    },
    {
      title: 'Injective maps',
      body: 'A map $h: X → Y$ is **injective** (one-to-one) when different inputs give different outputs. As an if–then: for all $p, q ∈ X$, $h(p) = h(q) \\implies p = q$. Used as a premise, it works like left cancellation, which strips a shared factor in the same way.',
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { label: 'h injective', seq: ['h(p)', '=', 'h(q)', '⟹', 'p', '=', 'q'] },
        { label: 'left cancellation', seq: ['rp', '=', 'rq', '⟹', 'p', '=', 'q'] },
      ] }],
    },
    {
      title: 'Apply a map to both sides',
      body: 'Equal inputs give equal outputs, for any map $h$. The Operator can apply a chosen map to both sides of an equation. The reverse step is not free.',
      figures: [{ k: 'math', atoms: AT('pq'), rows: [
        { seq: ['p', '=', 'q', '⟹', 'h(p)', '=', 'h(q)'], why: 'Always valid.' },
        { seq: ['h(p)', '=', 'h(q)', '⟹', 'p', '=', 'q'], strike: true, why: 'Only when $h$ is injective.' },
      ] }],
    },
  ],

  'P6.2': [
    {
      title: 'Sections',
      body: 'Let $h: X → Y$ and $r: Y → X$. The map $r$ is a **section** of $h$ when $h(r(y)) = y$ for every $y ∈ Y$. So $r(y)$ is an input that $h$ sends to $y$. As a given, a section is a law for every $y$, and it can be used at any element of $Y$.',
    },
    {
      title: 'Undoing from one side',
      body: 'A section undoes $h$ after $r$, which is not the same as undoing $r$ after $h$. Take $X$ with two elements $1$ and $2$, and $Y$ with one element $y_0$. Then $h(1) = h(2) = y_0$, and $r(y_0) = 1$ is a section of $h$. Yet $r(h(2)) = 1$, not $2$. Injectivity is what rules this out.',
    },
  ],

  'P6.3': [
    {
      title: 'Surjective maps',
      body: 'A map $f: A → B$ is **surjective** (onto) when every $y ∈ B$ equals $f(x)$ for some $x ∈ A$. A section $s$ of $f$ shows it: for each $y$ it supplies the input $x = s(y)$, and $f(x) = y$. Here $f$ and $g$ each come with a section, and the dock asks the same of $g ∘ f$.',
    },
    {
      title: 'A dock with a gap',
      body: 'The dock reads $g(f(?)) = z$ for every $z$. The $?$ marks where an input belongs. Prove $g(f(t)) = z$ for a term $t$ of your own, and the dock fills the gap with $t$. On other letters: the dock $h(?) = h(h(w))$, for every $w$, is filled by $t = h(w)$, and a Spool proves it.',
    },
  ],
};
