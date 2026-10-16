// LEMMA WORKS — kernel contract. Architect-owned. Builders may ADD exports in
// their own folders; changing a shape here requires the architect.
//
// The kernel is pure (no DOM, no state) and is the only authority on truth.
// See KERNEL.md for semantics; design/reviews/sol-math-adversary-r1.md §4 is
// the acceptance suite.

// ───────────────────────────── Terms ─────────────────────────────

/** A level-declared element constant, e.g. 'a', 'b', 'e1' (displayed e′). */
export type AtomId = string;
/** A schema metavariable id, e.g. 'x', 'u', 'v'. Never an AtomId. */
export type MetaId = string;

export type Term =
  | { k: 'atom'; id: AtomId }
  /** The identity. Book phase C: `s` names its group sort (absent = the default group 'G'; norm drops s: 'G'). */
  | { k: 'e'; s?: SortId }
  | { k: 'inv'; arg: Term }
  /** Flat product: fs.length >= 2 and no element of fs is a 'mul'. */
  | { k: 'mul'; fs: Term[] }
  /** Only inside patterns (laws/conds/axioms). A ground term has none. */
  | { k: 'meta'; id: MetaId }
  /**
   * v4 Phase B (kernel-owned, design/v4/proposals/sol-exponents.md): an integer power base^exp, one
   * factor of its enclosing word. Never expanded/combined by norm; use the imported power recipes.
   * Addr.path child 0 enters the base (like inv). The exponent has no address.
   */
  | { k: 'pow'; base: Term; exp: Poly }
  /**
   * v4 Phase B: an INTEGER value, never a group element. Valid only as the value of a ℤ-sorted meta
   * in a Subst (an exponent knob). Rejected anywhere a group element is expected.
   */
  | { k: 'int'; val: Poly }
  /**
   * Book phase C (KERNEL-EXT §5): a map applied to arguments, f(x) or σ(g, p). `fn` is a level map id, a Hom Tower
   * id, or a card's hom/action binder. One factor of its enclosing word, like inv; Addr.path child i enters args[i].
   */
  | { k: 'app'; fn: string; args: Term[] };

/** Book phase C: a group or set sort id. 'G' is the default group of every level; 'Z' stays reserved for ℤ. */
export type SortId = string;
/** Book phase C: a level-declared sort (a group or a plain set). */
export interface SortDecl { id: SortId; kind: 'group' | 'set'; label: string }
/** Book phase C: a level-declared map. hom: one group argument → a group. action: (group, set) → the set. */
export interface MapDecl { id: string; label: string; args: SortId[]; res: SortId; kind?: 'map' | 'hom' | 'action' }
/** Book phase C: a sort reference in a card: a level sort / group Tower, or a card's group (or set) binder. */
export type SortRef = SortId | { k: 'sortmeta'; id: MetaId };

/** v4 Phase B sorts: G = group elements, Z = integers. */
export type Sort = 'G' | 'Z';
/** A reference inside an exponent: a ℤ Tower (rigid, graph-declared) or a ℤ meta of the enclosing card. */
export type ZRef = { k: 'zvar'; id: string } | { k: 'zmeta'; id: MetaId };
/** Sorted distinct refs with positive degrees; [] is the constant monomial. */
export type Monomial = { ref: ZRef; degree: number }[];
/** Exact integer polynomial, canonical after norm: sparse, sorted, no zero coefficients ([] is 0).
 *  Coefficients are decimal strings (BigInt in arithmetic); JSON numbers are rejected. */
export type Poly = { coefficient: string; monomial: Monomial }[];

/** G metas map to group terms; ℤ metas (those occurring in exponents) map to { k: 'int' } values. */
export type Subst = Record<MetaId, Term>;

// ───────────────────────────── Facts ─────────────────────────────

/** Pallets: things that ride belts. */
export type Pallet =
  | { k: 'eq'; l: Term; r: Term }
  | { k: 'neq'; l: Term; r: Term }
  | { k: 'bot' }
  /** |G| = n, n a positive literal (1..24). Never an element term. */
  | { k: 'size'; n: number; s?: SortId }
  /** Book phase B (KERNEL-EXT §4): t ∈ S for a level subgroup or a Subgroup Tower (never a binder on a belt). */
  | MemPat;

