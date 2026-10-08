// LEMMA WORKS board — DEV HARNESS ONLY (src/board/dev.html). A fake store that
// serves hand-built fixtures with hard-coded facts, so the board can be built
// before kernel.check works. Exposes window.__dev for headless screenshots.
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '../ui/base.css';
import type { CheckResult, NodeId, ProofGraph } from '../kernel/types';
import { LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { usesOf } from '../state/belts';
import type { Claim, State, StoreEvent } from '../state/store';
import { topoOrder } from './layout';
import { mountBoard, type BoardStore } from './index';
import { F, FIXTURES, graphOf, type Fixture } from './fixtures';
import * as K from '../kernel';

class FakeStore implements BoardStore {
  s!: State;
  fx!: Fixture;
  private subs = new Set<(s: State) => void>();
  private ev = new Set<(e: StoreEvent) => void>();
  private undoStack: ProofGraph[] = [];

  /** Real-kernel mode: facts come from K.check on a tests/solutions graph. */
  real = false;
  loadReal(levelId: string, graph: ProofGraph) {
    this.real = true;
    this.fx = { name: levelId, levelId, nodes: graph.nodes, rooms: graph.rooms, facts: {}, filled: {} };
    const level = LEVEL_BY_ID[levelId]!;
    const ctx = { level, registry: REGISTRY };
    const check = K.check(graph, ctx);
    this.s = {
      level, graph, check, ctx,
      save: { version: 1, levels: { [level.id]: { graph, claims: [], history: [] } }, earned: [], settings: { reducedMotion: false, speed: 1 } },
      ui: { screen: 'level', levelId: level.id, activeNode: this.endOf(graph), selection: null, hoverNode: null, armed: null, ceremony: null,
        replay: { playing: false, cursor: Infinity, order: [], speed: 1 } },
    };
    this.emitState();
    return check;
  }
  load(fx: Fixture, upto = Infinity) {
    this.real = false;
    this.fx = fx;
    const level = LEVEL_BY_ID[fx.levelId]!;
    const graph = graphOf(fx, upto);
    const claims: Claim[] = (fx.claims ?? []).map((c) => ({ id: c.id, pallet: F(c.fact) as Claim['pallet'], scope: c.scope }));
    this.s = {
      level, graph, check: this.checkOf(graph), ctx: { level, registry: REGISTRY },
      save: { version: 1, levels: { [level.id]: { graph, claims, history: [] } }, earned: [], settings: { reducedMotion: false, speed: 1 } },
      ui: { screen: 'level', levelId: level.id, activeNode: this.endOf(graph), selection: null, hoverNode: null, armed: null, ceremony: null,
        replay: { playing: false, cursor: Infinity, order: [], speed: 1 } },
    };
    this.emitState();
    this.emit({ type: 'level-opened', levelId: level.id });
  }
  private endOf(g: ProofGraph): NodeId | null {
    const consumed = new Set(g.nodes.flatMap((n) => [...usesOf(n).inputs]));
    const ends = g.nodes.filter((n) => !consumed.has(n.id) && n.k !== 'given');
    return ends.length ? ends[ends.length - 1]!.id : null;
  }
  checkOf(g: ProofGraph): CheckResult {
    if (this.real) return K.check(g, this.s.ctx);
    const nodes: CheckResult['nodes'] = {};
    for (const n of g.nodes) nodes[n.id] = { id: n.id, ok: true, fact: this.fx.facts[n.id] ? F(this.fx.facts[n.id]!) : undefined, deps: [], classical: false };
    const sockets = LEVEL_BY_ID[this.fx.levelId]!.sockets.map((sd) => {
      const by = this.fx.filled[sd.id];
      return { id: sd.id, ok: !!by && g.nodes.some((n) => n.id === by), filledBy: by && g.nodes.some((n) => n.id === by) ? by : undefined };
    });
    return { ok: true, nodes, sockets, solved: sockets.every((s) => s.ok) };
  }
  get() { return this.s; }
  subscribe(fn: (s: State) => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  on(fn: (e: StoreEvent) => void) { this.ev.add(fn); return () => { this.ev.delete(fn); }; }
  private emitState() { for (const f of this.subs) f(this.s); }
  private emit(e: StoreEvent) { for (const f of this.ev) f(e); }
  private setUI(p: Partial<State['ui']>) { this.s = { ...this.s, ui: { ...this.s.ui, ...p } }; this.emitState(); }
  setActive(id: NodeId | null) { this.setUI({ activeNode: id }); }
  setHover(id: NodeId | null) { if (this.s.ui.hoverNode !== id) this.setUI({ hoverNode: id }); }
  claims() { return this.s.save.levels[this.s.level.id]?.claims ?? []; }
  offers(sel: null, nodeId: NodeId) { return this.real ? K.offersAt(this.s.graph, this.s.check, nodeId, sel, this.s.ctx) : []; }
  private commit(g: ProofGraph) {
    const before = new Set(this.s.graph.nodes.map((n) => n.id));
    const wasFilled = new Set(this.s.check.sockets.filter((s) => s.ok).map((s) => s.id));
    const check = this.checkOf(g);
    const lv = this.s.save.levels[this.s.level.id]!;
    this.s = { ...this.s, graph: g, check, save: { ...this.s.save, levels: { [this.s.level.id]: { ...lv, graph: g } } } };
    this.emitState();
    const added = g.nodes.filter((n) => !before.has(n.id)).map((n) => n.id);
    if (added.length) this.emit({ type: 'nodes-added', ids: added });
    for (const s of check.sockets) if (s.ok && s.filledBy) this.emit({ type: 'delivered', socketId: s.id, nodeId: s.filledBy });
    for (const n of g.nodes) if (added.includes(n.id) && n.k === 'clash') this.emit({ type: 'room-closed', roomId: n.scope });
    void wasFilled;
  }
  deleteNode(id: NodeId) {
    const g = this.s.graph;
    const n = g.nodes.find((m) => m.id === id);
    if (!n || n.k === 'given') return { ok: false };
    const doomed = new Set<NodeId>([id]);
    let grew = true;
    while (grew) { grew = false; for (const m of g.nodes) if (!doomed.has(m.id) && [...usesOf(m).inputs, ...usesOf(m).cites].some((x) => doomed.has(x))) { doomed.add(m.id); grew = true; } }
    this.undoStack.push(g);
    const ng = { ...g, nodes: g.nodes.filter((m) => !doomed.has(m.id)) };
    this.commit(ng);
    this.setUI({ activeNode: n.k === 'step' ? n.input : this.endOf(ng) });
    return { ok: true };
  }
  undo() { const g = this.undoStack.pop(); if (g) this.commit(g); }
  /** Append the next fixture node (progressive build). */
  addNext() {
    const n = this.fx.nodes.find((m) => !this.s.graph.nodes.some((x) => x.id === m.id));
    if (!n) return false;
    const nodes = [...this.s.graph.nodes, n];
    // pull in a whole station at once (one gesture = one station)
    const st = n.meta?.station;
    if (st) for (const m of this.fx.nodes) if (m.meta?.station === st && !nodes.includes(m) && m.k === 'step') nodes.push(m);
    const g = { nodes, rooms: this.fx.rooms.filter((r) => nodes.some((x) => x.scope === r.id)) };
    this.undoStack.push(this.s.graph);
    this.commit(g);
    this.setUI({ activeNode: this.endOf(g) });
    return true;
  }
  // replay (same semantics as Store)
  playReplay() { const order = topoOrder(this.s.graph); this.setUI({ replay: { ...this.s.ui.replay, playing: true, order, cursor: 0 } }); }
  setCursor(c: number) { const order = this.s.ui.replay.order.length ? this.s.ui.replay.order : topoOrder(this.s.graph); this.setUI({ replay: { ...this.s.ui.replay, playing: false, order, cursor: c } }); }
  tickReplay(dt: number) {
    const r = this.s.ui.replay; if (!r.playing) return;
    const next = r.cursor + (dt * r.speed) / 520;
    if (next >= r.order.length) this.setUI({ replay: { ...r, playing: false, cursor: Infinity } });
    else this.setUI({ replay: { ...r, cursor: next } });
  }
  stopReplay() { this.setUI({ replay: { ...this.s.ui.replay, playing: false, cursor: Infinity } }); }
}

const store = new FakeStore();
const params = new URLSearchParams(location.search);
const fxName = params.get('fx') ?? 'prime';
const upto = params.has('upto') ? +params.get('upto')! : Infinity;
const SOLS = import.meta.glob('../../tests/solutions/*.ts', { eager: true }) as Record<string, { solution?: () => ProofGraph }>;
const solOf = (id: string): ProofGraph | undefined => {
  const fx = Object.values(FIXTURES).find((f) => f.levelId === id && !Object.keys(SOLS).some((k) => k.endsWith(`/${id}.ts`)));
  if (fx) return graphOf(fx);
  return Object.entries(SOLS).find(([k]) => k.endsWith(`/${id}.ts`))?.[1]?.solution?.();
};
if (params.has('sol')) {
  const g = solOf(params.get('sol')!);
  if (g) { const c = store.loadReal(params.get('sol')!, g); console.log('check', c.ok, c.solved, Object.values(c.nodes).filter((n) => !n.ok).map((n) => n.error)); }
} else store.load(FIXTURES[fxName] ?? FIXTURES.prime!, upto);
const host = document.getElementById('board')!;
let unmount = mountBoard(host, store);

let loop = params.has('loop');
let last = 0;
const tick = (now: number) => {
  const dt = last ? Math.min(50, now - last) : 16; last = now;
  if (store.get().ui.replay.playing) store.tickReplay(dt);
  else if (loop && store.get().ui.replay.cursor === Infinity) { loopWait += dt; if (loopWait > 1400) { loopWait = 0; store.playReplay(); } }
  requestAnimationFrame(tick);
};
let loopWait = 0;
requestAnimationFrame(tick);

// controls
const bar = document.getElementById('bar')!;
const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.appendChild(b); };
for (const k of Object.keys(FIXTURES)) btn(k, () => { store.load(FIXTURES[k]!); });
btn('▶ replay', () => store.playReplay());
btn('■ stop', () => store.stopReplay());
btn('loop', () => { loop = !loop; });
btn('+1 node', () => store.addNext());
btn('undo', () => store.undo());

(window as unknown as { __dev: unknown }).__dev = {
  store, FIXTURES,
  load: (name: string, n = Infinity) => store.load(FIXTURES[name]!, n),
  sol: (id: string) => { const g = solOf(id); return g ? store.loadReal(id, g).solved : 'none'; },
  remount: () => { unmount(); unmount = mountBoard(host, store); },
};
