// COMMUTATOR — concept cards (review 2026-10: design/review-2026-10/, copy from prototypes/cm-cards.js).
//
// Shown on first entry to a level and reopenable from the order chip, a jam or a lens. The working norms
// (design/review-2026-10/DESIGN_NORMS.md) are binding:
//   · never give away a level's own solution: teach the technique on other letters or another statement;
//   · the real maths term (commute, associativity, identity, inverse, left/right cancellation …);
//   · TERMS, never beads; no → in maths (= for equal terms, ⟹ for implication);
//   · parentheses whenever they help; define every symbol where it first appears (⊥ ⟹ ∀ ∈ ∎ ℤ |G| ⊢ ⊣);
//   · a figure earns its place or is cut; mechanics are rendered game states, behaviour over time a "gif";
//   · tone: T01's "If … then" paragraph, an intro-to-proof syllabus.
//
// Text is markdown: **bold** only (never with maths inside), maths in $…$ (TeX-ish: a^{-1}, x_1, \forall,
// \implies (⟹, never ⇒), \neq, \bot, \in, \;, \mathbb{Z} …). Body text comes before the figures.
//
// FIGURE TERM STRINGS use the kernel's term syntax ('a^-1ab', 'e′e', 'x^(5)' a power stack, 'x^5' the
// five-term word) against the figure's `atoms` (or the level's atoms when omitted). Written parentheses
// that are not followed by ^ stay as display-only groups (the kernel flattens them): '(a^-1a)b'.
// Braces are [from, to, label, side] over TOP-LEVEL display factors (a group counts as one factor).
//
// `machines` vocabulary: MachineKind strings ('spool', 'rewriter', 'operator', 'joiner', 'theorem',
// 'tower', 'forall', 'carddock', 'gate') plus 'room:suppose', 'room:classical', 'room:assume', 'lemmabook'.
import type { JoinerRecipe, LibRef } from '../factory/types';

/** A letter a figure draws. `sort` marks a Tower variable (solid violet ∈G / teal ∈ℤ fill). */
export interface AtomSpec { id: string; label: string; hue: number; sort?: 'G' | 'Z' }
/** [from, to) top-level factor indices, an inline-markdown label, and the side (default under). */
export type BraceSpec = [number, number, string, ('over' | 'under')?];
/** A cell of a maths row: a relation ('=', '≠', '⟹', ','), a term string, or a term with braces. */
export type MathCell = string | { t: string; br: BraceSpec[] };
export interface MathRow { label?: string; seq: MathCell[]; strike?: boolean; why?: string }

/** A machine on a card scene, in the compact form the renderer completes into a real MachineConfig. */
export type SceneConfig =
  | { kind: 'spool' } | { kind: 'forall' } | { kind: 'desk' } | { kind: 'gate' }
  | { kind: 'tower'; label: string; sort: 'G' | 'Z' }
  | { kind: 'given'; givenId: string }
  | { kind: 'rewriter'; recipe: { k: 'cancel' } | { k: 'insertE' } | { k: 'routed' } | { k: 'law'; ref: LibRef } | null; dir?: 'fwd' | 'rev' }
  | { kind: 'operator'; recipe: { k: 'multiply'; side: 'left' | 'right' } | { k: 'invert' } | { k: 'swap' } | null }
  | { kind: 'joiner'; recipe: JoinerRecipe | null }
  | { kind: 'theorem'; recipe: { k: 'library'; ref: LibRef } | { k: 'routed' } | null };
export type GridPt = [number, number] | [number, number, number];
export interface SceneSpec {
  /** Grid position of the footprint's min corner (fractions allowed), unrotated. */
  machines: { x: number; y: number; config: SceneConfig; pip?: 'working'; open?: string[] }[];
  /** Belt centre lines through grid points, output edge first. */
  belts?: [number, number][][];
  rooms?: { x0: number; y0: number; x1: number; y1: number; label: string; kind?: 'assume' | 'suppose' | 'classical' }[];
  /**
   * Term chips for items on the belts: a pin at grid (x, y, z), the chip set beside it. `place` names the side
   * (default 'ne', clear of the machines a belt joins); `off` moves the chip's near corner from the pin, in px
   * (x right, y up), for a longer leader into free space.
   */
  items?: { at: GridPt; t: string; place?: 'ne' | 'nw' | 'se' | 'sw' | 'n' | 's'; off?: [number, number] }[];
  /** Numbered navy markers on the scene, listed in order below it. */
  notes?: { at: GridPt; text: string }[];
  /** Extra grid points to keep inside the frame. */
  extra?: GridPt[];
  /** Max px per world px (default 1.3). */
  scale?: number;
}

