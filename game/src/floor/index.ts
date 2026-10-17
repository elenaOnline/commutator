// LEMMA WORKS v3 — the factory floor (isometric canvas: render + direct interaction). Owner: FLOOR builder.
//
// Full-bleed SVG. Every edit goes through store actions; legality comes from the
// editor/compiler (via ./adapt). The floor never decides what is mathematically
// or geometrically allowed — it previews what the editor says and draws the result.
import './floor.css';
import type { FactoryStore, FState, FUI } from '../state/factoryStore';
import type { Belt, Endpoint, ItemKind, ItemValue, Machine, Packet, Rect, Rot, RunState, Tile } from '../factory/types';
import { itemKindOf } from '../factory/types';
import { TICKS_PER_SECOND } from '../factory';
import * as F from '../factory';
import * as K from '../kernel';
import { queued } from '../factory/runtime';
import type * as FF from '../factory';
import { FONT, INK, VAR, reducedMotion } from '../ui/tokens';
import { setSortCtx } from '../ui/sorts';
import { campSave } from '../state/factoryStore';
import { campaignOf } from '../levels/campaigns';
import { MATH_CSS } from '../ui/math';
import { P, f1, type G2, type S2 } from '../board/geom';
import { factHTML, factSVG, factWidth, setVarInks, termHTML, termSVG, type Labels } from './math';
import { REGISTRY, MIRROR_NAMES } from '../levels/levels';
import {
  defaultConfig, faceVec, fallbackRoute, footprint, portTileOut, portsOf, spec, trySplice, tryAutoLinks, tryRouteOpen, tryBranchAt, tryCopy, tryMove, tryPlace, tryRouteOrWhy,
} from './adapt';
import { lookOf, termAtoms } from './look';
import { buildGeo, centre, portEdge, portEnd, tkey, type BGeo, type Geo, type MGeo, type PortGeo } from './geo';
import {
  beltBody, beltSVG, bridgeSVG, heightOf, labelsOf, openEndSVG, liveStatusOf, machineLabelSVG, machineName, machineSVG, pipSVG, portSVG, roomHandles, roomHeadSVG, roomSVG,
  dockMathSVG, socketLabelSVG, socketTarget, towerBulb, type Ctx,
} from './scene';
import { packetGrid, packetSVG, prevAt, type Axis } from './items';
import { richHTML } from '../shell/util';
import { JAM, OK, VIOLET, capsHTML, defsSVG, upperWords, esc, groundRect, polyD as polyLine } from './svg';
import { fitCamera, gridOf, tileOf, toScreen, toWorld, zoomAbout, type View } from './project';
import { dragRoomRect, duplicateBelt, fitRoom, type Box } from './roomdrag';

export * from './project';

/** The store surface the floor uses (FactoryStore satisfies it; the dev harness fakes it). */
export type FloorStore = Pick<FactoryStore,
  'get' | 'subscribe' | 'on' | 'place' | 'move' | 'rotate' | 'remove' | 'connect' | 'connectVia' | 'branch' | 'branchAt' | 'paintRoom' | 'resizeRoom' | 'paste' |
  'setTool' | 'setRot' | 'select' | 'openLens' | 'setHover' | 'toggleAlt' | 'setCamera' | 'setUI'>;

/** Full-bleed floor inside el. Returns unmount. */
export function mountFloor(el: HTMLElement, store: FactoryStore | FloorStore): () => void {
  const f = new Floor(el, store as FloorStore);
  ACTIVE = f;
  return () => { if (ACTIVE === f) ACTIVE = null; f.destroy(); };
}
let ACTIVE: Floor | null = null;

/** Viewport rect (client px) of a machine as drawn — the HUD anchors the lens to it. */
export function machineScreenRect(id: string): { left: number; top: number; width: number; height: number } | null {
  return ACTIVE?.machineRect(id) ?? null;
}
/** Viewport point (client px) of a tile's centre on the floor (probes aim the real pointer with it). */
export function tileClientPoint(t: Tile): { x: number; y: number } | null { return ACTIVE?.tileClient(t) ?? null; }
(globalThis as unknown as { __floorAim: unknown }).__floorAim = { tile: tileClientPoint, machine: (id: string) => machineScreenRect(id) };
/** Re-frame the floor (F). */
export function fitFloor(): void { ACTIVE?.fit(); }

// ───────────────────────────── perf probe ─────────────────────────────

export interface FloorPerf { kind: string; sync: number; frame: number }
const PERF: { samples: FloorPerf[]; frames: number[]; down?: unknown; drag?: unknown } = { samples: [], frames: [] };
(globalThis as unknown as { __floorPerf: typeof PERF }).__floorPerf = PERF;

// ───────────────────────────── gestures ─────────────────────────────

