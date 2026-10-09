// Concept-card figures `scene` and `gif`: a rendered floor state built from the GAME'S OWN floor renderer
// (src/floor/scene.ts machineSVG / portSVG / beltBody / roomSVG / machineLabelSVG / pipSVG, svg.ts defsSVG,
// look.ts lookOf, the editor's footprints and ports), composed here read-only. HTML on top: term chips on the
// belts and numbered navy note markers, listed below the scene. The scene scales to the card width (≤ 540px)
// and never widens it. Loaded lazily by concept.ts, so a floor module mid-edit never takes the cards down.
import '../../floor/floor.css';
import type { KernelCtx } from '../../kernel';
import type { Machine, MachineConfig, Port } from '../../factory/types';
import type { G2 } from '../../board/geom';
import { P, f1 } from '../../board/geom';
import { schemaMachineName } from '../../factory/catalog';
import type { GridPt, SceneConfig, SceneSpec } from '../../levels/cards';
import { fallbackConfig, footprint, portsOf, spec as specOf } from '../../floor/adapt';
import type { MGeo, PortGeo } from '../../floor/geo';
import { portEdge, portOut } from '../../floor/geo';
import { lookOf } from '../../floor/look';
import { beltBody, machineLabelSVG, machineSVG, pipSVG, portSVG, roomSVG, type Ctx } from '../../floor/scene';
import { defsSVG, esc, VIOLET } from '../../floor/svg';
import { FAMILY, FONT } from '../../ui/tokens';
import { h } from '../util';
import { mdInline } from './tex';
import { figStrip, type Letters } from './terms';

const MAX_W = 540;

/** Complete a card's compact machine into a real MachineConfig. */
function toConfig(c: SceneConfig): MachineConfig {
  const first = { k: 'first' } as const;
  switch (c.kind) {
    case 'spool': return { kind: 'spool', t: { k: 'knob', term: null } };
    case 'tower': return { kind: 'tower', varId: `cc-${c.label}`, label: c.label, sort: c.sort };
    case 'rewriter': return { kind: 'rewriter', recipe: c.recipe, dir: c.dir ?? 'fwd', target: first, gap: first, values: {}, tidy: true };
    case 'operator': return { kind: 'operator', recipe: c.recipe?.k === 'multiply' ? { k: 'multiply', side: c.recipe.side, t: { k: 'knob', term: null } } : c.recipe };
    case 'joiner': return { kind: 'joiner', recipe: c.recipe };
    case 'theorem': return { kind: 'theorem', recipe: c.recipe, choice: 0, values: {} };
    case 'given': return { kind: 'given', givenId: c.givenId };
    case 'desk': return { kind: 'desk', room: 'cc' };
    case 'gate': return { kind: 'gate', room: 'cc' };
    case 'forall': return { kind: 'forall' };
  }
  return fallbackConfig((c as SceneConfig).kind);
}