/** Cards: universally quantified statements, used by instantiation. */
export type Card =
  /** ∀metas. l = r (unconditional law). Citable as a rewrite rule. */
  | { k: 'law'; metas: MetaId[]; l: Term; r: Term; binds?: StructBinder[]; metaSorts?: Record<MetaId, SortRef> }
  /** ∀metas. premises ⇒ concl. Applied via an 'apply' node. Book phase B: premises/concl may be memberships;
   *  `binds` = outermost ∀ over structures (subgroup parameters), bound before the element metas. */
  | { k: 'cond'; metas: MetaId[]; premises: PatFact[]; concl: PatFact; binds?: StructBinder[]; metaSorts?: Record<MetaId, SortRef> };
/* Book phase C: `metaSorts` gives each element meta its sort. A card WITHOUT metaSorts and without app terms is a
 * ONE-GROUP card: sort-polymorphic, it applies in any group sort (its e reads as that sort's identity). */

/** eq/neq whose sides may contain metas. */
export type EqPat = { k: 'eq' | 'neq'; l: Term; r: Term };
/** Book phase B: t ∈ S. In a card, t may contain metas and S may be a binder (`submeta`). */
export type MemPat = { k: 'mem'; t: Term; sub: SubRef };
/** A statement inside a card: an (in)equation, or (phase B) a membership. Use patTerms/mapPat (kernel) to walk it. */
export type PatFact = EqPat | MemPat;

/** Book phase B: a level subgroup or Subgroup Tower (`sub`, rigid), or a card's subgroup parameter (`submeta`). */
export type SubRef = { k: 'sub'; id: string } | { k: 'submeta'; id: MetaId };
/** Book phase B: a structure parameter of a card. Phase C adds group sorts, homs and actions. */
export type StructBinder =
  | { k: 'sub'; id: MetaId; normal: boolean; sort?: SortRef }
  /** Book phase C: a group sort parameter ("for every group G"). */
  | { k: 'grp'; id: MetaId }
  /** Book phase C: a set sort parameter (only alongside an action parameter). */
  | { k: 'set'; id: MetaId }
  /** Book phase C: a homomorphism parameter f : dom → cod ("for every homomorphism f"). */
  | { k: 'hom'; id: MetaId; dom: SortRef; cod: SortRef }
  /** Book phase C: an action parameter σ : grp × on → on. */
  | { k: 'act'; id: MetaId; grp: SortRef; on: SortRef };
/** Book phase B: a level subgroup (`H ≤ G`, or `N ⊴ G` when normal). */
export interface SubgroupDecl {
  id: string; label: string; normal?: boolean; hue?: number;
  /** Book phase C: the group it is a subgroup of (default 'G'). */
  sort?: SortId;
  /** Set by withVars for a Subgroup Tower (graph.structs): fresh, generalizable. Level subgroups are constants. */
  variable?: boolean;
}
/** Book phase B: a structure declared by a Tower on the floor (graph-level, fresh like element Towers). */
export type StructDecl =
  | { k: 'sub'; id: string; label: string; normal: boolean; sort?: SortId }
  /** Book phase C: a group Tower (a fresh group G₁; no atoms, no givens). */
  | { k: 'grp'; id: string; label: string }
  /** Book phase C: a Hom Tower f₁ : dom → cod (fresh or level group sorts). Its hom law has no dependency. */
  | { k: 'hom'; id: string; label: string; dom: SortId; cod: SortId };

export type Fact = Pallet | Card;

// ───────────────────────────── Addresses ─────────────────────────────

/** l / r: the rails of an (in)equation. Book phase B: a membership t ∈ S has ONE rail, its term t, addressed as 'l'. */
export type Side = 'l' | 'r';

/**
 * Focus inside one rail of an eq pallet.
 * path: child indices from the rail root. At a 'mul' the index is a factor
 *   index; at an 'inv' the only child index is 0 (its argument).
 * range: [start, end) factor interval of the WORD at path (the word of a mul
 *   is its fs; the word of any other term is [term]). end - start >= 1.
 *   Omitted = the whole term at path.
 */
export interface Addr { side: Side; path: number[]; range?: [number, number] }

/** A gap in the word at path: 0 = before the first factor, word.length = after the last. */
export interface GapAddr { side: Side; path: number[]; gap: number }

// ───────────────────────────── Rules ─────────────────────────────

