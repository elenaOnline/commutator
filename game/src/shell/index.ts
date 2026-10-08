// LEMMA WORKS — app shell (layout, level map, work order, transcript, toolbox, QED, metrics). Owner: shell builder.
import type { Store, State } from '../state/store';
import { mountBoard } from '../board';
import { mountBench } from '../bench';
import { FAMILY, reducedMotion } from '../ui/tokens';
import { MATH_CSS } from '../ui/math';
import type { Family, NodeId } from '../kernel/types';
import './shell.css';
import { h, safe } from './util';
import { mountMap, mountMiniMap } from './map';
import { mountControls, mountMetrics, mountToolbox, mountWorkOrder } from './panels';
import { buildTranscript, standaloneTeX, transcriptHTML, transcriptTeX } from './proof';
import { mountLab } from './lab';
import { mountCeremony } from './ceremony';

export function mountShell(root: HTMLElement, store: Store): void {
  // family inks as CSS variables, straight from the tokens (colour = mechanic)
  const vars = (Object.keys(FAMILY) as Family[]).map((f) => `--fam-${f}:${FAMILY[f].ink};--fam-${f}-text:${FAMILY[f].text};`).join('');
  const style = document.createElement('style');
  style.textContent = `:root{${vars}}\n${MATH_CSS}`;
  document.head.append(style);

  root.innerHTML = '';
  const app = h('div', { class: 'lw-app' });
  const mapEl = h('div', {});
  const left = h('aside', { class: 'lw-left', 'aria-label': 'Work order and proof' });
  const woEl = h('div', {});
  const proofEl = h('section', { class: 'lw-proof', 'aria-label': 'The proof, as built' });
  const metricsEl = h('div', {});
  const main = h('main', { class: 'lw-main' });
  const boardWrap = h('div', { class: 'lw-boardwrap' });
  const boardEl = h('div', { id: 'board', class: 'lw-board' });
  const miniEl = h('div', {});
  const labBtn = h('button', { class: 'lab-toggle', title: 'State a claim and test it on small groups' }, h('span', { class: 'lab-glyph' }, '?='), 'Conjecture lab');
  const labEl = h('div', {});
  const toolboxEl = h('div', {});
  const benchEl = h('div', { id: 'bench', class: 'lw-bench' });
  const controlsEl = h('div', {});
  const ceremonyEl = h('div', {});
  const toastEl = h('div', { class: 'lw-toast', role: 'status', 'aria-live': 'polite' });
  boardWrap.append(boardEl, miniEl, labBtn, labEl);
  main.append(boardWrap, toolboxEl, benchEl, controlsEl, ceremonyEl, toastEl);
  left.append(woEl, proofEl, metricsEl);
  const levelEl = h('div', { class: 'lw-level' }, left, main);
  app.append(mapEl, levelEl);
  root.append(app);

  let toastT = 0;
  const toast = (msg: string) => {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = window.setTimeout(() => toastEl.classList.remove('on'), 3200);
  };

  // ── proof transcript panel
  const copyBtn = h('button', { class: 'lw-key small', title: 'Copy the proof as LaTeX (amsmath + amsthm)' }, 'Copy as LaTeX');
  const texBtn = h('button', { class: 'lw-key small ghost', title: 'Download a standalone .tex file' }, '.tex');
  const proofBody = h('div', { class: 'proof-body' });
  proofEl.append(h('header', { class: 'proof-head' }, h('span', { class: 'proof-title' }, 'Proof'), h('span', { class: 'proof-note' }, 'margin wire = rule family'), copyBtn, texBtn), proofBody);
  const currentTeX = () => { const s = store.get(); return transcriptTeX(buildTranscript(s), s); };
  copyBtn.addEventListener('click', async () => {
    const tex = currentTeX();
    let ok = false;
    try { await navigator.clipboard.writeText(tex); ok = true; } catch {
      const ta = h('textarea', {}, tex); document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove();
    }
    copyBtn.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => { copyBtn.textContent = 'Copy as LaTeX'; }, 1600);
  });
  texBtn.addEventListener('click', () => {
    const s = store.get();
    const blob = new Blob([standaloneTeX(currentTeX())], { type: 'text/x-tex' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `lemma-${s.level.index}-${s.level.title.toLowerCase().replace(/\W+/g, '-')}.tex` });
    document.body.append(a); a.click(); a.remove();
  });
  proofBody.addEventListener('mouseover', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-nodes]');
    const ids = t?.dataset.nodes?.split(' ').filter(Boolean) ?? [];
    store.setHover(ids.length ? ids[ids.length - 1]! : null);
  });
  proofBody.addEventListener('mouseleave', () => store.setHover(null));
  proofBody.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-nodes]');
    const ids = t?.dataset.nodes?.split(' ').filter(Boolean) ?? [];
    const id = ids[ids.length - 1];
    if (id && store.get().graph.nodes.some((n) => n.id === id)) store.setActive(id);
  });
  /** Justifications move under their equation when the column gets too narrow to hold them. */
  const restack = () => {
    proofBody.querySelectorAll<HTMLElement>('.t-grid').forEach((grid) => {
      grid.classList.remove('stacked');
      const cramped = [...grid.querySelectorAll<HTMLElement>('.t-just')].some((j) => j.textContent && (j.offsetHeight > 34 || j.scrollWidth > j.clientWidth + 1 || j.clientWidth < 72));
      if (cramped) grid.classList.add('stacked');
    });
  };
  new ResizeObserver(() => restack()).observe(proofBody);
  let lastProof: { g: unknown; c: unknown } = { g: null, c: null };
  let lastLevel = '';
  let lastMarks = '';
  // follow the tail while the reader is at the newest line; otherwise offer a "Latest step" pill
  const pill = h('button', { class: 'proof-pill', hidden: true }, 'Latest step ↓');
  proofEl.append(pill);
  let following = true, autoScrollUntil = 0;
  const boxOf = (n: Element | null) => (n && n.classList.contains('t-line') ? n.querySelector('.t-rhs') ?? n.querySelector('span') : n) as HTMLElement | null;
  const atBottom = () => proofBody.scrollTop + proofBody.clientHeight >= proofBody.scrollHeight - 12;
  const autoScroll = (fn: () => void) => { autoScrollUntil = performance.now() + 250; fn(); };
  const goToLatest = () => {
    following = true; pill.hidden = true;
    const act = boxOf(proofBody.querySelector('.is-active'));
    autoScroll(() => { proofBody.scrollTop = proofBody.scrollHeight; if (act) act.scrollIntoView({ block: 'nearest' }); });
  };
  proofBody.addEventListener('scroll', () => {
    if (performance.now() < autoScrollUntil) return;
    following = atBottom();
    if (following) pill.hidden = true;
  }, { passive: true });
  pill.addEventListener('click', goToLatest);
  /** After the QED: show the concluding line (the one carrying the ∎). */
  const revealConclusion = () => {
    const qeds = proofBody.querySelectorAll('.t-qed');
    const last = qeds[qeds.length - 1]?.closest('.t-line, .t-prose') ?? null;
    const box = boxOf(last);
    if (box) autoScroll(() => box.scrollIntoView({ block: 'center' }));
  };

  const renderProof = (s: State) => {
    if (s.graph !== lastProof.g || s.check !== lastProof.c) {
      const grew = lastProof.g !== null && (s.graph as { nodes: unknown[] }).nodes.length > ((lastProof.g as { nodes: unknown[] }).nodes.length);
      const sameLevel = lastLevel === s.level.id;
      lastProof = { g: s.graph, c: s.check };
      proofBody.innerHTML = safe(() => transcriptHTML(buildTranscript(s), s), '<p class="t-empty">The transcript is waiting for the kernel.</p>');
      lastMarks = '';
      restack();
      if (!sameLevel) { lastLevel = s.level.id; following = true; pill.hidden = true; autoScroll(() => { proofBody.scrollTop = 0; }); }
      else if (grew && following) requestAnimationFrame(goToLatest);
      else if (grew) pill.hidden = false;
    }
    // hover / active / replay marks without re-rendering (the board shows the frontier node too)
    const r = s.ui.replay;
    const revealed = Number.isFinite(r.cursor) && r.order.length ? new Set(r.order.slice(0, Math.floor(r.cursor) + 1)) : null;
    const key = `${s.ui.hoverNode}|${s.ui.activeNode}|${revealed ? revealed.size : 'all'}`;
    if (key === lastMarks) return;
    const activeChanged = !lastMarks.includes(`|${s.ui.activeNode}|`);
    lastMarks = key;
    let activeLine: HTMLElement | null = null, frontier: HTMLElement | null = null;
    proofBody.querySelectorAll<HTMLElement>('[data-nodes]').forEach((n) => {
      const ids = (n.dataset.nodes ?? '').split(' ').filter(Boolean) as NodeId[];
      n.classList.toggle('is-hover', !!s.ui.hoverNode && ids.includes(s.ui.hoverNode));
      const act = !!s.ui.activeNode && ids.includes(s.ui.activeNode);
      n.classList.toggle('is-active', act);
      if (act) activeLine = n;
      const fut = !!revealed && ids.length > 0 && !ids.some((id) => revealed.has(id));
      n.classList.toggle('future', fut);
      if (revealed && !fut && ids.length) frontier = n;
    });
    // lines without their own nodes (closing links, room frames) follow the line before them
    if (revealed) {
      let prevFuture = false;
      proofBody.querySelectorAll<HTMLElement>('.t-line, .t-prose, .t-room-tag').forEach((n) => {
        if (n.dataset.nodes) { prevFuture = n.classList.contains('future'); return; }
        if (!n.classList.contains('goal-ghost')) n.classList.toggle('future', prevFuture);
      });
    } else proofBody.querySelectorAll('.future').forEach((n) => n.classList.remove('future'));
    if (revealed && frontier && following) { const b = boxOf(frontier); if (b) autoScroll(() => b.scrollIntoView({ block: 'nearest' })); }
    else if (activeChanged && following) { const b = boxOf(activeLine); if (b) autoScroll(() => b.scrollIntoView({ block: 'nearest' })); }
  };

  // ── panels
  const renderMap = mountMap(mapEl, store);
  const renderMini = mountMiniMap(miniEl, store);
  const renderWO = mountWorkOrder(woEl, store, toast);
  const renderTB = mountToolbox(toolboxEl, store);
  const renderMetrics = mountMetrics(metricsEl, store);
  const renderControls = mountControls(controlsEl, store);
  const lab = mountLab(labEl, store, toast);
  lab.onToggle((open) => labBtn.classList.toggle('on', open));
  labBtn.addEventListener('click', () => lab.toggle());
  const renderCeremony = mountCeremony(ceremonyEl, store, { receipt: () => toolboxEl.querySelector<HTMLElement>('.tb-receipt'), onDone: () => revealConclusion() });

  try { mountBoard(boardEl, store); } catch (err) { console.warn('[shell] board failed to mount', err); boardEl.textContent = 'board: unavailable'; }
  try { mountBench(benchEl, store); } catch (err) { console.warn('[shell] bench failed to mount', err); benchEl.textContent = 'bench: unavailable'; }

  let lastScreen = '';
  const render = (s: State) => {
    if (s.ui.screen !== lastScreen) {
      lastScreen = s.ui.screen;
      app.dataset.screen = s.ui.screen;
      document.title = s.ui.screen === 'map' ? 'Lemma Works · theorem map' : `Lemma Works · ${s.level.index} ${s.level.title}`;
    }
    if (s.ui.screen === 'map') { renderMap(s); return; }
    document.title = `Lemma Works · ${s.level.index} ${s.level.title}`;
    labBtn.hidden = !s.level.tools.conjecture;
    if (!s.level.tools.conjecture) lab.toggle(false);
    for (const [name, fn] of [['work order', renderWO], ['proof', renderProof], ['metrics', renderMetrics], ['toolbox', renderTB],
      ['controls', renderControls], ['mini map', renderMini], ['lab', lab.render], ['ceremony', renderCeremony]] as const) {
      try { fn(s); } catch (err) { console.warn(`[shell] ${name} render failed`, err); }
    }
  };
  store.subscribe(render);
  render(store.get());

  // ── replay clock
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(100, t - last); last = t;
    if (store.get().ui.replay.playing) store.tickReplay(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // ── keyboard
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const s = store.get();
    const k = e.key.toLowerCase();
    if (k === 'm' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (s.ui.screen === 'map') store.openLevel(s.ui.levelId); else store.openMap(); return; }
    if (s.ui.screen !== 'level') return;
    if (k === ' ' && !t.closest('button')) { e.preventDefault(); if (s.ui.replay.playing) store.pauseReplay(); else store.playReplay(); return; }
    if (k === 'z' && !e.altKey) { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (k === 'y' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); store.redo(); return; }
    if (k === 'escape') { store.setSelection(null); store.setArmed(null); store.setHover(null); }
  });

  if (reducedMotion()) app.classList.add('reduced-motion');
}
