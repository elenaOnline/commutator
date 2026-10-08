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
import { queued } from '../factory/runtime';
import type * as FF from '../factory';
import { FONT, INK, reducedMotion } from '../ui/tokens';
import { MATH_CSS } from '../ui/math';
import { P, f1, type G2, type S2 } from '../board/geom';
import { factHTML, factSVG, factWidth, termHTML, termSVG, type Labels } from './math';
import { REGISTRY, MIRROR_NAMES } from '../levels/levels';
import {
  defaultConfig, faceVec, fallbackRoute, footprint, portTileOut, portsOf, spec, trySplice, tryAutoLinks, tryBranchAt, tryCopy, tryMove, tryPlace, tryRouteOrWhy,
} from './adapt';
import { buildGeo, centre, familyOfMachine, portEdge, portEnd, tkey, type BGeo, type Geo, type MGeo, type PortGeo } from './geo';
import {
  beltBody, beltSVG, bridgeSVG, heightOf, labelsOf, liveStatusOf, machineLabelSVG, machineName, machineSVG, pipSVG, portSVG, roomHandles, roomSVG,
  socketLabelSVG, socketTarget, type Ctx,
} from './scene';
import { packetGrid, packetSVG, prevAt, type Axis } from './items';
import { JAM, OK, VIOLET, defsSVG, esc, groundRect, polyD as polyLine } from './svg';
import { fitCamera, gridOf, tileOf, toScreen, toWorld, zoomAbout, type View } from './project';

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
/** Re-frame the floor (F). */
export function fitFloor(): void { ACTIVE?.fit(); }

// ───────────────────────────── perf probe ─────────────────────────────

export interface FloorPerf { kind: string; sync: number; frame: number }
const PERF: { samples: FloorPerf[]; frames: number[] } = { samples: [], frames: [] };
(globalThis as unknown as { __floorPerf: typeof PERF }).__floorPerf = PERF;

// ───────────────────────────── gestures ─────────────────────────────

