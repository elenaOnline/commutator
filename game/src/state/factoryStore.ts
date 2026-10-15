// LEMMA WORKS v3 — factory store. Architect-owned skeleton. Builders may ADD actions
// and fields (announce them); never change an existing signature.
//
// Invariant: `canvas` is the player's construction; `compiled` = compile(canvas) is
// recomputed on every edit (new epoch → runtime restarts at tick 0); `run` advances by
// tick() from the HUD's rAF loop. QED fires when every socket has a delivery in `run`.
import * as K from '../kernel';
import type { DeskAssumption as Assumption, LevelManifest } from '../kernel/types';
import * as F from '../factory';
import type { Canvas, Compiled, Endpoint, MachineConfig, MachineKind, Rect, Room, Rot, RunState, Tile } from '../factory/types';
import { REGISTRY } from '../levels/levels';
import { ALL_LEVELS, CAMPAIGNS, CAMPAIGN_LEVELS, LEVEL_BY_ID, campaignOf, type Campaign } from '../levels/campaigns';

export type { Campaign };
import { citedLemmas, positional, positionalRefs } from './lemmas';

export type Tool =
  | { k: 'select' }
  | { k: 'place'; kind: MachineKind; schema?: string; mirror?: boolean; /** [FLOOR, add-only] a preset/earned/Lemma-Book slot or the Q pipette arms a full config (recipe included); placed in ONE undo step. */ config?: MachineConfig }
  | { k: 'belt' }
  /** l/r (HUD, add-only): the assumption to paint with, e.g. the order chip's "Suppose …" preset. */
  | { k: 'room'; kind: Room['kind']; l?: Room['l']; r?: Room['r']; /** HUD add-only: Assume rooms assume l = r or l ≠ r. */ rel?: Room['rel']; /** Book phase A: a multi-desk Assume room's 2–3 assumptions (desk order). */ assumes?: Assumption[] }
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
  roomSpec?: { l: Room['l']; r: Room['r']; rel?: Room['rel']; assumes?: Assumption[] } | null;
  /** [FLOOR, add-only] When the floor opens a lens for a reason (e.g. the ∀ "Ready to save" badge), the field to focus. The HUD clears it. */
  lensFocus?: 'save' | null;
  /** [HUD, add-only] The Paper view (the proof as numbered lines with reasons) is open. */
  paperOpen?: boolean;
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

/**
 * One campaign's part of the save. Progress, earned theorems and the Lemma Book never cross campaigns:
 * a Book level earns `cancel` into book.earned only, and a lemma saved in the Book is a recipe only there.
 */
export interface CampaignSave {
  levels: Record<string, FLevelProgress>;
  earned: string[];
  lemmas: SavedLemma[];
  /** The order the player last opened in this campaign — a reload (or the map switch) returns there. */
  lastLevel?: string;
}

export interface FSave {
  /** 5 = campaigns namespaced (The Book, 2026-10-15). v4 and v3 saves are migrated on load: all of it is 'main'. */
  version: 5;
  /** The campaign last played (and shown on the map). */
  campaign: Campaign;
  campaigns: Record<Campaign, CampaignSave>;
  /** outAsTerms (review 2026-10, default on): lens Out / Expected / ∀ lines render as terms, not TeX text. */
  settings: { speed: number; reducedMotion: boolean; outAsTerms?: boolean };
}

/** The v4 save shape (one campaign, flat). */
export interface FSaveV4 {
  version: 4;
  lemmas: SavedLemma[];
  lastLevel?: string;
  levels: Record<string, FLevelProgress>;
  earned: string[];
  settings: FSave['settings'];
}

export const emptyCampaign = (): CampaignSave => ({ levels: {}, earned: [], lemmas: [] });
export const freshSave = (): FSave => ({ version: 5, campaign: 'main', campaigns: { main: emptyCampaign(), book: emptyCampaign() }, settings: { speed: 1, reducedMotion: false } });
/** A campaign's part of the save (never undefined). */
export const campSave = (save: FSave, c: Campaign): CampaignSave => save.campaigns?.[c] ?? emptyCampaign();
/** The progress record of a level, in its own campaign. */
export const progressOf = (save: FSave, id: string): FLevelProgress | undefined => campSave(save, campaignOf(id)).levels[id];
/** Replace one campaign's part of the save. */
export const withCamp = (save: FSave, c: Campaign, fn: (cs: CampaignSave) => CampaignSave): FSave =>
  ({ ...save, campaigns: { ...save.campaigns, [c]: fn(campSave(save, c)) } });

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

