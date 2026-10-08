// LEMMA WORKS — work order, toolbox, metrics, replay/edit controls.
import type { AxiomId, Card, Fact, RuleRef, Term } from '../kernel/types';
import type { State, Store } from '../state/store';
import { FAMILY } from '../ui/tokens';
import { CHAPTERS, K, REGISTRY, esc, h, isSolved, labels, nextLevel, safe, schemaLemmaNo, schemaNames, fH, tH, tU, nameHTML } from './util';

const ruleKey = (r: RuleRef | null) => (r ? JSON.stringify(r) : '');

// ───────────────────────────── work order ─────────────────────────────
export function mountWorkOrder(el: HTMLElement, store: Store, toast: (msg: string) => void): (s: State) => void {
  void K;
  el.className = 'lw-wo';
  let lastKey = '';
  return (s: State) => {
    const lv = s.level;
    const pressNodes = s.graph.nodes.filter((n) => n.k === 'press').map((n) => n.id);
    const key = JSON.stringify([lv.id, s.check.solved, s.check.sockets.map((x) => x.ok), s.graph.rooms.map((r) => r.id), s.graph.nodes.filter((n) => n.k === 'exit').length, pressNodes, ruleKey(s.ui.armed), s.ui.activeNode]);
    if (key === lastKey) return;
    lastKey = key;
    const L = labels(lv);
    const ch = CHAPTERS[lv.chapter]!;
    const solved = s.check.solved || isSolved(s.save, lv.id);
    const multi = lv.sockets.length > 1;
    el.innerHTML = '';
    const mapBtn = h('button', { class: 'wo-mapbtn', title: 'Theorem map (M)', 'aria-label': 'Open the theorem map' }, '◇ Map');
    mapBtn.addEventListener('click', () => store.openMap());
    el.append(
      h('header', { class: 'wo-head' }, mapBtn, h('span', { class: 'wo-badge' }, lv.side ? 'S' : String(lv.index)),
        h('span', { class: 'wo-ch' }, lv.side ? `Side order · Chapter ${ch.roman}` : `Chapter ${ch.roman} · ${ch.name}`)),
      h('h1', { class: 'wo-title' }, lv.title),
      h('p', { class: 'wo-memo' }, lv.memo),
      h('div', { class: 'wo-label' }, h('span', {}, multi ? `Deliver both (${lv.sockets.length} sockets)` : 'Deliver'), solved ? h('span', { class: 'wo-solved', html: '<span class="tomb" aria-hidden="true"></span> proven' }) : null),
    );
    for (const sk of lv.sockets) {
      const done = !!s.check.sockets.find((x) => x.id === sk.id)?.ok || isSolved(s.save, lv.id);
      el.append(h('div', { class: `wo-goal math${multi ? ' multi' : ''}${done ? ' sealed' : ''}`, 'data-socket': sk.id,
        html: (multi ? `<span class="wo-sock">${esc(sk.id)}</span>` : '') + `<span>${fH(sk.target, L)}</span>` + (done ? '<span class="wo-seal" aria-label="delivered"><span class="tomb"></span></span>' : '') }));
    }
    // ── givens as small cards
    if (lv.givens.length) {
      const wrap = h('div', { class: 'wo-givens' });
      for (const g of lv.givens) {
        const nodeId = `g:${g.id}`;
        const f = g.fact;
        const card = h('div', { class: `given-card k-${f.k}` });
        const body = h('button', { class: 'given-main', title: '' },
          h('span', { class: 'given-name math', html: g.name === '|G|' ? '' : nameHTML(g.name) }),
          h('span', { class: 'given-fact math', html: fH(f, L) }));
        if (g.name === '|G|') body.querySelector('.given-name')!.remove();
        if (f.k === 'eq' || f.k === 'neq') {
          body.title = 'Put this on the bench as the active pallet';
          const active = s.ui.activeNode && (s.ui.activeNode === nodeId || store.endOf(nodeId) === s.ui.activeNode);
          if (active) card.classList.add('active');
          body.addEventListener('click', () => store.setActive(store.endOf(nodeId)));
          body.addEventListener('mouseenter', () => store.setHover(nodeId));
          body.addEventListener('mouseleave', () => store.setHover(null));
        } else if (f.k === 'law' || f.k === 'cond') {
          const ref: RuleRef = { k: 'node', id: nodeId };
          if (ruleKey(s.ui.armed) === ruleKey(ref)) card.classList.add('armed');
          body.title = f.k === 'law' ? 'Pick up this law: the bench lights every span it rewrites' : 'Pick up this rule: the bench lights where its premise holds';
          body.addEventListener('click', () => store.setArmed(ruleKey(store.get().ui.armed) === ruleKey(ref) ? null : ref));
        } else if (f.k === 'size') {
          body.disabled = true;
          body.title = 'The order of the group';
        }
        card.append(body);
        if (f.k === 'size' && lv.tools.press) {
          const pressed = s.graph.nodes.find((n) => n.k === 'press' && n.input === nodeId);
          if (!pressed) {
            const btn = h('button', { class: 'given-act imported' }, 'Run the Lagrange press');
            btn.title = 'Imported: Lagrange’s theorem gives xⁿ = e for every x when |G| = n';
            btn.addEventListener('click', () => {
              const r = store.press(nodeId);
              if (!r.ok) toast(r.error);
              else store.setArmed({ k: 'node', id: r.value });
            });
            card.append(btn);
          } else {
            const pf = s.check.nodes[pressed.id]?.fact;
            const ref: RuleRef = { k: 'node', id: pressed.id };
            const btn = h('button', { class: `given-act pressed${ruleKey(s.ui.armed) === ruleKey(ref) ? ' armed' : ''}`, html: `⇒&ensp;<span class="math">${pf ? fH(pf, L) : 'pressed'}</span>` });
            btn.title = 'Pick up the pressed law';
            btn.addEventListener('click', () => store.setArmed(ruleKey(store.get().ui.armed) === ruleKey(ref) ? null : ref));
            card.append(btn);
          }
        }
        wrap.append(card);
      }
      el.append(h('div', { class: 'wo-label' }, 'Givens'), wrap);
    }
    // ── rooms + new spool
    const acts = h('div', { class: 'wo-actions' });
    for (const sk of lv.sockets) {
      const t = sk.target;
      if (t.k !== 'eq' && t.k !== 'neq') continue;
      const kind = t.k === 'neq' ? 'suppose' : 'classical';
      if ((kind === 'suppose' && !lv.tools.suppose) || (kind === 'classical' && !lv.tools.classical)) continue;
      const assume: Fact = kind === 'suppose' ? { k: 'eq', l: t.l, r: t.r } : { k: 'neq', l: t.l, r: t.r };
      const existing = s.graph.rooms.find((r) => r.kind === kind && r.parent === 'root' && JSON.stringify(r.l) === JSON.stringify(t.l) && JSON.stringify(r.r) === JSON.stringify(t.r)
        && !s.graph.nodes.some((n) => n.k === 'exit' && n.room === r.id));
      const btn = h('button', { class: `room-btn ${kind}`, html: existing
        ? `Back into the room: <span class="math">${fH(assume, L)}</span>`
        : `Suppose <span class="math">${fH(assume, L)}</span>${kind === 'classical' ? ' <span class="room-cl">classical</span>' : ''}`, 'aria-label': `Suppose ${tU(assume.l, L)} ${kind === 'suppose' ? '=' : '≠'} ${tU(assume.r, L)}` });
      btn.title = kind === 'suppose' ? 'Open a room assuming the opposite; a clash inside proves the goal' : 'Classical room: assume the negation; a clash proves the equation (excluded middle)';
      btn.addEventListener('click', () => {
        if (existing) {
          const a = store.get().graph.nodes.find((n) => n.k === 'assume' && n.room === existing.id);
          if (a) store.setActive(store.endOf(a.id));
          return;
        }
        const r = store.openRoom(kind, t.l, t.r);
        if (!r.ok) toast(r.error);
      });
      acts.append(btn);
    }
    if (acts.childElementCount) el.append(acts);
    if (solved) {
      const nb = nextOrderButton(store);
      nb.classList.add('small');
      if (!nextLevel(s.save, lv.id)) nb.textContent = 'Theorem map →';
      el.append(h('div', { class: 'wo-next' }, nb));
    }
  };
}

