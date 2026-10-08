// LEMMA WORKS — app store. Architect-owned. Builders may ADD actions/fields
// (announce them in your report); never change an existing signature.
//
// Invariant: `graph` only ever contains nodes the kernel accepts. Every
// mutation is tentatively applied, re-checked with kernel.check, and rolled
// back (with a 'shake' event) if any node fails.
import * as K from '../kernel';
import type {
  Addr, CheckResult, GapAddr, LevelManifest, NodeId, Offer, Pallet, ProofGraph,
  ProofNode, Room, ScopeId, StepOp, Subst, Term,
} from '../kernel';
import { LEVELS, LEVEL_BY_ID, REGISTRY } from '../levels/levels';

export type Selection = Addr | GapAddr | null;

export interface Claim { id: string; pallet: Pallet; scope: ScopeId }

export interface LevelProgress {
  graph: ProofGraph;
  claims: Claim[];
  solvedAt?: number;
  best?: K.Metrics;
  /** Metrics of every distinct solve, for the personal-best line. */
  history: K.Metrics[];
}

export interface Save {
  version: 1;
  levels: Record<string, LevelProgress>;
  /** Schema ids earned so far (unlock happens on first solve). */
  earned: string[];
  settings: { reducedMotion: boolean; speed: number };
}

export interface ReplayState {
  playing: boolean;
  /** Float index into `order` (nodes revealed so far). */
  cursor: number;
  order: NodeId[];
  speed: number;
}

export interface UIState {
  screen: 'map' | 'level';
  levelId: string;
  activeNode: NodeId | null;
  selection: Selection;
  /** Cross-surface hover link (board ↔ bench ↔ transcript). */
  hoverNode: NodeId | null;
  replay: ReplayState;
  /** A toolbox rule the player has picked up: the bench lights every span it applies to. */
  armed: K.RuleRef | null;
  /** Last QED ceremony to play (cleared by the shell after playing). */
  ceremony: { levelId: string; unlocked: string[] } | null;
}

export interface State {
  save: Save;
  ui: UIState;
  level: LevelManifest;
  graph: ProofGraph;
  check: CheckResult;
  ctx: K.KernelCtx;
}

