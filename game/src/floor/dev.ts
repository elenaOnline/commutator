// LEMMA WORKS v3 floor — DEV HARNESS ONLY (src/floor/dev.html). Mounts the floor alone on the REAL
// FactoryStore and builds scenes through real store actions (place/connect/paintRoom…), so what you
// see is what the editor + compiler + runtime produce. The perf scene adds a synthetic packet driver
// (60+ packets) to stress the renderer. Exposes window.__lw (store) and window.__dev.
//
//   ?scene=l01 | l01-solved | showcase | perf      ?alt=1      ?shot=1 (hide the bar)
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '../ui/base.css';
import type { Term } from '../kernel/types';
import type { Packet, RunState, Tile } from '../factory/types';
import { TICKS_PER_SECOND } from '../factory';

const qs = new URLSearchParams(location.search);
const scene = qs.get('scene') ?? 'l01';
if (qs.has('shot')) document.body.classList.add('shot');

// fresh save with every theorem earned (so stamps/docks are real hardware)
localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 3, levels: {}, earned: ['witness', 'cancel', 'socks', 'nofix', 'dbl'], settings: { speed: 1, reducedMotion: false } }));

const [{ FactoryStore }, { mountFloor }] = await Promise.all([import('../state/factoryStore'), import('./index')]);
const store = new FactoryStore();
(window as unknown as { __lw: unknown }).__lw = store;

