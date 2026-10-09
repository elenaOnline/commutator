// COMMUTATOR v4.1 — concept cards (design/v4/DESIGN.md §4, design/v4/COPY.md). Content-owned.
//
// Shown on first entry to a level and reopenable from the order chip, a jam or a lens. Written for
// players with no group theory. VISUAL FIRST (COPY.md): one idea per card, the figures carry it, the
// body is a caption (≤ 25 words, sentences ≤ ~12 words, no semicolons). A long card is a decision:
// `long: true` (Matched Pair keeps its write-up). The prose fields `example`/`nearMiss`/`gesture`
// survive only on long cards; elsewhere a figure does that job.
//
// Text is markdown: **bold** only (never with maths inside; no italic: the HUD splits on $…$ first,
// so italics around maths leak their asterisks). Recipe names are “quoted”. Maths sits in $…$ in TeX-ish game notation, restricted to:
//   a^{-1}  x_1  x^{|G|}  (xy)^5  e  \forall  \Rightarrow  \neq  \bot  \in  \geq  \langle a \rangle
//   \dots  \;  \,  \quad  |G|  \mathbb{Z}  x^{nk}  x^{-n}  (Phase B: symbolic exponents in ^{…})
// Group names (ℤ₆, S₃, D₄, V₄) are written in Unicode outside $…$, matching the catalogue.
// Figure captions and near-miss reasons are plain text (≤ 8 words), Unicode maths (a⁻¹, ⊥).
//
// FIGURE STRINGS (transform/nearmiss/chain/machine): parseTerm syntax against the level's atoms plus
// the figure's `towers` (illustrative variables; plain labels like x, y — subscripts only when needed):
//   fact   := [∀x,y. ] side ((= | ≠) side)? ( ⇒ side (= | ≠) side )?     e.g. 'x^-1 = y ⇒ x = y^-1'
//   '⊥' alone is the contradiction pallet.
// SPANS: `hit`/`made` are [start, end) factor indices of the string's top-level word. For an equation
// 'L = R' they run across the strip: L's factors first, then R's (the '=' is not a factor). In a
// `chain`, a step's `hit` marks what CHANGED on arriving at that step, tinted in the step's `family`.
//
// `machines` vocabulary: MachineKind strings from src/factory/types.ts ('spool', 'rewriter',
// 'operator', 'joiner', 'theorem', 'tower', 'forall', 'carddock', 'gate'), plus 'room:suppose',
// 'room:classical', 'room:assume' and 'lemmabook'.

export type Figure =
  /** ℤₙ as a clock face (n ≤ 8: the catalogue's cyclic groups). */
  | { k: 'clock'; n: number }
  /** The group's multiplication table (row combined with column). `group` is a catalogue name. */
  | { k: 'table'; group: string }
  /**
   * Bead strings, in parseTerm syntax against the level's atoms (e.g. 'a^-1ab', "e'e") plus any
   * illustrative `towers` (Phase B: e.g. a ℤ Tower k₁ so a figure can show '(ab)^(5k₁)'). Note the
   * parser's legacy rule: 'a^5' is the five-bead WORD, 'a^(5)' is a power stack.
   */
  | { k: 'beads'; terms: string[]; towers?: { id: string; label: string; sort: 'G' | 'Z' }[] }
  /** Cayley graph of a catalogue group; `gens` are element labels of that group. */
  | { k: 'cayley'; group: string; gens: string[] }
  // ── v4.1 visual-first figures (design/v4/COPY.md). Term strings use parseTerm syntax; `towers` as above. ──
  /**
   * One move as a picture: a bead strip `before` → `after`. The factors a rule touches are tinted in the
   * family ink: `hit` = [start, end) factor indices in `before` (top-level word), `made` = the same in `after`.
   * `caption` ≤ 8 words. Equations: write 'L = R' and the strip shows both rails.
   */
  | { k: 'transform'; before: string; after: string; family: FigFamily; hit?: [number, number]; made?: [number, number]; caption?: string; towers?: TowerDecl[] }
  /** A tempting move that is NOT allowed: drawn like `transform` but struck through, with a ≤ 8-word reason. */
  | { k: 'nearmiss'; before: string; after: string; why: string; towers?: TowerDecl[] }
  /** A chain of moves (2–5 strips), each step tinted where it changed. Animated in sequence. */
  | { k: 'chain'; steps: { term: string; family?: FigFamily; hit?: [number, number] }[]; caption?: string; towers?: TowerDecl[] }
  /** A mini factory: one machine tile with its recipe, the pallet going in and the pallet coming out. */
  | { k: 'machine'; kind: string; recipe?: string; input: string; output: string; rule?: string; caption?: string; towers?: TowerDecl[] };