/** What a belt carries, read from the chip that sits on it (else the source port's first kind). */
function itemKind(t: string): 'eq' | 'neq' | 'bot' | 'law' | 'cond' {
  if (t.trim() === '⊥') return 'bot';
  if (/⟹|⇒/.test(t)) return 'cond';
  if (/^\s*∀/.test(t)) return 'law';
  return /≠/.test(t) ? 'neq' : 'eq';
}
const near = (a: G2, b: G2, d = 0.3) => Math.hypot(a[0] - b[0], a[1] - b[1]) < d;
function onLine(p: G2, line: G2[]): boolean {
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]!, [bx, by] = line[i + 1]!;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2));
    if (Math.hypot(ax + dx * t - p[0], ay + dy * t - p[1]) < 0.3) return true;
  }
  return false;
}
/** Insert points at unit steps so the floor's flow chevrons appear along straight runs. */
function densify(line: G2[]): G2[] {
  const out: G2[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

export interface Built { svg: string; minX: number; minY: number; vw: number; vh: number; at: (p: GridPt) => [number, number] }

/** The scene as one SVG string, plus a grid → fraction-of-frame mapping for the HTML overlays. */
export function buildScene(spec: SceneSpec, ctx: KernelCtx, L: Record<string, string>): Built {
  const gs = spec.machines.map((sm, i): MGeo & { pip?: 'working'; open: string[] } => {
    const m: Machine = { id: `cc:${i}`, kind: sm.config.kind, at: { x: sm.x, y: sm.y }, rot: 0, config: toConfig(sm.config) };
    const tiles = footprint(m, ctx);
    const look = lookOf(m, ctx);
    return {
      m, spec: specOf(m.kind), fam: look.fam, look, tiles, ports: portsOf(m, ctx),
      x0: Math.min(...tiles.map((t) => t.x)), y0: Math.min(...tiles.map((t) => t.y)),
      x1: Math.max(...tiles.map((t) => t.x)) + 1, y1: Math.max(...tiles.map((t) => t.y)) + 1,
      pip: sm.pip, open: sm.open ?? [],
    };
  });
  const cx: Ctx = { L, level: ctx.level, comp: null, schemaName: (id, mirror) => schemaMachineName(ctx, id, mirror) };

  // framing (as the prototype: machines with headroom for tops and Tower bulbs, belts, rooms, extras)
  const pts: [number, number][] = [];
  for (const g of gs) pts.push(P(g.x0 - 0.2, g.y0 - 0.2, g.m.kind === 'tower' ? 1.7 : 0.9), P(g.x1 + 0.2, g.y0 - 0.2), P(g.x1 + 0.2, g.y1 + 0.2), P(g.x0 - 0.2, g.y1 + 0.2));
  for (const b of spec.belts ?? []) for (const [x, y] of b) pts.push(P(x - 0.25, y - 0.25), P(x + 0.25, y + 0.25), P(x + 0.25, y - 0.25), P(x - 0.25, y + 0.25));
  for (const r of spec.rooms ?? []) pts.push(P(r.x0, r.y0, 0.45), P(r.x1, r.y0), P(r.x1, r.y1), P(r.x0, r.y1));
  for (const [x, y, z = 0] of spec.extra ?? []) pts.push(P(x, y, z));
  const minX = Math.min(...pts.map((p) => p[0])) - 10, maxX = Math.max(...pts.map((p) => p[0])) + 10;
  const minY = Math.min(...pts.map((p) => p[1])) - 8, maxY = Math.max(...pts.map((p) => p[1])) + 20;

  let body = defsSVG();
  (spec.rooms ?? []).forEach((r, i) => {
    body += roomSVG({ id: `cc:r${i}`, kind: r.kind ?? 'assume', l: null, r: null, rect: { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 } }, L);
    const t = P(r.x0, r.y0);
    body += `<text class="cc-roomtag" x="${f1(t[0])}" y="${f1(t[1] - 7)}" text-anchor="middle" font-family="${FONT.ui}" font-size="9" font-weight="600" letter-spacing=".14em" fill="${VIOLET}">${esc(r.label)}</text>`;
  });
  for (const raw of spec.belts ?? []) {
    const line = raw.map(([x, y]) => [x, y] as G2);
    const src = gs.flatMap((g) => g.ports.filter((p) => p.dir === 'out').map((p) => ({ g, p }))).find(({ p }) => near(portEdge(p), line[0]!));
    const item = (spec.items ?? []).find((it) => onLine([it.at[0], it.at[1]], line));
    const kind = item ? itemKind(item.t) : (src?.p.accepts[0] ?? 'eq');
    body += `<g class="cc-belt">${beltBody({ kind, fam: src?.g.fam ?? 'equation', line: densify(line) })}</g>`;
  }
  const pipFor: string[] = [];
  [...gs].sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0)).forEach((g) => {
    body += g.ports.map((p: Port) => {
      const pg: PortGeo = { m: g.m.id, port: p, edge: portEdge(p), out: portOut(p, 0.42), taken: !g.open.includes(p.id), kind: p.accepts[0] ?? 'eq' };
      return portSVG(pg, g);
    }).join('');
    body += machineSVG(g, cx);
    if (g.m.kind !== 'given') body += machineLabelSVG(g, cx);
    else {
      // a card's inlet stands for a given in the card's own letters (not the level's): label it GIVEN under the
      // tile, like other machines, without the level's statement
      const a = P((g.x0 + g.x1) / 2, g.y1);
      body += `<g class="fl-lab"><text x="${f1(a[0] - 6)}" y="${f1(a[1] + 12)}" text-anchor="middle" font-family="${FONT.ui}" font-size="8.6" font-weight="600" letter-spacing=".12em" fill="${FAMILY.given.text}">GIVEN</text></g>`;
    }
    if (g.pip) pipFor.push(`<g class="cc-pip" data-pip="${esc(g.m.id)}">${pipSVG(g, g.pip)}</g>`);
  });
  body += pipFor.join('');
  const vw = maxX - minX, vh = maxY - minY;
  const svg = `<svg class="fl-svg cc-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${f1(minX)} ${f1(minY)} ${f1(vw)} ${f1(vh)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${body}</svg>`;
  return { svg, minX, minY, vw, vh, at: ([x, y, z = 0]) => { const p = P(x, y, z); return [(p[0] - minX) / vw, (p[1] - minY) / vh]; } };
}