// ───────────────────────────── toolbox ─────────────────────────────
const AXIOMS: { id: AxiomId; fam: 'identity' | 'inverse'; l: Term; r: Term; name: string }[] = [
  { id: 'unitL', fam: 'identity', l: { k: 'mul', fs: [{ k: 'e' }, { k: 'meta', id: 'x' }] }, r: { k: 'meta', id: 'x' }, name: 'left unit' },
  { id: 'unitR', fam: 'identity', l: { k: 'mul', fs: [{ k: 'meta', id: 'x' }, { k: 'e' }] }, r: { k: 'meta', id: 'x' }, name: 'right unit' },
  { id: 'invL', fam: 'inverse', l: { k: 'mul', fs: [{ k: 'inv', arg: { k: 'meta', id: 'x' } }, { k: 'meta', id: 'x' }] }, r: { k: 'e' }, name: 'left inverse' },
  { id: 'invR', fam: 'inverse', l: { k: 'mul', fs: [{ k: 'meta', id: 'x' }, { k: 'inv', arg: { k: 'meta', id: 'x' } }] }, r: { k: 'e' }, name: 'right inverse' },
];

export function mountToolbox(el: HTMLElement, store: Store): (s: State) => void {
  el.className = 'lw-toolbox';
  el.setAttribute('aria-label', 'Toolbox');
  const row = h('div', { class: 'tb-row' });
  const prev = h('button', { class: 'tb-arrow prev', 'aria-label': 'Scroll toolbox left' }, '‹');
  const next = h('button', { class: 'tb-arrow next', 'aria-label': 'Scroll toolbox right' }, '›');
  const strip = h('div', { class: 'tb-strip' }, prev, row, next);
  const receipt = h('button', { class: 'tb-receipt', title: 'Machines you have earned. Click to show them.' });
  receipt.addEventListener('click', () => { const m = row.querySelector<HTMLElement>('.tool.machine:not(.locked)'); if (m) row.scrollTo({ left: m.offsetLeft - 8, behavior: 'smooth' }); });
  const setReceipt = () => {
    const n = store.get().save.earned.length - Number(receipt.dataset.pending ?? 0);
    receipt.innerHTML = `<span class="machine-band"></span><b>${Math.max(0, n)}</b> earned`;
  };
  receipt.addEventListener('lw-receipt-land', setReceipt);
  el.append(h('div', { class: 'tb-label' }, 'Toolbox'), receipt, strip);
  const edges = () => {
    const over = row.scrollWidth > row.clientWidth + 2;
    strip.classList.toggle('can-left', over && row.scrollLeft > 2);
    strip.classList.toggle('can-right', over && row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
  };
  prev.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth * 0.7, behavior: 'smooth' }));
  next.addEventListener('click', () => row.scrollBy({ left: row.clientWidth * 0.7, behavior: 'smooth' }));
  row.addEventListener('scroll', edges, { passive: true });
  row.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  new ResizeObserver(edges).observe(row);
  let lastKey = '';
  return (s: State) => {
    const lv = s.level;
    const pressNodes = s.graph.nodes.filter((n) => n.k === 'press').map((n) => n.id);
    setReceipt();
    const key = JSON.stringify([lv.id, s.ctx.level.tools.schemas, ruleKey(s.ui.armed), pressNodes, s.save.earned]);
    if (key === lastKey) return;
    lastKey = key;
    row.innerHTML = '';
    const armedKey = ruleKey(s.ui.armed);
    const arm = (ref: RuleRef) => () => store.setArmed(ruleKey(store.get().ui.armed) === ruleKey(ref) ? null : ref);
    const L = labels(lv);
    // axiom stamps
    for (const ax of AXIOMS) {
      const ref: RuleRef = { k: 'axiom', id: ax.id };
      const b = h('button', { class: `tool stamp chip fam-${ax.fam}${armedKey === ruleKey(ref) ? ' armed' : ''}`, title: `Axiom (${ax.name}). Click to pick it up; the bench lights where it applies.`, 'aria-label': `Axiom ${ax.name}` },
        h('span', { class: 'tool-glyph', style: `--ink:${FAMILY[ax.fam].ink}` }, FAMILY[ax.fam].glyph),
        h('span', { class: 'tool-stmt math', html: `${tH(ax.l, L)}<span class="m-rel">=</span>${tH(ax.r, L)}` }));
      b.addEventListener('click', arm(ref));
      row.append(b);
    }
    // whole-pallet moves (offered by the bench when nothing is selected)
    const moves: { label: string; stmt: string; fam: 'structure' | 'equation'; on: boolean }[] = [
      { label: 'lift', stmt: '<i>L</i> = <i>R</i> ⇒ <i>tL</i> = <i>tR</i>', fam: 'structure', on: lv.tools.lift },
      { label: 'swap', stmt: '<i>L</i> = <i>R</i> ⇒ <i>R</i> = <i>L</i>', fam: 'equation', on: true },
    ];
    for (const m of moves.filter((x) => x.on)) {
      const b = h('button', { class: `tool move chip fam-${m.fam}`, title: `${m.label === 'lift' ? 'Lift: multiply both sides' : 'Swap: symmetry'}. Offered on the bench when the whole pallet is selected.` },
        h('span', { class: 'tool-glyph', style: `--ink:${FAMILY[m.fam].ink}` }, FAMILY[m.fam].glyph),
        h('span', { class: 'tool-name' }, m.label));
      b.addEventListener('click', () => { store.setArmed(null); store.setSelection(null); });
      row.append(b);
    }
    // earned machines
    const usable = new Set(s.ctx.level.tools.schemas);
    for (const id of lv.tools.schemas) {
      const sc = REGISTRY[id];
      if (!sc) continue;
      const earned = usable.has(id);
      const ref: RuleRef = { k: 'schema', id };
      const mref: RuleRef = { k: 'schema', id, mirror: true };
      const nm = schemaNames(id);
      const no = schemaLemmaNo(id);
      const card = h('div', { class: `tool machine${earned ? '' : ' locked'}${armedKey === ruleKey(ref) || armedKey === ruleKey(mref) ? ' armed' : ''}`, 'data-schema': id });
      const main = h('button', { class: 'machine-main', disabled: !earned, title: earned ? `${nm.name} — ${nm.textbook}${no ? ` (Lemma ${no})` : ''}. Click to pick it up.` : `Earned by proving level ${no ?? '?'}` },
        h('span', { class: 'machine-band' }),
        h('span', { class: 'machine-name' }, nm.name, h('span', { class: 'machine-tb' }, earned ? (no ? ` · Lemma ${no}` : '') : ` · locked, level ${no ?? '?'}`)),
        h('span', { class: 'machine-stmt math', html: earned ? cardHTML(sc.card) : '?' }));
      if (earned) main.addEventListener('click', arm(ref));
      card.append(main);
      if (sc.mirrorable && earned) {
        const mb = h('button', { class: `machine-mirror${armedKey === ruleKey(mref) ? ' on' : ''}`, title: `Mirror (Gᵒᵖ): ${schemaNames(id, true).textbook}` }, 'ᵒᵖ');
        mb.addEventListener('click', arm(mref));
        card.append(mb);
      }
      row.append(card);
    }
    // the imported press
    if (lv.tools.press) {
      const size = lv.givens.find((g) => g.fact.k === 'size');
      const pressed = s.graph.nodes.find((n) => n.k === 'press');
      const ref: RuleRef | null = pressed ? { k: 'node', id: pressed.id } : null;
      const b = h('button', { class: `tool press${ref && armedKey === ruleKey(ref) ? ' armed' : ''}`, title: 'Lagrange’s theorem, imported: not proven in this game' },
        h('span', { class: 'press-tag' }, 'Imported'),
        h('span', { class: 'machine-name' }, 'Lagrange Press'),
        h('span', { class: 'machine-stmt math', html: '|<i>G</i>| = <i>n</i> ⇒ <i>x</i><sup class="m-sup"><i>n</i></sup> = <i>e</i>' }));
      b.addEventListener('click', () => {
        if (ref) { arm(ref)(); return; }
        if (!size) return;
        const r = store.press(`g:${size.id}`);
        if (r.ok) store.setArmed({ k: 'node', id: r.value });
      });
      row.append(b);
    }
    requestAnimationFrame(edges);
    row.querySelector('.armed')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  };
}