export type StoreEvent =
  | { type: 'nodes-added'; ids: NodeId[] }
  | { type: 'nodes-removed'; ids: NodeId[] }
  | { type: 'shake'; reason: string; at?: NodeId }
  | { type: 'delivered'; socketId: string; nodeId: NodeId }
  | { type: 'solved'; levelId: string; unlocked: string[] }
  | { type: 'room-closed'; roomId: ScopeId }
  | { type: 'level-opened'; levelId: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const SAVE_KEY = 'lemma-works/v1';
let uid = 0;
const fresh = (p: string) => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

function emptyGraph(level: LevelManifest): ProofGraph {
  const nodes: ProofNode[] = level.givens.map((g) => ({ id: `g:${g.id}`, scope: K.ROOT, k: 'given', givenId: g.id }));
  for (const [i, t] of (level.preStarts ?? []).entries()) nodes.push({ id: `pre${i}`, scope: K.ROOT, k: 'start', term: t });
  return { nodes, rooms: [] };
}

export class Store {
  private s: State;
  private subs = new Set<(s: State) => void>();
  private evSubs = new Set<(e: StoreEvent) => void>();
  private undoStack: ProofGraph[] = [];
  private redoStack: ProofGraph[] = [];
  /** Socket → node last announced as delivered (so 'delivered' fires once per fill). */
  private deliveredTo = new Map<string, NodeId>();

  constructor() {
    const save = Store.load();
    const levelId = LEVELS[0]!.id;
    const level = LEVEL_BY_ID[levelId]!;
    const ctx = this.ctxFor(level, save);
    const graph = save.levels[levelId]?.graph ?? emptyGraph(level);
    this.s = {
      save, level, graph, ctx, check: K.check(graph, ctx),
      ui: {
        screen: 'map', levelId, activeNode: null, selection: null, hoverNode: null, ceremony: null, armed: null,
        replay: { playing: false, cursor: Infinity, order: [], speed: save.settings.speed },
      },
    };
  }

  // ───────── subscription ─────────
  get(): State { return this.s; }
  subscribe(fn: (s: State) => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  on(fn: (e: StoreEvent) => void): () => void { this.evSubs.add(fn); return () => this.evSubs.delete(fn); }
  private emit(e: StoreEvent) { for (const f of this.evSubs) f(e); }
  private set(patch: Partial<State>) { this.s = { ...this.s, ...patch }; for (const f of this.subs) f(this.s); }
  private setUI(patch: Partial<UIState>) { this.set({ ui: { ...this.s.ui, ...patch } }); }

  // ───────── persistence ─────────
  static load(): Save {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SAVE_KEY) : null;
      if (raw) { const s = JSON.parse(raw) as Save; if (s.version === 1) return s; }
    } catch { /* fresh save */ }
    return { version: 1, levels: {}, earned: [], settings: { reducedMotion: false, speed: 1 } };
  }
  private persist() {
    const { save, level, graph } = this.s;
    const prog = save.levels[level.id] ?? { graph, claims: [], history: [] };
    const next: Save = { ...save, levels: { ...save.levels, [level.id]: { ...prog, graph } } };
    this.s = { ...this.s, save: next };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  private ctxFor(level: LevelManifest, save: Save): K.KernelCtx {
    // Only schemas already earned AND listed by the level are usable.
    const allowed = level.tools.schemas.filter((id) => save.earned.includes(id) || REGISTRY[id]?.origin === 'import');
    return { level: { ...level, tools: { ...level.tools, schemas: allowed } }, registry: REGISTRY };
  }

  // ───────── navigation ─────────
  openMap() { this.setUI({ screen: 'map', activeNode: null, selection: null }); }
  openLevel(id: string) {
    const level = LEVEL_BY_ID[id];
    if (!level) return;
    const ctx = this.ctxFor(level, this.s.save);
    const graph = this.s.save.levels[id]?.graph ?? emptyGraph(level);
    this.undoStack = []; this.redoStack = [];
    const check = K.check(graph, ctx);
    this.deliveredTo = new Map(check.sockets.filter((x) => x.ok && x.filledBy).map((x) => [x.id, x.filledBy!] as [string, NodeId]));
    const active = this.defaultActive(graph, check);
    this.set({ level, ctx, graph, check });
    this.setUI({ screen: 'level', levelId: id, activeNode: active, selection: null, hoverNode: null, armed: null,
      replay: { ...this.s.ui.replay, playing: false, cursor: Infinity, order: [] } });
    this.emit({ type: 'level-opened', levelId: id });
  }
  resetLevel() { this.commitGraph(emptyGraph(this.s.level), { recordUndo: true }); this.setUI({ activeNode: this.defaultActive(this.s.graph, this.s.check), selection: null }); }

  /**
   * Where the bench opens: a pre-loaded spool's belt end in tutorials; otherwise the most
   * recently built belt end; on a fresh level, nothing — the bench asks where to begin.
   */
  private defaultActive(g: ProofGraph, c: CheckResult): NodeId | null {
    void c;
    const pre = g.nodes.find((n) => n.k === 'start' && n.id.startsWith('pre'));
    const built = [...g.nodes].reverse().find((n) => n.k !== 'given' && !n.id.startsWith('pre'));
    if (built) return this.endOf(built.id, g);
    if (pre) return this.endOf(pre.id, g);
    return null;
  }

  /** Follow single-consumer step chain to its end. */
  endOf(id: NodeId, g: ProofGraph = this.s.graph): NodeId {
    let cur = id;
    for (;;) {
      const next = g.nodes.find((n) => n.k === 'step' && n.input === cur);
      if (!next) return cur;
      cur = next.id;
    }
  }

  // ───────── selection / hover ─────────
  setActive(id: NodeId | null) { this.setUI({ activeNode: id, selection: null }); }
  setSelection(sel: Selection) { this.setUI({ selection: sel }); }
  setArmed(rule: K.RuleRef | null) { this.setUI({ armed: rule }); }
  setHover(id: NodeId | null) { if (this.s.ui.hoverNode !== id) this.setUI({ hoverNode: id }); }

  // ───────── offers ─────────
  offers(sel: Selection = this.s.ui.selection, nodeId: NodeId | null = this.s.ui.activeNode): Offer[] {
    if (!nodeId) return [];
    return K.offersAt(this.s.graph, this.s.check, nodeId, sel, this.s.ctx);
  }
  fill(offer: Offer, values: Subst, nodeId: NodeId | null = this.s.ui.activeNode) {
    if (!nodeId) return { ok: false as const, error: 'no active pallet' };
    return K.fillOffer(offer, values, this.s.graph, this.s.check, nodeId, this.s.ctx);
  }

  // ───────── mutations ─────────

  /** Core: try a new graph; keep it only if every node checks. */
  private commitGraph(g: ProofGraph, opts: { recordUndo: boolean }): Result<CheckResult> {
    const check = K.check(g, this.s.ctx);
    const bad = Object.values(check.nodes).find((n) => !n.ok);
    if (!check.ok || bad) {
      const reason = bad?.error ?? 'that would not be a valid proof';
      this.emit({ type: 'shake', reason, at: bad?.id });
      return { ok: false, error: reason };
    }
    if (opts.recordUndo) { this.undoStack.push(this.s.graph); this.redoStack = []; }
    const before = new Set(this.s.graph.nodes.map((n) => n.id));
    const after = new Set(g.nodes.map((n) => n.id));
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    this.set({ graph: g, check });
    if (added.length) this.emit({ type: 'nodes-added', ids: added });
    if (removed.length) this.emit({ type: 'nodes-removed', ids: removed });
    this.persist();
    this.afterCommit();
    return { ok: true, value: check };
  }

  /** Auto-deliver (with recorded swap), and QED bookkeeping. */
  private afterCommit() {
    const { check, graph, level } = this.s;
    // auto-swap delivery: a root pallet equal to a socket target with sides exchanged
    for (const sock of check.sockets) {
      if (sock.ok) continue;
      const decl = level.sockets.find((d) => d.id === sock.id)!;
      const t = decl.target;
      if (t.k !== 'eq' && t.k !== 'neq') continue;
      for (const n of graph.nodes) {
        if (n.scope !== K.ROOT) continue;
        if (graph.nodes.some((m) => m.k === 'step' && m.input === n.id)) continue; // belt ends only
        const f = check.nodes[n.id]?.fact;
        if (!f || f.k !== t.k) continue;
        if (K.termEq(f.l, t.r) && K.termEq(f.r, t.l)) {
          const node: ProofNode = { id: fresh('n'), scope: K.ROOT, k: 'step', input: n.id, op: { k: 'swap' }, meta: { station: fresh('st'), gesture: 'auto-swap' } };
          const r = this.commitGraph({ ...graph, nodes: [...graph.nodes, node] }, { recordUndo: false });
          if (r.ok) this.setUI({ activeNode: node.id });
          return; // commitGraph re-enters afterCommit
        }
      }
    }
    for (const sock of check.sockets) {
      if (!sock.ok || !sock.filledBy) continue;
      if (this.deliveredTo.get(sock.id) === sock.filledBy) continue;
      this.deliveredTo.set(sock.id, sock.filledBy);
      this.emit({ type: 'delivered', socketId: sock.id, nodeId: sock.filledBy });
    }
    for (const sock of check.sockets) if (!sock.ok) this.deliveredTo.delete(sock.id);
    if (check.solved) this.markSolved();
  }

  private markSolved() {
    const { save, level, graph, check, ctx } = this.s;
    const m = K.metrics(graph, check, ctx);
    const prog: LevelProgress = save.levels[level.id] ?? { graph, claims: [], history: [] };
    const first = !prog.solvedAt;
    const dup = prog.history.some((h) => h.parts === m.parts && h.axioms === m.axioms && h.peak === m.peak);
    const best = prog.best
      ? { parts: Math.min(prog.best.parts, m.parts), axioms: Math.min(prog.best.axioms, m.axioms), peak: Math.min(prog.best.peak, m.peak) }
      : m;
    const unlocked = first ? level.unlocks.filter((u) => !save.earned.includes(u)) : [];
    const next: Save = {
      ...save,
      earned: [...save.earned, ...unlocked],
      levels: { ...save.levels, [level.id]: { ...prog, graph, solvedAt: prog.solvedAt ?? Date.now(), best, history: dup ? prog.history : [...prog.history, m] } },
    };
    this.s = { ...this.s, save: next };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    if (first || !dup) {
      this.setUI({ ceremony: { levelId: level.id, unlocked } });
      this.emit({ type: 'solved', levelId: level.id, unlocked });
    }
  }
  clearCeremony() { this.setUI({ ceremony: null }); }

  /** Add a start spool t = t in a scope. Becomes active. */
  addStart(term: Term, scope: ScopeId = this.activeScope()): Result<NodeId> {
    const node: ProofNode = { id: fresh('n'), scope, k: 'start', term: K.norm(term) };
    const r = this.commitGraph({ ...this.s.graph, nodes: [...this.s.graph.nodes, node] }, { recordUndo: true });
    if (!r.ok) return r;
    this.setUI({ activeNode: node.id, selection: null });
    return { ok: true, value: node.id };
  }

  /** Scope of the active node (where new spools go). */
  activeScope(): ScopeId {
    const id = this.s.ui.activeNode;
    return (id && this.s.graph.nodes.find((n) => n.id === id)?.scope) || K.ROOT;
  }

  /**
   * Commit a ready offer (needs = []) on a node. Steps after `nodeId` on its
   * belt are truncated first (undoable). Clash inside a room auto-exits.
   * Returns the new belt-end node.
   */
  commitOffer(offer: Offer, nodeId: NodeId | null = this.s.ui.activeNode): Result<NodeId> {
    if (!nodeId) return { ok: false, error: 'no active pallet' };
    if (offer.needs.length) return { ok: false, error: 'offer still needs values' };
    const base = this.truncated(nodeId);
    const scope = base.nodes.find((n) => n.id === nodeId)!.scope;
    const station = fresh('st');
    const nodes = [...base.nodes];
    let last = nodeId;
    const pushStep = (op: StepOp, gesture?: string) => {
      const id = fresh('n');
      nodes.push({ id, scope, k: 'step', input: last, op, meta: { station, gesture } });
      last = id;
    };
    const kind = offer.kind;
    if (kind.k === 'steps') {
      const isTidy = (op: StepOp) => op.k === 'rewrite' && op.rule.k === 'axiom' && (op.rule.id === 'unitL' || op.rule.id === 'unitR') && op.dir === 'fwd';
      kind.ops.forEach((op, i) => pushStep(op, i > 0 && isTidy(op) ? 'auto-tidy' : offer.label));
    } else if (kind.k === 'apply') {
      let inputs = kind.inputs;
      if (kind.preSwap) {
        const sw = fresh('n');
        nodes.push({ id: sw, scope, k: 'step', input: nodeId, op: { k: 'swap' }, meta: { station: fresh('st'), gesture: 'auto-swap' } });
        inputs = inputs.map((i) => (i === nodeId ? sw : i));
      }
      const id = fresh('n');
      nodes.push({ id, scope, k: 'apply', rule: kind.rule, inputs, subst: kind.subst, meta: { station, gesture: offer.label } });
      last = id;
      for (const op of kind.tidy ?? []) pushStep(op, 'auto-tidy');
    } else if (kind.k === 'clash') {
      const id = fresh('n');
      nodes.push({ id, scope, k: 'clash', inputs: [nodeId, kind.neq], meta: { station, gesture: offer.label } });
      last = id;
      const room = base.rooms.find((r) => r.id === scope);
      if (room) {
        const ex = fresh('n');
        nodes.push({ id: ex, scope: room.parent, k: 'exit', room: room.id, input: id, meta: { station, gesture: 'discharge' } });
        last = ex;
      }
    } else if (kind.k === 'merge') {
      const id = fresh('n');
      nodes.push({ id, scope, k: 'merge', inputs: [kind.other, nodeId], meta: { station, gesture: offer.label } });
      last = id;
    }
    const r = this.commitGraph({ ...base, nodes }, { recordUndo: true });
    if (!r.ok) return r;
    if (kind.k === 'clash') {
      const room = base.rooms.find((rm) => rm.id === scope);
      if (room) this.emit({ type: 'room-closed', roomId: room.id });
    }
    // afterCommit may have appended an auto-swap and moved activeNode; otherwise focus the new end
    if (!this.s.graph.nodes.some((n) => n.k === 'step' && n.input === last)) this.setUI({ activeNode: last, selection: null });
    else this.setUI({ activeNode: this.endOf(last), selection: null });
    return { ok: true, value: this.s.ui.activeNode! };
  }

  /** Graph with every step downstream of `nodeId` on its belt removed (and their dependents). */
  private truncated(nodeId: NodeId): ProofGraph {
    const g = this.s.graph;
    const doomed = new Set<NodeId>();
    const after = g.nodes.find((n) => n.k === 'step' && n.input === nodeId);
    if (after) this.collectDownstream(after.id, g, doomed);
    return this.without(g, doomed);
  }

  private collectDownstream(id: NodeId, g: ProofGraph, acc: Set<NodeId>) {
    if (acc.has(id)) return;
    acc.add(id);
    for (const n of g.nodes) {
      const uses: NodeId[] = [];
      if (n.k === 'step') { uses.push(n.input); if (n.op.k === 'rewrite' && n.op.rule.k === 'node') uses.push(n.op.rule.id); }
      if (n.k === 'apply') { uses.push(...n.inputs); if (n.rule.k === 'node') uses.push(n.rule.id); }
      if (n.k === 'merge' || n.k === 'clash') uses.push(...n.inputs);
      if (n.k === 'exit' || n.k === 'press') uses.push(n.input);
      if (uses.includes(id)) this.collectDownstream(n.id, g, acc);
    }
  }

  private without(g: ProofGraph, doomed: Set<NodeId>): ProofGraph {
    return { ...g, nodes: g.nodes.filter((n) => !doomed.has(n.id)) };
  }

  /** Delete a node and everything that depends on it (givens are permanent). */
  deleteNode(id: NodeId): Result<true> {
    const n = this.s.graph.nodes.find((m) => m.id === id);
    if (!n || n.k === 'given') return { ok: false, error: 'givens are permanent' };
    const doomed = new Set<NodeId>();
    this.collectDownstream(id, this.s.graph, doomed);
    let g = this.without(this.s.graph, doomed);
    if (n.k === 'assume') { // deleting a room's inlet deletes the room and everything in it
      g = this.dropRoom(g, n.room);
    }
    const r = this.commitGraph(g, { recordUndo: true });
    if (!r.ok) return r;
    const parent = n.k === 'step' ? n.input : null;
    this.setUI({ activeNode: parent && g.nodes.some((m) => m.id === parent) ? parent : this.defaultActive(g, this.s.check), selection: null });
    return { ok: true, value: true };
  }

  private dropRoom(g: ProofGraph, roomId: ScopeId): ProofGraph {
    const inside = (scope: ScopeId): boolean => {
      if (scope === roomId) return true;
      const r = g.rooms.find((x) => x.id === scope);
      return r ? inside(r.parent) : false;
    };
    const doomed = new Set<NodeId>();
    for (const n of g.nodes) if (inside(n.scope) || (n.k === 'exit' && n.room === roomId)) this.collectDownstream(n.id, g, doomed);
    const kept = this.without(g, doomed);
    return { ...kept, rooms: kept.rooms.filter((r) => !inside(r.id)) };
  }

  /**
   * Open a room. For a socket target L ≠ R → suppose room assuming L = R.
   * For L = R → classical room assuming L ≠ R. The assume node becomes active.
   */
  openRoom(kind: Room['kind'], l: Term, r: Term, parent: ScopeId = K.ROOT): Result<ScopeId> {
    const room: Room = { id: fresh('room'), parent, kind, l: K.norm(l), r: K.norm(r) };
    const assume: ProofNode = { id: fresh('n'), scope: room.id, k: 'assume', room: room.id, meta: { station: fresh('st'), gesture: kind } };
    const g: ProofGraph = { nodes: [...this.s.graph.nodes, assume], rooms: [...this.s.graph.rooms, room] };
    const res = this.commitGraph(g, { recordUndo: true });
    if (!res.ok) return res;
    this.setUI({ activeNode: assume.id, selection: null });
    return { ok: true, value: room.id };
  }

  /** Run the Lagrange press on a size node (usually a given). Returns the press node (a law card). */
  press(sizeNode: NodeId): Result<NodeId> {
    const existing = this.s.graph.nodes.find((n) => n.k === 'press' && n.input === sizeNode);
    if (existing) return { ok: true, value: existing.id };
    const scope = this.s.graph.nodes.find((n) => n.id === sizeNode)?.scope ?? K.ROOT;
    const node: ProofNode = { id: fresh('n'), scope, k: 'press', input: sizeNode, meta: { station: fresh('st'), gesture: 'Lagrange press' } };
    const r = this.commitGraph({ ...this.s.graph, nodes: [...this.s.graph.nodes, node] }, { recordUndo: true });
    return r.ok ? { ok: true, value: node.id } : r;
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    const cur = this.s.graph;
    this.redoStack.push(cur);
    this.commitGraph(prev, { recordUndo: false });
    const active = this.s.ui.activeNode;
    if (active && prev.nodes.some((n) => n.id === active)) return;
    // Walk back from the removed active node to the nearest surviving ancestor on its belt.
    const byId = new Map(cur.nodes.map((n) => [n.id, n] as const));
    let id: NodeId | null = active;
    while (id && !prev.nodes.some((n) => n.id === id)) {
      const n = byId.get(id);
      id = !n ? null
        : n.k === 'step' ? n.input
        : n.k === 'apply' || n.k === 'merge' || n.k === 'clash' ? (n.inputs[n.inputs.length - 1] ?? null)
        : n.k === 'exit' || n.k === 'press' ? n.input
        : null;
    }
    this.setUI({ activeNode: id ? this.endOf(id, prev) : this.defaultActive(prev, this.s.check), selection: null });
  }
  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    const before = new Set(this.s.graph.nodes.map((n) => n.id));
    this.undoStack.push(this.s.graph);
    this.commitGraph(next, { recordUndo: false });
    const added = next.nodes.filter((n) => !before.has(n.id));
    const last = added[added.length - 1];
    if (last) this.setUI({ activeNode: this.endOf(last.id), selection: null });
  }

  // ───────── claims (conjecture lab) ─────────
  addClaim(p: Pallet, scope: ScopeId = this.activeScope()): string {
    const id = fresh('c');
    this.updateProgress((pr) => ({ ...pr, claims: [...pr.claims, { id, pallet: p, scope }] }));
    return id;
  }
  removeClaim(id: string) { this.updateProgress((pr) => ({ ...pr, claims: pr.claims.filter((c) => c.id !== id) })); }
  claims(): Claim[] { return this.s.save.levels[this.s.level.id]?.claims ?? []; }
  private updateProgress(fn: (p: LevelProgress) => LevelProgress) {
    const { save, level, graph } = this.s;
    const prog = save.levels[level.id] ?? { graph, claims: [], history: [] };
    const next: Save = { ...save, levels: { ...save.levels, [level.id]: fn(prog) } };
    this.set({ save: next });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  // ───────── replay ─────────
  /** Dependency order of all nodes (topological, stable by graph order). */
  topoOrder(): NodeId[] {
    const g = this.s.graph;
    const deps = (n: ProofNode): NodeId[] => {
      switch (n.k) {
        case 'step': return [n.input, ...(n.op.k === 'rewrite' && n.op.rule.k === 'node' ? [n.op.rule.id] : [])];
        case 'apply': return [...n.inputs, ...(n.rule.k === 'node' ? [n.rule.id] : [])];
        case 'merge': case 'clash': return [...n.inputs];
        case 'exit': case 'press': return [n.input];
        default: return [];
      }
    };
    const out: NodeId[] = []; const seen = new Set<NodeId>();
    const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
    const visit = (id: NodeId) => {
      if (seen.has(id)) return; seen.add(id);
      const n = byId.get(id); if (!n) return;
      for (const d of deps(n)) visit(d);
      out.push(id);
    };
    for (const n of g.nodes) visit(n.id);
    return out;
  }
  playReplay() {
    const order = this.topoOrder();
    const cur = this.s.ui.replay;
    const cursor = cur.cursor >= order.length ? 0 : cur.cursor;
    this.setUI({ replay: { ...cur, playing: true, order, cursor } });
  }
  pauseReplay() { this.setUI({ replay: { ...this.s.ui.replay, playing: false } }); }
  stepReplay(delta = 1) {
    const order = this.s.ui.replay.order.length ? this.s.ui.replay.order : this.topoOrder();
    const c = Math.max(0, Math.min(order.length, Math.floor(Math.min(this.s.ui.replay.cursor, order.length)) + delta));
    this.setUI({ replay: { ...this.s.ui.replay, playing: false, order, cursor: c } });
  }
  /** Advance the replay clock by dt ms (driven by the shell's rAF loop). */
  tickReplay(dtMs: number) {
    const r = this.s.ui.replay;
    if (!r.playing) return;
    const next = r.cursor + (dtMs * r.speed) / 520;
    if (next >= r.order.length) this.setUI({ replay: { ...r, playing: false, cursor: Infinity } });
    else this.setUI({ replay: { ...r, cursor: next } });
  }
  stopReplay() { this.setUI({ replay: { ...this.s.ui.replay, playing: false, cursor: Infinity } }); }
  setSpeed(speed: number) {
    this.setUI({ replay: { ...this.s.ui.replay, speed } });
    this.s = { ...this.s, save: { ...this.s.save, settings: { ...this.s.save.settings, speed } } };
  }
}

export const LEVEL_LIST = LEVELS;
