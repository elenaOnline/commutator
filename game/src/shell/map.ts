// LEMMA WORKS — the campaign as a Hasse diagram of theorems (full screen + mini map).
import type { LevelManifest } from '../kernel/types';
import type { State, Store } from '../state/store';
import { CHAPTERS, LEVELS, LEVEL_BY_ID, REGISTRY, esc, h, isOpen, isSolved, labels, nextLevel, richHTML, schemaNames , fH, tH } from './util';

// ───────── static layout (rows flow upward, chapters as bands) ─────────
export interface MapNode { id: string; row: number; x: number; side: boolean; imported?: boolean }
const IMPORT_ID = 'IMPORT:lagrange';

export function mapLayout(): { nodes: MapNode[]; rows: number; bands: { chapter: number; from: number; to: number }[] } {
  const row = new Map<string, number>();
  const chStart: Record<number, number> = {};
  let top = -1;
  for (const ch of [1, 2, 3]) {
    chStart[ch] = top + 1;
    for (const lv of LEVELS.filter((l) => l.chapter === ch && !l.side)) {
      const r = Math.max(chStart[ch]!, ...lv.uses.filter((u) => !LEVEL_BY_ID[u]?.side).map((u) => (row.get(u) ?? -1) + 1));
      row.set(lv.id, r);
      top = Math.max(top, r);
    }
  }
  const bands = [1, 2, 3].map((ch) => {
    const rs = LEVELS.filter((l) => l.chapter === ch && !l.side).map((l) => row.get(l.id)!);
    return { chapter: ch, from: Math.min(...rs), to: Math.max(...rs) };
  });
  for (const lv of LEVELS.filter((l) => l.side)) {
    row.set(lv.id, Math.max(...lv.uses.map((u) => (row.get(u) ?? 0) + 0.5)));
  }
  // x: barycentre ordering within rows; main lane spacing 1 unit, centred at 0
  const xs = new Map<string, number>();
  const rowsN = top + 1;
  for (let r = 0; r < rowsN; r++) {
    const inRow = LEVELS.filter((l) => !l.side && row.get(l.id) === r);
    const bary = (l: LevelManifest) => {
      const ps = l.uses.map((u) => xs.get(u)).filter((v): v is number => v !== undefined && !LEVEL_BY_ID[l.id]?.side);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
    };
    // nodes that feed a side order lean toward the side lane, so that edge never crosses a sibling
    const feedsSide = (l: LevelManifest) => (LEVELS.some((m) => m.side && m.uses.includes(l.id)) ? 0.6 : 0);
    inRow.sort((a, b) => bary(a) + feedsSide(a) - bary(b) - feedsSide(b) || a.index - b.index);
    inRow.forEach((l, i) => xs.set(l.id, (i - (inRow.length - 1) / 2) * 1.05));
  }
  const nodes: MapNode[] = LEVELS.map((l) => ({ id: l.id, row: row.get(l.id)!, x: l.side ? 2.15 : xs.get(l.id)!, side: !!l.side }));
  // stack side orders that share a row
  const sideRows = new Map<number, number>();
  for (const n of nodes.filter((m) => m.side)) { const k = sideRows.get(n.row) ?? 0; sideRows.set(n.row, k + 1); if (k) n.row += 0.55 * k; }
  const pressLv = LEVELS.filter((l) => l.tools.press && !l.side);
  if (pressLv.length) nodes.push({ id: IMPORT_ID, row: Math.min(...pressLv.map((l) => row.get(l.id)!)) - 0.15, x: -2.05, side: true, imported: true });
  return { nodes, rows: rowsN, bands };
}

/** Hasse edges: `uses` minus any edge implied by a longer chain (transitive reduction). */
export function hasseUses(lv: LevelManifest): string[] {
  const reach = (from: string, target: string, seen = new Set<string>()): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (LEVEL_BY_ID[from]?.uses ?? []).some((u) => reach(u, target, seen));
  };
  return lv.uses.filter((u) => !lv.uses.some((w) => w !== u && reach(w, u)));
}

type NodeState = 'solved' | 'next' | 'open' | 'locked';
function nodeState(s: State, lv: LevelManifest, next: string | null): NodeState {
  if (isSolved(s.save, lv.id)) return 'solved';
  if (!isOpen(s.save, lv)) return 'locked';
  return lv.id === next ? 'next' : 'open';
}

