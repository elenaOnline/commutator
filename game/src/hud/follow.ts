// LEMMA WORKS v3 — follow one proof: pick a dock; everything not on its certificate's route goes quiet,
// and every machine on the route is annotated input → change → output at full size, in order.
// Display only: it reads the compiled factory and never chooses or changes anything.
import type { Pallet, Term } from '../kernel/types';
import type { ItemValue, MachineResult } from '../factory/types';
import { rectToScreen } from '../floor/project';
import { FAMILY } from '../ui/tokens';
import { fH, h, labels, machineName, machineRect, spec, tH, type S, type Store } from './util';

const SVGNS = 'http://www.w3.org/2000/svg';
const wordOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);
const same = (a: Term, b: Term) => JSON.stringify(a) === JSON.stringify(b);
const mk = (fs: Term[]): Term => (fs.length === 1 ? fs[0]! : { k: 'mul', fs });

/** A rail of the output with the factors that changed from the input marked. */
function railDiff(a: Term | null, b: Term, L: Record<string, string>): string {
  if (!a) return tH(b, L, 'proof');
  const x = wordOf(a), y = wordOf(b);
  let p = 0;
  while (p < x.length && p < y.length && same(x[p]!, y[p]!)) p++;
  let q = 0;
  while (q < x.length - p && q < y.length - p && same(x[x.length - 1 - q]!, y[y.length - 1 - q]!)) q++;
  if (p === x.length && p === y.length) return tH(b, L, 'proof');
  const mid = y.slice(p, y.length - q);
  const pre = p ? tH(mk(y.slice(0, p)), L, 'proof') : '';
  const suf = q ? tH(mk(y.slice(y.length - q)), L, 'proof') : '';
  const m = mid.length ? `<span class="h3-chg">${tH(mk(mid), L, 'proof')}</span>` : '<span class="h3-chg gone" title="removed"></span>';
  return `${pre}${m}${suf}`;
}

function factOf(v: ItemValue | undefined): Pallet | null { return v && v.k === 'fact' ? v.fact : null; }