export type AxiomId =
  | 'unitL' // e·x = x
  | 'unitR' // x·e = x
  | 'invL'  // x⁻¹·x = e
  | 'invR'; // x·x⁻¹ = e

export type RuleRef =
  | { k: 'axiom'; id: AxiomId }
  /** A theorem in the registry (earned or imported). mirror = its Gᵒᵖ image. */
  | { k: 'schema'; id: string; mirror?: boolean }
  /** A node in the proof graph whose fact is an eq pallet or a card. */
  | { k: 'node'; id: NodeId };

// ───────────────────────────── Proof graph ─────────────────────────────

export type NodeId = string;
export type ScopeId = string; // 'root' or a Room id
export const ROOT: ScopeId = 'root';

export interface Room {
  id: ScopeId;
  parent: ScopeId;
  /** suppose: assumes eq(l,r), exits neq(l,r). classical: assumes neq(l,r), exits eq(l,r).
   *  v4 assume (implication-intro): assumes `assumes` (eq or neq), exit accepts ANY eq/neq fact Q
   *  produced in the room and exports cond(metas [], premises [assumes], concl Q). */
  kind: 'suppose' | 'classical' | 'assume';
  l: Term;
  r: Term;
  /** For kind 'assume': whether the assumption is l = r (default) or l ≠ r. */
  rel?: 'eq' | 'neq';
  /**
   * Book phase A (design/pinter/KERNEL-EXT.md §2): a multi-desk Assume room. 1–3 assumptions, one desk
   * each (`assume` node `slot` i). When present it is authoritative and l/r/rel are ignored by the
   * kernel (writers keep them equal to assumes[0] for older readers). Only for kind 'assume'.
   * The exit exports cond([], [P₀ … Pₖ₋₁], Q).
   */
  assumes?: DeskAssumption[];
}

/**
 * One assumption of an Assume room (Book phase A). Phase B adds `{ rel: 'mem'; t: Term; sub: string }`;
 * readers must treat an unknown `rel` as an error, never as eq.
 */
export type Assumption = { rel: 'eq' | 'neq'; l: Term; r: Term };
/** Book phase B: an Assume desk that assumes a membership t ∈ S (never in Suppose / Classical rooms: there is no ∉). */
export type MemAssumption = { rel: 'mem'; t: Term; sub: SubRef };
/** What one desk of an Assume room assumes. Readers: `a.rel === 'mem' ? … : a.l / a.r`. */
export type DeskAssumption = Assumption | MemAssumption;

export type StepOp =
  /** Replace the focused redex (must equal norm(inst(src,σ))) by norm(inst(dst,σ)).
   *  dir 'fwd': src=l,dst=r. 'rev': src=r,dst=l. σ must bind every meta of the rule. */
  | { k: 'rewrite'; rule: RuleRef; dir: 'fwd' | 'rev'; at: Addr; subst: Subst; structs?: Record<MetaId, string> }
  /** Insert an explicit e factor at a gap (unit axiom read backwards). */
  | { k: 'insertE'; at: GapAddr }
  /** Multiply both rails by term on the given side. */
  | { k: 'lift'; side: 'left' | 'right'; term: Term }
  /** L = R ⟹ R = L (eq) ; also L ≠ R ⟹ R ≠ L (neq). */
  | { k: 'swap' }
  /** v4: L = R ⟹ L⁻¹ = R⁻¹ (congruence with inverse); also L ≠ R ⟹ L⁻¹ ≠ R⁻¹ (inverse is injective). */
  | { k: 'invert' }
  /** Book phase C: apply a map to both sides — u = v ⟹ f(…u…) = f(…v…); `slot` = the argument u fills
   *  (default 0), `others` = ground terms for the remaining arguments (σ(g, p): slot 1, others [g]). */
  | { k: 'applyMap'; fn: string; slot?: number; others?: Term[] };

/** UI-only annotations. The kernel ignores them entirely. */
export interface NodeMeta {
  /** Stations group consecutive step nodes produced by one gesture. */
  station?: string;
  /** Free-form gesture label for transcripts ("insert pair", "auto-tidy"). */
  gesture?: string;
}

interface NodeBase { id: NodeId; scope: ScopeId; meta?: NodeMeta }

