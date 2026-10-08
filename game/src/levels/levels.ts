// LEMMA WORKS — campaign data. Architect-owned (design data). Terms are written
// already normalized with local builders so this module never depends on kernel
// bodies at import time.
import type { Card, LevelManifest, Pallet, PatFact, Schema, Term, Toolset } from '../kernel/types';

// ── local builders (produce normalized terms) ──
const A = (id: string): Term => ({ k: 'atom', id });
const M = (id: string): Term => ({ k: 'meta', id });
const e: Term = { k: 'e' };
const I = (t: Term): Term => ({ k: 'inv', arg: t });
/** flat product; flattens one level of nested mul and collapses singletons */
const P = (...fs: Term[]): Term => {
  const flat = fs.flatMap((f) => (f.k === 'mul' ? f.fs : [f]));
  return flat.length === 1 ? flat[0]! : { k: 'mul', fs: flat };
};
const rep = (t: Term, n: number): Term => P(...Array.from({ length: n }, () => t));
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const neq = (l: Term, r: Term): Pallet => ({ k: 'neq', l, r });
const peq = (l: Term, r: Term): PatFact => ({ k: 'eq', l, r });
const pneq = (l: Term, r: Term): PatFact => ({ k: 'neq', l, r });

const a = A('a'), b = A('b'), c = A('c'), e1 = A('e1');
const x = M('x'), u = M('u'), v = M('v'), w = M('w');

const atomsAB = [
  { id: 'a', label: 'a', hue: 0 },
  { id: 'b', label: 'b', hue: 1 },
];

const none: Toolset = {
  lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false,
};
const tools = (t: Partial<Toolset>): Toolset => ({ ...none, ...t });

// ───────────────────────────── Registry ─────────────────────────────

const cond = (metas: string[], premises: PatFact[], concl: PatFact): Card => ({ k: 'cond', metas, premises, concl });

export const REGISTRY: Record<string, Schema> = {
  witness: {
    id: 'witness', name: 'Witness Stamp', textbook: 'uniqueness of inverses',
    card: cond(['u', 'v'], [peq(P(u, v), e)], peq(v, I(u))),
    origin: 'earned', fromLevel: 'L03', mirrorable: true,
  },
  cancel: {
    id: 'cancel', name: 'Cancel Lathe', textbook: 'left cancellation',
    card: cond(['u', 'v', 'w'], [peq(P(u, v), P(u, w))], peq(v, w)),
    origin: 'earned', fromLevel: 'L05', mirrorable: true,
  },
  socks: {
    id: 'socks', name: 'Sock Drawer', textbook: 'inverse of a product',
    card: { k: 'law', metas: ['u', 'v'], l: I(P(u, v)), r: P(I(v), I(u)) },
    origin: 'earned', fromLevel: 'L06', mirrorable: false,
  },
  nofix: {
    id: 'nofix', name: 'Fixed-Point Gate', textbook: 'nontrivial translations have no fixed points',
    card: cond(['u', 'v'], [pneq(u, e)], pneq(P(u, v), v)),
    origin: 'earned', fromLevel: 'L09', mirrorable: true,
  },
  dbl: {
    id: 'dbl', name: 'Double Flip', textbook: 'inverse of an inverse',
    card: { k: 'law', metas: ['u'], l: I(I(u)), r: u },
    origin: 'earned', fromLevel: 'S01', mirrorable: false,
  },
};

/** Mirror labels for the floor. */
export const MIRROR_NAMES: Record<string, { name: string; textbook: string }> = {
  witness: { name: 'Witness Stamp ᵒᵖ', textbook: 'uniqueness of inverses (left)' },
  cancel: { name: 'Cancel Lathe ᵒᵖ', textbook: 'right cancellation' },
  nofix: { name: 'Fixed-Point Gate ᵒᵖ', textbook: 'nontrivial translations have no fixed points (right)' },
};

const CH1 = ['witness', 'cancel', 'socks'];

// ───────────────────────────── Levels ─────────────────────────────

