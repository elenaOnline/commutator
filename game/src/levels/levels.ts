// LEMMA WORKS — campaign data. Architect-owned (design data). Terms are written
// already normalized with local builders so this module never depends on kernel
// bodies at import time.
import type { Card, LevelManifest, Monomial, Pallet, PatFact, Poly, Schema, Term, Toolset } from '../kernel/types';

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
const x = M('x'), y = M('y'), u = M('u'), v = M('v'), w = M('w');

// ── Phase B exponents: canonical polynomials written by hand (sparse, sorted by (kind, id), no zero
// coefficients, decimal-string coefficients; see sol-exponents.md §2.2). cards.test.ts checks they are
// norm-stable. ──
const zm = (id: string): Monomial[number] => ({ ref: { k: 'zmeta', id }, degree: 1 });
const Z = (coefficient: number, ...monomial: Monomial): Poly => [{ coefficient: String(coefficient), monomial }];
/** base^exp, one factor of its enclosing word (never expanded). */
const PW = (base: Term, exp: Poly): Term => ({ k: 'pow', base, exp });

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
  // Legacy (v3 / early v4 saves): S01 no longer unlocks it and no level lists it. Since v4 r2 the player
  // proves, saves and reuses their OWN Double Flip from the Lemma Book. Kept so old saves still resolve.
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

const CH1 = ['witness', 'cancel', 'socks']; // v4 r2: no 'dbl' — the player's authored Double Flip replaces it

// ───────────────────────────── Levels ─────────────────────────────