export function cardHTML(c: Card): string {
  return fH(c as Fact, {}).replace(/^∀[^.]*\.&ensp;/, '');
}

// ───────────────────────────── metrics ─────────────────────────────
export function mountMetrics(el: HTMLElement, _store: Store): (s: State) => void {
  el.className = 'lw-metrics';
  let lastKey = '';
  return (s: State) => {
    const pr = s.save.levels[s.level.id];
    const m = s.check.solved ? safe(() => K.metrics(s.graph, s.check, s.ctx), null) : null;
    const key = JSON.stringify([s.level.id, m, pr?.best, pr?.history?.length]);
    if (key === lastKey) return;
    lastKey = key;
    const par = s.level.par;
    const rows: { name: string; v: number | null; par: number | null; best: number | null; hint: string }[] = [
      { name: 'Parts', v: m?.parts ?? null, par: par.parts, best: pr?.best?.parts ?? null, hint: 'stations and machines you placed' },
      { name: 'Axioms', v: m?.axioms ?? null, par: par.axioms, best: pr?.best?.axioms ?? null, hint: 'primitive steps underneath, machines expanded' },
      { name: 'Peak', v: m?.peak ?? null, par: null, best: pr?.best?.peak ?? null, hint: 'longest word on any pallet' },
    ];
    el.innerHTML = `<div class="mx-label"><span>Metrics</span><span class="mx-legend"><i class="lg-par"></i>textbook proof <i class="lg-best"></i>your best</span></div>`;
    const grid = h('div', { class: 'mx-grid' });
    for (const r of rows) {
      const max = Math.max(4, (r.par ?? 0) * 1.6, r.v ?? 0, r.best ?? 0) * 1.08;
      const pct = (v: number) => `${(100 * v) / max}%`;
      const verdict = r.v !== null && r.par !== null ? (r.v < r.par ? 'under par' : r.v === r.par ? 'at par' : `${r.v - r.par} over par`) : r.v === null ? 'deliver to measure' : '';
      const meter = h('div', { class: 'mx-meter', role: 'img', 'aria-label': `${r.name}: ${r.v ?? 'not measured'}; par ${r.par ?? 'none'}; best ${r.best ?? 'none'}` },
        r.v !== null ? h('span', { class: 'mx-bar', style: `width:${pct(r.v)}` }) : null,
        r.par !== null ? h('span', { class: 'mx-par', style: `left:${pct(r.par)}`, title: `textbook proof: ${r.par}` }) : null,
        r.best !== null ? h('span', { class: 'mx-best', style: `left:${pct(r.best)}`, title: `your best: ${r.best}` }) : null,
      );
      grid.append(h('div', { class: 'mx-cell', title: r.hint },
        h('div', { class: 'mx-name' }, r.name),
        h('div', { class: 'mx-val' }, h('b', {}, r.v === null ? '—' : String(r.v)), h('span', { class: 'mx-par-txt' }, r.par !== null ? ` / par ${r.par}` : '')),
        meter,
        h('div', { class: 'mx-verdict' }, verdict)));
    }
    el.append(grid);
  };
}

