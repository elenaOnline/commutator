// COMMUTATOR v4 — concept cards (design/v4/DESIGN.md §4; Astra's v4 review §5). Content-owned.
//
// Shown on first entry to a level and reopenable from the order chip (and, ideally, from a jam or
// lens that concerns the card's machine). Written for players with no group theory: each card
// teaches one idea, ideally with one worked transformation (`example`), one forbidden near-miss
// (`nearMiss`) and one floor gesture (`gesture`).
//
// Text is markdown: **bold** only (never with maths inside; no italic: the HUD splits on $…$ first,
// so italics around maths leak their asterisks). Recipe names are “quoted”. Maths sits in $…$ in TeX-ish game notation, restricted to:
//   a^{-1}  x_1  x^{|G|}  (xy)^5  e  \forall  \Rightarrow  \neq  \bot  \in  \geq  \langle a \rangle
//   \dots  \;  \,  \quad  |G|  \mathbb{Z}  x^{nk}  x^{-n}  (Phase B: symbolic exponents in ^{…})
// Group names (ℤ₆, S₃, D₄, V₄) are written in Unicode outside $…$, matching the catalogue.
//
// `machines` vocabulary: MachineKind strings from src/factory/types.ts ('spool', 'rewriter',
// 'operator', 'joiner', 'theorem', 'tower', 'forall', 'carddock'), plus 'room:suppose',
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
  | { k: 'cayley'; group: string; gens: string[] };