const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
/** Chip size: terms at 20px, legible at the card's real scale (chips are HTML and never shrink with the scene). */
const CHIP_BD = 20;
type Place = 'ne' | 'nw' | 'se' | 'sw' | 'n' | 's';
function overlay(at: [number, number], child: HTMLElement, cls: string): HTMLElement {
  return h('span', { class: `cc-ov ${cls}`, style: `left:${pct(at[0])};top:${pct(at[1])}` }, child);
}
/**
 * A term chip for an item on a belt: a pin on the belt, the chip set beside it (default north-east, clear of the
 * machines a belt joins), and a short leader from pin to chip.
 */
const OFF: Record<Place, [number, number]> = { ne: [10, 12], nw: [-10, 12], se: [10, -12], sw: [-10, -12], n: [0, 14], s: [0, -14] };
function itemOverlay(at: [number, number], t: string, lt: Letters, place: Place = 'ne', off?: [number, number]): HTMLElement {
  const [ox, oy] = off ?? OFF[place];
  const lead = h('span', { class: 'cc-lead', html: '<svg width="1" height="1" aria-hidden="true"><line x1="0" y1="0" x2="0" y2="0"/></svg>' });
  return h('span', { class: `cc-ov item ${place}`, 'data-place': place, 'data-off': `${ox},${oy}`, style: `left:${pct(at[0])};top:${pct(at[1])};--ox:${ox}px;--oy:${oy}px` }, lead, h('span', { class: 'cc-pin' }), h('span', { class: 'cc-item' }, figStrip(t, lt, CHIP_BD)));
}
const marker = (n: number) => h('span', { class: 'cc-mark' }, String(n));
function noteList(notes: { text: string }[]): HTMLOListElement {
  return h('ol', { class: 'cc-notes' }, ...notes.map((n, i) => h('li', {}, marker(i + 1), h('span', { html: mdInline(n.text) }))));
}
function stage(B: Built, scale: number): HTMLElement {
  const w = Math.min(B.vw * scale, MAX_W);
  return h('div', { class: 'cc-stage', style: `width:min(100%, ${f1(w)}px);aspect-ratio:${f1(B.vw)} / ${f1(B.vh)}`, html: B.svg });
}