export type Figure =
  /** ℤₙ as a clock face (n ≤ 8: the catalogue's cyclic groups). */
  | { k: 'clock'; n: number }
  /** The group's multiplication table (row combined with column). `group` is a catalogue name. */
  | { k: 'table'; group: string }
  /** Each element's order, in a two-row table (Lagrange). */
  | { k: 'orders'; group: string }
  /** Laid-out maths: rows of terms and relations; braces label what changes; struck rows are non-rules. */
  | { k: 'math'; rows: MathRow[]; atoms?: AtomSpec[]; caption?: string }
  /** A rendered floor state (the real floor renderer) with term chips on belts and numbered notes. */
  | { k: 'scene'; spec: SceneSpec; atoms?: AtomSpec[] }
  /** The looping Spool animation: a term, t = t, a belt, a Rewriter (cancel), cc⁻¹ = e. */
  | { k: 'gif' };

export interface ConceptCard {
  title: string;
  body?: string;
  /** Long-form card: navy 14.5px body, and the Worked example / Near miss rows. */
  long?: boolean;
  figures?: Figure[];
  /** Machine kinds this card introduces (see vocabulary above). */
  machines?: string[];
  /** One worked transformation (long cards). */
  example?: string;
  /** One forbidden or tempting-but-wrong move, and why (long cards). */
  nearMiss?: string;
  /** One concrete floor gesture (long cards). */
  gesture?: string;
}

/** Illustrative letters: AT('abc') → a, b, c in shape slots 0, 1, 2 (+ shift). */
const AT = (s: string, shift = 0): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + shift }));
/** Tower variables: TW('xy') → x, y as solid ∈G (or ∈ℤ) variables. */
const TW = (s: string, sort: 'G' | 'Z' = 'G'): AtomSpec[] => [...s].map((id, i) => ({ id, label: id, hue: i + 2, sort }));
const witness: LibRef = { k: 'schema', id: 'witness' };
const cancelL: LibRef = { k: 'schema', id: 'cancel' };
const dbl: LibRef = { k: 'schema', id: 'dbl' };