export type FigFamily = 'identity' | 'inverse' | 'structure' | 'equation' | 'scope' | 'contradiction' | 'lemma' | 'given';
export type TowerDecl = { id: string; label: string; sort: 'G' | 'Z' };

export interface ConceptCard {
  title: string;
  /**
   * v4.1: OPTIONAL and short by default — a caption-length line (≤ 25 words) under the figures.
   * Longer text is a deliberate choice for a card that needs it (set `long: true`).
   */
  body?: string;
  /** Long-form card (a decision, not the norm — e.g. Matched Pair's write-up). */
  long?: boolean;
  figure?: Figure;
  /** v4.1: several figures shown in order (preferred over `figure`). */
  figures?: Figure[];
  /** Machine kinds this card introduces (see vocabulary above). */
  machines?: string[];
  /** One worked transformation. */
  example?: string;
  /** One forbidden or tempting-but-wrong move, and why. */
  nearMiss?: string;
  /** One concrete floor gesture: which machines, which recipes, where to click. */
  gesture?: string;
}

/** Concept cards per level id, keys in campaign order. Every level has at least one card. */
export const CARDS: Record<string, ConceptCard[]> = {
  // ─────────────────────────── Chapter I · The Works ───────────────────────────
  L01: [
    {
      title: 'A group in three pictures',
      body: 'Elements combine by lining up. Brackets never matter. Order does.',
      figures: [
        { k: 'transform', before: 'aeb', after: 'ab', family: 'identity', hit: [1, 2], caption: 'e changes nothing' },
        { k: 'transform', before: 'a^-1ab', after: 'eb', family: 'inverse', hit: [0, 2], made: [0, 1], caption: 'a⁻¹ undoes a' },
        { k: 'nearmiss', before: 'ab', after: 'ba', why: 'Beads never swap places' },
      ],
    },
    {
      title: 'Spool and Rewriter',
      body: 'Every proof starts at a Spool. Each machine makes one checked move.',
      machines: ['spool', 'rewriter'],
      figures: [
        { k: 'machine', kind: 'spool', input: 'a^-1ab', output: 'a^-1ab = a^-1ab', caption: 'Start from t = t' },
        { k: 'machine', kind: 'rewriter', recipe: 'cancel', input: 'a^-1ab = a^-1ab', output: 'a^-1ab = b', caption: 'Cancel on the right rail' },
      ],
    },
    {
      title: 'What proving means',
      body: 'A small checker approves every move. What reaches the dock holds in every group.',
    },
  ],

  L02: [
    {
      title: 'Only one identity',
      body: '$H$ says $e\'x = x$ for every $x$. Use it at $x = e$. So $e\' = e$.',
      figures: [
        {
          k: 'chain', caption: 'Insert e, then H at x = e',
          steps: [{ term: "e'" }, { term: "e'e", family: 'identity', hit: [1, 2] }, { term: 'e', family: 'given', hit: [0, 1] }],
        },
      ],
    },
    {
      title: 'Recipes and belts',
      body: 'Givens and axioms are recipes. Facts you build travel by belt.',
      figures: [
        { k: 'machine', kind: 'rewriter', recipe: 'H', input: "e' = e'e", output: "e' = e", rule: "e'x = x", towers: [{ id: 'x', label: 'x', sort: 'G' }], caption: 'A given: pick it, no belt' },
        {
          k: 'machine', kind: 'rewriter', recipe: 'routed', input: 'xy = xy', output: 'xy = e', rule: 'xy = e',
          towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }], caption: 'A room’s fact: belt it in',
        },
      ],
    },
  ],

  L03: [
    {
      title: 'Inverses are unique',
      body: 'If $ab = e$, then $b$ is $a^{-1}$. One element, one inverse.',
      figures: [
        {
          k: 'chain', caption: 'Spend a pair, then use h',
          steps: [{ term: 'b' }, { term: 'a^-1ab', family: 'inverse', hit: [0, 2] }, { term: 'a^-1e', family: 'given', hit: [1, 2] }, { term: 'a^-1', family: 'identity' }],
        },
      ],
    },
    {
      title: 'Regroup, never reorder',
      body: 'Brackets slide freely. Beads stay in order.',
      figures: [
        { k: 'beads', terms: ['a^-1(ab)', '(a^-1a)b'] },
        { k: 'nearmiss', before: 'a^-1ab', after: 'aba^-1', why: 'Reordering is not a move' },
      ],
    },
    {
      title: 'A proof becomes a machine',
      body: 'Deliver this, and you earn the Witness Stamp.',
      figures: [{ k: 'machine', kind: 'theorem', recipe: 'Witness Stamp', input: 'ab = e', output: 'b = a^-1', caption: 'Anything that undoes a is a⁻¹' }],
    },
  ],

  S01: [
    {
      title: 'x can be anything',
      body: '**x can be anything.** Prove it for $x$, and ∀ makes it true for all.',
      machines: ['tower', 'forall'],
      figures: [
        { k: 'machine', kind: 'forall', input: '(x^-1)^-1 = x', output: '∀x. (x^-1)^-1 = x', towers: [{ id: 'x', label: 'x', sort: 'G' }], caption: 'Bind x. True for all.' },
      ],
    },
    {
      title: 'Towers',
      body: 'A Tower names a new element. Two Towers might name the same one.',
      figures: [{ k: 'beads', terms: ['x', 'y', 'xy'], towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }] }],
    },
    {
      title: 'Prove, then save',
      body: 'When it docks, save it as Double Flip. You need it next.',
      machines: ['theorem', 'lemmabook'],
      figures: [
        {
          k: 'chain', caption: 'Cancel, Witness Stamp, swap', towers: [{ id: 'x', label: 'x', sort: 'G' }],
          steps: [
            { term: 'x^-1x = x^-1x' },
            { term: 'x^-1x = e', family: 'inverse', hit: [2, 3] },
            { term: 'x = (x^-1)^-1', family: 'lemma', hit: [0, 2] },
            { term: '(x^-1)^-1 = x', family: 'equation', hit: [0, 2] },
          ],
        },
      ],
    },
  ],

  T01: [
    {
      title: 'If … then',
      long: true,
      body:
        'Many theorems have a hypothesis: **if** $x^{-1} = y$, **then** $x = y^{-1}$, written ' +
        '$x^{-1} = y \\Rightarrow x = y^{-1}$. To prove an if–then, assume the “if” and derive the “then”. ' +
        'The result does not claim $x^{-1} = y$ is true. The condition survives as a premise, unproved; ' +
        'the theorem promises the conclusion only when the premise holds.',
      example: 'Assume $x_1^{-1} = y_1$. Invert both sides: $(x_1^{-1})^{-1} = y_1^{-1}$. Your Double Flip: $x_1 = y_1^{-1}$.',
      nearMiss: 'Outside a room you cannot use $x_1^{-1} = y_1$ at all: it is not true for every pair.',
    },
    {
      title: 'The Assume room',
      long: true,
      body:
        'An **Assume** room is a painted region with a desk inside. The desk hands out the assumption, usable only inside. ' +
        'Carry any fact to the gate and it leaves as a card, “assumption” $\\Rightarrow$ “fact”. ' +
        'Every certificate remembers **which assumptions it used**. Inside, $x_1 = y_1^{-1}$ uses the desk, an assumption about $x_1$, ' +
        'so ∀ refuses there. The gate turns the assumption into a premise, and outside ∀ may bind both Towers.',
      machines: ['room:assume', 'operator'],
      gesture:
        'Towers $x_1$, $y_1$ outside. Room, desk $x_1^{-1} = y_1$ → Operator “invert” → Rewriter, your Double Flip → gate. ' +
        'Outside: gate → ∀ → dock.',
      nearMiss: 'A ∀ machine inside the room, before the gate, jams. Try it once and read why.',
      figures: [
        { k: 'machine', kind: 'gate', input: 'x = y^-1', output: 'x^-1 = y ⇒ x = y^-1', towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }], caption: 'The gate exports if ⇒ then' },
      ],
    },
    {
      title: 'Use the lemma you saved',
      body: 'Your saved Double Flip is a recipe now. Not in your book? Replay Undo the Undo and save it.',
      figures: [
        { k: 'transform', before: 'x^-1 = y', after: '(x^-1)^-1 = y^-1', family: 'equation', caption: 'invert both sides', towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }] },
        { k: 'machine', kind: 'rewriter', recipe: 'Double Flip', input: '(x^-1)^-1 = y^-1', output: 'x = y^-1', towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }], caption: 'Your lemma at work' },
      ],
    },
  ],

  L05: [
    {
      title: 'Cancellation',
      body: '$ab = ac$ forces $b = c$. Do the same to both sides.',
      figures: [
        {
          k: 'chain', caption: 'Multiply both sides, then cancel',
          steps: [{ term: 'ab = ac' }, { term: 'a^-1ab = a^-1ac', family: 'equation' }, { term: 'b = c', family: 'inverse' }],
        },
        { k: 'nearmiss', before: 'ab = ca', after: 'b = c', why: 'The a must be on one side' },
      ],
    },
    {
      title: 'Both rails at once',
      body: 'Proving this earns the Cancel Lathe.',
      figures: [{ k: 'machine', kind: 'operator', recipe: 'multiply left by a⁻¹', input: 'ab = ac', output: 'a^-1ab = a^-1ac', caption: 'One move, both rails' }],
    },
  ],

  L06: [
    {
      title: 'Order matters',
      body: 'In S₃, (12)(13) = (132). But (13)(12) = (123).',
      figures: [{ k: 'table', group: 'S₃' }, { k: 'nearmiss', before: 'ab', after: 'ba', why: 'False in S₃' }],
    },
    {
      title: 'Shoes and socks',
      body: 'Socks on, then shoes. Shoes come off first: $(ab)^{-1} = b^{-1}a^{-1}$.',
      figures: [
        {
          k: 'chain', caption: 'b⁻¹a⁻¹ undoes ab',
          steps: [{ term: 'ab b^-1 a^-1' }, { term: 'a e a^-1', family: 'inverse', hit: [1, 2] }, { term: 'a a^-1', family: 'identity' }, { term: 'e', family: 'inverse', hit: [0, 1] }],
        },
        { k: 'nearmiss', before: '(ab)^-1', after: 'a^-1b^-1', why: 'Wrong order. Test it in the lab.' },
      ],
    },
    {
      title: 'Name the inverse',
      figures: [{ k: 'machine', kind: 'theorem', recipe: 'Witness Stamp', input: 'ab b^-1 a^-1 = e', output: 'b^-1 a^-1 = (ab)^-1', caption: 'Cut between ab and b⁻¹a⁻¹' }],
    },
  ],

  T02: [
    {
      title: 'Tools that compose',
      body: 'Two lemmas, neither proved again.',
      figures: [
        {
          k: 'chain', caption: 'Sock Drawer backwards, then Double Flip',
          towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }],
          steps: [{ term: '(y^-1x^-1)^-1' }, { term: '((xy)^-1)^-1', family: 'lemma', hit: [0, 1] }, { term: 'xy', family: 'lemma', hit: [0, 2] }],
        },
      ],
    },
  ],

  L04: [
    {
      title: 'Powers are copies',
      body: '$(xy)^5$ is five copies of the block $xy$.',
      figures: [
        { k: 'beads', terms: ['(xy)^5'], towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }] },
        { k: 'nearmiss', before: '(xy)^5', after: 'x^5y^5', why: 'Copies interleave. They never sort.', towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }] },
      ],
    },
    {
      title: 'A shifted frame',
      body: 'Put $x^{-1}x$ in front. The same beads now read $x^{-1}(xy)^5x$.',
      figures: [
        {
          k: 'chain', caption: 'Same beads, read from x',
          towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }],
          steps: [{ term: '(yx)^5' }, { term: 'x^-1x(yx)^5', family: 'inverse', hit: [0, 2] }, { term: 'x^-1ex', family: 'scope', hit: [1, 2] }, { term: 'e', family: 'inverse', hit: [0, 1] }],
        },
      ],
    },
    {
      title: 'A fact made on the floor',
      body: 'Belt the desk’s fact into a Rewriter. The gate exports the if–then. Then ∀ binds $x$ and $y$.',
      figures: [
        {
          k: 'machine', kind: 'rewriter', recipe: 'routed', input: '(yx)^5 = x^-1(xy)^5x', output: '(yx)^5 = x^-1ex', rule: '(xy)^5 = e',
          towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }], caption: 'The desk’s fact arrives by belt',
        },
      ],
    },
  ],

  L07: [
    {
      title: 'When squares distribute',
      body: 'If $(ab)^2 = a^2b^2$, then $a$ and $b$ commute.',
      figures: [
        {
          k: 'chain', caption: 'Strip the shared ends',
          steps: [{ term: 'abab = aabb' }, { term: 'bab = abb', family: 'lemma' }, { term: 'ba = ab', family: 'lemma' }],
        },
      ],
    },
    {
      title: 'One lathe per side',
      body: 'Earned theorems save work. Each stands in for its whole proof.',
      figures: [{ k: 'machine', kind: 'theorem', recipe: 'Cancel Lathe', input: 'abab = aabb', output: 'bab = abb', caption: 'Strip the shared a' }],
    },
  ],

  // ─────────────────────────── Chapter II · Suppose ───────────────────────────
  L08: [
    {
      title: 'A law at a compound element',
      body: 'Every square is $e$ here. The law works at $x = ab$ too.',
      figures: [
        {
          k: 'chain', caption: 'H three times, once at x = ab',
          steps: [{ term: 'ba' }, { term: 'aaba', family: 'given', hit: [0, 2] }, { term: 'aababb', family: 'given', hit: [4, 6] }, { term: 'aeb', family: 'given', hit: [1, 2] }, { term: 'ab', family: 'identity' }],
        },
      ],
    },
    {
      title: 'What commuting looks like',
      body: 'In V₄ every square is $e$. Its table is symmetric. That is $ab = ba$.',
      figures: [{ k: 'table', group: 'V₄' }],
    },
  ],

  L09: [
    {
      title: 'Proof by contradiction',
      body: 'Suppose the opposite. Reach a clash with $a \\neq e$. So $ab \\neq b$.',
      figures: [
        {
          k: 'chain', caption: 'Suppose ab = b',
          steps: [{ term: 'ab = b', family: 'scope' }, { term: 'abb^-1 = bb^-1', family: 'equation' }, { term: 'a = e', family: 'inverse' }, { term: '⊥', family: 'contradiction' }],
        },
      ],
    },
    {
      title: 'Suppose room',
      body: 'The desk hands you the supposition. A Joiner clashes it. The gate lets out ≠.',
      machines: ['room:suppose', 'joiner'],
      figures: [{ k: 'machine', kind: 'gate', input: '⊥', output: 'ab ≠ b', caption: '⊥ in, ≠ out' }],
    },
  ],

  L10: [
    {
      title: 'Classical reasoning',
      body: 'Suppose $a \\neq e$. That is $H$’s premise. It gives $aa = a$, so $a = e$. Clash.',
      figures: [
        {
          k: 'chain', caption: 'Suppose a ≠ e',
          steps: [{ term: 'a ≠ e', family: 'scope' }, { term: 'aa = a', family: 'given' }, { term: 'a = e', family: 'inverse' }, { term: '⊥', family: 'contradiction' }],
        },
      ],
    },
    {
      title: 'Classical room',
      body: 'Its gate turns ⊥ into =. The kernel marks such proofs classical.',
      machines: ['room:classical'],
      figures: [{ k: 'machine', kind: 'gate', input: '⊥', output: 'a = e', caption: '⊥ in, = out' }],
    },
  ],

  // ─────────────────────────── Chapter III · Clockwork ───────────────────────────
  R01: [
    {
      title: 'Order of an element',
      body: 'The order of $a$ counts turns until $e$. On ℤ₆, the hour 2 has order 3.',
      figures: [{ k: 'clock', n: 6 }],
    },
    {
      title: 'One part, two docks',
      body: '$a^4 = e$ and $a^6 = e$ leave $a^2 = e$. Branch that belt.',
      figures: [
        {
          k: 'chain', caption: 'Use h₄ inside h₆',
          steps: [{ term: 'aaaaaa = e' }, { term: 'eaa = e', family: 'given', hit: [0, 1] }, { term: 'aa = e', family: 'identity' }],
        },
        { k: 'machine', kind: 'theorem', recipe: 'Witness Stamp', input: 'aa = e', output: 'a = a^-1', caption: 'The second dock' },
      ],
    },
  ],

  L11: [
    {
      title: 'Cyclic groups',
      body: 'Keep adding 1 on ℤ₅. You visit every hour. So ℤ₅ is cyclic.',
      figures: [{ k: 'clock', n: 5 }],
    },
    {
      title: 'Lagrange (imported)',
      body: 'An element’s order divides the group’s size. So $x^{|G|} = e$. This is imported, not proved here.',
      figures: [{ k: 'cayley', group: 'S₃', gens: ['(123)', '(12)'] }],
    },
    {
      title: 'Five turns, then three',
      body: 'Lagrange gives $a^5 = e$. With $a^3 = e$ that leaves $a^2 = e$. Then $a = e$.',
      figures: [
        {
          k: 'chain', caption: 'Lagrange, then h',
          steps: [{ term: 'aaaaa = e', family: 'lemma' }, { term: 'eaa = e', family: 'given', hit: [0, 1] }, { term: 'aa = e', family: 'identity' }],
        },
      ],
    },
  ],

  L12: [
    {
      title: 'Prime size',
      body: 'In a group of size 7, every element but $e$ has order 7.',
      figures: [{ k: 'clock', n: 7 }],
    },
    {
      title: 'Everything at once',
      body: 'That clashes with $ba \\neq e$. So $(ab)^3 \\neq e$.',
      figures: [
        {
          k: 'chain', caption: 'Suppose (ab)³ = e',
          steps: [{ term: '(ab)^3 = e', family: 'scope' }, { term: 'ab = e', family: 'lemma' }, { term: 'b = a^-1', family: 'lemma' }, { term: 'ba = e', family: 'inverse' }, { term: '⊥', family: 'contradiction' }],
        },
      ],
    },
  ],

  // ─────────────────────────── Chapter IV · Powers ───────────────────────────
  B01: [
    {
      title: 'Symbolic exponents',
      body: '$a^k$ means $k$ copies of $a$. $k$ can be any whole number, even 0 or negative.',
      figures: [
        { k: 'transform', before: '(ab)^(5k)', after: '((ab)^5)^k', family: 'lemma', hit: [0, 1], made: [0, 1], caption: '5k turns are k rounds of 5', towers: [{ id: 'k', label: 'k', sort: 'Z' }] },
        {
          k: 'chain', caption: 'Then h, then eᵏ = e', towers: [{ id: 'k', label: 'k', sort: 'Z' }],
          steps: [{ term: '((ab)^5)^k' }, { term: 'e^k', family: 'given', hit: [0, 1] }, { term: 'e', family: 'lemma', hit: [0, 1] }],
        },
      ],
    },
    {
      title: 'Integer Towers, imported laws',
      body: 'A ℤ-Tower names any whole number. Power laws are imported. They are proved elsewhere, by induction.',
      machines: ['tower'],
      figures: [
        {
          k: 'machine', kind: 'rewriter', recipe: 'Exponent Multiplier', input: '(ab)^(5k) = (ab)^(5k)', output: '(ab)^(5k) = ((ab)^5)^k',
          towers: [{ id: 'k', label: 'k', sort: 'Z' }], caption: 'An imported law, read backwards',
        },
      ],
    },
  ],

  B02: [
    {
      title: 'A reusable reset tool',
      body: 'If $x^n = e$, then $x^{nk} = e$. Save it as Reset Multipliers.',
      figures: [
        {
          k: 'chain', caption: 'Inside the room, desk xⁿ = e',
          towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'n', label: 'n', sort: 'Z' }, { id: 'k', label: 'k', sort: 'Z' }],
          steps: [{ term: 'x^(n*k)' }, { term: '(x^n)^k', family: 'lemma', hit: [0, 1] }, { term: 'e^k', family: 'scope', hit: [0, 1] }, { term: 'e', family: 'lemma', hit: [0, 1] }],
        },
      ],
    },
    {
      title: 'Negative and zero powers',
      body: 'Powers run both ways. Negative means undo.',
      figures: [
        { k: 'transform', before: 'x^(-3)', after: '(x^(3))^-1', family: 'lemma', hit: [0, 1], made: [0, 1], caption: 'x⁻³ undoes x³', towers: [{ id: 'x', label: 'x', sort: 'G' }] },
        { k: 'transform', before: 'x^(0)', after: 'e', family: 'lemma', hit: [0, 1], made: [0, 1], caption: 'Zero copies is e', towers: [{ id: 'x', label: 'x', sort: 'G' }] },
      ],
    },
  ],

  B03: [
    {
      title: 'Powers do not distribute',
      body: 'In S₃, take $a = (12)$ and $b = (23)$. Then $a^2b^2 = e$, but $(ab)^2 \\neq e$.',
      figures: [
        { k: 'table', group: 'S₃' },
        { k: 'nearmiss', before: '(xy)^(n)', after: 'x^(n)y^(n)', why: 'False. Copies interleave.', towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }, { id: 'n', label: 'n', sort: 'Z' }] },
      ],
    },
    {
      title: 'Open a frame',
      body: 'Conjugate Power moves the exponent through a frame. It is imported.',
      figures: [
        {
          k: 'chain', caption: 'Open a frame, then Conjugate Power',
          towers: [{ id: 'x', label: 'x', sort: 'G' }, { id: 'y', label: 'y', sort: 'G' }, { id: 'n', label: 'n', sort: 'Z' }],
          steps: [
            { term: '(yx)^(n)' },
            { term: '(x^-1xyx)^(n)', family: 'inverse', hit: [0, 1] },
            { term: 'x^-1(xy)^(n)x', family: 'lemma', hit: [0, 3] },
            { term: 'x^-1ex', family: 'scope', hit: [1, 2] },
            { term: 'e', family: 'inverse', hit: [0, 1] },
          ],
        },
      ],
    },
  ],

  B04: [
    {
      title: 'Size is a certificate',
      body: 'The size must be a given. A ℤ-Tower named |G| proves nothing.',
      figures: [
        { k: 'clock', n: 5 },
        { k: 'machine', kind: 'rewriter', recipe: 'Lagrange (imported)', input: 'a^(5) = a^(5)', output: 'a^(5) = e', caption: 'Uses the given |G| = 5' },
      ],
    },
    {
      title: 'Words and stacks',
      body: '$a^5$ can be five beads or one stack. Literal Power converts. Type a^(5) for the stack.',
      figures: [{ k: 'beads', terms: ['a^5', 'a^(5)'] }],
    },
  ],

  // ─────────────────────────── Side orders ───────────────────────────
  S02: [
    {
      title: 'Conjugates keep their order',
      body: 'The inner $b^{-1}b$ pairs cancel. So $bab^{-1}$ resets when $a$ does.',
      figures: [
        {
          k: 'chain', caption: 'Inner pairs cancel, then h',
          steps: [
            { term: 'bab^-1bab^-1bab^-1' },
            { term: 'baab^-1bab^-1', family: 'inverse', hit: [1, 3] },
            { term: 'baaab^-1', family: 'inverse', hit: [1, 4] },
            { term: 'bb^-1', family: 'given' },
            { term: 'e', family: 'inverse', hit: [0, 1] },
          ],
        },
      ],
    },
  ],
};
