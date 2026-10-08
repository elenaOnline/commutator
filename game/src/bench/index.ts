// LEMMA WORKS — the bench (direct manipulation of the active pallet). Owner: bench builder.
//
// Soundness lives in the kernel: every move here is a kernel Offer (store.offers /
// store.fill) committed through store.commitOffer. Gestures are shortcuts to offers.
import './bench.css';
import * as K from '../kernel';
import type { Addr, Fact, Family, GapAddr, NodeId, Offer, Pallet, ProofGraph, ProofNode, RuleRef, Side, Term } from '../kernel/types';
import type { State, Store } from '../state/store';
import { FAMILY, INK, MOTION, reducedMotion } from '../ui/tokens';
import { MATH_CSS, factHTML, termHTML } from '../ui/math';
import { type Hues, renderRail, beadsInline, SEALED_TIP } from './render';
import { fadeIn, playFlip, shakeEl, snapshot } from './anim';
import { type Entry, mountEntry } from './entry';
import * as U from './util';
import { LEVEL_BY_ID } from '../levels/levels';

/** Render the bench for store.ui.activeNode into el. Returns an unmount fn. */
export function mountBench(el: HTMLElement, store: Store): () => void {
  const b = new Bench(el, store);
  return () => b.destroy();
}

// ───────────── latency probe (input → first frame showing the new state) ─────────────
interface LatencyLog { samples: Array<{ gesture: string; frame: number; paint: number }>; }
const LAT: LatencyLog = { samples: [] };
(globalThis as unknown as { __benchLatency: LatencyLog }).__benchLatency = LAT;

type Span = { side: Side; wpath: number[]; s: number; e: number };
type Drag = {
  mode: 'pending' | 'span' | 'lift' | 'supply' | 'none';
  src: 'pallet' | 'ghost';
  rail: HTMLElement;
  el: HTMLElement;
  side: Side; wpath: number[]; i: number;
  x0: number; y0: number; pid: number;
  wasSoleSel: boolean;
  span?: Span;
  float?: HTMLElement;
  over?: HTMLElement | null;
};

interface Group { key: string; name: string; family: Family; offers: Offer[]; kind: 'apply' | 'lift' | 'swap' | 'clash' | 'merge' | 'steps' | 'law' | 'press' }
/** A machine slot in the dock: shown whether or not it fits the pallet. */
interface Slot extends Group { prov: 'given' | 'earned' | 'imported' | 'tool'; tip: string; rule?: RuleRef; why: () => string }
interface Choice { offer: Offer; binds: Array<{ meta: string; addr: Addr }>; cuts: Array<{ side: Side; wpath: number[]; gap: number }> }
interface Machine { key: string; name: string; family: Family; kind: Group['kind']; choices: Choice[]; idx: number | null; single: boolean }

let cssInjected = false;

class Bench {
  private root: HTMLElement;
  private headWhere!: HTMLElement;
  private headArmed!: HTMLElement;
  private stage!: HTMLElement;
  private palletEl!: HTMLElement;
  private goalEl!: HTMLElement;
  private popEl!: HTMLElement;
  private fxEl!: HTMLElement;
  private reasonEl!: HTMLElement;
  private movesEl!: HTMLElement;
  private spoolEl!: HTMLElement;
  private mbarEl!: HTMLElement;
  private resultEl!: HTMLElement;
  /** Choose-on-the-beads mode for a machine (or a one-choice card waiting for its second click). */
  private machine: Machine | null = null;
  /** What the open popover is anchored to (re-placed on content change). */
  private popAnchor: (() => DOMRect | null) | null = null;

  private s: State | null = null;
  private scheduled = false;
  private offerCache = new Map<string, Offer[]>();
  private cacheGraph: ProofGraph | null = null;
  private kernelErr: string | null = null;
  private preview: { offer: Offer; pallet: Pallet } | null = null;
  private pending: { offer: Offer; entry: Entry; where: 'pop' | 'dock' } | null = null;
  private spoolEntry: Entry | null = null;
  private drag: Drag | null = null;
  private kbAnchor: number | null = null;
  private ghostIdx = 0;
  /** Sockets already seen filled (so reopening a solved level does not jump tabs). */
  private filledSeen = new Set<string>();
  private bd = 46;
  private lat: { t0: number; gesture: string } | null = null;
  private flipInk: string | undefined;
  private reasonTimer = 0;
  private armedJob = 0;
  private armedLit: { key: string; spans: Array<Span & { ink: string }>; gaps: Array<{ side: Side; wpath: number[]; gap: number; ink: string }> } | null = null;
  private delivered: NodeId | null = null;
  private unsubs: Array<() => void> = [];
  private popOffers: Offer[] = [];

  constructor(private host: HTMLElement, private store: Store) {
    if (!cssInjected) {
      const st = document.createElement('style'); st.textContent = MATH_CSS; document.head.append(st); cssInjected = true;
    }
    this.root = document.createElement('div');
    this.root.className = 'bn';
    this.root.innerHTML = `
      <div class="bn-head">
        <span class="bn-tag">Bench</span>
        <span class="bn-where"></span>
        <span class="bn-armed"></span>
        <span class="bn-flex"></span>
        <span class="bn-help">drag across beads to select · click a gap to insert · drop a bead on its inverse</span>
      </div>
      <div class="bn-stage">
        <div class="bn-pallet"></div>
        <div class="bn-goal"></div>
        <div class="bn-mbar" hidden></div>
        <div class="bn-result" hidden></div>
        <div class="bn-fx"></div>
      </div>
      <div class="bn-reason" aria-live="polite"></div>
      <div class="bn-dock"><div class="bn-moves"></div><div class="bn-spool"></div></div>
      <div class="bn-pop" hidden></div>`;
    host.textContent = '';
    host.append(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector<T>(sel)!;
    this.headWhere = q('.bn-where'); this.headArmed = q('.bn-armed');
    this.stage = q('.bn-stage'); this.palletEl = q('.bn-pallet'); this.goalEl = q('.bn-goal');
    this.popEl = q('.bn-pop'); this.fxEl = q('.bn-fx'); this.reasonEl = q('.bn-reason');
    this.movesEl = q('.bn-moves'); this.spoolEl = q('.bn-spool');
    this.mbarEl = q('.bn-mbar'); this.resultEl = q('.bn-result');
    this.movesEl.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.movesEl.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

    this.unsubs.push(store.subscribe(() => this.schedule()));
    this.unsubs.push(store.on((e) => {
      if (e.type === 'shake') this.showReason(e.reason, this.palletEl);
      else if (e.type === 'delivered') { this.delivered = e.nodeId; this.schedule(true); }
      else if (e.type === 'level-opened') {
        this.ghostIdx = 0; this.delivered = null; this.machine = null; this.clearReason();
        this.filledSeen = new Set(this.store.get().check.sockets.filter((k) => k.ok).map((k) => k.id));
        this.closePending(); this.closeSpool(); this.schedule(true);
      }
    }));

    this.stage.addEventListener('pointerdown', this.onDown);
    this.stage.addEventListener('click', this.onClick);
    this.stage.addEventListener('dblclick', this.onDbl);
    this.stage.addEventListener('pointerover', this.onOver);
    this.stage.addEventListener('pointerout', this.onOut);
    this.root.addEventListener('pointerenter', () => { const n = this.store.get().ui.activeNode; if (n) this.store.setHover(n); });
    this.root.addEventListener('pointerleave', () => { if (this.store.get().ui.hoverNode === this.store.get().ui.activeNode) this.store.setHover(null); });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancelPtr);
    this.ro = new ResizeObserver(() => { if (!this.preview) { this.fit(); this.applyMachine(); } const b = this.goalEl.querySelector<HTMLElement>('.bn-ghost'); if (b) this.fitGhost(b); });
    this.ro.observe(this.palletEl);
    this.schedule(true);
  }
  private ro: ResizeObserver;
  private forceNext = false;

