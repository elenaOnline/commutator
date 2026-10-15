// LEMMA WORKS v3 — run cluster (top-right): play/pause, step, speed, tick counter, metrics, toggles.
// Also the simulation clock: rAF → store.tick() at TICKS_PER_SECOND × speed while playing; pauses when hidden.
import * as F from '../factory';
import type { FactoryMetrics } from '../factory/types';
import { camp, h, safe, type S, type Store } from './util';

export interface RunApi { render: (s: S) => void; el: HTMLElement; frame: (now: number) => void }

export function mountRun(layer: HTMLElement, store: Store, hooks: { toggleTranscript: () => void; toggleLab: () => void; isLabOpen: () => boolean; toggleBook: () => void }): RunApi {
  const el = h('section', { class: 'h3-run', 'aria-label': 'Run controls' });
  layer.append(el);

  const play = h('button', { class: 'h3-play', title: 'Play / pause (Space)', 'aria-label': 'Play' });
  const step = h('button', { class: 'h3-icon', title: 'Step one tick (.)', 'aria-label': 'Step one tick' }, '⏭');
  const speeds = [1, 2, 4].map((v) => {
    const b = h('button', { class: 'h3-seg', 'data-v': v, 'aria-label': `Speed ${v}×` }, `${v}×`);
    b.addEventListener('click', () => store.setSpeed(v));
    return b;
  });
  const tick = h('span', { class: 'h3-tick', title: 'Simulation tick' });
  const undo = h('button', { class: 'h3-icon', title: 'Undo (⌘Z)', 'aria-label': 'Undo' }, '↶');
  const redo = h('button', { class: 'h3-icon', title: 'Redo (⇧⌘Z)', 'aria-label': 'Redo' }, '↷');
  play.addEventListener('click', () => store.setPlaying(!store.get().ui.playing));
  step.addEventListener('click', () => safe(() => store.stepOnce(), undefined));
  undo.addEventListener('click', () => store.undo());
  redo.addEventListener('click', () => store.redo());

  const mx = { machines: h('b', {}), area: h('b', {}), cycles: h('b', {}) };
  const best = { machines: h('span', { class: 'h3-best' }), area: h('span', { class: 'h3-best' }), cycles: h('span', { class: 'h3-best' }) };
  const metric = (k: keyof typeof mx, label: string, tip: string) => h('span', { class: 'h3-metric', title: tip }, h('span', { class: 'h3-mk' }, label), mx[k], best[k]);

  const alt = h('button', { class: 'h3-tog', title: 'Formulas on every belt (Alt)', 'aria-pressed': 'false' }, h('span', { class: 'h3-tog-g' }, 'Alt'), 'formulas');
  const proof = h('button', { class: 'h3-tog', title: 'The proof, as a textbook transcript (T)', 'aria-pressed': 'false' }, h('span', { class: 'h3-tog-g', html: '<span class="tomb"></span>' }), 'Proof');
  const lab = h('button', { class: 'h3-tog', title: 'Conjecture lab: test claims on small groups', 'aria-pressed': 'false' }, h('span', { class: 'h3-tog-g' }, '?='), 'Lab');
  const book = h('button', { class: 'h3-tog', title: 'Your Lemma Book: theorems you proved (L)', 'aria-pressed': 'false' }, h('span', { class: 'h3-tog-g math' }, '∀'), 'Lemmas');
  // review 2026-10 (3cb4f78e): Out, the Dock's Expected and the Generalize line drawn as terms (default on)
  const terms = h('button', { class: 'h3-tog h3-outterms', title: 'Out as terms: draw Out, Expected and Generalize as terms, not text', 'aria-pressed': 'true' }, h('span', { class: 'h3-tog-g h3-terms-g' }, 'ab'), 'Out as terms');
  terms.addEventListener('click', () => store.setOutAsTerms(store.get().save.settings.outAsTerms === false));
  book.addEventListener('click', () => hooks.toggleBook());
  alt.addEventListener('click', () => store.toggleAlt());
  proof.addEventListener('click', () => hooks.toggleTranscript());
  lab.addEventListener('click', () => hooks.toggleLab());

  el.append(
    h('div', { class: 'h3-run-row' }, play, step, h('span', { class: 'h3-segs h3-speed' }, ...speeds), tick, h('span', { class: 'h3-vsep' }), undo, redo),
    h('div', { class: 'h3-run-row h3-metrics' },
      metric('machines', 'Machines', 'Machines you placed'),
      metric('area', 'Area', 'Tiles you used'),
      metric('cycles', 'Cycles', 'Ticks until every dock is filled')),
    h('div', { class: 'h3-run-row h3-togs' }, alt, terms, proof, book, lab));

  let lastKey = '', lastRun: unknown = null, lastComp: unknown = null, lastDel = -1, lastSave: unknown = null;
  const fmt = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : String(n));
  const render = (s: S) => {
    const u = s.ui;
    const ot = s.save.settings.outAsTerms !== false;
    const key = JSON.stringify([u.playing, u.speed, u.alt, ot, u.transcriptOpen, hooks.isLabOpen(), u.lemmaBookOpen, camp(s).lemmas.length, s.level.id]);
    if (key !== lastKey) {
      lastKey = key;
      play.classList.toggle('on', u.playing);
      play.innerHTML = u.playing ? '<span class="h3-pause"></span>' : '<span class="h3-tri"></span>';
      play.setAttribute('aria-label', u.playing ? 'Pause' : 'Play');
      speeds.forEach((b) => b.classList.toggle('on', +b.dataset.v! === u.speed));
      for (const [b, on] of [[alt, u.alt], [terms, ot], [proof, u.transcriptOpen], [lab, hooks.isLabOpen()], [book, !!u.lemmaBookOpen]] as const) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
      book.dataset.count = String(camp(s).lemmas.length);
      lab.classList.toggle('has-predict', !!s.level.predict?.length && !camp(s).levels[s.level.id]?.solvedAt);
    }
    if (s.run !== lastRun) {
      lastRun = s.run;
      tick.innerHTML = `<b>${s.run?.tick ?? 0}</b> ticks`;
    }
    // metrics only change on edits and deliveries
    const nDel = Object.keys(s.run?.delivered ?? {}).length;
    if (s.compiled !== lastComp || nDel !== lastDel || s.save !== lastSave) {
      lastComp = s.compiled; lastDel = nDel; lastSave = s.save;
      const m: FactoryMetrics | null = safe(() => store.metrics(), null);
      const b = camp(s).levels[s.level.id]?.best;
      mx.machines.textContent = fmt(m?.machines); mx.area.textContent = fmt(m?.area); mx.cycles.textContent = fmt(m?.cycles);
      best.machines.textContent = b ? `best ${fmt(b.machines)}` : '';
      best.area.textContent = b ? `best ${fmt(b.area)}` : '';
      best.cycles.textContent = b ? `best ${fmt(b.cycles)}` : '';
    }
  };

  // ───────── clock ─────────
  let last = performance.now(), acc = 0;
  const frame = (now: number) => {
    const dt = Math.min(250, now - last); last = now;
    const s = store.get();
    if (document.hidden || !s.ui.playing || s.ui.screen !== 'floor') { acc = 0; return; }
    const tps = (F.TICKS_PER_SECOND ?? 8) * (s.ui.speed || 1);
    acc += (dt / 1000) * tps;
    let n = 0;
    while (acc >= 1 && n < 8) { acc -= 1; n++; if (!safe(() => { store.tick(); return true; }, false)) { acc = 0; break; } }
    if (n === 8) acc = 0; // never spiral after a long frame
  };
  document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; });

  return { render, el, frame };
}
