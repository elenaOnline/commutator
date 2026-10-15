// COMMUTATOR v4 floor — DEV FIXTURE ONLY. A tiny store with a hand-made v4 floor (towers, recipe
// verbs, ∀, an Assume room, a card dock) and a toy runtime, so the floor can be drawn and driven
// before the v4 editor/compiler land. Nothing here decides legality; edits are naive.
import type { FactoryStore, FEvent, FState, FUI, Tool } from '../state/factoryStore';
import type { Belt, Canvas, Compiled, Endpoint, ItemValue, Machine, MachineConfig, MachineKind, MachineResult, Packet, Rect, Room, Rot, RunState, Tile } from '../factory/types';
import type { Card, LevelManifest, Pallet, Term } from '../kernel/types';
import { LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { fallbackConfig, fallbackRoute, footprint, portTileOut, portsOf } from './adapt';
import type { FloorStore } from './index';

const A = (id: string): Term => ({ k: 'atom', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const M = (...fs: Term[]): Term => ({ k: 'mul', fs });
const E: Term = { k: 'e' };
const meta = (id: string): Term => ({ k: 'meta', id });
const eq = (l: Term, r: Term): Pallet => ({ k: 'eq', l, r });
const fact = (p: Pallet, node = 'n'): ItemValue => ({ k: 'fact', fact: p, node });
const card = (c: Card): ItemValue => ({ k: 'card', card: c, ref: { k: 'node', id: 'g' } });

const x1 = A('v1'), y1 = A('v2');

export function v4Fixture(): { state: FState; outs: Record<string, ItemValue> } {
  const base = LEVEL_BY_ID['L06']!;
  const level: LevelManifest = {
    ...base, id: 'V4DEMO', title: 'Toolsmith demo',
    sockets: [{ id: 's', target: { k: 'law', metas: ['x', 'y'], l: I(M(meta('x'), meta('y'))), r: M(I(meta('y')), I(meta('x'))) }, allowedGivens: [] }],
  };
  const ctx = { level, registry: REGISTRY };
  const m = (id: string, kind: MachineKind, x: number, y: number, config: MachineConfig, locked = false): Machine => ({ id, kind, at: { x, y }, rot: 0, config, locked });
  const first = { k: 'first' } as const;
  const rw = (recipe: Extract<MachineConfig, { kind: 'rewriter' }>['recipe']): MachineConfig => ({ kind: 'rewriter', recipe, dir: 'fwd', target: first, gap: first, values: {}, tidy: true });
  const machines: Machine[] = [
    m('tx', 'tower', -1, -4, { kind: 'tower', varId: 'v1', label: 'x₁', sort: 'G' }),
    m('ty', 'tower', 3, -4, { kind: 'tower', varId: 'v2', label: 'y₁', sort: 'G' }),
    m('sp1', 'spool', 0, 0, { kind: 'spool', t: { k: 'knob', term: I(M(x1, y1)) } }),
    m('rw1', 'rewriter', 3, 0, rw({ k: 'law', ref: { k: 'schema', id: 'socks' } })),
    m('fa', 'forall', 7, 0, { kind: 'forall' }),
    m('sock', 'socket', 11, -1, { kind: 'socket', socketId: 's' }, true), // 2×2: its W inlet q on (11,0)
    m('sp2', 'spool', 0, 3, { kind: 'spool', t: { k: 'knob', term: M(x1, I(x1), y1) } }),
    m('rw2', 'rewriter', 3, 3, rw({ k: 'cancel' })),
    m('op1', 'operator', 7, 3, { kind: 'operator', recipe: { k: 'invert' } }),
    m('jn', 'joiner', 11, 3, { kind: 'joiner', recipe: { k: 'chain' } }),
    m('rw3', 'rewriter', 3, 6, rw(null)),
    m('rw4', 'rewriter', 7, 6, rw({ k: 'law', ref: { k: 'lagrange' } })),
    m('desk', 'desk', 1, 10, { kind: 'desk', room: 'r1' }, true),
    m('th', 'theorem', 4, 10, { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: 'witness' } }, choice: 0, values: {} }),
    m('gate', 'gate', 8, 10, { kind: 'gate', room: 'r1' }, true),
    m('cd', 'carddock', 12, 10, { kind: 'carddock', ref: { k: 'axiom', id: 'invL' } }),
  ];
  const rooms: Room[] = [{ id: 'r1', kind: 'assume', rel: 'eq', l: M(x1, y1), r: E, rect: { x: 0, y: 9, w: 9, h: 4 } }];
  const canvas: Canvas = { version: 3, levelId: level.id, machines, belts: [], rooms };
  const outs: Record<string, ItemValue> = {
    sp1: fact(eq(I(M(x1, y1)), I(M(x1, y1)))),
    rw1: fact(eq(I(M(x1, y1)), M(I(y1), I(x1)))),
    fa: card({ k: 'law', metas: ['x', 'y'], l: I(M(meta('x'), meta('y'))), r: M(I(meta('y')), I(meta('x'))) }),
    sp2: fact(eq(M(x1, I(x1), y1), M(x1, I(x1), y1))),
    rw2: fact(eq(M(x1, I(x1), y1), y1)),
    op1: fact(eq(I(M(x1, I(x1), y1)), I(y1))),
    desk: fact(eq(M(x1, y1), E)),
    th: fact(eq(y1, I(x1))),
    gate: card({ k: 'cond', metas: [], premises: [{ k: 'eq', l: M(x1, y1), r: E }], concl: { k: 'eq', l: y1, r: I(x1) } }),
    cd: card({ k: 'law', metas: ['x'], l: M(I(meta('x')), meta('x')), r: E }),
  };
  let c = canvas;
  const link = (fm: string, fp: string, tm: string, tp: string) => { c = connectNaive(c, { m: fm, port: fp }, { m: tm, port: tp }, ctx) ?? c; };
  link('sp1', 'out', 'rw1', 'q'); link('rw1', 'out', 'fa', 'q'); link('fa', 'out', 'sock', 'q');
  link('sp2', 'out', 'rw2', 'q'); link('rw2', 'out', 'op1', 'q'); link('op1', 'out', 'jn', 'a');
  link('desk', 'out', 'th', 'p0'); link('th', 'out', 'gate', 'q');
  const ui: FUI = {
    screen: 'floor', levelId: level.id, tool: { k: 'select' }, rot: 0, selection: [], hover: null, lens: null, alt: false,
    camera: { x: 0, y: 0, zoom: 1 }, playing: true, speed: 1, transcriptOpen: false, labOpen: false, ceremony: null,
    cards: { open: false, page: 0 }, lemmaBookOpen: false, hint: null, toast: null,
  };
  const state = {
    save: { version: 5, campaign: 'main', campaigns: { main: { levels: {}, earned: ['witness', 'cancel', 'socks'], lemmas: [] }, book: { levels: {}, earned: [], lemmas: [] } }, settings: { speed: 1, reducedMotion: false } },
    ui, level, ctx, canvas: c, compiled: fakeCompile(c, outs), run: initRun(c, outs),
  } as unknown as FState;
  return { state, outs };
}

function connectNaive(c: Canvas, from: Endpoint, to: Endpoint, ctx: { level: LevelManifest; registry: typeof REGISTRY }): Canvas | null {
  const fm = c.machines.find((m) => m.id === from.m), tm = c.machines.find((m) => m.id === to.m);
  const fp = fm && portsOf(fm, ctx as never).find((p) => p.id === from.port), tp = tm && portsOf(tm, ctx as never).find((p) => p.id === to.port);
  if (!fp || !tp) return null;
  const occ = new Set<string>();
  for (const m of c.machines) for (const t of footprint(m, ctx as never)) occ.add(`${t.x},${t.y}`);
  for (const b of c.belts) for (const t of b.path) occ.add(`${t.x},${t.y}`);
  const a = portTileOut(fp), z = portTileOut(tp);
  const path = fallbackRoute((t) => occ.has(`${t.x},${t.y}`), a, z);
  if (!path) return null;
  const belt: Belt = { id: `b${c.belts.length + 1}`, from, to, path };
  return { ...c, belts: [...c.belts, belt] };
}

function fakeCompile(c: Canvas, outs: Record<string, ItemValue>): Compiled {
  const machines: Record<string, MachineResult> = {};
  for (const m of c.machines) {
    const fed = c.belts.filter((b) => b.to?.m === m.id);
    const inputs: Record<string, ItemValue | undefined> = {};
    for (const b of fed) if (b.to) inputs[b.to.port] = outs[b.from.m];
    const out = outs[m.id];
    const unset = (m.config.kind === 'rewriter' || m.config.kind === 'operator' || m.config.kind === 'joiner' || m.config.kind === 'theorem') && !m.config.recipe;
    const status = unset ? { k: 'starved' as const, reason: 'choose a recipe in the lens' }
      : m.kind === 'joiner' && fed.length < 2 ? { k: 'starved' as const, reason: 'not connected: the b inlet needs an equation' }
      : m.kind === 'rewriter' && m.config.kind === 'rewriter' && m.config.recipe?.k === 'law' && m.config.recipe.ref.k === 'lagrange' ? { k: 'jammed' as const, reason: 'Lagrange needs a |G| = n given in this level' }
      : out || m.kind === 'socket' || m.kind === 'tower' ? { k: 'ok' as const } : { k: 'starved' as const, reason: 'waiting for an input' };
    machines[m.id] = { id: m.id, status, scope: 'root', nodes: [], inputs, out: status.k === 'ok' ? out : undefined, duration: 1 };
  }
  return { graph: { nodes: [], rooms: [] }, check: { ok: true }, machines, scopeOf: {}, sockets: { s: { by: 'fa', ok: true } }, solvable: true, beltErrors: {} } as unknown as Compiled;
}

const SOURCES = new Set(['spool', 'given', 'hopper', 'carddock', 'desk']);
function initRun(c: Canvas, outs: Record<string, ItemValue>): RunState {
  void outs;
  const nextEmit: Record<string, number> = {};
  for (const m of c.machines) if (SOURCES.has(m.kind)) nextEmit[m.id] = 1;
  return { tick: 0, packets: [], jobs: {}, latched: {}, delivered: {}, live: {}, nextEmit, nextPacketId: 1 };
}

function stepRun(s: RunState, c: Canvas, comp: Compiled): RunState {
  const t = s.tick + 1;
  let nid = s.nextPacketId;
  const packets: Packet[] = [];
  const jobs: RunState['jobs'] = {};
  const delivered = { ...s.delivered };
  const emit = new Set<string>();
  for (const [m, j] of Object.entries(s.jobs)) { if (j.finish <= t) emit.add(m); else jobs[m] = j; }
  for (const p of s.packets) {
    if (p.at.k !== 'belt') continue;
    const b = c.belts.find((x) => x.id === (p.at as { belt: string }).belt); if (!b) continue;
    if (p.at.i < b.path.length - 1) { packets.push({ ...p, at: { k: 'belt', belt: b.id, i: p.at.i + 1 } }); continue; }
    if (!b.to) { packets.push(p); continue; } // an open belt: items wait at its end
    const to = b.to ? c.machines.find((m) => m.id === b.to!.m) : undefined;
    if (to?.config.kind === 'socket') delivered[to.config.socketId] ??= t;
    else if (to && comp.machines[to.id]?.out && !jobs[to.id]) jobs[to.id] = { finish: t + 2 };
  }
  const nextEmit = { ...s.nextEmit };
  for (const [m, due] of Object.entries(s.nextEmit)) if (due <= t && comp.machines[m]?.out) { emit.add(m); nextEmit[m] = t + 6; }
  for (const m of emit) {
    const v = comp.machines[m]?.out; if (!v) continue;
    for (const b of c.belts) if (b.from.m === m && !b.broken) packets.push({ id: nid++, value: v, at: { k: 'belt', belt: b.id, i: -1 } });
  }
  const live: RunState['live'] = {};
  for (const m of c.machines) live[m.id] = jobs[m.id] ? 'working' : comp.machines[m.id]?.status.k === 'jammed' ? 'jammed' : comp.machines[m.id]?.out ? 'working' : 'starved';
  return { tick: t, packets, jobs, latched: {}, delivered, live, nextEmit, nextPacketId: nid };
}

/** The fixture store: real floor, fake factory. */
export class FixtureStore implements FloorStore {
  private s: FState;
  private outs: Record<string, ItemValue>;
  private subs = new Set<(s: FState) => void>();
  private evs = new Set<(e: FEvent) => void>();
  constructor() { const f = v4Fixture(); this.s = f.state; this.outs = f.outs; }
  get() { return this.s; }
  subscribe(fn: (s: FState) => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  on(fn: (e: FEvent) => void) { this.evs.add(fn); return () => { this.evs.delete(fn); }; }
  private set(patch: Partial<FState>) { this.s = { ...this.s, ...patch }; for (const f of this.subs) f(this.s); }
  setUI(patch: Partial<FUI>) { this.set({ ui: { ...this.s.ui, ...patch } }); }
  private commit(c: Canvas) { this.set({ canvas: c, compiled: fakeCompile(c, this.outs), run: initRun(c, this.outs) }); for (const f of this.evs) f({ type: 'edited' }); }
  private refuse(reason: string) { for (const f of this.evs) f({ type: 'refused', reason }); this.setUI({ toast: { text: reason, kind: 'refused', t: Date.now() } }); return { ok: false as const, reason }; }
  tick() { this.set({ run: stepRun(this.s.run, this.s.canvas, this.s.compiled) }); }
  setTool(tool: Tool) { this.setUI({ tool }); }
  setRot(rot: Rot) { this.setUI({ rot }); }
  select(ids: string[]) { this.setUI({ selection: ids }); }
  openLens(id: string | null) { this.setUI({ lens: id }); }
  setHover(h: FUI['hover']) { if (JSON.stringify(h) !== JSON.stringify(this.s.ui.hover)) this.setUI({ hover: h }); }
  toggleAlt(on?: boolean) { this.setUI({ alt: on ?? !this.s.ui.alt }); }
  setCamera(c: FUI['camera']) { this.setUI({ camera: c }); }
  place(kind: MachineKind, at: Tile, opts: { rot?: Rot; config?: MachineConfig } = {}) {
    const id = `${kind}${this.s.canvas.machines.length + 1}`;
    const m: Machine = { id, kind, at, rot: opts.rot ?? this.s.ui.rot, config: opts.config ?? fallbackConfig(kind) };
    if (m.config.kind === 'tower') { const n = this.s.canvas.machines.filter((x) => x.kind === 'tower').length + 1; m.config = { kind: 'tower', varId: `v${n + 10}`, label: `z${String.fromCharCode(0x2080 + n)}`, sort: 'G' }; }
    const c = { ...this.s.canvas, machines: [...this.s.canvas.machines, m] };
    this.commit(c);
    return { ok: true as const, canvas: c, ids: [id] };
  }
  configure(id: string, config: MachineConfig) {
    const c = { ...this.s.canvas, machines: this.s.canvas.machines.map((m) => (m.id === id ? { ...m, config } : m)) };
    this.commit(c);
    return { ok: true as const, canvas: c };
  }
  move(ids: string[], d: Tile) { const c = { ...this.s.canvas, machines: this.s.canvas.machines.map((m) => (ids.includes(m.id) ? { ...m, at: { x: m.at.x + d.x, y: m.at.y + d.y } } : m)) }; this.commit(c); return { ok: true as const, canvas: c }; }
  rotate(id: string) { const c = { ...this.s.canvas, machines: this.s.canvas.machines.map((m) => (m.id === id ? { ...m, rot: ((m.rot + 1) % 4) as Rot } : m)) }; this.commit(c); return { ok: true as const, canvas: c }; }
  remove(ids: string[]) { const c = { ...this.s.canvas, machines: this.s.canvas.machines.filter((m) => !ids.includes(m.id) || m.locked), belts: this.s.canvas.belts.filter((b) => !ids.includes(b.id) && !ids.includes(b.from.m) && !(b.to && ids.includes(b.to.m))) }; this.commit(c); return { ok: true as const, canvas: c }; }
  connect(from: Endpoint, to: Endpoint) { const c = connectNaive(this.s.canvas, from, to, this.s.ctx as never); if (!c) return this.refuse('No clear route (fixture)'); this.commit(c); return { ok: true as const, canvas: c }; }
  connectVia(from: Endpoint, to: Endpoint) { return this.connect(from, to); }
  /** v4.1 fixture: extendTo(from | {belt}, ground cell | input) — the editor's open-belt op, naively. */
  extendTo(from: Endpoint | { belt: string; end?: boolean }, target: Tile | Endpoint) {
    const c0 = this.s.canvas;
    const isEnd = (x: unknown): x is Endpoint => !!x && typeof x === 'object' && 'm' in (x as object);
    if (!('belt' in from)) {
      if (isEnd(target)) return this.connect(from, target);
      const fm = c0.machines.find((m) => m.id === from.m); const fp = fm && portsOf(fm, this.s.ctx as never).find((p) => p.id === from.port);
      if (!fp) return this.refuse('No such output');
      const path = fallbackRoute(() => false, portTileOut(fp), target as Tile);
      if (!path) return this.refuse('No clear route');
      const c = { ...c0, belts: [...c0.belts, { id: `b${c0.belts.length + 1}`, from, to: null, path }] };
      this.commit(c); return { ok: true as const, canvas: c };
    }
    const b = c0.belts.find((x) => x.id === from.belt); if (!b || b.to) return this.refuse('That is not an open belt.');
    const last = b.path[b.path.length - 1]!;
    let cell = target as Tile, to: Endpoint | null = null;
    if (isEnd(target)) { const tm = c0.machines.find((m) => m.id === target.m); const tp = tm && portsOf(tm, this.s.ctx as never).find((p) => p.id === target.port); if (!tp) return this.refuse('No such input'); cell = portTileOut(tp); to = target; }
    const leg = fallbackRoute(() => false, last, cell); if (!leg) return this.refuse('No clear route');
    const c = { ...c0, belts: c0.belts.map((x) => (x.id === b.id ? { ...x, to, path: [...x.path, ...leg.slice(1)] } : x)) };
    this.commit(c); return { ok: true as const, canvas: c };
  }
  branch(belt: string, to: Endpoint) { const b = this.s.canvas.belts.find((x) => x.id === belt); return b ? this.connect(b.from, to) : this.refuse('gone'); }
  branchAt(belt: string, i: number, to: Endpoint) { void i; return this.branch(belt, to); }
  paintRoom(rect: Rect, kind: Room['kind'], l: Term, r: Term) { const c = { ...this.s.canvas, rooms: [...this.s.canvas.rooms, { id: `r${this.s.canvas.rooms.length + 1}`, kind, l, r, rect }] }; this.commit(c); return { ok: true as const, canvas: c }; }
  resizeRoom(id: string, rect: Rect) { const c = { ...this.s.canvas, rooms: this.s.canvas.rooms.map((r) => (r.id === id ? { ...r, rect } : r)) }; this.commit(c); return { ok: true as const, canvas: c }; }
  paste() { return this.refuse('Paste is not in the fixture'); }
}

export type { FactoryStore };
