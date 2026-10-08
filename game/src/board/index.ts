// LEMMA WORKS — isometric factory board. Owner: board builder.
//
// SVG, Overprint direction. Static scene is rebuilt only when the graph,
// check, level or claims change; hover/active toggle classes; replay touches a
// handful of attributes per frame (fx layer). See layout.ts for the layout.
import './board.css';
import type { Fact, NodeId, Offer, ProofNode } from '../kernel/types';
import type { Claim, State } from '../state/store';
import { labelsOf, termEq } from '../kernel';
import { FAMILY, FONT, INK, MOTION, reducedMotion } from '../ui/tokens';
import { palletSVG, setSlots } from './beads';
import {
  ORANGE, crossesSVG, gateSVG, inletLabelSVG, markSVG, ribbonSVG, roomSVG, rungSVG, socketSVG, tileSVG, wireSVG,
} from './draw';
import { familyOf, justify } from './fam';
import { P, RUN, RUN_LEN, cutLine, f1, isoEllipse, pts, tileShape } from './geom';
import { layoutBoard, type Layout, type SLay, type WireLay } from './layout';
import { usesOf } from '../state/belts';
import { resolveLabels } from './collide';
import { factSVG, type Labels } from './mathsvg';

/** The slice of the Store the board uses (the real Store satisfies it). */
export interface BoardStore {
  get(): State;
  subscribe(fn: (s: State) => void): () => void;
  on(fn: (e: import('../state/store').StoreEvent) => void): () => void;
  setActive(id: NodeId | null): void;
  setHover(id: NodeId | null): void;
  deleteNode(id: NodeId): { ok: boolean };
  claims(): Claim[];
  /** Optional: whole-pallet offers for a node (feed hints on hover). The real Store has it. */
  offers?(sel: null, nodeId: NodeId): Offer[];
}

const SVGNS = 'http://www.w3.org/2000/svg';
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
// replay phases (fractions of one node step)
const PH_STAMP = 0.26;   // incoming feeds bleed until here, then the station stamps
const PH_OUT = 0.38;     // outgoing bleed + pallet travel from here to 1

// ── delivery settle contract (for the shell's ceremony) ──
let settleAt = 0;
let settleWaiters: (() => void)[] = [];
let settleTimer = 0;
/**
 * Resolves when the board's live delivery animations (clash collapse, socket
 * seal) have finished — at most ~900 ms after the commit. Resolves immediately
 * when nothing is playing (and under reduced motion). The board also dispatches
 * a 'lw:board-settled' event on its host element at the same moment.
 */
export function boardSettled(): Promise<void> {
  const wait = settleAt - performance.now();
  if (wait <= 0) return Promise.resolve();
  return new Promise((res) => settleWaiters.push(res));
}
function busyFor(ms: number, host: HTMLElement) {
  settleAt = Math.max(settleAt, performance.now() + ms);
  clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    const w = settleWaiters; settleWaiters = [];
    for (const f of w) f();
    host.dispatchEvent(new CustomEvent('lw:board-settled', { bubbles: true }));
  }, Math.max(0, settleAt - performance.now()));
}

