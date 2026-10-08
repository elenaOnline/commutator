// LEMMA WORKS v3 — app frame + HUD. Owner: HUD builder.
// The frame is a full-bleed floor (mountFloor from ../floor) with a floating HUD over it:
// order chip (top-left), run cluster (top-right), hotbar (bottom-centre), inspector lens (anchored),
// hints, toasts; transcript and lab drawers closed by default; the map and the ceremony on demand.
// Nothing reserves a part of the screen; every HUD element floats and the layer itself is click-through.
import '../shell/shell.css';
import '../bench/bench.css';
import './hud.css';
import type { FactoryStore } from '../state/factoryStore';
import type { Family } from '../kernel/types';
import type { MachineKind } from '../factory/types';
import { FAMILY, reducedMotion } from '../ui/tokens';
import { MATH_CSS } from '../ui/math';
import { floorModule, h, hotbarKinds, pointer, spec, type S } from './util';
import { mountHotbar } from './hotbar';
import { mountLens } from './lens';
import { mountOrder } from './order';
import { mountRun } from './run';
import { mountTranscript } from './transcript';
import { mountHints } from './hints';
import { mountCeremony } from './ceremony';
import { mountMap } from './map';
import { mountLab } from './lab';
import { mountFollow } from './follow';
import { rectToScreen } from '../floor/project';

export interface AppOpts {
  /** Override the floor (dev harness). Defaults to ../floor's mountFloor. */
  mountFloor?: (el: HTMLElement, store: FactoryStore) => () => void;
}

