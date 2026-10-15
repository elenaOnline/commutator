// THE BOOK · World 9 — Cyclic Groups (Pinter 11). See design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
import type { LevelManifest, Monomial, Pallet, PatFact, Poly, Term, Toolset } from '../../kernel/types';
import type { AtomSpec, ConceptCard } from '../cards';

// ── local builders (normalized terms) ──
const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
// Exponents: canonical polynomials written by hand (sparse, sorted, decimal-string coefficients).
const zm = (id: string): Monomial[number] => ({ ref: { k: 'zmeta', id }, degree: 1 });
const Z = (coefficient: number, ...monomial: Monomial): Poly => [{ coefficient: String(coefficient), monomial }];
/** base^exp, one factor of its enclosing word (a pow node, never expanded). */
const PW = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });
const a = A('a');
/** The exponent consisting of the single ℤ meta `id`. */
const ZM = (id: string): Poly => Z(1, zm(id));
const x = M('x');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });
/** Earned theorems (unique inverse, cancellation, inverse of a product). */
const EARNED = ['cancel', 'witness', 'socks'];


/** Every import the book has handed out by chapter 11 (worked out in world 8). */
const POWERS = ['power.add', 'power.zero', 'power.conjugate', 'power.multiply', 'power.one', 'power.identity'];

// P11.1 Subgroups of a Cyclic Group (Thm 2 core) is not here yet: it needs the Members extension (subgroup
// Towers and the membership fact `t ∈ H`, with the import "powers of a member are members"). When Members lands, the
// level goes in this file as P11.1, ahead of P11.2, with index 45 (P11.2 and P11.3 keep 46 and 47).

export const LEVELS: LevelManifest[] = [
  {
    // Notation: pow nodes. Assume nothing. Tower x₁, i₁, j₁, m₁.
    // Spool (xⁱxʲ)ᵐ → power.add (inside the base) → power.multiply → power.add backwards (im, jm) → power.multiply backwards (i, m) and (j, m) → dock.
    id: 'P11.2', index: 46, campaign: 'book', world: 9, chapter: 11, title: 'Powers of One Element Commute',
    method: 'Exponent arithmetic',
    insight: 'Powers of one element combine by adding exponents, and addition does not care about order. So (xⁱxʲ)ᵐ splits as (xⁱ)ᵐ(xʲ)ᵐ.',
    source: 'Pinter 11.B2 / 11.C3',
    memo: 'Two powers of one part, run in a row, then repeated m times. Show the repeats split into m of each.',
    atoms: [], givens: [],
    sockets: [{
      id: 's', allowedGivens: [],
      target: { k: 'law', metas: ['x', 'i', 'j', 'm'], l: PW(P(PW(x, ZM('i')), PW(x, ZM('j'))), ZM('m')), r: P(PW(PW(x, ZM('i')), ZM('m')), PW(PW(x, ZM('j')), ZM('m'))) },
    }],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POWERS] }), unlocks: [],
    idea: 'Powers of one element combine by plain arithmetic on exponents.',
    par: { parts: 11, axioms: 6 }, uses: ['P10.3'],
  },
  {
    // Notation: a⁵ = e is the pow node a^(5); the docks are pow nodes. Open dock `aⁱ = (a^?)²` with a ℤ hole k; the answer is k = 3i.
    // Side fact a⁶ = a: Spool a⁶ → power.add backwards (5, 1) → h → power.one. It feeds both docks.
    // s: Assume (aⁱ)² = e · Spool aⁱ → side fact backwards → power.multiply → power.multiply backwards (2i, 3) and (i, 2) → desk → power.identity → gate → ∀.
    // t: Spool aⁱ → side fact backwards → power.multiply → power.multiply backwards (3i, 2) → ∀.
    // The hom dock (squaring respects products) is dropped: it is P11.2 applied twice (SYNTHESIS §3, adversary M5).
    id: 'P11.3', index: 47, campaign: 'book', world: 9, chapter: 11, title: 'Squaring in a Five-Element Cyclic Group',
    method: 'Exponent arithmetic',
    insight: 'In a group where a⁵ = e, a⁶ = a. That lets aⁱ be written as a⁶ⁱ, which is (a³ⁱ)² (onto) and also ((aⁱ)²)³ (one-to-one).',
    source: 'Pinter 11.B6',
    memo: 'Squaring should lose no part and miss no part. Part a resets every five turns.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [{ id: 'h', name: 'a⁵ = e', fact: eq(PW(a, Z(5)), e) }],
    sockets: [
      { id: 's', target: { k: 'cond', metas: ['i'], premises: [peq(PW(PW(a, ZM('i')), Z(2)), e)], concl: peq(PW(a, ZM('i')), e) }, allowedGivens: ['h'] },
      {
        id: 't', allowedGivens: ['h'], holes: [{ id: 'k', sort: 'Z' }],
        target: { k: 'law', metas: ['i'], l: PW(a, ZM('i')), r: PW(PW(a, ZM('k')), Z(2)) },
      },
    ],
    tools: tools({ lift: true, merge: true, suppose: true, schemas: [...EARNED, ...POWERS] }), unlocks: [],
    idea: 'Squaring is one-to-one and onto in a cyclic group of odd order.',
    par: { parts: 18, axioms: 16 }, uses: ['P10.3', 'P11.2'],
  },
];


/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (str: string, shift = 0): AtomSpec[] => [...str].map((id, i) => ({ id, label: id, hue: i + shift }));
/** Tower variables: TW('xy') → x, y as solid ∈G (or ∈ℤ) variables. */
const TW = (str: string, sort: 'G' | 'Z' = 'G', shift = 2): AtomSpec[] => [...str].map((id, i) => ({ id, label: id, hue: i + shift, sort }));

/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {
  'P11.2': [
    {
      title: 'Powers of one element',
      body: 'All the powers of one element $x$ have the same base, so their exponents are ordinary integers. The integers $i + j$ and $j + i$ are equal, so any two powers of $x$ commute. The checker multiplies out exponent arithmetic for you, for instance $(i + j)m = im + jm$.',
      figures: [{ k: 'math', atoms: [...TW('x', 'G', 0), ...TW('ij', 'Z', 4)], rows: [
        { seq: ['x^(i)x^(j)', '=', 'x^(i+j)', '=', 'x^(j+i)', '=', 'x^(j)x^(i)'] },
      ] }],
    },
    {
      title: 'Powers do not distribute',
      body: 'In S₃, take $a = (12)$ and $b = (23)$. Then $a^2b^2 = e$, but $(ab)^2 \\neq e$. So $(uv)^n = u^nv^n$ is not a rule in general. This order proves it does hold when $u$ and $v$ are powers of one element.',
      figures: [{ k: 'table', group: 'S₃' }],
    },
  ],

  'P11.3': [
    {
      title: 'One-to-one and onto',
      body: 'A rule on a group is **one-to-one** if two different elements never go to the same place, and **onto** if every element is reached. In the clock ℤ₇, written additively, tripling sends the positions 0 to 6 to 0, 3, 6, 2, 5, 1, 4. All seven are different, so tripling is both.',
      figures: [{ k: 'clock', n: 7 }],
    },
    {
      title: 'The missing dock',
      body: 'Squaring also respects products: $(uv)^2 = u^2v^2$ when $u$ and $v$ are powers of one element. That is the previous order with $m = 2$, so it is not asked again. Together the three properties make squaring an **automorphism**, an isomorphism of the group onto itself.',
    },
  ],
};