export const LEVELS: LevelManifest[] = [
  {
    id: 'L01', index: 1, chapter: 1, title: 'First Light',
    memo: 'Calibration run. Make the right rail read b.',
    atoms: atomsAB, givens: [],
    sockets: [{ id: 's', target: eq(P(I(a), a, b), b), allowedGivens: [] }],
    tools: none, preStarts: [P(I(a), a, b)], unlocks: [],
    idea: 'Spool → Rewriter (cancel) → dock.', par: { parts: 1, axioms: 2 }, uses: [],
  },
  {
    id: 'L02', index: 2, chapter: 1, title: 'Another Identity',
    memo: 'Security flagged e′, posing as the identity. Settle it.',
    atoms: [{ id: 'e1', label: 'e′', hue: 3 }],
    givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(e1, x), r: x } }],
    sockets: [{ id: 's', target: eq(e1, e), allowedGivens: ['H'] }],
    tools: none, unlocks: [],
    idea: 'Insert e, then use H at x = e.', par: { parts: 2, axioms: 2 }, uses: ['L01'],
  },
  {
    id: 'L03', index: 3, chapter: 1, title: 'Inverse Is Unique',
    memo: 'Part b claims to undo part a. Prove b is a⁻¹.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b), e) }],
    sockets: [{ id: 's', target: eq(b, I(a)), allowedGivens: ['h'] }],
    tools: none, unlocks: ['witness'],
    idea: 'Insert a⁻¹a, then cite h.', par: { parts: 2, axioms: 4 }, uses: ['L02'],
  },
  {
    // v4 Toolsmith: the general theorem ∀x,y. (xy)⁵ = e ⇒ (yx)⁵ = e. No givens and no level
    // constants: Towers x₁, y₁ outside an Assume room (desk (x₁y₁)⁵ = e); inside, Spool (y₁x₁)⁵ →
    // insert pair x₁⁻¹x₁ at the right rail's left edge → Rewriter routed from the desk at the middle
    // bracket → cancel → gate; outside, gate → ∀ → dock (design/v4/reviews/astra-adversary-v4-design.md §4).
    id: 'L04', index: 4, chapter: 1, title: 'Conjugate Pair',
    memo: 'If the xy-line resets every five turns, so does yx. Certify it for every pair.',
    atoms: [],
    givens: [],
    sockets: [{ id: 's', target: cond(['x', 'y'], [peq(rep(P(x, y), 5), e)], peq(rep(P(y, x), 5), e)), allowedGivens: [] }],
    tools: tools({ lift: true, schemas: CH1 }), unlocks: [],
    idea: 'Belt the desk’s fact into a Rewriter.',
    par: { parts: 4, axioms: 6 }, // v4: parts measured from the reference solution; axioms approximate
    uses: ['T01'],
  },
  {
    id: 'L05', index: 5, chapter: 1, title: 'Cancellation',
    memo: 'Two assemblies match with an a bolted on front. Certify the parts underneath match.',
    atoms: [...atomsAB, { id: 'c', label: 'c', hue: 2 }],
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b), P(a, c)) }],
    sockets: [{ id: 's', target: eq(b, c), allowedGivens: ['h'] }],
    tools: tools({ lift: true, schemas: ['witness'] }), unlocks: ['cancel'],
    idea: 'Multiply both sides by a⁻¹.', par: { parts: 3, axioms: 5 }, uses: ['L03'],
  },
  {
    id: 'L06', index: 6, chapter: 1, title: 'Shoes and Socks',
    memo: 'Customers keep removing socks before shoes. Write down the right return order.',
    atoms: atomsAB, givens: [],
    sockets: [{ id: 's', target: eq(I(P(a, b)), P(I(b), I(a))), allowedGivens: [] }],
    tools: tools({ lift: true, schemas: ['witness', 'cancel'], conjecture: true }), unlocks: ['socks'],
    predict: [eq(I(P(a, b)), P(I(a), I(b))), eq(I(P(a, b)), P(I(b), I(a)))],
    idea: 'Build what undoes ab. The Witness Stamp names it.', par: { parts: 3, axioms: 8 }, uses: ['L03', 'L05'],
  },
  {
    id: 'L07', index: 7, chapter: 1, title: 'Squares Distribute',
    memo: 'Inspection found (ab)² = a²b². Accounting suspects a and b commute.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(P(a, b, a, b), P(a, a, b, b)) }],
    sockets: [{ id: 's', target: eq(P(a, b), P(b, a)), allowedGivens: ['h'] }],
    tools: tools({ lift: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'One Cancel Lathe per side.', par: { parts: 2, axioms: 11 }, uses: ['L05'],
  },
  {
    id: 'L08', index: 8, chapter: 2, title: 'Every Square Is e',
    memo: 'Every part run twice returns to idle. Show assembly order never matters.',
    atoms: atomsAB,
    givens: [{ id: 'H', name: 'H', fact: { k: 'law', metas: ['x'], l: P(x, x), r: e } }],
    sockets: [{ id: 's', target: eq(P(a, b), P(b, a)), allowedGivens: ['H'] }],
    tools: tools({ lift: true, schemas: CH1, conjecture: true }), unlocks: [],
    predict: [eq(P(a, b), P(b, a)), eq(a, b), eq(I(a), a)],
    idea: 'Use H at x = ab.', par: { parts: 3, axioms: 6 }, uses: ['L02'],
  },
  {
    id: 'L09', index: 9, chapter: 2, title: 'No Fixed Points',
    memo: 'Unit a is not idle. Prove it moves every part it touches.',
    atoms: atomsAB,
    givens: [{ id: 'n', name: 'n', fact: neq(a, e) }],
    sockets: [{ id: 's', target: neq(P(a, b), b), allowedGivens: ['n'] }],
    tools: tools({ lift: true, suppose: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Suppose ab = b. Clash. Leave by the gate.', par: { parts: 3, axioms: 8 }, uses: ['L05'],
  },
  {
    id: 'L10', index: 10, chapter: 2, title: 'The Only Idler',
    memo: 'Unit a fixes every non-idle part. Prove a itself is idle.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [{ id: 'H', name: 'H', fact: cond(['x'], [pneq(x, e)], peq(P(a, x), x)) }],
    sockets: [{ id: 's', target: eq(a, e), allowedGivens: ['H'] }],
    tools: tools({ lift: true, suppose: true, classical: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Suppose a ≠ e. That is H’s premise.', par: { parts: 4, axioms: 9 }, uses: ['L09', 'L05'],
  },
  {
    id: 'R01', index: 11, chapter: 3, title: 'Shared Return',
    memo: 'Unit a resets every four turns and every six. Ship two certificates from one part.',
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
    idea: 'Branch one belt to two docks.', par: { parts: 3, axioms: 8 }, uses: ['L03', 'L10'],
  },
  {
    id: 'L11', index: 12, chapter: 3, title: 'Clockwork',
    memo: 'In a five-part plant, a resets every three turns. Show a is idle.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [
      { id: 's', name: '|G|', fact: { k: 'size', n: 5 } },
      { id: 'h', name: 'h', fact: eq(rep(a, 3), e) },
    ],
    sockets: [{ id: 's', target: eq(a, e), allowedGivens: ['s', 'h'] }],
    tools: tools({ lift: true, press: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'Lagrange (imported): x⁵ = e.', par: { parts: 4, axioms: 6 }, uses: ['R01'],
  },
  {
    id: 'L12', index: 13, chapter: 3, title: 'Prime Time',
    memo: 'Seven-part plant, and ba is not idle. Prove ab cannot reset in three turns.',
    atoms: atomsAB,
    givens: [
      { id: 's', name: '|G|', fact: { k: 'size', n: 7 } },
      { id: 'n', name: 'n', fact: neq(P(b, a), e) },
    ],
    sockets: [{ id: 's', target: neq(rep(P(a, b), 3), e), allowedGivens: ['s', 'n'] }],
    tools: tools({ lift: true, suppose: true, press: true, schemas: CH1, conjecture: true }), unlocks: [],
    idea: 'A room, Lagrange, the Witness Stamp, a branched belt.', par: { parts: 8, axioms: 14 }, uses: ['L11', 'L09', 'L03'],
  },
  {
    // v4 Toolsmith, main path (was a side order; id kept). First ∀ goal: ∀x. (x⁻¹)⁻¹ = x.
    // Layout: Tower x₁ above Spool(x₁⁻¹x₁) → Rewriter(cancel, right rail) → Theorem(Witness, cut
    // x₁⁻¹ | x₁) → Operator(swap) → ∀ → dock. v4 r2: unlocks nothing — the lesson is prove → SAVE →
    // reuse; the HUD ceremony offers a prefilled save named "Double Flip", needed by T01 and T02.
    id: 'S01', index: 4, chapter: 1, title: 'Undo the Undo',
    memo: 'Undoing an undo should change nothing. Prove it for every part, then save it.',
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'law', metas: ['x'], l: I(I(x)), r: x }, allowedGivens: [] }],
    tools: tools({ lift: true, schemas: ['witness'] }), unlocks: [],
    idea: 'Tower x, prove it, ∀, then save.',
    par: { parts: 4, axioms: 6 }, // v4: parts measured from the reference solution; axioms approximate
    uses: ['L03'],
  },
  {
    // v4 Toolsmith: Assume-gate practice before Conjugate Pair, and the first reuse of the player's
    // SAVED Double Flip (authored lemma; no built-in 'dbl'). ∀x,y. x⁻¹ = y ⇒ x = y⁻¹. Towers x₁, y₁;
    // Assume room (desk x₁⁻¹ = y₁) → Operator(invert) → Rewriter(your Double Flip at x₁) → gate;
    // outside, gate → ∀ → dock. Recovery: no Double Flip in the book → replay S01 and save it.
    id: 'T01', index: 5, chapter: 1, title: 'Matched Pair',
    memo: 'If y undoes x, then x undoes y. Use the lemma you saved.',
    atoms: [], givens: [],
    sockets: [{ id: 's', target: cond(['x', 'y'], [peq(I(x), y)], peq(x, I(y))), allowedGivens: [] }],
    tools: tools({ lift: true, schemas: ['witness'] }), unlocks: [],
    idea: 'Assume the “if” in a room. ∀ goes outside.',
    par: { parts: 3, axioms: 2 }, // v4: parts measured from the reference solution; axioms approximate
    uses: ['S01'],
  },
  {
    // v4 r2 reuse order: the saved Double Flip at a COMPOUND element, composed with the earned Sock Drawer.
    // ∀x,y. (y⁻¹x⁻¹)⁻¹ = xy. Intended factory (kernel-checked, authored Double Flip in the registry):
    // Towers x₁, y₁. Spool (y₁⁻¹x₁⁻¹)⁻¹ → Rewriter Sock Drawer BACKWARDS inside the crate (path [0],
    // u = x₁, v = y₁): y₁⁻¹x₁⁻¹ → (x₁y₁)⁻¹, so the rail reads ((x₁y₁)⁻¹)⁻¹ → Rewriter, your Double Flip
    // at u = x₁y₁ → x₁y₁ → ∀ → dock. Placed after L06 because it needs Sock Drawer.
    id: 'T02', index: 7, chapter: 1, title: 'Returning a Return',
    memo: 'Someone is returning a return. Show it lands back at xy.',
    atoms: [], givens: [],
    sockets: [{ id: 's', target: { k: 'law', metas: ['x', 'y'], l: I(P(I(y), I(x))), r: P(x, y) }, allowedGivens: [] }],
    tools: tools({ lift: true, schemas: CH1 }), unlocks: [],
    idea: 'Sock Drawer backwards, then your Double Flip.',
    par: { parts: 3, axioms: 0 }, // v4: parts measured from the reference solution
    uses: ['L06', 'T01'],
  },
  // ─────────── Chapter IV · Powers (v4 Phase B, design/v4/proposals/sol-exponents.md §7) ───────────
  // Power imports are available only where listed in tools.schemas (kernel-owned, src/kernel/powers.ts).
  {
    // §7.2 literal-to-symbolic bridge. Tower k₁:ℤ. Spool (ab)^(5k₁) → Rewriter power.multiply reversed
    // (x = ab, m = 5, n = k₁) → power.literal:5 inside the base → h → power.identity → ∀ → dock.
    id: 'B01', index: 16, chapter: 4, title: 'Every Fifth Shift',
    memo: 'The ab-line resets every five turns. Certify every multiple of five, negatives included.',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(rep(P(a, b), 5), e) }],
    sockets: [{ id: 's', target: { k: 'law', metas: ['k'], l: PW(P(a, b), Z(5, zm('k'))), r: e }, allowedGivens: ['h'] }],
    tools: tools({ lift: true, schemas: [...CH1, 'power.multiply', 'power.literal:5', 'power.identity'] }), unlocks: [],
    idea: '(ab)⁵ᵏ = ((ab)⁵)ᵏ, and eᵏ = e.',
    par: { parts: 6, axioms: 2 }, // TODO(v4 Phase B): conservative guess; par needs re-measuring on the v4 floor
    uses: ['L04'],
  },
  {
    // §7.3 authored generic lemma. Towers x₁:G, n₁,k₁:ℤ; Assume room (desk x₁^n₁ = e): Spool x₁^(n₁k₁)
    // → power.multiply reversed → desk (routed) inside the base → power.identity → gate → ∀ → dock.
    id: 'B02', index: 17, chapter: 4, title: 'Reset Multipliers',
    memo: 'A reset after n turns repeats after any multiple of n. Build that tool once.',
    atoms: [], givens: [],
    sockets: [{ id: 's', target: cond(['x', 'n', 'k'], [peq(PW(x, Z(1, zm('n'))), e)], peq(PW(x, Z(1, zm('k'), zm('n'))), e)), allowedGivens: [] }],
    tools: tools({ lift: true, schemas: [...CH1, 'power.multiply', 'power.identity'] }), unlocks: [],
    idea: 'Cite the desk inside the power.',
    par: { parts: 6, axioms: 2 }, // TODO(v4 Phase B): conservative guess; par needs re-measuring on the v4 floor
    uses: ['B01'],
  },
  {
    // §7.4 generic Conjugate Pair. Towers x₁,y₁:G, n₁:ℤ; Assume room (desk (x₁y₁)^n₁ = e): Spool
    // (y₁x₁)^n₁ → open the frame x₁⁻¹x₁ before y₁ in the base → power.conjugate (u = x₁, v = x₁y₁)
    // → desk (routed) → unit, cancel → gate → ∀ → dock. L04 must NOT list power.conjugate.
    id: 'B03', index: 18, chapter: 4, title: 'Conjugate Pair, Any Shift',
    memo: 'Conjugate Pair again, for any count. Negative counts included.',
    atoms: [], givens: [],
    sockets: [{ id: 's', target: cond(['x', 'y', 'n'], [peq(PW(P(x, y), Z(1, zm('n'))), e)], peq(PW(P(y, x), Z(1, zm('n'))), e)), allowedGivens: [] }],
    tools: tools({ lift: true, schemas: [...CH1, 'power.conjugate'] }), unlocks: [],
    idea: 'Conjugate Power moves the exponent through a frame.',
    par: { parts: 9, axioms: 5 }, // TODO(v4 Phase B): conservative guess; par needs re-measuring on the v4 floor
    uses: ['B02'],
  },
  {
    // §7.5 honest cardinality. Spool a^(5) (a power node) → Rewriter with the guarded Lagrange import
    // (tools.press; it resolves the size given s) → dock. The certificate depends on s.
    id: 'B04', index: 19, chapter: 4, title: 'The Finite Plant',
    memo: 'A five-part plant. Prove a resets after |G| turns, citing the plant size.',
    atoms: [{ id: 'a', label: 'a', hue: 0 }],
    givens: [{ id: 's', name: '|G|', fact: { k: 'size', n: 5 } }],
    sockets: [{ id: 's', target: eq(PW(a, Z(5)), e), allowedGivens: ['s'] }],
    tools: tools({ lift: true, press: true, schemas: CH1 }), unlocks: [],
    idea: 'Lagrange needs the size as a given.',
    par: { parts: 2, axioms: 1 }, // TODO(v4 Phase B): conservative guess; par needs re-measuring on the v4 floor
    uses: ['L11'],
  },
  // ── side orders ──
  {
    id: 'S02', index: 15, chapter: 1, side: true, title: 'Disguised Clock',
    memo: 'Unit a resets every three turns. Wrapped in b and b⁻¹, does it still reset?',
    atoms: atomsAB,
    givens: [{ id: 'h', name: 'h', fact: eq(rep(a, 3), e) }],
    sockets: [{ id: 's', target: eq(rep(P(b, a, I(b)), 3), e), allowedGivens: ['h'] }],
    tools: tools({ lift: true, schemas: CH1 }), unlocks: [],
    idea: 'Inner b⁻¹b pairs cancel.', par: { parts: 4, axioms: 7 }, uses: ['L06'],
  },
];

// v4 campaign order (design/v4/DESIGN.md §4 + Astra's v4 review §4): the Toolsmith pair (Undo the
// Undo, Matched Pair) follows Inverse Is Unique; Conjugate Pair stays after Shoes and Socks as the
// second room + ∀ lesson. S02 remains a side order.
const V4_ORDER = ['L01', 'L02', 'L03', 'S01', 'T01', 'L05', 'L06', 'T02', 'L04', 'L07', 'L08', 'L09', 'L10', 'R01', 'L11', 'L12', 'B01', 'B02', 'B03', 'B04', 'S02'];
LEVELS.sort((p, q) => V4_ORDER.indexOf(p.id) - V4_ORDER.indexOf(q.id));
LEVELS.forEach((l, i) => { l.index = i + 1; });

export const LEVEL_BY_ID: Record<string, LevelManifest> = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

// Keep unused builders referenced (c/w used by future levels).
void c; void w;
