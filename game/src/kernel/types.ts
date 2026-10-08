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
  | { k: 'e' }
  | { k: 'inv'; arg: Term }
  /** Flat product: fs.length >= 2 and no element of fs is a 'mul'. */
  | { k: 'mul'; fs: Term[] }
  /** Only inside patterns (laws/conds/axioms). A ground term has none. */
  | { k: 'meta'; id: MetaId };

export type Subst = Record<MetaId, Term>;

// ───────────────────────────── Facts ─────────────────────────────

/** Pallets: things that ride belts. */
export type Pallet =
  | { k: 'eq'; l: Term; r: Term }
  | { k: 'neq'; l: Term; r: Term }
  | { k: 'bot' }
  /** |G| = n, n a positive literal (1..24). Never an element term. */
  | { k: 'size'; n: number };

/** Cards: universally quantified statements, used by instantiation. */
export type Card =
  /** ∀metas. l = r (unconditional law). Citable as a rewrite rule. */
  | { k: 'law'; metas: MetaId[]; l: Term; r: Term }
  /** ∀metas. premises ⇒ concl. Applied via an 'apply' node. */
  | { k: 'cond'; metas: MetaId[]; premises: PatFact[]; concl: PatFact };

/** eq/neq whose sides may contain metas. */
export type PatFact = { k: 'eq' | 'neq'; l: Term; r: Term };

export type Fact = Pallet | Card;

// ───────────────────────────── Addresses ─────────────────────────────

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
  /** suppose: assumes eq(l,r), exits neq(l,r). classical: assumes neq(l,r), exits eq(l,r). */
  kind: 'suppose' | 'classical';
  l: Term;
  r: Term;
}

export type StepOp =
  /** Replace the focused redex (must equal norm(inst(src,σ))) by norm(inst(dst,σ)).
   *  dir 'fwd': src=l,dst=r. 'rev': src=r,dst=l. σ must bind every meta of the rule. */
  | { k: 'rewrite'; rule: RuleRef; dir: 'fwd' | 'rev'; at: Addr; subst: Subst }
  /** Insert an explicit e factor at a gap (unit axiom read backwards). */
  | { k: 'insertE'; at: GapAddr }
  /** Multiply both rails by term on the given side. */
  | { k: 'lift'; side: 'left' | 'right'; term: Term }
  /** L = R ⟹ R = L (eq) ; also L ≠ R ⟹ R ≠ L (neq). */
  | { k: 'swap' };

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
  | (NodeBase & { k: 'assume'; room: ScopeId })                    // scope === room; dep: room assumption
  | (NodeBase & { k: 'step'; input: NodeId; op: StepOp })
  /** Instantiate a cond card (or a premise-free card: emits the instance) with σ,
   *  inputs[i] must prove inst(premises[i], σ) exactly (norm-equal). */
  | (NodeBase & { k: 'apply'; rule: RuleRef; inputs: NodeId[]; subst: Subst })
  /** eq(X,M) , eq(Y,M) ⟹ eq(X,Y). Right sides must be norm-equal. */
  | (NodeBase & { k: 'merge'; inputs: [NodeId, NodeId] })
  /** eq(L,R) , neq(L,R) or neq(R,L) ⟹ bot. inputs = [eqNode, neqNode]. */
  | (NodeBase & { k: 'clash'; inputs: [NodeId, NodeId] })
  /** scope === room.parent; input is a bot node with scope === room. */
  | (NodeBase & { k: 'exit'; room: ScopeId; input: NodeId })
  /** size(n) ⟹ law ∀x. xⁿ = e  (imported: Lagrange corollary). */
  | (NodeBase & { k: 'press'; input: NodeId });

export interface ProofGraph {
  nodes: ProofNode[];   // any order; must be acyclic
  rooms: Room[];
}

// ───────────────────────────── Level manifest ─────────────────────────────

export interface AtomDecl {
  id: AtomId;
  /** Display label, e.g. 'a', 'e′'. */
  label: string;
  /** Palette slot 0..5 for bead hue. */
  hue: number;
}

export interface GivenDecl {
  id: string;
  fact: Fact; // eq | neq | size | law | cond — ground except cards' metas
  /** Short display name for ribbons/transcript, e.g. 'h', 'H'. */
  name: string;
}

export interface SocketDecl {
  id: string;
  target: Pallet; // eq | neq
  /** Given ids a proof at this socket may depend on. */
  allowedGivens: string[];
}

/** A theorem in the registry. Statement only; proofs are the levels. */
export interface Schema {
  id: string;
  /** Workshop name on the floor, e.g. 'Witness Stamp'. */
  name: string;
  /** Textbook name in the transcript, e.g. 'uniqueness of inverses'. */
  textbook: string;
  card: Card;
  origin: 'earned' | 'import';
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
  chapter: 1 | 2 | 3;
  side?: boolean;        // side order
  title: string;
  memo: string;          // one dry work-order line
  /** Element constants of this level. */
  atoms: AtomDecl[];
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
