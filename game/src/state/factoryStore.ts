// LEMMA WORKS v3 — factory store. Architect-owned skeleton. Builders may ADD actions
// and fields (announce them); never change an existing signature.
//
// Invariant: `canvas` is the player's construction; `compiled` = compile(canvas) is
// recomputed on every edit (new epoch → runtime restarts at tick 0); `run` advances by
// tick() from the HUD's rAF loop. QED fires when every socket has a delivery in `run`.
import * as K from '../kernel';
import type { LevelManifest } from '../kernel/types';
import * as F from '../factory';
import type { Canvas, Compiled, Endpoint, MachineConfig, MachineKind, Rect, Room, Rot, RunState, Tile } from '../factory/types';
import { LEVELS, LEVEL_BY_ID, REGISTRY } from '../levels/levels';

export type Tool =
  | { k: 'select' }
  | { k: 'place'; kind: MachineKind; schema?: string; mirror?: boolean; /** [FLOOR, add-only] a preset/earned/Lemma-Book slot or the Q pipette arms a full config (recipe included); placed in ONE undo step. */ config?: MachineConfig }
  | { k: 'belt' }
  /** l/r (HUD, add-only): the assumption to paint with, e.g. the order chip's "Suppose …" preset. */
  | { k: 'room'; kind: Room['kind']; l?: Room['l']; r?: Room['r']; /** HUD add-only: Assume rooms assume l = r or l ≠ r. */ rel?: Room['rel'] }
  | { k: 'erase' };

export interface Camera { x: number; y: number; zoom: number }

export interface FUI {
  screen: 'map' | 'floor';
  levelId: string;
  tool: Tool;
  /** Rotation for the next placement (R). */
  rot: Rot;
  selection: string[];           // machine/belt/room ids
  hover: { k: 'machine' | 'belt' | 'room' | 'port'; id: string; port?: string } | null;
  /** Machine whose inspector lens is open. */
  lens: string | null;
  /** Factorio alt-mode: formulas on every belt, port kinds, brackets. */
  alt: boolean;
  camera: Camera;
  playing: boolean;
  speed: number;                 // 1, 2, 4
  transcriptOpen: boolean;
  labOpen: boolean;
  ceremony: { levelId: string; unlocked: string[] } | null;
  /** v4 concept cards for the current level: open state and page. Opens on first entry to an unsolved level. */
  cards: { open: boolean; page: number };
  /** v4 Lemma Book drawer. */
  lemmaBookOpen: boolean;
  /** Onboarding hint index for the current level (null = none). */
  hint: number | null;
  /** Last refusal / jam explanation to flash near the pointer. */
  /** One message channel. kind 'refused' = an edit was turned down; 'note' = an edit succeeded with a caveat (e.g. a belt left broken). blockers = ids to flash. */
  toast: { text: string; at?: Tile; kind?: 'refused' | 'note'; blockers?: string[]; t?: number } | null;
  /** Follow-one-proof (HUD, add-only): the socket whose certificate route is being followed; the floor may quiet everything else. */
  follow?: string | null;
  /** [FLOOR, add-only] Pending room assumption for the Room tool (l, r; kind comes from tool.kind). The HUD sets it; the floor paints with it. */
  roomSpec?: { l: Room['l']; r: Room['r']; rel?: Room['rel'] } | null;
  /** [FLOOR, add-only] When the floor opens a lens for a reason (e.g. the ∀ "Ready to save" badge), the field to focus. The HUD clears it. */
  lensFocus?: 'save' | null;
}

export interface FLevelProgress {
  canvas: Canvas;
  solvedAt?: number;
  best?: F.FactoryMetrics;
  history: F.FactoryMetrics[];
}

/** v4 Lemma Book entry: a player-authored theorem, re-verified from its saved proof on every load. */
export interface SavedLemma {
  id: string;            // 'lemma:<slug>-<n>' — also its registry schema id
  name: string;          // player-chosen, e.g. 'Double Flip'
  card: K.Card;
  levelId: string;       // the floor it was proven on
  canvas: Canvas;        // that floor, as saved (the proof)
  machine: string;       // the ∀ / gate machine whose output is the card
  savedAt: number;
  /** Set by verification on load; disabled lemmas are not offered as recipes. */
  verified?: boolean;
  reason?: string;
}

export interface FSave {
  /** 4 = v4 (Lemma Book, recipe machines). v3 saves are migrated on load. */
  version: 4;
  lemmas: SavedLemma[];
  /** The order the player last opened — a reload returns there. */
  lastLevel?: string;
  levels: Record<string, FLevelProgress>;
  earned: string[];
  /** outAsTerms (review 2026-10, default on): lens Out / Expected / ∀ lines render as terms, not TeX text. */
  settings: { speed: number; reducedMotion: boolean; outAsTerms?: boolean };
}