export function mountFollow(layer: HTMLElement, store: Store) {
  const veil = document.createElementNS(SVGNS, 'svg');
  veil.classList.add('h3-veil');
  veil.setAttribute('aria-hidden', 'true');
  const ribbon = h('div', { class: 'h3-ribbon', hidden: true, role: 'status' });
  const cards = h('div', { class: 'h3-follow' });
  layer.prepend(veil);
  layer.append(cards, ribbon);
  veil.style.display = 'none';

  let route: string[] = [];
  let beltIds: string[] = [];
  let lastKey = '';

  const leave = () => store.setUI({ follow: null });

  const build = (s: S, sockMachine: string) => {
    // walk upstream from the dock: every machine and belt that feeds its certificate
    const seen = new Set<string>([sockMachine]);
    const belts: string[] = [];
    const depth = new Map<string, number>([[sockMachine, 0]]);
    const queue = [sockMachine];
    while (queue.length) {
      const id = queue.shift()!;
      for (const b of s.canvas.belts) if (b.to?.m === id) {
        belts.push(b.id);
        depth.set(b.from.m, Math.max(depth.get(b.from.m) ?? 0, (depth.get(id) ?? 0) + 1));
        if (!seen.has(b.from.m)) { seen.add(b.from.m); queue.push(b.from.m); }
      }
    }
    route = [...seen].sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
    beltIds = belts;
    const L = labels(s.level);
    cards.innerHTML = '';
    let n = 0;
    for (const id of route) {
      const m = s.canvas.machines.find((x) => x.id === id);
      const r: MachineResult | undefined = s.compiled?.machines?.[id];
      if (!m || !r) continue;
      const sp = spec(m.kind);
      const fam = m.config.kind === 'theorem' || m.config.kind === 'forall' || m.config.kind === 'carddock' ? 'lemma' : sp.family;
      const inF = factOf(r.inputs['q']) ?? factOf(r.inputs['p0']) ?? factOf(r.inputs['a']);
      const outF = factOf(r.out);
      let body = '';
      if (m.kind === 'socket') {
        body = inF ? `<div class="h3-f-out math">${fH(inF, L, 'proof')}<span class="h3-f-seal"><span class="tomb"></span></span></div>` : '';
      } else if (outF && (outF.k === 'eq' || outF.k === 'neq') && inF && (inF.k === 'eq' || inF.k === 'neq')) {
        body = `<div class="h3-f-in math">${fH(inF, L, 'proof')}</div>
          <div class="h3-f-out math">${railDiff(inF.l, outF.l, L)} <span class="m-rel">${outF.k === 'eq' ? '=' : '≠'}</span> ${railDiff(inF.r, outF.r, L)}</div>`;
      } else if (outF) {
        body = `<div class="h3-f-out math">${fH(outF, L, 'proof')}</div>`;
      }
      if (!body) continue;
      n++;
      cards.append(h('div', { class: `h3-fcard${m.kind === 'socket' ? ' dock' : ''}`, 'data-m': id, style: `--ink:${FAMILY[fam].ink};--ink-text:${FAMILY[fam].text}` },
        h('div', { class: 'h3-f-head' }, h('span', { class: 'h3-f-no' }, m.kind === 'socket' ? '∎' : String(n)), h('span', { class: 'h3-f-name' }, machineName(m))),
        h('div', { html: body })));
    }
    const sockId = (s.canvas.machines.find((x) => x.id === sockMachine)?.config as { socketId?: string }).socketId;
    const goal = s.level.sockets.find((k) => k.id === sockId)?.target;
    ribbon.innerHTML = '';
    const out = h('button', { class: 'lw-key small' }, 'Leave (Esc)');
    out.addEventListener('click', leave);
    ribbon.append(h('span', { class: 'h3-label' }, 'Following'), h('span', { class: 'math', html: goal ? fH(goal, L) : '' }), h('span', { class: 'h3-dim' }, `${n} step${n === 1 ? '' : 's'}, in the order the certificate was made`), out);
  };

  const render = (s: S) => {
    const f = s.ui.screen === 'floor' ? s.ui.follow ?? null : null;
    const sockMachine = f ? s.canvas.machines.find((m) => m.id === f || (m.config.kind === 'socket' && m.config.socketId === f))?.id : undefined;
    if (!sockMachine) { if (route.length || !ribbon.hidden) { route = []; beltIds = []; cards.innerHTML = ''; ribbon.hidden = true; veil.style.display = 'none'; lastKey = ''; } return; }
    const key = `${sockMachine}|${s.level.id}`;
    if (key !== lastKey || (cards as unknown as { _c?: unknown })._c !== s.compiled) {
      lastKey = key; (cards as unknown as { _c?: unknown })._c = s.compiled;
      build(s, sockMachine);
    }
    ribbon.hidden = false;
    veil.style.display = '';
  };

  /** Per frame: the veil's holes and the cards follow the camera. */
  const frame = () => {
    if (!route.length) return;
    const s = store.get();
    const floor = document.getElementById('floor');
    const fr = floor?.getBoundingClientRect();
    if (!fr || !fr.width) return;
    const W = innerWidth, H = innerHeight;
    let holes = '';
    for (const id of route) {
      const r = machineRect(id, s);
      if (r) holes += `<rect x="${r.left - 14}" y="${r.top - 14}" width="${r.width + 28}" height="${r.height + 28}" rx="14"/>`;
      // the floor's own group (machine + its name/statement labels), when it tags one
      const g = floor!.querySelector(`.fl-m[data-m="${CSS.escape(id)}"]`)?.getBoundingClientRect();
      if (g && g.width) holes += `<rect x="${g.left - 8}" y="${g.top - 8}" width="${g.width + 16}" height="${g.height + 16}" rx="12"/>`;
    }
    for (const bid of beltIds) {
      const b = s.canvas.belts.find((x) => x.id === bid);
      if (!b) continue;
      for (const t of b.path) {
        const q = rectToScreen(s.ui.camera, { w: fr.width, h: fr.height }, t.x, t.y, t.x + 1, t.y + 1, 0.6);
        holes += `<rect x="${fr.left + q.x - 6}" y="${fr.top + q.y - 18}" width="${q.w + 12}" height="${q.h + 24}" rx="10"/>`;
      }
    }
    veil.setAttribute('viewBox', `0 0 ${W} ${H}`);
    veil.innerHTML = `<defs><mask id="h3-follow-mask"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${holes}</g></mask></defs><rect width="${W}" height="${H}" fill="rgba(255,255,255,.8)" mask="url(#h3-follow-mask)"/>`;
    // cards: above their machine, nudged apart so none overlaps another
    const placed: DOMRect[] = [];
    cards.querySelectorAll<HTMLElement>('.h3-fcard').forEach((c) => {
      const r = machineRect(c.dataset.m!, s);
      if (!r) { c.style.display = 'none'; return; }
      c.style.display = '';
      const w = c.offsetWidth, hh = c.offsetHeight;
      let x = Math.max(10, Math.min(W - w - 10, r.left + r.width / 2 - w / 2));
      let y = Math.max(64, r.top - hh - 10);
      for (let k = 0; k < 8; k++) {
        const hit = placed.find((p) => x < p.right + 6 && x + w > p.left - 6 && y < p.bottom + 6 && y + hh > p.top - 6);
        if (!hit) break;
        y = hit.top - hh - 8;
        if (y < 64) { y = Math.max(64, hit.bottom + 8); x = Math.min(W - w - 10, hit.right + 8); }
      }
      c.style.left = `${x}px`; c.style.top = `${y}px`;
      placed.push(new DOMRect(x, y, w, hh));
    });
  };
  return { render, frame, active: () => route.length > 0, leave };
}