type Snap = { m: string; port: string; compat: boolean; pg: PortGeo };
type Gesture =
  | { k: 'none' }
  | { k: 'press'; x: number; y: number; target: Target; shift: boolean }
  | { k: 'pan'; x: number; y: number; cam: { x: number; y: number; zoom: number } }
  | { k: 'box'; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { k: 'move'; ids: string[]; start: Tile; delta: Tile; ok: boolean | null; reason?: string }
  | { k: 'belt'; why?: { reason: string; blockers: string[] }; from: Endpoint; branchOf?: string; branchI?: number; extendOf?: string; via: Tile[]; kind: ItemKind; fam: import('../kernel/types').Family; startG: G2; click: boolean; snap: Snap | null; path: Tile[] | null; real: boolean; noRoute: boolean; key: string }
  | { k: 'room'; start: Tile; cur: Tile; sx: number; sy: number; cx: number; cy: number }
  | { k: 'resize'; id: string; h: string; rect0: Rect; rect: Rect }
  /** an input dragged onto an output: the same belt, laid output → input (verify-fixround round 2, P4.10) */
  | { k: 'rbelt'; to: Endpoint };

type Target =
  | { k: 'port'; m: string; port: string }
  | { k: 'machine'; id: string }
  | { k: 'belt'; id: string }
  | { k: 'rh'; id: string; h: string }
  | { k: 'room'; id: string }
  | { k: 'bend'; id: string }   // the end cap of an open belt (drag to continue it)
  | { k: 'floor' };

const SVGNS = 'http://www.w3.org/2000/svg';
const DRAG = 4;

class Floor {
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  private world: SVGGElement;
  private L: Record<string, SVGGElement> = {};
  private tip: HTMLDivElement;
  private boxEl: SVGRectElement;
  private unsub: (() => void)[] = [];
  private raf = 0;

  private s: FState;
  private geo: Geo | null = null;
  private view: View = { w: 1, h: 1 };
  private labels: Labels = {};
  private slots: Record<string, number> = {};
  private cx!: Ctx;

  // runtime interpolation
  private prevRun: RunState | null = null;
  private tickAt = 0;
  private prevPos = new Map<number, { g: G2; axis: Axis }>();
  private pkEls = new Map<number, { el: SVGGElement; key: string }>();
  private pipKey = '';
  private drawnTick = -1;
  private drawnRun: RunState | null = null;

  // interaction
  private g: Gesture = { k: 'none' };
  private pointer: { x: number; y: number; inside: boolean } = { x: 0, y: 0, inside: false };
  private space = false;
  private altHeld: { was: boolean; at: number; used: boolean } | null = null;
  private hoverTarget: Target = { k: 'floor' };
  private ghostKey = '';
  private pipette: { kind: Machine['kind']; config: Machine['config'] } | null = null;
  /** Footprint of the machine just placed: the ghost stays quiet over it until the pointer leaves. */
  private justPlaced: Set<string> | null = null;
  /** Armed by Q (pipette): placement stays armed for repeated stamping until Esc / right-click / Q on floor. */
  private qArmed = false;
  private hiddenPk = new Set<number>();
  private kf = 1;
  private nameBoxes: { x0: number; y0: number; x1: number; y1: number }[] | null = null;
  private boxZoom = 1;
  private varIds = new Set<string>();
  private varSorts = new Map<string, 'G' | 'Z'>();
  private prevPorts: Map<string, Set<string>> | null = null;
  private reshaped = new Set<string>();
  private pulsedAt = new Map<string, number>();
  private headW = new Map<string, number>();
  private clipboard: FF.Blueprint | null = null;
  private pendingCam: { x: number; y: number; zoom: number } | null = null;
  private tipTimer = 0;
  private previewTimer = 0;
  private fitted = false;
  private elByM = new Map<string, Element>();
  private elByB = new Map<string, Element>();
  private ro: ResizeObserver;

  constructor(private host: HTMLElement, private store: FloorStore) {
    this.s = store.get();
    host.innerHTML = '';
    if (!document.getElementById('fl-math-css')) { const st = document.createElement('style'); st.id = 'fl-math-css'; st.textContent = MATH_CSS; document.head.appendChild(st); }
    this.root = document.createElement('div');
    this.root.className = 'fl-root';
    this.root.tabIndex = -1;
    const layers = ['rooms', 'under', 'belts', 'ports', 'machines', 'labels', 'radio', 'pips', 'packets', 'fx', 'ghost', 'alt', 'phits', 'badges', 'handles', 'tags'];
    this.root.innerHTML = `<svg class="fl-svg" xmlns="${SVGNS}">${defsSVG()}<rect class="fl-bg" width="100%" height="100%" fill="#fff"/>` +
      `<g class="fl-world"><rect x="-60000" y="-30000" width="120000" height="60000" fill="url(#fl-cross)" pointer-events="none"/>` +
      `<g class="fl-grid" mask="url(#fl-gridmask)" pointer-events="none"><rect x="-60000" y="-30000" width="120000" height="60000" fill="url(#fl-grid)"/></g>` +
      layers.map((l) => `<g class="fl-l fl-l-${l}"></g>`).join('') + `</g>` +
      `<rect class="fl-box" x="0" y="0" width="0" height="0"/></svg><div class="fl-tip" role="tooltip"></div>`;
    host.appendChild(this.root);
    this.svg = this.root.querySelector('svg')!;
    this.world = this.root.querySelector('.fl-world')!;
    for (const l of layers) this.L[l] = this.root.querySelector(`.fl-l-${l}`)!;
    this.tip = this.root.querySelector('.fl-tip')!;
    this.boxEl = this.root.querySelector('.fl-box')!;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();

    this.unsub.push(store.subscribe((s) => this.onState(s)));
    this.unsub.push(store.on((e) => {
      if (e.type === 'level-opened') {
        this.g = { k: 'none' }; this.justPlaced = null; this.pipette = null;
        this.clearPreview(); this.L.tags!.innerHTML = ''; this.hideTip();
        this.fitted = false; this.fit();
      }
      if (e.type === 'edited') {
        // a success supersedes any earlier refusal: never leave a refusal up after it
        const t = this.store.get().ui.toast as { kind?: string } | null;
        if (t?.kind === 'refused') (this.store as unknown as { clearToast?: () => void }).clearToast?.();
        // a note belongs to the edit that made it ("Slid the Exit Gate…"): the next edit retires it (round 2)
        else if (t?.kind === 'note') this.store.setUI({ toast: null });
        this.ghostKey = '';
      }
      if (e.type === 'refused') { this.hideTip(); this.renderGhostSoon(); }
    }));
    this.bindInput();
    this.fullRender();
    this.loop();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const u of this.unsub) u();
    this.ro.disconnect();
    this.host.innerHTML = '';
  }

  // ───────────────────────────── state → render ─────────────────────────────

  private ctxFor(s: FState): Ctx {
    return {
      L: this.labels, level: s.level, comp: s.compiled ?? null,
      // the selected side's standard name (SIDE_PAIRS via the catalogue), else the mirror / registry name
      schemaName: (id, mirror) => {
        try { const n = F.schemaMachineName(s.ctx, id, mirror); if (n && n !== id) return n; } catch { /* catalogue not ready */ }
        return (mirror ? MIRROR_NAMES[id]?.name : undefined) ?? REGISTRY[id]?.name ?? id;
      },
    };
  }

  private onState(s: FState) {
    const prev = this.s;
    this.s = s;
    const edited = s.canvas !== prev.canvas || s.compiled !== prev.compiled || s.level !== prev.level;
    // the ceremony (or any screen over the floor) ends a gesture in progress, ghost and all
    if ((s.ui as { ceremony?: unknown }).ceremony && !(prev.ui as { ceremony?: unknown }).ceremony) { this.cancel(); if (this.g.k === 'belt') { this.g = { k: 'none' }; this.root.classList.remove('is-belting'); this.clearPreview(); } }
    if (s.ui.toast && s.ui.toast !== prev.ui.toast) {
      this.toastAt = performance.now(); this.hideTip();
      const bl = (s.ui.toast as { blockers?: string[] }).blockers;
      if (bl?.length) requestAnimationFrame(() => this.flashBlockers(bl));
    }
    if (edited) { this.fullRender(); }
    else if (s.run !== prev.run) this.onRun(prev.run, s.run);
    if (s.ui.camera !== prev.ui.camera && !this.pendingCam) this.applyCamera();
    if (s.ui.selection !== prev.ui.selection || s.ui.hover !== prev.ui.hover || s.ui.lens !== prev.ui.lens || edited) this.applyMarks();
    if (s.ui.tool !== prev.ui.tool || s.ui.rot !== prev.ui.rot || edited) {
      if (s.ui.tool !== prev.ui.tool && (s.ui.tool.k !== 'place' || (this.pipette && s.ui.tool.kind !== this.pipette.kind))) { this.pipette = null; this.qArmed = false; }
      // a tool armed by anything but Q (hotbar, preset) is not a stamping pipette
      if (s.ui.tool !== prev.ui.tool && s.ui.tool.k === 'place' && !(this.pipette && s.ui.tool.kind === this.pipette.kind)) this.qArmed = false;
      this.ghostKey = ''; this.updateGhost(); this.renderHandles(); this.root.dataset.tool = s.ui.tool.k;
    }
    if (s.ui.alt !== prev.ui.alt || (s.ui.alt && edited)) this.renderAlt();
    // a visible hover card follows the facts (lens edits recompile; ticks change live status)
    if ((s.compiled !== prev.compiled || s.run !== prev.run) && this.tip.classList.contains('is-on')) this.refreshTip();
    if (s.ui.selection !== prev.ui.selection || s.ui.tool !== prev.ui.tool) this.renderHandles();
  }

  private fullRender() {
    const s = this.s;
    this.labels = labelsOf(s.level);
    setSortCtx(s.ctx, s.compiled?.graph ?? null); // Book phase C: items wear their sort
    this.slots = Object.fromEntries(s.level.atoms.map((a) => [a.id, a.hue]));
    this.cx = this.ctxFor(s);
    try {
      this.geo = buildGeo(s.canvas, s.compiled ?? null, s.ctx);
    } catch (e) { console.warn('floor: geometry failed', e); this.geo = null; }
    const geo = this.geo;
    if (!geo) { for (const k of Object.keys(this.L)) this.L[k]!.innerHTML = ''; return; }
    // a Theorem plate names the subgroup / homomorphism the compiler settled it at ("fibre lemma ⟹ at π") (#5)
    for (const [id, g] of geo.ms) {
      const st = s.compiled?.machines?.[id]?.structs;
      if (st?.length && g.look.subBlob) { const ch = st.find((x) => x.chosen); const lab = ch?.options.find((o) => o.id === ch.chosen)?.label; if (lab) g.look = { ...g.look, subBlob: { ...g.look.subBlob, label: lab } }; } // xy ∈ (N) when it acts on N (#10)
      if (!st?.length || !g.look.plate || !g.look.title || / at /.test(g.look.title)) continue;
      const at = st.filter((x) => x.chosen).map((x) => x.options.find((o) => o.id === x.chosen)?.label ?? x.chosen!);
      if (at.length) g.look = { ...g.look, title: `${g.look.title} at ${at.join(', ')}` };
    }
    const comp = s.compiled ?? null;
    // tower variables read as x₁ everywhere
    for (const [id, v] of geo.vars) this.labels[id] = v.label;
    this.varIds = new Set(geo.vars.keys());
    this.varSorts = new Map([...geo.vars].map(([id, v]) => [id, v.sort]));
    setVarInks(new Map([...geo.vars].map(([id, v]) => [id, VAR[v.sort].ink])));
    // rooms (an assume room's gate tells us its actual export once it has one)
    const qOf = (roomId: string) => {
      const gate = s.canvas.machines.find((m) => m.config.kind === 'gate' && m.config.room === roomId);
      const out = gate ? comp?.machines[gate.id]?.out : undefined;
      return out?.k === 'card' && out.card.k === 'cond' ? out.card.concl : undefined;
    };
    this.L.rooms!.innerHTML = s.canvas.rooms.map((r) => roomSVG(r, this.labels, false, r.kind === 'assume' ? qOf(r.id) : undefined)).join('');
    // belts
    this.L.belts!.innerHTML = [...geo.bs.values()].map((b) => beltSVG(b, comp)).join('') + geo.crossings.map((c) => bridgeSVG(c, geo)).join('');
    // ports (ground) + port hit targets (top)
    let ports = '', hits = '';
    for (const pg of geo.ports) {
      const g = geo.ms.get(pg.m)!;
      const svg = portSVG(pg, g);
      const cut = svg.indexOf('<circle class="fl-hit"');
      ports += svg.slice(0, cut) + '</g>';
      hits += `<g class="fl-p-hit" data-p="${esc(pg.m)}|${esc(pg.port.id)}">` + svg.slice(cut, svg.lastIndexOf('</g>')) + '</g>';
    }
    this.L.ports!.innerHTML = ports;
    this.L.phits!.innerHTML = hits;
    // a recipe change that adds ports: the new ones ease in (removed ones simply go)
    const nowPorts = new Map<string, Set<string>>();
    for (const pg of geo.ports) { const set = nowPorts.get(pg.m) ?? new Set<string>(); set.add(pg.port.id); nowPorts.set(pg.m, set); }
    if (this.prevPorts && !reducedMotion()) for (const [m, set] of nowPorts) {
      const before = this.prevPorts.get(m); if (!before) continue;
      for (const id of set) if (!before.has(id)) this.L.ports!.querySelector(`[data-p="${CSS.escape(`${m}|${id}`)}"]`)?.classList.add('is-new');
      if ([...set].some((id) => !before.has(id)) || [...before].some((id) => !set.has(id))) this.reshaped.add(m);
    }
    this.prevPorts = nowPorts;
    // machines, painter's order (far → near)
    const ms = [...geo.ms.values()].sort((a, b) => (a.x0 + a.y0 + a.x1 + a.y1) - (b.x0 + b.y0 + b.x1 + b.y1) || a.x0 - b.x0);
    const delivered = s.run?.delivered ?? {};
    let mach = '', labs = '';
    for (const g of ms) {
      if (g.m.kind === 'socket') {
        const sid = g.m.config.kind === 'socket' ? g.m.config.socketId : '';
        const filled = delivered[sid] !== undefined;
        mach += machineSVG(g, this.cx).replace('fl-sock"', `fl-sock${filled ? ' is-sealed' : ''}"`);
        labs += socketLabelSVG(g, this.cx, filled, filled && s.compiled && s.run ? F.dockAnswer(s.compiled, s.run, sid)?.holes : null);
      } else {
        mach += machineSVG(g, this.cx);
        labs += machineLabelSVG(g, this.cx);
      }
    }
    this.L.machines!.innerHTML = mach;
    // room headings ride the label layer, above machines and belts: nothing placed in a room hides its heading
    labs += s.canvas.rooms.map((r) => roomHeadSVG(r, this.labels, r.kind === 'assume' ? qOf(r.id) : undefined)).join('');
    this.L.labels!.innerHTML = labs;
    this.elByM.clear(); this.elByB.clear();
    this.L.machines!.querySelectorAll('[data-m]').forEach((e) => this.elByM.set((e as HTMLElement).dataset.m!, e));
    this.L.belts!.querySelectorAll('.fl-b').forEach((e) => this.elByB.set((e as HTMLElement).dataset.b!, e));
    for (const id of this.reshaped) (this.elByM.get(id)?.querySelector('.fl-body') as SVGGElement | null)?.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    this.reshaped.clear();
    this.capPackets();
    this.pipKey = '';
    this.renderPips();
    // packets: new epoch
    this.L.packets!.innerHTML = ''; this.pkEls.clear(); this.prevPos.clear(); this.prevRun = null; this.tickAt = performance.now(); this.drawnRun = null;
    this.renderHandles();
    if (this.s.ui.alt) this.renderAlt();
    this.renderBadges();
    this.nameBoxes = null;
    this.headW.clear();
    this.headSpot.clear();
    // size each heading's plate to its text (measured unscaled: the plate scales with the text)
    this.L.labels!.querySelectorAll<SVGGElement>('.fl-rhead-in').forEach((el) => {
      const id = el.dataset.rhead; if (!id) return;
      let w = 0;
      el.querySelectorAll<SVGTextElement>('text').forEach((t) => { try { w = Math.max(w, t.getComputedTextLength()); } catch { /* not laid out */ } });
      if (!w) w = 200;
      const plate = el.querySelector('.fl-rhead-plate');
      plate?.setAttribute('x', f1(-w / 2 - 10)); plate?.setAttribute('width', f1(w + 20));
      this.headW.set(id, w + 20);
    });
    if (!this.fitted) this.fit();
    else this.applyCamera();
  }

  /** "Ready to save": a ∀ machine or Assume gate whose card is a theorem of group theory (compiler's lemmaFrom). */
  private renderBadges() {
    const geo = this.geo, comp = this.s.compiled;
    let o = '';
    if (geo && comp) for (const g of geo.ms.values()) {
      if (g.m.kind !== 'forall' && g.m.kind !== 'gate') continue;
      let ok = false;
      let card: K.Card | null = null;
      try { const r = F.lemmaFrom(comp, this.s.canvas, g.m.id, this.s.ctx) as { ok?: boolean; card?: K.Card }; ok = !!r?.ok; card = r?.card ?? null; } catch { ok = false; }
      if (!ok) continue;
      // once saved, the badge goes (the Lemma Book keeps positional records: compare up to renaming) (#14)
      const saved = campSave(this.s.save, campaignOf(this.s.level)).lemmas;
      if (card && saved.some((l) => { try { return K.sameCardUpToRenaming(l.card, card!); } catch { return false; } })) continue;
      const c = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, heightOf(g.m));
      const w = 96, x = c[0] - w / 2, y = c[1] - 40;
      o += `<g class="fl-badge fl-sz fl-sz-q" data-badge="${esc(g.m.id)}" style="transform-origin:${f1(c[0])}px ${f1(y + 9)}px" role="button" aria-label="Ready to save to the Lemma Book">` +
        `<line x1="${f1(c[0])}" y1="${f1(y + 18)}" x2="${f1(c[0])}" y2="${f1(c[1] - 4)}" stroke="${INK.gold}" stroke-width="1.4"/>` +
        `<rect x="${f1(x)}" y="${f1(y)}" width="${w}" height="18" rx="9" fill="${INK.navy}" stroke="${INK.gold}" stroke-width="1.6"/>` +
        `<text x="${f1(c[0])}" y="${f1(y + 12.4)}" text-anchor="middle" font-family="${FONT.ui}" font-size="9.4" font-weight="600" letter-spacing=".08em" fill="#fff"><tspan fill="${INK.gold}">✓</tspan> READY TO SAVE</text></g>`;
    }
    this.L.badges!.innerHTML = o;
  }

  /** World boxes of every name and glyph on the floor (machine labels, given names, plate titles). */
  private names(): { x0: number; y0: number; x1: number; y1: number }[] {
    if (this.nameBoxes) return this.nameBoxes;
    const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
    // measured as drawn (label minimum-size scaling included), then mapped back to world px
    const host = this.root.getBoundingClientRect(), cam = this.cam();
    this.root.querySelectorAll<SVGGraphicsElement>('.fl-l-labels text, .fl-l-machines .fl-top text, .fl-plaque rect').forEach((t) => {
      const b = t.getBoundingClientRect(); if (!b.width) return;
      const a = toWorld(cam, this.view, b.left - host.left, b.top - host.top), z = toWorld(cam, this.view, b.right - host.left, b.bottom - host.top);
      out.push({ x0: a[0] - 2, y0: a[1] - 2, x1: z[0] + 2, y1: z[1] + 2 });
    });
    this.nameBoxes = out;
    return out;
  }

  /** At most MAX_IN_FLIGHT carriers drawn per belt; the rest (and the runtime's held-back queue) read as "×n" at the output. */
  private capPackets() {
    const geo = this.geo, run = this.s.run;
    this.hiddenPk.clear();
    if (!geo || !run) { this.L.fx!.innerHTML = ''; return; }
    const byBelt = new Map<string, Packet[]>();
    const held = new Map<string, number>(); // producing machine → carriers waiting in it
    const bump = (m: string, n = 1) => held.set(m, (held.get(m) ?? 0) + n);
    for (const p of run.packets) {
      if (p.at.k === 'belt') {
        const bg = geo.bs.get(p.at.belt);
        if (bg?.direct) { this.hiddenPk.add(p.id); bump(bg.b.from.m); continue; }
        const a = byBelt.get(p.at.belt) ?? []; a.push(p); byBelt.set(p.at.belt, a);
      } else if (p.at.port === 'out') { this.hiddenPk.add(p.id); bump(p.at.m); }
    }
    for (const [id, arr] of byBelt) {
      arr.sort((a, b) => (b.at as { i: number }).i - (a.at as { i: number }).i);
      for (const p of arr.slice(2)) this.hiddenPk.add(p.id);
      const bg = geo.bs.get(id);
      if (bg && arr.length > 2) bump(bg.b.from.m, arr.length - 2);
    }
    for (const [m, n] of Object.entries(queued(run))) if (n > 0) bump(m, n);
    let o = '';
    for (const [m, n] of held) {
      const g = geo.ms.get(m); if (!g || n < 1) continue;
      // an unconnected source is simply waiting: no count until a belt leaves it
      if (![...geo.bs.values()].some((b) => b.b.from.m === m && !b.broken)) continue;
      const port = g.ports.find((p) => p.dir === 'out');
      const h = heightOf(g.m);
      // a small stack on the machine's own top, by its output edge
      const d: [number, number] = port ? faceVec(port.face) : [1, 0];
      const at: [number, number] = port ? [port.tile.x + 0.5 + d[0] * 0.12, port.tile.y + 0.5 + d[1] * 0.12] : [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2];
      const c0 = P(at[0], at[1], h);
      // lift it off the machine, then slide it until it covers no name or glyph (labels, given names, plates)
      const boxes = this.names();
      const cands: [number, number][] = [[16, -16], [24, -30], [-22, -26], [30, -2], [0, -44], [-34, -6], [36, -46]];
      let c: [number, number] = [c0[0] + 16, c0[1] - 16];
      for (const [dx, dy] of cands) {
        const p: [number, number] = [c0[0] + (d[0] - d[1]) * dx * 0.7 + (d[0] === 0 ? dx : 0) * 0.3 + 6, c0[1] + dy];
        const k = Math.max(1, 9 / (8.6 * this.cam().zoom));
        const r = { x0: p[0] - 4 - 12 * k, y0: p[1] - 7 - 9 * k, x1: p[0] - 4 + 12 * k, y1: p[1] - 7 + 9 * k };
        if (!boxes.some((b) => r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0)) { c = p; break; }
      }
      const y = c[1] - 7;
      o += `<g class="fl-queue fl-sz fl-sz-q" data-q="${esc(m)}" style="transform-origin:${f1(c[0])}px ${f1(y)}px">` +
        `<rect x="${f1(c[0] - 13)}" y="${f1(y - 5)}" width="22" height="12" rx="3" fill="#fff" stroke="${INK.navy}" stroke-width="1" opacity=".75"/>` +
        `<rect x="${f1(c[0] - 15)}" y="${f1(y - 8)}" width="22" height="12" rx="3" fill="#fff" stroke="${INK.navy}" stroke-width="1.1"/>` +
        `<text x="${f1(c[0] - 4)}" y="${f1(y + 1.6)}" text-anchor="middle" font-family="${FONT.ui}" font-size="9" font-weight="600" fill="${INK.navy}">×${n > 9 ? '9+' : n}</text></g>`;
    }
    this.L.fx!.innerHTML = o;
  }

  private renderPips() {
    const geo = this.geo; if (!geo) return;
    const run = this.s.run ?? null, comp = this.s.compiled ?? null;
    let key = '', o = '';
    for (const g of geo.ms.values()) {
      const st = liveStatusOf(g.m.id, run, comp);
      key += g.m.id + ':' + st + ';';
      o += pipSVG(g, st);
    }
    if (key === this.pipKey) return;
    this.pipKey = key;
    this.L.pips!.innerHTML = o;
    this.applyMarks();
  }

  private onRun(prev: RunState | null, run: RunState) {
    const geo = this.geo; if (!geo) return;
    // remember interpolated positions from the previous tick
    this.prevPos.clear();
    if (prev) { const occ = this.occupancy(prev); for (const p of prev.packets) { const g = this.packetPlace(p, occ) ?? packetGrid(p.at, geo); if (g) this.prevPos.set(p.id, { g: g.g, axis: g.axis }); } }
    this.prevRun = prev;
    this.tickAt = performance.now();
    this.capPackets();
    this.renderPips();
    // docks: sealed exactly while their socket is delivered (the seal animates only on a fresh delivery)
    for (const [id, el] of this.elByM) {
      const m = geo.ms.get(id)?.m;
      if (m?.config.kind !== 'socket') continue;
      const done = run.delivered[m.config.socketId] !== undefined;
      if (done && !el.classList.contains('is-sealed') && (reducedMotion() || !prev || prev.delivered[m.config.socketId] !== undefined)) this.seal(m.config.socketId);
      if (!done && el.classList.contains('is-sealed')) {
        el.classList.remove('is-sealed');
        const tag = this.L.labels!.querySelector(`[data-sock="${CSS.escape(id)}"] .fl-socktag`);
        if (tag) tag.textContent = 'DELIVER';
        this.dockMath(id, m.config.socketId, false);
      }
    }
    if (reducedMotion() || !prev || run.tick < prev.tick) return;
    // stamps: jobs that completed this tick
    for (const [id, job] of Object.entries(prev.jobs)) {
      if (job.blocked) continue;
      const now = run.jobs[id];
      if (job.finish <= run.tick && (!now || now.finish !== job.finish || now.blocked)) this.stamp(id);
    }
    // seals
    for (const [sid, t] of Object.entries(run.delivered)) if (prev.delivered[sid] === undefined) { void t; this.seal(sid); }
    // towers broadcast when a machine produces something that speaks of their symbol
    if (this.varIds.size) {
      const old = new Set(prev.packets.map((p) => p.id));
      const heard = new Set<string>();
      for (const p of run.packets) if (!old.has(p.id)) for (const v of this.valueVars(p.value)) heard.add(v);
      for (const v of heard) { const t = this.geo?.vars.get(v)?.tower; if (t) this.pulseTower(t); }
    }
  }

  private stamp(id: string) {
    const el = this.elByM.get(id); if (!el) return;
    const top = el.querySelector('.fl-top') as SVGGElement | null;
    top?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3.2px)', offset: 0.35 }, { transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const inset = el.querySelector('.fl-inset') as SVGPathElement | null;
    inset?.animate([{ opacity: 0.6 }, { opacity: 0.16 }], { duration: 300, easing: 'ease-out' });
  }

  /** An open dock's chip: `?` while waiting, the delivered answer once sealed (Book phase A). */
  private dockMath(machineId: string, socketId: string, filled: boolean) {
    const sk = this.s.level.sockets.find((x) => x.id === socketId);
    if (!sk?.holes?.length) return;
    const el = this.L.labels!.querySelector(`[data-sock="${CSS.escape(machineId)}"] .fl-dockmath`);
    const s = this.s;
    if (el) el.innerHTML = dockMathSVG(sk, this.cx.L, filled && s.compiled && s.run ? F.dockAnswer(s.compiled, s.run, socketId)?.holes : null);
  }

  private seal(socketId: string) {
    for (const [id, el] of this.elByM) {
      const m = this.geo?.ms.get(id)?.m;
      if (m?.config.kind === 'socket' && m.config.socketId === socketId) {
        el.classList.add('is-sealed');
        const tag = this.L.labels!.querySelector(`[data-sock="${CSS.escape(id)}"] .fl-socktag`);
        if (tag) tag.textContent = 'DELIVERED';
        this.dockMath(id, socketId, true);
        if (!reducedMotion()) {
          (el.querySelector('.fl-seal') as SVGGElement | null)?.animate([{ transform: 'scale(1.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
          (el.querySelector('.fl-ripple') as SVGEllipseElement | null)?.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.4)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      }
    }
  }

  // ───────────────────────────── frame loop ─────────────────────────────

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t0 = performance.now();
    if (this.pendingCam) { const c = this.pendingCam; this.pendingCam = null; this.store.setCamera(c); this.applyCamera(); }
    this.drawPackets();
    const dt = performance.now() - t0;
    PERF.frames.push(dt); if (PERF.frames.length > 600) PERF.frames.shift();
  };

  /** Where a packet is drawn (grid), or null if it is hidden inside a machine. */
  private packetPlace(p: Packet, occ: Set<string>): { g: G2; axis: Axis; compact: boolean } | null {
    const geo = this.geo!;
    const base = packetGrid(p.at, geo);
    if (!base) return null;
    if (p.at.k === 'port') {
      const mg = geo.ms.get(p.at.m);
      const port = mg?.ports.find((x) => x.id === (p.at as { port: string }).port);
      void mg; void port; void occ;
      return null; // seated in the machine (inputs) or waiting in its output stack (outputs)
    }
    const bg = geo.bs.get(p.at.belt);
    if (bg?.direct) return null; // a coupling has no cells to ride: counted in the producer's stack
    if (p.at.i < 0) return null; // still leaving its port: part of the producer's output, not yet on the belt
    const n = bg?.b.path.length ?? 0;
    const compact = occ.has(`${p.at.belt}|${p.at.i + 1}`) || (!!bg && p.at.i === n - 1 && !!bg.b.to && occ.has(`P|${bg.b.to.m}|${bg.b.to.port}`));
    return { ...base, compact };
  }

  private occupancy(run: RunState): Set<string> {
    const occ = new Set<string>();
    for (const p of run.packets) occ.add(p.at.k === 'belt' ? `${p.at.belt}|${p.at.i}` : `P|${p.at.m}|${p.at.port}`);
    return occ;
  }

  private drawPackets() {
    const geo = this.geo, run = this.s.run;
    if (!geo || !run) return;
    const ui = this.s.ui;
    const interval = 1000 / (TICKS_PER_SECOND * Math.max(0.25, ui.speed || 1));
    const a = reducedMotion() ? 1 : Math.min(1, Math.max(0, (performance.now() - this.tickAt) / interval));
    if (a >= 1 && this.drawnTick === run.tick && this.drawnRun === run) return; // settled: nothing moves
    this.drawnTick = run.tick; this.drawnRun = run;
    const ease = a < 1 ? a * a * (3 - 2 * a) : 1;
    const occ = this.occupancy(run);
    const seen = new Set<number>();
    for (const p of run.packets) {
      if (this.hiddenPk.has(p.id)) continue;
      const cur = this.packetPlace(p, occ); if (!cur) continue;
      seen.add(p.id);
      let from = this.prevPos.get(p.id);
      if (!from) { const pa = prevAt(p.at); const pg = pa ? packetGrid(pa, geo) : null; from = pg ?? undefined; }
      const gx = from ? from.g[0] + (cur.g[0] - from.g[0]) * ease : cur.g[0];
      const gy = from ? from.g[1] + (cur.g[1] - from.g[1]) * ease : cur.g[1];
      const axis: Axis = from && ease < 0.5 ? from.axis : cur.axis;
      const key = axis + (cur.compact ? 'c' : '') + JSON.stringify(p.value);
      let rec = this.pkEls.get(p.id);
      if (!rec) {
        const el = document.createElementNS(SVGNS, 'g');
        el.setAttribute('class', 'fl-pk');
        el.innerHTML = packetSVG(p.value, axis, this.labels, this.slots, cur.compact, this.varSorts).svg;
        this.L.packets!.appendChild(el);
        rec = { el, key }; this.pkEls.set(p.id, rec);
      } else if (rec.key !== key) { rec.el.innerHTML = packetSVG(p.value, axis, this.labels, this.slots, cur.compact, this.varSorts).svg; rec.key = key; }
      const sp = P(gx, gy);
      rec.el.setAttribute('transform', `translate(${f1(sp[0])},${f1(sp[1])})`);
    }
    for (const [id, rec] of this.pkEls) if (!seen.has(id)) { rec.el.remove(); this.pkEls.delete(id); }
  }

  /** Client-px rect of a machine as drawn (for the HUD lens). */
  machineRect(id: string): { left: number; top: number; width: number; height: number } | null {
    const el = this.elByM.get(id) as SVGGraphicsElement | undefined;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  }

  // ───────────────────────────── camera ─────────────────────────────

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.view = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    if (!this.fitted) this.fit(); // opened while hidden: frame it as soon as it has a size
    this.applyCamera();
  }
  private cam() { return this.pendingCam ?? this.s.ui.camera; }
  private applyCamera() {
    const c = this.cam();
    this.world.setAttribute('transform', `translate(${f1(this.view.w / 2 - c.x * c.zoom)},${f1(this.view.h / 2 - c.y * c.zoom)}) scale(${c.zoom.toFixed(4)})`);
    this.root.style.setProperty('--z', String(c.zoom));
    // semantic labels keep a minimum SCREEN size: names ≥ 11 px (world 8.6), formulas ≥ 13 px (world ~14.5)
    const kn = Math.max(1, 11 / (8.6 * c.zoom)), kf = Math.max(1, 13 / (14.5 * c.zoom));
    this.root.style.setProperty('--kn', kn.toFixed(3));
    this.root.style.setProperty('--kf', kf.toFixed(3));
    this.root.style.setProperty('--kp', Math.max(1, 9 / (8.6 * c.zoom)).toFixed(3));
    this.root.classList.toggle('is-far', c.zoom < 0.62);
    if (Math.abs(kf - this.kf) / this.kf > 0.06) { this.kf = kf; if (this.s?.ui.alt) this.renderAlt(); }
    this.flipHeadings(c, kf);
    if (Math.abs(c.zoom - this.boxZoom) / Math.max(0.01, this.boxZoom) > 0.04) { this.boxZoom = c.zoom; this.nameBoxes = null; if (this.s?.run) this.capPackets(); }
  }
  /**
   * Room headings (verify-fixround): a plate on the room's top edge, above machines and belts (label layer), at full
   * size. Its spot: centred on the top corner and resting on it; when that would cover a machine, slide along the two
   * top edges; when the order chip, the run panel, the hotbar or the window edge would cut it, slide on until it is
   * whole. Chosen once per floor render; re-chosen only when the camera would cut it.
   */
  private headSpot = new Map<string, { x: number; y: number; key: string }>();
  private flipHeadings(c: { x: number; y: number; zoom: number }, kf: number) {
    if (!this.s?.canvas || !this.geo) return;
    const v = this.view;
    const area = this.safeArea();
    const visible = (x0: number, y0: number, x1: number, y1: number) => {
      const a = toScreen(c, v, [x0, y0]), b = toScreen(c, v, [x1, y1]);
      if (a[0] < 6 || b[0] > v.w - 6 || a[1] < 6 || b[1] > v.h - 6) return false;
      return !area.panels.some((q) => a[0] < q.right && b[0] > q.left && a[1] < q.bottom && b[1] > q.top);
    };
    const boxes = [...this.geo.ms.values()].map((g) => ({ x0: P(g.x0, g.y1)[0] - 4, x1: P(g.x1, g.y0)[0] + 4, y0: P(g.x0, g.y0, 0.6)[1] - 4, y1: P(g.x1, g.y1)[1] + 14, room: (g.m.config as { room?: string }).room }));
    // docks' DELIVER lines and givens' formulas weigh as machines
    this.L.labels?.querySelectorAll<SVGGraphicsElement>('.fl-socklab, .fl-lab').forEach((el) => {
      try { const r = el.getBBox(); if (r.width) boxes.push({ x0: r.x - 4, x1: r.x + r.width + 4, y0: r.y - 4, y1: r.y + r.height + 4, room: undefined }); } catch { /* not laid out */ }
    });
    const beltPts: [number, number][] = [];
    for (const b of this.geo.bs.values()) for (const p of b.line) beltPts.push(P(p[0], p[1]) as [number, number]);
    const camKey = kf.toFixed(3);
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const r of this.s.canvas.rooms) {
      const el = this.L.labels?.querySelector(`.fl-rhead-in[data-rhead="${CSS.escape(r.id)}"]`); if (!el) continue;
      const hw = (this.headW.get(r.id) ?? 220) * kf / 2, hh = 21 * kf;
      const box = (x: number, y: number) => ({ x0: x - hw, x1: x + hw, y0: y - hh, y1: y + hh });
      // its own desks and gate are never covered (round 2: the plate sat on the room's Assumption Desk); others cost
      const hit = (b: { x0: number; x1: number; y0: number; y1: number }) => [...boxes, ...placed].filter((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)
        .reduce((n, q) => n + ((q as { room?: string }).room === r.id ? 100 : 1), 0);
      const ok = (x: number, y: number) => { const b = box(x, y); return visible(b.x0, b.y0, b.x1, b.y1); };
      const prev = this.headSpot.get(r.id);
      let spot = prev && prev.key === camKey && ok(prev.x, prev.y) ? prev : null;
      if (!spot) {
        const R = r.rect;
        // resting on the top corner, then along the NE and NW top edges (a quarter tile at a time): the plate stands in
        // the band just above the edge
        const cands: [number, number, number][] = []; // x, y, preference penalty
        // foot on the wall line, or raised clear of the tallest machine standing on that edge
        // (or, last, hanging just inside the top edge, where it may sit over a machine of the room but never its desk)
        const foot = (gx: number, gy: number) => { const p = P(gx, gy); cands.push([p[0], p[1] - hh + 2 * kf, 0], [p[0], p[1] - hh - 34 * kf, 4], [p[0], p[1] + hh + 6 * kf, 12]); };
        foot(R.x, R.y);
        for (let t = 0.25; t <= Math.max(R.w, R.h); t += 0.25) {
          if (t <= R.w) foot(R.x + t, R.y);
          if (t <= R.h) foot(R.x, R.y + t);
        }
        // a small room under the HUD, or with its desk filling the top corner: the band below its bottom edges
        const hang = (gx: number, gy: number) => { const p = P(gx, gy); cands.push([p[0], p[1] + hh + 4 * kf, 20]); };
        hang(R.x + R.w, R.y + R.h);
        for (let t = 0.25; t <= Math.max(R.w, R.h); t += 0.25) {
          if (t <= R.h) hang(R.x + R.w, R.y + R.h - t);
          if (t <= R.w) hang(R.x + R.w - t, R.y + R.h);
        }
        let best: { x: number; y: number; score: number } | null = null;
        cands.forEach(([x, y, pen], i) => {
          const b = box(x, y);
          const belts = beltPts.filter((p) => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.y0 && p[1] < b.y1).length;
          // never under the HUD, never on its own desk or gate, then clear of machines and belts, then near the top corner
          const score = hit(b) * 1000 + belts * 40 + (visible(b.x0, b.y0, b.x1, b.y1) ? 0 : 1e6) + i / 8 + pen;
          if (!best || score < best.score) best = { x, y, score };
        });
        const b0 = best as { x: number; y: number } | null;
        spot = { x: b0?.x ?? cands[0]![0], y: b0?.y ?? cands[0]![1], key: camKey };
        this.headSpot.set(r.id, spot);
      }
      placed.push(box(spot.x, spot.y));
      el.setAttribute('transform', `translate(${f1(spot.x)},${f1(spot.y)})`);
    }
  }

  private setCam(c: { x: number; y: number; zoom: number }) { this.pendingCam = c; this.applyCamera(); }
  /**
   * Frame the floor (final playtest W1–7 #18): everything — machines, rooms and the labels as drawn (a long DELIVER
   * line, a given's formula) — inside the band the HUD leaves free: below the order chip and the run panel, above
   * the hotbar. A floor opened while hidden (the map was up) is framed when it first gets a size, never mid-build.
   */
  fit() {
    if (!this.geo || this.view.w < 10 || this.view.h < 10) return;
    this.fitted = true;
    this.pendingCam = null;
    const b = { ...this.geo.bounds };
    for (const layer of [this.L.labels, this.L.rooms]) {
      try {
        const r = (layer as unknown as SVGGraphicsElement).getBBox();
        if (r.width > 0) { b.x0 = Math.min(b.x0, r.x - 12); b.y0 = Math.min(b.y0, r.y - 8); b.x1 = Math.max(b.x1, r.x + r.width + 12); b.y1 = Math.max(b.y1, r.y + r.height + 8); }
      } catch { /* not laid out */ }
    }
    const sa = this.safeArea();
    const tops = sa.panels.filter((q) => q.top < this.view.h / 2).map((q) => q.bottom + 16);
    const bots = sa.panels.filter((q) => q.top >= this.view.h / 2).map((q) => this.view.h - q.top + 16);
    this.store.setCamera(fitCamera(b, this.view, { top: Math.max(90, ...tops), bottom: Math.max(110, ...bots), side: 48 }));
    this.applyCamera();
  }

  // ───────────────────────────── hover / selection marks ─────────────────────────────

  private applyMarks() {
    const ui = this.s.ui;
    const sel = new Set(ui.selection);
    for (const [id, el] of this.elByM) { el.classList.toggle('is-sel', sel.has(id) || ui.lens === id); el.classList.toggle('is-hover', ui.hover?.k === 'machine' && ui.hover.id === id); }
    const hovM = ui.hover?.k === 'machine' ? ui.hover.id : ui.hover?.k === 'port' ? ui.hover.id : null;
    for (const [id, el] of this.elByB) {
      const b = this.geo?.bs.get(id)?.b;
      el.classList.toggle('is-sel', sel.has(id));
      el.classList.toggle('is-hover', ui.hover?.k === 'belt' && ui.hover.id === id);
      el.classList.toggle('is-lit', !!b && !!hovM && (b.from.m === hovM || b.to?.m === hovM));
    }
    this.L.rooms!.querySelectorAll('[data-r]').forEach((e) => e.classList.toggle('is-sel', sel.has((e as HTMLElement).dataset.r!)));
    this.L.pips!.querySelectorAll('[data-pip]').forEach((e) => e.classList.toggle('is-hover', hovM === (e as HTMLElement).dataset.pip));
    this.L.phits!.querySelectorAll('[data-p]').forEach((e) => { const [m, p] = (e as HTMLElement).dataset.p!.split('|'); e.classList.toggle('is-hover', ui.hover?.k === 'port' && ui.hover.id === m && ui.hover.port === p); });
    this.L.ports!.querySelectorAll('[data-p]').forEach((e) => { const [m] = (e as HTMLElement).dataset.p!.split('|'); e.classList.toggle('is-hot', hovM === m || sel.has(m!)); });
    this.renderTrace();
  }

  // ───────────── towers: symbols, broadcast, tracing ─────────────

  /** Tower variable ids a value speaks of. */
  private valueVars(v: ItemValue | undefined): Set<string> {
    const out = new Set<string>();
    if (!v || !this.varIds.size) return out;
    const terms: import('../kernel/types').Term[] = [];
    const fact = (f: import('../kernel/types').Fact | import('../kernel/types').PatFact): void => {
      if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { terms.push(f.l, f.r); return; }
      if (f.k === 'cond') { f.premises.forEach(fact); fact(f.concl); }
    };
    if (v.k === 'term') terms.push(v.term); else if (v.k === 'fact') fact(v.fact); else fact(v.card);
    for (const t of terms) for (const a of termAtoms(t)) if (this.varIds.has(a)) out.add(a);
    return out;
  }

  /** Variables a machine uses: what it makes, what reaches it, and its own knobs. */
  private machineVars(id: string): Set<string> {
    const out = new Set<string>();
    const g = this.geo?.ms.get(id); if (!g || !this.varIds.size) return out;
    if (g.m.config.kind === 'tower') { out.add(g.m.config.varId); return out; }
    const r = this.s.compiled?.machines[id];
    const add = (v?: ItemValue) => { for (const x of this.valueVars(v)) out.add(x); };
    add(r?.out); for (const v of Object.values(r?.inputs ?? {})) add(v);
    const knob = (p?: import('../factory/types').Param) => { if (p?.k === 'knob' && p.term) add({ k: 'term', term: p.term }); };
    const c = g.m.config;
    if (c.kind === 'spool') knob(c.t);
    if (c.kind === 'hopper' && c.t) add({ k: 'term', term: c.t });
    if (c.kind === 'operator' && c.recipe?.k === 'multiply') knob(c.recipe.t);
    if (c.kind === 'rewriter') { Object.values(c.values).forEach(knob); if (c.recipe?.k === 'insertPair') knob(c.recipe.x); }
    if (c.kind === 'theorem') Object.values(c.values).forEach(knob);
    return out;
  }

  private dishOf(towerId: string): S2 | null {
    const g = this.geo?.ms.get(towerId); if (!g) return null;
    return towerBulb(g);
  }

  /** Broadcast rings from a tower's dish (throttled). */
  private pulseTower(towerId: string) {
    if (reducedMotion()) return;
    const now = performance.now();
    if (now - (this.pulsedAt.get(towerId) ?? 0) < 1400) return;
    this.pulsedAt.set(towerId, now);
    const d = this.dishOf(towerId); if (!d) return;
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'fl-waves');
    for (let i = 0; i < 3; i++) {
      const e = document.createElementNS(SVGNS, 'ellipse');
      e.setAttribute('cx', f1(d[0])); e.setAttribute('cy', f1(d[1])); e.setAttribute('rx', '16'); e.setAttribute('ry', '8');
      e.setAttribute('fill', 'none'); e.setAttribute('stroke', VIOLET); e.setAttribute('stroke-width', '1.6');
      e.style.transformOrigin = `${f1(d[0])}px ${f1(d[1])}px`; e.style.transformBox = 'view-box';
      g.appendChild(e);
      e.animate([{ transform: 'scale(.5)', opacity: 0.85 }, { transform: 'scale(3.4)', opacity: 0 }], { duration: 1300, delay: i * 190, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
    }
    this.L.radio!.appendChild(g);
    setTimeout(() => g.remove(), 1800);
    this.elByM.get(towerId)?.querySelector('.fl-dish')?.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 400 });
  }

  /** Hover a tower → light everything that speaks its symbol (radio arcs to them). Hover a machine or belt
   *  that speaks of a variable → trace back to its tower. */
  private renderTrace() {
    const geo = this.geo, h = this.s.ui.hover;
    const layer = this.L.radio!;
    layer.querySelector('.fl-trace')?.remove();
    for (const el of this.root.querySelectorAll('.is-var-lit')) el.classList.remove('is-var-lit');
    this.root.classList.remove('is-tracing');
    if (!geo || !h || !this.varIds.size || (h.k !== 'machine' && h.k !== 'belt' && h.k !== 'port')) return;
    const hid = h.id;
    const hg = geo.ms.get(hid);
    let pairs: { tower: string; target: S2 }[] = [];
    const centreOf = (id: string): S2 | null => { const g = geo.ms.get(id); return g ? P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, 0.45) : null; };
    if (h.k === 'machine' && hg?.m.config.kind === 'tower') {
      const v = hg.m.config.varId;
      for (const [id] of geo.ms) if (id !== hid && this.machineVars(id).has(v)) { this.elByM.get(id)?.classList.add('is-var-lit'); const c = centreOf(id); if (c) pairs.push({ tower: hid, target: c }); }
      for (const [id, bg] of geo.bs) if (this.valueVars(this.s.compiled?.machines[bg.b.from.m]?.out).has(v)) this.elByB.get(id)?.classList.add('is-var-lit');
      this.elByM.get(hid)?.classList.add('is-var-lit');
    } else {
      const vars = h.k === 'belt' ? this.valueVars(this.s.compiled?.machines[geo.bs.get(hid)?.b.from.m ?? '']?.out) : this.machineVars(hid);
      if (!vars.size) return;
      const from = h.k === 'belt' ? (() => { const bg = geo.bs.get(hid); const t = bg?.line[Math.floor((bg?.line.length ?? 1) / 2)]; return t ? P(t[0], t[1], 0.2) : null; })() : centreOf(hid);
      if (!from) return;
      for (const v of vars) { const t = geo.vars.get(v)?.tower; if (t) { this.elByM.get(t)?.classList.add('is-var-lit'); pairs.push({ tower: t, target: from }); } }
    }
    if (!pairs.length && !(h.k === 'machine' && hg?.m.config.kind === 'tower')) return;
    this.root.classList.add('is-tracing');
    pairs = pairs.slice(0, 40);
    let o = '';
    for (const p of pairs) {
      const d = this.dishOf(p.tower); if (!d) continue;
      const mx = (d[0] + p.target[0]) / 2, my = Math.min(d[1], p.target[1]) - 40 - Math.abs(d[0] - p.target[0]) * 0.12;
      o += `<path d="M${f1(d[0])},${f1(d[1])}Q${f1(mx)},${f1(my)} ${f1(p.target[0])},${f1(p.target[1])}" fill="none" stroke="${VIOLET}" stroke-width="1.4" stroke-dasharray="2 5" stroke-linecap="round" opacity=".7"/>` +
        `<circle cx="${f1(p.target[0])}" cy="${f1(p.target[1])}" r="3" fill="${VIOLET}" opacity=".7"/>`;
    }
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'fl-trace');
    g.innerHTML = o;
    layer.appendChild(g);
  }

  private renderHandles() {
    const ui = this.s.ui;
    const rooms = this.s.canvas.rooms.filter((r) => ui.selection.includes(r.id) || ui.tool.k === 'room');
    let html = rooms.map((r) => roomHandles(this.g.k === 'resize' && this.g.id === r.id ? this.g.rect : r.rect, r.id)).join('');
    // a selected room carries its own delete, under its south corner (away from the heading; never beside a close)
    const one = ui.selection.length === 1 ? this.s.canvas.rooms.find((r) => r.id === ui.selection[0]) : undefined;
    if (one && this.g.k !== 'resize' && ui.tool.k !== 'room') {
      // at the room's west corner, outside it (docks sit east and south; the heading sits on the north-west wall)
      const R = one.rect, c = P(R.x, R.y + R.h);
      const text = 'Delete room  ⌫', w = 22 + text.length * 6.4, x0 = c[0] - w - 14;
      html += `<g class="fl-rdel" data-rdel="${esc(one.id)}" role="button" aria-label="Delete this room (its desk and gate go; machines inside stay)" style="cursor:pointer">` +
        `<rect x="${f1(x0)}" y="${f1(c[1] - 12)}" width="${f1(w)}" height="24" rx="12" fill="#fff" stroke="${JAM}" stroke-width="1.3"/>` +
        `<text x="${f1(x0 + w / 2)}" y="${f1(c[1] + 4)}" text-anchor="middle" font-family="${FONT.ui}" font-size="12" font-weight="600" fill="${JAM}" style="pointer-events:none">${esc(text)}</text>` +
        `<title>Removes the room, its desk and its gate. Machines inside stay. ⌘Z undoes.</title></g>`;
    }
    this.L.handles!.innerHTML = html;
  }

  // ───────────────────────────── alt overlay ─────────────────────────────

  private renderAlt() {
    const geo = this.geo;
    if (!this.s.ui.alt || !geo) { this.L.alt!.innerHTML = ''; this.root.classList.remove('is-alt'); return; }
    this.root.classList.add('is-alt');
    const comp = this.s.compiled ?? null;
    const k = this.kf;
    type Box = { x0: number; y0: number; x1: number; y1: number };
    const placed: Box[] = [];
    for (const g of geo.ms.values()) {
      const a = P(g.x0, g.y0), b = P(g.x1, g.y1), c = P(g.x1, g.y0), d = P(g.x0, g.y1);
      placed.push({ x0: d[0] + 6, y0: a[1] - 14, x1: c[0] - 6, y1: b[1] - 4 });
    }
    for (const r of this.s.canvas.rooms) { const a = P(r.rect.x, r.rect.y + r.rect.h * 0.5); placed.push({ x0: a[0] - 300 * k, y0: a[1] - 50 * k, x1: a[0] - 10, y1: a[1] - 8 }); }
    for (const g of geo.ms.values()) if (g.m.kind === 'given') { const a = P(g.x0, (g.y0 + g.y1) / 2); placed.push({ x0: a[0] - 160 * k, y0: a[1] - 30 * k, x1: a[0] - 8, y1: a[1] + 8 }); }
    const hits = (r: Box) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
    const valueSVG = (v: ItemValue): string => v.k === 'term' ? termSVG(v.term, this.labels) : v.k === 'fact' ? factSVG(v.fact, this.labels) : factSVG(v.card, this.labels);
    const width = (v: ItemValue): number => (v.k === 'term' ? factWidth({ k: 'term', t: v.term }, this.labels) : factWidth(v.k === 'fact' ? v.fact : v.card, this.labels));
    let o = '';
    // every belt gets its formula: on-route if it fits, else an offset lane with a leader line — never dropped
    const sel = new Set(this.s.ui.selection);
    const belts = [...geo.bs.values()].filter((b) => !b.broken).sort((a, b) => Number(sel.has(b.b.id)) - Number(sel.has(a.b.id)) || a.line.length - b.line.length);
    const LANES = [0, -1, 1, -2, 2, -3, 3, -4];
    for (const bg of belts) {
      const v = comp?.machines[bg.b.from.m]?.out;
      if (!v) continue;
      const w = (width(v) * 14.5 + 10) * k, h = 19 * k, step = 22 * k;
      const anchors: G2[] = bg.b.path.length ? bg.b.path.map((t) => [t.x + 0.5, t.y + 0.5] as G2) : [bg.line[0]!];
      const mid = (anchors.length - 1) / 2;
      const order = anchors.map((_, i) => i).sort((i, j) => Math.abs(i - mid) - Math.abs(j - mid));
      let pick: { c: S2; dy: number } | null = null;
      outer: for (const lane of LANES) for (const i of order) {
        const c = P(anchors[i]![0], anchors[i]![1]);
        const dy = -16 * k + lane * step - (lane < 0 ? 6 * k : lane > 0 ? -10 * k : 0);
        const r = { x0: c[0] - w / 2, y0: c[1] + dy - h + 4, x1: c[0] + w / 2, y1: c[1] + dy + 5 };
        if (!hits(r)) { pick = { c, dy }; placed.push(r); break outer; }
      }
      if (!pick) {
        // crowded: stack above the route's middle, still readable, still there
        const c = P(anchors[order[0]!]![0], anchors[order[0]!]![1]);
        let dy = -16 * k - 5 * step;
        while (hits({ x0: c[0] - w / 2, y0: c[1] + dy - h + 4, x1: c[0] + w / 2, y1: c[1] + dy + 5 }) && dy > -40 * step) dy -= step;
        placed.push({ x0: c[0] - w / 2, y0: c[1] + dy - h + 4, x1: c[0] + w / 2, y1: c[1] + dy + 5 });
        pick = { c, dy };
      }
      const { c, dy } = pick;
      const lead = Math.abs(dy) > 20 * k ? `<line x1="${f1(c[0])}" y1="${f1(c[1] + dy + 4)}" x2="${f1(c[0])}" y2="${f1(c[1] - 3)}" stroke="${INK.navy}" stroke-width="1" opacity=".45"/><circle cx="${f1(c[0])}" cy="${f1(c[1] - 3)}" r="2" fill="${INK.navy}" opacity=".6"/>` : `<line x1="${f1(c[0])}" y1="${f1(c[1] + dy + 3)}" x2="${f1(c[0])}" y2="${f1(c[1] - 2)}" stroke="${INK.navy}" stroke-width="1" opacity=".45"/>`;
      o += `<g class="fl-altlab" data-alt="${esc(bg.b.id)}">${lead}<g class="fl-sz fl-sz-f" style="transform-origin:${f1(c[0])}px ${f1(c[1] + dy)}px"><text x="${f1(c[0])}" y="${f1(c[1] + dy)}" text-anchor="middle" font-family="${FONT.math}" font-size="14.5" fill="${INK.navy}">${valueSVG(v)}</text></g></g>`;
    }
    // port kinds
    for (const pg of geo.ports) {
      const sp = P(pg.out[0], pg.out[1]);
      const label = pg.port.role === 'rule' ? 'rule' : pg.port.role === 'param' ? pg.port.label : pg.kind;
      o += `<g class="fl-sz fl-sz-p" style="transform-origin:${f1(sp[0])}px ${f1(sp[1] + 12)}px"><text class="fl-altport" x="${f1(sp[0])}" y="${f1(sp[1] + 16)}" text-anchor="middle" font-family="${FONT.ui}" font-size="8.4" font-weight="600" letter-spacing=".08em" fill="${INK.navy2}">${esc(upperWords(label))}</text></g>`;
    }
    // target bracket summary
    for (const g of geo.ms.values()) {
      const r = comp?.machines[g.m.id];
      const cand = r?.candidates && r.chosen !== undefined ? r.candidates[r.chosen] : undefined;
      if (!cand) continue;
      const a = P((g.x0 + g.x1) / 2, g.y1);
      o += `<g class="fl-sz fl-sz-f" style="transform-origin:${f1(a[0] - 6)}px ${f1(a[1] + 21)}px"><text class="fl-altbr" x="${f1(a[0] - 6)}" y="${f1(a[1] + 25)}" text-anchor="middle" font-family="${FONT.math}" font-size="12.5" fill="${INK.navy}">at [${esc(cand.label)}]</text></g>`;
    }
    this.L.alt!.innerHTML = o;
  }

  // ───────────────────────────── ghosts & previews ─────────────────────────────

  tileClient(t: Tile): { x: number; y: number } {
    const sp = toScreen(this.cam(), this.view, P(t.x + 0.5, t.y + 0.5));
    const r = this.root.getBoundingClientRect();
    return { x: r.left + sp[0], y: r.top + sp[1] };
  }
  private pointerTile(): Tile { return tileOf(gridOf(toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y))); }
  private pointerGrid(): G2 { return gridOf(toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y)); }

  /**
   * Where a w×h machine aimed at `tile` lands (every drop path: hotbar, pipette, move). Aimed inside a room near
   * its wall, it slides wholly inside; aimed just outside, wholly outside. It never lands across a wall by surprise.
   */
  private snapToRooms(at0: Tile, w: number, h: number, tile: Tile): Tile {
    let at = { ...at0 };
    // aimed inside a room near its wall: slide the machine wholly inside (it never lands outside by surprise)
    const room = F.roomAt(this.s.canvas, tile);
    if (room && w <= room.rect.w && h <= room.rect.h) {
      const R = room.rect;
      at = { x: Math.min(Math.max(at.x, R.x), R.x + R.w - w), y: Math.min(Math.max(at.y, R.y), R.y + R.h - h) };
    }
    // aimed just outside a wall with a footprint that would cut it: slide it wholly outside, the short way
    for (const r of this.s.canvas.rooms) {
      const R = r.rect;
      if (room && (room.id === r.id || (R.x <= room.rect.x && R.y <= room.rect.y && R.x + R.w >= room.rect.x + room.rect.w && R.y + R.h >= room.rect.y + room.rect.h))) continue; // the pointer's own room (or one around it)
      const ix = Math.min(at.x + w, R.x + R.w) - Math.max(at.x, R.x), iy = Math.min(at.y + h, R.y + R.h) - Math.max(at.y, R.y);
      if (ix <= 0 || iy <= 0) continue;
      const opts = [{ x: R.x - w - at.x, y: 0 }, { x: R.x + R.w - at.x, y: 0 }, { x: 0, y: R.y - h - at.y }, { x: 0, y: R.y + R.h - at.y }];
      const d = opts.sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - Math.abs(b.x) - Math.abs(b.y))[0]!;
      if (Math.abs(d.x) + Math.abs(d.y) <= Math.max(w, h)) at = { x: at.x + d.x, y: at.y + d.y };
    }
    return at;
  }

  private ghostMachine(tile: Tile): Machine | null {
    const tool = this.s.ui.tool;
    if (tool.k !== 'place') return null;
    const armed = (tool as { config?: Machine['config'] }).config;
    const config = armed && armed.kind === tool.kind ? armed : this.pipette?.kind === tool.kind ? this.pipette.config : defaultConfig(tool.kind, this.s.ctx, { schema: tool.schema, mirror: tool.mirror, canvas: this.s.canvas });
    const probe: Machine = { id: '__ghost', kind: tool.kind, at: { x: 0, y: 0 }, rot: this.s.ui.rot, config };
    const fp = footprint(probe, this.s.ctx);
    const w = Math.max(...fp.map((t) => t.x)) + 1, h = Math.max(...fp.map((t) => t.y)) + 1;
    const at = this.snapToRooms({ x: tile.x - Math.floor((w - 1) / 2), y: tile.y - Math.floor((h - 1) / 2) }, w, h, tile);
    return { ...probe, at };
  }

  private updateGhost() {
    const tool = this.s.ui.tool;
    const showGrid = this.pointer.inside && (tool.k === 'place' || tool.k === 'room' || this.g.k === 'belt' || this.g.k === 'move' || this.g.k === 'room' || this.g.k === 'resize');
    this.root.classList.toggle('is-gridding', showGrid);
    this.root.classList.toggle('is-hovering', this.pointer.inside);
    const w = toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y);
    const spot = this.svg.querySelector('#fl-gridspot');
    spot?.setAttribute('cx', f1(w[0])); spot?.setAttribute('cy', f1(w[1]));
    if (this.g.k === 'belt') return this.renderBeltPreview();
    if (this.g.k === 'move') return this.renderMovePreview();
    if (this.g.k === 'room' || this.g.k === 'resize') return this.renderRoomPreview();
    if (tool.k === 'place' && this.pointer.inside) return this.renderPlaceGhost();
    // nothing to preview: clear unconditionally (a stale ghost/tag must never outlive its gesture)
    this.ghostKey = '';
    if (this.L.ghost!.firstChild) this.L.ghost!.innerHTML = '';
    if (this.L.under!.firstChild) this.L.under!.innerHTML = '';
  }

  private renderPlaceGhost() {
    const tile = this.pointerTile();
    const key = `place|${tile.x},${tile.y}|${this.s.ui.rot}|${JSON.stringify(this.s.ui.tool)}`;
    if (key === this.ghostKey) return;
    // a refusal belongs to the spot it was said about: on a new spot the ghost speaks again (where it will land) —
    // but only once it has been up long enough to read (final playtest W1–7 #17: a refusal beside a dock flashed for
    // one frame as the hand moved on, and read as a silent refusal)
    if (this.ghostKey && this.s.ui.toast?.kind === 'refused' && performance.now() - this.toastAt > 1600) this.store.setUI({ toast: null });
    this.ghostKey = key;
    const m = this.ghostMachine(tile); if (!m || !this.geo) return;
    if (this.justPlaced) {
      if (this.justPlaced.has(tkey(tile))) { this.L.ghost!.innerHTML = ''; this.L.under!.innerHTML = ''; return; }
      this.justPlaced = null;
    }
    const verdict = tryPlace(this.s.canvas, m.kind, m.at, m.rot, this.s.ctx, m.config);
    const s = spec(m.kind);
    const tiles = footprint(m, this.s.ctx);
    const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
    const look = lookOf(m, { ...this.s.ctx, labels: Object.fromEntries([...(this.geo?.vars ?? new Map())].map(([id, v]) => [id, v.label])) });
    const g: MGeo = { m, spec: s, fam: look.fam, look, tiles, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, ports: portsOf(m, this.s.ctx) };
    // geometric overlap is a fact we can see; the verdict (if any) is the editor's
    const overlap = tiles.some((t) => this.geo!.occ.has(tkey(t)) || this.geo!.beltOcc.has(tkey(t)));
    const ok = verdict ? verdict.ok : !overlap;
    let under = '';
    for (const t of tiles) under += `<path d="${groundRect(t.x, t.y, t.x + 1, t.y + 1, 0.05, 0.12)}" fill="${ok ? OK : 'url(#fl-bad)'}" opacity="${ok ? 0.22 : 1}" stroke="${ok ? OK : JAM}" stroke-width="1" stroke-opacity=".7"/>`;
    // new belts the editor would add (auto-connect)
    let belts = '';
    let completes = 0;
    if (verdict && verdict.ok) {
      const before = new Map(this.s.canvas.belts.map((b) => [b.id, b]));
      const newId = verdict.ids?.[0];
      for (const b of verdict.canvas.belts) {
        const was = before.get(b.id);
        if (!was) belts += this.ghostBeltSVG(b, verdict.canvas.machines, newId ? { [newId]: g } : {});
        else if (!was.to && b.to) { completes++; belts += this.ghostBeltSVG(b, verdict.canvas.machines, newId ? { [newId]: g } : {}); }
      }
    }
    // per-port arrows: solid if a compatible partner faces it across one free tile, red if the neighbour is a machine body
    let arrows = '';
    const links = tryAutoLinks(this.s.canvas, m, this.s.ctx);
    const linked = new Set(links.map((l) => (l.from.m === m.id ? l.from.port : l.to.port)));
    for (const p of g.ports) {
      const out = portTileOut(p);
      const occ = this.geo.occ.get(tkey(out));
      let state: 'free' | 'link' | 'bad' = 'free';
      if (linked.has(p.id)) state = 'link';
      else if (occ) state = 'bad';
      else {
        for (const pg of this.geo.ports) {
          if (pg.taken || pg.port.dir === p.dir) continue;
          const o2 = portTileOut(pg.port);
          if (o2.x === out.x && o2.y === out.y) { const kinds = p.dir === 'out' ? pg.port.accepts : p.accepts; const k = p.dir === 'out' ? (p.accepts[0] ?? 'eq') : pg.kind; state = kinds.includes(k) ? 'link' : 'bad'; }
        }
      }
      const e = P(...portEdge(p)), c = P(out.x + 0.5, out.y + 0.5);
      const col = state === 'link' ? OK : state === 'bad' ? JAM : INK.navy3;
      arrows += `<line x1="${f1(e[0])}" y1="${f1(e[1])}" x2="${f1(c[0])}" y2="${f1(c[1])}" stroke="${col}" stroke-width="${state === 'free' ? 1.4 : 2.4}" stroke-linecap="round" ${state === 'free' ? 'stroke-dasharray="2 3"' : ''} opacity="${state === 'free' ? 0.6 : 1}"/>` +
        `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${state === 'free' ? 2.4 : 3.6}" fill="${state === 'free' ? '#fff' : col}" stroke="${col}" stroke-width="1.2"/>`;
    }
    // connections this placement would cut (kept as broken belts by the editor) — preview them, never surprise
    let cuts = 0, splices = 0;
    const newId = verdict?.ok ? verdict.ids?.[0] : undefined;
    const spliced = (b: Belt) => !!verdict?.ok && !!newId &&
      verdict.canvas.belts.some((x) => x.from.m === b.from.m && x.from.port === b.from.port && x.to?.m === newId && !x.broken) &&
      verdict.canvas.belts.some((x) => x.from.m === newId && !!b.to && x.to?.m === b.to.m && x.to?.port === b.to.port && !x.broken);
    if (verdict?.ok) for (const b of this.s.canvas.belts) {
      const nb = verdict.canvas.belts.find((x) => x.id === b.id);
      if (!nb && spliced(b)) { splices++; continue; }
      if (!b.broken && (!nb || nb.broken)) { cuts++; const bg = this.geo.bs.get(b.id); if (bg) under += `<path d="${polyLine(bg.line)}" fill="none" stroke="${JAM}" stroke-width="5" stroke-opacity=".35" stroke-dasharray="7 5" stroke-linecap="round"/>`; }
    }
    // splice candidates: light the belt(s) the machine would be inserted into
    const cands = trySplice(this.s.canvas, m, this.s.ctx);
    for (const c of cands) { const bg = this.geo.bs.get(c.belt); if (bg) under += `<path d="${polyLine(bg.line)}" fill="none" stroke="${INK.navy}" stroke-width="9" stroke-opacity=".16" stroke-linecap="round" stroke-linejoin="round"/>`; }
    const note = verdict?.ok ? (verdict as { note?: string }).note : undefined;
    const reason = verdict && !verdict.ok ? verdict.reason : !verdict && overlap ? 'Occupied.' : cuts ? `Cuts ${cuts} belt${cuts > 1 ? 's' : ''}. They stay, dashed.` : '';
    if (cands.length > 1 && !reason) splices = -cands.length;
    if (note && /^Spliced/.test(note) && !reason) splices = Math.max(splices, 1);
    // where it lands, before the drop: the room it would sit in lights up; next to a wall but outside, say so
    const home = F.roomAt(this.s.canvas, tiles[0]!);
    const inHome = !!home && tiles.every((t) => F.roomAt(this.s.canvas, t)?.id === home.id);
    let place = '';
    if (inHome && home) under = `<path d="${groundRect(home.rect.x, home.rect.y, home.rect.x + home.rect.w, home.rect.y + home.rect.h, 0.02, 0.3)}" fill="${VIOLET}" fill-opacity=".08" stroke="${VIOLET}" stroke-width="2.2" stroke-opacity=".75"/>` + under;
    else {
      const near = this.s.canvas.rooms.find((r) => tiles.some((t) => t.x >= r.rect.x - 1 && t.x <= r.rect.x + r.rect.w && t.y >= r.rect.y - 1 && t.y <= r.rect.y + r.rect.h));
      if (near) place = 'Outside the room';
    }
    if (inHome && home && !reason) place = 'Inside the room';
    const top = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, 0.6);
    const tag = reason && !this.toastUp() ? this.tagSVG(top[0], top[1] - 14, reason, JAM)
      : completes && !this.toastUp() ? this.tagSVG(top[0], top[1] - 14, completes === 1 ? 'Completes the open belt' : `Completes ${completes} open belts`, INK.navy)
      : splices && !this.toastUp() ? this.tagSVG(top[0], top[1] - 14,
        splices < 0 ? `Touches ${-splices} belts. Splicing needs one.` : note && /^Spliced/.test(note) ? note : 'Splices into the belt', INK.navy)
      : place && !this.toastUp() ? this.tagSVG(top[0], top[1] - 14, place, place.startsWith('In') ? VIOLET : INK.navy) : '';
    this.L.under!.innerHTML = under;
    const ports = g.ports.map((p) => { const svg = portSVG({ m: '__ghost', port: p, edge: portEdge(p), out: [p.tile.x + 0.5, p.tile.y + 0.5], taken: true, kind: p.accepts[0] ?? 'eq' }, g); return svg.slice(0, svg.indexOf('<circle class="fl-hit"')) + '</g>'; }).join('');
    this.L.ghost!.innerHTML = `<g class="fl-ghostm${ok ? '' : ' is-bad'}">${belts}${ports}${machineSVG(g, this.cx)}${arrows}</g><g class="fl-preview"></g>${tag}`;
    // predicted output (shapez 2 operation preview), debounced: compile the would-be canvas
    clearTimeout(this.previewTimer);
    if (verdict?.ok && verdict.ids?.[0]) {
      const id = verdict.ids[0];
      this.previewTimer = window.setTimeout(() => this.predictOutput(verdict.canvas, id, top, key), 140);
    }
  }

  private async predictOutput(canvas: FF.Canvas, id: string, at: S2, key: string) {
    let out: ItemValue | undefined;
    try { const F = await import('../factory'); out = F.compile(canvas, this.s.ctx).machines[id]?.out; } catch { return; }
    if (!out || key !== this.ghostKey) return;
    const el = this.L.ghost!.querySelector('.fl-preview'); if (!el) return;
    const svg = out.k === 'term' ? termSVG(out.term, this.labels) : out.k === 'fact' ? factSVG(out.fact, this.labels) : factSVG(out.card, this.labels);
    el.innerHTML = `<g class="fl-altlab"><text x="${f1(at[0])}" y="${f1(at[1] - 22)}" text-anchor="middle" font-family="${FONT.math}" font-size="15" fill="${INK.navy}">${svg}</text></g>`;
  }

  private ghostBeltSVG(b: Belt, machines: Machine[], extra: Record<string, MGeo>): string {
    const portOf = (e: Endpoint) => {
      const g = extra[e.m] ?? this.geo?.ms.get(e.m);
      if (g) return g.ports.find((p) => p.id === e.port);
      const m = machines.find((x) => x.id === e.m);
      return m ? portsOf(m, this.s.ctx).find((p) => p.id === e.port) : undefined;
    };
    const fp = portOf(b.from), tp = b.to ? portOf(b.to) : undefined;
    let line: G2[] = [];
    if (!b.path.length && fp) { const [dx, dy] = faceVec(fp.face); const e = portEdge(fp); line = [[e[0] - dx * 0.22, e[1] - dy * 0.22], [e[0] + dx * 0.22, e[1] + dy * 0.22]]; }
    else {
      if (fp) line.push(...portEnd(fp, b.path[0], true));
      for (const t of b.path) line.push(centre(t));
      if (tp) line.push(...portEnd(tp, b.path[b.path.length - 1], false));
    }
    const fam = (extra[b.from.m] ?? this.geo?.ms.get(b.from.m))?.fam ?? 'equation';
    return `<g class="fl-ghostb">${beltBody({ kind: fp?.accepts[0] ?? 'eq', fam, line }, { ghost: true })}</g>`;
  }

  private tagSVG(x: number, y: number, text: string, ink: string): string {
    const w = Math.min(420, 22 + text.length * 6.1);
    return `<g class="fl-tag"><rect x="${f1(x - w / 2)}" y="${f1(y - 15)}" width="${f1(w)}" height="22" rx="11" fill="#fff" stroke="${ink}" stroke-width="1.2"/>` +
      `<text x="${f1(x)}" y="${f1(y)}" text-anchor="middle" font-family="${FONT.ui}" font-size="11.5" font-weight="500" fill="${ink === JAM ? JAM : INK.navy}">${esc(text)}</text></g>`;
  }

  /** Floor messages share the HUD's single toast channel (auto-expiring, never stacked). */
  private toastAt = 0;
  private toastUp() { return !!this.s.ui.toast && performance.now() - this.toastAt < 3000; }
  private say(text: string) { this.store.setUI({ toast: { text } }); }

  private renderGhostSoon() { this.ghostKey = ''; requestAnimationFrame(() => this.updateGhost()); }

  /** Flash the things an edit's refusal names (Edit.blockers), so the reason points at the floor. */
  private flashBlockers(ids: string[]) {
    for (const id of ids) {
      const els = [this.elByM.get(id), this.elByB.get(id), this.L.rooms!.querySelector(`[data-r="${CSS.escape(id)}"]`)].filter(Boolean) as Element[];
      for (const el of els) {
        el.classList.remove('is-blocker'); void (el as HTMLElement).getBoundingClientRect();
        el.classList.add('is-blocker');
        setTimeout(() => el.classList.remove('is-blocker'), 2400);
      }
    }
  }

  // ── belts ──

  private outKind(m: string, port: string): ItemKind {
    const pg = this.geo?.ports.find((p) => p.m === m && p.port.id === port);
    return pg?.kind ?? 'eq';
  }

  /** An output port (not of machine `skip`) whose hit point lies within reach of a CSS-px point. */
  private outPortNear(x: number, y: number, skip: string, reach = 26): PortGeo | null {
    if (!this.geo) return null;
    const cam = this.cam();
    let best: PortGeo | null = null, bd = reach;
    for (const pg of this.geo.ports) {
      if (pg.port.dir !== 'out' || pg.m === skip) continue;
      const pts = [P(pg.edge[0], pg.edge[1]), P(pg.out[0], pg.out[1])].map((q) => toScreen(cam, this.view, q));
      const d = Math.min(...pts.map((q) => Math.hypot(q[0] - x, q[1] - y)));
      if (d < bd) { bd = d; best = pg; }
    }
    return best;
  }
  /** An input port of another machine within reach of a CSS-px point (its edge or doorstep point). */
  private inPortNear(x: number, y: number, skip: string, reach = 22): PortGeo | null {
    if (!this.geo) return null;
    const cam = this.cam();
    let best: PortGeo | null = null, bd = reach;
    for (const pg of this.geo.ports) {
      if (pg.port.dir !== 'in' || pg.m === skip) continue;
      const pts = [P(pg.edge[0], pg.edge[1]), P(pg.out[0], pg.out[1])].map((q) => toScreen(cam, this.view, q));
      const d = Math.min(...pts.map((q) => Math.hypot(q[0] - x, q[1] - y)));
      if (d < bd) { bd = d; best = pg; }
    }
    return best;
  }

  private findSnap(kind: ItemKind, from: Endpoint): Snap | null {
    const geo = this.geo; if (!geo) return null;
    const cam = this.cam();
    let best: Snap | null = null, bd = Infinity;
    for (const pg of geo.ports) {
      if (pg.port.dir !== 'in' || pg.m === from.m) continue;
      const sp = toScreen(cam, this.view, P(pg.edge[0], pg.edge[1]));
      const so = toScreen(cam, this.view, P(pg.out[0], pg.out[1]));
      const d = Math.min(Math.hypot(sp[0] - this.pointer.x, sp[1] - this.pointer.y), Math.hypot(so[0] - this.pointer.x, so[1] - this.pointer.y));
      const compat = pg.port.accepts.includes(kind);
      const reach = compat && !pg.taken ? 54 : 20;
      // also snap when the pointer is over the machine body of a single-input machine
      if (d > reach) continue;
      const score = d - (compat ? 20 : 0) + (pg.taken ? 30 : 0);
      if (score < bd) { bd = score; best = { m: pg.m, port: pg.port.id, compat, pg }; }
    }
    if (!best && this.hoverTarget.k === 'machine') {
      const id = this.hoverTarget.id;
      // the nearest free inlet to the pointer (a 2×2 dock has one per side)
      const dist = (p: PortGeo) => { const q = toScreen(cam, this.view, P(p.out[0], p.out[1])); return Math.hypot(q[0] - this.pointer.x, q[1] - this.pointer.y); };
      const ins = geo.ports.filter((p) => p.m === id && p.port.dir === 'in' && p.m !== from.m).sort((p, q) => dist(p) - dist(q));
      const pick = ins.find((p) => !p.taken && p.port.accepts.includes(kind)) ?? ins.find((p) => !p.taken) ?? ins[0];
      if (pick) best = { m: id, port: pick.port.id, compat: pick.port.accepts.includes(kind), pg: pick };
    }
    return best;
  }

  private beltBlocked = (t: Tile) => !!this.geo && (this.geo.occ.has(tkey(t)) || this.geo.beltOcc.has(tkey(t)));

  /** Tile the belt leaves from: the output's front cell, or the trunk cell a branch was dragged off. */
  private beltStart(g: Extract<Gesture, { k: 'belt' }>): Tile | null {
    if (g.branchOf !== undefined && g.branchI !== undefined) return this.geo?.bs.get(g.branchOf)?.b.path[g.branchI] ?? null;
    if (g.extendOf !== undefined) { const p = this.geo?.bs.get(g.extendOf)?.b.path; return p?.[p.length - 1] ?? null; }
    const fp = this.geo?.ms.get(g.from.m)?.ports.find((p) => p.id === g.from.port);
    return fp ? portTileOut(fp) : null;
  }

  /** Presentation-only chain start → via… → end (BFS legs), used for unsnapped previews and branch previews. */
  private chain(start: Tile, via: Tile[], end: Tile): Tile[] | null {
    const out: Tile[] = [];
    let a = start;
    for (const w of [...via, end]) {
      const leg = fallbackRoute(this.beltBlocked, a, w);
      if (!leg) return null;
      out.push(...(out.length ? leg.slice(1) : leg));
      a = w;
    }
    return out;
  }

  private updateBeltGesture(force = false) {
    const g = this.g; if (g.k !== 'belt' || !this.geo) return;
    const snap = this.findSnap(g.kind, g.from);
    const start = this.beltStart(g);
    if (!start) return;
    let path: Tile[] | null = null, real = false, noRoute = false;
    let why: { reason: string; blockers: string[] } | undefined;
    let key: string;
    const viaKey = g.via.map((t) => `${t.x},${t.y}`).join(';');
    if (snap) {
      key = `s|${snap.m}|${snap.port}|${viaKey}`;
      if (key === g.key && !force) return this.renderBeltPreview();
      const end = portTileOut(snap.pg.port);
      if (g.extendOf !== undefined) {
        path = this.chain(start, g.via, end);
      } else if (g.branchOf === undefined && !g.via.length && this.s.canvas.machines.find((m) => m.id === snap.m)?.kind === 'socket') {
        // a dock's four inlets are one target: preview what the editor commits (it picks the inlet with the shortest
        // route), never the long way round to the inlet under the pointer (verify-fixround: P4.9, P10.2 ∀ → dock)
        const e = safe(() => F.connect(this.s.canvas, g.from, { m: snap.m, port: snap.port }, this.s.ctx), null);
        const nb = e?.ok ? e.canvas.belts.find((b) => !this.s.canvas.belts.some((x) => x.id === b.id) && b.from.m === g.from.m && b.to?.m === snap.m) : undefined;
        if (nb) { path = nb.path; real = false; }
        else if (e && !e.ok) { path = null; why = { reason: e.reason, blockers: e.blockers ?? [] }; }
        else path = this.chain(start, g.via, end);
      } else if (g.branchOf === undefined) {
        const r = tryRouteOrWhy(this.s.canvas, g.from, { m: snap.m, port: snap.port }, this.s.ctx, g.via);
        if (r === undefined) path = this.chain(start, g.via, end);
        else if ('path' in r) { path = r.path; real = true; }
        else { path = null; why = r; }
      } else {
        // branch: preview exactly what the editor would commit from that trunk cell
        const r = g.branchI !== undefined ? tryBranchAt(this.s.canvas, g.branchOf, g.branchI, { m: snap.m, port: snap.port }, this.s.ctx) : undefined;
        if (r === undefined) path = this.chain(start, [], end);
        else { path = r; real = true; }
      }
      noRoute = !path;
    } else {
      const t = this.pointerTile();
      key = `t|${t.x},${t.y}|${viaKey}`;
      if (key === g.key && !force) return this.renderBeltPreview();
      const ro = g.branchOf === undefined && !g.via.length ? tryRouteOpen(this.s.canvas, g.extendOf !== undefined ? { belt: g.extendOf } : g.from, t, this.s.ctx) : undefined;
      if (ro && 'path' in ro) {
        // an extension's route starts after the open end; show it from the end cell
        path = g.extendOf !== undefined ? [start, ...ro.path.filter((c) => !(c.x === start.x && c.y === start.y))] : ro.path;
        real = true;
      } else if (ro) { path = null; why = ro; }
      else path = this.beltBlocked(t) && !(t.x === start.x && t.y === start.y) ? null : this.chain(start, g.via, t);
    }
    this.g = { ...g, snap, path, real, noRoute, key, why };
    this.markPreviewBlockers(why?.blockers ?? []);
    this.renderBeltPreview();
  }

  /** While previewing, quietly outline what blocks the route (named by the editor). */
  private previewBlockers: string[] = [];
  private markPreviewBlockers(ids: string[]) {
    for (const id of this.previewBlockers) { this.elByM.get(id)?.classList.remove('is-blocking'); this.elByB.get(id)?.classList.remove('is-blocking'); }
    this.previewBlockers = ids;
    for (const id of ids) { this.elByM.get(id)?.classList.add('is-blocking'); this.elByB.get(id)?.classList.add('is-blocking'); }
  }

  /** Drop a waypoint at the pointer (click on empty floor while drawing, or C). */
  private anchor(): boolean {
    const g = this.g; if (g.k !== 'belt' || g.branchOf !== undefined) return false;
    const t = this.pointerTile();
    const last = g.via[g.via.length - 1] ?? this.beltStart(g);
    if (this.beltBlocked(t) || (last && last.x === t.x && last.y === t.y)) return false;
    this.g = { ...g, via: [...g.via, t], key: '' };
    this.updateBeltGesture(true);
    return true;
  }

  private renderBeltPreview() {
    const g = this.g; if (g.k !== 'belt' || !this.geo) return;
    const fromPort = this.geo.ms.get(g.from.m)?.ports.find((p) => p.id === g.from.port);
    let o = '';
    // glow every free compatible input
    for (const pg of this.geo.ports) {
      if (pg.port.dir !== 'in' || pg.taken || pg.m === g.from.m || !pg.port.accepts.includes(g.kind)) continue;
      const c = P(pg.edge[0], pg.edge[1]);
      o += `<circle class="fl-glow" cx="${f1(c[0])}" cy="${f1(c[1])}" r="11" fill="${OK}" fill-opacity=".18" stroke="${OK}" stroke-width="1.6"/>`;
    }
    const line: G2[] = [];
    if (fromPort && g.extendOf === undefined && (g.branchOf === undefined || g.real)) line.push(...portEnd(fromPort, g.path?.[0], true));
    for (const t of g.path ?? []) line.push(centre(t));
    if (g.snap && g.path) line.push(...portEnd(g.snap.pg.port, g.path[g.path.length - 1], false));
    for (const t of g.via) { const c = P(t.x + 0.5, t.y + 0.5); o += `<g class="fl-anchor"><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="5.5" fill="#fff" stroke="${INK.navy}" stroke-width="1.6"/><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="2" fill="${INK.navy}"/></g>`; }
    if (!g.path) {
      // no route: a straight dashed intent line
      const lt = g.via[g.via.length - 1];
      const a = lt ? P(lt.x + 0.5, lt.y + 0.5) : fromPort && g.branchOf === undefined ? P(...portEdge(fromPort)) : P(...g.startG);
      const b = g.snap ? P(...g.snap.pg.edge) : toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y);
      o += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${JAM}" stroke-width="2" stroke-dasharray="5 5"/>`;
      if ((g.snap || g.why) && !this.toastUp()) o += this.tagSVG(b[0], b[1] - 24, g.why?.reason || 'No free route.', JAM);
    } else if (line.length >= 2) {
      o += `<g class="fl-ghostb">${beltBody({ kind: g.kind, fam: g.fam, line }, { ghost: true })}</g>`;
      if (!g.snap && line.length >= 2) {
        // released here it stays an OPEN belt: preview its end cap
        const z = line[line.length - 1]!, a = line[line.length - 2]!;
        const dx = z[0] - a[0], dy = z[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const ext: G2[] = [...line, [z[0] + dx / l * 0.34, z[1] + dy / l * 0.34]];
        o += openEndSVG({ line: ext, b: { id: '__preview' } as Belt });
      }
    }
    if (g.snap) {
      const c = P(g.snap.pg.edge[0], g.snap.pg.edge[1]);
      const col = g.snap.compat ? INK.navy : JAM;
      o += `<circle class="fl-snapring" cx="${f1(c[0])}" cy="${f1(c[1])}" r="9" fill="#fff" stroke="${col}" stroke-width="2.4"/><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="3.4" fill="${col}"/>`;
      if (!g.snap.compat) o += this.tagSVG(c[0], c[1] - 26, `Takes ${kindWord(g.snap.pg.port.accepts)}, not ${kindWord([g.kind])}.`, JAM);
      else if (g.snap.pg.taken) o += this.tagSVG(c[0], c[1] - 26, 'Already fed.', JAM);
    }
    // source marker (the port, or the branch point on the trunk)
    const st = g.branchOf !== undefined ? this.beltStart(g) : null;
    const sm = st ? P(st.x + 0.5, st.y + 0.5) : fromPort ? P(...portEdge(fromPort)) : null;
    if (sm) o += `<circle cx="${f1(sm[0])}" cy="${f1(sm[1])}" r="${st ? 6.5 : 5}" fill="${INK.navy}"${st ? ` stroke="#fff" stroke-width="2"` : ''}/>`;
    this.L.under!.innerHTML = '';
    this.L.ghost!.innerHTML = o;
  }

  private renderMovePreview() {
    const g = this.g; if (g.k !== 'move' || !this.geo) return;
    const key = `move|${g.delta.x},${g.delta.y}`;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    let under = '', ghost = '';
    const ok = g.ok !== false;
    for (const id of g.ids) {
      const room = this.s.canvas.rooms.find((r) => r.id === id);
      if (room) { ghost += roomSVG({ ...room, id: '__ghost', rect: { ...room.rect, x: room.rect.x + g.delta.x, y: room.rect.y + g.delta.y } }, this.labels, true); continue; }
      const mg = this.geo.ms.get(id); if (!mg) continue;
      const m: Machine = { ...mg.m, at: { x: mg.m.at.x + g.delta.x, y: mg.m.at.y + g.delta.y } };
      const tiles = mg.tiles.map((t) => ({ x: t.x + g.delta.x, y: t.y + g.delta.y }));
      const moved: MGeo = { ...mg, m, tiles, x0: mg.x0 + g.delta.x, x1: mg.x1 + g.delta.x, y0: mg.y0 + g.delta.y, y1: mg.y1 + g.delta.y, ports: mg.ports.map((p) => ({ ...p, tile: { x: p.tile.x + g.delta.x, y: p.tile.y + g.delta.y } })) };
      for (const t of tiles) under += `<path d="${groundRect(t.x, t.y, t.x + 1, t.y + 1, 0.05, 0.12)}" fill="${ok ? OK : 'url(#fl-bad)'}" opacity="${ok ? 0.2 : 1}"/>`;
      ghost += machineSVG(moved, this.cx);
    }
    // where it lands: the room it would sit in lights up (the same cue as placing)
    const movedTiles = g.ids.flatMap((id) => (this.geo!.ms.get(id)?.tiles ?? []).map((t) => ({ x: t.x + g.delta.x, y: t.y + g.delta.y })));
    const home = movedTiles.length ? F.roomAt(this.s.canvas, movedTiles[0]!) : null;
    if (home && !g.ids.includes(home.id) && movedTiles.every((t) => F.roomAt(this.s.canvas, t)?.id === home.id))
      under = `<path d="${groundRect(home.rect.x, home.rect.y, home.rect.x + home.rect.w, home.rect.y + home.rect.h, 0.02, 0.3)}" fill="${VIOLET}" fill-opacity=".08" stroke="${VIOLET}" stroke-width="2.2" stroke-opacity=".75"/>` + under;
    this.L.under!.innerHTML = under;
    this.L.ghost!.innerHTML = `<g class="fl-ghostm${ok ? '' : ' is-bad'}">${ghost}</g>` + (g.reason && !this.toastUp() ? (() => { const w = toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y); return this.tagSVG(w[0], w[1] - 30, g.reason!, JAM); })() : '');
    for (const id of g.ids) this.elByM.get(id)?.classList.add('is-moving');
  }

  /**
   * The room a drag paints (roomdrag.ts): sized to the drag — its diamond fills the dragged screen rectangle rather
   * than circumscribing it — and centred on it. Then it cooperates with the floor without overgrowing: it stops
   * short of a dock, a given or another room it would cut, and takes in a machine only when most of it is inside.
   * The drag is clamped above the hotbar, so the room (and its gate) stays on screen. `note` says what it did.
   */
  private roomDrag(g: Extract<Gesture, { k: 'room' }>): { rect: Rect; note: string } {
    const area = this.safeArea();
    const cl = (x: number, y: number): [number, number] => [Math.min(Math.max(x, area.left), area.right), Math.min(Math.max(y, area.top), area.bottom)];
    const gAt = (x: number, y: number) => gridOf(toWorld(this.cam(), this.view, ...cl(x, y))) as [number, number];
    const st = g.start;
    let rect: Rect;
    let note = '';
    if (Math.hypot(g.cx - g.sx, g.cy - g.sy) < 8) {
      // a click (no drag) paints a room sized for its desks and a working factory: 8 × 7 for one assumption, +1 each more
      const k = Math.max(1, this.roomSpec()?.assumes?.length ?? 1);
      const w = 7 + k, h = 6 + k;
      rect = { x: st.x - Math.floor(w / 2), y: st.y - Math.floor(h / 2), w, h };
      note = 'Click for this room, or drag to size it.';
    } else rect = dragRoomRect(gAt(g.sx, g.sy), gAt(g.cx, g.cy));
    const boxes: Box[] = this.s.canvas.machines.filter((m) => m.kind !== 'desk' && m.kind !== 'gate').map((m) => {
      const fp = footprint(m, this.s.ctx);
      const fixed = m.config.kind === 'socket' || m.config.kind === 'given' || m.kind === 'socket' || m.kind === 'given';
      return { x0: Math.min(...fp.map((t) => t.x)), x1: Math.max(...fp.map((t) => t.x)) + 1, y0: Math.min(...fp.map((t) => t.y)), y1: Math.max(...fp.map((t) => t.y)) + 1,
        kind: fixed ? 'fixed' as const : 'machine' as const, what: m.config.kind === 'given' || m.kind === 'given' ? 'given' : 'dock' };
    });
    for (const r of this.s.canvas.rooms) boxes.push({ x0: r.rect.x, x1: r.rect.x + r.rect.w, y0: r.rect.y, y1: r.rect.y + r.rect.h, kind: 'room' });
    // a dock's DELIVER line and a given's formula stay readable: the room stops short of them as of the dock itself
    for (const k of safe(() => F.labelCells(this.s.canvas, this.s.ctx), new Set<string>())) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      boxes.push({ x0: x, x1: x + 1, y0: y, y1: y + 1, kind: 'fixed', what: 'dock’s label' });
    }
    const anchor = { x: rect.x + Math.floor(rect.w / 2), y: rect.y + Math.floor(rect.h / 2) };
    const fit = fitRoom(rect, anchor, boxes);
    return { rect: fit.rect, note: fit.note || note };
  }

  /** The floor's clear area in its own CSS px (above the hotbar), and the HUD panels over the floor. */
  private safeArea(): { left: number; top: number; right: number; bottom: number; panels: DOMRect[] } {
    const host = this.root.getBoundingClientRect();
    const rel = (q: string) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r && r.width > 0 ? new DOMRect(r.left - host.left, r.top - host.top, r.width, r.height) : null; };
    const bar = rel('.h3-hotbar');
    const panels = [rel('.h3-order'), rel('.h3-run'), bar].filter((r): r is DOMRect => !!r);
    const bottom = bar && bar.top > this.view.h / 2 ? bar.top - 10 : this.view.h - 10;
    return { left: 10, top: 10, right: this.view.w - 10, bottom, panels };
  }

  private renderRoomPreview() {
    const g = this.g;
    if (g.k === 'room') {
      const { rect, note } = this.roomDrag(g);
      const tool = this.s.ui.tool;
      const kind = tool.k === 'room' ? tool.kind : 'suppose';
      const spec = this.roomSpec();
      this.L.ghost!.innerHTML = roomSVG({ id: '__ghost', kind, rel: spec?.rel, l: spec?.l ?? null, r: spec?.r ?? null, rect, assumes: spec?.assumes }, this.labels, true);
      // say, before the release, what the release will do: the size, and any refusal in the editor's words
      const small = rect.w < MIN_ROOM || rect.h < MIN_ROOM;
      const verdict = small || !spec ? null : safe(() => F.paintRoom(this.s.canvas, rect, kind, spec.l, spec.r, this.s.ctx, spec.rel, spec.assumes && (spec.assumes.length > 1 || spec.assumes.some((a) => a.rel === 'mem')) ? spec.assumes : undefined), null);
      const why = small ? TOO_SMALL : !spec ? "Pick the room's assumption first." : verdict && !verdict.ok ? verdict.reason : note;
      const bad = small || !spec || (!!verdict && !verdict.ok);
      const top = P(rect.x + rect.w / 2, rect.y + rect.h / 2);
      const pt = toWorld(this.cam(), this.view, g.cx, g.cy);
      const label = `${rect.w} × ${rect.h}${why ? ` · ${why}` : ''}`;
      this.L.ghost!.innerHTML += this.tagSVG(pt[0], pt[1] - 26, label, bad ? JAM : INK.navy);
      void top;
      this.L.under!.innerHTML = '';
    } else if (g.k === 'resize') {
      const room = this.s.canvas.rooms.find((r) => r.id === g.id); if (!room) return;
      this.L.ghost!.innerHTML = roomSVG({ ...room, id: '__ghost', rect: g.rect }, this.labels, true);
      this.renderHandles();
    }
  }

  private roomSpec(): { l: import('../kernel/types').Term; r: import('../kernel/types').Term; rel?: 'eq' | 'neq'; assumes?: import('../kernel/types').DeskAssumption[] } | null {
    const ui = this.s.ui as FUI;
    const tl = ui.tool as { k: string; l?: import('../kernel/types').Term; r?: import('../kernel/types').Term; rel?: 'eq' | 'neq'; assumes?: import('../kernel/types').DeskAssumption[] };
    if (tl.k === 'room' && tl.l && tl.r) return { l: tl.l, r: tl.r, rel: tl.rel ?? ui.roomSpec?.rel, assumes: tl.assumes ?? ui.roomSpec?.assumes };
    if (ui.roomSpec) return ui.roomSpec;
    // the goal chip's preset: a suppose room for a ≠ target, a classical room for an = target
    const tool = ui.tool;
    const kind = tool.k === 'room' ? tool.kind : 'suppose';
    const t = this.s.level.sockets.map((s) => s.target).find((p) => (kind === 'suppose' ? p.k === 'neq' : p.k === 'eq'));
    return t && (t.k === 'eq' || t.k === 'neq') ? { l: t.l, r: t.r } : null;
  }

  private clearPreview() {
    this.markPreviewBlockers([]);
    this.L.ghost!.innerHTML = ''; this.L.under!.innerHTML = ''; this.ghostKey = '';
    for (const el of this.elByM.values()) el.classList.remove('is-moving');
  }

  // ───────────────────────────── tooltip ─────────────────────────────

  private updateTip() {
    clearTimeout(this.tipTimer);
    const t = this.hoverTarget;
    if (this.g.k !== 'none' && this.g.k !== 'press' || t.k === 'floor' || t.k === 'rh' || !this.pointer.inside) { this.tip.classList.remove('is-on'); return; }
    // one voice at a time: while placing, the ghost speaks; while a toast is up, it does
    const html = this.toastUp() || this.s.ui.tool.k === 'place' || this.s.ui.tool.k === 'room' ? '' : this.tipHTML(t);
    if (!html) { this.tip.classList.remove('is-on'); return; }
    this.tip.innerHTML = html;
    this.placeTip();
    this.tipTimer = window.setTimeout(() => this.tip.classList.add('is-on'), this.tip.classList.contains('is-on') ? 0 : 140);
  }
  private refreshTip() {
    const html = this.toastUp() ? '' : this.tipHTML(this.hoverTarget);
    if (!html) { this.hideTip(); return; }
    if (html !== this.tipLast) { this.tip.innerHTML = html; this.tipLast = html; this.placeTip(); }
  }
  private tipLast = '';
  private hideTip() { clearTimeout(this.tipTimer); this.tip.classList.remove('is-on'); }
  private placeTip() {
    const r = this.tip.getBoundingClientRect();
    let x = this.pointer.x + 16, y = this.pointer.y + 20;
    if (x + r.width > this.view.w - 8) x = this.pointer.x - r.width - 12;
    if (y + r.height > this.view.h - 8) y = this.pointer.y - r.height - 14;
    // never over the HUD lens: try the other side, else stay hidden
    const lens = document.querySelector('.h3-lens:not([hidden])')?.getBoundingClientRect();
    if (lens) {
      const host = this.root.getBoundingClientRect();
      const hit = (xx: number, yy: number) => xx + host.left < lens.right && xx + host.left + r.width > lens.left && yy + host.top < lens.bottom && yy + host.top + r.height > lens.top;
      if (hit(x, y)) { const y2 = this.pointer.y - r.height - 14; const x2 = this.pointer.x - r.width - 12; if (!hit(x, y2)) y = y2; else if (!hit(x2, y)) x = x2; else { this.tip.classList.remove('is-on'); this.tip.style.visibility = 'hidden'; return; } }
    }
    this.tip.style.visibility = '';
    this.tip.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }

  private valueHTML(v: ItemValue): string {
    const html = v.k === 'term' ? termHTML(v.term, this.labels) : v.k === 'fact' ? factHTML(v.fact, this.labels) : factHTML(v.card, this.labels);
    return subHTML(html);
  }

  private tipHTML(t: Target): string {
    const geo = this.geo; if (!geo) return '';
    const comp = this.s.compiled ?? null, run = this.s.run ?? null;
    if (t.k === 'machine') {
      if (this.s.ui.lens === t.id) return ''; // the HUD lens already says it
      const g = geo.ms.get(t.id); if (!g) return '';
      if (g.m.config.kind === 'tower') {
        const users = [...geo.ms.keys()].filter((id) => id !== g.m.id && this.machineVars(id).has((g.m.config as { varId: string }).varId)).length;
        void users;
        const isZ = g.m.config.sort === 'Z';
        const nm = subHTML(`<i>${esc(g.m.config.label.replace(/[₀-₉]+$/, ''))}</i>${g.m.config.label.replace(/^[^₀-₉]+/, '')}`);
        return `<div class="fl-tip-h">Tower</div><div class="fl-tip-math math">Let ${nm} ∈ ${isZ ? 'ℤ' : '<i>G</i>'}</div>` +
          `<div class="fl-tip-why"><b>${nm} can be ${isZ ? 'any integer' : 'anything'}.</b> Prove it for ${nm}, and ∀ makes it true for all.</div>`;
      }
      const name = machineName(g, this.cx);
      if (g.m.kind === 'socket') {
        const target = socketTarget(g.m, this.s.level);
        const sid = g.m.config.kind === 'socket' ? g.m.config.socketId : '';
        const so = comp?.sockets[sid];
        const done = run?.delivered[sid] !== undefined;
        const ins = comp?.machines[g.m.id]?.inputs ?? {};
        const arriving = ins.q ?? ins.qn ?? ins.qe ?? ins.qs; // any of the dock's four inlets
        return `<div class="fl-tip-h">Dock${done ? ' <span class="fl-tip-st is-working">delivered</span>' : ''}</div>` +
          (target ? `<div class="fl-tip-row"><span class="fl-tip-k">wants</span><span class="math">${(() => {
            const sk = this.s.level.sockets.find((x) => x.id === sid);
            // an open dock wants its shape (`d = ?`); once delivered, it shows the answer it accepted
            if (sk?.holes?.length) return esc(K.dockText(sk, this.labels, done && comp && run ? F.dockAnswer(comp, run, sid)?.holes : undefined));
            return factHTML(target, this.labels);
          })()}</span></div>` : '') +
          (arriving ? `<div class="fl-tip-row"><span class="fl-tip-k">arriving</span><span class="math">${this.valueHTML(arriving)}</span></div>` : '') +
          (so && !so.ok && so.reason ? `<div class="fl-tip-why is-jam">${richHTML(so.reason, this.s.level)}</div>` : '');
      }
      const st = comp?.machines[g.m.id]?.status;
      const live = liveStatusOf(g.m.id, run, comp);
      const out = comp?.machines[g.m.id]?.out;
      const phrase = live === 'working' ? 'Working' : live === 'blocked' ? 'Output full' : live === 'jammed' ? 'Jammed' : live === 'starved' ? 'Waiting' : st?.k === 'ok' ? 'Ready' : '';
      // say only what the player can act on: jams, and waits that aren't just an empty port (the port shows that)
      const quietWait = (r: string) => /^(not connected|waiting)/i.test(r);
      const reason = st?.k === 'jammed' ? st.reason : st?.k === 'starved' && !quietWait(st.reason) ? st.reason : live === 'blocked' && !this.s.canvas.belts.some((b) => b.from.m === g.m.id) ? 'Connect its output.' : ''; // only an output with no belt at all
      return `<div class="fl-tip-h">${capsHTML(name)}${phrase ? ` <span class="fl-tip-st is-${live ?? 'ok'}">${phrase}</span>` : ''}</div>` +
        (reason ? `<div class="fl-tip-why${st?.k === 'jammed' ? ' is-jam' : ''}">${richHTML(reason, this.s.level)}</div>` : '') +
        (out ? `<div class="fl-tip-row"><span class="fl-tip-k">makes</span><span class="math">${this.valueHTML(out)}</span></div>` : '') +
        (g.m.kind === 'gate' ? `<div class="fl-tip-foot">Drag to slide along the wall.</div>`
          : g.m.kind === 'desk' ? `<div class="fl-tip-foot">Drag to move inside the room.</div>`
          : g.m.locked ? `<div class="fl-tip-foot">Part of the order.</div>` : '');
    }
    if (t.k === 'belt') {
      const bg = geo.bs.get(t.id); if (!bg) return '';
      const v = comp?.machines[bg.b.from.m]?.out;
      if (bg.broken) return `<div class="fl-tip-h">Broken belt</div><div class="fl-tip-why is-jam">${esc(bg.broken)}</div><div class="fl-tip-foot">Re-drag it, or move the blocker.</div>`;
      const err = comp?.beltErrors[t.id];
      const src = geo.ms.get(bg.b.from.m);
      void src;
      return `<div class="fl-tip-h">${bg.open ? 'Open belt' : `${kindWord([bg.kind], true)} belt`}</div>` +
        (v ? `<div class="fl-tip-math math">${this.valueHTML(v)}</div>` : '') +
        (err ? `<div class="fl-tip-why is-jam">${esc(err)}</div>` : '') + `<div class="fl-tip-foot">${bg.open ? 'Drag its end to an input.' : 'Drag off it to branch.'}</div>`;
    }
    if (t.k === 'port') {
      const pg = geo.ports.find((p) => p.m === t.m && p.port.id === t.port); if (!pg) return '';
      const cur = comp?.machines[t.m]?.inputs[t.port];
      if (pg.port.dir === 'out') {
        const out = comp?.machines[t.m]?.out;
        return `<div class="fl-tip-h">Output</div>` + (out ? `<div class="fl-tip-math math">${this.valueHTML(out)}</div>` : '') + `<div class="fl-tip-foot">Drag to lay a belt.</div>`;
      }
      const role = pg.port.role === 'rule' ? 'Rule slot' : pg.port.role === 'param' ? `Parameter ${esc(pg.port.label)}` : pg.port.role === 'premise' ? `Premise ${esc(pg.port.label)}` : 'Input';
      return `<div class="fl-tip-h">${role} <span class="fl-tip-k">takes ${kindWord(pg.port.accepts)}</span></div>` + (cur ? `<div class="fl-tip-math math">${this.valueHTML(cur)}</div>` : '');
    }
    if (t.k === 'room') {
      const r = this.s.canvas.rooms.find((x) => x.id === t.id); if (!r) return '';
      const L0 = subHTML(termHTML(r.l, this.labels)), R0 = subHTML(termHTML(r.r, this.labels));
      const eqs = `${L0} = ${R0}`, neqs = `${L0} ≠ ${R0}`;
      const a = r.kind === 'assume' ? (r.rel === 'neq' ? neqs : eqs) : r.kind === 'suppose' ? eqs : neqs;
      const x = r.kind === 'assume' ? `${a} ⟹ <i>Q</i>` : r.kind === 'suppose' ? neqs : eqs;
      return `<div class="fl-tip-h">${r.kind === 'assume' ? 'Assume room' : 'Room'}</div><div class="fl-tip-row"><span class="fl-tip-k">assumes</span><span class="math">${a}</span></div><div class="fl-tip-row"><span class="fl-tip-k">exports</span><span class="math">${x}</span></div><div class="fl-tip-foot">Facts leave only by the gate. Click the room's floor to select it; ⌫ deletes it.</div>`;
    }
    return '';
  }

  // ───────────────────────────── input ─────────────────────────────

  private targetOf(e: Event): Target {
    const base = this.domTarget(e);
    if (base.k === 'rh' || base.k === 'bend' || !this.geo || !('clientX' in e)) return base;
    const me = e as MouseEvent;
    // the machine actually under the pointer (port hit circles sit above machines, so look beneath them)
    let under: string | null = null;
    for (const el of document.elementsFromPoint(me.clientX, me.clientY)) {
      const m = (el as Element).closest?.('.fl-l-machines [data-m]') as HTMLElement | null;
      if (m) { under = m.dataset.m ?? null; break; }
    }
    const pt = this.local(me);
    const cam = this.cam();
    // port hit areas sit just OUTSIDE the body and scale with zoom (never larger than ~0.4 tile on screen),
    // so at far zoom a click on a machine's body selects it rather than starting a belt
    const tile = Math.hypot(42, 21) * cam.zoom;
    const R = Math.min(16, Math.max(6, 0.4 * tile));
    let best: PortGeo | null = null, bs = Infinity, bd = Infinity;
    for (const pg of this.geo.ports) {
      const d = faceVec(pg.port.face);
      const c = toScreen(cam, this.view, P(pg.edge[0] + d[0] * 0.3, pg.edge[1] + d[1] * 0.3));
      const dist = Math.hypot(c[0] - pt.x, c[1] - pt.y);
      if (dist > R) continue;
      const score = dist - (pg.m === under ? 4 : 0) - (pg.port.dir === 'out' ? 3 : 0);
      if (score < bs) { bs = score; best = pg; bd = dist; }
    }
    // pressing on a body: only a port right under the pointer wins over the body itself
    if (best && under && bd > R * 0.55) best = null;
    if (best) return { k: 'port', m: best.m, port: best.port.id };
    if (base.k === 'port') return under ? { k: 'machine', id: under } : { k: 'floor' };
    if (base.k === 'machine' && under && under !== base.id) return { k: 'machine', id: under };
    return base;
  }

  private domTarget(e: Event): Target {
    const el = (e.target as Element | null)?.closest?.('[data-bend],[data-p],[data-rh],[data-m],[data-b],[data-rhead],[data-r]') as HTMLElement | null;
    if (!el) return { k: 'floor' };
    const d = el.dataset;
    if (d.bend) return { k: 'bend', id: d.bend };
    if (d.p) { const [m, port] = d.p.split('|'); if (m === '__ghost') return { k: 'floor' }; return { k: 'port', m: m!, port: port! }; }
    if (d.rh) { const [id, h] = d.rh.split('|'); return { k: 'rh', id: id!, h: h! }; }
    if (d.m) return d.m === '__ghost' ? { k: 'floor' } : { k: 'machine', id: d.m };
    if (d.b) return { k: 'belt', id: d.b };
    if (d.rhead) return { k: 'room', id: d.rhead };
    return { k: 'floor' }; // room interior is floor (buildable); select a room by its heading
  }

  private local(e: PointerEvent | WheelEvent | MouseEvent) { const r = this.root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  private setHoverFrom(t: Target) {
    this.hoverTarget = t;
    const h: FUI['hover'] = t.k === 'machine' ? { k: 'machine', id: t.id } : t.k === 'belt' ? { k: 'belt', id: t.id } : t.k === 'port' ? { k: 'port', id: t.m, port: t.port } : t.k === 'room' ? { k: 'room', id: t.id } : null;
    this.store.setHover(h);
    this.root.dataset.over = t.k;
    if (t.k === 'port') { const pg = this.geo?.ports.find((p) => p.m === t.m && p.port.id === t.port); this.root.dataset.over = pg?.port.dir === 'out' ? 'port-out' : 'port-in'; }
  }

  private bindInput() {
    const r = this.root;
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => { r.addEventListener(t, f as EventListener, o); this.unsub.push(() => r.removeEventListener(t, f as EventListener)); };
    const onW = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) => { window.addEventListener(t, f as EventListener); this.unsub.push(() => window.removeEventListener(t, f as EventListener)); };

    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', () => { this.g = { k: 'none' }; this.root.classList.remove('is-belting', 'is-moving', 'is-panning'); this.clearPreview(); });
    // round 2 (P4.1): a drag whose release never reaches the floor (the ceremony opened over it mid-drag) must not leave
    // its ghost belt trailing the pointer: losing the pointer ends the gesture (a click-click belt waits on purpose)
    on('lostpointercapture', () => {
      const g0 = this.g;
      if (g0.k === 'none' || g0.k === 'press' || (g0.k === 'belt' && g0.click)) return;
      // deferred: a normal release ends the gesture itself first (this.g changes); only an orphaned one is cancelled
      setTimeout(() => { if (this.g !== g0) return; if (!this.cancel()) this.g = { k: 'none' }; this.root.classList.remove('is-panning', 'is-belting', 'is-moving'); }, 0);
    });
    on('pointerleave', () => { this.pointer.inside = false; if (this.g.k === 'none') { this.setHoverFrom({ k: 'floor' }); this.updateGhost(); } this.updateTip(); });
    on('pointerenter', () => { this.pointer.inside = true; });
    on('contextmenu', (e) => { e.preventDefault(); });
    on('wheel', (e) => this.wheel(e), { passive: false });
    onW('keydown', (e) => this.key(e, true));
    onW('keyup', (e) => this.key(e, false));
    onW('blur', () => { this.space = false; this.root.classList.remove('is-space'); if (this.altHeld) { this.store.toggleAlt(this.altHeld.was); this.altHeld = null; } });
    // Safari pinch
    on('gesturestart' as keyof HTMLElementEventMap, (e) => e.preventDefault());
  }

  private down(e: PointerEvent) {
    const p = this.local(e);
    this.pointer = { x: p.x, y: p.y, inside: true };
    this.root.focus({ preventScroll: true });
    const t = this.targetOf(e);
    PERF.down = { t, tool: this.s.ui.tool.k, g: this.g.k, el: ((e.target as Element | null)?.getAttribute?.('class') ?? (e.target as Element | null)?.tagName) };
    const tool = this.s.ui.tool;
    // right button: cancel
    if (e.button === 2) { this.cancel(true); return; }
    if (e.button === 1 || this.space) { this.startPan(e, p); return; }
    if (e.button !== 0) return;
    const rdel = (e.target as Element | null)?.closest?.('[data-rdel]') as HTMLElement | null;
    if (rdel && e.button === 0) {
      const id = rdel.dataset.rdel!;
      e.preventDefault();
      this.timed('remove', e, () => this.store.remove([id]));
      this.store.select([]);
      return;
    }
    const badge = (e.target as Element | null)?.closest?.('[data-badge]') as HTMLElement | null;
    if (badge && e.button === 0) {
      const id = badge.dataset.badge!;
      this.store.select([id]); this.store.setUI({ lens: id, lensFocus: 'save' } as Partial<FUI>);
      e.preventDefault(); return;
    }
    // click-click belt: second click
    if (this.g.k === 'belt' && this.g.click) {
      this.updateBeltGesture();
      this.finishBelt(e);
      return;
    }
    if (tool.k === 'erase' || this.isOutPort(t)) { this.g = { k: 'press', x: p.x, y: p.y, target: t, shift: e.shiftKey }; r(this.root, e); return; }
    // a selected room's edge is a handle along its whole length
    if ((tool.k === 'select' || tool.k === 'room') && t.k !== 'port' && t.k !== 'machine' && t.k !== 'rh') {
      const edge = this.roomEdgeAt();
      if (edge) return this.startResize(edge, e);
    }
    if (tool.k === 'room') {
      if (t.k === 'rh') return this.startResize(t, e);
      const tl = this.pointerTile();
      this.g = { k: 'room', start: tl, cur: tl, sx: p.x, sy: p.y, cx: p.x, cy: p.y };
      r(this.root, e); this.updateGhost(); return;
    }
    if (tool.k === 'place') { this.g = { k: 'press', x: p.x, y: p.y, target: t, shift: e.shiftKey }; r(this.root, e); return; }
    if (t.k === 'rh') return this.startResize(t, e);
    this.g = { k: 'press', x: p.x, y: p.y, target: t, shift: e.shiftKey };
    r(this.root, e);
    function r(el: HTMLElement, ev: PointerEvent) { try { el.setPointerCapture(ev.pointerId); } catch { /* ignore */ } }
  }

  private isOutPort(t: Target): boolean {
    return t.k === 'port' && !!this.geo?.ports.find((p) => p.m === t.m && p.port.id === t.port && p.port.dir === 'out');
  }

  private startPan(e: PointerEvent, p: { x: number; y: number }) {
    const c = this.cam();
    this.g = { k: 'pan', x: p.x, y: p.y, cam: { ...c } };
    this.root.classList.add('is-panning');
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  /** A selected room's edge under the pointer (any point along it, not only its handle): drag it to resize. */
  private roomEdgeAt(): { id: string; h: string } | null {
    const ui = this.s.ui;
    const [gx, gy] = this.pointerGrid();
    const tol = 0.32;
    for (const r of this.s.canvas.rooms) {
      if (!ui.selection.includes(r.id) && ui.tool.k !== 'room') continue;
      const R = r.rect;
      const inY = gy > R.y - tol && gy < R.y + R.h + tol, inX = gx > R.x - tol && gx < R.x + R.w + tol;
      if (inY && Math.abs(gx - R.x) < tol) return { id: r.id, h: 'w' };
      if (inY && Math.abs(gx - (R.x + R.w)) < tol) return { id: r.id, h: 'e' };
      if (inX && Math.abs(gy - R.y) < tol) return { id: r.id, h: 'n' };
      if (inX && Math.abs(gy - (R.y + R.h)) < tol) return { id: r.id, h: 's' };
    }
    return null;
  }

  private startResize(t: { id: string; h: string }, e: PointerEvent) {
    const room = this.s.canvas.rooms.find((x) => x.id === t.id); if (!room) return;
    this.g = { k: 'resize', id: t.id, h: t.h, rect0: room.rect, rect: room.rect };
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  private move(e: PointerEvent) {
    const p = this.local(e);
    this.pointer = { x: p.x, y: p.y, inside: true };
    const g = this.g;
    switch (g.k) {
      case 'pan': {
        const z = g.cam.zoom;
        this.setCam({ x: g.cam.x - (p.x - g.x) / z, y: g.cam.y - (p.y - g.y) / z, zoom: z });
        return;
      }
      case 'press': {
        if (Math.hypot(p.x - g.x, p.y - g.y) < DRAG) break;
        this.beginDrag(g, e);
        return;
      }
      case 'box': {
        this.g = { ...g, x1: p.x, y1: p.y };
        const x = Math.min(g.x0, p.x), y = Math.min(g.y0, p.y);
        this.boxEl.setAttribute('x', f1(x)); this.boxEl.setAttribute('y', f1(y));
        this.boxEl.setAttribute('width', f1(Math.abs(p.x - g.x0))); this.boxEl.setAttribute('height', f1(Math.abs(p.y - g.y0)));
        return;
      }
      case 'move': {
        const t = this.pointerTile();
        let delta = { x: t.x - g.start.x, y: t.y - g.start.y };
        // one machine dragged near a wall lands where the pointer is: wholly inside or wholly outside (never across)
        const one = g.ids.length === 1 ? this.geo?.ms.get(g.ids[0]!) : undefined;
        if (one && one.m.kind !== 'desk' && one.m.kind !== 'gate') {
          const tgt = { x: one.x0 + delta.x, y: one.y0 + delta.y };
          const snapped = this.snapToRooms(tgt, one.x1 - one.x0, one.y1 - one.y0, t);
          delta = { x: delta.x + snapped.x - tgt.x, y: delta.y + snapped.y - tgt.y };
        }
        if (delta.x !== g.delta.x || delta.y !== g.delta.y) {
          const v = delta.x || delta.y ? tryMove(this.s.canvas, g.ids, delta, this.s.ctx) : null;
          let reason = v && !v.ok ? v.reason : undefined;
          if (v?.ok) { const cut = this.s.canvas.belts.filter((b) => !b.broken && (!v.canvas.belts.find((x) => x.id === b.id) || v.canvas.belts.find((x) => x.id === b.id)?.broken)).length; if (cut) reason = `Cuts ${cut} belt${cut > 1 ? 's' : ''}. They stay, dashed.`; }
          this.g = { ...g, delta, ok: v ? (v.ok && !reason ? true : v.ok ? null : false) : null, reason };
          this.updateGhost();
        }
        return;
      }
      case 'belt': { this.setHoverFrom(this.targetOf(e)); this.updateBeltGesture(); this.updateGhost(); return; }
      case 'rbelt': {
        const pg = this.geo?.ports.find((q) => q.m === g.to.m && q.port.id === g.to.port);
        if (pg) {
          const a = P(pg.edge[0], pg.edge[1]), b = toWorld(this.cam(), this.view, p.x, p.y);
          const near = this.outPortNear(p.x, p.y, g.to.m);
          const c = near ? P(near.edge[0], near.edge[1]) : b;
          this.L.ghost!.innerHTML = `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(c[0])}" y2="${f1(c[1])}" stroke="${INK.navy}" stroke-width="2.4" stroke-dasharray="5 4" stroke-linecap="round" opacity=".55"/>`;
        }
        return;
      }
      case 'room': {
        const t = this.pointerTile();
        const was = this.roomDrag(g).rect;
        this.g = { ...g, cur: t, cx: p.x, cy: p.y };
        if (JSON.stringify(this.roomDrag(this.g as typeof g).rect) !== JSON.stringify(was)) this.updateGhost();
        return;
      }
      case 'resize': {
        const gp = this.pointerGrid();
        const rect = resizeRect(g.rect0, g.h, gp);
        if (JSON.stringify(rect) !== JSON.stringify(g.rect)) { this.g = { ...g, rect }; this.updateGhost(); }
        return;
      }
    }
    // idle hover
    const t = this.targetOf(e);
    this.setHoverFrom(t);
    if (t.k !== 'port' && t.k !== 'machine') { const edge = this.roomEdgeAt(); if (edge) this.root.dataset.over = edge.h === 'w' || edge.h === 'e' ? 'redge-x' : 'redge-y'; }
    this.updateGhost();
    this.updateTip();
    if (this.tip.classList.contains('is-on')) this.placeTip();
  }

  private beginDrag(g: Extract<Gesture, { k: 'press' }>, e: PointerEvent) {
    const tool = this.s.ui.tool;
    const t = g.target;
    PERF.drag = { t, tool: tool.k };
    this.hideTip();
    if (t.k === 'port' && this.isOutPort(t)) { this.startBelt({ m: t.m, port: t.port }, undefined, false); this.updateBeltGesture(); this.updateGhost(); return; }
    if (t.k === 'bend') {
      const bg = this.geo?.bs.get(t.id);
      if (bg) { this.startBelt(bg.b.from, undefined, false); if (this.g.k === 'belt') this.g = { ...this.g, extendOf: t.id }; this.updateBeltGesture(true); this.updateGhost(); return; }
    }
    if (tool.k === 'place' || tool.k === 'erase') {
      // drag on floor with a placing tool pans (the hand)
      this.startPan(e, { x: g.x, y: g.y });
      return;
    }
    if (t.k === 'port') {
      const pg = this.geo?.ports.find((p) => p.m === t.m && p.port.id === t.port);
      if (pg?.port.dir === 'out') { this.startBelt({ m: t.m, port: t.port }, undefined, false); this.updateBeltGesture(); this.updateGhost(); return; }
      // an input whose doorstep another machine's output shares: the press meant that output
      const over = pg ? this.outPortNear(g.x, g.y, pg.m) : null;
      if (over) { this.startBelt({ m: over.m, port: over.port.id }, undefined, false); this.updateBeltGesture(); this.updateGhost(); return; }
      // dragging an input: a belt drawn the other way round, laid output → input on release
      if (pg) { this.g = { k: 'rbelt', to: { m: t.m, port: t.port } }; this.root.classList.add('is-belting'); return; }
    }
    if (t.k === 'belt') {
      const bg = this.geo?.bs.get(t.id);
      if (bg) { this.startBelt(bg.b.from, t.id, false, this.beltIndexAt(t.id, g.x, g.y)); this.updateBeltGesture(); this.updateGhost(); return; }
    }
    if ((t.k === 'machine' || t.k === 'port') && tool.k === 'select') {
      const id = t.k === 'machine' ? t.id : t.m;
      const m = this.geo?.ms.get(id);
      const slides = m?.m.kind === 'desk' || m?.m.kind === 'gate';
      if (m && (!m.m.locked || slides) || m && this.s.ui.selection.includes(id)) {
        const sel = this.s.ui.selection.includes(id) ? this.s.ui.selection.filter((x) => this.geo?.ms.has(x)) : [id];
        if (!this.s.ui.selection.includes(id)) this.store.select([id]);
        const start = tileOf(gridOf(toWorld(this.cam(), this.view, g.x, g.y)));
        this.g = { k: 'move', ids: sel, start, delta: { x: 0, y: 0 }, ok: null };
        this.root.classList.add('is-moving');
        this.updateGhost();
        return;
      }
    }
    if (t.k === 'room' && tool.k === 'select') {
      // drag a room by its heading: the room moves with everything inside it
      if (!this.s.ui.selection.includes(t.id)) this.store.select([t.id]);
      const start = tileOf(gridOf(toWorld(this.cam(), this.view, g.x, g.y)));
      this.g = { k: 'move', ids: [t.id], start, delta: { x: 0, y: 0 }, ok: null };
      this.root.classList.add('is-moving');
      this.updateGhost();
      return;
    }
    if (tool.k === 'select') { this.g = { k: 'box', x0: g.x, y0: g.y, x1: g.x, y1: g.y, add: g.shift }; this.boxEl.classList.add('is-on'); return; }
    this.startPan(e, { x: g.x, y: g.y });
  }

  private startBelt(from: Endpoint, branchOf: string | undefined, click: boolean, branchI?: number) {
    const kind = this.outKind(from.m, from.port);
    const fam = this.geo?.ms.get(from.m)?.fam ?? 'equation';
    const pg = this.geo?.ports.find((p) => p.m === from.m && p.port.id === from.port);
    const bt = branchOf !== undefined && branchI !== undefined ? this.geo?.bs.get(branchOf)?.b.path[branchI] : undefined;
    this.hideTip();
    this.g = { k: 'belt', from, branchOf, branchI, via: [], kind, fam, startG: bt ? centre(bt) : pg?.edge ?? [0, 0], click, snap: null, path: null, real: false, noRoute: false, key: '' };
    this.root.classList.add('is-belting');
  }

  /** Index of the belt cell nearest a CSS-px point. */
  private beltIndexAt(id: string, x: number, y: number): number {
    const b = this.geo?.bs.get(id)?.b; if (!b) return 0;
    let bi = 0, bd = Infinity;
    b.path.forEach((t, i) => { const s = toScreen(this.cam(), this.view, P(t.x + 0.5, t.y + 0.5)); const d = Math.hypot(s[0] - x, s[1] - y); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }

  private up(e: PointerEvent) {
    const p = this.local(e);
    const g = this.g;
    try { this.root.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    this.root.classList.remove('is-panning', 'is-moving');
    switch (g.k) {
      case 'pan': this.g = { k: 'none' }; if (this.pendingCam) { this.store.setCamera(this.pendingCam); this.pendingCam = null; } return;
      case 'press': this.g = { k: 'none' }; this.click(g.target, e, p); return;
      case 'box': {
        this.g = { k: 'none' }; this.boxEl.classList.remove('is-on');
        this.boxSelect(g);
        return;
      }
      case 'move': {
        this.g = { k: 'none' };
        this.clearPreview();
        if (g.delta.x || g.delta.y) this.timed('move', e, () => this.store.move(g.ids, g.delta));
        return;
      }
      case 'rbelt': {
        this.g = { k: 'none' }; this.root.classList.remove('is-belting'); this.clearPreview();
        const near = this.outPortNear(p.x, p.y, g.to.m);
        if (!near) { this.say('A belt runs from an output to an input: drop this input on an output.'); return; }
        const from = { m: near.m, port: near.port.id };
        const dup = duplicateBelt(this.s.canvas, from, g.to);
        if (dup) { this.elByB.get(dup.id)?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' }); return; }
        this.timed('connect', e, () => this.store.connect(from, g.to));
        return;
      }
      case 'belt': {
        if (g.click) return; // waits for the second click
        this.updateBeltGesture();
        this.finishBelt(e);
        return;
      }
      case 'room': {
        this.g = { k: 'none' };
        this.clearPreview();
        const { rect } = this.roomDrag(g);
        const tool = this.s.ui.tool;
        const spec = this.roomSpec();
        if (!spec) { this.say("Pick the room's assumption first."); return; }
        if (rect.w < MIN_ROOM || rect.h < MIN_ROOM) { this.say(TOO_SMALL); return; }
        // a refused default room (a click) says so; the editor's reason arrives through the toast as usual
        this.timed('room', e, () => this.store.paintRoom(rect, tool.k === 'room' ? tool.kind : 'suppose', spec.l, spec.r, spec.rel, spec.assumes));
        return;
      }
      case 'resize': {
        this.g = { k: 'none' };
        this.clearPreview();
        if (JSON.stringify(g.rect) !== JSON.stringify(g.rect0)) this.store.resizeRoom(g.id, g.rect);
        this.renderHandles();
        return;
      }
    }
  }

  private finishBelt(e: PointerEvent) {
    const g = this.g; if (g.k !== 'belt') return;
    const ops = this.openOps();
    if (!g.snap && !ops.supported) {
      // the editor has no open belts yet: keep drawing click-by-click, dropping a waypoint there
      if (!g.click) this.g = { ...g, click: true };
      if (!this.anchor()) this.updateBeltGesture(true);
      this.updateGhost();
      return;
    }
    this.g = { k: 'none' };
    this.root.classList.remove('is-belting');
    this.clearPreview();
    const to = g.snap ? { m: g.snap.m, port: g.snap.port } : null;
    // an extension of an open belt: its cells + the new leg (the editor validates the whole path)
    if (g.extendOf !== undefined) {
      const ob = this.s.canvas.belts.find((b) => b.id === g.extendOf);
      if (!ob || !g.path) return;
      const leg = g.path.slice(1);
      this.timed(to ? 'connect' : 'open', e, () => ops.extend(ob, to, [...ob.path, ...leg], leg));
      return;
    }
    if (!to) {
      // released on bare floor: lay an OPEN belt ending there (items wait at its end)
      if (!g.path || g.path.length < 1 || g.branchOf !== undefined) return;
      const path = g.path;
      this.timed('open', e, () => ops.lay(g.from, path));
      return;
    }
    // final playtest W1–7 #17: the belt is already there (placement auto-belted it, or a second drag): a silent
    // no-op that lights the existing belt, never a refusal
    const dup = duplicateBelt(this.s.canvas, g.from, to);
    if (dup && !g.via.length) { this.elByB.get(dup.id)?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' }); return; }
    if (g.branchOf !== undefined) {
      const bid = g.branchOf, bi = g.branchI;
      this.timed('branch', e, () => (bi !== undefined ? this.store.branchAt(bid, bi, to) : this.store.branch(bid, to)));
    } else if (g.via.length) {
      const via = g.via;
      this.timed('connect', e, () => this.store.connectVia(g.from, to, via));
    } else this.timed('connect', e, () => this.store.connect(g.from, to, g.real && g.path ? g.path : undefined));
  }

  /**
   * Open-belt edits. The editor/store op is preferred when present (names: openBelt / layBelt; extendBelt /
   * continueBelt); otherwise an open belt is laid with connect(from, null, path), and an extension re-lays
   * the whole belt (remove + connect/open).
   */
  private openOps() {
    const st = this.store as unknown as { extendTo?: (from: Endpoint | { belt: string; end?: boolean }, target: Tile | Endpoint) => unknown };
    const ok = typeof st.extendTo === 'function';
    const at = () => this.pointerTile();
    return {
      /** True once the store can lay an open belt (editor extendTo). */
      supported: ok,
      lay: (from: Endpoint, path: Tile[]) => (ok ? st.extendTo!(from, path[path.length - 1] ?? at()) : undefined),
      extend: (b: Belt, to: Endpoint | null, path: Tile[], leg: Tile[]) => { void path; return ok ? st.extendTo!({ belt: b.id, end: true }, to ?? leg[leg.length - 1] ?? at()) : undefined; },
    };
  }

  private click(t: Target, e: PointerEvent, p: { x: number; y: number }) {
    void p;
    const tool = this.s.ui.tool;
    if (tool.k === 'place') {
      const m = this.ghostMachine(this.pointerTile());
      if (!m) return;
      const first = !this.s.canvas.machines.some((x) => !x.locked);
      // the ghost's config carries the earned schema + mirror (Cancel Lathe, ᵒᵖ…) — never fall back to a default
      const r = this.timed('place', e, () => this.store.place(m.kind, m.at, { rot: m.rot, config: m.config })) as FF.Edit | undefined;
      if (r?.ok) {
        this.justPlaced = new Set(footprint(m, this.s.ctx).map(tkey));
        // the cursor clears after every placement — unless the machine was picked with Q (repeat stamping)
        void first;
        if (!this.qArmed) this.store.setTool({ k: 'select' });
      }
      this.ghostKey = ''; this.updateGhost();
      return;
    }
    if (tool.k === 'erase') {
      const id = t.k === 'machine' ? t.id : t.k === 'belt' ? t.id : t.k === 'room' ? t.id : t.k === 'port' ? t.m : null;
      if (id) this.timed('remove', e, () => this.store.remove([id]));
      return;
    }
    if (t.k === 'port') {
      const tp = t;
      const pg = this.geo?.ports.find((x) => x.m === tp.m && x.port.id === tp.port);
      // an output beside another machine's input (a drag between them never leaves the press radius): the click is
      // the whole belt — never a click-click belt whose ghost then trails the pointer round the floor (round 2, P4.1)
      const near = pg?.port.dir === 'out' ? this.inPortNear(this.pointer.x, this.pointer.y, tp.m) : null;
      if (pg && near) {
        const from = { m: tp.m, port: tp.port }, to = { m: near.m, port: near.port.id };
        const dup = duplicateBelt(this.s.canvas, from, to);
        if (dup) this.elByB.get(dup.id)?.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
        else this.timed('connect', e, () => this.store.connect(from, to));
        return;
      }
      if (pg?.port.dir === 'out') { this.startBelt({ m: tp.m, port: tp.port }, undefined, true); this.updateBeltGesture(); this.updateGhost(); return; }
      t = { k: 'machine', id: tp.m };
    }
    const sel = this.s.ui.selection;
    if (t.k === 'machine' || t.k === 'belt' || t.k === 'room') {
      const id = t.id;
      if (e.shiftKey) this.store.select(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
      else this.store.select([id]);
      if (t.k === 'machine' && !e.shiftKey) this.store.openLens(id);
      return;
    }
    // the floor of a room selects the room (handles, ⌫ and its Delete button); a second click lets go
    const inRoom = tool.k === 'select' && !e.shiftKey ? F.roomAt(this.s.canvas, this.pointerTile()) : null;
    if (inRoom && !sel.includes(inRoom.id)) { this.store.select([inRoom.id]); this.store.openLens(null); return; }
    if (!e.shiftKey) { this.store.select([]); this.store.openLens(null); }
  }

  private boxSelect(g: Extract<Gesture, { k: 'box' }>) {
    const geo = this.geo; if (!geo) return;
    const x0 = Math.min(g.x0, g.x1), x1 = Math.max(g.x0, g.x1), y0 = Math.min(g.y0, g.y1), y1 = Math.max(g.y0, g.y1);
    const inside = (gp: G2) => { const s = toScreen(this.cam(), this.view, P(gp[0], gp[1])); return s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1; };
    const ids: string[] = [];
    for (const m of geo.ms.values()) if (inside([(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2]) && !m.m.locked) ids.push(m.m.id);
    for (const b of geo.bs.values()) if (b.b.path.length && b.b.path.every((t) => inside(centre(t)))) ids.push(b.b.id);
    this.store.select(g.add ? [...new Set([...this.s.ui.selection, ...ids])] : ids);
    if (ids.length !== 1) this.store.openLens(null);
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    const p = this.local(e);
    const c = this.cam();
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018) * (e.deltaMode === 1 ? 16 : 1));
      this.setCam(zoomAbout(c, this.view, p.x, p.y, c.zoom * k));
    } else {
      this.setCam({ x: c.x + e.deltaX / c.zoom, y: c.y + e.deltaY / c.zoom, zoom: c.zoom });
    }
    this.ghostKey = ''; this.updateGhost();
  }

  /** Cancel the current gesture; with tool = true (right-click) also disarm a placing tool. */
  private cancel(tool = false) {
    if (this.g.k === 'belt' || this.g.k === 'rbelt' || this.g.k === 'room' || this.g.k === 'move' || this.g.k === 'resize') {
      this.g = { k: 'none' }; this.root.classList.remove('is-belting', 'is-moving'); this.clearPreview(); this.renderHandles(); return true;
    }
    if (tool && this.s.ui.tool.k !== 'select') { this.store.setTool({ k: 'select' }); this.clearPreview(); return true; }
    return false;
  }

  private key(e: KeyboardEvent, down: boolean) {
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (e.key === ' ') {
      // Space-drag pans; a Space tap is the HUD's play/pause, so never preventDefault here
      if (down && !this.space) { this.space = true; this.root.classList.add('is-space'); }
      if (!down) { this.space = false; this.root.classList.remove('is-space'); }
      return;
    }
    if (e.key === 'Alt') {
      // hold = momentary alt-mode; a quick tap toggles it (claimed here so the HUD does not toggle twice)
      e.preventDefault();
      if (down && !e.repeat && !this.altHeld) { this.altHeld = { was: this.s.ui.alt, at: performance.now(), used: false }; this.store.toggleAlt(true); }
      if (!down && this.altHeld) {
        const h = this.altHeld; this.altHeld = null;
        const tap = performance.now() - h.at < 260 && !h.used;
        this.store.toggleAlt(tap ? !h.was : h.was);
      }
      return;
    }
    if (down && this.altHeld) this.altHeld.used = true;
    if (!down || e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const ui = this.s.ui;
    if (k === 'escape') {
      // only the floor's own gestures; lens / tool / selection escape is the HUD's
      if (this.g.k !== 'none' && this.g.k !== 'press' && this.cancel()) e.preventDefault();
      return;
    }
    if (k === 'c' && !mod && this.g.k === 'belt') { if (this.anchor()) e.preventDefault(); return; }
    if (mod && k === 'c') {
      const ids = ui.selection.filter((x) => this.geo?.ms.has(x) || this.geo?.bs.has(x));
      if (!ids.length) return;
      const bp = tryCopy(this.s.canvas, ids);
      if (bp) { this.clipboard = bp; this.say(`Copied ${bp.machines.length}. Ctrl-V pastes.`); e.preventDefault(); }
      return;
    }
    if (mod && k === 'v') {
      if (!this.clipboard) return;
      const bp = this.clipboard;
      this.timed('paste', e, () => this.store.paste(bp, this.pointerTile()));
      e.preventDefault();
      return;
    }
    if (mod) return;
    if (k === 'r') {
      if (ui.tool.k === 'place') { this.store.setRot(((ui.rot + (e.shiftKey ? 3 : 1)) % 4) as Rot); e.preventDefault(); return; }
      const id = ui.hover?.k === 'machine' ? ui.hover.id : ui.selection.find((x) => this.geo?.ms.has(x));
      if (id) { this.timed('rotate', e, () => this.store.rotate(id)); e.preventDefault(); }
      return;
    }
    if (k === 'q') {
      const id = ui.hover?.k === 'machine' ? ui.hover.id : ui.hover?.k === 'port' ? ui.hover.id : null;
      const m = id ? this.geo?.ms.get(id)?.m : undefined;
      if (m && spec(m.kind).placeable) {
        // Q over a machine: pipette (kind + its whole configuration, recipe included)
        this.pipette = { kind: m.kind, config: m.config };
        this.store.setTool({ k: 'place', kind: m.kind, config: m.config });
        this.store.setRot(m.rot);
        this.qArmed = true;
      } else if (!m) {
        // Q over empty floor clears the cursor (Factorio)
        this.pipette = null; this.g = { k: 'none' }; this.clearPreview();
        this.store.setTool({ k: 'select' });
      }
      e.preventDefault();
      return;
    }
    if (k === 'f') { this.fit(); e.preventDefault(); return; }
    if (k === 'delete' || k === 'backspace') {
      const ids = ui.selection.length ? ui.selection : ui.hover && ui.hover.k !== 'port' ? [ui.hover.id] : [];
      // a desk or gate stands for its room: select the room first, so the next ⌫ deletes it knowingly
      const parts = ids.map((id) => this.s.canvas.machines.find((m) => m.id === id)).filter((m) => m && (m.kind === 'desk' || m.kind === 'gate')) as Machine[];
      if (parts.length && parts.length === ids.length) {
        const room = (parts[0]!.config as { room?: string }).room;
        if (room) { this.store.select([room]); this.store.openLens(null); this.say('The room is selected. Press ⌫ again to delete it. Its desk and gate go; machines inside stay.'); e.preventDefault(); return; }
      }
      if (ids.length) { this.timed('remove', e, () => this.store.remove(ids)); e.preventDefault(); }
    }
  }

  /** Run a store action and record input → present latency (event timestamp → next frame). */
  private timed(kind: string, e: Event, fn: () => unknown): unknown {
    const t0 = e.timeStamp || performance.now();
    const r = fn() as { ok?: boolean; blockers?: string[] } | undefined;
    const sync = performance.now() - t0;
    // refusal reasons and notes arrive through the store's toast (with blockers); nothing to say here
    requestAnimationFrame(() => {
      const frame = performance.now() - t0;
      PERF.samples.push({ kind, sync: Math.round(sync * 10) / 10, frame: Math.round(frame * 10) / 10 });
      if (PERF.samples.length > 200) PERF.samples.shift();
    });
    return r;
  }

}

// ───────────────────────────── helpers ─────────────────────────────

/** Latin Modern lacks the subscript glyphs: x₁ → x<sub>1</sub>. */
function subHTML(html: string): string {
  return html.replace(/[₀-₉]+/g, (m) => `<sub class="m-sub">${[...m].map((c) => String(c.charCodeAt(0) - 0x2080)).join('')}</sub>`);
}

function kindWord(ks: ItemKind[], cap = false): string {
  const w = (k: ItemKind) => ({ term: 'a term', eq: 'an equation', neq: 'an inequation', bot: 'a contradiction', size: 'a group order', law: 'a law card', cond: 'a theorem card', mem: 'a membership' } as Record<string, string>)[k] ?? k;
  const s = ks.length ? ks.map(w).join(' or ') : 'anything';
  if (!cap) return s;
  const bare = s.replace(/^(a|an) /, '');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/** The editor's minimum room (factory/editor.ts MIN_ROOM, square): a desk with its face tile, the gate with its inner tile, and a machine. */
const MIN_ROOM = Math.max(F.MIN_ROOM.w, F.MIN_ROOM.h);
const TOO_SMALL = `Too small: a room needs at least ${MIN_ROOM} × ${MIN_ROOM} tiles, for its desk, its gate and a machine.`;
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

function rectOf(a: Tile, b: Tile): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

function resizeRect(r: Rect, h: string, g: G2): Rect {
  let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
  const gx = Math.round(g[0]), gy = Math.round(g[1]);
  if (h.includes('n')) y0 = Math.min(gy, y1 - 1);
  if (h.includes('s')) y1 = Math.max(gy, y0 + 1);
  if (h.includes('w')) x0 = Math.min(gx, x1 - 1);
  if (h.includes('e')) x1 = Math.max(gx, x0 + 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export { itemKindOf };