export interface FState {
  save: FSave;
  ui: FUI;
  level: LevelManifest;
  ctx: K.KernelCtx;
  canvas: Canvas;
  compiled: Compiled;
  run: RunState;
}

export type FEvent =
  | { type: 'edited' }
  | { type: 'refused'; reason: string; at?: Tile }
  | { type: 'delivered'; socketId: string; tick: number }
  | { type: 'solved'; levelId: string; unlocked: string[] }
  | { type: 'level-opened'; levelId: string };

const SAVE_KEY = 'lemma-works/v3';

/** v3 opens every tool from order 1; schemas = everything earned except this order's own unlocks. */
/** Schema ids some current level unlocks. */
const AWARDED = new Set(LEVELS.flatMap((l) => l.unlocks));

export function ctxFor(level: LevelManifest, earned: string[], lemmas: SavedLemma[] = []): K.KernelCtx {
  const authored: Record<string, K.Schema> = {};
  for (const l of lemmas) {
    if (l.verified === false) continue;
    authored[l.id] = { id: l.id, name: l.name, textbook: l.name, card: l.card, origin: 'authored', mirrorable: true };
  }
  // Imported power laws (Phase B) are listed in the registry for display; the kernel owns their statements.
  const registry = { ...REGISTRY, ...K.POWER_SCHEMAS, ...authored };
  // Imports are a level decision (the exponents chapter lists them in its manifest), never a global gift:
  // e.g. the imported conjugation-power law would trivialise Conjugate Pair.
  const imports = level.tools.schemas.filter((id) => id.startsWith('power.') || REGISTRY[id]?.origin === 'import');
  const schemas = [
    // Earned theorems are lent everywhere — but only ones the current campaign still awards (e.g. the retired
    // built-in Double Flip stays out even for old saves that earned it: the player's own lemma replaces it).
    ...Object.keys(REGISTRY).filter((id) => REGISTRY[id]!.origin !== 'import' && earned.includes(id) && !level.unlocks.includes(id) && AWARDED.has(id)),
    ...imports,
    ...Object.keys(authored),
  ];
  return {
    level: { ...level, tools: { lift: true, merge: true, suppose: true, classical: true, press: true, conjecture: true, schemas } },
    registry,
  };
}

export class FactoryStore {
  private s: FState;
  private subs = new Set<(s: FState) => void>();
  private evs = new Set<(e: FEvent) => void>();
  private undoStack: Canvas[] = [];
  private redoStack: Canvas[] = [];

  constructor() {
    const save = FactoryStore.verifyLemmas(FactoryStore.load());
    const level = (save.lastLevel && LEVEL_BY_ID[save.lastLevel]) || LEVELS[0]!;
    const ctx = ctxFor(level, save.earned, save.lemmas);
    // Docks grew to 2×2 (review 2026-10): migrateDocks is idempotent, so run it on every load.
    const saved = save.levels[level.id]?.canvas;
    const canvas = saved ? F.migrateDocks(saved, ctx) : F.initialCanvas(level, ctx);
    const compiled = F.compile(canvas, ctx);
    this.s = {
      save, level, ctx, canvas, compiled, run: F.initRun(canvas, compiled),
      ui: {
        screen: 'floor', levelId: level.id, tool: { k: 'select' }, rot: 0, selection: [], hover: null, lens: null,
        alt: false, camera: { x: 0, y: 0, zoom: 1 }, playing: true, speed: save.settings.speed,
        transcriptOpen: false, labOpen: false, ceremony: null, hint: 0, toast: null, cards: { open: true, page: 0 }, lemmaBookOpen: false,
      },
    };
  }

