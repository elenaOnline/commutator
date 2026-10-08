// LEMMA WORKS v3 — factory contract. Architect-owned; builders may ADD exports in
// their own files. Engineering reference: design/v3/proposals/sol-compiler.md.
// Decisions: design/v3/DESIGN.md (wins where they differ).
import type {
  Addr, Card, CheckResult, Family, GapAddr, MetaId, NodeId, Pallet, ProofGraph,
  RuleRef, ScopeId, Term,
} from '../kernel/types';

// ───────────────────────────── Geometry ─────────────────────────────

export interface Tile { x: number; y: number }
/** Clockwise quarter turns. 0 = output faces +x (east). */
export type Rot = 0 | 1 | 2 | 3;
export type Face = 'E' | 'S' | 'W' | 'N'; // +x, +y, -x, -y in grid space
export interface Rect { x: number; y: number; w: number; h: number } // half-open

// ───────────────────────────── Items ─────────────────────────────

export type ItemKind = 'term' | 'eq' | 'neq' | 'bot' | 'size' | 'law' | 'cond';

/** A value riding a belt. Facts/cards are backed by checked kernel nodes or registry schemas. */
export type ItemValue =
  | { k: 'term'; term: Term }
  | { k: 'fact'; fact: Pallet; node: NodeId }
  | { k: 'card'; card: Card; ref: RuleRef };

export const itemKindOf = (v: ItemValue): ItemKind =>
  v.k === 'term' ? 'term' : v.k === 'fact' ? v.fact.k : v.card.k;

// ───────────────────────────── Targets ─────────────────────────────

/** Neighbouring factors around a selection, for structural re-resolution (Sol §6). */
export interface Neighbours { left: Term[]; right: Term[]; leftEdge: boolean; rightEdge: boolean }
export type Anchor = { k: 'inv' } | ({ k: 'factor' } & Neighbours);

export type SpanTarget =
  | { k: 'first' }
  | { k: 'pin'; side: 'l' | 'r'; selected: Term; neighbours: Neighbours; ancestors: Anchor[]; last?: Addr };
export type GapTarget =
  | { k: 'first' }
  | { k: 'pin'; side: 'l' | 'r'; neighbours: Neighbours; ancestors: Anchor[]; last?: GapAddr };

/** A parameter: typed on the machine (knob) or supplied by a term belt into a port. */
export type Param = { k: 'knob'; term: Term | null } | { k: 'port' };

// ───────────────────────────── Machines ─────────────────────────────

export type MachineKind =
  // v4 player-placeable — four verbs with recipes, plus sources, towers and ∀
  | 'spool'      // t = t
  | 'tower'      // Let x₁ ∈ G — declares a variable, broadcast floor-wide (no ports)
  | 'rewriter'   // acts at a bracket/gap in one equation, by a recipe
  | 'operator'   // acts on the whole equation, by a recipe
  | 'joiner'     // combines two facts, by a recipe
  | 'theorem'    // premises → conclusion, by a conditional card recipe
  | 'forall'     // ∀-intro: fact about tower variables → law / theorem card
  | 'carddock'   // emits a library card onto a belt
  | 'hopper'     // emits a term onto a belt
  // level / room protected (created by the system, not the hotbar)
  | 'given' | 'socket' | 'desk' | 'gate';

/**
 * A reference into the LIBRARY (no belts): axioms, level givens, earned/authored/imported theorems.
 * The compiler lowers it to a kernel RuleRef (givens → their given node; lagrange → the press law).
 */
export type LibRef =
  | { k: 'axiom'; id: 'unitL' | 'unitR' | 'invL' | 'invR' }
  | { k: 'given'; givenId: string }
  | { k: 'schema'; id: string; mirror?: boolean }   // earned or authored (Lemma Book)
  | { k: 'lagrange' };                              // IMPORTED ∀x. x^{|G|} = e (needs a |G| = n given)