// ───────── full-screen map ─────────
export function mountMap(el: HTMLElement, store: Store): (s: State) => void {
  const layout = mapLayout();
  el.className = 'lw-map';
  const head = h('header', { class: 'map-head' },
    h('div', { class: 'map-brand' }, h('span', { class: 'map-mark' }, 'Lemma Works'), h('span', { class: 'map-sub' }, 'Theorem map · edges read “used to build”')),
    h('div', { class: 'map-progress' }),
  );
  const field = h('div', { class: 'map-field' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('map-edges');
  const tip = h('div', { class: 'map-tip', role: 'tooltip' });
  const back = h('button', { class: 'lw-key map-back', title: 'Back to the work order (M)' }, '← Back to the bench');
  back.addEventListener('click', () => store.openLevel(store.get().ui.levelId));
  const canvas = h('div', { class: 'map-canvas' });
  canvas.append(svg, tip);
  field.append(canvas);
  const cueTop = h('div', { class: 'map-cue top', 'aria-hidden': 'true' }, h('span', {}, 'more above ↑'));
  const cueBottom = h('div', { class: 'map-cue bottom', 'aria-hidden': 'true' }, h('span', {}, 'more below ↓'));
  const fieldWrap = h('div', { class: 'map-fieldwrap' }, field, cueTop, cueBottom);
  el.append(head, fieldWrap, back);
  const cues = () => {
    cueTop.classList.toggle('on', field.scrollTop > 4);
    cueBottom.classList.toggle('on', field.scrollTop + field.clientHeight < field.scrollHeight - 4);
  };
  // entry: reveal the next playable node (24 px clear) the first time; afterwards keep the reader's place
  let savedScroll: number | null = null, onMap = store.get().ui.screen === 'map', pendingEntry = onMap;
  field.addEventListener('scroll', () => { if (onMap) savedScroll = field.scrollTop; cues(); }, { passive: true });
  const reveal = () => {
    if (savedScroll !== null) { field.scrollTop = savedScroll; cues(); return; }
    const s = store.get();
    const target = nodeEls.get(nextLevel(s.save)?.id ?? '') ?? nodeEls.get(s.ui.levelId);
    if (target) {
      const fr = field.getBoundingClientRect(), r = target.getBoundingClientRect();
      if (r.bottom > fr.bottom - 24) field.scrollTop += r.bottom - (fr.bottom - 24);
      else if (r.top < fr.top + 24) field.scrollTop -= fr.top + 24 - r.top;
    }
    savedScroll = field.scrollTop;
    cues();
  };
  store.subscribe((s) => {
    const now = s.ui.screen === 'map';
    if (now && !onMap) pendingEntry = true;
    onMap = now;
  });

  let lastKey = '';
  const nodeEls = new Map<string, HTMLElement>();

  const render = (s: State) => {
    if (pendingEntry && lastKey) requestAnimationFrame(() => { if (pendingEntry) { pendingEntry = false; reveal(); } });
    const next = nextLevel(s.save)?.id ?? null;
    const key = JSON.stringify([Object.keys(s.save.levels).map((k) => [k, s.save.levels[k]!.solvedAt, s.save.levels[k]!.best]), s.ui.levelId, el.clientWidth, el.clientHeight]);
    back.style.display = s.save.levels[s.ui.levelId] || Object.keys(s.save.levels).length ? '' : 'none';
    if (key === lastKey) return;
    lastKey = key;
    const solvedMain = LEVELS.filter((l) => !l.side && isSolved(s.save, l.id)).length;
    head.querySelector('.map-progress')!.innerHTML =
      `<span><b>${solvedMain}</b> of ${LEVELS.filter((l) => !l.side).length} proven</span><span><b>${s.save.earned.length}</b> machine${s.save.earned.length === 1 ? '' : 's'} earned</span>`;

    canvas.querySelectorAll('.mn, .map-band, .map-lane').forEach((n) => n.remove());
    nodeEls.clear();
    const W = field.clientWidth || 1200, Hf = field.clientHeight || 800;
    const padT = 40, padB = 34;
    const rowH = Math.max(84, (Hf - padT - padB) / Math.max(1, layout.rows - 0.4));
    const H = padT + padB + rowH * (layout.rows - 0.4);
    canvas.style.height = `${H}px`;
    const gutter = 120, sideW = Math.min(320, W * 0.21);
    const mainW = W - gutter - sideW;
    const unit = Math.max(250, Math.min(310, mainW / 3.3));
    const cx = gutter + mainW / 2;
    const yOf = (r: number) => H - padB - r * rowH - rowH * 0.3;
    const xOf = (x: number) => (x >= 2 ? W - sideW / 2 : x <= -2 ? gutter + Math.min(150, (cx - unit * 0.6 - gutter) / 2 + 20) : cx + x * unit);

    for (const b of layout.bands) {
      const ch = CHAPTERS[b.chapter]!;
      const y0 = yOf(b.to + 0.5), y1 = yOf(b.from - 0.5);
      canvas.prepend(h('div', { class: `map-band ch${b.chapter}`, style: `top:${y0}px;height:${y1 - y0}px;right:${sideW}px` },
        h('span', { class: 'map-band-label' }, h('b', {}, ch.roman), ` ${ch.name}`)));
    }
    canvas.prepend(h('div', { class: 'map-lane side', style: `left:${W - sideW + 8}px;width:${sideW - 16}px` }, h('span', {}, 'Side orders')));

    for (const n of layout.nodes) {
      let node: HTMLElement;
      if (n.imported) {
        node = h('div', { class: 'mn imported', tabindex: 0, 'data-id': n.id },
          h('div', { class: 'mn-top' }, h('span', { class: 'mn-imp' }, 'Imported'), h('span', { class: 'mn-title' }, 'Lagrange’s theorem')),
          h('div', { class: 'mn-stmt math', html: `|<i>G</i>| <span class="m-rel">=</span> <i>n</i> <span class="m-rel">⇒</span> <i>x</i><sup class="m-sup"><i>n</i></sup> <span class="m-rel">=</span> <i>e</i>` }),
          h('div', { class: 'mn-note' }, 'not proven in this game'));
      } else {
        const lv = LEVEL_BY_ID[n.id]!;
        const st = nodeState(s, lv, next);
        const L = labels(lv);
        const sock = lv.sockets[0]!;
        const hyps = lv.givens.filter((g) => lv.sockets.some((sk) => sk.allowedGivens.includes(g.id)));
        void sock;
        const hypHTML = hyps.length ? `<span class="mn-if">${hyps.map((g) => fH(g.fact, L)).join(', ')} <span class="m-rel">⊢</span></span> ` : '';
        node = h('button', { class: `mn ${st}${n.side ? ' side' : ''}${s.ui.levelId === lv.id ? ' current' : ''}`, 'data-id': lv.id, 'aria-disabled': st === 'locked' ? 'true' : undefined,
          'aria-label': `Level ${lv.index}, ${lv.title}, ${st}` },
          h('div', { class: 'mn-top' }, h('span', { class: 'mn-no' }, n.side ? `S${lv.index - LEVELS.filter((l) => !l.side).length}` : String(lv.index)), h('span', { class: 'mn-title' }, lv.title),
            st === 'next' ? h('span', { class: 'mn-next' }, 'next') : null,
            st === 'solved' && lv.unlocks.length ? h('span', { class: 'mn-chips' }, ...lv.unlocks.map((u) => h('span', { class: 'chip-machine' }, REGISTRY[u]?.name ?? u))) : null),
          h('div', { class: 'mn-stmt math', html: hypHTML + lv.sockets.map((sk) => fH(sk.target, L)).join(', ') }),
          st === 'solved' ? h('span', { class: 'mn-seal', title: 'Proven', html: '<span class="tomb"></span>' }) : st === 'locked' ? h('span', { class: 'mn-q', title: 'Locked' }, '?') : null,
        );
        node.addEventListener('click', () => { if (st !== 'locked') store.openLevel(lv.id); });
      }
      node.style.left = `${xOf(n.x)}px`;
      node.style.top = `${yOf(n.row)}px`;
      node.addEventListener('mouseenter', () => showTip(n.id, node));
      node.addEventListener('focus', () => showTip(n.id, node));
      node.addEventListener('mouseleave', () => tip.classList.remove('on'));
      node.addEventListener('blur', () => tip.classList.remove('on'));
      canvas.append(node);
      nodeEls.set(n.id, node);
    }
    requestAnimationFrame(() => { drawEdges(s); if (pendingEntry) { pendingEntry = false; reveal(); } else cues(); });
  };

  const drawEdges = (s: State) => {
    const fr = canvas.getBoundingClientRect();
    svg.setAttribute('width', String(fr.width)); svg.setAttribute('height', String(fr.height));
    const box = (id: string) => { const r = nodeEls.get(id)?.getBoundingClientRect(); return r ? { x: r.left - fr.left, y: r.top - fr.top, w: r.width, h: r.height } : null; };
    const boxes = [...nodeEls.keys()].map((id) => ({ id, b: box(id)! })).filter((x) => x.b);
    let paths = '';
    const smooth = (pts: [number, number][]) => {
      let d = `M${pts[0]![0]},${pts[0]![1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
        const my = (y0 + y1) / 2;
        d += ` C${x0},${my} ${x1},${my} ${x1},${y1}`;
      }
      return d;
    };
    const edge = (from: string, to: string, cls: string) => {
      const a = box(from), b = box(to);
      if (!a || !b) return;
      if (from === IMPORT_ID || Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < rowGap() * 0.7) { // sideways
        const leftToRight = a.x + a.w < b.x;
        const x1 = leftToRight ? a.x + a.w : a.x, x2 = leftToRight ? b.x : b.x + b.w;
        const y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, k = (x2 - x1) * 0.45;
        paths += `<path class="${cls}" d="M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}"/>`;
        return;
      }
      const x1 = a.x + a.w / 2, y1 = a.y, x2 = b.x + b.w / 2, y2 = b.y + b.h;
      // route around any node box the straight run would pass through
      const pts: [number, number][] = [[x1, y1]];
      const inner = boxes.filter((o) => o.id !== from && o.id !== to && o.b.y + o.b.h < y1 - 2 && o.b.y > y2 + 2)
        .sort((p, q) => q.b.y - p.b.y);
      for (const o of inner) {
        const cy = o.b.y + o.b.h / 2;
        const t = (y1 - cy) / (y1 - y2);
        let x = x1 + (x2 - x1) * t;
        const m = 16;
        if (x > o.b.x - m && x < o.b.x + o.b.w + m) {
          const lft = o.b.x - m, rgt = o.b.x + o.b.w + m;
          x = Math.abs(x - lft) <= Math.abs(rgt - x) ? lft : rgt;
          const clash = boxes.some((z) => z.id !== o.id && Math.abs(z.b.y - o.b.y) < 10 && x > z.b.x - 4 && x < z.b.x + z.b.w + 4);
          if (clash) x = x === lft ? rgt : lft;
          pts.push([x, cy]);
        }
      }
      pts.push([x2, y2]);
      paths += `<path class="${cls}" d="${smooth(pts)}"/>`;
    };
    for (const lv of LEVELS) for (const u of hasseUses(lv)) edge(u, lv.id, isSolved(s.save, u) ? 'e-lit' : 'e-dim');
    for (const lv of LEVELS.filter((l) => l.tools.press && !l.side)) if (!LEVELS.some((m) => m.tools.press && !m.side && hasseUses(lv).includes(m.id))) edge(IMPORT_ID, lv.id, 'e-import');
    svg.innerHTML = paths;
  };
  const rowGap = () => { const ys = [...nodeEls.values()].map((n) => parseFloat(n.style.top)).sort((a, b) => a - b); let g = 999; for (let i = 1; i < ys.length; i++) if (ys[i]! - ys[i - 1]! > 8) g = Math.min(g, ys[i]! - ys[i - 1]!); return g; };

  const showTip = (id: string, node: HTMLElement) => {
    const s = store.get();
    if (id === IMPORT_ID) {
      tip.innerHTML = `<div class="tip-title">Lagrange’s theorem <span class="tip-tag">imported</span></div>
        <p>In a finite group of order <i class="math">n</i>, every element satisfies <span class="math"><i>x</i><sup class="m-sup"><i>n</i></sup> = <i>e</i></span>. The Lagrange Press turns a given <span class="math">|<i>G</i>| = <i>n</i></span> into that law.</p>
        <p class="tip-dim">Imported: its proof needs cosets, which this game does not build.</p>`;
    } else {
      const lv = LEVEL_BY_ID[id]!;
      const pr = s.save.levels[id];
      const st = nodeState(s, lv, nextLevel(s.save)?.id ?? null);
      const blockers = lv.uses.filter((u) => !LEVEL_BY_ID[u]?.side && !isSolved(s.save, u)).map((u) => `${LEVEL_BY_ID[u]!.index} ${LEVEL_BY_ID[u]!.title}`);
      tip.innerHTML = `<div class="tip-title">${lv.index}. ${esc(lv.title)}</div>
        <p class="tip-idea">${richHTML(lv.idea, lv)}</p>
        <dl>
          <dt>Par</dt><dd>${lv.par.parts} parts · ${lv.par.axioms} axioms</dd>
          <dt>Your best</dt><dd>${pr?.best ? `${pr.best.parts} parts · ${pr.best.axioms} axioms` : '—'}</dd>
          ${pr?.best ? `<dt>Depth</dt><dd>bottoms out in ${pr.best.axioms} axiom steps</dd>` : ''}
          ${lv.unlocks.length ? `<dt>Earns</dt><dd>${lv.unlocks.map((u) => `${esc(schemaNames(u).name)} <span class="tip-dim">(${esc(schemaNames(u).textbook)})</span>`).join(', ')}</dd>` : ''}
        </dl>
        ${st === 'locked' ? `<p class="tip-dim">Locked. Prove ${blockers.map(esc).join(' and ')} first.</p>` : ''}`;
    }
    const fr = canvas.getBoundingClientRect(), r = node.getBoundingClientRect();
    tip.classList.add('on');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.right - fr.left + 12, y = r.top - fr.top + r.height / 2 - th / 2;
    if (x + tw > fr.width - 8) x = r.left - fr.left - tw - 12;
    y = Math.max(8, Math.min(fr.height - th - 8, y));
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  };

  new ResizeObserver(() => { lastKey = ''; if (store.get().ui.screen === 'map') render(store.get()); }).observe(field);
  return render;
}

// ───────── mini map (top-right of the level screen) ─────────
export function mountMiniMap(el: HTMLElement, store: Store): (s: State) => void {
  const layout = mapLayout();
  el.className = 'lw-minimap';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Open the theorem map (M)');
  el.addEventListener('click', () => store.openMap());
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') store.openMap(); });
  let lastKey = '';
  return (s: State) => {
    const key = JSON.stringify([s.ui.levelId, s.save.earned, Object.entries(s.save.levels).map(([k, v]) => [k, !!v.solvedAt])]);
    if (key === lastKey) return;
    lastKey = key;
    const W = 178, H = 150, ux = 34, uy = (H - 22) / layout.rows;
    const X = (x: number) => W / 2 + x * ux - 6, Y = (r: number) => H - 12 - r * uy;
    const pos = new Map(layout.nodes.map((n) => [n.id, n] as const));
    const next = nextLevel(s.save)?.id ?? null;
    let edges = '', dots = '';
    for (const lv of LEVELS) for (const u of lv.uses) {
      const a = pos.get(u)!, b = pos.get(lv.id)!;
      edges += `<line x1="${X(a.x)}" y1="${Y(a.row)}" x2="${X(b.x)}" y2="${Y(b.row)}" class="${isSolved(s.save, u) ? 'lit' : ''}"/>`;
    }
    for (const n of layout.nodes) {
      if (n.imported) continue;
      const lv = LEVEL_BY_ID[n.id]!;
      const st = nodeState(s, lv, next);
      const cur = s.ui.levelId === lv.id;
      const r = n.side ? 5 : 6.5;
      dots += `${cur ? `<circle cx="${X(n.x)}" cy="${Y(n.row)}" r="${r + 4}" class="cur"/>` : ''}<circle cx="${X(n.x)}" cy="${Y(n.row)}" r="${r}" class="d ${st}"/>`;
      if (!n.side) dots += `<text x="${X(n.x)}" y="${Y(n.row) + 2.6}" class="${st}">${lv.index}</text>`;
    }
    const lv = LEVEL_BY_ID[s.ui.levelId]!;
    el.innerHTML = `<div class="mm-label">Levels</div><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${edges}${dots}</svg><div class="mm-cur">${lv.index} · ${esc(lv.title)}</div>`;
  };
}
