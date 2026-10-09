// LEMMA WORKS v3 — the transcript drawer (closed by default, ≤ 360 px, overlays the floor).
// The live textbook proof of the compiled graph, via the v2 transcript (shell/proof.ts) through an adapter.
// Hover a line → its machine lights on the floor; Copy as LaTeX.
import type { NodeId, ProofGraph } from '../kernel/types';
import { buildTranscript, standaloneTeX, transcriptHTML, transcriptTeX, type State } from './proof';
import { copyText, h, safe, towerVars, type S, type Store } from './util';

/** The v2 transcript reads {graph, check, level, ctx}; one machine = one station (rewrite + tidy is one line). */
function adapt(s: S): { st: State; nodeToMachine: Map<NodeId, string> } {
  const nodeToMachine = new Map<NodeId, string>();
  for (const [mid, r] of Object.entries(s.compiled?.machines ?? {})) for (const n of r.nodes ?? []) nodeToMachine.set(n, mid);
  const g0: ProofGraph = s.compiled?.graph ?? { nodes: [], rooms: [] };
  const graph: ProofGraph = {
    ...g0,
    rooms: g0.rooms,
    nodes: g0.nodes.map((n) => (n.k === 'step' && !n.meta?.station && nodeToMachine.has(n.id) ? { ...n, meta: { ...n.meta, station: `m:${nodeToMachine.get(n.id)}` } } : n)),
  };
  // Tower variables: the compiled graph's vars, else the floor's Tower declarations (labels x₁, y₁ …)
  if (!graph.vars?.length) { const tv = towerVars(s); if (tv.length) graph.vars = tv.map((v, i) => ({ id: v.id, label: v.label, hue: i % 6, variable: true })); }
  const st = { graph, check: s.compiled?.check ?? { ok: true, nodes: {}, sockets: [], solved: false }, level: s.level, ctx: s.ctx } as unknown as State;
  return { st, nodeToMachine };
}

export interface TranscriptApi { render: (s: S) => void; el: HTMLElement }

export function mountTranscript(layer: HTMLElement, store: Store, opts: { top: () => number }): TranscriptApi {
  const el = h('aside', { class: 'h3-drawer-side h3-transcript', hidden: true, 'aria-label': 'The proof, as built' });
  const copy = h('button', { class: 'lw-key small', title: 'Copy the proof as LaTeX (amsmath + amsthm)' }, 'Copy as LaTeX');
  const tex = h('button', { class: 'lw-key small ghost', title: 'Download a standalone .tex file' }, '.tex');
  const close = h('button', { class: 'h3-x', 'aria-label': 'Close the transcript (T)' }, '×');
  const body = h('div', { class: 'proof-body h3-proof-body' });
  el.append(h('header', { class: 'h3-drawer-head' }, h('span', { class: 'h3-label', title: 'margin wire = rule family' }, 'Proof'), h('span', { class: 'h3-flex' }), copy, tex, close), body);
  layer.append(el);
  close.addEventListener('click', () => store.setUI({ transcriptOpen: false }));

  let map = new Map<NodeId, string>();
  const currentTeX = () => { const { st } = adapt(store.get()); return transcriptTeX(buildTranscript(st), st); };
  copy.addEventListener('click', async () => {
    const ok = await copyText(safe(currentTeX, '% transcript unavailable'));
    copy.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => { copy.textContent = 'Copy as LaTeX'; }, 1600);
  });
  tex.addEventListener('click', () => {
    const s = store.get();
    const blob = new Blob([standaloneTeX(safe(currentTeX, ''))], { type: 'text/x-tex' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `lemma-${s.level.index}-${s.level.title.toLowerCase().replace(/\W+/g, '-')}.tex` });
    document.body.append(a); a.click(); a.remove();
  });
  const machineOf = (t: EventTarget | null) => {
    const n = (t as HTMLElement | null)?.closest?.<HTMLElement>('[data-nodes]');
    const ids = n?.dataset.nodes?.split(' ').filter(Boolean) ?? [];
    for (let i = ids.length - 1; i >= 0; i--) { const m = map.get(ids[i]!); if (m) return m; }
    return null;
  };
  body.addEventListener('mouseover', (e) => { const m = machineOf(e.target); store.setHover(m ? { k: 'machine', id: m } : null); });
  body.addEventListener('mouseleave', () => store.setHover(null));
  body.addEventListener('click', (e) => { const m = machineOf(e.target); if (m) { store.select([m]); store.openLens(m); } });

  let lastComp: unknown = null, lastLevel = '', lastHover = '';
  const render = (s: S) => {
    const open = s.ui.transcriptOpen && s.ui.screen === 'floor';
    if (el.hidden === open) el.hidden = !open;
    if (!open) return;
    el.style.top = `${opts.top()}px`;
    if (s.compiled !== lastComp || s.level.id !== lastLevel) {
      lastComp = s.compiled; lastLevel = s.level.id; lastHover = '';
      const { st, nodeToMachine } = adapt(s);
      map = nodeToMachine;
      body.innerHTML = safe(() => transcriptHTML(buildTranscript(st), st), '<p class="t-empty">The transcript is waiting for the compiler.</p>');
      body.querySelectorAll<HTMLElement>('[data-nodes]').forEach((n) => {
        const ids = (n.dataset.nodes ?? '').split(' ').filter(Boolean);
        const ms = [...new Set(ids.map((i) => map.get(i)).filter(Boolean))];
        n.dataset.machines = ms.join(' ');
      });
      const t = body.querySelector('.t-empty');
      if (t) t.textContent = 'Each machine you build adds a line here.';
    }
    const hov = s.ui.hover?.k === 'machine' ? s.ui.hover.id : '';
    const key = `${hov}|${s.ui.lens ?? ''}`;
    if (key !== lastHover) {
      lastHover = key;
      body.querySelectorAll<HTMLElement>('[data-machines]').forEach((n) => {
        const ms = (n.dataset.machines ?? '').split(' ');
        n.classList.toggle('is-hover', !!hov && ms.includes(hov));
        n.classList.toggle('is-active', !!s.ui.lens && ms.includes(s.ui.lens));
      });
    }
  };
  return { render, el };
}