export type RewriteRecipe =
  | { k: 'cancel' }                               // x x⁻¹ / x⁻¹x → e at the bracket (+ tidy)
  | { k: 'pop' }                                  // remove a lone e beside a factor
  | { k: 'insertE' }                              // at the gap
  | { k: 'insertPair'; inv: boolean; x: Param }   // at the gap: x x⁻¹ (inv=false) or x⁻¹x (inv=true)
  | { k: 'law'; ref: LibRef }                     // rewrite with a library law/fact; at a gap if its source side is e
  | { k: 'routed' };                              // rewrite with the eq/law arriving on the rule port

export type OperatorRecipe =
  | { k: 'multiply'; side: 'left' | 'right'; t: Param }
  | { k: 'invert' }
  | { k: 'swap' };

export type JoinerRecipe = { k: 'chain' } | { k: 'product' } | { k: 'clash' };

export type TheoremRecipe =
  | { k: 'library'; ref: LibRef }   // a conditional card: earned (Witness, Lathe), authored, or a cond given
  | { k: 'routed' };                // the card arriving on the card port

export type MachineConfig =
  | { kind: 'spool'; t: Param }
  | { kind: 'tower'; varId: string; label: string; sort: 'G' | 'Z' }  // label unique on the floor, e.g. 'x₁'
  | { kind: 'rewriter'; recipe: RewriteRecipe | null; dir: 'fwd' | 'rev'; target: SpanTarget; gap: GapTarget; values: Record<MetaId, Param>; tidy: boolean }
  | { kind: 'operator'; recipe: OperatorRecipe | null }
  | { kind: 'joiner'; recipe: JoinerRecipe | null }
  | { kind: 'theorem'; recipe: TheoremRecipe | null; choice: number; values: Record<MetaId, Param> }
  | { kind: 'forall' }
  | { kind: 'carddock'; ref: LibRef | null }
  | { kind: 'hopper'; t: Term | null }
  | { kind: 'given'; givenId: string }
  | { kind: 'socket'; socketId: string }
  | { kind: 'desk'; room: string }
  | { kind: 'gate'; room: string };

export interface Machine {
  id: string;
  kind: MachineKind;
  /** Minimum corner of the rotated footprint. */
  at: Tile;
  rot: Rot;
  config: MachineConfig;
  /** System-created (givens, sockets, pre-start spools, desks, gates): cannot be deleted by the player. */
  locked?: boolean;
}

/** A port, resolved in world space by `portsOf(machine)` (catalog.ts). */
export interface Port {
  id: string;              // 'q' (work) · 'rule' · 'x'/'t'/'meta:<m>' (param) · 'p0'.. (premise) · 'a','b' · 'out'
  dir: 'in' | 'out';
  accepts: ItemKind[];
  role: 'work' | 'rule' | 'param' | 'premise' | 'out';
  label: string;
  tile: Tile;              // the machine cell this port sits on
  face: Face;              // outward facing; a belt attaches on the neighbouring cell in this direction
}

export interface Endpoint { m: string; port: string }

/** A belt from one output to one input. Belts sharing `from` form a copy tree (free duplication). */
export interface Belt {
  id: string;
  from: Endpoint;
  to: Endpoint;
  /** Grid cells, from the cell adjacent to the output port to the cell adjacent to the input port.
   *  Empty = a direct link between touching ports (output's front cell is the input's machine cell). */
  path: Tile[];
  /**
   * Set when an edit (move/rotate/place) left this belt without a valid route. The belt is KEPT
   * (never silently dropped), drawn dashed, transports nothing, and its reason names the blocker.
   * Re-routing it (drag, or any later edit that frees a route) clears it.
   */
  broken?: string;
}

export interface Room {
  id: ScopeId;
  /** v4 'assume': implication-intro — the gate exports `P ⇒ Q` for any fact Q made inside. */
  kind: 'suppose' | 'classical' | 'assume';
  /** For 'assume': the assumption is l = r (default) or l ≠ r. */
  rel?: 'eq' | 'neq';
  /** suppose: assumes l = r, exports l ≠ r. classical: assumes l ≠ r, exports l = r. */
  l: Term;
  r: Term;
  rect: Rect;
}

