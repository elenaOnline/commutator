// LEMMA WORKS v3 — the order chip (top-left, floating, compact): level, title, goal(s) in Latin Modern,
// givens; expands to the memo. "Suppose …" arms the Room tool with that assumption. Map button.
import type { Pallet } from '../kernel/types';
import { givenPrefixHTML, camp, campaignOf, displayNo, dockAnswers, openView, esc, fH, h, ideaOf, isSolved, labels, nameHTML, nextLevel, richHTML, type S, type Store } from './util';

export interface OrderApi { render: (s: S) => void; el: HTMLElement; addPlan: (p: Pallet) => void; plans: () => Pallet[] }

export function mountOrder(layer: HTMLElement, store: Store, hooks: { armRoom: (kind: 'suppose' | 'classical', l: Pallet & { k: 'eq' | 'neq' }) => void }): OrderApi {
  const el = h('section', { class: 'h3-order', 'aria-label': 'Work order' });
  layer.append(el);
  let open = false;
  let lastKey = '';
  const plans = new Map<string, Pallet[]>(); // conjecture-lab pins: dashed planning targets (never certified)

  const render = (s: S) => {
    const del = s.run?.delivered ?? {};
    const key = JSON.stringify([s.level.id, open, s.level.sockets.map((k) => del[k.id] !== undefined), isSolved(s.save, s.level.id), (plans.get(s.level.id) ?? []).length, camp(s).earned.length]);
    if (key === lastKey) return;
    lastKey = key;
    const lv = s.level;
    // open docks: `d = ?` with a hole chip, filled with the answer once the dock has accepted it
    const ov = openView(lv, dockAnswers(s));
    const L = labels(ov.level);
    const solved = isSolved(s.save, lv.id);
    el.innerHTML = '';
    el.classList.toggle('open', open);

    const mapBtn = h('button', { class: 'h3-pill', title: 'Theorem map (M)' }, '◇ Map');
    mapBtn.addEventListener('click', () => store.openMap());
    const more = h('button', { class: 'h3-more', 'aria-expanded': String(open), title: open ? 'Collapse' : 'Read the work order' }, open ? '▴' : '▾');
    const help = h('button', { class: 'h3-qbtn', title: 'Concept cards for this order', 'aria-label': 'Concept cards' }, '?');
    help.addEventListener('click', () => store.openCards(0));
    more.addEventListener('click', () => { open = !open; lastKey = ''; render(store.get()); });
    const book = campaignOf(lv) === 'book';
    el.append(h('div', { class: 'h3-order-top' }, mapBtn,
      h('span', { class: 'h3-badge' }, displayNo(lv)),
      h('span', { class: 'h3-order-title' }, lv.title), help, more));
    // The Book names the proof method each order trains (SYNTHESIS §4), where the main campaign says "New idea".
    if (book && lv.method) el.append(h('div', { class: 'h3-method' }, h('span', { class: 'h3-label' }, 'Method'), h('span', { class: 'h3-method-dot', 'aria-hidden': 'true' }, '·'), h('span', { class: 'h3-method-name', html: richHTML(lv.method, lv) })));

    const goals = h('div', { class: `h3-goals${lv.sockets.length > 1 ? ' multi' : ''}` });
    for (const sk of ov.level.sockets) {
      const got = del[sk.id] !== undefined;
      goals.append(h('div', { class: `h3-goal math${got ? ' got' : ''}`, title: got ? 'Delivered' : 'Deliver this statement to its receiving dock',
        html: `${lv.sockets.length > 1 ? `<span class="h3-sock">${esc(sk.id)}</span>` : ''}${ov.chips(fH(sk.target, L))}${got ? '<span class="h3-seal"><span class="tomb"></span></span>' : ''}` }));
    }
    el.append(goals);

    const allowed = new Set(lv.sockets.flatMap((k) => k.allowedGivens));
    const gs = lv.givens.filter((g) => allowed.has(g.id));
    if (gs.length) {
      const row = h('div', { class: 'h3-givens' });
      for (const g of gs) {
        const b = h('button', { class: `h3-given k-${g.fact.k}`, title: 'Show its inlet on the floor', html: `<span class="math">${givenPrefixHTML(g.name)}${fH(g.fact, L)}</span>` });
        b.addEventListener('click', () => {
          const m = store.get().canvas.machines.find((x) => x.config.kind === 'given' && x.config.givenId === g.id);
          if (m) { store.select([m.id]); store.openLens(m.id); }
        });
        row.append(b);
      }
      el.append(row);
    }

    // the "Suppose …" preset: shown where the order's toolset expects a room, always in the expanded view
    const presets = h('div', { class: 'h3-presets' });
    for (const sk of lv.sockets) {
      const g = sk.target;
      if (g.k !== 'eq' && g.k !== 'neq' || sk.holes?.length) continue;
      const wanted = g.k === 'neq' ? lv.tools.suppose : lv.tools.classical;
      if (!wanted && !open) continue;
      const b = h('button', { class: `h3-preset${g.k === 'eq' ? ' classical' : ''}`, html: `Suppose <span class="math">${fH({ k: g.k === 'neq' ? 'eq' : 'neq', l: g.l, r: g.r }, L)}</span>` });
      b.title = g.k === 'neq' ? 'Assume the opposite. A clash proves the goal.' : 'Assume the goal fails. A clash proves it.';
      b.addEventListener('click', () => hooks.armRoom(g.k === 'neq' ? 'suppose' : 'classical', g));
      presets.append(b);
    }
    if (presets.childElementCount) el.append(presets);

    if (open) {
      el.append(h('p', { class: 'h3-memo' }, lv.memo));
      if (lv.idea) el.append(h('p', { class: 'h3-idea', html: `${book ? '' : '<span class="h3-label">New idea</span> '}${richHTML(ideaOf(lv), lv)}` }));
      const pl = plans.get(lv.id) ?? [];
      if (pl.length) {
        const box = h('div', { class: 'h3-plans' }, h('span', { class: 'h3-label' }, 'Planning targets · not proven'));
        pl.forEach((p, i) => {
          const x = h('button', { class: 'h3-x', 'aria-label': 'Unpin' }, '×');
          x.addEventListener('click', () => { pl.splice(i, 1); lastKey = ''; render(store.get()); });
          box.append(h('div', { class: 'h3-plan' }, h('span', { class: 'math', html: fH(p, L) }), x));
        });
        el.append(box);
      }
    }
    if (solved) {
      const nx = nextLevel(s.save, lv.id);
      const b = h('button', { class: 'lw-key primary small h3-next' }, nx ? 'Next work order →' : 'Theorem map →');
      b.addEventListener('click', () => (nx ? store.openLevel(nx.id) : store.openMap()));
      const fo = h('button', { class: 'lw-key small', title: 'Trace this proof on the floor' }, 'Follow');
      fo.addEventListener('click', () => store.setUI({ follow: s.ui.follow ? null : lv.sockets[0]?.id ?? null }));
      el.append(h('div', { class: 'h3-proven' }, h('span', { class: 'h3-label', html: '<span class="tomb"></span> Proven' }), h('span', { class: 'h3-flex' }), fo, b));
    }
  };
  const addPlan = (p: Pallet) => {
    const id = store.get().level.id;
    const l = plans.get(id) ?? [];
    if (!l.some((x) => JSON.stringify(x) === JSON.stringify(p))) l.push(p);
    plans.set(id, l); open = true; lastKey = ''; render(store.get());
  };
  return { render, el, addPlan, plans: () => plans.get(store.get().level.id) ?? [] };
}