/** Keep a chip inside the figure horizontally, and point its leader at the chip's nearest edge. */
function fitItem(box: DOMRect, ov: HTMLElement) {
  const chipEl = ov.querySelector<HTMLElement>('.cc-item');
  const line = ov.querySelector('line');
  if (!chipEl) return;
  chipEl.style.setProperty('--dx', '0px');
  const r = chipEl.getBoundingClientRect();
  let dx = r.right > box.right ? box.right - r.right : 0;
  if (r.left + dx < box.left) dx = box.left - r.left;
  chipEl.style.setProperty('--dx', `${dx.toFixed(1)}px`);
  if (!line) return;
  const a = ov.getBoundingClientRect();
  const L = r.left + dx, R = r.right + dx;
  const cx = Math.max(L, Math.min(R, a.left)), cy = Math.max(r.top, Math.min(r.bottom, a.top));
  line.setAttribute('x2', (cx - a.left).toFixed(1));
  line.setAttribute('y2', (cy - a.top).toFixed(1));
}
function setPlace(ov: HTMLElement, place: Place, off: [number, number]) {
  for (const p of Object.keys(OFF)) ov.classList.remove(p);
  ov.classList.add(place);
  ov.style.setProperty('--ox', `${off[0]}px`);
  ov.style.setProperty('--oy', `${off[1]}px`);
}
const area = (a: DOMRect, b: DOMRect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
/**
 * Place each chip: the card's own side first; if that collides with a machine, a label, a marker or another chip
 * (e.g. once a narrow card has shrunk the scene but not the chips), the first other side that is clear, else the
 * least-covered one.
 */
function placeItems(box: DOMRect, st: HTMLElement) {
  const items = [...st.querySelectorAll<HTMLElement>('.cc-ov.item:not([data-moving])')];
  const fixed = [...st.querySelectorAll<Element>('.fl-body, .fl-tower, .fl-lab text, .cc-roomtag, .cc-mark, .cc-termbox')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
  const placed: DOMRect[] = [];
  for (const ov of items) {
    const pref = (ov.dataset.place ?? 'ne') as Place;
    const off = (ov.dataset.off ?? '').split(',').map(Number) as [number, number];
    const pins = items.filter((o) => o !== ov).map((o) => o.querySelector('.cc-pin')!.getBoundingClientRect());
    const sides = (Object.keys(OFF) as Place[]).filter((p) => p !== pref);
    const far = (k: number) => sides.map((p): [Place, [number, number]] => [p, [OFF[p][0], OFF[p][1] * (k + 1)]]);
    const tries: [Place, [number, number]][] = [[pref, off.length === 2 && off.every(Number.isFinite) ? off : OFF[pref]], ...sides.map((p): [Place, [number, number]] => [p, OFF[p]]), ...far(1.5), ...far(2.5)];
    let best: { t: [Place, [number, number]]; cost: number } | null = null;
    for (const t of tries) {
      setPlace(ov, t[0], t[1]);
      fitItem(box, ov);
      const r = ov.querySelector('.cc-item')!.getBoundingClientRect();
      const cost = [...fixed, ...placed, ...pins].reduce((c, o) => c + area(r, o), 0);
      if (!best || cost < best.cost) best = { t, cost };
      if (cost === 0) break;
    }
    setPlace(ov, best!.t[0], best!.t[1]);
    fitItem(box, ov);
    placed.push(ov.querySelector('.cc-item')!.getBoundingClientRect());
  }
}
/** Place every chip, then reserve room above / below the scene for chips and markers that stand out of it. */
function fitOverlays(fig: HTMLElement, st: HTMLElement) {
  const box = fig.getBoundingClientRect();
  if (!box.width) return;
  placeItems(box, st);
  const s = st.getBoundingClientRect();
  let top = s.top, bottom = s.bottom;
  st.querySelectorAll<HTMLElement>('.cc-item, .cc-mark, .cc-termbox').forEach((el) => { const r = el.getBoundingClientRect(); top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); });
  const mt = Math.ceil(s.top - top), mb = Math.ceil(bottom - s.bottom);
  const cur = (v: string) => parseFloat(v) || 0;
  if (Math.abs(cur(st.style.marginTop) - mt) > 1) st.style.marginTop = `${mt + 4}px`;
  if (Math.abs(cur(st.style.marginBottom) - mb) > 1) st.style.marginBottom = `${mb + 4}px`;
}
const watchFit = (fig: HTMLElement, st: HTMLElement) => {
  if (typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => fitOverlays(fig, st)).observe(fig);
};

/** A static rendered game state with term chips beside its belts and numbered notes. */
export function sceneFigure(spec: SceneSpec, ctx: KernelCtx, lt: Letters): HTMLElement {
  const B = buildScene(spec, ctx, lt.L);
  const st = stage(B, spec.scale ?? 1.3);
  for (const it of spec.items ?? []) st.append(itemOverlay(B.at(it.at), it.t, lt, it.place, it.off));
  (spec.notes ?? []).forEach((n, i) => st.append(overlay(B.at(n.at), marker(i + 1), 'note')));
  const fig = h('figure', { class: 'cc-fig cc-scene' }, st);
  if (spec.notes?.length) fig.append(noteList(spec.notes));
  watchFit(fig, st);
  return fig;
}

// ───────── the "gif": a term typed into the Spool → t = t on a belt → Rewriter (cancel) → cc⁻¹ = e, looping ─────────
const DUR = 8.4;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const GIF_NOTES = [
  { text: '**Give the Spool a term**, here $cc^{-1}$.' },
  { text: 'The Spool makes $t = t$ from it, $cc^{-1} = cc^{-1}$, and a belt carries it on.' },
  { text: 'The Rewriter’s recipe, **cancel**, removes $cc^{-1}$ from one side. Out comes $cc^{-1} = e$.' },
];

/** The looping Spool animation (8.4 s). Reduced motion: the final state, every caption at full strength. */
export function spoolGif(ctx: KernelCtx, lt: Letters, reduced: boolean): HTMLElement {
  const spec: SceneSpec = {
    machines: [{ x: 0, y: 0, config: { kind: 'spool' } }, { x: 3, y: 0, config: { kind: 'rewriter', recipe: { k: 'cancel' } }, pip: 'working' }],
    belts: [[[1, 0.5], [3, 0.5]], [[5, 0.5], [6.7, 0.5]]], extra: [[0.5, 0.5, 1.6], [7, 0.5]], scale: 1.3,
  };
  const B = buildScene(spec, ctx, lt.L);
  const st = stage(B, 1.3);
  const termSlot = h('span', { class: 'cc-termval' });
  const caret = h('span', { class: 'cc-caret' });
  const box = h('span', { class: 'cc-termbox' }, h('span', { class: 'cc-tdef math' }, h('i', {}, 't'), ' :='), termSlot, caret);
  const inItem = itemOverlay([0, 0], 'cc^-1 = cc^-1', lt);
  const outItem = itemOverlay([0, 0], 'cc^-1 = e', lt, 'sw');
  inItem.dataset.moving = outItem.dataset.moving = '1'; // placed by the animation, not by placeItems
  st.append(overlay(B.at([0.5, 0.5, 1.15]), box, 'termbox'), inItem, outItem);
  const notes = noteList(GIF_NOTES);
  const fig = h('figure', { class: `cc-fig cc-scene cc-gif${reduced ? ' is-reduced' : ''}` }, st, notes);
  const pip = st.querySelector<SVGGElement>('.cc-pip');
  const lis = [...notes.children] as HTMLElement[];
  let shown = -1;
  const place = (el: HTMLElement, x: number, op: number) => { const a = B.at([x, 0.5]); el.style.left = pct(a[0]); el.style.top = pct(a[1]); el.style.opacity = String(op); };
  const frame = (t: number) => {
    const n = reduced ? 2 : t < 0.6 ? 0 : t < 1.2 ? 1 : 2;
    if (n !== shown) { shown = n; termSlot.replaceChildren(...(n ? [figStrip(n === 1 ? 'c' : 'cc^-1', lt, CHIP_BD)] : [])); }
    caret.style.display = !reduced && t < 1.7 ? '' : 'none';
    caret.style.opacity = Math.floor(t * 3) % 2 ? '0' : '1';
    place(inItem, reduced ? 2 : 1.05 + 1.9 * seg(t, 1.9, 3.8), reduced ? 1 : t < 1.9 ? 0 : t < 3.9 ? 1 : 1 - seg(t, 3.9, 4.25));
    place(outItem, reduced ? 5.85 : 5.05 + 1.5 * seg(t, 4.9, 6.6), reduced ? 1 : t < 4.85 ? 0 : t > DUR - 0.5 ? 1 - seg(t, DUR - 0.5, DUR - 0.05) : seg(t, 4.85, 5.1));
    if (pip) pip.style.display = !reduced && t > 3.9 && t < 5 ? '' : 'none';
    const step = reduced ? -1 : t < 1.8 ? 0 : t < 3.9 ? 1 : 2;
    lis.forEach((li, i) => li.classList.toggle('dim', step >= 0 && i !== step));
    if (fig.isConnected) { const box = fig.getBoundingClientRect(); fitItem(box, inItem); fitItem(box, outItem); }
  };
  watchFit(fig, st);
  frame(reduced ? DUR : 0);
  if (!reduced) {
    const t0 = performance.now();
    let last = 0, seen = false;
    const loop = (now: number) => {
      if (!fig.isConnected) { if (seen || now - t0 > 3000) return; } else seen = true;
      if (now - last > 32) { last = now; frame(((now - t0) / 1000) % DUR); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return fig;
}