export interface Canvas {
  version: 3;
  levelId: string;
  machines: Machine[];
  belts: Belt[];
  rooms: Room[];
}

// ───────────────────────────── Catalogue (static machine specs) ─────────────────────────────

export interface MachineSpec {
  kind: MachineKind;
  name: string;            // 'Canceller'
  family: Family;          // ink
  glyph: string;           // tile glyph, e.g. 'x⁻¹', '=', '⊥'
  blurb: string;           // one line, maths language: 'x x⁻¹ → e at a bracket'
  hotkey?: string;         // '1'..'0'
  placeable: boolean;
}

// ───────────────────────────── Compile result ─────────────────────────────

export type StaticStatus =
  | { k: 'ok' }
  | { k: 'starved'; reason: string }      // missing ingredient / unconfigured / upstream cannot supply
  | { k: 'jammed'; reason: string };      // local geometry / type / authority / target / kernel failure

export interface MachineResult {
  id: string;
  status: StaticStatus;
  scope: ScopeId;
  /** Kernel nodes this machine owns, in order (e.g. rewrite + tidy). */
  nodes: NodeId[];
  /** Values currently present at each input port (from upstream outputs), if any. */
  inputs: Record<string, ItemValue | undefined>;
  /** The value this machine emits when working. */
  out?: ItemValue;
  /** For targeting machines: every candidate target on the incoming equation, and the chosen index. */
  candidates?: { addr: Addr | GapAddr; label: string }[];
  chosen?: number;
  /** For apply/stamp: the binding alternatives (cuts/prefixes) and the chosen index. */
  choices?: { label: string; bindings: { meta: MetaId; addr: Addr }[] }[];
  /** Processing time in ticks. */
  duration: number;
}

export interface Compiled {
  graph: ProofGraph;
  check: CheckResult;
  machines: Record<string, MachineResult>;
  /** Room membership per machine (innermost containing room or 'root'). */
  scopeOf: Record<string, ScopeId>;
  /** Per socket id: the machine feeding it and whether its delivery would be accepted. */
  sockets: Record<string, { by?: string; ok: boolean; reason?: string }>;
  /** True iff every socket would accept what is routed into it. QED waits for runtime delivery. */
  solvable: boolean;
  /** Belt-level problems (bad endpoints, crossings, scope leaks) keyed by belt id. */
  beltErrors: Record<string, string>;
}

// ───────────────────────────── Runtime ─────────────────────────────

export interface Packet {
  id: number;
  value: ItemValue;
  /** Where it is: on belt `belt` at path index `i` (-1 = leaving the output port), or held in a machine port. */
  at: { k: 'belt'; belt: string; i: number } | { k: 'port'; m: string; port: string };
}

export type LiveStatus = 'working' | 'starved' | 'jammed' | 'blocked' | 'idle' | 'sealed';

export interface RunState {
  tick: number;
  packets: Packet[];
  /** Machine id → job in flight (finish tick) or a finished job blocked on its output. */
  jobs: Record<string, { finish: number; blocked?: boolean }>;
  /** Catalyst/rule slots that captured an item (kept until an edit). */
  latched: Record<string, Record<string, ItemValue>>;
  /** Socket id → tick of first accepted delivery. */
  delivered: Record<string, number>;
  live: Record<string, LiveStatus>;
  /** Source machine id → next emission tick. */
  nextEmit: Record<string, number>;
  nextPacketId: number;
}

export interface FactoryMetrics {
  machines: number;   // player-placed machines (excludes given/socket/desk/gate/pre-placed)
  area: number;       // distinct occupied tiles (player footprints + belts + room rects)
  cycles: number | null; // max over sockets of first-delivery tick; null if not all delivered
}