  destroy() {
    for (const u of this.unsubs) u();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancelPtr);
    this.ro.disconnect();
    this.root.remove();
  }

  // ───────────── helpers ─────────────
  private get L(): U.Labels { return K.labelsOf(this.store.get().level.atoms); }
  /** Display text with powers compressed ((ab)³), falling back to plain. */
  private txt(t: Term): string { try { return K.termText(t, this.L); } catch { return U.plain(t, this.L); } }
  private ftxt(f: Fact): string { try { return K.factText(f, this.L); } catch { return U.plainFact(f, this.L); } }
  private get hues(): Hues { return Object.fromEntries(this.store.get().level.atoms.map((a) => [a.id, a.hue])); }
  private get sealed(): boolean { return !this.store.get().ctx.level.tools.schemas.includes('socks'); }
  private get reduced(): boolean { return reducedMotion() || this.store.get().save.settings.reducedMotion; }
  private activeFact(s: State = this.store.get()): Fact | null {
    const n = s.ui.activeNode;
    return n ? s.check.nodes[n]?.fact ?? null : null;
  }

  private offersFor(sel: U.Sel): Offer[] {
    const s = this.store.get();
    if (this.cacheGraph !== s.graph) { this.offerCache.clear(); this.cacheGraph = s.graph; }
    const key = `${s.ui.activeNode}|${JSON.stringify(sel)}`;
    const hit = this.offerCache.get(key);
    if (hit) return hit;
    let out: Offer[] = [];
    try { out = this.store.offers(sel); this.kernelErr = null; }
    catch (e) { this.kernelErr = String((e as Error).message ?? e); out = []; }
    this.offerCache.set(key, out);
    return out;
  }

  private schedule(force = false) {
    if (force) this.forceNext = true;
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.render());
  }

  // ───────────── main render ─────────────
  private render() {
    this.scheduled = false;
    const s = this.store.get();
    const prev = this.s;
    const force = this.forceNext; this.forceNext = false;
    const graphChanged = !prev || prev.graph !== s.graph || prev.check !== s.check || prev.level !== s.level;
    const nodeChanged = !prev || prev.ui.activeNode !== s.ui.activeNode;
    const selChanged = !prev || JSON.stringify(prev.ui.selection) !== JSON.stringify(s.ui.selection);
    const armedChanged = !prev || prev.ui.armed !== s.ui.armed;
    const claimsChanged = !prev || JSON.stringify(this.claimsOf(prev)) !== JSON.stringify(this.claimsOf(s));
    if (!force && !graphChanged && !nodeChanged && !selChanged && !armedChanged && !claimsChanged) return;
    this.s = s;

    const prevFact = prev ? this.activeFact(prev) : null;
    const fact = this.activeFact(s);
    const palletChanged = graphChanged || nodeChanged;
    if (palletChanged) { this.closePending(); this.preview = null; this.kbAnchor = null; this.machine = null; }
    else if (selChanged) { this.closePending('pop'); if (s.ui.selection) this.machine = null; }
    if (graphChanged && prev && prev.graph !== s.graph) this.clearReason();
    if (nodeChanged && s.ui.activeNode !== this.delivered) this.delivered = null;

    const factChanged = palletChanged && JSON.stringify(prevFact) !== JSON.stringify(fact);
    const animate = factChanged && !!prev && !!prevFact && !!fact && (prevFact.k === 'eq' || prevFact.k === 'neq') && (fact.k === 'eq' || fact.k === 'neq')
      && this.related(prev.ui.activeNode, s.ui.activeNode, prev.graph, s.graph);
    const before = animate ? snapshot(this.palletEl) : null;

    if (fact && this.spoolInline) this.closeSpool();
    this.renderHead(s);
    if (palletChanged || force) { this.renderGoal(null); this.renderPallet(fact, null, true); }
    this.renderGoal(fact);
    this.renderDock(fact);
    this.applySelection();
    this.renderPopover();
    if (armedChanged || palletChanged) this.computeArmed();
    else this.applyArmed();
    this.applyMachine();

    if (before) playFlip(this.palletEl, before, this.fxEl, { reduced: this.reduced, ink: this.flipInk });
    else if (factChanged) fadeIn(this.palletEl, this.reduced);
    this.flipInk = undefined;

    if (this.lat && palletChanged) {
      const { t0, gesture } = this.lat; this.lat = null;
      requestAnimationFrame(() => {
        const frame = performance.now() - t0;
        requestAnimationFrame(() => {
          const paint = performance.now() - t0;
          LAT.samples.push({ gesture, frame: +frame.toFixed(1), paint: +paint.toFixed(1) });
          this.root.dataset.latency = frame.toFixed(1);
        });
      });
    }
  }

  private claimsOf(s: State) { return s.save.levels[s.level.id]?.claims ?? []; }

  private inputsOf(n: ProofNode): NodeId[] {
    switch (n.k) {
      case 'step': return [n.input];
      case 'apply': return n.inputs;
      case 'merge': case 'clash': return [...n.inputs];
      case 'exit': case 'press': return [n.input];
      default: return [];
    }
  }
  /** Is b downstream of a (commit) or upstream (undo / click back)? */
  private related(a: NodeId | null, b: NodeId | null, ga: ProofGraph, gb: ProofGraph): boolean {
    if (!a || !b) return false;
    const reach = (from: NodeId, to: NodeId, g: ProofGraph) => {
      const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
      let frontier = [from]; const seen = new Set<NodeId>();
      for (let d = 0; d < 12 && frontier.length; d++) {
        const next: NodeId[] = [];
        for (const id of frontier) {
          if (id === to) return true;
          if (seen.has(id)) continue; seen.add(id);
          const n = byId.get(id); if (n) next.push(...this.inputsOf(n));
        }
        frontier = next;
      }
      return false;
    };
    return reach(b, a, gb) || reach(a, b, ga);
  }

  // ───────────── head ─────────────
  private renderHead(s: State) {
    const id = s.ui.activeNode;
    const n = id ? s.graph.nodes.find((x) => x.id === id) : undefined;
    if (!n) { this.headWhere.textContent = 'no pallet on the bench'; return; }
    const later = this.laterStations(id!, s.graph);
    let what: string;
    switch (n.k) {
      case 'start': what = 'spool'; break;
      case 'given': what = `given ${s.level.givens.find((g) => g.id === n.givenId)?.name ?? ''}`; break;
      case 'assume': what = 'assumption'; break;
      case 'apply': what = 'machine output'; break;
      case 'press': what = 'Lagrange press output'; break;
      case 'clash': what = 'clash'; break;
      case 'exit': what = 'room exit'; break;
      case 'merge': what = 'merge'; break;
      default: what = 'belt';
    }
    const room = n.scope !== K.ROOT ? s.graph.rooms.find((r) => r.id === n.scope) : undefined;
    const roomTxt = room ? ` · inside the room (suppose ${this.txt(room.l)} ${room.kind === 'suppose' ? '=' : '≠'} ${this.txt(room.r)})` : '';
    this.headWhere.innerHTML = `${what}${roomTxt}${later ? ` · <span class="bn-warn">mid-belt: a new move replaces ${later} later station${later > 1 ? 's' : ''} (undoable)</span>` : ''}`;
  }
  private laterStations(id: NodeId, g: ProofGraph): number {
    const st = new Set<string>();
    let cur = id;
    for (;;) {
      const nx = g.nodes.find((n) => n.k === 'step' && n.input === cur);
      if (!nx) break;
      st.add(nx.meta?.station ?? nx.id); cur = nx.id;
    }
    return st.size;
  }

  // ───────────── pallet ─────────────
  private renderPallet(fact: Fact | null, preview: { offer: Offer; pallet: Pallet } | null, refit: boolean) {
    const P = this.palletEl;
    P.textContent = '';
    P.className = 'bn-pallet';
    if (!fact) {
      const s = this.store.get();
      const msg = s.ui.activeNode ? (s.check.nodes[s.ui.activeNode]?.error ?? 'this node has no fact') : null;
      P.innerHTML = `<div class="bn-empty"><div class="bn-empty-t">${msg ? esc(msg) : 'Nothing on the bench yet — start a spool, or click a pallet on the board.'}</div></div>`;
      if (this.spoolEntry && this.spoolInline) P.querySelector('.bn-empty')!.append(this.spoolEntry.el);
      else { if (this.spoolEntry) this.closeSpool(); this.openSpool(true); }
      return;
    }
    const show: Fact = preview?.pallet ?? fact;
    if (preview && (preview.pallet.k === 'bot' || preview.pallet.k === 'size')) {
      P.append(this.cardFor(preview.pallet, true));
      P.classList.add('is-preview');
      return;
    }
    if (show.k === 'eq' || show.k === 'neq') {
      const eqn = document.createElement('div');
      eqn.className = 'bn-eqn';
      const ink = preview ? FAMILY[preview.offer.family].ink : undefined;
      let diffs: { l?: U.DiffItem[]; r?: U.DiffItem[]; swapped?: boolean } = {};
      if (preview && (fact.k === 'eq' || fact.k === 'neq')) {
        const p = preview.pallet as { l: Term; r: Term };
        const swapped = U.sig(p.l) === U.sig(fact.r) && U.sig(p.r) === U.sig(fact.l) && U.sig(p.l) !== U.sig(p.r);
        const dl = U.diffWords(U.wordOf(fact.l), U.wordOf(p.l));
        const dr = U.diffWords(U.wordOf(fact.r), U.wordOf(p.r));
        const kept = [...dl, ...dr].filter((d) => d.op === 'keep').length;
        const total = Math.max(U.wordOf(p.l).length + U.wordOf(p.r).length, 1);
        if (!swapped && kept / total >= 0.4) diffs = { l: dl, r: dr };
        else { eqn.classList.add('is-preview-full'); if (swapped) eqn.classList.add('is-swap'); diffs = { swapped }; }
        P.classList.add('is-preview');
        P.style.setProperty('--pv-ink', ink ?? INK.navy);
      }
      const side = (sd: Side, t: Term, d?: U.DiffItem[]) => {
        const w = document.createElement('div');
        w.className = `bn-side bn-side-${sd}`;
        w.append(renderRail(t, { side: sd, L: this.L, hues: this.hues, sealed: this.sealed, src: 'pallet', gaps: !preview, diff: d, ink }));
        return w;
      };
      const rel = document.createElement('div');
      rel.className = `bn-rel${show.k === 'neq' ? ' is-neq' : ''}`;
      rel.textContent = show.k === 'eq' ? '=' : '≠';
      if (diffs.swapped) rel.innerHTML = `<span class="bn-swapmark">⇄</span>${rel.textContent}`;
      eqn.append(side('l', show.l, diffs.l), rel, side('r', show.r, diffs.r));
      P.append(eqn);
      if (show.k === 'neq') P.classList.add('is-neq');
      this.fit(refit);
      return;
    }
    P.append(this.cardFor(show, false));
  }

  /** Read-only cards for bot / size / law / cond. */
  private cardFor(f: Fact, preview: boolean): HTMLElement {
    const c = document.createElement('div');
    const L = this.L;
    if (f.k === 'bot') {
      c.className = 'bn-card bn-card-bot';
      c.innerHTML = `<div class="bn-bot">⊥</div><div class="bn-card-cap">${preview ? 'clash: the room becomes a contradiction and closes' : 'Contradiction. The room that held this is closed.'}</div>`;
      return c;
    }
    if (f.k === 'size') {
      const s = this.store.get();
      c.className = 'bn-card bn-card-size';
      c.innerHTML = `<div class="bn-card-math math">|<i>G</i>| = ${f.n}</div>`;
      const b = document.createElement('button');
      b.className = 'bn-press';
      b.innerHTML = `Run the Lagrange press <span class="bn-dim">→ ∀<i>x</i>. <i>x</i><sup>${f.n}</sup> = <i>e</i></span>`;
      const ok = s.ctx.level.tools.press;
      b.disabled = !ok || preview;
      if (!ok) b.title = 'The Lagrange press is not on this floor';
      b.addEventListener('click', (e) => {
        const id = this.store.get().ui.activeNode; if (!id) return;
        this.lat = { t0: e.timeStamp, gesture: 'press' };
        const r = this.store.press(id);
        if (r.ok) this.store.setActive(r.value); else this.showReason(r.error, b);
      });
      c.append(b);
      const cap = document.createElement('div'); cap.className = 'bn-card-cap';
      cap.textContent = 'Imported: Lagrange’s theorem (the order of an element divides |G|).';
      c.append(cap);
      return c;
    }
    c.className = 'bn-card bn-card-law';
    c.innerHTML = `<div class="bn-card-math math">${factHTML(f, L)}</div><div class="bn-card-cap">${f.k === 'law'
      ? 'A law card. Select a span or a gap on any pallet: wherever it fits, it shows up in the offers.'
      : 'A conditional card. Feed it a pallet that matches its premise: it shows up among that pallet’s moves.'}</div>`;
    return c;
  }

  /** Fit the equation: inline if it fits, else stacked, else shrink the beads. */
  private fit(refit = true) {
    const P = this.palletEl;
    const eqn = P.querySelector<HTMLElement>('.bn-eqn');
    if (!eqn) return;
    const avail = P.clientWidth - 8;
    if (avail <= 0) return;
    if (refit) {
      // inline first, shrinking to 32px; only then the two-line (align*) layout, shrinking further
      eqn.classList.remove('is-stacked');
      this.bd = 46;
      P.style.setProperty('--bd', `${this.bd}px`);
      for (let k = 0; k < 6 && eqn.scrollWidth > avail && this.bd > 32; k++) {
        this.bd = Math.max(32, Math.floor(this.bd * Math.max(0.7, avail / eqn.scrollWidth)));
        P.style.setProperty('--bd', `${this.bd}px`);
      }
      if (eqn.scrollWidth > avail) {
        eqn.classList.add('is-stacked');
        this.bd = 46;
        P.style.setProperty('--bd', `${this.bd}px`);
      }
    } else {
      P.style.setProperty('--bd', `${this.bd}px`);
      if (this.palletEl.dataset.stacked === '1') eqn.classList.add('is-stacked');
    }
    for (let k = 0; k < 6 && eqn.scrollWidth > avail && this.bd > 22; k++) {
      this.bd = Math.max(22, Math.floor(this.bd * Math.max(0.6, avail / eqn.scrollWidth)));
      P.style.setProperty('--bd', `${this.bd}px`);
    }
    // vertical fit too
    const availH = P.clientHeight - 4;
    for (let k = 0; k < 6 && availH > 40 && eqn.scrollHeight > availH && this.bd > 22; k++) {
      this.bd = Math.max(22, Math.floor(this.bd * Math.max(0.7, availH / eqn.scrollHeight)));
      P.style.setProperty('--bd', `${this.bd}px`);
    }
    P.dataset.stacked = eqn.classList.contains('is-stacked') ? '1' : '0';
  }

  // ───────────── selection ─────────────
  private toSpan(sel: Addr): Span | null {
    const f = this.activeFact();
    if (!f || (f.k !== 'eq' && f.k !== 'neq')) return null;
    const rail = sel.side === 'l' ? f.l : f.r;
    if (sel.range) return { side: sel.side, wpath: sel.path, s: sel.range[0], e: sel.range[1] };
    if (!sel.path.length) return { side: sel.side, wpath: [], s: 0, e: U.wordOf(rail).length };
    const parent = sel.path.slice(0, -1);
    const pt = U.termAtPath(rail, parent);
    const last = sel.path[sel.path.length - 1]!;
    if (pt?.k === 'mul') return { side: sel.side, wpath: parent, s: last, e: last + 1 };
    const t = U.termAtPath(rail, sel.path);
    return t ? { side: sel.side, wpath: sel.path, s: 0, e: U.wordOf(t).length } : null;
  }
  private spanAddr(sp: Span): Addr { return { side: sp.side, path: sp.wpath, range: [sp.s, sp.e] }; }

  private factorEls(sp: Span, src = '.bn-src-pallet'): HTMLElement[] {
    const out: HTMLElement[] = [];
    const k = U.pathKey(sp.wpath);
    this.palletEl.querySelectorAll<HTMLElement>(`${src} [data-i][data-side="${sp.side}"][data-wpath="${k}"]`).forEach((el) => {
      const i = Number(el.dataset.i);
      if (i >= sp.s && i < sp.e) out.push(el);
    });
    return out;
  }
  private gapEl(side: Side, wpath: number[], gap: number): HTMLElement | null {
    return this.palletEl.querySelector<HTMLElement>(`.bn-src-pallet [data-gap="${gap}"][data-side="${side}"][data-wpath="${U.pathKey(wpath)}"]`);
  }

  private paintSpan(sp: Span | null, cls: string) {
    this.palletEl.querySelectorAll(`.${cls}, .${cls}-in`).forEach((e) => e.classList.remove(cls, `${cls}-in`));
    if (!sp) return;
    for (const el of this.factorEls(sp)) el.classList.add(cls);
    for (let g = sp.s + 1; g < sp.e; g++) this.gapEl(sp.side, sp.wpath, g)?.classList.add(`${cls}-in`);
  }

  private applySelection() {
    const sel = this.store.get().ui.selection;
    this.palletEl.querySelectorAll('.is-caret').forEach((e) => e.classList.remove('is-caret'));
    if (U.isGap(sel)) { this.paintSpan(null, 'is-sel'); this.gapEl(sel.side, sel.path, sel.gap)?.classList.add('is-caret'); return; }
    this.paintSpan(U.isSpan(sel) ? this.toSpan(sel) : null, 'is-sel');
  }

  private selRect(): DOMRect | null {
    const sel = this.store.get().ui.selection;
    let els: HTMLElement[] = [];
    if (U.isGap(sel)) { const g = this.gapEl(sel.side, sel.path, sel.gap); if (g) els = [g]; }
    else if (U.isSpan(sel)) { const sp = this.toSpan(sel); if (sp) els = this.factorEls(sp); }
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    const r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    return new DOMRect(l, t, r - l, b - t);
  }

  private selTerm(sp: Span, src: 'pallet' | 'ghost' = 'pallet'): Term | null {
    let rail: Term | undefined;
    if (src === 'pallet') {
      const f = this.activeFact();
      if (!f || (f.k !== 'eq' && f.k !== 'neq')) return null;
      rail = sp.side === 'l' ? f.l : f.r;
    } else {
      const g = this.ghostTarget()?.pallet;
      if (!g || (g.k !== 'eq' && g.k !== 'neq')) return null;
      rail = sp.side === 'l' ? g.l : g.r;
    }
    const wt = U.termAtPath(rail, sp.wpath);
    return wt ? U.sliceTerm(U.wordOf(wt), sp.s, sp.e) : null;
  }

  // ───────────── offers popover ─────────────
  private orderOffers(os: Offer[]): Offer[] {
    const armed = this.store.get().ui.armed;
    if (!armed) return os;
    return [...os.filter((o) => U.offerUses(o, armed)), ...os.filter((o) => !U.offerUses(o, armed))];
  }

  private renderPopover() {
    const pop = this.popEl;
    const s = this.store.get();
    const sel = s.ui.selection;
    if (this.pending) return; // an entry lives there
    pop.textContent = '';
    this.popOffers = [];
    const f = this.activeFact();
    if (!sel || !f || f.k !== 'eq') { pop.hidden = true; this.popAnchor = null; return; }
    const offers = this.orderOffers(this.offersFor(sel));
    this.popOffers = offers;
    const head = document.createElement('div');
    head.className = 'bn-pop-head';
    if (U.isGap(sel)) head.innerHTML = `Insert here <span class="bn-dim">— anything equal to <i class="math">e</i></span>`;
    else {
      const sp = this.toSpan(sel);
      const t = sp ? this.selTerm(sp) : null;
      head.innerHTML = '<span class="bn-dim">rewrite</span> ';
      if (t) head.append(beadsInline(t, this.L, this.hues, this.sealed));
    }
    pop.append(head);
    if (!offers.length) {
      const none = document.createElement('div');
      none.className = 'bn-none';
      none.textContent = this.kernelErr ? `kernel not ready: ${this.kernelErr}` : U.isGap(sel) ? 'nothing can be inserted here' : this.noOfferReason(sel);
      pop.append(none);
    }
    const list = document.createElement('div');
    list.className = 'bn-offers';
    offers.forEach((o, i) => list.append(this.offerRow(o, i)));
    pop.append(list);
    pop.hidden = false;
    this.popAnchor = () => this.selRect();
    this.placePop();
  }

  private noOfferReason(sel: Addr): string {
    const sp = this.toSpan(sel);
    const t = sp ? this.selTerm(sp) : null;
    if (!t) return 'no rule applies here';
    return `no rule in this workshop rewrites ${this.txt(t)} on its own — try a wider or narrower span`;
  }

  /** The rectangle popovers must stay inside: the bench (it clips) ∩ the viewport. */
  private clipRect() {
    const r = this.root.getBoundingClientRect();
    return { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, window.innerHeight), left: Math.max(r.left, 0), right: Math.min(r.right, window.innerWidth), root: r };
  }

  /** Place the popover against its anchor: below if it fits, else above, else the larger side with internal scroll. */
  private placePop() {
    const pop = this.popEl;
    if (pop.hidden) return;
    const clip = this.clipRect();
    const a = this.popAnchor?.() ?? new DOMRect(clip.left + (clip.right - clip.left) / 2, clip.top + 30, 0, 0);
    pop.style.maxHeight = 'none';
    pop.style.left = '0px'; pop.style.top = '0px';
    const pw = pop.offsetWidth, ph = pop.scrollHeight;
    const below = clip.bottom - a.bottom - 10, above = a.top - clip.top - 10;
    let top: number, maxH: number;
    if (ph <= below) { top = a.bottom + 8; maxH = below; }
    else if (ph <= above) { top = a.top - 8 - ph; maxH = above; }
    else if (below >= above) { top = a.bottom + 8; maxH = below; }
    else { maxH = above; top = a.top - 8 - Math.min(ph, above); }
    maxH = Math.max(72, maxH);
    top = Math.max(clip.top + 4, Math.min(top, clip.bottom - Math.min(ph, maxH) - 4));
    let left = a.left + a.width / 2 - pw / 2;
    left = Math.max(clip.left + 4, Math.min(left, clip.right - pw - 4));
    pop.style.maxHeight = `${maxH}px`;
    pop.style.left = `${left - clip.root.left}px`;
    pop.style.top = `${top - clip.root.top}px`;
  }

  private offerRow(o: Offer, i: number): HTMLElement {
    const fam = FAMILY[o.family];
    const b = document.createElement('button');
    b.className = 'bn-offer';
    b.style.setProperty('--ink', fam.ink);
    b.style.setProperty('--ink-text', fam.text);
    const pv = o.preview ? `<span class="bn-offer-pv math">${factHTML(o.preview, this.L)}</span>`
      : o.needs.length ? `<span class="bn-offer-need">choose ${o.needs.map((m) => `<i>${m}</i>`).join(', ')}…</span>` : '';
    b.innerHTML = `${i < 9 ? `<kbd>${i + 1}</kbd>` : '<kbd></kbd>'}<span class="bn-chipdot" title="${fam.label}"><b>${fam.glyph}</b></span><span class="bn-offer-l">${esc(o.label)}</span>${pv}`;
    b.title = `${fam.label} · ${o.label}`;
    b.addEventListener('pointerenter', () => this.setPreview(o));
    b.addEventListener('pointerleave', () => this.setPreview(null));
    b.addEventListener('click', (e) => this.choose(o, e.timeStamp, 'offer click', () => this.selRect()));
    return b;
  }

  private setPreview(o: Offer | null) {
    if (this.drag) return;
    const next = o && o.preview ? { offer: o, pallet: o.preview } : null;
    if (!next && !this.preview) return;
    if (next && this.preview && this.preview.offer.key === next.offer.key && U.palletEq(this.preview.pallet, next.pallet)) return;
    this.preview = next;
    this.renderPallet(this.activeFact(), next, false);
    if (!next) { this.applySelection(); this.applyArmed(); this.applyMachine(); }
  }

  /** Apply an offer: commit if ready, else open the term entry for its needs. */
  private choose(o: Offer, t0: number, gesture: string, anchor: () => DOMRect | null) {
    if (o.needs.length) { this.openEntry(o, anchor); return; }
    this.commit(o, t0, gesture);
  }

  private commit(o: Offer, t0: number, gesture: string) {
    this.lat = { t0, gesture };
    this.flipInk = FAMILY[o.family].ink;
    this.preview = null;
    const r = this.store.commitOffer(o);
    if (!r.ok) { this.lat = null; this.renderPallet(this.activeFact(), null, false); this.applySelection(); this.applyMachine(); }
  }

  // ───────────── term entry for offers with needs (lives in the popover) ─────────────
  private openEntry(o: Offer, anchor: () => DOMRect | null) {
    this.closePending();
    this.exitMachine(false);
    const s = this.store.get();
    const L = this.L;
    const fam = FAMILY[o.family];
    const entry = mountEntry({
      title: `<span class="bn-chipdot" style="--ink:${fam.ink}"><b>${fam.glyph}</b></span> ${esc(o.label)}`,
      metas: o.needs, atoms: s.level.atoms, L, hues: this.hues,
      parse: (src) => K.parseTerm(src, s.level.atoms),
      submitLabel: 'Apply ↵',
      validate: (vals) => {
        const r = this.store.fill(o, vals);
        if (!r.ok) { this.setPreviewPallet(null); return r; }
        if (r.offer.preview) { this.setPreviewPallet(r.offer); return { ok: true, html: factHTML(r.offer.preview, L) }; }
        return { ok: true, html: '' };
      },
      quick: this.goalQuick(),
      onSubmit: (vals) => {
        const r = this.store.fill(o, vals);
        if (!r.ok) return r.error;
        this.closePending();
        this.commit(r.offer, performance.now(), 'entry');
        return null;
      },
      onCancel: () => { this.closePending(); this.renderPopover(); },
    });
    this.popEl.textContent = '';
    this.popEl.hidden = false;
    this.popEl.append(entry.el);
    this.popAnchor = anchor;
    this.pending = { offer: o, entry, where: 'pop' };
    this.root.classList.add('is-supplying');
    this.placePop();
    entry.focus();
  }
  private setPreviewPallet(o: Offer | null) {
    const next = o?.preview ? { offer: o, pallet: o.preview } : null;
    this.preview = next;
    this.renderPallet(this.activeFact(), next, false);
    if (!next) { this.applySelection(); this.applyArmed(); }
    this.placePop();
  }
  private closePending(only?: 'pop' | 'dock') {
    if (!this.pending || (only && this.pending.where !== only)) return;
    this.pending.entry.destroy();
    this.pending = null;
    this.root.classList.remove('is-supplying');
    this.popEl.hidden = true;
    this.popAnchor = null;
    if (this.preview) { this.preview = null; this.renderPallet(this.activeFact(), null, false); this.applySelection(); this.applyMachine(); }
  }

  private goalQuick(): Array<{ label: string; term: Term }> {
    const g = this.ghostTarget()?.pallet;
    if (!g || (g.k !== 'eq' && g.k !== 'neq')) return [];
    return [{ label: 'goal L', term: g.l }, { label: 'goal R', term: g.r }];
  }

  // ───────────── dock: one compact card per machine + new spool ─────────────
  private groupKey(o: Offer): string {
    if (o.group) return o.group;
    const k = o.kind;
    if (k.k === 'apply') return k.rule.k === 'schema' ? `schema:${k.rule.id}${k.rule.mirror ? ':op' : ''}` : k.rule.k === 'node' ? `node:${k.rule.id}` : `axiom:${k.rule.id}`;
    if (k.k === 'clash') return 'clash';
    if (k.k === 'merge') return 'merge';
    const op = k.ops[0];
    if (op?.k === 'lift') return 'lift';
    if (op?.k === 'swap') return 'swap';
    return `steps:${o.key}`;
  }
  private groupOffers(offers: Offer[]): Group[] {
    const s = this.store.get();
    const out = new Map<string, Group>();
    for (const o of offers) {
      const key = this.groupKey(o);
      let g = out.get(key);
      if (!g) {
        let name = o.label;
        let kind: Group['kind'] = 'steps';
        const k = o.kind;
        if (k.k === 'apply') {
          kind = 'apply';
          if (k.rule.k === 'schema') name = `${s.ctx.registry[k.rule.id]?.name ?? k.rule.id}${k.rule.mirror ? ' ᵒᵖ' : ''}`;
          else if (k.rule.k === 'node') {
            const rid = k.rule.id;
            const gn = s.graph.nodes.find((n) => n.id === rid);
            name = gn?.k === 'given' ? `Hypothesis ${s.level.givens.find((x) => x.id === gn.givenId)?.name ?? ''}` : 'Hypothesis';
          }
        } else if (key === 'clash') { kind = 'clash'; name = 'Clash'; }
        else if (key === 'merge') { kind = 'merge'; name = 'Merge'; }
        else if (key === 'lift') { kind = 'lift'; name = 'Multiply both sides'; }
        else if (key === 'swap') { kind = 'swap'; name = 'Swap sides'; }
        g = { key, name, family: o.family, offers: [], kind };
        out.set(key, g);
      }
      g.offers.push(o);
    }
    for (const g of out.values()) if (g.kind === 'clash' && g.offers.length === 1) g.name = g.offers[0]!.label.replace(/^./, (c) => c.toUpperCase());
    return [...out.values()];
  }

  /** Every machine the level makes available, in a stable order, with whatever offers fit right now. */
  private machineSlots(fact: Fact | null): Slot[] {
    const s = this.store.get();
    const tools = s.ctx.level.tools;
    const offers = fact && (fact.k === 'eq' || fact.k === 'neq') ? this.offersFor(null) : [];
    const groups = new Map(this.groupOffers(offers).map((g) => [g.key, g] as const));
    const take = (key: string) => { const g = groups.get(key); groups.delete(key); return g?.offers ?? []; };
    const slots: Slot[] = [];
    const premise = (card: { premises: Array<{ k: 'eq' | 'neq'; l: Term; r: Term }> } | null) =>
      card?.premises.map((p) => this.ftxt(p as Fact)).join(' and ') ?? '';
    for (const id of tools.schemas) {
      const sc = s.ctx.registry[id];
      if (!sc) continue;
      const n = sc.fromLevel ? LEVEL_BY_ID[sc.fromLevel]?.index : undefined;
      const prov: Slot['prov'] = sc.origin === 'import' ? 'imported' : 'earned';
      const tip = prov === 'earned' ? `Earned (Lemma ${n ?? '?'}) — ${sc.textbook}` : `Imported — ${sc.textbook} (proof not in this game)`;
      if (sc.card.k === 'cond') {
        const variants = sc.mirrorable ? [false, true] : [false];
        for (const mirror of variants) {
          const card = mirror ? K.mirrorCard(sc.card) as typeof sc.card : sc.card;
          const name = `${sc.name}${mirror ? ' ᵒᵖ' : ''}`;
          const hint = id === 'cancel' ? (mirror ? ' (a common right factor)' : ' (a common left factor)') : '';
          slots.push({ key: `schema:${id}${mirror ? ':op' : ''}`, name, family: 'lemma', kind: 'apply', prov, tip, rule: { k: 'schema', id, mirror },
            offers: take(`schema:${id}${mirror ? ':op' : ''}`), why: () => `${name} needs a pallet of the form ${premise(card as never)}${hint}` });
        }
      } else {
        const law = sc.card;
        slots.push({ key: `law:${id}`, name: sc.name, family: 'lemma', kind: 'law', prov, tip: `${tip} · a rewrite: ${this.ftxt({ k: 'eq', l: law.l, r: law.r })}`, rule: { k: 'schema', id },
          offers: [], why: () => '' });
      }
    }
    for (const g of s.level.givens) {
      if (g.fact.k !== 'cond') continue;
      const card = g.fact;
      const key = `node:g:${g.id}`;
      slots.push({ key, name: `Hypothesis ${g.name}`, family: 'given', kind: 'apply', prov: 'given', tip: `Given ${g.name}: ${this.ftxt(card)}`, rule: { k: 'node', id: `g:${g.id}` },
        offers: take(key), why: () => `${g.name} needs ${premise(card)} on the bench` });
    }
    if (tools.press) slots.push({ key: 'press', name: 'Lagrange press', family: 'lemma', kind: 'press', prov: 'imported', tip: 'Imported — Lagrange\u2019s theorem: in a group of order n, xⁿ = e (proof not in this game)', offers: [], why: () => 'the Lagrange press needs |G| = n' });
    if (tools.lift) slots.push({ key: 'lift', name: 'Multiply', family: 'structure', kind: 'lift', prov: 'tool', tip: 'Multiply both sides: L = R ⇒ tL = tR and Lt = Rt', offers: take('lift'), why: () => 'Multiply both sides needs an equation on the bench' });
    slots.push({ key: 'swap', name: 'Swap', family: 'equation', kind: 'swap', prov: 'tool', tip: 'Swap sides (symmetry): L = R ⇒ R = L', offers: take('swap'), why: () => 'Swap needs an equation or a denial on the bench' });
    if (tools.suppose || tools.classical) slots.push({ key: 'clash', name: 'Clash', family: 'contradiction', kind: 'clash', prov: 'tool', tip: 'L = R and L ≠ R give ⊥', offers: take('clash'), why: () => 'Clash needs an equation and its denial' });
    if (tools.merge) slots.push({ key: 'merge', name: 'Merge', family: 'equation', kind: 'merge', prov: 'tool', tip: 'X = M and Y = M give X = Y', offers: take('merge'), why: () => 'Merge needs two equations with the same right side' });
    // anything the kernel offers that no slot claims (defensive)
    for (const g of groups.values()) slots.push({ ...g, prov: g.family === 'given' ? 'given' : 'tool', tip: g.name, why: () => '' });
    return slots;
  }

  private renderDock(fact: Fact | null) {
    const M = this.movesEl;
    const scroll = M.scrollLeft;
    M.textContent = '';
    const slots = this.machineSlots(fact);
    this.dockGroups = slots;
    const lab = document.createElement('span');
    lab.className = 'bn-dock-l';
    lab.textContent = this.kernelErr ? `kernel not ready: ${this.kernelErr}` : 'Machines';
    M.append(lab);
    const sel = !!this.store.get().ui.selection;
    const armedKey = this.armedGroupKey();
    slots.forEach((g, i) => {
      const fam = FAMILY[g.family];
      const b = document.createElement('button');
      const on = this.machine?.key === g.key;
      b.className = `bn-mcard prov-${g.prov}${g.kind === 'clash' ? ' is-clash' : ''}${on ? ' is-on' : ''}${armedKey === g.key || (g.kind === 'law' && armedKey === `schema:${(g.rule as { id: string }).id}`) ? ' is-armed' : ''}`;
      b.style.setProperty('--ink', fam.ink);
      b.dataset.group = g.key;
      const glyph = g.prov === 'given' ? FAMILY.given.glyph : g.prov === 'imported' ? 'Λ' : fam.glyph;
      const hint = on && this.machine?.single ? '<span class="bn-mcard-go">again ↵</span>' : '';
      const tag = g.prov === 'imported' ? '<span class="bn-mcard-tag">imported</span>' : '';
      b.innerHTML = `${!sel && i < 9 ? `<kbd>${i + 1}</kbd>` : ''}<span class="bn-chipdot"><b>${glyph}</b></span><span class="bn-mcard-l">${esc(g.name)}</span>${tag}${hint}`;
      b.title = g.tip;
      b.addEventListener('click', (e) => this.openSlot(g, e.timeStamp, b));
      M.append(b);
    });
    M.scrollLeft = scroll;
    this.renderSpoolButton();
  }

  /** Click on a machine card: choose on the beads if it fits; otherwise say what it needs. */
  private openSlot(g: Slot, t0: number, card: HTMLElement) {
    const s = this.store.get();
    if (g.kind === 'law') {
      const r = g.rule!;
      const armed = s.ui.armed;
      this.exitMachine(true);
      this.store.setArmed(armed && U.ruleEq(armed, r) ? null : r);
      return;
    }
    if (g.kind === 'press') {
      const sizeNode = s.graph.nodes.find((n) => n.k === 'given' && s.check.nodes[n.id]?.fact?.k === 'size');
      if (!sizeNode) { this.refuse(g.why(), card); return; }
      const pressed = s.graph.nodes.find((n) => n.k === 'press' && n.input === sizeNode.id);
      const id = pressed?.id ?? (() => { const r = this.store.press(sizeNode.id); return r.ok ? r.value : null; })();
      if (id) this.store.setArmed({ k: 'node', id });
      return;
    }
    if (!g.offers.length) { this.refuse(g.why() || `${g.name} does not fit this pallet`, card); return; }
    this.openGroup(g, t0, card);
  }
  private refuse(msg: string, card: HTMLElement) {
    if (this.machine) this.exitMachine(true);
    this.showReason(msg, card);
  }
  private dockGroups: Slot[] = [];

  private renderSpoolButton() {
    if (this.spoolEntry && !this.spoolInline) return;
    if (this.spoolEl.querySelector('.bn-spoolbtn')) return;
    this.spoolEl.textContent = '';
    const b = document.createElement('button');
    b.className = 'bn-spoolbtn';
    b.innerHTML = '<span class="bn-plus">+</span> New spool';
    b.title = 'Start a fresh belt t = t';
    b.addEventListener('click', () => { if (this.spoolEntry) this.spoolEntry.focus(); else this.openSpool(false); });
    this.spoolEl.append(b);
  }
  /** inline: the empty-bench version (in the pallet area); otherwise a popover above the button. */
  private openSpool(inline: boolean) {
    const s = this.store.get();
    this.closePending();
    this.exitMachine(false);
    const entry = mountEntry({
      title: 'New spool <span class="math"><i>t</i> = <i>t</i></span>',
      metas: ['t'], atoms: s.level.atoms, L: this.L, hues: this.hues,
      parse: (src) => K.parseTerm(src, s.level.atoms),
      submitLabel: 'Start ↵',
      quick: this.goalQuick().map((q) => ({ ...q, label: q.label === 'goal L' ? 'goal’s left side' : 'goal’s right side' })),
      onSubmit: (vals) => {
        const t = vals.t!;
        let r: ReturnType<Store['addStart']>;
        try { r = this.store.addStart(t); } catch (e) { return String((e as Error).message ?? e); }
        if (!r.ok) return r.error;
        this.closeSpool();
        return null;
      },
      onCancel: () => { if (!this.spoolInline) this.closeSpool(); },
    });
    this.spoolEntry = entry;
    this.spoolInline = inline;
    if (inline) {
      this.palletEl.querySelector('.bn-empty')?.append(entry.el);
    } else {
      this.popEl.textContent = '';
      this.popEl.hidden = false;
      this.popEl.append(entry.el);
      const btn = this.spoolEl.querySelector('.bn-spoolbtn');
      this.popAnchor = () => btn?.getBoundingClientRect() ?? null;
      this.placePop();
    }
    this.root.classList.add('is-spooling');
    entry.focus();
  }
  private spoolInline = false;
  private closeSpool() {
    const wasPop = this.spoolEntry && !this.spoolInline;
    this.spoolEntry?.destroy();
    this.spoolEntry = null;
    this.spoolInline = false;
    this.root.classList.remove('is-spooling');
    if (wasPop) { this.popEl.hidden = true; this.popAnchor = null; }
    this.renderSpoolButton();
  }

  // ───────────── machine mode: choose on the beads ─────────────
  private armedGroupKey(): string | null {
    const a = this.store.get().ui.armed;
    if (!a) return null;
    return a.k === 'schema' ? `schema:${a.id}${a.mirror ? ':op' : ''}` : a.k === 'node' ? `node:${a.id}` : null;
  }

  private openGroup(g: Group, t0: number, card: HTMLElement) {
    const m = this.machine;
    if (m && m.key === g.key) {
      if (m.single) this.commitChoice(0, t0);
      else this.exitMachine(true);
      return;
    }
    if (this.store.get().ui.selection) this.store.setSelection(null);
    this.closePending();
    if (this.spoolEntry && !this.spoolInline) this.closeSpool();
    if (g.kind !== 'lift' && g.offers.length === 1 && g.offers[0]!.needs.length) {
      this.openEntry(g.offers[0]!, () => card.getBoundingClientRect());
      return;
    }
    const f = this.activeFact();
    if (!f || (f.k !== 'eq' && f.k !== 'neq')) return;
    const choices: Choice[] = g.offers.map((o) => {
      const binds = o.bindings ?? [];
      const cuts: Choice['cuts'] = [];
      const k = o.kind;
      if (k.k === 'steps' && k.ops[0]?.k === 'lift') {
        const right = k.ops[0].side === 'right';
        cuts.push({ side: 'l', wpath: [], gap: right ? U.wordOf(f.l).length : 0 });
        cuts.push({ side: 'r', wpath: [], gap: right ? U.wordOf(f.r).length : 0 });
      } else {
        // a cut where two different metas meet on the same word
        const ranged = binds.filter((b) => b.addr.range);
        for (const a of ranged) for (const b of ranged) {
          if (a.meta !== b.meta && a.addr.side === b.addr.side && U.pathKey(a.addr.path) === U.pathKey(b.addr.path) && a.addr.range![1] === b.addr.range![0])
            cuts.push({ side: a.addr.side, wpath: a.addr.path, gap: a.addr.range![1] });
        }
      }
      return { offer: o, binds, cuts };
    });
    const single = g.kind !== 'lift' && choices.length === 1;
    this.machine = { key: g.key, name: g.name, family: g.family, kind: g.kind, choices, idx: single ? 0 : null, single };
    this.renderDock(f);
    this.applyMachine();
  }

  private exitMachine(redraw: boolean) {
    if (!this.machine) return;
    this.machine = null;
    if (redraw) { this.applyMachine(); this.renderDock(this.activeFact()); }
  }

  private setMachineIdx(i: number | null) {
    const m = this.machine;
    if (!m || m.idx === i) return;
    m.idx = i;
    this.applyMachine();
  }

  private commitChoice(i: number, t0: number) {
    const m = this.machine;
    const c = m?.choices[i];
    if (!m || !c) return;
    if (c.offer.needs.length) {
      const cut = c.cuts[0];
      const anchor = cut ? () => this.gapEl(cut.side, cut.wpath, cut.gap)?.getBoundingClientRect() ?? null : () => this.palletEl.getBoundingClientRect();
      this.openEntry(c.offer, anchor);
      return;
    }
    this.machine = null;
    this.commit(c.offer, t0, `machine ${m.key}`);
  }

  /** Draw the machine's alternatives on the beads (cut lines, bound spans) + the result plate + the mode bar. */
  private applyMachine() {
    const P = this.palletEl;
    P.querySelectorAll('.is-cut, .is-cut-on, .is-bind').forEach((e) => {
      e.classList.remove('is-cut', 'is-cut-on', 'is-bind');
      delete (e as HTMLElement).dataset.choices;
      delete (e as HTMLElement).dataset.meta;
    });
    const m = this.machine;
    this.stage.classList.toggle('is-machine', !!m);
    if (!m) { this.mbarEl.hidden = true; this.resultEl.hidden = true; return; }
    m.choices.forEach((c, i) => {
      for (const cut of c.cuts) {
        const g = this.gapEl(cut.side, cut.wpath, cut.gap);
        if (!g) continue;
        g.classList.add('is-cut');
        g.dataset.choices = g.dataset.choices ? `${g.dataset.choices},${i}` : String(i);
      }
    });
    const cur = m.idx !== null ? m.choices[m.idx] : undefined;
    if (cur) {
      for (const cut of cur.cuts) this.gapEl(cut.side, cut.wpath, cut.gap)?.classList.add('is-cut-on');
      const metaOrder: string[] = [];
      for (const b of cur.binds) {
        if (!metaOrder.includes(b.meta)) metaOrder.push(b.meta);
        const span = this.toSpan(b.addr);
        if (!span) continue;
        const els = this.factorEls(span);
        els.forEach((el, j) => {
          el.classList.add('is-bind');
          el.style.setProperty('--bind', metaOrder.indexOf(b.meta) === 0 ? INK.navy : INK.gold);
          if (j === 0) el.dataset.meta = b.meta;
        });
      }
    }
    // mode bar
    const bar = this.mbarEl;
    bar.textContent = '';
    const fam = FAMILY[m.family];
    const anyCuts = m.choices.some((c) => c.cuts.length);
    const how = m.kind === 'lift' ? 'pick an end: both rails get the same factor there'
      : m.single ? 'click the card again or press ↵ to run it'
      : anyCuts ? 'click where it cuts the beads' : 'pick a reading';
    bar.innerHTML = `<span class="bn-chipdot" style="--ink:${fam.ink}"><b>${fam.glyph}</b></span><b>${esc(m.name)}</b><span class="bn-dim">${how}</span>`;
    if (m.choices.length > 1) {
      const chips = document.createElement('span');
      chips.className = 'bn-mchips';
      m.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = `bn-mchip${i === m.idx ? ' is-on' : ''}`;
        b.textContent = m.kind === 'lift' ? ((c.offer.kind as { ops: Array<{ side?: string }> }).ops[0]?.side === 'right' ? 'right' : 'left') : String(i + 1);
        b.title = Object.entries((c.offer.kind as { subst?: Record<string, Term> }).subst ?? {}).map(([k, v]) => `${k} = ${U.plain(v, this.L)}`).join(', ') || c.offer.label;
        b.addEventListener('pointerenter', () => this.setMachineIdx(i));
        b.addEventListener('click', (e) => this.commitChoice(i, e.timeStamp));
        chips.append(b);
      });
      bar.append(chips);
    }
    const x = document.createElement('button');
    x.className = 'bn-mx'; x.textContent = 'Esc'; x.title = 'Leave the machine';
    x.addEventListener('click', () => this.exitMachine(true));
    bar.append(x);
    bar.hidden = false;
    // result plate
    const R = this.resultEl;
    R.textContent = '';
    const pv = cur?.offer.preview;
    if (pv && (pv.k === 'eq' || pv.k === 'neq')) {
      R.innerHTML = '<span class="bn-result-arrow">→</span>';
      const rl = renderRail(pv.l, { side: 'l', L: this.L, hues: this.hues, sealed: this.sealed, src: 'result', gaps: false });
      const rel = document.createElement('span'); rel.className = 'bn-rel'; rel.textContent = pv.k === 'eq' ? '=' : '≠';
      const rr = renderRail(pv.r, { side: 'r', L: this.L, hues: this.hues, sealed: this.sealed, src: 'result', gaps: false });
      R.append(rl, rel, rr);
      R.style.setProperty('--pv-ink', fam.ink);
      R.hidden = false;
    } else if (pv?.k === 'bot') {
      R.innerHTML = '<span class="bn-result-arrow">→</span><span class="bn-rel bn-result-bot">⊥</span>';
      R.hidden = false;
    } else R.hidden = true;
  }

  // ───────────── goal ghost ─────────────
  private ghostTargets(): Array<{ label: string; pallet: Pallet; socket?: string }> {
    const s = this.store.get();
    const out: Array<{ label: string; pallet: Pallet; socket?: string }> = [];
    const many = s.level.sockets.length > 1;
    s.level.sockets.forEach((sock, i) => {
      const t = sock.target;
      if (t.k === 'law' || t.k === 'cond') return; // v4 ∀ goals have no bench ghost
      out.push({ label: many ? `Goal ${i + 1}` : 'Goal', pallet: t, socket: sock.id });
    });
    const scope = this.store.activeScope();
    this.claimsOf(s).filter((c) => c.scope === scope).forEach((c, i) => out.push({ label: `Claim ${i + 1}`, pallet: c.pallet }));
    return out;
  }
  private ghostTarget() {
    const ts = this.ghostTargets();
    return ts[Math.min(this.ghostIdx, ts.length - 1)] ?? null;
  }

  private renderGoal(fact: Fact | null) {
    const G = this.goalEl;
    G.textContent = '';
    const s = this.store.get();
    const scope = this.store.activeScope();
    const room = scope !== K.ROOT ? s.graph.rooms.find((r) => r.id === scope) : undefined;
    const ts = this.ghostTargets();
    if (room) {
      // inside a room the goal is a contradiction
      const neqs = s.graph.nodes.filter((n) => s.check.nodes[n.id]?.fact?.k === 'neq' && this.visible(n.scope, scope, s));
      G.innerHTML = `<div class="bn-goal-tag">Goal in this room</div><div class="bn-goal-bot">⊥</div><div class="bn-goal-sub">make the pallet contradict ${neqs.length ? neqs.map((n) => `<span class="math">${factHTML(s.check.nodes[n.id]!.fact!, this.L)}</span>`).join(' or ') : 'something in scope'}</div>`;
      return;
    }
    if (!ts.length) return;
    // when the displayed socket first fills, move on to the next undelivered one (later manual picks stand)
    for (const k of s.check.sockets) {
      if (!k.ok || this.filledSeen.has(k.id)) continue;
      this.filledSeen.add(k.id);
      const cur = ts[Math.min(this.ghostIdx, ts.length - 1)];
      if (cur?.socket === k.id) {
        const next = ts.findIndex((x) => x.socket && !s.check.sockets.find((q) => q.id === x.socket)?.ok);
        if (next >= 0) this.ghostIdx = next;
      }
    }
    const t = this.ghostTarget()!;
    if (ts.length > 1) {
      const tabs = document.createElement('div');
      tabs.className = 'bn-goal-tabs';
      ts.forEach((x, i) => {
        const b = document.createElement('button');
        const filled = !!x.socket && !!s.check.sockets.find((k) => k.id === x.socket)?.ok;
        b.innerHTML = `${esc(x.label)}${filled ? ' <span class="bn-qed">∎</span>' : ''}`;
        b.className = `${i === Math.min(this.ghostIdx, ts.length - 1) ? 'is-on' : ''}${filled ? ' is-filled' : ''}`;
        b.title = filled ? 'delivered' : 'not yet delivered';
        b.addEventListener('click', () => { this.ghostIdx = i; this.renderGoal(this.activeFact()); });
        tabs.append(b);
      });
      G.append(tabs);
    } else {
      const tag = document.createElement('div'); tag.className = 'bn-goal-tag'; tag.textContent = t.label; G.append(tag);
    }
    const tp = t.pallet;
    if (tp.k !== 'eq' && tp.k !== 'neq') return;
    const box = document.createElement('div');
    box.className = 'bn-ghost';
    const rl = renderRail(tp.l, { side: 'l', L: this.L, hues: this.hues, sealed: this.sealed, src: 'ghost', gaps: false });
    const rr = renderRail(tp.r, { side: 'r', L: this.L, hues: this.hues, sealed: this.sealed, src: 'ghost', gaps: false });
    const rel = document.createElement('span'); rel.className = 'bn-rel'; rel.textContent = tp.k === 'eq' ? '=' : '≠';
    box.append(rl, rel, rr);
    G.append(box);
    this.fitGhost(box);

    // light the beads that already match (straight or crossed, whichever matches more)
    let state: 'none' | 'match' | 'swap' = 'none';
    if (fact && (fact.k === 'eq' || fact.k === 'neq')) {
      const leaves = (el: Element) => [...el.querySelectorAll<HTMLElement>('[data-leaf]')];
      const pl = this.palletEl.querySelector('.bn-side-l .bn-rail'), pr = this.palletEl.querySelector('.bn-side-r .bn-rail');
      if (pl && pr) {
        const keys = (els: HTMLElement[]) => els.map((e) => e.dataset.leaf!);
        const GL = leaves(rl), GR = leaves(rr), PL = leaves(pl), PR = leaves(pr);
        const straight = [U.lcs(keys(PL), keys(GL)), U.lcs(keys(PR), keys(GR))];
        const crossed = [U.lcs(keys(PR), keys(GL)), U.lcs(keys(PL), keys(GR))];
        const n = (m: Array<Array<[number, number]>>) => m[0]!.length + m[1]!.length;
        const use = n(crossed) > n(straight) ? crossed : straight;
        for (const [, j] of use[0]!) GL[j]!.classList.add('is-lit');
        for (const [, j] of use[1]!) GR[j]!.classList.add('is-lit');
      }
      if (fact.k === tp.k && U.sig(fact.l) === U.sig(tp.l) && U.sig(fact.r) === U.sig(tp.r)) state = 'match';
      else if (fact.k === tp.k && U.sig(fact.l) === U.sig(tp.r) && U.sig(fact.r) === U.sig(tp.l)) state = 'swap';
    }
    const sock = t.socket ? s.check.sockets.find((x) => x.id === t.socket) : undefined;
    const filled = !!sock?.ok;
    const cap = document.createElement('div');
    cap.className = 'bn-goal-sub';
    if (filled && sock?.filledBy && (sock.filledBy === s.ui.activeNode || this.delivered === sock.filledBy)) {
      box.classList.add('is-delivered');
      cap.innerHTML = '<b>∎</b> delivered';
      if (this.delivered === sock.filledBy && !this.reduced) {
        box.animate([{ boxShadow: '0 0 0 0 rgba(27,35,64,.5)' }, { boxShadow: '0 0 0 14px rgba(27,35,64,0)' }], { duration: 700, easing: 'ease-out' });
      }
    } else if (filled) {
      cap.innerHTML = '<b>∎</b> socket filled';
      box.classList.add('is-filled');
    } else if (state === 'match') {
      box.classList.add('is-match');
      cap.textContent = 'matches — delivering';
    } else if (state === 'swap') {
      box.classList.add('is-match');
      cap.textContent = 'matches reversed — a swap delivers it';
    } else cap.innerHTML = `<span class="bn-dim">drag its beads into any “choose” field</span>`;
    G.append(cap);
  }
  /** Shrink the ghost's beads until it fits its column (then let the rails wrap). */
  private fitGhost(box: HTMLElement) {
    let bd = 24;
    this.goalEl.style.setProperty('--bd', `${bd}px`);
    const avail = this.goalEl.clientWidth - 30;
    if (avail <= 0) return;
    for (let k = 0; k < 6 && box.scrollWidth > avail && bd > 13; k++) {
      bd = Math.max(13, Math.floor(bd * Math.max(0.7, avail / box.scrollWidth)));
      this.goalEl.style.setProperty('--bd', `${bd}px`);
    }
    box.classList.toggle('is-wrap', box.scrollWidth > avail);
  }

  private visible(nodeScope: string, from: string, s: State): boolean {
    let cur: string | undefined = from;
    while (cur) {
      if (cur === nodeScope) return true;
      if (cur === K.ROOT) return false;
      cur = s.graph.rooms.find((r) => r.id === cur)?.parent;
    }
    return false;
  }

  // ───────────── armed rule: light every span where it applies ─────────────
  private computeArmed() {
    const s = this.store.get();
    const armed = s.ui.armed;
    const fact = this.activeFact();
    this.headArmed.textContent = '';
    if (!armed || !fact || fact.k !== 'eq') { this.armedLit = null; this.applyArmed(); return; }
    const key = `${s.ui.activeNode}|${JSON.stringify(armed)}|${s.graph.nodes.length}`;
    if (this.armedLit?.key === key) { this.applyArmed(); return; }
    const job = ++this.armedJob;
    const lit: NonNullable<Bench['armedLit']> = { key, spans: [], gaps: [] };
    this.armedLit = lit;
    // enumerate words (root + crate interiors)
    const words: Array<{ side: Side; wpath: number[]; len: number }> = [];
    const walk = (side: Side, t: Term, wpath: number[]) => {
      const fs = U.wordOf(t);
      words.push({ side, wpath, len: fs.length });
      fs.forEach((f, i) => { if (f.k === 'inv' && f.arg.k !== 'atom') walk(side, f.arg, [...U.factorPath(t, wpath, i), 0]); });
    };
    walk('l', fact.l, []); walk('r', fact.r, []);
    const tasks: Array<() => void> = [];
    for (const w of words) {
      for (let a = 0; a < w.len; a++) for (let b = a + 1; b <= w.len; b++) {
        tasks.push(() => {
          const os = this.offersFor({ side: w.side, path: w.wpath, range: [a, b] }).filter((o) => U.offerUses(o, armed));
          if (os.length) lit.spans.push({ side: w.side, wpath: w.wpath, s: a, e: b, ink: FAMILY[os[0]!.family].ink });
        });
      }
      for (let g = 0; g <= w.len; g++) tasks.push(() => {
        const os = this.offersFor({ side: w.side, path: w.wpath, gap: g }).filter((o) => U.offerUses(o, armed));
        if (os.length) lit.gaps.push({ side: w.side, wpath: w.wpath, gap: g, ink: FAMILY[os[0]!.family].ink });
      });
    }
    const step = () => {
      if (job !== this.armedJob) return;
      const t0 = performance.now();
      while (tasks.length && performance.now() - t0 < 8) tasks.shift()!();
      this.applyArmed();
      if (tasks.length) setTimeout(step, 0);
    };
    step();
  }
  private applyArmed() {
    this.palletEl.querySelectorAll('.is-lit').forEach((e) => { e.classList.remove('is-lit'); (e as HTMLElement).style.removeProperty('--lit'); });
    const lit = this.armedLit;
    const armed = this.store.get().ui.armed;
    if (!lit || !armed || this.preview) { this.headArmed.textContent = ''; return; }
    for (const sp of lit.spans) for (const el of this.factorEls(sp)) { el.classList.add('is-lit'); el.style.setProperty('--lit', sp.ink); }
    for (const g of lit.gaps) { const el = this.gapEl(g.side, g.wpath, g.gap); if (el) { el.classList.add('is-lit'); el.style.setProperty('--lit', g.ink); } }
    const whole = this.offersFor(null).filter((o) => U.offerUses(o, armed)).length;
    const n = lit.spans.length + lit.gaps.length;
    const parts: string[] = [];
    if (n) parts.push(`fits ${n} place${n === 1 ? '' : 's'} on the beads`);
    if (whole) parts.push(`${whole} way${whole === 1 ? '' : 's'} to feed it — open its machine card`);
    const slot = this.dockGroups.find((g) => g.rule && U.ruleEq(g.rule, armed));
    const need = slot?.why() ?? '';
    this.headArmed.innerHTML = `· <b>${esc(this.ruleName(armed))}</b> ${parts.length ? parts.join(' · ') : `<span class="bn-dim">${esc(need || 'does not fit this pallet')}</span>`}`;
  }
  private ruleName(r: RuleRef): string {
    const s = this.store.get();
    if (r.k === 'axiom') return ({ unitL: 'unit (left)', unitR: 'unit (right)', invL: 'inverse (left)', invR: 'inverse (right)' } as const)[r.id];
    if (r.k === 'schema') return `${s.ctx.registry[r.id]?.name ?? r.id}${r.mirror ? ' ᵒᵖ' : ''}`;
    const n = s.graph.nodes.find((x) => x.id === r.id);
    if (n?.k === 'given') return s.level.givens.find((g) => g.id === n.givenId)?.name ?? 'given';
    if (n?.k === 'press') return 'Lagrange (imported)';
    return 'rule';
  }

  // ───────────── reasons / shake ─────────────
  private clearReason() {
    clearTimeout(this.reasonTimer);
    this.reasonEl.classList.remove('is-on');
    this.reasonEl.textContent = '';
  }

  private onOver = (e: PointerEvent) => {
    if (!this.machine) return;
    const g = (e.target as HTMLElement).closest<HTMLElement>('.is-cut');
    if (!g) return;
    const cs = (g.dataset.choices ?? '').split(',').filter(Boolean).map(Number);
    if (cs.length && !cs.includes(this.machine.idx ?? -1)) this.setMachineIdx(cs[0]!);
  };
  private onOut = (_e: PointerEvent) => { /* the last hovered cut stays previewed until another is hovered */ };

  private showReason(reason: string, at?: Element | null) {
    this.reasonEl.textContent = reason;
    this.reasonEl.classList.add('is-on');
    clearTimeout(this.reasonTimer);
    this.reasonTimer = window.setTimeout(() => this.reasonEl.classList.remove('is-on'), 3600);
    shakeEl(at ?? this.palletEl, this.reduced);
  }

  // ───────────── pointer gestures ─────────────
  private factorInfo(el: HTMLElement) {
    return { side: el.dataset.side as Side, wpath: U.parsePath(el.dataset.wpath), i: Number(el.dataset.i), wkey: el.dataset.wpath ?? '' };
  }

  private onDown = (e: PointerEvent) => {
    this.suppressClick = 0; // a new press: the click after it is a real click
    if (e.button !== 0 || this.machine) return;
    const t = e.target as HTMLElement;
    if (t.closest('.bn-pop') || t.closest('.bn-goal-tabs')) return;
    const fel = t.closest<HTMLElement>('[data-i]');
    const rail = t.closest<HTMLElement>('.bn-rail');
    if (!fel || !rail || t.closest('[data-gap]')) return;
    const src = rail.classList.contains('bn-src-ghost') ? 'ghost' : rail.classList.contains('bn-src-pallet') ? 'pallet' : null;
    if (!src) return;
    if (src === 'pallet' && this.preview) return;
    const info = this.factorInfo(fel);
    const sel = this.store.get().ui.selection;
    const sp = U.isSpan(sel) ? this.toSpan(sel) : null;
    const wasSoleSel = !!sp && sp.side === info.side && U.pathKey(sp.wpath) === info.wkey && sp.s === info.i && sp.e === info.i + 1;
    this.drag = { mode: 'pending', src, rail, el: fel, side: info.side, wpath: info.wpath, i: info.i, x0: e.clientX, y0: e.clientY, pid: e.pointerId, wasSoleSel };
    e.preventDefault();
  };

  /** Find the span in a common word between the drag start and the element under the pointer. */
  private spanTo(d: Drag, under: Element | null): Span | null {
    if (!under) return null;
    const rail = under.closest('.bn-rail');
    if (rail !== d.rail) return null;
    const chain = (el: HTMLElement | null) => {
      const out: HTMLElement[] = [];
      let c = el?.closest<HTMLElement>('[data-i]') ?? null;
      while (c && d.rail.contains(c)) { out.push(c); c = c.parentElement?.closest<HTMLElement>('[data-i]') ?? null; }
      return out;
    };
    const S = chain(d.el);
    let H: HTMLElement[];
    const gap = (under as HTMLElement).closest<HTMLElement>('[data-gap]');
    if (gap) {
      // a gap inside a word: treat as the factor on the far side of the gap from the anchor
      const wk = gap.dataset.wpath ?? '';
      const g = Number(gap.dataset.gap);
      for (const s of S) {
        if (s.dataset.wpath === wk) {
          const si = Number(s.dataset.i);
          const hi = g > si ? g - 1 : g;
          return { side: d.side, wpath: U.parsePath(wk), s: Math.min(si, hi), e: Math.max(si, hi) + 1 };
        }
      }
      H = chain(gap.parentElement);
    } else H = chain(under as HTMLElement);
    for (const s of S) for (const h of H) {
      if (s.dataset.wpath === h.dataset.wpath) {
        const a = Number(s.dataset.i), b = Number(h.dataset.i);
        return { side: d.side, wpath: U.parsePath(s.dataset.wpath), s: Math.min(a, b), e: Math.max(a, b) + 1 };
      }
    }
    return null;
  }

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (d.mode === 'pending') {
      if (Math.hypot(dx, dy) < 5) return;
      const eq = this.activeFact()?.k === 'eq';
      const spoolFocused = !!this.spoolEntry && this.spoolEl.contains(document.activeElement);
      if (this.pending || (this.spoolEntry && d.src === 'ghost') || spoolFocused) d.mode = 'supply';
      else if (d.src === 'ghost') d.mode = 'none';
      else if (eq && (d.wasSoleSel || (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6))) {
        d.mode = 'lift';
        const r = d.el.getBoundingClientRect();
        const f = d.el.cloneNode(true) as HTMLElement;
        f.classList.remove('is-sel', 'is-lit');
        f.classList.add('bn-float');
        f.style.width = `${r.width}px`; f.style.height = `${r.height}px`;
        f.style.setProperty('--bd', `${this.bd}px`);
        document.body.append(f);
        d.float = f;
        d.el.classList.add('is-lifted');
        this.root.classList.add('is-lifting');
      } else d.mode = eq ? 'span' : 'none';
    }
    if (d.mode === 'span' || d.mode === 'supply') {
      const sp = this.spanTo(d, document.elementFromPoint(e.clientX, e.clientY));
      if (sp) d.span = sp;
      if (d.src === 'pallet') this.paintSpan(d.span ?? null, 'is-drag');
      else this.paintGhostSpan(d.span ?? null);
    } else if (d.mode === 'lift' && d.float) {
      const r = d.el.getBoundingClientRect();
      d.float.style.transform = `translate(${r.left + dx}px, ${r.top + dy}px) rotate(${Math.max(-8, Math.min(8, dx / 12))}deg) scale(1.08)`;
      d.float.style.visibility = 'hidden';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      d.float.style.visibility = '';
      const tgt = this.dropTarget(d, under);
      if (d.over !== tgt) { d.over?.classList.remove('is-target'); tgt?.classList.add('is-target'); d.over = tgt; }
    }
  };

  private paintGhostSpan(sp: Span | null) {
    this.goalEl.querySelectorAll('.is-drag').forEach((x) => x.classList.remove('is-drag'));
    if (!sp) return;
    this.goalEl.querySelectorAll<HTMLElement>(`[data-i][data-side="${sp.side}"][data-wpath="${U.pathKey(sp.wpath)}"]`).forEach((el) => {
      const i = Number(el.dataset.i); if (i >= sp.s && i < sp.e) el.classList.add('is-drag');
    });
  }

  private dropTarget(d: Drag, under: Element | null): HTMLElement | null {
    if (!under || under.closest('.bn-rail') !== d.rail) return null;
    let c = (under as HTMLElement).closest<HTMLElement>('[data-i]');
    while (c && !(c.dataset.wpath === U.pathKey(d.wpath) && c.dataset.side === d.side)) c = c.parentElement?.closest<HTMLElement>('[data-i]') ?? null;
    if (!c || c === d.el) return null;
    return c;
  }

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    this.drag = null;
    this.paintSpan(null, 'is-drag');
    this.paintGhostSpan(null);
    if (d.mode === 'pending') { this.tap(d, e); return; }
    this.suppressClick = performance.now();
    if (d.mode === 'span') {
      if (d.span) { this.kbAnchor = null; this.store.setSelection(this.spanAddr(d.span)); }
      return;
    }
    if (d.mode === 'supply') {
      const t = d.span ? this.selTerm(d.span, d.src) : null;
      if (t) this.supply(t);
      return;
    }
    if (d.mode === 'lift') {
      d.float?.remove();
      d.el.classList.remove('is-lifted');
      d.over?.classList.remove('is-target');
      this.root.classList.remove('is-lifting');
      if (!d.over) return;
      this.dropOn(d, Number(d.over.dataset.i), e.timeStamp, d.over);
    }
  };
  private onCancelPtr = () => {
    const d = this.drag; if (!d) return;
    this.drag = null; d.float?.remove(); d.el.classList.remove('is-lifted'); d.over?.classList.remove('is-target');
    this.root.classList.remove('is-lifting');
    this.paintSpan(null, 'is-drag');
  };

  private supply(t: Term) {
    if (this.pending) this.pending.entry.supply(t);
    else if (this.spoolEntry) this.spoolEntry.supply(t);
  }

  /**
   * Drop factor d.i on factor j of the same word: the span [i..j] collapses if exactly one
   * ready offer there shrinks the pallet (x⁻¹x → e, or bb → e when ∀x. xx = e is in scope);
   * otherwise the span is selected so its offers open.
   */
  private dropOn(d: Drag, j: number, t0: number, overEl: HTMLElement) {
    const f = this.activeFact();
    if (!f || f.k !== 'eq') return;
    const rail = d.side === 'l' ? f.l : f.r;
    const wt = U.termAtPath(rail, d.wpath);
    if (!wt) return;
    const fs = U.wordOf(wt);
    const size0 = palletSize(f);
    const shrinking = (s0: number, e0: number) => this.offersFor({ side: d.side, path: d.wpath, range: [s0, e0] })
      .filter((o) => !o.needs.length && o.kind.k === 'steps' && o.preview && palletSize(o.preview) < size0);
    const lo = Math.min(d.i, j), hi = Math.max(d.i, j);
    const exact = shrinking(lo, hi + 1);
    if (exact.length === 1) { this.commit(exact[0]!, t0, 'drop-collapse'); return; }
    if (exact.length > 1) { this.store.setSelection({ side: d.side, path: d.wpath, range: [lo, hi + 1] }); return; }
    // a crate may swallow several neighbours: (ab)⁻¹ dropped toward a b
    if (d.el.dataset.crate) {
      for (let k = 2; k <= fs.length; k++) {
        const [s0, e0] = j > d.i ? [d.i, d.i + k + 1] : [d.i - k, d.i + 1];
        if (s0 < 0 || e0 > fs.length) break;
        const c = shrinking(s0, e0);
        if (c.length === 1) { this.commit(c[0]!, t0, 'drop-collapse'); return; }
      }
    }
    if (this.kernelErr) { this.showReason(`kernel not ready: ${this.kernelErr}`, overEl); return; }
    if (this.offersFor({ side: d.side, path: d.wpath, range: [lo, hi + 1] }).length) {
      this.store.setSelection({ side: d.side, path: d.wpath, range: [lo, hi + 1] });
      return;
    }
    const t = U.sliceTerm(fs, lo, hi + 1);
    this.showReason(`nothing here collapses ${this.txt(t)}`, overEl);
  }

  /** A click without movement on a factor. */
  private tap(d: Drag, e: PointerEvent) {
    if (d.src === 'ghost') {
      if (this.pending || this.spoolEntry) { const t = this.selTerm({ side: d.side, wpath: d.wpath, s: d.i, e: d.i + 1 }, 'ghost'); if (t) this.supply(t); }
      return;
    }
    const sp: Span = { side: d.side, wpath: d.wpath, s: d.i, e: d.i + 1 };
    if (this.pending) { const t = this.selTerm(sp); if (t) this.supply(t); return; }
    const f = this.activeFact();
    if (!f || f.k !== 'eq') return;
    // a lone e: pop it if the kernel can
    if (d.el.dataset.leaf === 'e' && !d.wasSoleSel) {
      const rail = d.side === 'l' ? f.l : f.r;
      const wt = U.termAtPath(rail, d.wpath);
      const n = wt ? U.wordOf(wt).length : 0;
      const cands: Array<[number, number]> = [];
      if (d.i + 1 < n) cands.push([d.i, d.i + 2]);
      if (d.i > 0) cands.push([d.i - 1, d.i + 1]);
      for (const [s, en] of cands) {
        const o = this.offersFor({ side: d.side, path: d.wpath, range: [s, en] }).find(U.isPop);
        if (o) { this.commit(o, e.timeStamp, 'pop-e'); return; }
      }
    }
    this.kbAnchor = null;
    this.store.setSelection(this.spanAddr(sp));
  }

  private suppressClick = 0;
  private onClick = (e: MouseEvent) => {
    if (this.suppressClick) { this.suppressClick = 0; return; }
    const t = e.target as HTMLElement;
    if (t.closest('.bn-pop') || t.closest('.bn-goal') || t.closest('.bn-mbar')) return;
    const gap = t.closest<HTMLElement>('.bn-src-pallet [data-gap]');
    if (this.machine) {
      if (gap?.classList.contains('is-cut')) {
        const cs = (gap.dataset.choices ?? '').split(',').filter(Boolean).map(Number);
        const i = cs.includes(this.machine.idx ?? -1) ? this.machine.idx! : cs[0];
        if (i !== undefined) this.commitChoice(i, e.timeStamp);
      } else if (!t.closest('[data-i]') && !gap) this.exitMachine(true);
      return;
    }
    if (gap) {
      if (this.preview) return;
      const f = this.activeFact();
      if (!f || f.k !== 'eq') { this.showReason('only an equation can be rewritten: this pallet is not an equation', gap); return; }
      this.kbAnchor = null;
      this.store.setSelection({ side: gap.dataset.side as Side, path: U.parsePath(gap.dataset.wpath), gap: Number(gap.dataset.gap) });
      return;
    }
    if (!t.closest('[data-i]') && !t.closest('.bn-pop') && this.store.get().ui.selection && !this.pending) this.store.setSelection(null);
  };

  private onDbl = (e: MouseEvent) => {
    if (this.machine) return;
    const t = e.target as HTMLElement;
    const gap = t.closest<HTMLElement>('.bn-src-pallet [data-gap]');
    if (gap) {
      const ga: GapAddr = { side: gap.dataset.side as Side, path: U.parsePath(gap.dataset.wpath), gap: Number(gap.dataset.gap) };
      const o = this.offersFor(ga).find(U.isPlainInsertE);
      if (o) this.commit(o, e.timeStamp, 'dbl-insert-e');
      else this.showReason(this.kernelErr ? `kernel not ready: ${this.kernelErr}` : 'e cannot be inserted here', gap);
      return;
    }
    const cap = t.closest<HTMLElement>('.bn-src-pallet .bn-cap, .bn-src-pallet .bn-paren');
    if (cap) {
      const crate = cap.closest<HTMLElement>('[data-crate]')!;
      if (this.sealed) { this.showReason(SEALED_TIP, crate); return; }
      const info = this.factorInfo(crate);
      const sock = this.offersFor({ side: info.side, path: info.wpath, range: [info.i, info.i + 1] })
        .find((o) => U.offerRules(o).some((r) => r.k === 'schema' && r.id === 'socks'));
      if (sock && !sock.needs.length) this.commit(sock, e.timeStamp, 'open-crate');
    }
  };

  // ───────────── keyboard ─────────────
  private onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const s = this.store.get();
    if (s.ui.screen !== 'level' || !this.root.isConnected) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    const mod = e.metaKey || e.ctrlKey;
    const handled = () => { e.preventDefault(); };
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) this.redo(); else this.store.undo();
      handled(); return;
    }
    if (mod && (e.key === 'y')) { this.redo(); handled(); return; }
    if (mod || e.altKey) return;
    if (e.key === 'Backspace') { this.store.undo(); handled(); return; }
    if (e.key === 'Escape') {
      // one Escape closes one thing: machine → entry → spool popover → armed rule → selection
      if (this.machine) this.exitMachine(true);
      else if (this.pending) { this.closePending(); this.renderPopover(); }
      else if (this.spoolEntry && !this.spoolInline) this.closeSpool();
      else if (s.ui.armed) this.store.setArmed(null);
      else if (s.ui.selection) this.store.setSelection(null);
      else return;
      handled(); return;
    }
    const m = this.machine;
    if (m) {
      const n = m.choices.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = e.key === 'ArrowLeft' ? -1 : 1;
        this.setMachineIdx(m.idx === null ? (d > 0 ? 0 : n - 1) : (m.idx + d + n) % n);
        handled(); return;
      }
      if (e.key === 'Enter') { if (m.idx !== null) this.commitChoice(m.idx, e.timeStamp); handled(); return; }
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) { this.commitChoice(Number(e.key) - 1, e.timeStamp); handled(); return; }
      return;
    }
    if (e.key === 'Enter' && this.pending) { this.pending.entry.submit(); handled(); return; }
    if (e.key === 'Enter' && this.spoolEntry) { this.spoolEntry.submit(); handled(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { this.moveSel(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey); handled(); return; }
    const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : e.key === 'Enter' ? 0 : -1;
    if (n < 0) return;
    if (s.ui.selection) {
      const o = this.popOffers[n];
      if (o) { this.choose(o, e.timeStamp, `key-${e.key}`, () => this.selRect()); handled(); }
    } else {
      const g = this.dockGroups[n];
      const card = g ? this.movesEl.querySelector<HTMLElement>(`[data-group="${CSS.escape(g.key)}"]`) : null;
      if (g && card) { this.openSlot(g, e.timeStamp, card); handled(); }
    }
  };

  /** Redo, then follow the restored belt forward (store.redo keeps the old active node). */
  private redo() {
    const before = this.store.get().ui.activeNode;
    this.store.redo();
    if (before && this.store.get().graph.nodes.some((n) => n.id === before)) {
      const end = this.store.endOf(before);
      if (end !== before) this.store.setActive(end);
    }
  }

  private moveSel(dir: -1 | 1, extend: boolean) {
    const f = this.activeFact();
    if (!f || f.k !== 'eq') return;
    const sel = this.store.get().ui.selection;
    const len = (side: Side, wpath: number[]) => { const t = U.termAtPath(side === 'l' ? f.l : f.r, wpath); return t ? U.wordOf(t).length : 0; };
    if (!sel) {
      const side: Side = dir > 0 ? 'l' : 'r';
      const n = len(side, []);
      const i = dir > 0 ? 0 : n - 1;
      this.kbAnchor = i;
      this.store.setSelection({ side, path: [], range: [i, i + 1] });
      return;
    }
    if (U.isGap(sel)) {
      const n = len(sel.side, sel.path);
      if (extend) {
        const i = dir > 0 ? sel.gap : sel.gap - 1;
        if (i >= 0 && i < n) { this.kbAnchor = i; this.store.setSelection({ side: sel.side, path: sel.path, range: [i, i + 1] }); }
        return;
      }
      const g = sel.gap + dir;
      if (g >= 0 && g <= n) this.store.setSelection({ ...sel, gap: g });
      else if (sel.path.length === 0) {
        const other: Side = sel.side === 'l' ? 'r' : 'l';
        if ((dir > 0) === (sel.side === 'l')) this.store.setSelection({ side: other, path: [], gap: dir > 0 ? 0 : len(other, []) });
      }
      return;
    }
    const sp = this.toSpan(sel);
    if (!sp) return;
    const n = len(sp.side, sp.wpath);
    if (extend) {
      const anchor = this.kbAnchor ?? (dir > 0 ? sp.s : sp.e - 1);
      const head = anchor === sp.s ? sp.e - 1 : sp.s;
      const nh = Math.max(0, Math.min(n - 1, head + dir));
      this.kbAnchor = anchor;
      this.store.setSelection({ side: sp.side, path: sp.wpath, range: [Math.min(anchor, nh), Math.max(anchor, nh) + 1] });
      return;
    }
    this.kbAnchor = null;
    const i = dir > 0 ? sp.e : sp.s - 1;
    if (i >= 0 && i < n) { this.store.setSelection({ side: sp.side, path: sp.wpath, range: [i, i + 1] }); return; }
    if (sp.wpath.length === 0) {
      const other: Side = sp.side === 'l' ? 'r' : 'l';
      if ((dir > 0) === (sp.side === 'l')) {
        const m = len(other, []);
        const j = dir > 0 ? 0 : m - 1;
        this.store.setSelection({ side: other, path: [], range: [j, j + 1] });
      }
    } else {
      // step out of a crate
      const parentW = sp.wpath.slice(0, -1);
      const rail = sp.side === 'l' ? f.l : f.r;
      const pw = U.termAtPath(rail, parentW.slice(0, -1));
      const ci = pw?.k === 'mul' ? parentW[parentW.length - 1]! : 0;
      const wp = pw?.k === 'mul' ? parentW.slice(0, -1) : parentW;
      this.store.setSelection({ side: sp.side, path: wp, range: [ci, ci + 1] });
    }
  }
}

/** Beads on a pallet, counting inside crates. */
function palletSize(p: Fact): number {
  const n = (t: Term): number => t.k === 'mul' ? t.fs.reduce((a, x) => a + n(x), 0) : t.k === 'inv' ? n(t.arg) : 1;
  return p.k === 'eq' || p.k === 'neq' ? n(p.l) + n(p.r) : 0;
}

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
void termHTML; void MOTION;