/** Schema ids some current level (either campaign) unlocks. Which ones a player HAS is the campaign's earned set. */
const AWARDED = new Set(ALL_LEVELS.flatMap((l) => l.unlocks));

/**
 * The kernel context for a level. Campaign-aware: pass the level's own campaign's earned set and Lemma Book
 * (ctxForSave does it from a save); lemmas proved in the other campaign are dropped here as a backstop.
 */
export function ctxFor(level: LevelManifest, earned: string[], lemmas: SavedLemma[] = []): K.KernelCtx {
  const authored: Record<string, K.Schema> = {};
  const disabled: NonNullable<K.KernelCtx['disabled']> = {};
  const camp = campaignOf(level);
  for (const l of lemmas) {
    // a switched-off lemma stays out of the registry; the kernel names it (and why) to a floor that cites it
    if (l.verified === false) { disabled[l.id] = { name: l.name, ...(l.reason ? { reason: l.reason } : {}) }; continue; }
    if (campaignOf(l.levelId) !== camp && l.levelId !== level.id) continue;
    authored[l.id] = { id: l.id, name: l.name, textbook: l.name, card: l.card, origin: 'authored', mirrorable: true };
  }
  // Imported power laws (Phase B) are listed in the registry for display; the kernel owns their statements.
  // Book phases B–C: the subgroup and map kinds' axioms are named like any theorem (KERNEL-EXT §4.10.6, §5.12.7)
  const registry = { ...REGISTRY, ...K.POWER_SCHEMAS, ...K.SUB_SCHEMAS, ...K.MAP_SCHEMAS, ...authored };
  // Imports are a level decision (the exponents chapter lists them in its manifest), never a global gift:
  // e.g. the imported conjugation-power law would trivialise Conjugate Pair.
  // Kernel-owned Book schemas join the same rules: sub.e is earned (P5.1); sub.pow and hom.pow are imports a
  // level lists. The kinds' axioms (sub.mul/inv/conj, hom.mul, act.*) need no listing: the kernel offers them
  // wherever a subgroup / hom / action is in scope.
  const kernelOrigin = (id: string) => K.SUB_SCHEMAS[id]?.origin ?? K.MAP_SCHEMAS[id]?.origin;
  const imports = level.tools.schemas.filter((id) => id.startsWith('power.') || REGISTRY[id]?.origin === 'import' || kernelOrigin(id) === 'import');
  const earnable = { ...REGISTRY, ...K.SUB_SCHEMAS };
  const schemas = [
    // Earned theorems are lent everywhere — but only ones the current campaign still awards (e.g. the retired
    // built-in Double Flip stays out even for old saves that earned it: the player's own lemma replaces it).
    ...Object.keys(earnable).filter((id) => earnable[id]!.origin === 'earned' && earned.includes(id) && !level.unlocks.includes(id) && AWARDED.has(id)),
    ...imports,
    ...Object.keys(authored),
  ];
  // The main campaign opens every machine from order 1 (v3). The Book keeps its manifest's flags: no tool appears
  // before the book introduces its idea (SYNTHESIS §1; e.g. no Lagrange press before P13.1).
  const open = camp === 'book'
    ? { lift: level.tools.lift, merge: level.tools.merge, suppose: level.tools.suppose, classical: level.tools.classical, press: level.tools.press, conjecture: level.tools.conjecture }
    : { lift: true, merge: true, suppose: true, classical: true, press: true, conjecture: true };
  return { level: { ...level, tools: { ...open, schemas } }, registry, ...(Object.keys(disabled).length ? { disabled } : {}) };
}
/** ctxFor with the level's own campaign's earned theorems and Lemma Book. */
export const ctxForSave = (level: LevelManifest, save: FSave): K.KernelCtx => {
  const cs = campSave(save, campaignOf(level));
  return ctxFor(level, cs.earned, cs.lemmas);
};
const firstLevel = (c: Campaign): LevelManifest | undefined => CAMPAIGN_LEVELS[c][0];