export function mountApp(root: HTMLElement, store: FactoryStore, opts: AppOpts = {}): void {
  const vars = (Object.keys(FAMILY) as Family[]).map((f) => `--fam-${f}:${FAMILY[f].ink};--fam-${f}-text:${FAMILY[f].text};`).join('');
  const style = document.createElement('style');
  style.textContent = `:root{${vars}}\n${MATH_CSS}`;
  document.head.append(style);

  root.innerHTML = '';
  const app = h('div', { class: 'lw-app lw3' });
  const floorEl = h('div', { id: 'floor', class: 'h3-floor' });
  const layer = h('div', { class: 'h3-layer' });
  const mapEl = h('div', {});
  app.append(floorEl, layer, mapEl);
  root.append(app);
  if (reducedMotion()) app.classList.add('reduced-motion');

  // ── the floor (built concurrently: imported dynamically, guarded and retried, so a broken floor
  //    module never takes the HUD down with it)
  let floorTries = 0;
  const tryFloor = async () => {
    try {
      let mf = opts.mountFloor;
      if (!mf) {
        const mod = await import('../floor');
        floorModule.mod = mod as unknown as Record<string, unknown>;
        mf = mod.mountFloor;
      }
      floorEl.textContent = '';
      mf(floorEl, store);
    } catch (err) {
      if (++floorTries < 60) setTimeout(() => void tryFloor(), 1500);
      else console.warn('[hud] floor failed to mount', err);
    }
  };
  void tryFloor();

  // ── toasts (refusals near the pointer)
  const toastEl = h('div', { class: 'h3-toast', role: 'status', 'aria-live': 'polite' });
  let toastT = 0;
  // One message channel (ui.toast): the floor and the HUD both speak through it. One message at a time,
  // near the pointer, auto-expiring after 2.8 s, never over the lens.
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.remove('on'); void toastEl.offsetWidth; toastEl.classList.add('on');
    const w = Math.min(420, toastEl.offsetWidth), th = toastEl.offsetHeight;
    clearTimeout(toastT);
    if (toastEl.dataset.kind === 'note') { // a quiet note: small, upper centre, gone in a few seconds
      toastEl.style.left = `${Math.round(innerWidth / 2 - toastEl.offsetWidth / 2)}px`;
      toastEl.style.top = `${store.get().ui.follow ? 70 : 18}px`;
      toastT = window.setTimeout(() => { toastEl.classList.remove('on'); store.clearToast(); }, 3600);
      return;
    }
    let x = Math.max(10, Math.min(innerWidth - w - 10, pointer.x + 14));
    let y = Math.max(10, Math.min(innerHeight - 60, pointer.y + 18));
    const lr = lensEl()?.getBoundingClientRect();
    if (lr && lr.width && x < lr.right && x + w > lr.left && y < lr.bottom && y + th > lr.top) {
      y = lr.top - th - 10 >= 10 ? lr.top - th - 10 : Math.min(innerHeight - th - 10, lr.bottom + 10);
      x = Math.max(10, Math.min(innerWidth - w - 10, lr.left));
    }
    toastEl.style.left = `${x}px`; toastEl.style.top = `${y}px`;
    clearTimeout(toastT);
    toastT = window.setTimeout(() => { toastEl.classList.remove('on'); store.clearToast(); }, 2800);
  };
  let lensRef: HTMLElement | null = null;
  const lensEl = () => (lensRef && !lensRef.hidden ? lensRef : null);

  // ── HUD pieces
  const follow = mountFollow(layer, store);
  const hotbar = mountHotbar(layer, store);
  const order = mountOrder(layer, store, { armRoom: (kind, g) => hotbar.armRoom(kind, g.l, g.r) });
  const labEl = h('div', {});
  layer.append(labEl);
  let labOpen = false;
  const lab = mountLab(labEl, store, (m) => { toastEl.dataset.kind = 'note'; toast(m); }, { pin: (p) => order.addPlan(p), pinned: () => order.plans() });
  lab.onToggle((o) => { labOpen = o; render(store.get()); });
  const run = mountRun(layer, store, {
    toggleTranscript: () => store.setUI({ transcriptOpen: !store.get().ui.transcriptOpen }),
    toggleLab: () => lab.toggle(),
    isLabOpen: () => labOpen,
  });
  const below = (el: HTMLElement, fallback: number) => { const r = el.getBoundingClientRect(); return r.height ? r.bottom + 10 : fallback; };
  const transcript = mountTranscript(layer, store, { top: () => below(order.el, 120) });
  const lens = mountLens(layer, store, { dockTop: () => below(run.el, 120), keepClear: () => [order.el, run.el] });
  lensRef = lens.el;
  const hints = mountHints(layer, store, { slotRect: (k: MachineKind) => hotbar.slotRect(k), avoid: () => [lens.el, transcript.el, labEl] });
  const renderCeremony = mountCeremony(layer, store, { dest: () => hotbar.slotRect('earned') });
  const renderMap = mountMap(mapEl, store);
  layer.append(toastEl);

  let lastToast: unknown = null, lastScreen = '';
  const render = (s: S) => {
    if (s.ui.screen !== lastScreen) {
      lastScreen = s.ui.screen;
      app.dataset.screen = s.ui.screen;
      mapEl.hidden = s.ui.screen !== 'map';
      floorEl.hidden = layer.hidden = s.ui.screen === 'map';
    }
    document.title = s.ui.screen === 'map' ? 'Commutator · theorem map' : `Commutator · ${s.level.index} ${s.level.title}`;
    if (s.ui.screen === 'map') { try { renderMap(s); } catch (err) { console.warn('[hud] map', err); } return; }
    labEl.style.top = `${below(run.el, 140)}px`;
    for (const [name, fn] of [['hotbar', hotbar.render], ['order', order.render], ['run', run.render], ['lens', lens.render], ['transcript', transcript.render],
      ['hints', hints.render], ['lab', lab.render], ['ceremony', renderCeremony], ['follow', follow.render]] as const) {
      try { fn(s); } catch (err) { console.warn(`[hud] ${name} render failed`, err); }
    }
    if (s.ui.toast && s.ui.toast !== lastToast) { toastEl.dataset.kind = s.ui.toast.kind ?? 'refused'; toast(s.ui.toast.text); }
    lastToast = s.ui.toast;
  };
  store.subscribe(render);
  // Apply sizes its premise inlets to the card routed into it, once, when that card changes (not on undo/load)
  const cardSeen = new Map<string, string>();
  const cardKeys = (s: S) => {
    const out: [string, string, number][] = [];
    for (const m of s.canvas.machines) {
      if (m.config.kind !== 'apply') continue;
      const v = s.compiled?.machines?.[m.id]?.inputs?.['rule'];
      const card = v && v.k === 'card' ? v.card : null;
      out.push([m.id, card ? JSON.stringify(card) : '', card ? (card.k === 'cond' ? card.premises.length : 0) : -1]);
    }
    return out;
  };
  const rememberCards = () => { cardSeen.clear(); for (const [id, k] of cardKeys(store.get())) cardSeen.set(id, k); };
  rememberCards();
  store.on((e) => {
    if (e.type === 'level-opened') { lab.toggle(false); hotbar.closePopovers(); rememberCards(); if (store.get().ui.follow) store.setUI({ follow: null }); return; }
    if (e.type !== 'edited') return;
    const s = store.get();
    // a refusal is stale once an edit succeeds
    if (toastEl.dataset.kind === 'refused' && toastEl.classList.contains('on')) { clearTimeout(toastT); toastEl.classList.remove('on'); if (s.ui.toast?.kind !== 'note') setTimeout(() => store.clearToast(), 0); }
    for (const [id, key, n] of cardKeys(s)) {
      const before = cardSeen.get(id);
      cardSeen.set(id, key);
      if (!key || key === before) continue;
      const m = s.canvas.machines.find((x) => x.id === id);
      if (m && m.config.kind === 'apply' && n >= 0 && m.config.premises !== n) {
        const cfg = { ...m.config, premises: n };
        setTimeout(() => store.configure(id, cfg), 0);
      }
    }
  });
  render(store.get());

  // ── one rAF loop: simulation clock + anchored cards follow the camera
  const loop = (now: number) => {
    run.frame(now);
    if (!layer.hidden) { lens.position(); hints.reposition(); follow.frame(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  addEventListener('resize', () => { lens.position(); hints.reposition(); });

  // ── keyboard
  let spaceDown = false, spaceUsed = false, altAlone = false;
  addEventListener('pointerdown', () => { if (spaceDown) spaceUsed = true; }, true);
  const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  addEventListener('keydown', (e) => {
    if (e.key !== 'Alt') altAlone = false;
    if (e.defaultPrevented || typing(e.target)) return;
    const s = store.get();
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    if (k.toLowerCase() === 'm' && !mod) { e.preventDefault(); if (s.ui.screen === 'map') store.openLevel(s.ui.levelId); else store.openMap(); return; }
    if (s.ui.screen === 'map') { if (k === 'Escape') store.openLevel(s.ui.levelId); return; }
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
    if (mod) return;
    if (k === 'Alt') { if (!e.repeat) altAlone = true; return; }
    if (k === ' ') { e.preventDefault(); if (!e.repeat) { spaceDown = true; spaceUsed = false; } return; }
    if (k === 'Escape') {
      if (hotbar.closePopovers()) return;
      if (s.ui.follow) { follow.leave(); return; }
      if (s.ui.lens) { store.openLens(null); return; }
      if (s.ui.tool.k !== 'select') { store.setTool({ k: 'select' }); return; }
      if (s.ui.transcriptOpen) { store.setUI({ transcriptOpen: false }); return; }
      if (labOpen) { lab.toggle(false); return; }
      if (s.ui.selection.length) store.select([]);
      return;
    }
    if (k === '.') { e.preventDefault(); store.stepOnce(); return; }
    if (k.toLowerCase() === 't') { e.preventDefault(); store.setUI({ transcriptOpen: !s.ui.transcriptOpen }); return; }
    if (k.toLowerCase() === 'b') { e.preventDefault(); store.setTool({ k: 'belt' }); return; }
    if (k.toLowerCase() === 'g') { e.preventDefault(); hotbar.openRoomPopover(); return; }
    if (/^[0-9]$/.test(k)) {
      const kind = hotbarKinds().find((x) => spec(x).hotkey === k);
      if (kind) { e.preventDefault(); store.setTool({ k: 'place', kind }); }
    }
  });
  addEventListener('keyup', (e) => {
    if (e.key === ' ' && spaceDown) {
      spaceDown = false;
      if (!spaceUsed && !typing(e.target) && store.get().ui.screen === 'floor' && !(e.target as HTMLElement | null)?.closest?.('button')) store.setPlaying(!store.get().ui.playing);
    }
    if (e.key === 'Alt') {
      if (altAlone && !e.defaultPrevented && !typing(e.target) && store.get().ui.screen === 'floor') { e.preventDefault(); store.toggleAlt(); }
      altAlone = false;
    }
  });
  addEventListener('blur', () => { spaceDown = false; altAlone = false; });

  /** Test hook: screen centre of a grid tile (floor/project convention). */
  const tileXY = (x: number, y: number) => {
    const fr = floorEl.getBoundingClientRect();
    const q = rectToScreen(store.get().ui.camera, { w: fr.width, h: fr.height }, x, y, x + 1, y + 1, 0);
    return { x: fr.left + q.x + q.w / 2, y: fr.top + q.y + q.h / 2 };
  };
  (window as unknown as { __hud: unknown }).__hud = { hotbar, lens, order, run, tileXY, lab: { toggle: lab.toggle, isOpen: () => labOpen } };
}