export interface ConceptCard {
  title: string;
  /** Markdown, maths in $…$. At most ~90 words. */
  body: string;
  figure?: Figure;
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
      title: 'What a group is',
      body:
        'A **group** is a set $G$ with one way to combine two elements, written side by side: $ab$ is $a$ combined with $b$. ' +
        'Three rules hold, and they are all we will ever use. There is an **identity** $e$ that changes nothing: $ea = a = ae$. ' +
        'Every $a$ has an **inverse** $a^{-1}$ that undoes it: $a^{-1}a = e = aa^{-1}$. ' +
        'And brackets never matter, $(ab)c = a(bc)$, so a product is just a string of beads.',
      example: '$a^{-1}ab$: the first two beads $a^{-1}a$ make $e$, and $eb = b$. So $a^{-1}ab = b$.',
      nearMiss:
        'Think of $a^{-1}$ as “undo”, not “one over a”: there are no fractions here. ' +
        'Regrouping $a^{-1}ab$ as $a^{-1}(ab)$ is free; reordering it to $aba^{-1}$ is not. Beads keep their order.',
    },
    {
      title: 'What “prove” means here',
      body:
        'Every equation on the floor carries a certificate from a small checker, the **kernel**. ' +
        'Machines can only make moves the three rules allow, so whatever reaches the dock is true in **every** group, ' +
        'not just the ones you can picture. The **Spool** starts from the one fact that needs no reason, $t = t$. ' +
        'Each machine after it changes the equation by one justified step.',
      figure: { k: 'beads', terms: ['a^-1ab', 'b'] },
      example: '$a^{-1}ab = a^{-1}ab$ (Spool) becomes $a^{-1}ab = b$ (cancel, then the leftover $e$ is tidied away).',
      nearMiss: 'Checking a claim in a few groups is not a proof. One counterexample refutes a claim; no pile of examples proves one.',
    },
    {
      title: 'Spool and Rewriter',
      body:
        'The **Spool** emits $t = t$ for a term $t$; this one is pre-loaded with $a^{-1}ab$. ' +
        'A **Rewriter** changes one bracketed span of one rail by a rule, its **recipe**. ' +
        'The “cancel” recipe turns $a^{-1}a$ or $aa^{-1}$ into $e$ and tidies the leftover $e$ away.',
      machines: ['spool', 'rewriter'],
      gesture:
        'Place a Rewriter. Drag a belt from the Spool’s output to it, and another from it to the dock. ' +
        'Open its lens, choose “cancel”, and click the span $a^{-1}a$ on the right rail.',
      nearMiss: 'Cancelling on both rails gives $b = b$: true, but not what the dock ordered.',
    },
  ],

  L02: [
    {
      title: 'Only one identity',
      body:
        'Could a group hide a second identity? Suppose $e\'$ acts like one from the left: $e\'x = x$ for **every** $x$. ' +
        'That is a **law**, a promise about all elements at once, and you may use it at any element you like. ' +
        'Pick the one where it says something new, $x = e$: then $e\'e = e$. ' +
        'But $e\'e = e\'$, since $e$ is an identity. Two descriptions of one product, so $e\' = e$.',
      figure: { k: 'beads', terms: ["e'e", "e'", 'e'] },
      example: '$e\' = e\'e$ (insert $e$) $= e$ (the law $H$ at $x = e$).',
      nearMiss: 'Using $H$ at $x = e\'$ gives $e\'e\' = e\'$: true, and useless. Choosing **where** to use a law is the proof.',
    },
    {
      title: 'Recipes and belts',
      body:
        'Standing library evidence is chosen as a recipe; facts made on this floor travel by belt. ' +
        'The axioms (“cancel”, “pop e”, “insert e”, “insert pair”) and the order’s givens, like $H$ here, stand in the **library**: ' +
        'pick them in a Rewriter’s recipe list. The Rewriter reads $x$ off the bracket you click; if it cannot tell, a knob asks. ' +
        'A fact you make on the floor is a product instead: to use it as a rule, belt it into the Rewriter’s rule port.',
      example:
        'Given $H$: pick “H” as a recipe, no belt. A room’s desk fact, such as $(x_1y_1)^5 = e$ in Conjugate Pair, exists only on that floor: ' +
        'belt it into a rule port and choose “routed”.',
      gesture:
        'Spool $e\'$ → Rewriter “insert e” at the gap after $e\'$ on the right rail → Rewriter with recipe $H$ on the span $e\'e$ → dock.',
    },
  ],

  L03: [
    {
      title: 'Inverses are unique',
      body:
        'If $ab = e$, then $b$ has to be $a^{-1}$: an element has only one inverse. ' +
        'The trick is to slip in a harmless pair and spend it. Start from $b$ and write it as $a^{-1}ab$. ' +
        'Now the beads $ab$ sit side by side, which is exactly what the hypothesis $h$ talks about.',
      figure: { k: 'beads', terms: ['b', 'a^-1ab', 'a^-1e', 'a^-1'] },
      example: '$b = a^{-1}ab = a^{-1}e = a^{-1}$.',
      nearMiss: '$ab = e$ does not hand you $ba = e$ for free, and $b = e/a$ means nothing here. Only the three rules and $h$ may be used.',
    },
    {
      title: 'Insert a pair, cite a hypothesis',
      body:
        'The “insert pair” recipe puts $x^{-1}x$ or $xx^{-1}$ into a gap; you choose $x$ on a knob. ' +
        'Citing $h$ is a recipe too: it rewrites the span $ab$ to $e$. ' +
        'Prove this order and the result becomes hardware: the **Witness Stamp**, which turns any $uv = e$ into $v = u^{-1}$.',
      gesture:
        'Spool $b$ → Rewriter “insert pair”, $x = a$, at the gap before $b$ on the right rail → Rewriter with recipe $h$ on the span $ab$ → dock.',
    },
  ],

  S01: [
    {
      title: 'For every element',
      body:
        'Until now each order was about particular elements handed to you. This one asks for a **law**: ' +
        '$\\forall x.\\ (x^{-1})^{-1} = x$, read “for every choice of $x$”. ' +
        'To prove something about every element, reason about one you know nothing about. ' +
        'If the argument never used anything special about it, it works for any choice. ' +
        'On paper: “let $x \\in G$ be arbitrary”.',
      example:
        '$x^{-1}x = e$ says $x$ undoes $x^{-1}$. Inverses are unique, so $x$ **is** the inverse of $x^{-1}$: $x = (x^{-1})^{-1}$.',
      nearMiss: 'Proving it for one specific element is not enough: that element might be special. Level constants never generalize.',
    },
    {
      title: 'Tower and ∀',
      body:
        'A **Tower** declares a fresh element, $x_1 \\in G$, and broadcasts it floor-wide; its beads are striped, meaning “any”. ' +
        'Different Towers are independently arbitrary: $x_1$ and $y_1$ might be the same element, so never assume they differ. ' +
        'Build a fact about $x_1$ as usual, then feed it to the **∀ machine**: it replaces $x_1$ with a bound $x$ and emits a law.',
      machines: ['tower', 'forall'],
      nearMiss: '∀ refuses when the fact rests on an assumption about $x_1$: then $x_1$ was not arbitrary.',
    },
    {
      title: 'The Theorem machine',
      body:
        'A **Theorem** machine applies an if–then card: feed it the premises, get the conclusion. ' +
        'Its recipe here is your Witness Stamp, $uv = e \\Rightarrow v = u^{-1}$. ' +
        'Feed it an equation whose left side is a product equal to $e$; a cut handle chooses where $u$ ends and $v$ begins. ' +
        'When the law docks, save it to your **Lemma Book** as Double Flip: you will need it next. ' +
        'A hypothesis-free law holds in **all** groups; saved, it is a recipe in every later order.',
      machines: ['theorem', 'lemmabook'],
      gesture:
        'Tower $x_1$. Spool $x_1^{-1}x_1$ → Rewriter “cancel” (right rail) → Theorem, Witness Stamp, cut $x_1^{-1}\\,|\\,x_1$ → ' +
        'Operator “swap” → ∀ → dock.',
    },
  ],

  T01: [
    {
      title: 'If … then',
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
    },
    {
      title: 'Use the lemma you saved',
      body:
        'The **Operator** acts on a whole equation; its “invert” recipe turns $L = R$ into $L^{-1} = R^{-1}$. ' +
        'Then use the lemma you saved: Double Flip, $(u^{-1})^{-1} = u$, is now a Rewriter recipe under the name you gave it. ' +
        'Saved lemmas are re-checked from their own proofs each time the game loads.',
      nearMiss: 'No Double Flip in your book? Return to Undo the Undo, deliver it again, and save the law when it docks.',
    },
  ],

  L05: [
    {
      title: 'Cancellation',
      body:
        'In a group you may cancel: $ab = ac$ forces $b = c$. It is not one of the three rules; it is earned. ' +
        'Doing the same thing to both sides keeps an equation true, so multiply both on the left by $a^{-1}$: ' +
        '$a^{-1}ab = a^{-1}ac$. Now each side collapses, to $b$ and to $c$.',
      figure: { k: 'beads', terms: ['ab', 'ac', 'a^-1ab', 'a^-1ac'] },
      example: '$ab = ac \\;\\Rightarrow\\; a^{-1}ab = a^{-1}ac \\;\\Rightarrow\\; b = c$.',
      nearMiss: '$ab = ca$ does not give $b = c$: the shared $a$ must sit on the same end of both sides.',
    },
    {
      title: 'Multiply both sides',
      body:
        'The Operator’s “multiply left” and “multiply right” recipes put a term $t$ on the same end of **both** rails at once; ' +
        'that is what keeps the equation true. The hypothesis $h$ arrives from a Given inlet as a starting workpiece. ' +
        'Proving this earns the **Cancel Lathe**, $uv = uw \\Rightarrow v = w$, with a mirror for a shared right factor.',
      gesture: 'Given $h$ → Operator “multiply left”, $t = a^{-1}$ → Rewriter “cancel” on each rail → dock.',
      nearMiss: 'There is no way to multiply only one rail: that would break the equation.',
    },
  ],

  L06: [
    {
      title: 'Order matters',
      body:
        'Nothing so far needed $ab = ba$, and in general it is false. S₃ is the six ways to rearrange three cards. ' +
        'Read its table as “row combined with column”: (12) swaps cards 1 and 2, (13) swaps 1 and 3, ' +
        'and (12)(13) = (132) while (13)(12) = (123). A group where $ab = ba$ always holds is **abelian**; ' +
        'clocks are, S₃ is not. Proofs here hold in every group, so beads never trade places.',
      figure: { k: 'table', group: 'S₃' },
      nearMiss: 'Regrouping $a(bc) = (ab)c$ is free. Reordering $ab$ into $ba$ is not a move at all.',
    },
    {
      title: 'Shoes and socks',
      body:
        'Socks on, then shoes. To undo, the shoes come off first: $(ab)^{-1} = b^{-1}a^{-1}$. ' +
        'The inverse of a product is a sealed crate; it never unpacks by itself. So check the other side’s credentials: ' +
        '$b^{-1}a^{-1}$ undoes $ab$, because $ab\\,b^{-1}a^{-1}$ collapses from the middle out. ' +
        'Inverses are unique, so whatever undoes $ab$ **is** $(ab)^{-1}$.',
      figure: { k: 'beads', terms: ['ab b^-1 a^-1', 'a a^-1', 'e'] },
      nearMiss: 'The tempting guess $(ab)^{-1} = a^{-1}b^{-1}$ fails in S₃. Test both predictions in the lab before you prove one.',
      gesture:
        'Spool $ab\\,b^{-1}a^{-1}$ → Rewriter “cancel” twice on the right rail → Theorem, Witness Stamp, cut $ab\\,|\\,b^{-1}a^{-1}$ → dock.',
    },
  ],

  T02: [
    {
      title: 'Tools that compose',
      body:
        'Your Double Flip says $(u^{-1})^{-1} = u$ for **every** $u$, compound ones included; the Sock Drawer says $(uv)^{-1} = v^{-1}u^{-1}$. ' +
        'Read the Sock Drawer right to left inside the crate and $y_1^{-1}x_1^{-1}$ becomes $(x_1y_1)^{-1}$. ' +
        'Now the rail reads $((x_1y_1)^{-1})^{-1}$: Double Flip at $u = x_1y_1$ finishes it. Two lemmas, neither proved again.',
      example: '$(y_1^{-1}x_1^{-1})^{-1} = ((x_1y_1)^{-1})^{-1} = x_1y_1$.',
      nearMiss: 'Double Flip does not fit $(y_1^{-1}x_1^{-1})^{-1}$ as it stands: what sits inside the crate must itself be an inverse.',
      gesture:
        'Towers $x_1$, $y_1$. Spool $(y_1^{-1}x_1^{-1})^{-1}$ → Rewriter Sock Drawer, backwards, on the bracket inside the crate → ' +
        'Rewriter, your Double Flip ($u = x_1y_1$) → ∀ → dock.',
    },
  ],

  L04: [
    {
      title: 'Powers are copies',
      body:
        '$(xy)^5$ means five copies of the whole block $xy$: $xyxyxyxyxy$. It is not $x^5y^5$, which would need beads to trade places. ' +
        'Read the same string in a shifted frame: put $x^{-1}$ in front and $x$ behind, and ' +
        '$x^{-1}(xy)^5x = yxyxyxyxyx = (yx)^5$. So if $(xy)^5 = e$, then $(yx)^5 = x^{-1}ex = e$. ' +
        '$xy$ and $yx$ are **conjugates**: one motion seen from another frame.',
      example: '$(y_1x_1)^5 = x_1^{-1}x_1(y_1x_1)^5 = x_1^{-1}(x_1y_1)^5x_1 = x_1^{-1}e\\,x_1 = e$.',
      nearMiss: '$(xy)^5 = x^5y^5$ is false in S₃. Never expand a power by sorting its beads.',
    },
    {
      title: 'A rule made on the floor',
      body:
        'The desk’s fact $(x_1y_1)^5 = e$ is a product of this floor, not a library rule, so route it: ' +
        'belt the desk into a Rewriter’s rule port and choose the “routed” recipe. ' +
        'The gate exports $(x_1y_1)^5 = e \\Rightarrow (y_1x_1)^5 = e$; the condition survives as a premise, unproved. ' +
        'Outside, ∀ binds $x_1$ and $y_1$ at once.',
      gesture:
        'Inside: Spool $(y_1x_1)^5$ → Rewriter “insert pair” $x_1^{-1}x_1$ at the left edge of the right rail → ' +
        'Rewriter “routed” (desk belt) on the middle bracket → Rewriter “cancel” → gate. Outside: gate → ∀ → dock.',
    },
  ],

  L07: [
    {
      title: 'When squares distribute',
      body:
        'In an abelian group $(ab)^2 = a^2b^2$ holds automatically. The surprise is the converse: ' +
        'if it holds for $a$ and $b$, they commute. As beads it says $abab = aabb$. ' +
        'Both sides start with $a$ and end with $b$; cancel those, and what remains is $ba = ab$.',
      figure: { k: 'beads', terms: ['abab', 'aabb'] },
      example: '$a\\,ba\\,b = a\\,ab\\,b \\;\\Rightarrow\\; ba\\,b = ab\\,b \\;\\Rightarrow\\; ba = ab$.',
      nearMiss: 'Cancelling an $a$ at the front of one side against an $a$ at the back of the other is not cancellation.',
    },
    {
      title: 'Earned theorems at work',
      body:
        'Cancellation is now a recipe. A Theorem machine with the **Cancel Lathe** strips a shared left factor; ' +
        'its mirror, Cancel Lathe ᵒᵖ, strips a shared right factor. ' +
        'Each earned theorem stands in for the whole proof that earned it, so the floor stays short.',
      gesture: 'Given $h$ → Theorem, Cancel Lathe (shared $a$) → Theorem, Cancel Lathe ᵒᵖ (shared $b$) → dock.',
    },
  ],

  // ─────────────────────────── Chapter II · Suppose ───────────────────────────
  L08: [
    {
      title: 'A law at a compound element',
      body:
        'Here every square is $e$: $xx = e$ for every $x$, so every element is its own inverse. ' +
        'A law holds at **any** element, compound ones included: at $x = ab$ it says $abab = e$. ' +
        'Plan: wrap $ba$ as $aa\\,ba\\,bb$ using $H$ twice, backwards; the middle now reads $a\\,(abab)\\,b$; ' +
        'collapse it with $H$ at $x = ab$. What remains is $ab$.',
      figure: { k: 'beads', terms: ['ba', 'aababb', 'ab'] },
      example: '$ba = aa\\,ba\\,bb = a\\,(abab)\\,b = a\\,e\\,b = ab$.',
      gesture:
        'Spool $ba$ → Rewriter $H$ backwards at the right rail’s gap before $ba$ ($x = a$) → again after it ($x = b$) → ' +
        'Rewriter $H$ on the span $abab$ → dock.',
    },
    {
      title: 'What commuting looks like',
      body:
        'V₄, the Klein four-group, has four elements and every one squares to $e$. ' +
        'Its table is symmetric across the diagonal: that symmetry is what $ab = ba$ looks like in a table. ' +
        'You are proving that every group where all squares are $e$ has a symmetric table.',
      figure: { k: 'table', group: 'V₄' },
      nearMiss: 'The converse fails: ℤ₃ is abelian, yet $1 + 1 = 2$, not $0$. Commuting does not make squares trivial.',
    },
  ],

  L09: [
    {
      title: 'Proof by contradiction',
      body:
        'To prove two things are **not** equal, suppose they are and derive nonsense. Suppose $ab = b$. ' +
        'Multiply both sides on the right by $b^{-1}$ and cancel: $a = e$. But the order says $a \\neq e$. ' +
        'A fact and its denial together give $\\bot$, a contradiction, so the supposition was false: $ab \\neq b$.',
      example: '$ab = b \\;\\Rightarrow\\; ab\\,b^{-1} = b\\,b^{-1} \\;\\Rightarrow\\; a = e$, which clashes with $a \\neq e$.',
      nearMiss: 'Checking $ab \\neq b$ in one example group says nothing about the others. The room’s argument covers them all.',
    },
    {
      title: 'Suppose room and clash',
      body:
        'A **Suppose** room’s desk hands out $L = R$. Inside, build as usual. ' +
        'A **Joiner** with the “clash” recipe takes an equation and its denial and makes $\\bot$. ' +
        'Carry $\\bot$ to the gate and $L \\neq R$ comes out, true outside, with the supposition discharged. ' +
        'Facts made inside cannot leave any other way.',
      machines: ['room:suppose', 'joiner'],
      gesture:
        'Room (suppose $ab = b$): desk → Operator “multiply right” $b^{-1}$ → Rewriter “cancel” on each rail → ' +
        'Joiner “clash” with the given $n$ → gate → dock.',
    },
  ],

  L10: [
    {
      title: 'Classical reasoning',
      body:
        'To prove an equation by contradiction, suppose its **denial**: $a \\neq e$. ' +
        'That is exactly the premise $H$ needs, at $x = a$, so $aa = a$. Cancel one $a$ and you get $a = e$, ' +
        'clashing with the supposition. So $a \\neq e$ is impossible, and $a = e$. ' +
        'Concluding $P$ from “not-$P$ is absurd” is **classical** reasoning; the kernel records which proofs use it.',
      example: '$a \\neq e \\;\\Rightarrow\\; aa = a \\;\\Rightarrow\\; a = e$, and with $a \\neq e$ that is $\\bot$.',
    },
    {
      title: 'The Classical room',
      body:
        'A **Classical** room’s desk hands out $L \\neq R$, and its gate turns $\\bot$ into $L = R$. ' +
        'Here the desk’s $a \\neq e$ is used twice: once as the premise of $H$, in a Theorem machine with $H$ as its recipe, ' +
        'and once in the clash. Belts branch for free.',
      machines: ['room:classical'],
      gesture:
        'Room (classical, $a = e$): desk → Theorem ($H$, $x = a$) → Operator “multiply left” $a^{-1}$ → Rewriter “cancel” on each rail → ' +
        'Joiner “clash” with the desk → gate → dock.',
    },
  ],

  // ─────────────────────────── Chapter III · Clockwork ───────────────────────────
  R01: [
    {
      title: 'Order of an element',
      body:
        'The **order** of $a$ is the least $n \\geq 1$ with $a^n = e$: how many turns until it resets. ' +
        'On the ℤ₆ clock the operation is adding hours, and hour 2 has order 3: 2, 4, 0. ' +
        'If $a^4 = e$ and $a^6 = e$, then $e = a^6 = a^4a^2 = a^2$. ' +
        'In general $a^n = e$ exactly when the order divides $n$ (a standard fact, used here but not proved).',
      figure: { k: 'clock', n: 6 },
      example: '$aaaaaa = e$ with $aaaa = e$ leaves $aa = e$.',
      nearMiss: 'On a clock, $a^3$ means $a + a + a$, not a number cubed.',
    },
    {
      title: 'One part, two docks',
      body:
        '$a^2 = e$ says $a$ undoes itself, so the second certificate follows from the first: ' +
        'feed $aa = e$ to the Witness Stamp, cut $a\\,|\\,a$, and out comes $a = a^{-1}$. ' +
        'Belts branch for free: drag off any belt, and both branches carry the same certificate.',
      figure: { k: 'beads', terms: ['aaaaaa', 'aa', 'e'] },
      gesture:
        'Given $h_6$ → Rewriter with recipe $h_4$ on the span $aaaa$ → branch: one belt to the first dock, ' +
        'one through Theorem (Witness Stamp, cut $a\\,|\\,a$) to the second.',
    },
  ],

  L11: [
    {
      title: 'Cyclic groups',
      body:
        'The powers of $a$, namely $e, a, a^2, \\dots$, form a small group of their own, the **cyclic subgroup** $\\langle a \\rangle$. ' +
        'Its size is the order of $a$. ℤ₅ is cyclic: every hour is a multiple of 1. ' +
        'Start at any nonzero hour, keep adding it, and you visit all five hours before returning to 0.',
      figure: { k: 'clock', n: 5 },
      nearMiss: 'Clocks are abelian; most groups are not. A cyclic subgroup can sit inside a group that is not cyclic at all.',
    },
    {
      title: 'Lagrange’s theorem (imported)',
      body:
        '**Lagrange:** in a finite group, the size of any subgroup divides $|G|$. So every element’s order divides $|G|$, ' +
        'and $x^{|G|} = e$ for every $x$. We do not prove Lagrange here; it needs cosets. ' +
        'It enters the library as an **imported** Rewriter recipe whenever the order states $|G| = n$, ' +
        'and the transcript labels it imported. In S₃ (size 6) a 3-cycle has order 3 and a swap order 2: both divide 6.',
      figure: { k: 'cayley', group: 'S₃', gens: ['(123)', '(12)'] },
      example: '$|G| = 5$ gives $a^5 = e$. With $a^3 = e$: $a^5 = a^3a^2$, so $a^2 = e$; then $a^3 = a^2a$, so $a = e$.',
      gesture: 'A Rewriter with the recipe “Lagrange (imported)” turns $aaaaa$ into $e$ on a rail.',
    },
  ],

  L12: [
    {
      title: 'Prime size',
      body:
        'When $|G| = 7$, Lagrange leaves each element two possible orders: 1 or 7. ' +
        'So an element with $x^3 = e$ must be $e$: it also has $x^7 = e$, and $x^7 = x^3x^3x$. ' +
        'Plan: suppose $(ab)^3 = e$. Then $ab = e$, so $b = a^{-1}$ by the Witness Stamp, and $ba = a^{-1}a = e$. ' +
        'But the order says $ba \\neq e$.',
      example: '$(ab)^7 = (ab)^3(ab)^3\\,ab$, so $e = e\\,e\\,ab = ab$.',
      nearMiss: 'Lagrange says the order **divides** $|G|$; it does not say every element has order $|G|$ — $e$ has order 1.',
    },
    {
      title: 'Groups of prime size',
      body:
        'In a group of prime size $p$, every element except $e$ has order $p$, so each one generates the whole group: ' +
        'every such group is a copy of the ℤₚ clock. This follows from Lagrange, which is imported; ' +
        'the floor only uses its corollary $x^{|G|} = e$.',
      figure: { k: 'clock', n: 7 },
    },
  ],

  // ─────────────────────────── Chapter IV · Powers ───────────────────────────
  B01: [
    {
      title: 'Symbolic exponents',
      body:
        '$a^5$ is shorthand for five copies, $aaaaa$. A **symbolic** exponent, as in $a^k$, stands for $k$ copies where $k$ is ' +
        'any integer at all, not one particular number. Integers include zero and negatives: $a^0 = e$ (no copies), and ' +
        '$a^{-3}$ is three copies of $a^{-1}$, the undo of $a^3$. One equation about $a^k$ settles infinitely many cases at once.',
      figure: { k: 'beads', terms: ['(ab)^5', '((ab)^5)^k₁', '(ab)^(5k₁)'], towers: [{ id: 'k1', label: 'k₁', sort: 'Z' }] },
      example: '$(ab)^{5k} = ((ab)^5)^k = e^k = e$: $5k$ turns are $k$ rounds of five.',
      nearMiss: '$a^k$ is not $a$ times a number: $k$ counts copies. An integer is never a group element, and a group element is never an exponent.',
    },
    {
      title: 'ℤ-Towers and imported power laws',
      body:
        'A ℤ-**Tower** declares an arbitrary integer, $k_1 \\in \\mathbb{Z}$, just as a G-Tower declares an element; it only ever appears in exponents. ' +
        'The rules for moving exponents, like $(x^m)^n = x^{mn}$ and $e^n = e$, are **imported**: standard facts proved by induction ' +
        'on $n$, which this floor does not do. Each order lends exactly the ones it lists, and the transcript names every use.',
      machines: ['tower'],
      gesture:
        'Tower $k_1 \\in \\mathbb{Z}$. Spool $(ab)^{5k_1}$ → Rewriter “Exponent Multiplier” backwards ($m = 5$, $n = k_1$) → ' +
        '“Literal Power 5” inside the base → recipe $h$ → “Idle Power” → ∀ → dock.',
      nearMiss: 'This law rests on $h$, a fact about this plant’s $a$ and $b$, so it cannot go in the Lemma Book.',
    },
  ],

  B02: [
    {
      title: 'A reusable reset tool',
      body:
        'If $x^n = e$, then $x^{nk} = e$ for every integer $k$: $nk$ turns are $k$ rounds of $n$. ' +
        'The proof is Every Fifth Shift with the five replaced by a ℤ-Tower $n_1$ and the given replaced by an Assume room. ' +
        'Nothing rests on this plant, so the finished theorem is about **all** groups: save it to the Lemma Book as “Reset Multipliers”.',
      example: '$x_1^{n_1k_1} = (x_1^{n_1})^{k_1} = e^{k_1} = e$, citing the desk’s $x_1^{n_1} = e$ inside the base.',
      nearMiss: 'A ∀ machine inside the room jams: $x_1$ and $n_1$ appear in the desk’s assumption. Leave through the gate first.',
      gesture:
        'Towers $x_1 \\in G$; $n_1, k_1 \\in \\mathbb{Z}$. Room, desk $x_1^{n_1} = e$: Spool $x_1^{n_1k_1}$ → “Exponent Multiplier” backwards → ' +
        'Rewriter “routed” from the desk, inside the base → “Idle Power” → gate. Outside: gate → ∀ → dock.',
    },
    {
      title: 'Negative and zero powers',
      body:
        'Integer powers run both ways. $x^{-n}$ is the undo of $x^n$: it equals $(x^n)^{-1}$, and also $(x^{-1})^n$. ' +
        'So a reset after $n$ turns forward is also a reset after $n$ turns back: take $k = -1$. ' +
        'And $x^0 = e$ for every $x$: zero turns change nothing, which is why $k = 0$ needs no special case. ' +
        'On the ℤ₆ clock, going back 2 hours lands where going forward 4 does.',
      figure: { k: 'clock', n: 6 },
      nearMiss: 'The theorem never claims $n$ is the **least** reset; it only multiplies one you already have.',
    },
  ],

  B03: [
    {
      title: 'Powers do not distribute',
      body:
        'With numbers, $(ab)^n = a^nb^n$. In a group it fails, because the copies of $ab$ interleave: $(ab)^2 = abab$, not $aabb$. ' +
        'In S₃ take $a = (12)$ and $b = (23)$: $a^2b^2 = e$, yet $(ab)^2 \\neq e$. ' +
        'So Conjugate Pair’s trick needs a law that moves an exponent through a **frame**, not through a product: ' +
        '$(u^{-1}vu)^n = u^{-1}v^nu$. It is imported, proved off the floor.',
      figure: { k: 'table', group: 'S₃' },
      nearMiss: 'There is no recipe for $(xy)^n = x^ny^n$, on purpose: it is false.',
    },
    {
      title: 'Opening a frame',
      body:
        'Make room for the conjugation law: inside the base, write $y_1x_1$ as $x_1^{-1}x_1y_1x_1$, which is $x_1^{-1}(x_1y_1)x_1$. ' +
        'Now “Conjugate Power” turns $(x_1^{-1}(x_1y_1)x_1)^{n_1}$ into $x_1^{-1}(x_1y_1)^{n_1}x_1$, and the desk’s assumption collapses the middle. ' +
        'It works for every $n$, zero and negatives included.',
      example: '$(y_1x_1)^{n_1} = (x_1^{-1}x_1y_1x_1)^{n_1} = x_1^{-1}(x_1y_1)^{n_1}x_1 = x_1^{-1}e\\,x_1 = e$.',
      gesture:
        'Inside the room: Spool $(y_1x_1)^{n_1}$ → Rewriter “insert pair” $x_1^{-1}x_1$ before $y_1$ in the base → “Conjugate Power” ($u = x_1$, $v = x_1y_1$) → ' +
        'Rewriter “routed” (desk) → “cancel” → gate. Outside: gate → ∀ → dock.',
    },
  ],

  B04: [
    {
      title: 'Size is a certificate',
      body:
        'Lagrange says $x^{|G|} = e$ in a finite group, but only once you know $|G|$. ' +
        'Here the order states $|G| = 5$, so the imported Lagrange recipe gives $a^5 = e$, and the certificate remembers that it used $|G| = 5$. ' +
        'A ℤ-Tower labelled to look like $|G|$ proves nothing: the size has to be a given.',
      figure: { k: 'clock', n: 5 },
      nearMiss: 'Because it rests on $|G| = 5$, this result cannot be saved as a law about all groups.',
      gesture: 'Spool the power $a^5$ (type a^(5)) → Rewriter with “Lagrange (imported)” on the right rail → dock.',
    },
    {
      title: 'Words and powers',
      body:
        '$a^5$ can mean two things on this floor: the **word** $aaaaa$ of five beads, or one **power** stack with 5 on its plaque. ' +
        'They are equal but not identical: the “Literal Power” law converts between them, and the transcript records it. ' +
        'Typing a^5 gives the word; a^(5) gives the stack.',
      figure: { k: 'beads', terms: ['a^5', 'a^(5)'] },
    },
  ],

  // ─────────────────────────── Side orders ───────────────────────────
  S02: [
    {
      title: 'Conjugation keeps the order',
      body:
        '$bab^{-1}$ is $a$ seen through a change of frame. Cube it and each inner $b^{-1}b$ cancels: ' +
        '$(bab^{-1})^3 = ba^3b^{-1}$, and since $a^3 = e$ that is $bb^{-1} = e$. Conjugates always share their order. ' +
        'In D₄, the symmetries of a square, a mirror $s$ turns the quarter turn $r$ into $srs^{-1} = r^3$: ' +
        'still a quarter turn, the other way round.',
      figure: { k: 'beads', terms: ['bab^-1bab^-1bab^-1', 'baaab^-1', 'bb^-1'] },
      nearMiss: '$bab^{-1}$ is not $a$ in general: in D₄, $srs^{-1} = r^3 \\neq r$.',
    },
  ],
};