export type ProofNode =
  | (NodeBase & { k: 'start'; term: Term })                       // ⊢ t = t
  | (NodeBase & { k: 'given'; givenId: string })                   // ⊢ manifest given (dep: givenId)
  /** scope === room; dep: room assumption. Book phase A: `slot` i (default 0) of a multi-desk room;
   *  its dep is 'a:<room>' for slot 0 and 'a:<room>/<i>' otherwise (see depRoom in kernel/index.ts). */
  | (NodeBase & { k: 'assume'; room: ScopeId; slot?: number })
  | (NodeBase & { k: 'step'; input: NodeId; op: StepOp })
  /** Instantiate a cond card (or a premise-free card: emits the instance) with σ,
   *  inputs[i] must prove inst(premises[i], σ) exactly (norm-equal). */
  | (NodeBase & { k: 'apply'; rule: RuleRef; inputs: NodeId[]; subst: Subst; structs?: Record<MetaId, string> })
  /** eq(X,M) , eq(Y,M) ⟹ eq(X,Y). Right sides must be norm-equal. */
  | (NodeBase & { k: 'merge'; inputs: [NodeId, NodeId] })
  /** eq(L,R) , neq(L,R) or neq(R,L) ⟹ bot. inputs = [eqNode, neqNode]. */
  | (NodeBase & { k: 'clash'; inputs: [NodeId, NodeId] })
  /** scope === room.parent; input is a bot node with scope === room. */
  | (NodeBase & { k: 'exit'; room: ScopeId; input: NodeId })
  /** size(n) ⟹ law ∀x. xⁿ = e  (imported: Lagrange corollary). xⁿ is the n-factor word, or with
   *  v4 Phase B `power: true` the power node x^n. */
  | (NodeBase & { k: 'press'; input: NodeId; power?: boolean })
  /** v4: A = B , C = D ⟹ AC = BD (congruence of multiplication). */
  | (NodeBase & { k: 'product'; inputs: [NodeId, NodeId] })
  /** v4 ∀-intro: bind every graph variable occurring free in the input fact (order of first
   *  occurrence) as metas. eq → law; neq → cond(no premises); law/cond → same kind, metas prepended.
   *  Eigenvariable condition: no room assumption among the input's deps mentions a bound variable. */
  | (NodeBase & { k: 'generalize'; input: NodeId });

export interface ProofGraph {
  nodes: ProofNode[];   // any order; must be acyclic
  rooms: Room[];
  /** v4: player-declared variables (Towers). Each has variable: true and a unique id/label. */
  vars?: AtomDecl[];
  /** Book phase B: structures declared by Towers (Subgroup Towers H₁ ≤ G, N₁ ⊴ G). Fresh, like vars. */
  structs?: StructDecl[];
}

// ───────────────────────────── Level manifest ─────────────────────────────

export interface AtomDecl {
  id: AtomId;
  /** Display label, e.g. 'a', 'e′'. */
  label: string;
  /** Palette slot 0..5 for bead hue. */
  hue: number;
  /**
   * v4: a player-declared variable (a Tower's `Let x₁ ∈ G`). Variables are FRESH — no given
   * mentions them — so a fact about them can be generalized (∀-intro) subject to the
   * eigenvariable condition. Level atoms (a, b, e′) are constants and never generalize.
   */
  variable?: boolean;
  /** v4 Phase B: the sort of a Tower variable. 'Z' Towers (n₁, k₁) are integers that occur only inside
   *  exponents (as zvar refs). Default 'G'. Level atoms are always G constants. */
  sort?: Sort;
  /** Book phase C: the group or set sort an element atom / element Tower lives in (default the group 'G'). */
  carrier?: SortId;
}

export interface GivenDecl {
  id: string;
  fact: Fact; // eq | neq | size | law | cond — ground except cards' metas
  /** Short display name for ribbons/transcript, e.g. 'h', 'H'. */
  name: string;
}

export interface SocketDecl {
  id: string;
  /** eq | neq pallet; v4: or a law/cond card (a ∀ goal), matched up to meta renaming. */
  target: Pallet | Card;
  /** Given ids a proof at this socket may depend on. */
  allowedGivens: string[];
  /**
   * Book phase A — an OPEN dock (design/pinter/KERNEL-EXT.md §1). Each hole is a meta id (sort G: a
   * `{k:'meta'}` term; sort Z: a `{k:'zmeta'}` ref inside an exponent) that occurs in `target` and is
   * NOT one of a card target's binders. The dock is filled by a fact equal to target[holes := T]; in a
   * law/cond target T may mention the card's bound metas (a Skolem witness: ∀z ∃y. P(z, y)).
   * Absent or [] = an ordinary closed dock.
   */
  holes?: HoleDecl[];
}

