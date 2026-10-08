// COMMUTATOR floor — DEV HARNESS ONLY (src/floor/dev.html).
//   ?scene=v4 (default)   the fixture store: a hand-made v4 floor (towers, recipe verbs, ∀, Assume room)
//   ?scene=l01 | l01-solved | perf   the REAL FactoryStore, built through real store actions (needs the v4 editor)
//   ?alt=1   ?shot=1 (hide the bar)
// Exposes window.__lw (store) and window.__dev.
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '../ui/base.css';
import type { Term } from '../kernel/types';
import type { Machine, Packet, RunState, Tile } from '../factory/types';
import { TICKS_PER_SECOND } from '../factory';
import { mountFloor, type FloorStore } from './index';
import { FixtureStore } from './fixture';

const qs = new URLSearchParams(location.search);
const scene = qs.get('scene') ?? 'v4';
if (qs.has('shot')) document.body.classList.add('shot');

type Store = FloorStore & { tick(): void; configure?(id: string, c: Machine['config']): unknown; undo?(): void; redo?(): void; setPlaying?(p: boolean): void; openLevel?(id: string): void };
let store: Store;

const A = (id: string): Term => ({ k: 'atom', id });
const I = (t: Term): Term => ({ k: 'inv', arg: t });
const M = (...fs: Term[]): Term => ({ k: 'mul', fs });
const at = (x: number, y: number): Tile => ({ x, y });
const idOf = (e: { ok: boolean; ids?: string[] }, what: string) => { if (!e.ok || !e.ids?.[0]) { console.warn('[dev] refused', what, e); return ''; } return e.ids[0]; };

async function realStore(): Promise<Store | null> {
  try {
    localStorage.setItem('lemma-works/v3', JSON.stringify({ version: 4, levels: {}, earned: ['witness', 'cancel', 'socks', 'nofix', 'dbl'], lemmas: [], settings: { speed: 1, reducedMotion: false } }));
    const { FactoryStore } = await import('../state/factoryStore');
    return new FactoryStore() as unknown as Store;
  } catch (e) { console.warn('[dev] real store unavailable — using the fixture', e); return null; }
}

if (scene === 'v4') store = new FixtureStore() as unknown as Store;
else {
  const real = await realStore();
  store = real ?? (new FixtureStore() as unknown as Store);
  if (real) {
    const find = (kind: string) => store.get().canvas.machines.find((m) => m.kind === kind)!;
    const rw = (recipe: unknown): Machine['config'] => ({ kind: 'rewriter', recipe, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true } as Machine['config']);
    real.openLevel?.('L01');
    if (scene === 'l01-solved') {
      const sp = find('spool'), so = find('socket');
      const c = idOf(store.place('rewriter', at(sp.at.x + 4, sp.at.y), { rot: 0, config: rw({ k: 'cancel' }) }), 'rewriter');
      store.connect({ m: sp.id, port: 'out' }, { m: c, port: 'q' });
      store.connect({ m: c, port: 'out' }, { m: so.id, port: 'q' });
    }
    if (scene === 'perf') {
      const recipes = [null, { k: 'cancel' }, { k: 'pop' }, null, null];
      const term = M(I(A('a')), A('a'), A('b'));
      for (let r = 0; r < 8; r++) {
        const y = 6 + r * 3; let x = -6; const ids: string[] = [];
        recipes.forEach((rc, i) => {
          const kind = i === 0 ? 'spool' : i < 3 ? 'rewriter' : 'operator';
          const cfg = i === 0 ? undefined : i < 3 ? rw(rc) : ({ kind: 'operator', recipe: i === 3 ? { k: 'swap' } : { k: 'invert' } } as Machine['config']);
          const id = idOf(store.place(kind as Machine['kind'], at(x, y), { rot: 0, config: cfg }), kind);
          if (id) ids.push(id);
          x += i === 0 ? 5 : 6;
        });
        store.configure?.(ids[0]!, { kind: 'spool', t: { k: 'knob', term } });
        for (let i = 0; i < ids.length - 1; i++) store.connect({ m: ids[i]!, port: 'out' }, { m: ids[i + 1]!, port: 'q' });
      }
    }
  }
}
(window as unknown as { __lw: unknown }).__lw = store;
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
    const v = s.compiled.machines[b.from.m]?.out; if (!v) return;
    for (let i = 0; i < b.path.length; i++) { const t0 = t - i; if (t0 % 2 !== 0) continue; packets.push({ id: bi * 100000 + t0 + 50000, value: v, at: { k: 'belt', belt: b.id, i } }); }
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
  while (acc >= step) { acc -= step; if (synthetic) setRun(syntheticRun(++syntheticTick)); else store.tick(); }
}
requestAnimationFrame(frame);

// ───────── bar + keys (the HUD owns these in the app) ─────────
const bar = document.getElementById('bar')!;
const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; bar.append(b); return b; };
btn('select', () => store.setTool({ k: 'select' }));
btn('tower', () => store.setTool({ k: 'place', kind: 'tower' }));
btn('rewriter', () => store.setTool({ k: 'place', kind: 'rewriter' }));
btn('∀', () => store.setTool({ k: 'place', kind: 'forall' }));
btn('alt', () => store.toggleAlt());
addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (e.key === 'Escape') { if (store.get().ui.tool.k !== 'select') store.setTool({ k: 'select' }); else { store.select([]); store.openLens(null); } }
  const kinds: Record<string, Machine['kind']> = { '1': 'spool', '2': 'tower', '3': 'rewriter', '4': 'operator', '5': 'joiner', '6': 'theorem', '7': 'forall' };
  if (kinds[e.key]) store.setTool({ k: 'place', kind: kinds[e.key]! });
});

(window as unknown as { __dev: unknown }).__dev = { store, unmount, scene, setSynthetic: (v: boolean) => { synthetic = v; } };