/** Concept cards per level id, keys in campaign order. Every level has at least one card. */
export const CARDS: Record<string, ConceptCard[]> = {
  // ─────────────────────────── Chapter I · The Works ───────────────────────────
  L01: [
    {
      title: 'What a group is',
      body: 'A group is a collection of elements with one way to combine them, written side by side: $ab$ means $a$ combined with $b$. Every group obeys three rules, and every move a machine makes is one of them. Here $e$ is the **identity** and $a^{-1}$ is the **inverse** of $a$.',
      figures: [{ k: 'math', atoms: AT('abc'), rows: [
        { label: 'associativity', seq: ['(ab)c', '=', 'a(bc)'] },
        { label: 'identity', seq: ['ea', '=', 'a', '=', 'ae'] },
        { label: 'inverses', seq: ['a^-1a', '=', 'e', '=', 'aa^-1'] },
      ] }],
    },
    {
      title: 'Spool and Rewriter',
      body: 'Every proof starts at a Spool, which turns a term $t$ into the equation $t = t$. From there, each machine makes one checked move.',
      machines: ['spool', 'rewriter'],
      figures: [{ k: 'gif' }],
    },
    {
      title: 'What a proof is',
      long: true,
      body: 'A proof is an argument that a statement must be true, using only what was agreed at the start. Here that means the three group rules and any givens listed on the order. If the goal can be reached from those alone, it holds in every group at once: numbers under addition, the symmetries of a square, the shuffles of a deck. Checking examples can never do this, since there are infinitely many groups; a proof covers all of them.\n\nEach move a machine makes is approved by a checker, so a finished proof has no gaps. You are done when the goal is delivered to the **Receiving Dock**, marked ∎, the traditional sign for the end of a proof.',
    },
  ],

  L02: [
    {
      title: 'Is the identity unique?',
      body: 'The rules promise an identity $e$. Could a group have a second one? The given $H$ describes an element $e′$ that changes nothing from the left: $\\forall x.\\; e′x = x$, read “for every $x$, $e′x = x$”. Because $H$ holds for every $x$, you may use it at any element you like. Choosing the right one is the whole trick.',
    },
    {
      title: 'Givens are recipes',
      body: 'A given is a fact you may use as often as you like. Choose it as a Rewriter’s recipe; it never travels by belt. Equations you build do travel by belt.',
      figures: [{ k: 'scene', spec: {
        machines: [{ x: 0, y: 0, config: { kind: 'spool' } }, { x: 3, y: 0, config: { kind: 'rewriter', recipe: { k: 'law', ref: { k: 'given', givenId: 'H' } }, dir: 'fwd' } }],
        belts: [[[1, 0.5], [3, 0.5]], [[5, 0.5], [6.8, 0.5]]],
        items: [{ at: [2, 0.5], t: 'e′e′ = e′e′' }, { at: [6, 0.5], t: 'e′e′ = e′' }],
        notes: [
          { at: [0.5, 0.5, 0.9], text: 'The Spool’s equation travels by belt.' },
          { at: [4, 0.5, 1], text: 'The recipe is the given $H$, picked in the Rewriter’s lens. No belt needed.' },
          { at: [6.8, 0.5, 0], text: '$H$ at $x = e′$ turns $e′e′$ into $e′$.' },
        ] } }],
    },
  ],

  L03: [
    {
      title: 'Inverses are unique',
      body: 'Every element $a$ has an inverse $a^{-1}$, with $a^{-1}a = e = aa^{-1}$. Here $h$ says some $b$ also undoes $a$ from the right: $ab = e$. Must $b$ be $a^{-1}$, or could $a$ have two inverses? A given rewrites its left side wherever that side appears, as in this example with other letters:',
      figures: [{ k: 'math', atoms: AT('xy'), rows: [
        { seq: ['yxy', '=', { t: 'y(xy)', br: [[1, 2, 'given: $xy = e$']] }, '=', { t: 'ye', br: [[1, 2, 'identity']] }, '=', 'y'] },
      ] }],
    },
    {
      title: 'Associative, not commutative',
      body: 'Brackets can move freely. This is associativity, and the floor applies it for you, so a Rewriter can act on any neighbouring terms. Terms cannot trade places, though: group elements need not commute.',
      figures: [{ k: 'math', rows: [
        { seq: ['(a^-1a)b', '=', 'a^-1(ab)'], why: 'Associativity: the same terms, grouped differently.' },
        { seq: ['ab', '=', 'ba'], strike: true, why: 'Not a rule: elements need not commute.' },
      ] }],
    },
    {
      title: 'A proof becomes a theorem',
      body: 'Deliver this goal and it is saved as a theorem, **unique inverse**: $uv = e \\implies v = u^{-1}$. The arrow $\\implies$ reads “implies”. A Theorem machine applies it in one move, so you never prove it again.',
      figures: [{ k: 'scene', atoms: AT('cd', 2), spec: {
        machines: [{ x: 2, y: 0, config: { kind: 'theorem', recipe: { k: 'library', ref: witness } } }],
        belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [5.8, 0.5]]],
        items: [{ at: [1, 0.5], t: 'cd = e' }, { at: [5, 0.5], t: 'd = c^-1' }],
        notes: [
          { at: [3, 0.5, 1.1], text: 'A Theorem machine set to **unique right inverse**.' },
          { at: [5.8, 0.5, 0], text: 'Premise $cd = e$ in, conclusion $d = c^{-1}$ out.' },
        ] } }],
    },
  ],

  S01: [
    {
      title: 'Proving for every x',
      body: 'To prove something about every element, prove it about one element you know nothing about. A Tower declares such an element: $x \\in G$, read “$x$ is an element of $G$”. Since the proof uses no special property of $x$, it works for all elements, and the Generalizer records that: $\\forall x.$ reads “for every $x$”.',
      machines: ['tower', 'forall'],
      figures: [{ k: 'scene', atoms: TW('x'), spec: {
        machines: [{ x: 0, y: 1.6, config: { kind: 'tower', label: 'x', sort: 'G' } }, { x: 2, y: 0, config: { kind: 'forall' } }],
        belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [6, 0.5]]],
        items: [{ at: [1, 0.5], t: 'xx^-1 = e' }, { at: [5.1, 0.5], t: '∀x. xx^-1 = e' }],
        notes: [
          { at: [0.5, 2.1, 1.65], text: 'A **Tower** declares $x \\in G$.' },
          { at: [3, 0.5, 1], text: 'A fact about $x$ arrives at the **Generalizer**.' },
          { at: [6, 0.5, 0], text: 'Out comes $\\forall x.\\; xx^{-1} = e$: true for every element.' },
        ] } }],
    },
    {
      title: 'Save what you prove',
      body: 'When the goal is delivered, save it to the Lemma Book as **double inverse**. A saved theorem becomes a recipe in every later order, and the next order needs this one.',
      machines: ['theorem', 'lemmabook'],
    },
  ],

  T01: [
    {
      title: 'If … then',
      long: true,
      body:
        'Many theorems have a hypothesis: **if** $x^{-1} = y$, **then** $x = y^{-1}$, written ' +
        '$x^{-1} = y \\implies x = y^{-1}$. To prove an if–then, assume the “if” and derive the “then”. ' +
        'The result does not claim $x^{-1} = y$ is true. The condition survives as a premise, unproved; ' +
        'the theorem promises the conclusion only when the premise holds.',
      example: 'Assume $u = v$. Multiply both sides on the left by $w$: $wu = wv$. That proves $u = v \\implies wu = wv$, without ever claiming $u = v$.',
      nearMiss: 'An assumption is not a fact. Outside the room that grants it, $x_1^{-1} = y_1$ cannot be used at all: it is not true for every pair.',
    },
    {
      title: 'The Assume room',
      long: true,
      body:
        'An **Assume** room is a painted region with a desk (⊢) inside. The desk hands out the assumption, usable only inside. ' +
        'Carry any fact to the gate (⊣) and it leaves as an if–then, “assumption $\\implies$ fact”. ' +
        'Every result remembers **which assumptions it used**. Inside, a fact that uses the desk is about one particular pair, ' +
        'so ∀ refuses to bind it there. The gate turns the assumption into a premise; outside, ∀ may bind both Towers.',
      machines: ['room:assume', 'operator'],
      nearMiss: 'A ∀ machine inside the room, before the gate, jams. Try it once and read why.',
      figures: [{ k: 'scene', atoms: AT('uvw'), spec: {
        rooms: [{ x0: -0.2, y0: -0.6, x1: 6.5, y1: 1.6, label: 'ASSUME', kind: 'assume' }],
        machines: [{ x: 0.2, y: 0, config: { kind: 'desk' } }, { x: 2.8, y: 0, config: { kind: 'operator', recipe: { k: 'multiply', side: 'left' } } }, { x: 6, y: 0, config: { kind: 'gate' } }],
        belts: [[[1.2, 0.5], [2.8, 0.5]], [[4.8, 0.5], [6, 0.5]], [[7, 0.5], [9, 0.5]]],
        items: [{ at: [2, 0.5], t: 'u = v' }, { at: [5.4, 0.5], t: 'wu = wv', place: 'sw' }, { at: [8.4, 0.5], t: 'u = v ⟹ wu = wv', place: 'sw', off: [-4, -16] }],
        notes: [
          { at: [0.7, 0.5, 0.9], text: 'The desk (⊢) hands out the assumption $u = v$.' },
          { at: [3.8, 0.5, 1], text: 'Inside, use it like any fact. Here an Operator multiplies both sides by $w$.' },
          { at: [6.5, 0.5, 0.8], text: 'The gate (⊣) lets it out as an if–then: $u = v \\implies wu = wv$.' },
        ] } }],
    },
    {
      title: 'Use the lemma you saved',
      body: 'Your **double inverse**, $(u^{-1})^{-1} = u$, is a recipe now. Pick it in a Rewriter like any group law. Not in your book? Replay Undo the Undo and save it.',
    },
  ],

  L05: [
    {
      title: 'Same to both sides',
      body: 'Doing the same thing to both sides keeps an equation true: from $u = v$, multiplying on the left by any $t$ gives $tu = tv$. An Operator makes exactly this kind of move, on both sides at once.',
      figures: [
        { k: 'scene', atoms: AT('pqr'), spec: {
          machines: [{ x: 2, y: 0, config: { kind: 'operator', recipe: { k: 'multiply', side: 'left' } } }],
          belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [5.8, 0.5]]],
          items: [{ at: [1, 0.5], t: 'p = q' }, { at: [5, 0.5], t: 'rp = rq' }],
          notes: [
            { at: [3, 0.5, 1], text: 'An Operator set to **multiply left**, with $t := r$.' },
            { at: [5.8, 0.5, 0], text: 'Both sides change at once: $rp = rq$.' },
          ] } },
        { k: 'math', rows: [{ seq: ['ab', '=', 'ca', '⟹', 'b', '=', 'c'], strike: true, why: 'Not valid: $a$ is on the left of one side and the right of the other.' }] },
      ],
    },
    {
      title: 'A theorem to keep',
      body: 'Deliver this and you earn **cancellation**: $uv = uw \\implies v = w$.',
    },
  ],

  L06: [
    {
      title: 'Order matters',
      body: 'Group elements need not commute. In S₃, the symmetries of a triangle, $(12)(13) = (132)$ but $(13)(12) = (123)$.',
      figures: [{ k: 'table', group: 'S₃' }],
    },
    {
      title: 'Shoes and socks',
      body: 'You put on socks, then shoes. To undo that, the shoes come off first. Inverting a product works the same way.',
      figures: [{ k: 'math', rows: [{ seq: ['(ab)^-1', '=', 'a^-1b^-1'], strike: true, why: 'Wrong order. Check it in S₃.' }] }],
    },
    {
      title: 'Choose where to cut',
      body: '**Unique right inverse** needs a premise $uv = e$, and you choose where $u$ ends and $v$ begins. Its conclusion names whatever follows the cut as the inverse of what comes before it.',
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { label: 'cut after p', seq: [{ t: 'pqr', br: [[0, 1, '$u$', 'over'], [1, 3, '$v$', 'over']] }, '=', 'e', '⟹', 'qr', '=', 'p^-1'] },
        { label: 'cut after q⁻¹', seq: [{ t: 'q^-1p', br: [[0, 1, '$u$', 'over'], [1, 2, '$v$', 'over']] }, '=', 'e', '⟹', 'p', '=', '(q^-1)^-1'] },
      ] }],
    },
  ],

  T02: [
    {
      title: 'Rules run both ways',
      body: 'An equation can be read in either direction. A Rewriter set to run right to left replaces its rule’s right side with the left. Two theorems from your book are enough here; nothing needs proving again.',
      figures: [{ k: 'scene', atoms: AT('pq'), spec: {
        machines: [{ x: 2, y: 0, config: { kind: 'rewriter', recipe: { k: 'law', ref: dbl }, dir: 'rev' } }],
        belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [6.2, 0.5]]],
        items: [{ at: [1, 0.5], t: 'pq = pq' }, { at: [5.2, 0.5], t: 'pq = (p^-1)^-1q' }],
        notes: [
          { at: [3.6, 0.2, 1], text: 'The gold ← chip: this Rewriter runs its rule right to left.' },
          { at: [6.2, 0.5, 0], text: '$(u^{-1})^{-1} = u$, read backwards, turns $p$ into $(p^{-1})^{-1}$.' },
        ] } }],
    },
  ],

  L04: [
    {
      title: 'Powers are copies',
      body: '$(xy)^5$ means the block $xy$ written five times. The exponent counts copies of the whole block, so the letters interleave rather than sort.',
      figures: [{ k: 'math', atoms: TW('xy'), rows: [
        { seq: ['(xy)^(5)', '=', { t: '(xy)(xy)(xy)(xy)(xy)', br: [[0, 5, '5 copies', 'over']] }] },
        { seq: ['(xy)^(5)', '=', 'x^(5)y^(5)'], strike: true, why: 'Only true when $x$ and $y$ commute.' },
      ] }],
    },
    {
      title: 'Reading from another place',
      body: 'Inserting a pair like $u u^{-1}$ changes nothing, but it lets you read the same terms from a different starting point. With other letters:',
      figures: [{ k: 'math', atoms: AT('cd'), rows: [
        { seq: ['dc', '=', { t: 'dc(dd^-1)', br: [[2, 3, 'inserted pair']] }, '=', { t: 'd(cd)d^-1', br: [[1, 2, 'regrouped']] }] },
      ], caption: '$dc$ and $cd$ are **conjugates**: the same block, read from a shifted start.' }],
    },
    {
      title: 'Facts made inside a room',
      body: 'Inside an Assume room, the desk hands out the assumption. Belt it into a Rewriter’s rule port, on its north side, and the Rewriter uses it like a recipe. The gate exports the if–then; then ∀ binds $x$ and $y$.',
      figures: [{ k: 'scene', atoms: AT('pqr'), spec: {
        rooms: [{ x0: -0.3, y0: -1.7, x1: 6.6, y1: 2.3, label: 'ASSUME', kind: 'assume' }],
        machines: [{ x: 2, y: -1, config: { kind: 'desk' } }, { x: 0, y: 1, config: { kind: 'spool' } }, { x: 3, y: 1, config: { kind: 'rewriter', recipe: { k: 'routed' }, dir: 'fwd' } }],
        belts: [[[3, -0.5], [3.5, -0.5], [3.5, 1]], [[1, 1.5], [3, 1.5]], [[5, 1.5], [6.6, 1.5]]],
        items: [{ at: [3.5, 0.2], t: 'pq = e', off: [30, 4] }, { at: [2, 1.5], t: 'rpq = rpq', place: 'sw' }, { at: [5.9, 1.5], t: 'rpq = r' }],
        notes: [
          { at: [2.85, -0.85, 0.45], text: 'The desk hands out the assumption $pq = e$.' },
          { at: [3.85, 0.6, 0.3], text: 'Belted into the Rewriter’s **rule port**, it works like a recipe.' },
          { at: [6.6, 1.5, 0], text: 'It rewrites $pq$ to $e$: $rpq = r$.' },
        ] } }],
    },
  ],

  L07: [
    {
      title: 'Cancellation',
      body: 'A term on the same end of both sides can be removed.',
      figures: [{ k: 'math', atoms: AT('pqr'), rows: [
        { label: 'left cancellation', seq: [{ t: 'pq', br: [[0, 1, 'shared', 'over']] }, '=', { t: 'pr', br: [[0, 1, 'shared', 'over']] }, '⟹', 'q', '=', 'r'] },
        { label: 'right cancellation', seq: [{ t: 'qp', br: [[1, 2, 'shared', 'over']] }, '=', { t: 'rp', br: [[1, 2, 'shared', 'over']] }, '⟹', 'q', '=', 'r'] },
      ] }],
    },
    {
      title: 'Theorems as machines',
      body: 'Earned theorems save work: each stands in for its whole proof.',
      figures: [{ k: 'scene', atoms: AT('pqr'), spec: {
        machines: [{ x: 2, y: 0, config: { kind: 'theorem', recipe: { k: 'library', ref: cancelL } } }],
        belts: [[[0, 0.5], [2, 0.5]], [[4, 0.5], [5.6, 0.5]]],
        items: [{ at: [1, 0.5], t: 'pq = pr' }, { at: [4.9, 0.5], t: 'q = r' }],
        notes: [
          { at: [3, 0.5, 1.1], text: 'A Theorem machine set to **left cancellation**.' },
          { at: [5.6, 0.5, 0], text: 'It strips the shared $p$ in one move.' },
        ] } }],
    },
  ],

  // ─────────────────────────── Chapter II · Suppose ───────────────────────────
  L08: [
    {
      title: 'A law at any element',
      body: '$H$ holds for every $x$, so it applies to compound elements too: at $x = uv$ it says $uvuv = e$. Pick the instance in the Rewriter that uses $H$.',
    },
    {
      title: 'What commuting looks like',
      body: 'In V₄ every square is $e$, and its table is symmetric across the diagonal. A symmetric table means $ab = ba$ for every pair: the group is **commutative**.',
      figures: [{ k: 'table', group: 'V₄' }],
    },
  ],

  L09: [
    {
      title: 'Proof by contradiction',
      long: true,
      body: 'To show a statement is false, suppose it is true and follow the consequences until two facts clash: some $u = v$ alongside $u \\neq v$. Such a clash is a **contradiction**, written ⊥ (read “bottom”: the impossible). Valid steps from true statements never reach ⊥, so the supposition must have been false, and its negation is proved.',
      figures: [{ k: 'math', atoms: AT('uv'), rows: [{ seq: ['u', '=', 'v', ',', 'u', '≠', 'v', '⟹', '⊥'], why: 'An equation and its negation together give ⊥.' }] }],
    },
    {
      title: 'The Suppose room',
      body: 'A Suppose room’s desk hands you the supposition. A Joiner set to **clash** takes an equation and its negation and makes ⊥. The gate turns ⊥ into the opposite of the supposition.',
      machines: ['room:suppose', 'joiner'],
      figures: [{ k: 'scene', atoms: AT('pqrs'), spec: {
        rooms: [{ x0: -0.3, y0: -0.6, x1: 8.5, y1: 2.4, label: 'SUPPOSE', kind: 'suppose' }],
        machines: [
          { x: 0, y: 0, config: { kind: 'desk' } }, { x: 2, y: 0, config: { kind: 'rewriter', recipe: { k: 'cancel' } } }, { x: 2, y: 1.2, config: { kind: 'given', givenId: 'n' } },
          { x: 5, y: 0, config: { kind: 'joiner', recipe: { k: 'clash' } } }, { x: 8, y: 0, config: { kind: 'gate' } },
        ],
        belts: [[[1, 0.5], [2, 0.5]], [[4, 0.5], [5, 0.5]], [[3, 1.7], [4.5, 1.7], [4.5, 1.5], [5, 1.5]], [[7, 0.5], [8, 0.5]], [[9, 0.5], [10.4, 0.5]]],
        items: [
          { at: [1.5, 0.5], t: 'p = q', off: [8, 30] }, { at: [4.5, 0.5], t: 'r = s', off: [8, 22] }, { at: [3.6, 1.7], t: 'r ≠ s', place: 'sw' },
          { at: [7.5, 0.5], t: '⊥', off: [10, 22] }, { at: [9.8, 0.5], t: 'p ≠ q', place: 'sw' },
        ],
        notes: [
          { at: [0.5, 0.5, 0.55], text: 'The desk hands out the supposition, $p = q$.' },
          { at: [3, 0.5, 1], text: 'Work from it as usual until you reach an equation, here $r = s$, …' },
          { at: [6, 1, 1], text: '… that clashes with a known $r \\neq s$, here from a given. The Joiner makes ⊥.' },
          { at: [8.5, 0.5, 0.8], text: 'The gate lets out the opposite of the supposition: $p \\neq q$.' },
        ] } }],
    },
  ],

  L10: [
    {
      title: 'Classical reasoning',
      long: true,
      body: 'Sometimes no direct route reaches the goal. Then suppose its opposite, derive ⊥, and conclude the goal itself: from “not $P$ leads to ⊥”, conclude $P$. This step is called **classical**. It is sound, but some logics refuse it, so the kernel marks every proof that uses it.',
    },
    {
      title: 'The Classical room',
      body: 'Its desk hands out the negation of what you want, and its gate turns ⊥ into the equation itself.',
      machines: ['room:classical'],
    },
  ],

  // ─────────────────────────── Chapter III · Clockwork ───────────────────────────
  R01: [
    {
      title: 'Order of an element',
      body: 'The order of an element counts how many times you combine it with itself before reaching $e$. On the clock ℤ₆, where combining means adding hours, 2 has order 3: $2 + 2 + 2 = 0$.',
      figures: [{ k: 'clock', n: 6 }],
    },
    {
      title: 'Two goals, two docks',
      body: 'This order has two Receiving Docks. A belt can branch, so one fact can feed several machines.',
      figures: [{ k: 'scene', atoms: [{ id: 'c', label: 'c', hue: 2 }], spec: {
        machines: [{ x: 0, y: 1, config: { kind: 'spool' } }, { x: 3, y: 0, config: { kind: 'rewriter', recipe: { k: 'cancel' } } }, { x: 3, y: 2, config: { kind: 'rewriter', recipe: { k: 'insertE' } } }],
        belts: [[[1, 1.5], [2, 1.5], [2, 0.5], [3, 0.5]], [[2, 1.5], [2, 2.5], [3, 2.5]]],
        items: [{ at: [1.5, 1.5], t: 'cc^-1 = cc^-1' }],
        notes: [{ at: [2, 1.5, 0.15], text: 'The belt branches here: both Rewriters get the same equation.' }] } }],
    },
  ],

  L11: [
    {
      title: 'Cyclic groups',
      body: 'On ℤ₅, keep adding 1 and you visit every hour before returning to 0. A group made by repeating a single element like this is called **cyclic**.',
      figures: [{ k: 'clock', n: 5 }],
    },
    {
      title: 'Lagrange’s theorem (imported)',
      body: '$|G|$ is the size of $G$: its number of elements. **Lagrange’s theorem** says the order of every element divides $|G|$, so $x^{|G|} = e$ for every $x$. It is imported: proved elsewhere, trusted here.',
      figures: [{ k: 'orders', group: 'S₃' }],
    },
  ],

  L12: [
    {
      title: 'Prime size',
      body: 'When $|G|$ is prime, Lagrange leaves each element only two possible orders: 1, which only $e$ has, or $|G|$ itself. On ℤ₇, every hour except 0 has order 7.',
      figures: [{ k: 'clock', n: 7 }],
    },
  ],

  // ─────────────────────────── Chapter IV · Powers ───────────────────────────
  B01: [
    {
      title: 'Integer exponents',
      body: '$u^k$ means $k$ copies of $u$. Here $k$ can be any integer, written $k \\in ℤ$ (ℤ is the integers). Zero copies is $e$, and a negative power undoes the positive one.',
      figures: [{ k: 'math', atoms: TW('x'), rows: [
        { seq: ['x^(3)', '=', 'xxx'] },
        { seq: ['x^(0)', '=', 'e'] },
        { seq: ['x^(-2)', '=', 'x^-1x^-1'] },
      ] }],
    },
    {
      title: 'Integer Towers and power laws',
      body: 'A ℤ-Tower declares an integer variable, $k \\in ℤ$. Power laws such as **power of a power**, $(u^m)^n = u^{mn}$, are imported: proved elsewhere by induction, trusted here.',
      machines: ['tower'],
      figures: [{ k: 'scene', spec: {
        machines: [{ x: 0, y: 0, config: { kind: 'tower', label: 'x', sort: 'G' } }, { x: 1.8, y: 0, config: { kind: 'tower', label: 'k', sort: 'Z' } }],
        notes: [
          { at: [0.5, 0.5, 1.65], text: 'An element Tower: $x \\in G$.' },
          { at: [2.3, 0.5, 1.65], text: 'An integer Tower: $k \\in ℤ$, for exponents.' },
        ] } }],
    },
  ],

  B02: [
    {
      title: 'A reusable reset',
      body: 'If $x^n = e$, then $x^{kn} = e$. It is an if–then about three variables. Once delivered, save it as Reset Multipliers: later orders need it.',
    },
  ],

  B03: [
    {
      title: 'Powers do not distribute',
      body: 'In S₃, take $a = (12)$ and $b = (23)$. Then $a^2b^2 = e$, but $(ab)^2 \\neq e$. So $(uv)^n = u^nv^n$ is not a rule.',
      figures: [{ k: 'table', group: 'S₃' }],
    },
    {
      title: 'Power of a conjugate',
      body: '**Power of a conjugate** is imported: $(u^{-1}vu)^n = u^{-1}v^nu$. The inner $uu^{-1}$ pairs cancel, so the frame stays on the outside.',
    },
  ],

  B04: [
    {
      title: 'Size is a certificate',
      body: 'Lagrange’s theorem needs the size of the group as a given fact, $|G| = 5$. A ℤ-Tower named $|G|$ would be an arbitrary integer, not the size of anything, so it proves nothing.',
    },
    {
      title: 'Written out or stacked',
      body: '$a^5$ can be written out as five terms or kept as one power. Here the dock wants the power. Type a^(5) into a Spool for the stacked form.',
      figures: [{ k: 'math', rows: [{ seq: ['aaaaa', '=', 'a^(5)'] }] }],
    },
  ],

  // ─────────────────────────── Side orders ───────────────────────────
  S02: [
    {
      title: 'Conjugates',
      body: '$bab^{-1}$ is a **conjugate** of $a$. When conjugates by the same element are multiplied, the inner pairs cancel. With other letters:',
      figures: [{ k: 'math', atoms: AT('cd', 2), rows: [
        { seq: ['(cdc^-1)(cdc^-1)', '=', { t: 'cd(c^-1c)dc^-1', br: [[2, 3, 'cancels']] }, '=', 'cddc^-1'] },
      ] }],
    },
  ],
};