/** One hole of an open dock (Book phase A). */
export interface HoleDecl {
  /** The meta id standing for the hole inside the socket's target. Repeated occurrences bind one term. */
  id: MetaId;
  /** G (default): a group element. Z: an integer, occurring only inside exponents. */
  sort?: Sort;
  /** "Solve for d": the answer may not mention these level atoms. */
  notMentioning?: AtomId[];
  /** Display label of the empty hole (default '?', or '?₁', '?₂' … when there are several). */
  label?: string;
}

/** A theorem in the registry. Statement only; proofs are the levels. */
export interface Schema {
  id: string;
  /** Workshop name on the floor, e.g. 'Witness Stamp'. */
  name: string;
  /** The theorem's own name in the transcript, one for both sides of a mirror pair, e.g. 'unique inverse'. */
  textbook: string;
  card: Card;
  /** v4 'authored': a player lemma from the Lemma Book (re-verified from its saved proof on load). */
  /** 'axiom' (Book phase B): an axiom of a declared kind (subgroup closure), kernel-owned, no dependency. */
  origin: 'earned' | 'import' | 'authored' | 'axiom';
  /** Level that earns it (earned only). */
  fromLevel?: string;
  /** Whether a mirror (Gᵒᵖ) variant is offered. */
  mirrorable: boolean;
}

export interface Toolset {
  /** Lift (multiply both sides) available. */
  lift: boolean;
  /** Merge machine available. */
  merge: boolean;
  /** Rooms available. */
  suppose: boolean;
  classical: boolean;
  /** Lagrange press available. */
  press: boolean;
  /** Registry schema ids usable in this level (mirrors included automatically if mirrorable). */
  schemas: string[];
  /** Conjecture lab available. */
  conjecture: boolean;
}

export interface LevelManifest {
  id: string;            // 'L01' ...
  index: number;         // display number
  /** Main campaign: 1–4 (4 = Powers). The Book campaign: Pinter's chapter number, 2–16. */
  chapter: number;
  /** Which campaign the level belongs to (default 'main'). The Book follows Pinter (design/pinter/SYNTHESIS.md). */
  campaign?: 'main' | 'book';
  /** The Book: the world this level belongs to (1–14, see SYNTHESIS §3). */
  world?: number;
  /** The Book: the proof method this level trains, shown on the order chip (e.g. 'Uniqueness argument'). */
  method?: string;
  /** The Book: the specific insight, shown only on the Paper view after ∎ (never before: it would spoil). */
  insight?: string;
  /** The Book: standard names offered when saving this level's lemmas, in dock order (e.g. ['double inverse']). */
  lemmaNames?: string[];
  /** The Book: design-only source citation, e.g. 'Pinter 4.A3'. Never shown to players as prose. */
  source?: string;
  side?: boolean;        // side order
  title: string;
  memo: string;          // one dry work-order line
  /** Element constants of this level. */
  atoms: AtomDecl[];
  /** Book phase B: the level's subgroups (H ≤ G; N ⊴ G when normal). Their closure axioms are dependency-free. */
  subgroups?: SubgroupDecl[];
  /** Book phase C: the level's sorts (default: one group 'G'). A level declaring sorts lists 'G' if it uses it. */
  sorts?: SortDecl[];
  /** Book phase C: the level's maps (plain maps, homomorphisms, actions). Kind laws are dependency-free. */
  maps?: MapDecl[];
  /**
   * Authoring: why this level is exempt from the nontrivial-model threshold (pin 4), when its statement is true in
   * only a handful of catalogue models BY NATURE (P14.3: the only hom ℤ₅ → ℤ₃ is trivial, and that is the theorem).
   * An exempt level's truth test must instead show each given is needed (dropping it yields a counterexample).
   */
  oracleExempt?: string;
  givens: GivenDecl[];
  sockets: SocketDecl[];
  tools: Toolset;
  /** Pre-placed start spools (tutorial levels). */
  preStarts?: Term[];
  /** Schemas this level earns on completion (declared contracts). */
  unlocks: string[];
  /** One-line "new idea" for the level map. */
  idea: string;
  /** Designer par: stations and axiom count of the intended solution. */
  par: { parts: number; axioms: number };
  /** Theorem-map edges: levels whose results this one is meant to use. */
  uses: string[];
  /**
   * Prediction cards (conjecture lab, shown before proving): candidate claims the
   * player predicts true/false, then tests against the finite-group catalogue under
   * the level's givens. Testing never proves; a survivor can be pinned as a target.
   */
  predict?: Pallet[];
}