const A = (id: string): Term => ({ k: 'atom', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const M = (...fs: Term[]): Term => ({ k: 'mul', fs });
const E: Term = { k: 'e' };
const idOf = (e: { ok: boolean; ids?: string[]; reason?: string }, what: string): string => {
  if (!e.ok || !e.ids?.[0]) { console.warn('[dev] refused', what, e); return ''; }
  return e.ids[0];
};
const find = (kind: string) => store.get().canvas.machines.find((m) => m.kind === kind)!;
const at = (x: number, y: number): Tile => ({ x, y });

function l01Solved() {
  store.openLevel('L01');
  const sp = find('spool'), so = find('socket');
  const c = idOf(store.place('canceller', at(sp.at.x + 4, sp.at.y), { rot: 0 }), 'canceller');
  store.connect({ m: sp.id, port: 'out' }, { m: c, port: 'q' });
  store.connect({ m: c, port: 'out' }, { m: so.id, port: 'q' });
}

function showcase() {
  store.openLevel('L12');
  const giv = store.get().canvas.machines.filter((m) => m.kind === 'given');
  const gs = giv.find((m) => m.config.kind === 'given' && m.config.givenId === 's')!;
  const gn = giv.find((m) => m.config.kind === 'given' && m.config.givenId === 'n')!;
  const so = find('socket');
  const x0 = Math.min(gs.at.x, gn.at.x) + 4, y0 = Math.min(gs.at.y, gn.at.y);
  // the press, fed by |G| = 7
  const press = idOf(store.place('press', at(x0, gs.at.y), { rot: 0 }), 'press');
  store.connect({ m: gs.id, port: 'out' }, { m: press, port: 'q' });
  // a suppose room for (ab)^3 = e
  const ab3 = M(A('a'), A('b'), A('a'), A('b'), A('a'), A('b'));
  store.paintRoom({ x: x0 - 1, y: y0 + 3, w: 12, h: 7 }, 'suppose', ab3, E);
  const room = store.get().canvas.rooms[0];
  const desk = store.get().canvas.machines.find((m) => m.kind === 'desk');
  const gate = store.get().canvas.machines.find((m) => m.kind === 'gate');
  // rewriter: desk equation rewritten by the pressed law
  const rw = idOf(store.place('rewriter', at(x0 + 3, y0 + 5), { rot: 0 }), 'rewriter');
  if (desk) store.connect({ m: desk.id, port: 'out' }, { m: rw, port: 'q' });
  store.connect({ m: press, port: 'out' }, { m: rw, port: 'rule' });
  const stamp = idOf(store.place('stamp', at(x0 + 3, y0 + 8), { rot: 0 }), 'stamp');
  const anvil = idOf(store.place('anvil', at(x0 + 7, y0 + 5), { rot: 0 }), 'anvil');
  store.connect({ m: rw, port: 'out' }, { m: anvil, port: 'a' });
  store.connect({ m: gn.id, port: 'out' }, { m: anvil, port: 'b' });
  if (gate) { store.connect({ m: anvil, port: 'out' }, { m: gate.id, port: 'q' }); store.connect({ m: gate.id, port: 'out' }, { m: so.id, port: 'q' }); }
  // a term line outside the room: hopper → inverter
  const hop = idOf(store.place('hopper', at(x0 + 1, y0 + 12), { rot: 0 }), 'hopper');
  store.configure(hop, { kind: 'hopper', t: M(A('a'), A('b')) });
  const inv = idOf(store.place('inverter', at(x0 + 5, y0 + 12), { rot: 0 }), 'inverter');
  store.connect({ m: hop, port: 'out' }, { m: inv, port: 'q' });
  const dock = idOf(store.place('carddock', at(x0 + 1, y0 + 14), { rot: 0 }), 'carddock');
  void dock; void stamp; void room;
}

function perf() {
  store.openLevel('L01');
  const kinds = ['spool', 'canceller', 'popper', 'swapper', 'multiplier'] as const;
  const term = M(I(A('a')), A('a'), A('b'));
  for (let r = 0; r < 8; r++) {
    const y = 6 + r * 3;
    let x = -6;
    const ids: string[] = [];
    for (const k of kinds) {
      const id = idOf(store.place(k, at(x, y), { rot: 0 }), k);
      if (id) ids.push(id);
      x += k === 'spool' ? 5 : 6;
    }
    store.configure(ids[0]!, { kind: 'spool', t: { k: 'knob', term } });
    for (let i = 0; i < ids.length - 1; i++) store.connect({ m: ids[i]!, port: 'out' }, { m: ids[i + 1]!, port: 'q' });
  }
}

const SCENES: Record<string, () => void> = { l01: () => store.openLevel('L01'), 'l01-solved': l01Solved, showcase, perf };
(SCENES[scene] ?? SCENES.l01!)();
if (qs.has('alt')) store.toggleAlt(true);

const unmount = mountFloor(document.getElementById('floor')!, store);

// ───────── clock (the HUD drives this in the app) ─────────
let synthetic = scene === 'perf';
let acc = 0, last = performance.now(), syntheticTick = 0;
const setRun = (run: RunState) => (store as unknown as { set: (p: { run: RunState }) => void }).set({ run });
function syntheticRun(t: number): RunState {
  const s = store.get();
  const packets: Packet[] = [];
  s.canvas.belts.forEach((b, bi) => {
    const v = s.compiled.machines[b.from.m]?.out ?? s.compiled.machines[s.canvas.machines.find((m) => m.kind === 'spool')!.id]?.out;
    if (!v) return;
    for (let i = 0; i < b.path.length; i++) {
      const t0 = t - i;
      if (t0 % 2 !== 0) continue;
      packets.push({ id: bi * 100000 + t0 + 50000, value: v, at: { k: 'belt', belt: b.id, i } });
    }
  });
  return { ...s.run, tick: t, packets };
}
function frame(now: number) {
  requestAnimationFrame(frame);
  const s = store.get();
  const dt = Math.min(250, now - last); last = now;
  if (!s.ui.playing) { acc = 0; return; }
  acc += dt;
  const step = 1000 / (TICKS_PER_SECOND * (s.ui.speed || 1));
  while (acc >= step) {
    acc -= step;
    if (synthetic) setRun(syntheticRun(++syntheticTick)); else store.tick();
  }
}
requestAnimationFrame(frame);

// ───────── bar ─────────
const bar = document.getElementById('bar')!;
const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.append(b); return b; };
btn('select', () => store.setTool({ k: 'select' }));
btn('canceller', () => store.setTool({ k: 'place', kind: 'canceller' }));
btn('rewriter', () => store.setTool({ k: 'place', kind: 'rewriter' }));
btn('meet', () => store.setTool({ k: 'place', kind: 'meet' }));
btn('room', () => store.setTool({ k: 'room', kind: 'suppose' }));
btn('alt', () => store.toggleAlt());
btn('pause', () => store.setPlaying(!store.get().ui.playing));
btn('undo', () => store.undo());
addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  const k = e.key;
  if (k === 'Escape') { if (store.get().ui.tool.k !== 'select') store.setTool({ k: 'select' }); else { store.select([]); store.openLens(null); } }
  if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
  if (/^[0-9]$/.test(k)) {
    const kinds = ['anvil', 'spool', 'canceller', 'expander', 'popper', 'rewriter', 'multiplier', 'swapper', 'meet', 'apply'] as const;
    store.setTool({ k: 'place', kind: kinds[+k]! });
  }
});

(window as unknown as { __dev: unknown }).__dev = { store, unmount, scene, setSynthetic: (v: boolean) => { synthetic = v; } };