// ───────────────────────────── controls ─────────────────────────────
export function mountControls(el: HTMLElement, store: Store): (s: State) => void {
  el.className = 'lw-controls';
  const key = (label: string, title: string, fn: () => void, cls = '') => {
    const b = h('button', { class: `lw-key ${cls}`, title, 'aria-label': title }, label);
    b.addEventListener('click', fn);
    return b;
  };
  const play = key('▶', 'Replay the factory (Space)', () => { const r = store.get().ui.replay; if (r.playing) store.pauseReplay(); else store.playReplay(); }, 'primary');
  const back = key('⏮', 'Step back', () => store.stepReplay(-1));
  const step = key('⏭', 'Step forward', () => store.stepReplay(1));
  const speed = key('1×', 'Replay speed', () => {
    const sp = [0.5, 1, 2, 4];
    const cur = store.get().ui.replay.speed;
    store.setSpeed(sp[(sp.indexOf(cur) + 1) % sp.length] ?? 1);
  }, 'small');
  const count = h('span', { class: 'ctl-count', title: 'Every node of the proof graph, givens and sources included. Metrics “Parts” counts only the stations and machines you placed.' });
  const live = key('●', 'Show everything (stop replay)', () => store.stopReplay(), 'small');
  const undo = key('↶', 'Undo (Z)', () => store.undo());
  const redo = key('↷', 'Redo (⇧Z)', () => store.redo());
  const reset = key('Reset', 'Reset this level (undoable)', () => store.resetLevel(), 'small');
  el.append(h('div', { class: 'ctl-group' }, back, play, step, speed, count, live), h('div', { class: 'ctl-spacer' }),
    h('div', { class: 'ctl-group' }, undo, redo, reset));
  let lastKey = '';
  return (s: State) => {
    const r = s.ui.replay;
    const n = r.order.length || s.graph.nodes.length;
    const cur = Number.isFinite(r.cursor) ? Math.min(n, Math.floor(r.cursor)) : n;
    const k = JSON.stringify([r.playing, cur, n, r.speed, Number.isFinite(r.cursor)]);
    if (k === lastKey) return;
    lastKey = k;
    play.textContent = r.playing ? '❚❚' : '▶';
    play.title = r.playing ? 'Pause (Space)' : 'Replay the factory (Space)';
    speed.textContent = `${r.speed}×`;
    count.innerHTML = Number.isFinite(r.cursor) || r.playing ? `<b>${cur}</b> of ${n} proof nodes` : `<b>${n}</b> proof nodes · live`;
    live.style.visibility = Number.isFinite(r.cursor) ? 'visible' : 'hidden';
  };
}

export function nextOrderButton(store: Store): HTMLButtonElement {
  const b = h('button', { class: 'lw-key primary wide next-order' }, 'Next work order →');
  b.addEventListener('click', () => {
    const s = store.get();
    const nx = nextLevel(s.save, s.level.id);
    if (nx) store.openLevel(nx.id); else store.openMap();
  });
  return b;
}
export { esc };
