// LEMMA WORKS v3 — the inspector lens: anchored to the selected machine (docked at the right edge
// when the floor cannot tell us where it is). A live worked line, not a form: the incoming item as
// big bead rails with every candidate bracketed, the output preview, the status reason, the controls.
// Every change goes through store.configure; the kernel decides what it means.
import * as F from '../factory';
import * as K from '../kernel';
import type { Addr, GapAddr, MetaId, Pallet, Term } from '../kernel/types';
import type { Anchor, GapTarget, ItemValue, Machine, MachineConfig, MachineResult, Param, SpanTarget } from '../factory/types';
import { renderRail, beadsInline } from '../bench/render';
import { FAMILY } from '../ui/tokens';
import {
  KIND_WORD, REGISTRY, esc, fH, h, hues as huesOf, itemHTML, labels, machineName, machineRect, richHTML, safe, spec, tH,
  type S, type Store,
} from './util';

const pathKey = (p: number[]) => p.join('.');
const wordOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);
const isGapAddr = (a: Addr | GapAddr): a is GapAddr => 'gap' in a;
const slice = (fs: Term[], s: number, e: number): Term => (e - s === 1 ? fs[s]! : { k: 'mul', fs: fs.slice(s, e) });

// ───────── pins (prefer the compiler's helpers; full-context fallback is unique by construction) ─────────
type Pinner = (p: Pallet, a: Addr | GapAddr) => SpanTarget | GapTarget | null;
function compilerPinner(gap: boolean): Pinner | null {
  const f = F as unknown as Record<string, unknown>;
  const fn = f[gap ? 'pinFromGap' : 'pinFromAddr'];
  return typeof fn === 'function' ? (fn as Pinner) : null;
}
function descend(rail: Term, path: number[]): { t: Term; ancestors: Anchor[] } {
  const ancestors: Anchor[] = [];
  let t = rail;
  for (const i of path) {
    if (t.k === 'mul') { ancestors.push({ k: 'factor', left: t.fs.slice(0, i), right: t.fs.slice(i + 1), leftEdge: true, rightEdge: true }); t = t.fs[i]!; }
    else if (t.k === 'inv') { ancestors.push({ k: 'inv' }); t = t.arg; }
  }
  return { t, ancestors };
}
function fallbackPin(p: Pallet, a: Addr | GapAddr): SpanTarget | GapTarget | null {
  if (p.k !== 'eq' && p.k !== 'neq') return null;
  const rail = a.side === 'l' ? p.l : p.r;
  const { t, ancestors } = descend(rail, a.path);
  const word = wordOf(t);
  if (isGapAddr(a)) return { k: 'pin', side: a.side, neighbours: { left: word.slice(0, a.gap), right: word.slice(a.gap), leftEdge: true, rightEdge: true }, ancestors, last: a };
  const [s, e] = a.range ?? [0, word.length];
  const selected = a.range ? slice(word, s, e) : t;
  return { k: 'pin', side: a.side, selected, neighbours: { left: a.range ? word.slice(0, s) : [], right: a.range ? word.slice(e) : [], leftEdge: true, rightEdge: true }, ancestors, last: a };
}
function pinFor(p: Pallet, a: Addr | GapAddr): SpanTarget | GapTarget | null {
  const c = compilerPinner(isGapAddr(a));
  if (c) { const r = safe(() => c(p, a), null); if (r) return r; }
  return fallbackPin(p, a);
}

// ───────── status: the compiler's verdict is the headline; runtime activity is secondary ─────────
export function statusHeadline(s: S, id: string, res: MachineResult | undefined): { label: string; cls: string; sub?: string } {
  const live = s.run?.live?.[id];
  const m = s.canvas.machines.find((x) => x.id === id);
  if (!res) return { label: 'waiting for the compiler', cls: 'idle' };
  if (res.status.k === 'jammed') return { label: 'jammed', cls: 'jam' };
  if (res.status.k === 'starved') return { label: 'starved', cls: 'starved' };
  if (live === 'sealed') return { label: 'delivered', cls: 'sealed' };
  if (m?.kind === 'socket') return { label: 'will accept', cls: 'ok', sub: 'awaiting the first item' };
  return { label: 'working', cls: 'ok', sub: live === 'working' ? 'busy' : live === 'blocked' ? 'output blocked' : 'between items' };
}

export interface LensApi { render: (s: S) => void; position: () => void; el: HTMLElement }