  // ───────── subscription ─────────
  get(): FState { return this.s; }
  subscribe(fn: (s: FState) => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  on(fn: (e: FEvent) => void): () => void { this.evs.add(fn); return () => this.evs.delete(fn); }
  private emit(e: FEvent) { for (const f of this.evs) f(e); }
  private set(patch: Partial<FState>) { this.s = { ...this.s, ...patch }; for (const f of this.subs) f(this.s); }
  setUI(patch: Partial<FUI>) { this.set({ ui: { ...this.s.ui, ...patch } }); }

  // ───────── persistence ─────────
  static load(): FSave {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SAVE_KEY) : null;
      if (raw) {
        const s = JSON.parse(raw) as { version: number } & Record<string, unknown>;
        if (s.version === 4) return s as unknown as FSave;
        if (s.version === 3) return FactoryStore.migrateV3(s as unknown as Omit<FSave, 'version' | 'lemmas'>);
      }
    } catch { /* fresh */ }
    return { version: 4, lemmas: [], levels: {}, earned: [], settings: { speed: 1, reducedMotion: false } };
  }
  /** v3 → v4: keep progress (solved levels, earned machines, metrics); migrate each floor best-effort. */
  static migrateV3(v3: Omit<FSave, 'version' | 'lemmas'>): FSave {
    const levels: FSave['levels'] = {};
    for (const [id, prog] of Object.entries(v3.levels ?? {})) {
      const level = LEVEL_BY_ID[id];
      const migrated = level ? F.migrateCanvas(prog.canvas, ctxFor(level, v3.earned ?? [], [])) : null;
      levels[id] = { ...prog, canvas: migrated ?? (level ? F.initialCanvas(level, ctxFor(level, v3.earned ?? [], [])) : prog.canvas) };
    }
    return { version: 4, lemmas: [], levels, earned: v3.earned ?? [], settings: v3.settings ?? { speed: 1, reducedMotion: false } };
  }
  private persist() {
    const { save, level, canvas } = this.s;
    const prog = save.levels[level.id] ?? { canvas, history: [] };
    const next: FSave = { ...save, levels: { ...save.levels, [level.id]: { ...prog, canvas } } };
    this.s = { ...this.s, save: next };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  // ───────── navigation ─────────
  openMap() { this.setUI({ screen: 'map', lens: null, selection: [] }); }
  openLevel(id: string) {
    const level = LEVEL_BY_ID[id];
    if (!level) return;
    if (this.s.save.lastLevel !== id) {
      this.s = { ...this.s, save: { ...this.s.save, lastLevel: id } };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s.save)); } catch { /* ignore */ }
    }
    const ctx = ctxFor(level, this.s.save.earned, this.s.save.lemmas);
    const saved = this.s.save.levels[id]?.canvas;
    const canvas = saved ? F.migrateDocks(saved, ctx) : F.initialCanvas(level, ctx);
    const compiled = F.compile(canvas, ctx);
    this.undoStack = []; this.redoStack = [];
    this.set({ level, ctx, canvas, compiled, run: F.initRun(canvas, compiled) });
    this.setUI({ screen: 'floor', levelId: id, tool: { k: 'select' }, rot: 0, selection: [], hover: null, lens: null, ceremony: null,
      hint: this.s.save.levels[id]?.solvedAt ? null : 0, toast: null, cards: { open: !this.s.save.levels[id]?.solvedAt, page: 0 }, playing: true });
    this.emit({ type: 'level-opened', levelId: id });
  }
  resetLevel() { this.commit(F.initialCanvas(this.s.level, this.s.ctx)); }

  // ───────── editing (every edit = new epoch) ─────────
  private commit(canvas: Canvas, record = true) {
    if (record) { this.undoStack.push(this.s.canvas); this.redoStack = []; if (this.undoStack.length > 200) this.undoStack.shift(); }
    const compiled = F.compile(canvas, this.s.ctx);
    this.set({ canvas, compiled, run: F.initRun(canvas, compiled) });
    this.persist();
    this.emit({ type: 'edited' });
  }
  private apply(e: F.Edit): F.Edit {
    if (e.ok) this.commit(e.canvas);
    else { this.emit({ type: 'refused', reason: e.reason }); this.setUI({ toast: { text: e.reason, kind: 'refused', blockers: e.blockers, t: Date.now() } }); }
    if (e.ok && e.note) this.setUI({ toast: { text: e.note, kind: 'note', blockers: e.broken, t: Date.now() } });
    return e;
  }

  place(kind: MachineKind, at: Tile, opts: { rot?: Rot; config?: MachineConfig } = {}) {
    return this.apply(F.place(this.s.canvas, kind, at, opts.rot ?? this.s.ui.rot, this.s.ctx, opts.config));
  }
  move(ids: string[], delta: Tile) { return this.apply(F.moveMachines(this.s.canvas, ids, delta, this.s.ctx)); }
  rotate(id: string) { return this.apply(F.rotateMachine(this.s.canvas, id, this.s.ctx)); }
  remove(ids: string[]) {
    const r = this.apply(F.remove(this.s.canvas, ids));
    if (r.ok) this.setUI({ selection: this.s.ui.selection.filter((x) => !ids.includes(x)), lens: ids.includes(this.s.ui.lens ?? '') ? null : this.s.ui.lens });
    return r;
  }
  configure(id: string, config: MachineConfig) { return this.apply(F.setConfigCtx(this.s.canvas, id, config, this.s.ctx)); }
  connect(from: Endpoint, to: Endpoint, path?: Tile[]) { return this.apply(F.connect(this.s.canvas, from, to, this.s.ctx, path)); }
  branch(belt: string, to: Endpoint) { return this.apply(F.branch(this.s.canvas, belt, to, this.s.ctx)); }
  /** v4.1: drag from an output (or an open belt's end) to a floor cell (open belt) or to an input (completes it). */
  extendTo(from: Parameters<typeof F.extendTo>[1], target: Parameters<typeof F.extendTo>[2]) { return this.apply(F.extendTo(this.s.canvas, from, target, this.s.ctx)); }
  /** Connect through waypoints the player dragged over. */
  connectVia(from: Endpoint, to: Endpoint, via: Tile[]) { return this.apply(F.connectVia(this.s.canvas, from, to, via, this.s.ctx)); }
  /** Branch from the exact belt cell the player dragged off. */
  branchAt(belt: string, i: number, to: Endpoint) { return this.apply(F.branchAt(this.s.canvas, belt, i, to, this.s.ctx)); }
  paintRoom(rect: Rect, kind: Room['kind'], l: Room['l'], r: Room['r'], rel?: Room['rel']) { return this.apply(F.paintRoom(this.s.canvas, rect, kind, l, r, this.s.ctx, rel)); }
  resizeRoom(id: string, rect: Rect) { return this.apply(F.resizeRoom(this.s.canvas, id, rect, this.s.ctx)); }
  paste(bp: F.Blueprint, at: Tile) { return this.apply(F.paste(this.s.canvas, bp, at, this.s.ctx)); }

  undo() { const prev = this.undoStack.pop(); if (!prev) return; this.redoStack.push(this.s.canvas); this.commit(prev, false); }
  redo() { const next = this.redoStack.pop(); if (!next) return; this.undoStack.push(this.s.canvas); this.commit(next, false); }

  // ───────── UI state ─────────
  setTool(tool: Tool) {
    const prev = this.s.ui.tool;
    const sameKind = prev.k === 'place' && tool.k === 'place' && prev.kind === tool.kind;
    this.setUI({ tool, lens: tool.k === 'select' ? this.s.ui.lens : null, rot: sameKind ? this.s.ui.rot : 0 });
  }
  setRot(rot: Rot) { this.setUI({ rot }); }
  select(ids: string[]) { this.setUI({ selection: ids }); }
  openLens(id: string | null) { this.setUI({ lens: id }); }
  setHover(h: FUI['hover']) { const cur = this.s.ui.hover; if (JSON.stringify(cur) !== JSON.stringify(h)) this.setUI({ hover: h }); }
  toggleAlt(on?: boolean) { this.setUI({ alt: on ?? !this.s.ui.alt }); }
  setCamera(c: Camera) { this.setUI({ camera: c }); }
  setPlaying(p: boolean) { this.setUI({ playing: p }); }
  /** Lens setting: draw Out views as terms (default true when unset). */
  setOutAsTerms(on: boolean) { this.set({ save: { ...this.s.save, settings: { ...this.s.save.settings, outAsTerms: on } } }); this.persist(); }
  setSpeed(speed: number) { this.setUI({ speed }); this.s = { ...this.s, save: { ...this.s.save, settings: { ...this.s.save.settings, speed } } }; }
  /** [FLOOR, add-only] Set the Room tool's pending assumption (l, r). */
  setRoomSpec(spec: { l: Room['l']; r: Room['r']; rel?: Room['rel'] } | null) { this.setUI({ roomSpec: spec }); }
  clearToast() { if (this.s.ui.toast) this.setUI({ toast: null }); }
  clearCeremony() { this.setUI({ ceremony: null }); }
  nextHint() { const h = this.s.ui.hint; this.setUI({ hint: h === null ? null : h + 1 }); }

  // ───────── v4: concept cards, Lemma Book ─────────
  openCards(page = 0) { this.setUI({ cards: { open: true, page } }); }
  closeCards() { this.setUI({ cards: { ...this.s.ui.cards, open: false } }); }
  setCardPage(page: number) { this.setUI({ cards: { ...this.s.ui.cards, page } }); }
  toggleLemmaBook(open?: boolean) { this.setUI({ lemmaBookOpen: open ?? !this.s.ui.lemmaBookOpen }); }

  /** Re-verify every saved lemma in save order (each may use earlier ones). Unverifiable lemmas are disabled, with a reason. */
  static verifyLemmas(save: FSave): FSave {
    const ordered = [...save.lemmas].sort((x, y) => x.savedAt - y.savedAt);
    const done: SavedLemma[] = [];
    for (const l of ordered) {
      const level = LEVEL_BY_ID[l.levelId];
      const earlier = done.filter((d) => d.verified !== false);
      const r = level ? F.verifyLemma(l, ctxFor(level, save.earned, earlier), earlier.map((d) => d.id)) : { ok: false as const, reason: 'its floor no longer exists' };
      done.push({ ...l, verified: r.ok, reason: r.ok ? undefined : r.reason });
    }
    return { ...save, lemmas: done };
  }

  /** Save the card produced by a ∀ machine (or Assume gate) on this floor to the Lemma Book. */
  saveLemma(machineId: string, name: string): F.Edit | { ok: true; id: string } {
    const r = F.lemmaFrom(this.s.compiled, this.s.canvas, machineId, this.s.ctx);
    if (!r.ok) { this.setUI({ toast: { text: r.reason, kind: 'refused', t: Date.now() } }); return { ok: false, reason: r.reason }; }
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lemma';
    const id = `lemma:${slug}-${this.s.save.lemmas.length + 1}`;
    const lemma: SavedLemma = { id, name: name.trim() || 'Lemma', card: r.card, levelId: this.s.level.id, canvas: this.s.canvas, machine: machineId, savedAt: Date.now(), verified: true };
    const save: FSave = { ...this.s.save, lemmas: [...this.s.save.lemmas, lemma] };
    this.s = { ...this.s, save, ctx: ctxFor(this.s.level, save.earned, save.lemmas) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
    this.commit(this.s.canvas, false);
    this.setUI({ toast: { text: `Saved to the Lemma Book: ${lemma.name}`, kind: 'note', t: Date.now() } });
    return { ok: true, id };
  }
  removeLemma(id: string) {
    const save: FSave = { ...this.s.save, lemmas: this.s.save.lemmas.filter((l) => l.id !== id) };
    this.s = { ...this.s, save, ctx: ctxFor(this.s.level, save.earned, save.lemmas) };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
    this.commit(this.s.canvas, false);
  }

  // ───────── runtime ─────────
  /** Advance one simulation tick. Called by the HUD's clock at TICKS_PER_SECOND × speed. */
  tick() {
    const { canvas, compiled } = this.s;
    const before = this.s.run.delivered;
    const run = F.stepRun(this.s.run, canvas, compiled);
    this.set({ run });
    for (const [sock, t] of Object.entries(run.delivered)) if (before[sock] === undefined) this.emit({ type: 'delivered', socketId: sock, tick: t });
    const all = this.s.level.sockets.every((d) => run.delivered[d.id] !== undefined);
    if (all && Object.keys(before).length < this.s.level.sockets.length) this.markSolved();
  }
  stepOnce() { this.setPlaying(false); this.tick(); }

  metrics(): F.FactoryMetrics { return F.factoryMetrics(this.s.canvas, this.s.run, this.s.compiled); }

  private markSolved() {
    const { save, level, canvas } = this.s;
    const m = this.metrics();
    const prog: FLevelProgress = save.levels[level.id] ?? { canvas, history: [] };
    const first = !prog.solvedAt;
    const unlocked = first ? level.unlocks.filter((u) => !save.earned.includes(u)) : [];
    const best = prog.best
      ? { machines: Math.min(prog.best.machines, m.machines), area: Math.min(prog.best.area, m.area), cycles: Math.min(prog.best.cycles ?? Infinity, m.cycles ?? Infinity) }
      : m;
    const dup = prog.history.some((h) => h.machines === m.machines && h.area === m.area && h.cycles === m.cycles);
    const next: FSave = {
      ...save, earned: [...save.earned, ...unlocked],
      levels: { ...save.levels, [level.id]: { ...prog, canvas, solvedAt: prog.solvedAt ?? Date.now(), best: best as F.FactoryMetrics, history: dup ? prog.history : [...prog.history, m] } },
    };
    this.s = { ...this.s, save: next };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    // The full ceremony plays once per level (first solve). Later distinct solutions are
    // recorded quietly with a short note — editing a solved factory must never re-open a modal.
    if (first) {
      this.setUI({ ceremony: { levelId: level.id, unlocked }, hint: null });
      this.emit({ type: 'solved', levelId: level.id, unlocked });
    } else if (!dup) {
      this.setUI({ toast: { text: `Another proof delivered — ${m.machines} machines · ${m.area} tiles · ${m.cycles ?? '—'} cycles`, kind: 'note', t: Date.now() } });
    }
  }
}

export const LEVEL_LIST = LEVELS;