// ───────────────────────────── Check results ─────────────────────────────

/** Dependency tokens: 'g:<givenId>' for givens, 'a:<roomId>' for room assumptions. */
export type Dep = string;

export interface NodeResult {
  id: NodeId;
  ok: boolean;
  fact?: Fact;
  deps: Dep[];
  classical: boolean;
  /** Human-readable reason in mathematical language when !ok. */
  error?: string;
  /** Count of primitive kernel ops beneath this node (earned schemas count 1 here; see metrics). */
}

export interface SocketResult {
  id: string;
  filledBy?: NodeId;
  ok: boolean;
  error?: string;
  /** Book phase A, open docks: the bound hole values (G holes → terms, Z holes → { k: 'int' }), over the
   *  target's own bound metas for a ∀ target. Present iff ok and the socket has holes. */
  holes?: Subst;
  /** Book phase A, open docks: target[holes := values] — the closed statement the dock now shows. */
  instance?: Pallet | Card;
}

export interface CheckResult {
  ok: boolean;               // graph well-formed (acyclic, all nodes ok)
  nodes: Record<NodeId, NodeResult>;
  sockets: SocketResult[];
  solved: boolean;           // every socket ok
}

// ───────────────────────────── Offers (bench API) ─────────────────────────────

/** A candidate move for the bench. Ops are appended as ONE station. */
export interface Offer {
  /** Stable key for React-less diffing. */
  key: string;
  /** Rule family for ink: identity | inverse | structure | equation | scope | contradiction | lemma | given */
  family: Family;
  /** Short label, e.g. 'cancel b·b⁻¹', 'insert a⁻¹a', 'use h: ab = e'. */
  label: string;
  /** TeX of the justification, e.g. '\\text{inverse}'. */
  why: string;
  /** Metas the player must still supply (e.g. x in e → x x⁻¹). Empty = ready. */
  needs: MetaId[];
  /** The resulting pallet if ready (needs empty), for preview. */
  preview?: Pallet;
  /** Build the node(s) for this offer once needs are supplied. */
  kind: OfferKind;
  /**
   * Machine grouping key for whole-pallet offers: 'schema:<id>' / 'schema:<id>:op' (mirror),
   * 'node:<id>' (a cond given), 'clash', 'merge', 'lift', 'swap'. Offers sharing a group are
   * alternative choices of the same machine (e.g. Witness Stamp cuts).
   */
  group?: string;
  /**
   * For apply offers: where each meta's instance sits on the ACTIVE pallet, so the bench can
   * draw the choice on the beads (cut line between u|v, common prefix bracket, …).
   */
  bindings?: { meta: MetaId; addr: Addr }[];
  /**
   * v4 Phase B: the sort of every meta in `needs` — 'G' wants a group term (parseTerm), 'Z' an integer
   * value { k: 'int' } (parseInteger), e.g. power.identity's n. Present whenever `needs` is non-empty.
   */
  needSorts?: Record<MetaId, Sort>;
}

export type Family =
  | 'identity' | 'inverse' | 'structure' | 'equation'
  | 'scope' | 'contradiction' | 'lemma' | 'given';

export type OfferKind =
  /** One or more step ops on the active node (e.g. rewrite + auto-tidy). */
  | { k: 'steps'; ops: StepOp[] }
  /** An apply node: active node is inputs[premiseIndex]; others given. */
  /** preSwap: the active pallet matches the premise only with its sides exchanged — the store first
   *  appends a recorded 'swap' step (gesture 'auto-swap', not scored) and feeds that to the machine. */
  | { k: 'apply'; rule: RuleRef; inputs: NodeId[]; subst: Subst; tidy?: StepOp[]; preSwap?: boolean }
  | { k: 'clash'; neq: NodeId }
  | { k: 'merge'; other: NodeId };