/** Render the active level's proof graph as an isometric factory into el. Returns an unmount fn. */
export function mountBoard(el: HTMLElement, store: BoardStore): () => void {
  el.classList.add('lw-board-host');
  const root = document.createElement('div');
  root.className = 'lw-board';
  root.innerHTML = `<svg class="lw-svg" xmlns="${SVGNS}"><defs>
      <pattern id="lw-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(-30)"><rect width="7" height="7" fill="${INK.navy}"/><rect width="3.6" height="7" fill="${INK.gold}"/></pattern>
    </defs><g class="lw-world">
      <g class="lw-ground"></g><g class="lw-fields"></g><g class="lw-wires"></g><g class="lw-marks"></g>
      <g class="lw-ribbons"></g><g class="lw-solids"></g><g class="lw-labels"></g><g class="lw-fx"></g><g class="lw-pallets"></g>
    </g></svg>`;
  el.appendChild(root);
  const svg = root.querySelector('svg')!;
  const world = svg.querySelector<SVGGElement>('.lw-world')!;
  const layer = (c: string) => world.querySelector<SVGGElement>('.lw-' + c)!;
  const G = { ground: layer('ground'), fields: layer('fields'), wires: layer('wires'), marks: layer('marks'), solids: layer('solids'), ribbons: layer('ribbons'), labels: layer('labels'), fx: layer('fx'), pallets: layer('pallets') };

  let L: Layout | null = null;
  let labels: Labels = {};
  let lastSig: unknown[] = [];
  let hoverKey: string | null = null, activeKey: string | null = null;
  const view = { x: 0, y: 0, s: 1 };
  let userMoved = false;
  let fitAnim = 0;
  const reveal = new Map<NodeId, Element[]>();
  const shown = new Map<Element, boolean>();
  let sealed = new Set<string>();
  /** Sockets sealed before the latest render ('delivered' re-emits every commit). */
  let sealedBefore = new Set<string>();

  // ───────── view ─────────
  let lk = 0;
  const applyView = () => {
    world.setAttribute('transform', `translate(${f1(view.x)},${f1(view.y)}) scale(${view.s.toFixed(4)})`);
    // semantic zoom: labels counter-scale when zoomed out so math stays legible
    const k = Math.max(1, Math.min(2.4, 0.9 / view.s));
    if (Math.abs(k - lk) > 0.01) { lk = k; svg.style.setProperty('--lk', k.toFixed(3)); }
    scheduleCollide();
  };
  let collideTimer = 0;
  function scheduleCollide() {
    clearTimeout(collideTimer);
    collideTimer = window.setTimeout(() => { if (!isReplaying(store.get())) resolveLabels(world, view.s); }, 70);
  }
  function fit(animate: boolean) {
    const bb = contentBBox();
    if (!bb) return;
    const W = root.clientWidth || 800, H = root.clientHeight || 500, pad = Math.max(10, Math.min(36, H * 0.06));
    const padB = Math.max(16, pad);
    const s = Math.max(0.18, Math.min(1.3, Math.min((W - pad * 2) / bb.width, (H - pad - padB) / bb.height)));
    const target = { s, x: W / 2 - (bb.x + bb.width / 2) * s, y: pad + ((H - pad - padB) - bb.height * s) / 2 - bb.y * s };
    cancelAnimationFrame(fitAnim);
    if (!animate || reducedMotion()) { Object.assign(view, target); applyView(); return; }
    const from = { ...view }, t0 = performance.now();
    const step = (now: number) => {
      const k = ease((now - t0) / 320);
      view.x = from.x + (target.x - from.x) * k; view.y = from.y + (target.y - from.y) * k; view.s = from.s + (target.s - from.s) * k;
      applyView();
      if (k < 1) fitAnim = requestAnimationFrame(step);
    };
    fitAnim = requestAnimationFrame(step);
  }
  function contentBBox(): DOMRect | null {
    // the active pallet's full bead string is part of the frame (never cut off at the bottom)
    const act = G.pallets.querySelector<SVGGElement>('.lw-pal.is-active');
    const boxes = [G.fields, G.wires, G.solids, G.labels, ...(act ? [act] : [])].map((g) => g.getBBox()).filter((b) => b.width > 0 || b.height > 0);
    if (!boxes.length) return null;
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
    return new DOMRect(x0, y0, x1 - x0, y1 - y0);
  }

  // ───────── render ─────────
  function render(st: State) {
    const g = st.graph;
    labels = labelsOf(st.level.atoms);
    setSlots(Object.fromEntries(st.level.atoms.map((a) => [a.id, a.hue])));
    const facts: Record<NodeId, Fact | undefined> = {};
    for (const n of g.nodes) facts[n.id] = st.check.nodes[n.id]?.fact;
    const famCache = new Map<NodeId, ReturnType<typeof familyOf>>();
    L = layoutBoard({
      graph: g, facts, level: st.level,
      famOf: (n) => { let f = famCache.get(n.id); if (!f) { f = familyOf(n, g); famCache.set(n.id, f); } return f; },
      filled: st.check.sockets.map((s) => ({ id: s.id, filledBy: s.ok ? s.filledBy : undefined })),
      claims: store.claims().map((c) => ({ id: c.id, pallet: c.pallet, scope: c.scope })),
    });
    const lay = L;
    hintCache.clear();
    G.ground.innerHTML = crossesSVG(lay.ext);

    let fields = '';
    for (const r of [...lay.rooms].sort((a, b) => a.depth - b.depth)) fields += `<g data-o="${r.ord ?? ''}">${roomSVG(r, labels)}</g>`;
    const nowSealed = new Set<string>();
    for (const s of lay.sockets) {
      const filled = !!s.filledBy;
      if (filled) nowSealed.add(s.id);
      fields += `<g class="lw-sock${s.claim ? ' is-claim' : ''}" data-sock="${s.id}" data-fill="${s.filledBy ?? ''}">${socketSVG(s, filled, labels)}</g>`;
    }
    G.fields.innerHTML = fields;

    let wires = '';
    for (const w of lay.wires) {
      const src = lay.stations.get(w.from)!;
      const rung = w.lanes === 2 && w.kind !== 'feed' ? rungSVG(src.gx + (src.kind === 'gate' ? 0.6 : src.e + 0.32), src.gy, w.neq) : '';
      let fork = '';
      if (w.fork) {
        const c = P(w.fork[0] + 0.5, w.fork[1]); const e = isoEllipse(0.17);
        fork = `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(e.rx)}" ry="${f1(e.ry)}" fill="${INK.navy}"/>`;
      }
      wires += `<g class="lw-wire lw-bleed" data-o="${w.ord}" data-w="${w.id}">${wireSVG(w)}${rung}${fork}</g>`;
    }
    G.wires.innerHTML = wires;

    let marks = '', solids = '', lab = '';
    const order = [...lay.stations.values()].sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));
    for (const s of order) {
      if (s.kind === 'gate') {
        const room = lay.rooms.find((r) => r.gate === s.key);
        solids += `<g class="lw-st lw-gate" data-st="${s.key}" data-o="${s.first}">${gateSVG(s, !!room?.closed)}</g>`;
        continue;
      }
      marks += markSVG(s);
      solids += `<g class="lw-st" data-st="${s.key}" data-o="${s.first}" data-kind="${s.kind}">${tileSVG(s)}</g>`;
      if (s.kind === 'inlet') lab += `<g data-o="${s.first}" class="lw-inlab" data-st="${s.key}">${inletLabelSVG(s, facts[s.first], labels)}</g>`;
      if (s.kind === 'press') {
        const [x, y] = P(s.gx + s.e, s.gy + s.e);
        lab += `<g data-o="${s.first}"><g class="lw-lab" data-pri="3"><g class="lw-sz" style="transform-origin:${f1(x + 6)}px ${f1(y + 10)}px"><text x="${f1(x + 6)}" y="${f1(y + 18)}" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${INK.navy2}">IMPORTED · LAGRANGE</text>` +
          `<text x="${f1(x + 6)}" y="${f1(y + 36)}" font-family="${FONT.math}" font-size="16" fill="${INK.navy}">${facts[s.last] ? factSVG(facts[s.last]!, labels) : ''}</text></g></g></g>`;
      }
    }
    G.marks.innerHTML = marks;
    G.solids.innerHTML = solids;
    G.ribbons.innerHTML = lay.ribbons.map((r) => `<g data-o="${r.ord}">${ribbonSVG(r, lay)}</g>`).join('');
    G.labels.innerHTML = lab;

    // reveal index
    reveal.clear(); shown.clear();
    world.querySelectorAll('[data-o]').forEach((e) => {
      const id = e.getAttribute('data-o')!;
      if (!id) return;
      const arr = reveal.get(id); if (arr) arr.push(e); else reveal.set(id, [e]);
    });
    sealedBefore = sealed; sealed = nowSealed;
    frontierKey = '';
    applyMarks(st);
    renderPallets(st);
    applyReplay(st);
  }

  // ───────── hover / active ─────────
  function applyMarks(st: State) {
    if (!L) return;
    hoverKey = st.ui.hoverNode ? L.byNode.get(st.ui.hoverNode) ?? null : null;
    activeKey = st.ui.activeNode ? L.byNode.get(st.ui.activeNode) ?? null : null;
    G.marks.querySelectorAll('.lw-mark').forEach((m) => {
      const k = m.getAttribute('data-mk');
      m.classList.toggle('is-hover', k === hoverKey);
      m.classList.toggle('is-active', k === activeKey);
    });
    G.solids.querySelectorAll('.lw-st').forEach((m) => {
      const k = m.getAttribute('data-st');
      m.classList.toggle('is-hover', k === hoverKey);
      m.classList.toggle('is-active', k === activeKey);
    });
    G.ribbons.querySelectorAll('.lw-rib').forEach((r) => {
      const lit = !!hoverKey && (r.getAttribute('data-from') === hoverKey || r.getAttribute('data-to') === hoverKey);
      r.classList.toggle('is-lit', lit);
    });
    root.classList.toggle('has-hover', !!hoverKey);
  }

  function palletAt(s: SLay, f: Fact | undefined, offPx = 0): string {
    const start = s.kind === 'gate' ? s.gx + 0.18 : s.gx + s.e + 0.1;
    const p = palletSVG(f, start, s.gy, labels, !!s.next);
    // semantic zoom for the bead string too, anchored at its '=' rung on the wire
    const [ox, oy] = P(start, s.gy);
    if (!offPx) return `<g class="lw-psz" style="transform-origin:${f1(ox)}px ${f1(oy)}px">${p.svg}</g>`;
    return `<g transform="translate(${f1(RUN[0] * offPx)},${f1(RUN[1] * offPx)})">${p.svg}</g>`;
  }

  // ── feed hints: where could this belt end go? (sockets it matches, kernel whole-pallet offers) ──
  const hintCache = new Map<string, { svg: string; text: string } | null>();
  function feedHints(s: SLay, st: State): { svg: string; text: string } | null {
    if (!L || !s.isEnd || s.kind === 'gate') return null;
    const ck = s.last;
    if (hintCache.has(ck)) return hintCache.get(ck)!;
    const f = st.check.nodes[s.last]?.fact;
    const targets: [number, number, number][] = []; // gx, gy, z
    const names: string[] = [];
    if (f && (f.k === 'eq' || f.k === 'neq')) {
      for (const k of L.sockets) {
        if (k.filledBy || (k.target.k !== f.k) || s.scope !== (k.scope ?? 'root')) continue;
        const t = k.target as Extract<Fact, { k: 'eq' | 'neq' }>;
        try { if ((termEq(t.l, f.l) && termEq(t.r, f.r)) || (termEq(t.l, f.r) && termEq(t.r, f.l))) targets.push([k.gx, k.gy, 0]); } catch { /* kernel pending */ }
      }
    }
    let offers: Offer[] = [];
    try { offers = store.offers ? store.offers(null, s.last) : []; } catch { offers = []; }
    for (const o of offers) {
      const kd = o.kind;
      if (kd.k === 'clash' || kd.k === 'merge') {
        const other = L.stations.get(L.byNode.get(kd.k === 'clash' ? kd.neq : kd.other) ?? '');
        if (other) targets.push([other.gx, other.gy, other.h]);
        names.push(kd.k === 'clash' ? 'clash' : 'merge');
      } else if (kd.k === 'apply' && o.family === 'lemma' && ![...L.stations.values()].some((x) => x.kind === 'building')) names.push(o.label.replace(/[:(].*$/, '').replace(/\s+(at|with)\s.*$/, '').trim());
    }
    let svg = '';
    for (const [gx, gy, z] of targets) {
      const n = 24, pts2: string[] = [];
      const lift = 0.5 + Math.hypot(gx - s.gx, gy - s.gy) * 0.14;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = P(s.gx + (gx - s.gx) * t, s.gy + (gy - s.gy) * t, s.h + (z - s.h) * t + lift * Math.sin(Math.PI * t));
        pts2.push(`${f1(p[0])},${f1(p[1])}`);
      }
      svg += `<path class="lw-hint" d="M${pts2.join('L')}" fill="none" stroke="${INK.navy}" stroke-width="1.6" stroke-dasharray="3 5" stroke-linecap="round" opacity=".6"/>`;
    }
    const uniq = [...new Set(names.map((n) => n.replace(/\s*ᵒᵖ$/, '')))].slice(0, 2);
    const out = svg || uniq.length ? { svg, text: uniq.length ? 'could feed → ' + uniq.slice(0, 3).join(' · ') : (targets.length ? 'could deliver → socket' : '') } : null;
    hintCache.set(ck, out);
    return out;
  }

  function stationCard(s: SLay, st: State, extra?: string): string {
    const n = s.nodes[0]!;
    const fam = FAMILY[s.fam];
    const why = s.nodes.map((m) => justify(m, st.graph, st.ctx)).filter((x, i, a) => a.indexOf(x) === i).join(' · ');
    const f = st.check.nodes[s.last]?.fact;
    const top = s.kind === 'gate' ? P(s.gx, s.gy - 0.9) : P(s.gx - s.e, s.gy - s.e, s.h);
    const head = s.kind === 'inlet' ? 'GIVEN' : s.kind === 'building' ? (s.mirror ? 'EARNED · MIRROR' : 'EARNED MACHINE') : s.kind === 'press' ? 'IMPORTED' : n.k === 'exit' ? 'EXIT · DISCHARGE' : fam.label.toUpperCase();
    const showFact = f && (f.k === 'law' || f.k === 'cond' || s.kind === 'building' || s.kind === 'press' || s.kind === 'gate');
    // floats above the tile: the gap between the upstream station and the row above is free
    const lines: string[] = [
      `<text text-anchor="middle" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${fam.text}" class="halo">${escTxt(head)}</text>`,
      `<text text-anchor="middle" font-family="${FONT.ui}" font-size="12.5" fill="${INK.navy2}" class="halo">${escTxt(why)}</text>`,
    ];
    if (showFact) lines.push(`<text text-anchor="middle" font-family="${FONT.math}" font-size="16" fill="${INK.navy}" class="halo">${factSVG(f!, labels)}</text>`);
    if (extra) lines.push(`<text text-anchor="middle" font-family="${FONT.ui}" font-size="11.5" font-weight="500" fill="${INK.navy}" class="halo">${escTxt(extra)}</text>`);
    const lh = [0, 17, showFact ? 37 : 34, 54];
    const total = lh[lines.length - 1]!;
    return `<g class="lw-lab" data-pri="2"><g class="lw-card" transform="translate(${f1(top[0])},${f1(top[1] - 18 - total)})"><g class="lw-sz" style="transform-origin:0px ${total + 12}px">` +
      lines.map((l, i) => l.replace('<text ', `<text y="${lh[i]}" `)).join('') + `</g></g></g>`;
  }

  function renderPallets(st: State) {
    if (!L) return;
    const replaying = isReplaying(st);
    let o = '';
    const seen = new Set<string>();
    const add = (key: string | null, withCard: boolean) => {
      if (!key || seen.has(key)) return; seen.add(key);
      const s = L!.stations.get(key); if (!s) return;
      const f = st.check.nodes[s.last]?.fact;
      const delivered = L!.sockets.some((k) => !k.claim && k.filledBy === s.last);
      const isActive = key === activeKey;
      if (isActive && !replaying && s.kind !== 'gate') {
        // unmistakable: a pulsing ring printed under the active station
        const [x, y] = P(s.gx, s.gy); const e = isoEllipse(Math.max(s.e, 0.4) * 1.3);
        o += `<ellipse class="lw-pulse" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(e.rx)}" ry="${f1(e.ry)}" fill="none" stroke="${INK.navy}" stroke-width="2"/>`;
      }
      if (!replaying && !delivered) o += `<g class="lw-lab" data-pri="1"><g class="lw-pal${isActive ? ' is-active' : ''}">${palletAt(s, f)}</g></g>`;
      const hint = withCard && !replaying ? feedHints(s, st) : null;
      if (hint) o += hint.svg;
      if (withCard) o += stationCard(s, st, hint?.text);
      if (!replaying && s.isEnd && s.kind !== 'inlet' && key === hoverKey) {
        const top = s.kind === 'gate' ? P(s.gx, s.gy - 0.9) : P(s.gx + s.e, s.gy - s.e, s.h);
        o += `<g class="lw-del" data-del="${s.first}" transform="translate(${f1(top[0] + 9)},${f1(top[1] - 11)})"><title>Delete this station (undoable)</title><circle r="8.5" fill="#fff" stroke="${INK.navy}" stroke-width="1.4"/><path d="M-3,-3L3,3M3,-3L-3,3" stroke="${INK.navy}" stroke-width="1.6" stroke-linecap="round"/></g>`;
      }
    };
    add(activeKey, activeKey === hoverKey);
    add(hoverKey, true);
    G.pallets.innerHTML = o;
    scheduleCollide();
  }

  // ───────── replay ─────────
  const isReplaying = (st: State) => st.ui.replay.cursor !== Infinity && st.ui.replay.order.length > 0;
  let frontierKey = '';
  let fxEls: { ghost?: SVGElement; bleeds: { w: WireLay; el: SVGElement }[]; pallet?: SVGGElement; palLen: number; flood?: SVGElement; seals: SVGGElement[]; shared?: SVGGElement; st?: SLay } = { bleeds: [], palLen: 0, seals: [] };

  function setShown(e: Element, v: boolean) {
    if (shown.get(e) === v) return;
    shown.set(e, v);
    (e as SVGElement).style.display = v ? '' : 'none';
  }

  function applyReplay(st: State) {
    if (!L) return;
    const r = st.ui.replay;
    root.classList.toggle('is-replaying', isReplaying(st));
    if (!isReplaying(st)) {
      for (const els of reveal.values()) for (const e of els) setShown(e, true);
      if (frontierKey) { G.fx.innerHTML = ''; frontierKey = ''; fxEls = { bleeds: [], palLen: 0, seals: [] }; }
      G.fields.querySelectorAll<SVGGElement>('.lw-sock').forEach((s) => setSeal(s, !!s.getAttribute('data-fill')));
      G.pallets.style.display = '';
      return;
    }
    const idx = new Map(r.order.map((id, i) => [id, i] as const));
    const k = Math.floor(r.cursor), t = r.cursor - k;
    const front = r.order[k];
    const reduced = reducedMotion() || st.save.settings.reducedMotion;
    for (const [id, els] of reveal) {
      const i = idx.get(id);
      for (const e of els) {
        let v: boolean;
        if (i === undefined || i < k) v = true;
        else if (i > k) v = false;
        else if (e.classList.contains('lw-bleed')) v = reduced; // bled in the fx layer
        else if (e.classList.contains('lw-st') || e.classList.contains('lw-mark')) {
          const n = L.stations.get(L.byNode.get(id) ?? '')?.nodes.length ?? 1;
          v = reduced || t / n >= PH_STAMP || !hasFeeds(id);
        }
        else v = true;
        setShown(e, v);
      }
    }
    G.fields.querySelectorAll<SVGGElement>('.lw-sock').forEach((s) => {
      const fid = s.getAttribute('data-fill');
      const i = fid ? idx.get(fid) : undefined;
      setSeal(s, i !== undefined && (i < k || (i === k && (reduced || t > 0.92))));
    });
    if (front && !reduced) frame(st, front, t, k);
    else if (frontierKey) { G.fx.innerHTML = ''; frontierKey = ''; }
  }

  const hasFeeds = (nodeId: NodeId) => !!L && L.wires.some((w) => w.kind === 'feed' && L!.stations.get(w.to!)?.first === nodeId);

  function setSeal(s: SVGGElement, on: boolean) {
    const seal = s.querySelector<SVGGElement>('.lw-seal'); const dash = s.querySelector<SVGElement>('.lw-sock-dash');
    if (seal && seal.style.opacity !== (on ? '1' : '0')) seal.style.opacity = on ? '1' : '0';
    if (dash) dash.style.opacity = on ? '0' : '1';
    const tag = s.querySelector('.lw-socktag');
    if (tag && !s.classList.contains('is-claim')) tag.textContent = on ? 'DELIVERED' : 'SOCKET';
  }

  function frame(st: State, front: NodeId, t: number, k: number) {
    const lay = L!;
    const key = lay.byNode.get(front);
    const s = key ? lay.stations.get(key) : undefined;
    // one station = one gesture: animate on station-level progress so a
    // multi-op station (insert e + rewrite) plays as one continuous beat
    const fk = s ? `st:${s.key}` : `n:${front}#${k}`;
    if (fk !== frontierKey) { frontierKey = fk; buildFx(st, s); }
    if (!s) return;
    const pos = Math.max(0, s.nodes.findIndex((n) => n.id === front));
    const T = (pos + t) / s.nodes.length;
    const spanMs = s.nodes.length * MOTION.replayStep / Math.max(0.1, st.ui.replay.speed);
    const feeds = hasFeeds(s.first);
    // stamp ghost: ~120 ms off-register, right as the station prints
    if (fxEls.ghost) {
      const ms = (T - (feeds ? PH_STAMP : 0)) * spanMs;
      fxEls.ghost.style.opacity = ms >= 0 && ms < 130 ? '0.55' : '0';
    }
    // incoming feeds bleed toward the station; the outgoing wire bleeds forward
    for (const b of fxEls.bleeds) {
      const u = b.w.kind === 'feed' ? ease(T / PH_STAMP) : ease((T - PH_OUT) / (1 - PH_OUT));
      b.el.style.display = u > 0 ? '' : 'none';
      if (u > 0) b.el.innerHTML = wireSVG(b.w, cutLine(b.w.line, u));
    }
    // the output pallet rides the bleed front
    if (fxEls.pallet) {
      const out = fxEls.bleeds.find((b) => b.w.kind !== 'feed');
      const u = ease((T - PH_OUT) / (1 - PH_OUT));
      let off = 0;
      if (out) {
        const startGx = s.kind === 'gate' ? s.gx + 0.18 : s.gx + s.e + 0.1;
        const endGx = out.w.line[out.w.line.length - 1]![0];
        off = Math.max(0, (endGx - startGx) * RUN_LEN * u - fxEls.palLen);
      }
      fxEls.pallet.setAttribute('transform', `translate(${f1(RUN[0] * off)},${f1(RUN[1] * off)})`);
      fxEls.pallet.style.opacity = T < PH_OUT * 0.8 ? '0' : '1';
    }
    // clash: the room floods orange, then shrinks to a dot at the gate
    if (fxEls.flood) {
      const room = lay.rooms.find((r) => r.clash === s.key);
      if (room) {
        const fl = clamp01((T - 0.2) / 0.3), sh = ease((T - 0.55) / 0.45);
        const anchor = room.gate ? lay.stations.get(room.gate)! : s;
        const [ax, ay] = P(anchor.gx, anchor.gy);
        const sc = 1 - sh * 0.97;
        fxEls.flood.setAttribute('transform', `translate(${f1(ax)},${f1(ay)}) scale(${sc.toFixed(3)}) translate(${f1(-ax)},${f1(-ay)})`);
        fxEls.flood.style.opacity = String(0.42 * fl);
      }
    }
    for (const seal of fxEls.seals) {
      const u = clamp01((T - 0.86) / 0.14);
      seal.style.opacity = String(u);
      seal.setAttribute('transform', seal.dataset.at! + ` scale(${(0.4 + 0.6 * ease(u)).toFixed(3)})`);
    }
    // the shared intermediate lights up while one of its consumers fires
    if (fxEls.shared) fxEls.shared.style.opacity = String(Math.min(clamp01(T / 0.15), clamp01((1 - T) / 0.12) + 0.35));
  }

  function buildFx(st: State, s: SLay | undefined) {
    const lay = L!;
    G.fx.innerHTML = '';
    fxEls = { bleeds: [], palLen: 0, seals: [], st: s };
    G.ribbons.querySelectorAll('.lw-rib.is-pulse').forEach((r) => r.classList.remove('is-pulse'));
    if (!s) return;
    let html = '';
    if (s.kind !== 'gate') {
      const T = tileShape(s.e, s.h);
      const [x, y] = P(s.gx, s.gy);
      const ink = s.kind === 'building' || s.kind === 'press' ? INK.navy : FAMILY[s.fam].ink;
      html += `<path class="fx-ghost" d="${T.top}" transform="translate(${f1(x + 2.4)},${f1(y - 1.6)})" fill="${ink}" opacity="0" style="mix-blend-mode:multiply"/>`;
    }
    if (s.kind === 'clash') {
      const room = lay.rooms.find((r) => r.clash === s.key);
      if (room) html += `<polygon class="fx-flood" points="${pts(room.poly.map(([a, b]) => P(a, b)))}" fill="${ORANGE}" style="mix-blend-mode:multiply;opacity:0"/>`;
    }
    const bleedWires = lay.wires.filter((w) => (w.kind !== 'feed' && w.from === s.key) || (w.kind === 'feed' && w.to === s.key));
    bleedWires.forEach((w, i) => { html += `<g class="fx-bleed" data-i="${i}"></g>`; });
    let palLen = 0;
    if (bleedWires.some((w) => w.kind !== 'feed')) {
      const f = st.check.nodes[s.last]?.fact;
      const start = s.kind === 'gate' ? s.gx + 0.18 : s.gx + s.e + 0.1;
      const p = palletSVG(f, start, s.gy, labels);
      palLen = p.len;
      html += `<g class="fx-pallet" style="opacity:0">${p.svg}</g>`;
    }
    for (const sock of lay.sockets.filter((k) => !k.claim && k.filledBy === s.last)) {
      const [x, y] = P(sock.gx, sock.gy); const e = isoEllipse(0.34 * 1.25);
      html += `<g class="fx-seal" data-at="translate(${f1(x)},${f1(y)})" style="opacity:0"><ellipse rx="${f1(e.rx)}" ry="${f1(e.ry)}" fill="${INK.navy}"/><rect x="-4.5" y="-5.5" width="9" height="11" fill="#fff"/></g>`;
    }
    // shared dependency: s consumes (or is) a station whose output fans out to ≥ 2 consumers
    const uses = new Set(s.nodes.flatMap((n) => { const u = usesOf(n); return [...u.inputs, ...u.cites]; }));
    const sh = [...lay.shared.keys()].map((k) => lay.stations.get(k)!).filter((x) => x.key === s.key || uses.has(x.last));
    if (sh.length) {
      let g = '';
      for (const x of sh) {
        const [cx, cy] = P(x.gx, x.gy); const e = isoEllipse(Math.max(x.e, 0.4) * 1.55);
        for (const w of lay.wires) if (w.from === x.key && w.kind !== 'feed' && x.key !== s.key) g += wireSVG(w);
        g += `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(e.rx)}" ry="${f1(e.ry)}" fill="none" stroke="${INK.navy}" stroke-width="2" stroke-dasharray="5 4"/>`;
        const lp = P(x.gx - x.e, x.gy - x.e, x.h);
        g += `<text x="${f1(lp[0] - 6)}" y="${f1(lp[1] - 10)}" text-anchor="end" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${INK.navy}" class="halo-t">SHARED · FEEDS ${lay.shared.get(x.key)}</text>`;
      }
      html += `<g class="fx-shared" style="opacity:0">${g}</g>`;
    }
    for (const rb of lay.ribbons) if (rb.to === s.key) G.ribbons.querySelector(`[data-rib="${cssEsc(rb.id)}"]`)?.classList.add('is-pulse');
    G.fx.innerHTML = html;
    fxEls.ghost = G.fx.querySelector<SVGElement>('.fx-ghost') ?? undefined;
    fxEls.flood = G.fx.querySelector<SVGElement>('.fx-flood') ?? undefined;
    fxEls.pallet = G.fx.querySelector<SVGGElement>('.fx-pallet') ?? undefined;
    fxEls.seals = [...G.fx.querySelectorAll<SVGGElement>('.fx-seal')];
    fxEls.shared = G.fx.querySelector<SVGGElement>('.fx-shared') ?? undefined;
    fxEls.palLen = palLen;
    G.fx.querySelectorAll<SVGElement>('.fx-bleed').forEach((el, i) => fxEls.bleeds.push({ w: bleedWires[i]!, el }));
  }

  // ───────── live edit animations ─────────
  function stampLive(keys: string[], drop: Set<string>) {
    if (!L || reducedMotion()) return;
    for (const key of keys) {
      const s = L.stations.get(key); if (!s) continue;
      const g = G.solids.querySelector<SVGGElement>(`[data-st="${cssEsc(key)}"]`);
      if (g && drop.has(key)) g.animate([{ transform: 'translate(0,-16px)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1 }], { duration: MOTION.stamp, easing: MOTION.easeSpring });
      if (s.kind === 'gate') continue;
      const T = tileShape(s.e, s.h); const [x, y] = P(s.gx, s.gy);
      const ink = s.kind === 'building' || s.kind === 'press' ? INK.navy : FAMILY[s.fam].ink;
      const ghost = document.createElementNS(SVGNS, 'path');
      ghost.setAttribute('d', T.top); ghost.setAttribute('fill', ink);
      ghost.setAttribute('transform', `translate(${f1(x + 2.4)},${f1(y - 1.6)})`);
      ghost.setAttribute('style', 'mix-blend-mode:multiply;opacity:.55');
      G.fx.appendChild(ghost);
      setTimeout(() => ghost.remove(), (drop.has(key) ? MOTION.stamp : 0) + 120);
      if (drop.has(key)) { ghost.style.opacity = '0'; setTimeout(() => (ghost.style.opacity = '.55'), MOTION.stamp - 40); }
    }
    // the newly bled wire after the last new station
  }

  // delivery beat: clash collapse (≤ 600 ms), then the socket seal (300 ms) — ≤ 900 ms total
  let floodUntil = 0;
  let pendingSeals: string[] = [];
  function queueSeal(id: string) {
    pendingSeals.push(id);
    if (pendingSeals.length === 1) queueMicrotask(() => {
      const ids = pendingSeals; pendingSeals = [];
      const delay = Math.max(0, floodUntil - performance.now());
      for (const sid of ids) sealLive(sid, delay);
    });
  }
  function sealLive(socketId: string, delay = 0) {
    if (!L || reducedMotion()) return;
    const g = G.fields.querySelector<SVGGElement>(`[data-sock="${cssEsc(socketId)}"] .lw-seal`);
    if (!g) return;
    const s = L.sockets.find((x) => x.id === socketId); if (!s) return;
    const [x, y] = P(s.gx, s.gy);
    g.style.transformOrigin = `${x}px ${y}px`;
    g.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.18)', opacity: 1, offset: 0.65 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, delay, easing: MOTION.easeOut, fill: 'backwards' });
    busyFor(delay + 300, el);
  }

  function floodLive(roomId: string) {
    if (!L || reducedMotion()) return;
    const r = L.rooms.find((x) => x.room.id === roomId); if (!r) return;
    const anchor = r.gate ? L.stations.get(r.gate)! : r.clash ? L.stations.get(r.clash)! : null;
    const [ax, ay] = anchor ? P(anchor.gx, anchor.gy) : P(r.x1, (r.y0 + r.y1) / 2);
    const poly = document.createElementNS(SVGNS, 'polygon');
    poly.setAttribute('points', pts(r.poly.map(([a, b]) => P(a, b))));
    poly.setAttribute('fill', ORANGE);
    poly.setAttribute('style', `mix-blend-mode:multiply;opacity:0;transform-origin:${ax}px ${ay}px`);
    G.fx.appendChild(poly);
    const a = poly.animate([
      { opacity: 0, transform: 'scale(1)' }, { opacity: 0.45, transform: 'scale(1)', offset: 0.3 },
      { opacity: 0.45, transform: 'scale(1)', offset: 0.42 }, { opacity: 0.9, transform: 'scale(.03)' },
    ], { duration: 600, easing: 'cubic-bezier(.5,0,.2,1)' });
    a.onfinish = () => poly.remove();
    floodUntil = performance.now() + 600;
    busyFor(600, el);
  }

  // ───────── store wiring ─────────
  function onState(st: State) {
    const claims = st.save.levels[st.level.id]?.claims;
    const sig = [st.graph, st.check, st.level, claims];
    const structural = sig.some((v, i) => v !== lastSig[i]);
    if (structural) {
      const levelChanged = st.level !== lastSig[2];
      lastSig = sig;
      render(st);
      if (levelChanged) { userMoved = false; fit(false); }
      else if (!userMoved) fit(true);
      return;
    }
    const hk = st.ui.hoverNode && L ? L.byNode.get(st.ui.hoverNode) ?? null : null;
    const ak = st.ui.activeNode && L ? L.byNode.get(st.ui.activeNode) ?? null : null;
    if (hk !== hoverKey || ak !== activeKey) {
      const activeChanged = ak !== activeKey;
      applyMarks(st); renderPallets(st);
      if (activeChanged && !userMoved) fit(true); // keep the whole active bead string in frame
    }
    applyReplay(st);
    G.pallets.style.display = isReplaying(st) && !hoverKey ? 'none' : '';
  }

  const unsub = store.subscribe(onState);
  const unEv = store.on((e) => {
    if (!L) return;
    const st = store.get();
    if (isReplaying(st)) return;
    if (e.type === 'nodes-added') {
      const added = new Set(e.ids);
      const keys = new Set<string>(); const drop = new Set<string>();
      for (const id of e.ids) { const k = L.byNode.get(id); if (k) { keys.add(k); if (added.has(L.stations.get(k)!.first)) drop.add(k); } }
      stampLive([...keys], drop);
    } else if (e.type === 'delivered') {
      if (!sealedBefore.has(e.socketId)) queueSeal(e.socketId);
    } else if (e.type === 'room-closed') floodLive(e.roomId);
  });

  // ───────── input ─────────
  const stationAt = (t: EventTarget | null): SLay | null => {
    const e = (t as Element | null)?.closest?.('[data-st]');
    const key = e?.getAttribute('data-st');
    return key && L ? L.stations.get(key) ?? null : null;
  };
  let drag: { id: number; x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; s: number; cx: number; cy: number; vx: number; vy: number } | null = null;

  svg.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const s = Math.max(0.2, Math.min(3, pinch.s * d / pinch.d));
      const r = svg.getBoundingClientRect();
      const cx = pinch.cx - r.left, cy = pinch.cy - r.top;
      view.x = cx - (cx - pinch.vx) * (s / pinch.s); view.y = cy - (cy - pinch.vy) * (s / pinch.s); view.s = s;
      applyView(); userMoved = true; return;
    }
    if (drag && ev.pointerId === drag.id) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 3) { drag.moved = true; root.classList.add('is-panning'); }
      if (drag.moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; applyView(); userMoved = true; }
      return;
    }
    const s = stationAt(ev.target);
    const want = s ? s.last : null;
    if (want !== (store.get().ui.hoverNode ?? null)) store.setHover(want);
  });
  svg.addEventListener('pointerleave', () => { if (!drag) store.setHover(null); });
  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: view.s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y };
      drag = null; return;
    }
    if (stationAt(ev.target) || (ev.target as Element).closest('[data-del]')) return;
    drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, moved: false };
    svg.setPointerCapture(ev.pointerId);
  });
  const endPointer = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && ev.pointerId === drag.id) { drag = null; root.classList.remove('is-panning'); }
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('click', (ev) => {
    const del = (ev.target as Element).closest('[data-del]');
    if (del) { store.deleteNode(del.getAttribute('data-del')!); return; }
    const s = stationAt(ev.target);
    if (s) store.setActive(s.last);
  });
  svg.addEventListener('contextmenu', (ev) => {
    const s = stationAt(ev.target);
    if (!s) return;
    ev.preventDefault();
    if (s.kind !== 'inlet') store.deleteNode(s.first);
  });
  svg.addEventListener('dblclick', (ev) => { if (!stationAt(ev.target)) { userMoved = false; fit(true); } });
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect();
    const cx = ev.clientX - r.left, cy = ev.clientY - r.top;
    const k = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.012 : 0.0016));
    const s = Math.max(0.2, Math.min(3, view.s * k));
    view.x = cx - (cx - view.x) * (s / view.s); view.y = cy - (cy - view.y) * (s / view.s); view.s = s;
    applyView(); userMoved = true;
  }, { passive: false });

  // refit whenever the region changes size (the shell shrinks the board on short viewports)
  let lastSize = [0, 0];
  const ro = new ResizeObserver(() => {
    const w = root.clientWidth, h = root.clientHeight;
    if (Math.abs(w - lastSize[0]!) > 4 || Math.abs(h - lastSize[1]!) > 4) { lastSize = [w, h]; userMoved = false; fit(false); }
  });
  ro.observe(root);

  onState(store.get());
  return () => { unsub(); unEv(); ro.disconnect(); cancelAnimationFrame(fitAnim); root.remove(); el.classList.remove('lw-board-host'); };
}

const escTxt = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const cssEsc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
export type { ProofNode };