export const LEVELS: LevelManifest[] = [
  {
    id: 'L01', index: 1, chapter: 1, title: 'First Light',
    memo: 'Calibration run. The line is pre-loaded; make the right-hand rail read b.',
    atoms: atomsAB, givens: [],
    sockets: [{ id: 's', target: eq(P(I(a), a, b), b), allowedGivens: [] }],
    tools: none, preStarts: [P(I(a), a, b)], unlocks: [],
    idea: 'Select a span; cancel.', par: { parts: 1, axioms: 2 }, uses: [],
  },
  {
    id: 'L02', index: 2, chapter: 1, title: 'Another Identity',
    memo: 'Security flagged an element, e′, claiming to be the identity. Either it is e, or we have a problem. Settle it.',
    atoms: [{ id: 'e1', label: 'e′', hue: 3 }],
    givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(e1, x), r: x } }],
    sockets: [{ id: 's', target: eq(e1, e), allowedGivens: ['H'] }],
    tools: none, unlocks: [],
    idea: 'Insert e into a gap; cite a law at x = e.', par: { parts: 2, axioms: 2 }, uses: ['L01'],
  },
  {
    id: 'L03', index: 3, chapter: 1, title: 'Inverse Is Unique',
    memo: 'Part b claims to undo part a. We already stock a⁻¹. Prove they are the same part.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b), e) }],
    sockets: [{ id: 's', target: eq(b, I(a)), allowedGivens: ['h'] }],
    tools: none, unlocks: ['witness'],
    idea: 'Insert a chosen pair x⁻¹x where it helps.', par: { parts: 2, axioms: 4 }, uses: ['L02'],
  },
  {
    id: 'L04', index: 4, chapter: 1, title: 'Conjugate Pair',
    memo: 'The ab-line resets every five turns. The ba-line wants the same guarantee in writing.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(rep(P(a, b), 5), e) }],
    sockets: [{ id: 's', target: eq(rep(P(b, a), 5), e), allowedGivens: ['h'] }],
    tools: tools({ schemas: ['witness'] }), unlocks: [],
    idea: 'A bead string can be re-read in a shifted frame.', par: { parts: 3, axioms: 5 }, uses: ['L03'],
  },
  {
    id: 'L05', index: 5, chapter: 1, title: 'Cancellation',
    memo: 'Two assemblies match after an a is bolted on the front. Certify the parts underneath match.',
    atoms: [...atomsAB, { id: 'c', label: 'c', hue: 2 }],
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b), P(a, c)) }],
    sockets: [{ id: 's', target: eq(b, c), allowedGivens: ['h'] }],
    tools: tools({ lift: true, schemas: ['witness'] }), unlocks: ['cancel'],
    idea: 'Multiply both sides.', par: { parts: 3, axioms: 5 }, uses: ['L03'],
  },
  {
    id: 'L06', index: 6, chapter: 1, title: 'Shoes and Socks',
    memo: 'Returns desk: customers keep trying to remove their socks with their shoes still on. Write down the correct return order.',
    atoms: atomsAB, givens: [],
    sockets: [{ id: 's', target: eq(I(P(a, b)), P(I(b), I(a))), allowedGivens: [] }],
    tools: tools({ lift: true, schemas: ['witness', 'cancel'], conjecture: true }), unlocks: ['socks'],
    predict: [eq(I(P(a, b)), P(I(a), I(b))), eq(I(P(a, b)), P(I(b), I(a)))],
    idea: 'Inverse crates are sealed — build the witness.', par: { parts: 3, axioms: 8 }, uses: ['L03', 'L05'],
  },
  {
    id: 'L07', index: 7, chapter: 1, title: 'Squares Distribute',
    memo: 'Inspection found (ab)² = a²b² on this line. Accounting suspects the line is commutative.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b, a, b), P(a, a, b, b)) }],
    sockets: [{ id: 's', target: eq(P(a, b), P(b, a)), allowedGivens: ['h'] }],
    tools: tools({ lift: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Feed your machines — one lathe per side.', par: { parts: 2, axioms: 11 }, uses: ['L05'],
  },
  {
    id: 'L08', index: 8, chapter: 2, title: 'Every Square Is e',
    memo: 'In this plant every part, run twice, returns to idle. Show that the order of assembly never matters.',
    atoms: atomsAB,
    givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(x, x), r: e } }],
    sockets: [{ id: 's', target: eq(P(a, b), P(b, a)), allowedGivens: ['H'] }],
    tools: tools({ lift: true, schemas: CH1, conjecture: true }), unlocks: [],
    predict: [eq(P(a, b), P(b, a)), eq(a, b), eq(I(a), a)],
    idea: 'Instantiate a law at a compound element.', par: { parts: 3, axioms: 6 }, uses: ['L02'],
  },
  {
    id: 'L09', index: 9, chapter: 2, title: 'No Fixed Points',
    memo: 'Unit a is not idle. Prove it moves every part it touches.',
    atoms: atomsAB,
    givens: [{ id: 'n', name: 'n', fact: neq(a, e) }],
    sockets: [{ id: 's', target: neq(P(a, b), b), allowedGivens: ['n'] }],
    tools: tools({ lift: true, suppose: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Suppose the opposite; make it clash.', par: { parts: 3, axioms: 8 }, uses: ['L05'],
  },
  {
    id: 'L10', index: 10, chapter: 2, title: 'The Only Idler',
    memo: 'Unit a leaves every non-idle part where it found it. Accounting insists a itself is idle. Prove accounting right.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [{ id: 'H', name: 'H', fact: cond(['x'], [pneq(x, e)], peq(P(a, x), x)) }],
    sockets: [{ id: 's', target: eq(a, e), allowedGivens: ['H'] }],
    tools: tools({ lift: true, suppose: true, classical: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Assume the negation; it is the key to the machine.', par: { parts: 4, axioms: 9 }, uses: ['L09', 'L05'],
  },
  {
    id: 'R01', index: 11, chapter: 3, title: 'Shared Return',
    memo: 'Unit a resets every four turns and every six. Ship two certificates; one part can feed the other line.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [
      { id: 'h4', name: 'h₄', fact: eq(rep(a, 4), e) },
      { id: 'h6', name: 'h₆', fact: eq(rep(a, 6), e) },
    ],
    sockets: [
      { id: 's', target: eq(rep(a, 2), e), allowedGivens: ['h4', 'h6'] },
      { id: 't', target: eq(I(a), a), allowedGivens: ['h4', 'h6'] },
    ],
    tools: tools({ lift: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'One intermediate product, two consumers.', par: { parts: 3, axioms: 8 }, uses: ['L03', 'L10'],
  },
  {
    id: 'L11', index: 12, chapter: 3, title: 'Clockwork',
    memo: 'A five-part plant. Unit a also resets every three turns. Show a is idle.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [
      { id: 's', name: '|G|', fact: { k: 'size', n: 5 } },
      { id: 'h', name: 'h', fact: eq(rep(a, 3), e) },
    ],
    sockets: [{ id: 's', target: eq(a, e), allowedGivens: ['s', 'h'] }],
    tools: tools({ lift: true, press: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Lagrange: in a group of order n, xⁿ = e.', par: { parts: 4, axioms: 6 }, uses: ['R01'],
  },
  {
    id: 'L12', index: 13, chapter: 3, title: 'Prime Time',
    memo: 'Seven-part plant. We know ba is not idle. Prove ab cannot reset in three turns.',
    atoms: atomsAB,
    givens: [
      { id: 's', name: '|G|', fact: { k: 'size', n: 7 } },
      { id: 'n', name: 'n', fact: neq(P(b, a), e) },
    ],
    sockets: [{ id: 's', target: neq(rep(P(a, b), 3), e), allowedGivens: ['s', 'n'] }],
    tools: tools({ lift: true, suppose: true, press: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Everything at once: room, press, stamp, a second belt.', par: { parts: 8, axioms: 14 }, uses: ['L11', 'L09', 'L03'],
  },
  // ── side orders ──
  {
    id: 'S01', index: 14, chapter: 1, side: true, title: 'Undo the Undo',
    memo: 'Side order: undoing an undo should be a no-op. Certify it.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }], givens: [],
    sockets: [{ id: 's', target: eq(I(I(a)), a), allowedGivens: [] }],
    tools: tools({ lift: true, schemas: ['witness', 'cancel'] }), unlocks: ['dbl'],
    idea: 'Feed the Witness Stamp a compound part.', par: { parts: 2, axioms: 6 }, uses: ['L03'],
  },
  {
    id: 'S02', index: 15, chapter: 1, side: true, title: 'Disguised Clock',
    memo: 'Side order: a resets every three turns. Someone wrapped it in b and b⁻¹. Does it still reset?',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(rep(a, 3), e) }],
    sockets: [{ id: 's', target: eq(rep(P(b, a, I(b)), 3), e), allowedGivens: ['h'] }],
    tools: tools({ lift: true, schemas: CH1 }), unlocks: [],
    idea: 'Neighbouring b⁻¹b pairs collapse.', par: { parts: 4, axioms: 7 }, uses: ['L06'],
  },
];

// v3 campaign order (design/v3/DESIGN.md): Conjugate Pair moves after Shoes and Socks.
const V3_ORDER = ['L01', 'L02', 'L03', 'L05', 'L06', 'L04', 'L07', 'L08', 'L09', 'L10', 'R01', 'L11', 'L12', 'S01', 'S02'];
LEVELS.sort((x, y) => V3_ORDER.indexOf(x.id) - V3_ORDER.indexOf(y.id));
LEVELS.forEach((l, i) => { l.index = i + 1; });

export const LEVEL_BY_ID: Record<string, LevelManifest> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

// Keep unused builders referenced (c/w used by future levels).
void c; void w;