export class FactoryStore {
  private s: FState;
  private subs = new Set<(s: FState) => void>();
  private evs = new Set<(e: FEvent) => void>();
  private undoStack: Canvas[] = [];
  private redoStack: Canvas[] = [];

  constructor() {
    const save = FactoryStore.verifyLemmas(FactoryStore.load());
    const last = campSave(save, save.campaign).lastLevel;
    const level = (last && LEVEL_BY_ID[last]) || firstLevel(save.campaign) || CAMPAIGN_LEVELS.main[0]!;
    const ctx = ctxForSave(level, save);
    // Docks grew to 2×2 (review 2026-10): migrateDocks is idempotent, so run it on every load.
    const saved = progressOf(save, level.id)?.canvas;
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
      if (raw) return FactoryStore.upgrade(JSON.parse(raw));
    } catch { /* fresh */ }
    return freshSave();
  }
  /** Any known save shape → v5. Unknown shapes start fresh. */
  static upgrade(s: unknown): FSave {
    const v = (s as { version?: number } | null)?.version;
    if (v === 5) {
      const s5 = s as FSave;
      return FactoryStore.positionalLemmas({ ...s5, campaign: s5.campaign === 'book' ? 'book' : 'main', campaigns: { main: { ...emptyCampaign(), ...s5.campaigns?.main }, book: { ...emptyCampaign(), ...s5.campaigns?.book } } });
    }
    if (v === 4) return FactoryStore.positionalLemmas(FactoryStore.migrateV4(s as FSaveV4));
    if (v === 3) return FactoryStore.migrateV4(FactoryStore.migrateV3(s as Omit<FSaveV4, 'version' | 'lemmas'>));
    return freshSave();
  }
  /**
   * Lemma Book records are positional (KERNEL-EXT §3½): every saved card's structure binders are stored as
   * `$i:<name>`, never under a level's id. Records saved before this rule are rewritten on load (idempotent; the
   * re-verification that follows compares cards up to renaming, so nothing a player proved is lost).
   */
  static positionalLemmas(save: FSave): FSave {
    let out = save;
    for (const c of CAMPAIGNS) out = withCamp(out, c, (cs) => {
      const lemmas = cs.lemmas.map((l) => ({ ...l, card: positional(l.card) }));
      // floors that apply a record under its old binder names keep compiling (structs keys → `$i:name`)
      const levels = Object.fromEntries(Object.entries(cs.levels).map(([id, p]) => [id, p && { ...p, canvas: positionalRefs(p.canvas, lemmas) }]));
      return { ...cs, levels, lemmas: lemmas.map((l) => ({ ...l, canvas: positionalRefs(l.canvas, lemmas) })) };
    });
    return out;
  }
  /**
   * v4 → v5: the whole v4 save is the main campaign (progress, earned theorems, Lemma Book, last order).
   * Nothing is dropped. Only a level or lemma whose id is a Book id ('P…', possible on a dev copy while the
   * Book was being authored) is filed under 'book', since the main campaign could never show it.
   */
  static migrateV4(v4: FSaveV4): FSave {
    const out = freshSave();
    out.settings = v4.settings ?? out.settings;
    for (const [id, prog] of Object.entries(v4.levels ?? {})) out.campaigns[campaignOf(id)].levels[id] = prog;
    for (const l of v4.lemmas ?? []) out.campaigns[campaignOf(l.levelId)].lemmas.push(l);
    out.campaigns.main.earned = [...(v4.earned ?? [])];
    if (v4.lastLevel) out.campaigns[campaignOf(v4.lastLevel)].lastLevel = v4.lastLevel;
    out.campaign = v4.lastLevel ? campaignOf(v4.lastLevel) : 'main';
    return out;
  }
  /** v3 → v4: keep progress (solved levels, earned machines, metrics); migrate each floor best-effort. */
  static migrateV3(v3: Omit<FSaveV4, 'version' | 'lemmas'>): FSaveV4 {
    const levels: FSaveV4['levels'] = {};
    for (const [id, prog] of Object.entries(v3.levels ?? {})) {
      const level = LEVEL_BY_ID[id];
      const migrated = level ? F.migrateCanvas(prog.canvas, ctxFor(level, v3.earned ?? [], [])) : null;
      levels[id] = { ...prog, canvas: migrated ?? (level ? F.initialCanvas(level, ctxFor(level, v3.earned ?? [], [])) : prog.canvas) };
    }
    return { version: 4, lemmas: [], levels, earned: v3.earned ?? [], settings: v3.settings ?? { speed: 1, reducedMotion: false } };
  }
  private write(save: FSave) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
  }
  /** The current level's campaign, and its part of the save. */
  get campaign(): Campaign { return campaignOf(this.s.level); }
  camp(): CampaignSave { return campSave(this.s.save, this.campaign); }
  private persist() {
    const { save, level, canvas } = this.s;
    const next = withCamp(save, this.campaign, (cs) => ({ ...cs, levels: { ...cs.levels, [level.id]: { ...(cs.levels[level.id] ?? { canvas, history: [] }), canvas } } }));
    this.s = { ...this.s, save: next };
    this.write(next);
  }

  // ───────── navigation ─────────
  /** Open the theorem map, optionally on a campaign (the map's switch). */
  openMap(campaign?: Campaign) {
    if (campaign && campaign !== this.s.save.campaign) this.setCampaign(campaign);
    this.setUI({ screen: 'map', lens: null, selection: [] });
  }
  /** The map's campaign switch: which campaign the map shows (remembered in the save). */
  setCampaign(c: Campaign) {
    if (!CAMPAIGNS.includes(c) || c === this.s.save.campaign) return;
    const save: FSave = { ...this.s.save, campaign: c };
    this.write(save);
    this.set({ save });
  }
  /** Where a campaign resumes: its last opened order, else its first. */
  resumeLevel(c: Campaign = this.s.save.campaign): string | null {
    const last = campSave(this.s.save, c).lastLevel;
    return (last && LEVEL_BY_ID[last] ? last : firstLevel(c)?.id) ?? null;
  }
  openLevel(id: string) {
    const level = LEVEL_BY_ID[id];
    if (!level) return;
    const c = campaignOf(level);
    if (campSave(this.s.save, c).lastLevel !== id || this.s.save.campaign !== c) {
      this.s = { ...this.s, save: { ...withCamp(this.s.save, c, (cs) => ({ ...cs, lastLevel: id })), campaign: c } };
      this.write(this.s.save);
    }
    const ctx = ctxForSave(level, this.s.save);
    const saved = progressOf(this.s.save, id)?.canvas;
    const canvas = saved ? F.migrateDocks(saved, ctx) : F.initialCanvas(level, ctx);
    const compiled = F.compile(canvas, ctx);
    this.undoStack = []; this.redoStack = [];
    this.set({ level, ctx, canvas, compiled, run: F.initRun(canvas, compiled) });
    this.setUI({ screen: 'floor', levelId: id, tool: { k: 'select' }, rot: 0, selection: [], hover: null, lens: null, ceremony: null,
      hint: progressOf(this.s.save, id)?.solvedAt ? null : 0, toast: null, cards: { open: !progressOf(this.s.save, id)?.solvedAt, page: 0 }, playing: true });
    this.emit({ type: 'level-opened', levelId: id });
  }
  resetLevel() { this.commit(F.initialCanvas(this.s.level, this.s.ctx)); }

  // ───────── editing (every edit = new epoch) ─────────
  private commit(canvas0: Canvas, record = true) {
    // Every floor in the store applies Lemma Book records by their positional binders ($2:f), whatever path it came in
    // by (place / configure / paste / undo / a floor written by a script): binder keys still under a card's old names
    // ({ f: 'pi' }) would jam ("H is not a parameter of …") or ask for a choice already made. Idempotent; usually a no-op.
    const canvas = positionalRefs(canvas0, this.camp().lemmas);
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
    return this.apply(F.place(this.s.canvas, kind, at, opts.rot ?? this.s.ui.rot, this.s.ctx, opts.config && positionalRefs(opts.config, this.camp().lemmas)));
  }
  move(ids: string[], delta: Tile) { return this.apply(F.moveMachines(this.s.canvas, ids, delta, this.s.ctx)); }
  rotate(id: string) { return this.apply(F.rotateMachine(this.s.canvas, id, this.s.ctx)); }
  remove(ids: string[]) {
    const r = this.apply(F.remove(this.s.canvas, ids));
    if (r.ok) this.setUI({ selection: this.s.ui.selection.filter((x) => !ids.includes(x)), lens: ids.includes(this.s.ui.lens ?? '') ? null : this.s.ui.lens });
    return r;
  }
  configure(id: string, config: MachineConfig) { return this.apply(F.setConfigCtx(this.s.canvas, id, positionalRefs(config, this.camp().lemmas), this.s.ctx)); }
  connect(from: Endpoint, to: Endpoint, path?: Tile[]) { return this.apply(F.connect(this.s.canvas, from, to, this.s.ctx, path)); }
  branch(belt: string, to: Endpoint) { return this.apply(F.branch(this.s.canvas, belt, to, this.s.ctx)); }
  /** v4.1: drag from an output (or an open belt's end) to a floor cell (open belt) or to an input (completes it). */
  extendTo(from: Parameters<typeof F.extendTo>[1], target: Parameters<typeof F.extendTo>[2]) { return this.apply(F.extendTo(this.s.canvas, from, target, this.s.ctx)); }
  /** Connect through waypoints the player dragged over. */
  connectVia(from: Endpoint, to: Endpoint, via: Tile[]) { return this.apply(F.connectVia(this.s.canvas, from, to, via, this.s.ctx)); }
  /** Branch from the exact belt cell the player dragged off. */
  branchAt(belt: string, i: number, to: Endpoint) { return this.apply(F.branchAt(this.s.canvas, belt, i, to, this.s.ctx)); }
  /** Book phase A: `assumes` (2–3 assumptions) paints a multi-desk Assume room, one numbered desk each. */
  paintRoom(rect: Rect, kind: Room['kind'], l: Room['l'], r: Room['r'], rel?: Room['rel'], assumes?: Assumption[]) { return this.apply(F.paintRoom(this.s.canvas, rect, kind, l, r, this.s.ctx, rel, assumes && (assumes.length > 1 || assumes.some((a) => a.rel === 'mem')) ? (assumes as Parameters<typeof F.paintRoom>[7]) : undefined)); }
  /** Book phase A: change an Assume room's assumptions (1–3); desks are added or removed to match. */
  setRoomAssumptions(id: string, assumes: Assumption[]) { return this.apply(F.setRoomAssumptions(this.s.canvas, id, assumes as Parameters<typeof F.setRoomAssumptions>[2], this.s.ctx)); }
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
  setRoomSpec(spec: { l: Room['l']; r: Room['r']; rel?: Room['rel']; assumes?: Assumption[] } | null) { this.setUI({ roomSpec: spec }); }
  clearToast() { if (this.s.ui.toast) this.setUI({ toast: null }); }
  clearCeremony() { this.setUI({ ceremony: null }); }
  nextHint() { const h = this.s.ui.hint; this.setUI({ hint: h === null ? null : h + 1 }); }

  // ───────── v4: concept cards, Lemma Book ─────────
  openCards(page = 0) { this.setUI({ cards: { open: true, page } }); }
  closeCards() { this.setUI({ cards: { ...this.s.ui.cards, open: false } }); }
  setCardPage(page: number) { this.setUI({ cards: { ...this.s.ui.cards, page } }); }
  toggleLemmaBook(open?: boolean) { this.setUI({ lemmaBookOpen: open ?? !this.s.ui.lemmaBookOpen }); }

  /**
   * Re-verify every saved lemma, per campaign, in save order (each may use earlier ones of its own campaign,
   * under that campaign's earned theorems). Unverifiable lemmas are disabled, with a reason. Accepts older
   * save shapes (upgrades first).
   */
  static verifyLemmas(save0: FSave | FSaveV4): FSave {
    let save = save0.version === 5 ? save0 : FactoryStore.upgrade(save0);
    for (const c of CAMPAIGNS) {
      const cs = campSave(save, c);
      const ordered = [...cs.lemmas].sort((x, y) => x.savedAt - y.savedAt);
      const done: SavedLemma[] = [];
      for (const l of ordered) {
        const level = LEVEL_BY_ID[l.levelId];
        const earlier = done.filter((d) => d.verified !== false);
        const r = level ? F.verifyLemma(l, ctxFor(level, cs.earned, earlier), earlier.map((d) => d.id)) : { ok: false as const, reason: 'its floor no longer exists' };
        done.push({ ...l, verified: r.ok, reason: r.ok ? undefined : FactoryStore.missingCitation(l, earlier, cs.lemmas) ?? r.reason });
      }
      save = withCamp(save, c, (x) => ({ ...x, lemmas: done }));
    }
    return save;
  }

  /**
   * Why a lemma that cites other lemmas cannot check: one it uses is gone from the Lemma Book or is itself disabled
   * (a chain, e.g. f(e) = e → f(x⁻¹) = f(x)⁻¹ → fibre lemma, goes off together). The floor's own jam ("Waiting on the
   * Theorem.") would not say which one. Null when every cited lemma is in and verified.
   */
  static missingCitation(l: SavedLemma, earlier: SavedLemma[], all: SavedLemma[]): string | null {
    const miss = citedLemmas(l.canvas).filter((id) => id !== l.id && !earlier.some((d) => d.id === id));
    if (!miss.length) return null;
    const id = miss[0]!;
    const rec = all.find((x) => x.id === id);
    if (!rec) return 'It uses a lemma that is no longer in your Lemma Book.';
    return rec.savedAt > l.savedAt ? `It uses “${rec.name}”, which was saved after it.` : `It uses “${rec.name}”, which is disabled.`;
  }

  /** Save the card produced by a ∀ machine (or Assume gate) on this floor to the Lemma Book. */
  saveLemma(machineId: string, name: string): F.Edit | { ok: true; id: string } {
    const r = F.lemmaFrom(this.s.compiled, this.s.canvas, machineId, this.s.ctx);
    if (!r.ok) { this.setUI({ toast: { text: r.reason, kind: 'refused', t: Date.now() } }); return { ok: false, reason: r.reason }; }
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lemma';
    // numbered across both campaigns, so a lemma id is unique in the whole save
    const taken = new Set(CAMPAIGNS.flatMap((c) => campSave(this.s.save, c).lemmas.map((l) => l.id)));
    let n = CAMPAIGNS.reduce((k, c) => k + campSave(this.s.save, c).lemmas.length, 0) + 1;
    while (taken.has(`lemma:${slug}-${n}`)) n++;
    const id = `lemma:${slug}-${n}`;
    const lemma: SavedLemma = { id, name: name.trim() || 'Lemma', card: positional(r.card), levelId: this.s.level.id, canvas: this.s.canvas, machine: machineId, savedAt: Date.now(), verified: true };
    const save = withCamp(this.s.save, this.campaign, (cs) => ({ ...cs, lemmas: [...cs.lemmas, lemma] }));
    this.s = { ...this.s, save, ctx: ctxForSave(this.s.level, save) };
    this.write(save);
    this.commit(this.s.canvas, false);
    this.setUI({ toast: { text: `Saved to the Lemma Book: ${lemma.name}`, kind: 'note', t: Date.now() } });
    return { ok: true, id };
  }
  removeLemma(id: string) {
    const save = withCamp(this.s.save, this.campaign, (cs) => ({ ...cs, lemmas: cs.lemmas.filter((l) => l.id !== id) }));
    this.s = { ...this.s, save, ctx: ctxForSave(this.s.level, save) };
    this.write(save);
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
    const cs = this.camp();
    const prog: FLevelProgress = cs.levels[level.id] ?? { canvas, history: [] };
    const first = !prog.solvedAt;
    const unlocked = first ? level.unlocks.filter((u) => !cs.earned.includes(u)) : [];
    const best = prog.best
      ? { machines: Math.min(prog.best.machines, m.machines), area: Math.min(prog.best.area, m.area), cycles: Math.min(prog.best.cycles ?? Infinity, m.cycles ?? Infinity) }
      : m;
    const dup = prog.history.some((h) => h.machines === m.machines && h.area === m.area && h.cycles === m.cycles);
    const next = withCamp(save, this.campaign, (c) => ({
      ...c, earned: [...c.earned, ...unlocked],
      levels: { ...c.levels, [level.id]: { ...prog, canvas, solvedAt: prog.solvedAt ?? Date.now(), best: best as F.FactoryMetrics, history: dup ? prog.history : [...prog.history, m] } },
    }));
    this.s = { ...this.s, save: next };
    this.write(next);
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

export const LEVEL_LIST = CAMPAIGN_LEVELS.main;