type Snap = { m: string; port: string; compat: boolean; pg: PortGeo };
type Gesture =
  | { k: 'none' }
  | { k: 'press'; x: number; y: number; target: Target; shift: boolean }
  | { k: 'pan'; x: number; y: number; cam: { x: number; y: number; zoom: number } }
  | { k: 'box'; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { k: 'move'; ids: string[]; start: Tile; delta: Tile; ok: boolean | null; reason?: string }
  | { k: 'belt'; why?: { reason: string; blockers: string[] }; from: Endpoint; branchOf?: string; branchI?: number; via: Tile[]; kind: ItemKind; fam: import('../kernel/types').Family; startG: G2; click: boolean; snap: Snap | null; path: Tile[] | null; real: boolean; noRoute: boolean; key: string }
  | { k: 'room'; start: Tile; cur: Tile }
  | { k: 'resize'; id: string; h: string; rect0: Rect; rect: Rect };

type Target =
  | { k: 'port'; m: string; port: string }
  | { k: 'machine'; id: string }
  | { k: 'belt'; id: string }
  | { k: 'rh'; id: string; h: string }
  | { k: 'room'; id: string }
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
  private hiddenPk = new Set<number>();
  private kf = 1;
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
    const layers = ['rooms', 'under', 'belts', 'ports', 'machines', 'labels', 'pips', 'packets', 'fx', 'ghost', 'alt', 'phits', 'handles', 'tags'];
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
      schemaName: (id, mirror) => (mirror ? MIRROR_NAMES[id]?.name : undefined) ?? REGISTRY[id]?.name ?? id,
    };
  }

  private onState(s: FState) {
    const prev = this.s;
    this.s = s;
    const edited = s.canvas !== prev.canvas || s.compiled !== prev.compiled || s.level !== prev.level;
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
      if (s.ui.tool !== prev.ui.tool && (s.ui.tool.k !== 'place' || (this.pipette && s.ui.tool.kind !== this.pipette.kind))) this.pipette = null;
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
    this.slots = Object.fromEntries(s.level.atoms.map((a) => [a.id, a.hue]));
    this.cx = this.ctxFor(s);
    try {
      this.geo = buildGeo(s.canvas, s.compiled ?? null, s.ctx);
    } catch (e) { console.warn('floor: geometry failed', e); this.geo = null; }
    const geo = this.geo;
    if (!geo) { for (const k of Object.keys(this.L)) this.L[k]!.innerHTML = ''; return; }
    const comp = s.compiled ?? null;
    // rooms
    this.L.rooms!.innerHTML = s.canvas.rooms.map((r) => roomSVG(r, this.labels)).join('');
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
    // machines, painter's order (far → near)
    const ms = [...geo.ms.values()].sort((a, b) => (a.x0 + a.y0 + a.x1 + a.y1) - (b.x0 + b.y0 + b.x1 + b.y1) || a.x0 - b.x0);
    const delivered = s.run?.delivered ?? {};
    let mach = '', labs = '';
    for (const g of ms) {
      if (g.m.kind === 'socket') {
        const sid = g.m.config.kind === 'socket' ? g.m.config.socketId : '';
        const filled = delivered[sid] !== undefined;
        mach += machineSVG(g, this.cx).replace('fl-sock"', `fl-sock${filled ? ' is-sealed' : ''}"`);
        labs += socketLabelSVG(g, this.cx, filled);
      } else {
        mach += machineSVG(g, this.cx);
        labs += machineLabelSVG(g, this.cx);
      }
    }
    this.L.machines!.innerHTML = mach;
    this.L.labels!.innerHTML = labs;
    this.elByM.clear(); this.elByB.clear();
    this.L.machines!.querySelectorAll('[data-m]').forEach((e) => this.elByM.set((e as HTMLElement).dataset.m!, e));
    this.L.belts!.querySelectorAll('.fl-b').forEach((e) => this.elByB.set((e as HTMLElement).dataset.b!, e));
    this.capPackets();
    this.pipKey = '';
    this.renderPips();
    // packets: new epoch
    this.L.packets!.innerHTML = ''; this.pkEls.clear(); this.prevPos.clear(); this.prevRun = null; this.tickAt = performance.now(); this.drawnRun = null;
    this.renderHandles();
    if (this.s.ui.alt) this.renderAlt();
    this.headW.clear();
    this.L.rooms!.querySelectorAll<SVGGElement>('.fl-rhead-out').forEach((el) => { const id = el.closest<HTMLElement>('[data-r]')?.dataset.r; if (id) { try { this.headW.set(id, el.getBBox().width); } catch { /* not laid out */ } } });
    if (!this.fitted) this.fit();
    else this.applyCamera();
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
      // lift it off the machine: above and outside the output corner, clear of the glyph and the label
      const c: [number, number] = [c0[0] + (d[0] - d[1]) * 16 + 6, c0[1] + (d[0] + d[1]) * 4 - 16];
      const y = c[1] - 7;
      o += `<g class="fl-queue fl-sz fl-sz-q" data-q="${esc(m)}" style="transform-origin:${f1(c[0])}px ${f1(y)}px">` +
        `<rect x="${f1(c[0] - 13)}" y="${f1(y - 5)}" width="22" height="12" rx="3" fill="#fff" stroke="${INK.navy}" stroke-width="1" opacity=".75"/>` +
        `<rect x="${f1(c[0] - 15)}" y="${f1(y - 8)}" width="22" height="12" rx="3" fill="#fff" stroke="${INK.navy}" stroke-width="1.1"/>` +
        `<text x="${f1(c[0] - 4)}" y="${f1(y + 1.6)}" text-anchor="middle" font-family="${FONT.ui}" font-size="9" font-weight="600" fill="${INK.navy}">×${n}</text></g>`;
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
    if (reducedMotion() || !prev || run.tick < prev.tick) return;
    // stamps: jobs that completed this tick
    for (const [id, job] of Object.entries(prev.jobs)) {
      if (job.blocked) continue;
      const now = run.jobs[id];
      if (job.finish <= run.tick && (!now || now.finish !== job.finish || now.blocked)) this.stamp(id);
    }
    // seals
    for (const [sid, t] of Object.entries(run.delivered)) if (prev.delivered[sid] === undefined) { void t; this.seal(sid); }
  }

  private stamp(id: string) {
    const el = this.elByM.get(id); if (!el) return;
    const top = el.querySelector('.fl-top') as SVGGElement | null;
    top?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(3.2px)', offset: 0.35 }, { transform: 'translateY(0)' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const inset = el.querySelector('.fl-inset') as SVGPathElement | null;
    inset?.animate([{ opacity: 0.6 }, { opacity: 0.16 }], { duration: 300, easing: 'ease-out' });
  }

  private seal(socketId: string) {
    for (const [id, el] of this.elByM) {
      const m = this.geo?.ms.get(id)?.m;
      if (m?.config.kind === 'socket' && m.config.socketId === socketId) {
        el.classList.add('is-sealed');
        const tag = this.L.labels!.querySelector(`[data-sock="${CSS.escape(id)}"] .fl-socktag`);
        if (tag) tag.textContent = 'DELIVERED';
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
    const n = bg?.b.path.length ?? 0;
    const compact = occ.has(`${p.at.belt}|${p.at.i + 1}`) || (!!bg && p.at.i === n - 1 && occ.has(`P|${bg.b.to.m}|${bg.b.to.port}`));
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
        el.innerHTML = packetSVG(p.value, axis, this.labels, this.slots, cur.compact).svg;
        this.L.packets!.appendChild(el);
        rec = { el, key }; this.pkEls.set(p.id, rec);
      } else if (rec.key !== key) { rec.el.innerHTML = packetSVG(p.value, axis, this.labels, this.slots, cur.compact).svg; rec.key = key; }
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
  }
  /** A room heading sits outside its north-west wall; when that would clip the floor's edge (or slide under the
   *  order chip), it moves inside the room under the top corner. */
  private flipHeadings(c: { x: number; y: number; zoom: number }, kf: number) {
    if (!this.s?.canvas || !this.geo) return;
    const z = c.zoom, v = this.view;
    const onScreen = (x0: number, y0: number, x1: number, y1: number) => {
      const a = toScreen(c, v, [x0, y0]), b = toScreen(c, v, [x1, y1]);
      return a[0] >= 12 && b[0] <= v.w - 12 && a[1] >= 96 && b[1] <= v.h - 96;
    };
    const boxes = [...this.geo.ms.values()].map((g) => ({ x0: P(g.x0, g.y1)[0] - 4, x1: P(g.x1, g.y0)[0] + 4, y0: P(g.x0, g.y0, 0.5)[1] - 4, y1: P(g.x1, g.y1)[1] + 18 }));
    for (const r of this.s.canvas.rooms) {
      const el = this.L.rooms?.querySelector(`[data-r="${CSS.escape(r.id)}"]`); if (!el) continue;
      const w = (this.headW.get(r.id) ?? 260) * kf, h = 40 * kf;
      const a = P(r.rect.x, r.rect.y + r.rect.h * 0.5);
      const ox = a[0] - 16, oy = a[1] - 30;
      if (onScreen(ox - w, oy - h / 2 - 6, ox, oy + h / 2) || z <= 0) { el.classList.remove('is-flip'); continue; }
      // search the room's interior for a clear, visible spot, nearest the top corner first
      const pts: [number, number][] = [];
      for (let gy = r.rect.y + 0.9; gy <= r.rect.y + r.rect.h - 0.9; gy += 0.5) for (let gx = r.rect.x + 0.9; gx <= r.rect.x + r.rect.w - 0.9; gx += 0.5) pts.push(P(gx, gy) as [number, number]);
      const top = P(r.rect.x + 1, r.rect.y + 1);
      pts.sort((p1, p2) => Math.hypot(p1[0] - top[0], p1[1] - top[1]) - Math.hypot(p2[0] - top[0], p2[1] - top[1]));
      const clear = (x: number, y: number) => !boxes.some((b) => x - w / 2 < b.x1 && x + w / 2 > b.x0 && y - h / 2 < b.y1 && y + h / 2 > b.y0);
      let at = pts.find(([x, y]) => onScreen(x - w / 2, y - h / 2, x + w / 2, y + h / 2) && clear(x, y));
      if (!at) {
        // nothing clear inside: keep the outside heading but slide it on-screen
        const minX = (12 - v.w / 2) / z + c.x + w, minY = (96 - v.h / 2) / z + c.y + h / 2;
        at = [Math.max(ox, minX) - w / 2, Math.max(oy, minY)];
      }
      const inG = el.querySelector('.fl-rhead-in');
      inG?.setAttribute('transform', `translate(${f1(at[0])},${f1(at[1])})`);
      el.classList.add('is-flip');
    }
  }

  private setCam(c: { x: number; y: number; zoom: number }) { this.pendingCam = c; this.applyCamera(); }
  fit() {
    if (!this.geo || this.view.w < 10) return;
    this.fitted = true;
    this.pendingCam = null;
    this.store.setCamera(fitCamera(this.geo.bounds, this.view));
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
      el.classList.toggle('is-lit', !!b && !!hovM && (b.from.m === hovM || b.to.m === hovM));
    }
    this.L.rooms!.querySelectorAll('[data-r]').forEach((e) => e.classList.toggle('is-sel', sel.has((e as HTMLElement).dataset.r!)));
    this.L.pips!.querySelectorAll('[data-pip]').forEach((e) => e.classList.toggle('is-hover', hovM === (e as HTMLElement).dataset.pip));
    this.L.phits!.querySelectorAll('[data-p]').forEach((e) => { const [m, p] = (e as HTMLElement).dataset.p!.split('|'); e.classList.toggle('is-hover', ui.hover?.k === 'port' && ui.hover.id === m && ui.hover.port === p); });
    this.L.ports!.querySelectorAll('[data-p]').forEach((e) => { const [m] = (e as HTMLElement).dataset.p!.split('|'); e.classList.toggle('is-hot', hovM === m || sel.has(m!)); });
  }

  private renderHandles() {
    const ui = this.s.ui;
    const rooms = this.s.canvas.rooms.filter((r) => ui.selection.includes(r.id) || ui.tool.k === 'room');
    this.L.handles!.innerHTML = rooms.map((r) => roomHandles(this.g.k === 'resize' && this.g.id === r.id ? this.g.rect : r.rect, r.id)).join('');
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
      o += `<g class="fl-sz fl-sz-p" style="transform-origin:${f1(sp[0])}px ${f1(sp[1] + 12)}px"><text class="fl-altport" x="${f1(sp[0])}" y="${f1(sp[1] + 16)}" text-anchor="middle" font-family="${FONT.ui}" font-size="8.4" font-weight="600" letter-spacing=".08em" fill="${INK.navy2}">${esc(label.toUpperCase())}</text></g>`;
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

  private pointerTile(): Tile { return tileOf(gridOf(toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y))); }
  private pointerGrid(): G2 { return gridOf(toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y)); }

  private ghostMachine(tile: Tile): Machine | null {
    const tool = this.s.ui.tool;
    if (tool.k !== 'place') return null;
    const config = this.pipette?.kind === tool.kind ? this.pipette.config : defaultConfig(tool.kind, this.s.ctx, { schema: tool.schema, mirror: tool.mirror });
    const probe: Machine = { id: '__ghost', kind: tool.kind, at: { x: 0, y: 0 }, rot: this.s.ui.rot, config };
    const fp = footprint(probe, this.s.ctx);
    const w = Math.max(...fp.map((t) => t.x)) + 1, h = Math.max(...fp.map((t) => t.y)) + 1;
    return { ...probe, at: { x: tile.x - Math.floor((w - 1) / 2), y: tile.y - Math.floor((h - 1) / 2) } };
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
    const g: MGeo = { m, spec: s, fam: familyOfMachine(m, s), tiles, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, ports: portsOf(m, this.s.ctx) };
    // geometric overlap is a fact we can see; the verdict (if any) is the editor's
    const overlap = tiles.some((t) => this.geo!.occ.has(tkey(t)) || this.geo!.beltOcc.has(tkey(t)));
    const ok = verdict ? verdict.ok : !overlap;
    let under = '';
    for (const t of tiles) under += `<path d="${groundRect(t.x, t.y, t.x + 1, t.y + 1, 0.05, 0.12)}" fill="${ok ? OK : 'url(#fl-bad)'}" opacity="${ok ? 0.22 : 1}" stroke="${ok ? OK : JAM}" stroke-width="1" stroke-opacity=".7"/>`;
    // new belts the editor would add (auto-connect)
    let belts = '';
    if (verdict && verdict.ok) {
      const before = new Set(this.s.canvas.belts.map((b) => b.id));
      const newId = verdict.ids?.[0];
      for (const b of verdict.canvas.belts) if (!before.has(b.id)) belts += this.ghostBeltSVG(b, verdict.canvas.machines, newId ? { [newId]: g } : {});
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
      verdict.canvas.belts.some((x) => x.from.m === b.from.m && x.from.port === b.from.port && x.to.m === newId && !x.broken) &&
      verdict.canvas.belts.some((x) => x.from.m === newId && x.to.m === b.to.m && x.to.port === b.to.port && !x.broken);
    if (verdict?.ok) for (const b of this.s.canvas.belts) {
      const nb = verdict.canvas.belts.find((x) => x.id === b.id);
      if (!nb && spliced(b)) { splices++; continue; }
      if (!b.broken && (!nb || nb.broken)) { cuts++; const bg = this.geo.bs.get(b.id); if (bg) under += `<path d="${polyLine(bg.line)}" fill="none" stroke="${JAM}" stroke-width="5" stroke-opacity=".35" stroke-dasharray="7 5" stroke-linecap="round"/>`; }
    }
    // splice candidates: light the belt(s) the machine would be inserted into
    const cands = trySplice(this.s.canvas, m, this.s.ctx);
    for (const c of cands) { const bg = this.geo.bs.get(c.belt); if (bg) under += `<path d="${polyLine(bg.line)}" fill="none" stroke="${INK.navy}" stroke-width="9" stroke-opacity=".16" stroke-linecap="round" stroke-linejoin="round"/>`; }
    const note = verdict?.ok ? (verdict as { note?: string }).note : undefined;
    const reason = verdict && !verdict.ok ? verdict.reason : !verdict && overlap ? 'Something is already here' : cuts ? `Cuts ${cuts} belt${cuts > 1 ? 's' : ''} — they stay, dashed, until re-routed` : '';
    if (cands.length > 1 && !reason) splices = -cands.length;
    if (note && /^Spliced/.test(note) && !reason) splices = Math.max(splices, 1);
    const top = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, 0.6);
    const tag = reason && !this.toastUp() ? this.tagSVG(top[0], top[1] - 14, reason, JAM)
      : splices && !this.toastUp() ? this.tagSVG(top[0], top[1] - 14,
        splices < 0 ? `Touches ${-splices} belts — place beside exactly one to splice` : note && /^Spliced/.test(note) ? note : 'Splices into the belt', INK.navy) : '';
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
    el.innerHTML = `<g class="fl-altlab"><text x="${f1(at[0])}" y="${f1(at[1] - 22)}" text-anchor="middle" font-family="${FONT.math}" font-size="15" fill="${INK.navy}">→ ${svg}</text></g>`;
  }

  private ghostBeltSVG(b: Belt, machines: Machine[], extra: Record<string, MGeo>): string {
    const portOf = (e: Endpoint) => {
      const g = extra[e.m] ?? this.geo?.ms.get(e.m);
      if (g) return g.ports.find((p) => p.id === e.port);
      const m = machines.find((x) => x.id === e.m);
      return m ? portsOf(m, this.s.ctx).find((p) => p.id === e.port) : undefined;
    };
    const fp = portOf(b.from), tp = portOf(b.to);
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
      const ins = geo.ports.filter((p) => p.m === id && p.port.dir === 'in' && p.m !== from.m);
      const pick = ins.find((p) => !p.taken && p.port.accepts.includes(kind)) ?? ins.find((p) => !p.taken) ?? ins[0];
      if (pick) best = { m: id, port: pick.port.id, compat: pick.port.accepts.includes(kind), pg: pick };
    }
    return best;
  }

  private beltBlocked = (t: Tile) => !!this.geo && (this.geo.occ.has(tkey(t)) || this.geo.beltOcc.has(tkey(t)));

  /** Tile the belt leaves from: the output's front cell, or the trunk cell a branch was dragged off. */
  private beltStart(g: Extract<Gesture, { k: 'belt' }>): Tile | null {
    if (g.branchOf !== undefined && g.branchI !== undefined) return this.geo?.bs.get(g.branchOf)?.b.path[g.branchI] ?? null;
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
      if (g.branchOf === undefined) {
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
      path = this.beltBlocked(t) && !(t.x === start.x && t.y === start.y) ? null : this.chain(start, g.via, t);
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
    if (fromPort && (g.branchOf === undefined || g.real)) line.push(...portEnd(fromPort, g.path?.[0], true));
    for (const t of g.path ?? []) line.push(centre(t));
    if (g.snap && g.path) line.push(...portEnd(g.snap.pg.port, g.path[g.path.length - 1], false));
    for (const t of g.via) { const c = P(t.x + 0.5, t.y + 0.5); o += `<g class="fl-anchor"><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="5.5" fill="#fff" stroke="${INK.navy}" stroke-width="1.6"/><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="2" fill="${INK.navy}"/></g>`; }
    if (!g.path) {
      // no route: a straight dashed intent line
      const lt = g.via[g.via.length - 1];
      const a = lt ? P(lt.x + 0.5, lt.y + 0.5) : fromPort && g.branchOf === undefined ? P(...portEdge(fromPort)) : P(...g.startG);
      const b = g.snap ? P(...g.snap.pg.edge) : toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y);
      o += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${JAM}" stroke-width="2" stroke-dasharray="5 5"/>`;
      if (g.snap && !this.toastUp()) o += this.tagSVG(b[0], b[1] - 24, g.why?.reason ?? 'No free route to this port', JAM);
    } else if (line.length >= 2) {
      o += `<g class="fl-ghostb">${beltBody({ kind: g.kind, fam: g.fam, line }, { ghost: true })}</g>`;
      if (!g.snap) {
        const e = P(...line[line.length - 1]!);
        o += `<circle cx="${f1(e[0])}" cy="${f1(e[1])}" r="6" fill="#fff" stroke="${INK.navy3}" stroke-width="1.4" stroke-dasharray="2 2"/>`;
      }
    }
    if (g.snap) {
      const c = P(g.snap.pg.edge[0], g.snap.pg.edge[1]);
      const col = g.snap.compat ? INK.navy : JAM;
      o += `<circle class="fl-snapring" cx="${f1(c[0])}" cy="${f1(c[1])}" r="9" fill="#fff" stroke="${col}" stroke-width="2.4"/><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="3.4" fill="${col}"/>`;
      if (!g.snap.compat) o += this.tagSVG(c[0], c[1] - 26, `This port takes ${kindWord(g.snap.pg.port.accepts)} — this belt carries ${kindWord([g.kind])}`, JAM);
      else if (g.snap.pg.taken) o += this.tagSVG(c[0], c[1] - 26, 'This input already has a belt', JAM);
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
    this.L.under!.innerHTML = under;
    this.L.ghost!.innerHTML = `<g class="fl-ghostm${ok ? '' : ' is-bad'}">${ghost}</g>` + (g.reason && !this.toastUp() ? (() => { const w = toWorld(this.cam(), this.view, this.pointer.x, this.pointer.y); return this.tagSVG(w[0], w[1] - 30, g.reason!, JAM); })() : '');
    for (const id of g.ids) this.elByM.get(id)?.classList.add('is-moving');
  }

  private renderRoomPreview() {
    const g = this.g;
    if (g.k === 'room') {
      const rect = rectOf(g.start, g.cur);
      const tool = this.s.ui.tool;
      const kind = tool.k === 'room' ? tool.kind : 'suppose';
      const spec = this.roomSpec();
      this.L.ghost!.innerHTML = roomSVG({ id: '__ghost', kind, l: spec?.l ?? null, r: spec?.r ?? null, rect }, this.labels, true);
      this.L.under!.innerHTML = '';
    } else if (g.k === 'resize') {
      const room = this.s.canvas.rooms.find((r) => r.id === g.id); if (!room) return;
      this.L.ghost!.innerHTML = roomSVG({ ...room, id: '__ghost', rect: g.rect }, this.labels, true);
      this.renderHandles();
    }
  }

  private roomSpec(): { l: import('../kernel/types').Term; r: import('../kernel/types').Term } | null {
    const ui = this.s.ui as FUI;
    const tl = ui.tool as { k: string; l?: import('../kernel/types').Term; r?: import('../kernel/types').Term };
    if (tl.k === 'room' && tl.l && tl.r) return { l: tl.l, r: tl.r };
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
    return v.k === 'term' ? termHTML(v.term, this.labels) : v.k === 'fact' ? factHTML(v.fact, this.labels) : factHTML(v.card, this.labels);
  }

  private tipHTML(t: Target): string {
    const geo = this.geo; if (!geo) return '';
    const comp = this.s.compiled ?? null, run = this.s.run ?? null;
    if (t.k === 'machine') {
      if (this.s.ui.lens === t.id) return ''; // the HUD lens already says it
      const g = geo.ms.get(t.id); if (!g) return '';
      const name = machineName(g, this.cx);
      if (g.m.kind === 'socket') {
        const target = socketTarget(g.m, this.s.level);
        const sid = g.m.config.kind === 'socket' ? g.m.config.socketId : '';
        const so = comp?.sockets[sid];
        const done = run?.delivered[sid] !== undefined;
        const arriving = comp?.machines[g.m.id]?.inputs.q;
        return `<div class="fl-tip-h">Receiving dock${done ? ' · delivered' : ''}</div>` +
          (target ? `<div class="fl-tip-row"><span class="fl-tip-k">wants</span><span class="math">${factHTML(target, this.labels)}</span></div>` : '') +
          (arriving ? `<div class="fl-tip-row"><span class="fl-tip-k">arriving</span><span class="math">${this.valueHTML(arriving)}</span></div>` : '') +
          (so && !so.ok && so.reason ? `<div class="fl-tip-why is-jam">${esc(so.reason)}</div>` : '');
      }
      const st = comp?.machines[g.m.id]?.status;
      const live = liveStatusOf(g.m.id, run, comp);
      const out = comp?.machines[g.m.id]?.out;
      const phrase = live === 'working' ? 'Working' : live === 'blocked' ? 'Output full' : live === 'jammed' ? 'Jammed' : live === 'starved' ? 'Waiting' : st?.k === 'ok' ? 'Ready' : '';
      const reason = st && st.k !== 'ok' ? st.reason : live === 'blocked' ? 'Output belt full — connect or clear its output.' : '';
      const fam = g.spec.blurb ? `<div class="fl-tip-blurb">${esc(g.spec.blurb)}</div>` : '';
      return `<div class="fl-tip-h">${esc(name)}${phrase ? ` <span class="fl-tip-st is-${live ?? 'ok'}">${phrase}</span>` : ''}</div>${fam}` +
        (reason ? `<div class="fl-tip-why${st?.k === 'jammed' ? ' is-jam' : ''}">${esc(reason)}</div>` : '') +
        (out ? `<div class="fl-tip-row"><span class="fl-tip-k">makes</span><span class="math">${this.valueHTML(out)}</span></div>` : '') +
        (g.m.kind === 'gate' ? `<div class="fl-tip-foot">Drag to slide it along the room’s wall</div>`
          : g.m.kind === 'desk' ? `<div class="fl-tip-foot">Drag to slide it inside the room</div>`
          : g.m.locked ? `<div class="fl-tip-foot">Part of the order — can't be removed</div>` : '');
    }
    if (t.k === 'belt') {
      const bg = geo.bs.get(t.id); if (!bg) return '';
      const v = comp?.machines[bg.b.from.m]?.out;
      if (bg.broken) return `<div class="fl-tip-h">Broken belt <span class="fl-tip-st is-jammed">no route</span></div><div class="fl-tip-why is-jam">${esc(bg.broken)}</div><div class="fl-tip-foot">Drag from its source again, or move what blocks it</div>`;
      const err = comp?.beltErrors[t.id];
      const src = geo.ms.get(bg.b.from.m);
      return `<div class="fl-tip-h">${kindWord([bg.kind], true)} belt <span class="fl-tip-k">from ${esc(src ? machineName(src, this.cx) : '?')}</span></div>` +
        (v ? `<div class="fl-tip-math math">${this.valueHTML(v)}</div>` : `<div class="fl-tip-why">No certified item yet.</div>`) +
        (err ? `<div class="fl-tip-why is-jam">${esc(err)}</div>` : '') + `<div class="fl-tip-foot">Drag off it to branch a copy</div>`;
    }
    if (t.k === 'port') {
      const pg = geo.ports.find((p) => p.m === t.m && p.port.id === t.port); if (!pg) return '';
      const cur = comp?.machines[t.m]?.inputs[t.port];
      if (pg.port.dir === 'out') {
        const out = comp?.machines[t.m]?.out;
        return `<div class="fl-tip-h">Output <span class="fl-tip-k">${kindWord([pg.kind])}</span></div>` + (out ? `<div class="fl-tip-math math">${this.valueHTML(out)}</div>` : '') + `<div class="fl-tip-foot">Drag to a port to lay a belt</div>`;
      }
      const role = pg.port.role === 'rule' ? 'Rule slot' : pg.port.role === 'param' ? `Parameter ${esc(pg.port.label)}` : pg.port.role === 'premise' ? `Premise ${esc(pg.port.label)}` : 'Input';
      return `<div class="fl-tip-h">${role} <span class="fl-tip-k">takes ${kindWord(pg.port.accepts)}</span></div>` + (cur ? `<div class="fl-tip-math math">${this.valueHTML(cur)}</div>` : `<div class="fl-tip-why">${pg.taken ? 'Waiting for an item.' : 'Not connected.'}</div>`);
    }
    if (t.k === 'room') {
      const r = this.s.canvas.rooms.find((x) => x.id === t.id); if (!r) return '';
      const a = r.kind === 'suppose' ? `${termHTML(r.l, this.labels)} = ${termHTML(r.r, this.labels)}` : `${termHTML(r.l, this.labels)} ≠ ${termHTML(r.r, this.labels)}`;
      const x = r.kind === 'suppose' ? `${termHTML(r.l, this.labels)} ≠ ${termHTML(r.r, this.labels)}` : `${termHTML(r.l, this.labels)} = ${termHTML(r.r, this.labels)}`;
      return `<div class="fl-tip-h">Room</div><div class="fl-tip-row"><span class="fl-tip-k">assumes</span><span class="math">${a}</span></div><div class="fl-tip-row"><span class="fl-tip-k">exports</span><span class="math">${x}</span></div><div class="fl-tip-foot">Facts leave only through the gate</div>`;
    }
    return '';
  }

  // ───────────────────────────── input ─────────────────────────────

  private targetOf(e: Event): Target {
    const base = this.domTarget(e);
    if (base.k === 'rh' || !this.geo || !('clientX' in e)) return base;
    const me = e as MouseEvent;
    // the machine actually under the pointer (port hit circles sit above machines, so look beneath them)
    let under: string | null = null;
    for (const el of document.elementsFromPoint(me.clientX, me.clientY)) {
      const m = (el as Element).closest?.('.fl-l-machines [data-m]') as HTMLElement | null;
      if (m) { under = m.dataset.m ?? null; break; }
    }
    const pt = this.local(me);
    const cam = this.cam();
    const R = Math.max(12, 16 * cam.zoom);
    let best: PortGeo | null = null, bs = Infinity;
    for (const pg of this.geo.ports) {
      const d = faceVec(pg.port.face);
      const c = toScreen(cam, this.view, P(pg.edge[0] + d[0] * 0.2, pg.edge[1] + d[1] * 0.2));
      const dist = Math.hypot(c[0] - pt.x, c[1] - pt.y);
      if (dist > R) continue;
      const score = dist - (pg.m === under ? 6 : 0) - (pg.port.dir === 'out' ? 4 : 0);
      if (score < bs) { bs = score; best = pg; }
    }
    if (best) return { k: 'port', m: best.m, port: best.port.id };
    if (base.k === 'port') return under ? { k: 'machine', id: under } : { k: 'floor' };
    if (base.k === 'machine' && under && under !== base.id) return { k: 'machine', id: under };
    return base;
  }

  private domTarget(e: Event): Target {
    const el = (e.target as Element | null)?.closest?.('[data-p],[data-rh],[data-m],[data-b],[data-rhead],[data-r]') as HTMLElement | null;
    if (!el) return { k: 'floor' };
    const d = el.dataset;
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
    on('pointercancel', () => { this.g = { k: 'none' }; this.clearPreview(); });
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
    const tool = this.s.ui.tool;
    // right button: cancel
    if (e.button === 2) { this.cancel(true); return; }
    if (e.button === 1 || this.space) { this.startPan(e, p); return; }
    if (e.button !== 0) return;
    // click-click belt: second click
    if (this.g.k === 'belt' && this.g.click) {
      this.updateBeltGesture();
      this.finishBelt(e);
      return;
    }
    if (tool.k === 'erase' || this.isOutPort(t)) { this.g = { k: 'press', x: p.x, y: p.y, target: t, shift: e.shiftKey }; r(this.root, e); return; }
    if (tool.k === 'room') {
      if (t.k === 'rh') return this.startResize(t, e);
      const tl = this.pointerTile();
      this.g = { k: 'room', start: tl, cur: tl };
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
        const delta = { x: t.x - g.start.x, y: t.y - g.start.y };
        if (delta.x !== g.delta.x || delta.y !== g.delta.y) {
          const v = delta.x || delta.y ? tryMove(this.s.canvas, g.ids, delta, this.s.ctx) : null;
          let reason = v && !v.ok ? v.reason : undefined;
          if (v?.ok) { const cut = this.s.canvas.belts.filter((b) => !b.broken && (!v.canvas.belts.find((x) => x.id === b.id) || v.canvas.belts.find((x) => x.id === b.id)?.broken)).length; if (cut) reason = `Cuts ${cut} belt${cut > 1 ? 's' : ''} — they stay, dashed, until re-routed`; }
          this.g = { ...g, delta, ok: v ? (v.ok && !reason ? true : v.ok ? null : false) : null, reason };
          this.updateGhost();
        }
        return;
      }
      case 'belt': { this.setHoverFrom(this.targetOf(e)); this.updateBeltGesture(); this.updateGhost(); return; }
      case 'room': { const t = this.pointerTile(); if (t.x !== g.cur.x || t.y !== g.cur.y) { this.g = { ...g, cur: t }; this.updateGhost(); } return; }
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
    this.updateGhost();
    this.updateTip();
    if (this.tip.classList.contains('is-on')) this.placeTip();
  }

  private beginDrag(g: Extract<Gesture, { k: 'press' }>, e: PointerEvent) {
    const tool = this.s.ui.tool;
    const t = g.target;
    this.hideTip();
    if (t.k === 'port' && this.isOutPort(t)) { this.startBelt({ m: t.m, port: t.port }, undefined, false); this.updateBeltGesture(); this.updateGhost(); return; }
    if (tool.k === 'place' || tool.k === 'erase') {
      // drag on floor with a placing tool pans (the hand)
      this.startPan(e, { x: g.x, y: g.y });
      return;
    }
    if (t.k === 'port') {
      const pg = this.geo?.ports.find((p) => p.m === t.m && p.port.id === t.port);
      if (pg?.port.dir === 'out') { this.startBelt({ m: t.m, port: t.port }, undefined, false); this.updateBeltGesture(); this.updateGhost(); return; }
      // dragging an input port: treat as machine
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
      case 'belt': {
        if (g.click) return; // waits for the second click
        this.updateBeltGesture();
        this.finishBelt(e);
        return;
      }
      case 'room': {
        this.g = { k: 'none' };
        this.clearPreview();
        const rect = rectOf(g.start, g.cur);
        const tool = this.s.ui.tool;
        const spec = this.roomSpec();
        if (!spec) { this.say('Choose what the room assumes first (Room popover)'); return; }
        this.timed('room', e, () => this.store.paintRoom(rect, tool.k === 'room' ? tool.kind : 'suppose', spec.l, spec.r));
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
    if (!g.snap) {
      // released / clicked on empty floor: keep drawing click-by-click, dropping a waypoint there (DSP / shapez 2 anchors)
      if (!g.click) { this.g = { ...g, click: true }; }
      if (!this.anchor()) this.updateBeltGesture(true);
      this.updateGhost();
      return;
    }
    this.g = { k: 'none' };
    this.root.classList.remove('is-belting');
    this.clearPreview();
    const to = { m: g.snap.m, port: g.snap.port };
    if (g.branchOf !== undefined) {
      const bid = g.branchOf, bi = g.branchI;
      this.timed('branch', e, () => (bi !== undefined ? this.store.branchAt(bid, bi, to) : this.store.branch(bid, to)));
    } else if (g.via.length) {
      const via = g.via;
      this.timed('connect', e, () => this.store.connectVia(g.from, to, via));
    } else this.timed('connect', e, () => this.store.connect(g.from, to, g.real && g.path ? g.path : undefined));
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
        // First Light: after the first placement, hand the pointer back so the next drag draws a belt
        if (first && this.s.level.id === 'L01') this.store.setTool({ k: 'select' });
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
    if (this.g.k === 'belt' || this.g.k === 'room' || this.g.k === 'move' || this.g.k === 'resize') {
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
      if (bp) { this.clipboard = bp; this.say(`Copied ${bp.machines.length} machine${bp.machines.length === 1 ? '' : 's'} — Ctrl-V pastes at the pointer`); e.preventDefault(); }
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
        this.pipette = { kind: m.kind, config: m.config };
        const sc = m.config.kind === 'stamp' || m.config.kind === 'carddock' ? { schema: m.config.schema, mirror: m.config.mirror } : {};
        this.store.setTool({ k: 'place', kind: m.kind, ...sc });
        this.store.setRot(m.rot);
        this.pipette = { kind: m.kind, config: m.config };
      } else if (ui.tool.k === 'place') this.store.setTool({ k: 'select' });
      e.preventDefault();
      return;
    }
    if (k === 'f') { this.fit(); e.preventDefault(); return; }
    if (k === 'delete' || k === 'backspace') {
      const ids = ui.selection.length ? ui.selection : ui.hover && ui.hover.k !== 'port' ? [ui.hover.id] : [];
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

function kindWord(ks: ItemKind[], cap = false): string {
  const w = (k: ItemKind) => ({ term: 'a term', eq: 'an equation', neq: 'an inequation', bot: 'a contradiction', size: 'a group order', law: 'a law card', cond: 'a theorem card' }[k]);
  const s = ks.length ? ks.map(w).join(' or ') : 'anything';
  if (!cap) return s;
  const bare = s.replace(/^(a|an) /, '');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

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