export function mountLens(layer: HTMLElement, store: Store, opts: { dockTop: () => number; keepClear?: () => HTMLElement[] }): LensApi {
  const el = h('section', { class: 'h3-lens', hidden: true, 'aria-label': 'Machine inspector' });
  const notch = h('span', { class: 'h3-lens-notch', 'aria-hidden': 'true' });
  layer.append(el);

  let curId: string | null = null;
  let lastKey = '';
  let lastLive = '';
  const statusEl = () => el.querySelector<HTMLElement>('.h3-status');

  const render = (s: S) => {
    const id = s.ui.screen === 'floor' ? s.ui.lens : null;
    const m = id ? s.canvas.machines.find((x) => x.id === id) : undefined;
    if (!id || !m) { if (!el.hidden) { el.hidden = true; curId = null; lastKey = ''; } return; }
    const res = s.compiled?.machines?.[id];
    const key = `${id}|${s.level.id}`;
    const structural = key !== lastKey || (el as unknown as { _c?: unknown })._c !== s.compiled || (el as unknown as { _v?: unknown })._v !== s.canvas;
    if (structural) {
      // keep a focused term field alive while its own machine re-renders for an unrelated reason
      const focused = el.contains(document.activeElement) && (document.activeElement as HTMLElement).matches('input');
      if (focused && key === lastKey && (el as unknown as { _v?: unknown })._v === s.canvas) { /* only compiled moved */ }
      else {
        build(s, m, res);
        (el as unknown as { _c?: unknown })._c = s.compiled;
        (el as unknown as { _v?: unknown })._v = s.canvas;
      }
      const wasHidden = el.hidden;
      el.hidden = false;
      if (wasHidden || key !== lastKey) el.classList.remove('settled');
      lastKey = key; curId = id;
      position();
    }
    const live = s.run?.live?.[id] ?? '';
    if (live !== lastLive || structural) { lastLive = live; paintStatus(s, m, res); }
  };

  const paintStatus = (s: S, m: Machine, res: MachineResult | undefined) => {
    const st = statusEl();
    if (!st) return;
    st.className = 'h3-status';
    const v = statusHeadline(s, m.id, res);
    st.className = `h3-status ${v.cls}`;
    st.innerHTML = `<i class="h3-pip"></i>${esc(v.label)}${v.sub ? `<span class="h3-sub">${esc(v.sub)}</span>` : ''}`;
  };

  // ───────── build ─────────
  const build = (s: S, m: Machine, res: MachineResult | undefined) => {
    const sp = spec(m.kind);
    const L = labels(s.level);
    const H = huesOf(s.level);
    const fam = m.config.kind === 'stamp' || m.config.kind === 'carddock' ? 'lemma' : sp.family;
    el.innerHTML = '';
    el.style.setProperty('--ink', FAMILY[fam].ink);
    el.style.setProperty('--ink-text', FAMILY[fam].text);
    el.dataset.kind = m.kind;
    el.dataset.family = fam;

    // head
    const close = h('button', { class: 'h3-x', title: 'Close (Esc)', 'aria-label': 'Close inspector' }, '×');
    close.addEventListener('click', () => store.openLens(null));
    const head = h('header', { class: 'h3-lens-head' },
      h('span', { class: `h3-glyph fam-${fam}${fam === 'lemma' ? ' earned' : ''}`, style: `--ink:${FAMILY[fam].ink}` }, sp.glyph),
      h('span', { class: 'h3-lens-title' }, h('b', {}, machineName(m)), h('span', { class: 'h3-lens-sub', html: richHTML(sp.blurb, s.level) })),
      h('span', { class: 'h3-status' }));
    if (!m.locked) {
      const rot = h('button', { class: 'h3-icon', title: 'Rotate (R)', 'aria-label': 'Rotate' }, '↻');
      rot.addEventListener('click', () => store.rotate(m.id));
      const del = h('button', { class: 'h3-icon', title: 'Remove (Delete)', 'aria-label': 'Remove machine' }, '⌫');
      del.addEventListener('click', () => { store.remove([m.id]); store.openLens(null); });
      head.append(rot, del);
    } else head.append(h('span', { class: 'h3-locked', title: 'Placed by the work order' }, 'fixed'));
    head.append(close);
    el.append(head);

    const body = h('div', { class: 'h3-lens-body' });
    el.append(body);
    const cfg = m.config;
    const setCfg = (patch: Partial<MachineConfig>) => { store.configure(m.id, { ...cfg, ...patch } as MachineConfig); };
    const inputs = res?.inputs ?? {};
    const isApply = cfg.kind === 'apply' || cfg.kind === 'stamp';
    const workPort = isApply ? 'p0' : 'q';
    const work = inputs[workPort];
    const workFact = work && work.k === 'fact' && (work.fact.k === 'eq' || work.fact.k === 'neq') ? work.fact : null;

    // ── the incoming workpiece with brackets
    const targeting = 'target' in cfg;
    if (m.kind === 'socket' && cfg.kind === 'socket') body.append(socketView(s, cfg.socketId, work, L, H));
    else if (m.kind === 'given' && cfg.kind === 'given') {
      const g = s.level.givens.find((x) => x.id === cfg.givenId);
      body.append(h('div', { class: 'h3-sec' }, h('div', { class: 'h3-label' }, 'Given'),
        h('div', { class: 'h3-bigmath math', html: g ? `<i>${esc(g.name)}</i>:&ensp;${fH(g.fact, L)}` : '—' }),
        g && (g.fact.k === 'eq' || g.fact.k === 'neq') ? twin(g.fact, L, H, false).el : null,
        h('p', { class: 'h3-note' }, 'A hypothesis of this order. Branch its belt as often as you like; every copy carries the same certificate.')));
    } else if (workFact) {
      const sec = h('div', { class: 'h3-sec' });
      const gapMode = cfg.kind === 'expander';
      const tw = twin(workFact, L, H, gapMode);
      const inLabel = isApply ? (Object.keys(inputs).filter((p) => /^p\d+$/.test(p)).length > 1 ? 'premise 1' : 'premise') : 'in';
      sec.append(h('div', { class: 'h3-label' }, h('span', {}, `${inLabel} · ${KIND_WORD[workFact.k]}`),
        targeting ? targetChip(cfg as { target: SpanTarget | GapTarget }, res) : isApply && res?.choices?.length ? h('span', { class: 'h3-tchip h3-dim' }, res.choices.length > 1 ? 'hover a handle to preview · click to cut there' : 'the only way this premise fits') : null), tw.el);
      body.append(sec);
      if (targeting && res?.candidates?.length) {
        requestAnimationFrame(() => drawBrackets(tw, res, workFact, (t) => setCfg({ target: t } as Partial<MachineConfig>), (cfg as { target: SpanTarget | GapTarget }).target));
        if (res.candidates.length > 1 && !res.candidates.some((c) => isGapAddr(c.addr))) sec.append(candidateChips(tw, res, workFact, L, H, (t) => setCfg({ target: t } as Partial<MachineConfig>)));
      }
      if (isApply && res?.choices?.length) {
        const preview = h('div', { class: 'h3-preview math' });
        sec.append(preview);
        requestAnimationFrame(() => drawHandles(tw, res, workFact, cfg.choice, (i) => setCfg({ choice: i } as Partial<MachineConfig>), (i) => {
          if (i === null || i === cfg.choice) { preview.innerHTML = ''; return; }
          const c = conclusionOf(s, m, res, workFact, i, L);
          preview.innerHTML = c ? `<span class="h3-arrow">cut here →</span> ${c}` : '';
        }));
      }
    } else if (work) {
      body.append(h('div', { class: 'h3-sec' }, h('div', { class: 'h3-label' }, `in · ${KIND_WORD[work.k === 'fact' ? work.fact.k : work.k === 'card' ? work.card.k : 'term'] ?? ''}`), itemView(work, L, H)));
    } else if (hasWorkPort(m, s)) {
      body.append(h('div', { class: 'h3-sec h3-empty' }, h('div', { class: 'h3-label' }, 'in'), h('p', { class: 'h3-note' }, 'Nothing arrives yet. Drag a belt from an output port into this machine’s input.')));
    }

    // ── other inputs (rule, premises, params routed by belt)
    const others = Object.entries(inputs).filter(([p]) => p !== workPort);
    if (others.length) {
      const sec = h('div', { class: 'h3-sec h3-others' });
      for (const [p, v] of others) sec.append(h('div', { class: 'h3-inrow' }, h('span', { class: 'h3-portname' }, portLabel(p)), v ? h('span', { class: 'math h3-inval', html: itemHTML(v, L) }) : h('span', { class: 'h3-dim' }, 'nothing routed')));
      body.append(sec);
    }

    // ── controls
    const ctl = controls(s, m, res, setCfg, L, H, workFact);
    if (ctl) body.append(ctl);

    // ── output preview
    if (res?.out && m.kind !== 'socket') {
      const o = res.out;
      body.append(h('div', { class: 'h3-sec h3-out' }, h('div', { class: 'h3-label' }, `out · ${KIND_WORD[o.k === 'fact' ? o.fact.k : o.k === 'card' ? o.card.k : 'term'] ?? ''}`), h('div', { class: 'h3-outmath math', html: `<span class="h3-arrow">→</span> ${itemHTML(o, L)}` })));
    }
    // ── the reason, in maths
    const stat = res?.status;
    if (stat && stat.k !== 'ok') body.append(h('p', { class: `h3-reason ${stat.k}`, html: richHTML(stat.reason, s.level) }));
    else if (!res) body.append(h('p', { class: 'h3-reason starved' }, 'The compiler has not reported on this machine yet.'));
    el.append(notch);
  };

  const hasWorkPort = (m: Machine, s: S) => safe(() => F.portsOf(m, s.ctx).some((p) => p.id === 'q'), m.kind !== 'spool' && m.kind !== 'hopper' && m.kind !== 'given' && m.kind !== 'carddock');
  const portLabel = (p: string) => (p === 'rule' ? 'rule' : p.startsWith('meta:') ? p.slice(5) : /^p\d+$/.test(p) ? `premise ${+p.slice(1) + 1}` : p);

  // ───────── twin rails ─────────
  interface Twin { el: HTMLElement; overlay: HTMLElement; rails: Record<'l' | 'r', HTMLElement> }
  const twin = (p: { k: 'eq' | 'neq'; l: Term; r: Term }, L: Record<string, string>, H: Record<string, number>, gaps: boolean): Twin => {
    const rl = renderRail(p.l, { side: 'l', L, hues: H, sealed: false, src: 'pallet', gaps });
    const rr = renderRail(p.r, { side: 'r', L, hues: H, sealed: false, src: 'pallet', gaps });
    const overlay = h('div', { class: 'h3-brackets' });
    const box = h('div', { class: `h3-twin${p.k === 'neq' ? ' neq' : ''}` },
      h('span', { class: 'h3-rung math' }, p.k === 'eq' ? '=' : '≠'),
      h('div', { class: 'h3-railrow l' }, rl), h('div', { class: 'h3-railrow r' }, rr), overlay);
    return { el: h('div', { class: 'h3-twinwrap' }, box), overlay, rails: { l: rl, r: rr } };
  };

  const factorsFor = (tw: Twin, a: Addr): HTMLElement[] => {
    const rail = tw.rails[a.side];
    const all = [...rail.querySelectorAll<HTMLElement>('.bn-f[data-wpath]')];
    if (a.range) return all.filter((f) => f.dataset.wpath === pathKey(a.path) && +f.dataset.i! >= a.range![0] && +f.dataset.i! < a.range![1]);
    const whole = all.filter((f) => f.dataset.wpath === pathKey(a.path));
    if (whole.length) return whole;
    const parent = a.path.slice(0, -1), i = a.path[a.path.length - 1];
    return all.filter((f) => f.dataset.wpath === pathKey(parent) && +f.dataset.i! === i);
  };
  const gapFor = (tw: Twin, a: GapAddr) => tw.rails[a.side].querySelector<HTMLElement>(`.bn-gap[data-wpath="${pathKey(a.path)}"][data-gap="${a.gap}"]`);

  const drawBrackets = (tw: Twin, res: MachineResult, p: Pallet, apply: (t: SpanTarget | GapTarget) => void, target: SpanTarget | GapTarget) => {
    const box = tw.overlay.parentElement!;
    const br = box.getBoundingClientRect();
    tw.overlay.innerHTML = '';
    const levels: Record<'l' | 'r', [number, number][][]> = { l: [], r: [] };
    res.candidates!.forEach((c, i) => {
      const a = c.addr;
      let x0: number, x1: number, y: number;
      const chosen = res.chosen === i;
      const side = a.side;
      if (isGapAddr(a)) {
        const g = gapFor(tw, a); if (!g) return;
        const r = g.getBoundingClientRect();
        x0 = r.left - br.left + r.width / 2 - 7; x1 = x0 + 14;
      } else {
        const fs = factorsFor(tw, a); if (!fs.length) return;
        const rs = fs.map((f) => (f.querySelector('.bn-disc') ?? f).getBoundingClientRect());
        x0 = Math.min(...rs.map((r) => r.left)) - br.left - 3; x1 = Math.max(...rs.map((r) => r.right)) - br.left + 3;
      }
      // stack overlapping brackets on their rail's outer side (left rail above, right rail below)
      const lv = levels[side];
      let k = 0;
      while (lv[k]?.some(([a0, a1]) => !(x1 < a0 - 2 || x0 > a1 + 2))) k++;
      (lv[k] ??= []).push([x0, x1]);
      const rr = tw.rails[side].getBoundingClientRect();
      y = side === 'l' ? rr.top - br.top - 7 - k * 11 : rr.bottom - br.top + 3 + k * 11;
      const b = h('button', {
        class: `h3-br ${side}${chosen ? ' chosen' : ''}${isGapAddr(a) ? ' gap' : ''}`, title: `${chosen ? 'Acting here' : 'Act here instead'}: ${c.label}`,
        'aria-label': `${chosen ? 'Chosen target' : 'Pin target'} ${c.label} on the ${side === 'l' ? 'left' : 'right'} rail`, 'aria-pressed': String(chosen), 'data-i': i,
        style: `left:${x0}px;top:${y}px;width:${x1 - x0}px`,
      });
      b.addEventListener('pointerenter', () => { if (!isGapAddr(a)) factorsFor(tw, a).forEach((f) => f.classList.add('is-lit')); });
      b.addEventListener('pointerleave', () => tw.rails[side].querySelectorAll('.is-lit').forEach((f) => f.classList.remove('is-lit')));
      b.addEventListener('click', () => {
        if (chosen && target.k === 'pin') return;
        const pin = pinFor(p, a);
        if (pin) apply(pin);
      });
      tw.overlay.append(b);
    });
    const need = Math.max(levels.l.length, levels.r.length);
    box.style.setProperty('--br-levels', String(Math.max(1, need * 1.4)));
    position();
  };

  /** Draw a binding's spans on the beads, each labelled with its variable (u | v, a prefix u on both rails …). */
  const drawCutsFor = (tw: Twin, bindings: { meta: MetaId; addr: Addr }[], cls: string) => {
    const box = tw.overlay.parentElement!;
    const br = box.getBoundingClientRect();
    tw.overlay.querySelectorAll(`.h3-cut.${cls}`).forEach((x) => x.remove());
    for (const b of bindings) {
      const fs = factorsFor(tw, b.addr); if (!fs.length) continue;
      const rs = fs.map((f) => (f.querySelector('.bn-disc') ?? f).getBoundingClientRect());
      const x0 = Math.min(...rs.map((r) => r.left)) - br.left - 2, x1 = Math.max(...rs.map((r) => r.right)) - br.left + 2;
      const rr = tw.rails[b.addr.side].getBoundingClientRect();
      const y = b.addr.side === 'l' ? rr.top - br.top - 9 : rr.bottom - br.top + 2;
      tw.overlay.append(h('span', { class: `h3-cut ${b.addr.side} ${cls}`, style: `left:${x0}px;top:${y}px;width:${x1 - x0}px` }, h('i', { class: 'math' }, b.meta)));
    }
  };

  /** Interior word boundaries a binding introduces: where the theorem cuts the premise. */
  const cutsOf = (fact: Pallet, bindings: { meta: MetaId; addr: Addr }[]) => {
    const out: { side: 'l' | 'r'; path: number[]; b: number; len: number }[] = [];
    const seen = new Set<string>();
    for (const bd of bindings) {
      if (!bd.addr.range || (fact.k !== 'eq' && fact.k !== 'neq')) continue;
      const len = wordOf(descend(bd.addr.side === 'l' ? fact.l : fact.r, bd.addr.path).t).length;
      for (const b of bd.addr.range) {
        const k = `${bd.addr.side}/${pathKey(bd.addr.path)}/${b}`;
        if (b > 0 && b < len && !seen.has(k)) { seen.add(k); out.push({ side: bd.addr.side, path: bd.addr.path, b, len }); }
      }
    }
    return out.sort((x, y) => (x.side === y.side ? x.b - y.b : x.side === 'l' ? -1 : 1));
  };

  /** Theorem machines: split handles between factors of the premise. Hover previews ONE result; click cuts there. */
  const drawHandles = (tw: Twin, res: MachineResult, fact: Pallet, chosen: number, pick: (i: number) => void, hover: (i: number | null) => void) => {
    const box = tw.overlay.parentElement!;
    const br = box.getBoundingClientRect();
    const chs = res.choices ?? [];
    const xAt = (side: 'l' | 'r', path: number[], b: number, len: number) => {
      const left = b > 0 ? factorsFor(tw, { side, path, range: [b - 1, b] })[0] : null;
      const right = b < len ? factorsFor(tw, { side, path, range: [b, b + 1] })[0] : null;
      const lr = left?.getBoundingClientRect(), rr = right?.getBoundingClientRect();
      if (lr && rr) return (lr.right + rr.left) / 2 - br.left;
      if (lr) return lr.right - br.left + 6;
      if (rr) return rr.left - br.left - 6;
      return null;
    };
    const used = new Map<string, number>();
    const show = (i: number | null) => {
      tw.overlay.querySelectorAll('.h3-tick').forEach((x) => x.remove());
      drawCutsFor(tw, [], 'hov');
      if (i !== null && i !== chosen) {
        drawCutsFor(tw, chs[i]!.bindings, 'hov');
        tw.overlay.querySelectorAll('.h3-cut.sel').forEach((x) => x.classList.add('dim'));
      } else tw.overlay.querySelectorAll('.h3-cut.sel').forEach((x) => x.classList.remove('dim'));
      tw.overlay.querySelectorAll<HTMLElement>('.h3-handle').forEach((x) => x.classList.toggle('hot', +x.dataset.i! === i));
      hover(i);
    };
    chs.forEach((c, i) => {
      const cuts = cutsOf(fact, c.bindings);
      const prim = cuts[0];
      let x: number | null = null, side: 'l' | 'r' = 'l';
      if (prim) { x = xAt(prim.side, prim.path, prim.b, prim.len); side = prim.side; }
      if (x === null) { // the binding cuts nowhere inside a word (a whole side): a handle at the rail's end
        const b0 = c.bindings[0]; if (!b0) return;
        side = b0.addr.side;
        const fs = [...tw.rails[side].querySelectorAll<HTMLElement>('.bn-f')];
        const last = fs[fs.length - 1]?.getBoundingClientRect();
        if (!last) return;
        x = last.right - br.left + 10;
      }
      const key = `${side}/${Math.round(x)}`;
      const n = used.get(key) ?? 0; used.set(key, n + 1);
      const rr = tw.rails[side].getBoundingClientRect();
      const hd = h('button', {
        class: `h3-handle ${side}${i === chosen ? ' chosen' : ''}`, 'data-i': i,
        title: i === chosen ? 'The theorem cuts the premise here' : 'Cut here instead',
        'aria-label': `${i === chosen ? 'Chosen cut' : 'Cut'} ${c.bindings.map((b) => b.meta).join(' | ')} (${i + 1} of ${chs.length})`, 'aria-pressed': String(i === chosen),
        style: `left:${x - 8 + n * 6}px;top:${rr.top - br.top - 6}px;height:${rr.height + 12}px`,
      });
      hd.addEventListener('pointerenter', () => show(i));
      hd.addEventListener('focus', () => show(i));
      hd.addEventListener('pointerleave', () => show(null));
      hd.addEventListener('blur', () => show(null));
      hd.addEventListener('click', () => { if (i !== chosen) pick(i); });
      tw.overlay.append(hd);
      // a handle on one rail mirrors as a passive tick wherever else the same cut lands (the Lathe's prefix)
      for (const cu of cuts.slice(1)) {
        const xx = xAt(cu.side, cu.path, cu.b, cu.len); if (xx === null) continue;
        const r2 = tw.rails[cu.side].getBoundingClientRect();
        tw.overlay.append(h('span', { class: `h3-tickmark${i === chosen ? ' chosen' : ''}`, 'data-i': i, style: `left:${xx - 1}px;top:${r2.top - br.top - 3}px;height:${r2.height + 6}px` }));
      }
    });
    tw.overlay.querySelectorAll<HTMLElement>('.h3-tickmark:not(.chosen)').forEach((t) => { t.style.display = 'none'; });
    tw.overlay.addEventListener('pointerover', (e) => {
      const i = (e.target as HTMLElement).closest<HTMLElement>('.h3-handle')?.dataset.i;
      tw.overlay.querySelectorAll<HTMLElement>('.h3-tickmark:not(.chosen)').forEach((t) => { t.style.display = t.dataset.i === i ? '' : 'none'; });
    });
    const sel = chs[chosen];
    if (sel) drawCutsFor(tw, sel.bindings, 'sel');
    const need = 1.6;
    box.style.setProperty('--br-levels', String(need));
    position();
  };

  /** One readable chip per candidate span (the factor span as beads): disambiguates overlapping brackets. */
  const candidateChips = (tw: Twin, res: MachineResult, p: Pallet, L: Record<string, string>, H: Record<string, number>, apply: (t: SpanTarget | GapTarget) => void) => {
    const row = h('div', { class: 'h3-cands' }, h('span', { class: 'h3-ctl-k' }, 'act at'));
    res.candidates!.forEach((c, i) => {
      if (isGapAddr(c.addr)) return;
      const t = safe(() => K.termAt(p, c.addr as Addr), null);
      const b = h('button', { class: `h3-cand${res.chosen === i ? ' on' : ''}`, 'aria-pressed': String(res.chosen === i), title: c.label },
        h('span', { class: 'h3-cand-side' }, c.addr.side === 'l' ? 'L' : 'R'));
      if (t) b.append(beadsInline(t, L, H)); else b.append(c.label);
      const a = c.addr as Addr;
      b.addEventListener('pointerenter', () => { tw.overlay.querySelector(`.h3-br[data-i="${i}"]`)?.classList.add('hot'); factorsFor(tw, a).forEach((f) => f.classList.add('is-lit')); });
      b.addEventListener('pointerleave', () => { tw.overlay.querySelectorAll('.h3-br.hot').forEach((x) => x.classList.remove('hot')); tw.el.querySelectorAll('.is-lit').forEach((f) => f.classList.remove('is-lit')); });
      b.addEventListener('click', () => { if (res.chosen === i) return; const pin = pinFor(p, a); if (pin) apply(pin); });
      row.append(b);
    });
    return row;
  };

  /** The conclusion one binding would produce (for the hovered handle only; never a list). */
  const conclusionOf = (s: S, m: Machine, res: MachineResult, fact: Pallet, i: number, L: Record<string, string>): string => {
    const ch = res.choices?.[i];
    if (!ch) return '';
    const c = m.config;
    let card = c.kind === 'stamp' ? REGISTRY[c.schema]?.card : res.inputs['rule']?.k === 'card' ? (res.inputs['rule'] as { card: import('../kernel/types').Card }).card : undefined;
    if (card && c.kind === 'stamp' && c.mirror) card = safe(() => K.mirrorCard(card!), card);
    const sub: Record<string, Term> = {};
    for (const b of ch.bindings) { const t = safe(() => K.termAt(fact, b.addr), null); if (t) sub[b.meta] = t; }
    if (c.kind === 'apply' || c.kind === 'stamp') for (const [mm, pv] of Object.entries(c.values)) if (pv.k === 'knob' && pv.term && !sub[mm]) sub[mm] = pv.term;
    if (card) {
      const concl = card.k === 'cond' ? card.concl : { k: 'eq' as const, l: card.l, r: card.r };
      const done = safe(() => ({ k: concl.k, l: K.instantiate(concl.l, sub), r: K.instantiate(concl.r, sub) }), null);
      if (done && K.isGround(done.l) && K.isGround(done.r)) return fH(done as Pallet, L);
    }
    const txt = ch.label.split('  (')[0] ?? '';
    return esc(txt);
  };

  const targetChip = (cfg: { target: SpanTarget | GapTarget }, res: MachineResult | undefined) => {
    const first = cfg.target.k === 'first';
    const wrap = h('span', { class: 'h3-tchip' });
    if (first) wrap.append(h('span', { class: 'h3-tag on', title: 'Default: right rail first, then left; shortest span at each start' }, 'first match'), h('span', { class: 'h3-dim' }, res?.candidates?.length ? `· ${res.candidates.length} candidate${res.candidates.length === 1 ? '' : 's'} · click a bracket to pin` : ''));
    else {
      const reset = h('button', { class: 'h3-tag', title: 'Go back to the first match' }, 'use first match');
      reset.addEventListener('click', () => { const s = store.get(); const m = s.canvas.machines.find((x) => x.id === curId); if (m) store.configure(m.id, { ...m.config, target: { k: 'first' } } as MachineConfig); });
      wrap.append(h('span', { class: 'h3-tag on pinned' }, 'pinned'), reset);
    }
    return wrap;
  };

  // ───────── kind-specific controls ─────────
  const seg = <T extends string>(label: string, opts: [T, string][], cur: T, on: (v: T) => void) => {
    const row = h('div', { class: 'h3-ctl' }, h('span', { class: 'h3-ctl-k' }, label));
    const g = h('span', { class: 'h3-segs' });
    for (const [v, txt] of opts) {
      const b = h('button', { class: `h3-seg${v === cur ? ' on' : ''}`, 'aria-pressed': String(v === cur), html: txt });
      b.addEventListener('click', () => { if (v !== cur) on(v); });
      g.append(b);
    }
    row.append(g);
    return row;
  };
  const toggle = (label: string, on: boolean, hint: string, set: (v: boolean) => void) => {
    const b = h('button', { class: `h3-toggle${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on), title: hint }, h('i', {}), label);
    b.addEventListener('click', () => set(!on));
    return h('div', { class: 'h3-ctl' }, b, h('span', { class: 'h3-dim' }, hint));
  };

  const controls = (s: S, m: Machine, res: MachineResult | undefined, setCfg: (p: Partial<MachineConfig>) => void, L: Record<string, string>, H: Record<string, number>, workFact: { l: Term; r: Term } | null): HTMLElement | null => {
    const c = m.config;
    const sec = h('div', { class: 'h3-sec h3-ctls' });
    const quick: [string, Term][] = workFact ? [['L', workFact.l], ['R', workFact.r]] : [];
    const knob = (name: string, p: Param, set: (p: Param) => void, portable = true) => sec.append(paramKnob(s, name, p, set, L, H, quick, portable));
    switch (c.kind) {
      case 'spool': knob('t', c.t, (t) => setCfg({ t })); break;
      case 'hopper': sec.append(paramKnob(s, 't', { k: 'knob', term: c.t }, (p) => setCfg({ t: p.k === 'knob' ? p.term : null }), L, H, quick, false)); break;
      case 'canceller': sec.append(toggle('tidy', c.tidy, 'pop the e left behind', (tidy) => setCfg({ tidy }))); break;
      case 'popper': break;
      case 'expander': {
        sec.append(seg('insert', [['e', '<i class="math">e</i>'], ['pair', '<i class="math">x x</i><sup>−1</sup>'], ['pairInv', '<i class="math">x</i><sup>−1</sup><i class="math">x</i>'], ['rule', 'rule’s <i class="math">e</i>-side']], c.insert, (insert) => setCfg({ insert })));
        if (c.insert === 'pair' || c.insert === 'pairInv') knob('x', c.x, (x) => setCfg({ x }));
        if (c.insert === 'rule') sec.append(seg('direction', [['fwd', 'L → R'], ['rev', 'R → L']], c.dir, (dir) => setCfg({ dir })));
        break;
      }
      case 'rewriter': {
        sec.append(seg('direction', [['fwd', 'L → R'], ['rev', 'R → L']], c.dir, (dir) => setCfg({ dir })));
        for (const meta of freeMetas(res?.inputs['rule'], c.dir, c.values)) knob(meta, c.values[meta] ?? { k: 'knob', term: null }, (p) => setCfg({ values: { ...c.values, [meta]: p } }));
        sec.append(toggle('tidy', c.tidy, 'pop any e the rewrite leaves', (tidy) => setCfg({ tidy })));
        break;
      }
      case 'multiplier':
        sec.append(seg('side', [['left', '<i class="math">t</i>·L = <i class="math">t</i>·R'], ['right', 'L·<i class="math">t</i> = R·<i class="math">t</i>']], c.side, (side) => setCfg({ side })));
        knob('t', c.t, (t) => setCfg({ t }));
        break;
      case 'apply': case 'stamp': {
        if (c.kind === 'stamp') {
          const sc = REGISTRY[c.schema];
          if (sc) sec.append(h('div', { class: 'h3-card math', html: fH(c.mirror ? safe(() => K.mirrorCard(sc.card), sc.card) : sc.card, {}) }));
          if (sc?.mirrorable) sec.append(seg('hand', [['plain', sc.name], ['op', `${sc.name} ᵒᵖ`]], c.mirror ? 'op' : 'plain', (v) => setCfg({ mirror: v === 'op' })));
        } else {
          const row = h('div', { class: 'h3-ctl' }, h('span', { class: 'h3-ctl-k' }, 'premises'));
          const minus = h('button', { class: 'h3-seg', disabled: c.premises <= 0 }, '−');
          const plus = h('button', { class: 'h3-seg', disabled: c.premises >= 4 }, '+');
          minus.addEventListener('click', () => setCfg({ premises: Math.max(0, c.premises - 1) }));
          plus.addEventListener('click', () => setCfg({ premises: Math.min(4, c.premises + 1) }));
          row.append(h('span', { class: 'h3-segs' }, minus, h('span', { class: 'h3-count' }, String(c.premises)), plus));
          sec.append(row);
        }
        const card = c.kind === 'stamp' ? REGISTRY[c.schema]?.card : (res?.inputs['rule'] && res.inputs['rule'].k === 'card' ? res.inputs['rule'].card : undefined);
        if (card) {
          // metas the premises cannot determine (all of a law card's) are set here, as knobs or ports
          const inPrem = new Set(card.k === 'cond' ? card.premises.flatMap((p) => (p.k === 'eq' || p.k === 'neq' ? [...K.metasOf(p.l), ...K.metasOf(p.r)] : [])) : []);
          const free = [...new Set([...card.metas.filter((x) => !inPrem.has(x)), ...Object.keys(c.values)])].sort();
          for (const meta of free) knob(meta, c.values[meta] ?? { k: 'knob', term: null }, (p) => setCfg({ values: { ...c.values, [meta]: p } }));
          if (card.k === 'law' && !free.length) sec.append(h('p', { class: 'h3-note' }, 'This law has no variables: it emits itself.'));
        } else if (c.kind === 'apply') sec.append(h('p', { class: 'h3-note' }, 'Route a card (a law or a conditional theorem) into the card port; its variables appear here.'));
        break;
      }
      case 'carddock': {
        const laws = Object.values(REGISTRY).filter((x) => x.card.k === 'law' && s.ctx.level.tools.schemas.includes(x.id));
        if (laws.length > 1) sec.append(seg('card', laws.map((x) => [x.id, x.name] as [string, string]), c.schema, (schema) => setCfg({ schema })));
        const sc = REGISTRY[c.schema];
        if (sc) sec.append(h('div', { class: 'h3-card math', html: fH(sc.card, {}) }));
        break;
      }
      case 'desk': case 'gate': {
        const room = s.canvas.rooms.find((r) => r.id === c.room);
        if (room) {
          const assume = room.kind === 'suppose' ? `${tH(room.l, L)} <span class="m-rel">=</span> ${tH(room.r, L)}` : `${tH(room.l, L)} <span class="m-rel">≠</span> ${tH(room.r, L)}`;
          const exp = room.kind === 'suppose' ? `${tH(room.l, L)} <span class="m-rel">≠</span> ${tH(room.r, L)}` : `${tH(room.l, L)} <span class="m-rel">=</span> ${tH(room.r, L)}`;
          sec.append(h('div', { class: 'h3-roominfo', html: c.kind === 'desk'
            ? `Emits the room’s assumption <span class="math">${assume}</span> to machines inside it.`
            : `⊥ arriving here leaves the room as <span class="math">${exp}</span>${room.kind === 'classical' ? ' <span class="t-classical">classical</span>' : ''}.` }));
        }
        break;
      }
      default: return null;
    }
    return sec.childElementCount ? sec : null;
  };

  /** Metas of a routed law that the matched side does not bind: the player must supply them. */
  const freeMetas = (rule: ItemValue | undefined, dir: 'fwd' | 'rev', values: Record<MetaId, Param>): MetaId[] => {
    const out = new Set(Object.keys(values));
    if (rule && rule.k === 'card' && rule.card.k === 'law') {
      const src = dir === 'fwd' ? rule.card.l : rule.card.r;
      const bound = new Set(safe(() => K.metasOf(src), [] as MetaId[]));
      for (const m of rule.card.metas) if (!bound.has(m)) out.add(m);
    }
    return [...out].sort();
  };

  // ───────── term knob: beads + typed parse, or "use a port" ─────────
  const paramKnob = (s: S, name: string, p: Param, set: (p: Param) => void, L: Record<string, string>, H: Record<string, number>, quick: [string, Term][], portable: boolean) => {
    const row = h('div', { class: `h3-knob${p.k === 'port' ? ' port' : ''}` });
    const label = h('span', { class: 'h3-knob-k math', html: `<i>${esc(name)}</i> :=` });
    if (p.k === 'port') {
      const back = h('button', { class: 'h3-tag' }, 'type it instead');
      back.addEventListener('click', () => set({ k: 'knob', term: null }));
      row.append(label, h('span', { class: 'h3-dim' }, `from a term belt into port ${name}`), back);
      return row;
    }
    const plainOf = (t: Term | null) => (t ? safe(() => K.termText(t, L), '') : '');
    const input = h('input', { class: 'h3-term', value: plainOf(p.term), placeholder: 'type ba, a^-1 … or tap beads', 'aria-label': `value of ${name}`, autocomplete: 'off', spellcheck: 'false' });
    const view = h('span', { class: 'h3-knob-view' });
    const msg = h('span', { class: 'h3-knob-msg' });
    let parsed: Term | null = p.term;
    const update = () => {
      const src = input.value.trim();
      view.innerHTML = ''; msg.textContent = ''; input.classList.remove('bad');
      if (!src) { parsed = null; return; }
      const r = safe(() => K.parseTerm(src, s.level.atoms), { ok: false as const, error: 'term entry is not ready' });
      if (r.ok) { parsed = r.term; view.append(beadsInline(r.term, L, H)); }
      else { parsed = null; msg.textContent = r.error; input.classList.add('bad'); }
    };
    const commit = () => {
      update();
      const same = JSON.stringify(parsed) === JSON.stringify(p.term);
      if (!same && (parsed || !input.value.trim())) set({ k: 'knob', term: parsed });
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); input.value = plainOf(p.term); update(); input.blur(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim() !== plainOf(p.term)) commit(); });
    const chips = h('div', { class: 'h3-chips' });
    const chipTerms: Term[] = [...s.level.atoms.map((a) => ({ k: 'atom', id: a.id } as Term)), ...s.level.atoms.map((a) => ({ k: 'inv', arg: { k: 'atom', id: a.id } } as Term)), { k: 'e' }];
    for (const t of chipTerms) {
      const b = h('button', { class: 'bn-chip h3-chip', title: `append ${plainOf(t)}` });
      b.append(beadsInline(t, L, H));
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => { input.value += plainOf(t); update(); commit(); });
      chips.append(b);
    }
    const bk = h('button', { class: 'bn-chip h3-chip txt', title: 'delete last' }, '⌫');
    bk.addEventListener('pointerdown', (e) => e.preventDefault());
    bk.addEventListener('click', () => { const v = input.value; input.value = v.endsWith('⁻¹') ? v.slice(0, -2) : v.slice(0, -1); update(); commit(); });
    chips.append(bk);
    for (const [q, t] of quick) {
      const b = h('button', { class: 'bn-chip h3-chip txt', title: `copy the incoming ${q === 'L' ? 'left' : 'right'} side (syntax only)` }, `= ${q}`);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => { input.value = plainOf(t); update(); commit(); });
      chips.append(b);
    }
    if (portable) {
      const port = h('button', { class: 'h3-tag', title: 'Add a term port and route a term belt into it' }, 'use a port');
      port.addEventListener('click', () => set({ k: 'port' }));
      chips.append(port);
    }
    update();
    row.append(h('div', { class: 'h3-knob-top' }, label, input, view), msg, chips);
    if (!p.term) row.classList.add('unset');
    return row;
  };

  // ───────── item views ─────────
  const itemView = (v: ItemValue, L: Record<string, string>, H: Record<string, number>) => {
    if (v.k === 'term') { const w = h('div', { class: 'h3-termview' }); w.append(beadsInline(v.term, L, H)); return w; }
    if (v.k === 'fact' && (v.fact.k === 'eq' || v.fact.k === 'neq')) return twin(v.fact, L, H, false).el;
    return h('div', { class: 'h3-bigmath math', html: itemHTML(v, L) });
  };

  const socketView = (s: S, socketId: string, arriving: ItemValue | undefined, L: Record<string, string>, H: Record<string, number>) => {
    const sk = s.level.sockets.find((x) => x.id === socketId);
    const info = s.compiled?.sockets?.[socketId];
    const delivered = s.run?.delivered?.[socketId];
    const sec = h('div', { class: 'h3-sec' });
    sec.append(h('div', { class: 'h3-label' }, h('span', {}, 'expected'), delivered !== undefined ? h('span', { class: 'h3-tag on sealed', html: '<span class="tomb"></span> delivered' }) : null));
    if (sk) sec.append(h('div', { class: 'h3-bigmath math', html: fH(sk.target, L) }));
    sec.append(h('div', { class: 'h3-label' }, 'arriving'));
    if (arriving) sec.append(itemView(arriving, L, H)); else sec.append(h('p', { class: 'h3-note' }, 'Nothing is routed here yet. Either orientation is accepted (the swap is recorded as symmetry).'));
    if (info && !info.ok && info.reason) sec.append(h('p', { class: 'h3-reason jammed', html: richHTML(info.reason, s.level) }));
    if (info?.ok && arriving) {
      const f = h('button', { class: 'lw-key small primary', title: 'Quiet everything else and annotate each step of this certificate' }, 'Follow this proof');
      f.addEventListener('click', () => { store.openLens(null); store.setUI({ follow: socketId }); });
      sec.append(f);
    }
    return sec;
  };

  // ───────── positioning ─────────
  const position = () => {
    if (el.hidden || !curId) return;
    const r = machineRect(curId, store.get());
    const w = el.offsetWidth, hh = el.offsetHeight;
    const top0 = 64, bottom0 = innerHeight - 92;
    if (!r) {
      el.classList.add('docked'); el.classList.remove('above', 'below');
      el.style.left = `${innerWidth - w - 16}px`;
      el.style.top = `${Math.max(top0, opts.dockTop())}px`;
      return;
    }
    el.classList.remove('docked');
    const cx = r.left + r.width / 2;
    let left = cx - w / 2;
    left = Math.max(12, Math.min(innerWidth - w - 12, left));
    let top: number; let above: boolean;
    if (r.top - 14 - hh >= top0) { top = r.top - 14 - hh; above = true; }
    else if (r.top + r.height + 14 + hh <= bottom0) { top = r.top + r.height + 14; above = false; }
    else { top = Math.max(top0, Math.min(bottom0 - hh, r.top - hh / 2)); above = true; left = r.left + r.width + 14 + w < innerWidth ? r.left + r.width + 14 : Math.max(12, r.left - w - 14); }
    // keep the order chip and run cluster readable: slide sideways off them, or drop below them
    const clear = (opts.keepClear?.() ?? []).map((x) => x.getBoundingClientRect()).filter((q) => q.width);
    for (const q of clear) {
      if (!(left < q.right && left + w > q.left && top < q.bottom && top + hh > q.top)) continue;
      const toRight = q.right + 10, toLeft = q.left - w - 10;
      if (q.left < innerWidth / 2 && toRight + w <= innerWidth - 12) left = toRight;
      else if (q.left >= innerWidth / 2 && toLeft >= 12) left = toLeft;
      else top = Math.min(bottom0 - hh, q.bottom + 10);
    }
    el.classList.toggle('above', above); el.classList.toggle('below', !above);
    el.style.left = `${left}px`; el.style.top = `${top}px`;
    notch.style.left = `${Math.max(16, Math.min(w - 16, cx - left))}px`;
  };

  return { render, position, el };
}
