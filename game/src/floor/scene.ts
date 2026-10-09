// LEMMA WORKS v3 floor — the static scene for one epoch (rooms, belts, ports,
// machines, sockets, labels) as SVG strings. Hover/selection/status are toggled
// by class afterwards, so this only re-runs on edits.
import type { Card, Fact, Pallet } from '../kernel/types';
import type { Compiled, LiveStatus, Machine, Room, RunState } from '../factory/types';
import type { LevelManifest } from '../kernel/types';
import { FAMILY, FONT, INK } from '../ui/tokens';
import { P, f1, isoEllipse, roundGrid, gridRect, pts, shade, type G2 } from '../board/geom';
import { factSVG, termSVG, type Labels } from './math';
import type { Look } from './look';
import type { BGeo, Crossing, Geo, MGeo, PortGeo } from './geo';
import { faceVec } from './adapt';
import {
  JAM, VIOLET, band, box, esc, famInk, famText, glyphSVG, groundArrow, groundChevron, groundRect, kindGhost,
  polyD, railOpacity, roundOpen,
} from './svg';

export const labelsOf = (lv: LevelManifest): Labels => Object.fromEntries(lv.atoms.map((a) => [a.id, a.label]));

export function heightOf(m: Machine): number {
  switch (m.kind) {
    case 'socket': return 0.06;
    case 'given': case 'spool': case 'hopper': case 'carddock': return 0.24;
    case 'desk': return 0.26;
    case 'gate': return 0.16;
    case 'theorem': return 0.34;
    case 'forall': return 0.32;
    case 'tower': return 0.55;
    default: return 0.3;
  }
}
const isSource = (m: Machine) => m.kind === 'given' || m.kind === 'spool' || m.kind === 'hopper' || m.kind === 'carddock' || m.kind === 'desk';

// ───────────── rooms ─────────────

export function roomPoly(r: Room['rect']): G2[] {
  return roundGrid(gridRect(r.x + 0.06, r.y + 0.06, r.x + r.w - 0.06, r.y + r.h - 0.06), Math.min(0.9, r.w / 2.4, r.h / 2.4), 8);
}

export function roomHeading(kind: Room['kind'], l: Room['l'] | null, r: Room['r'] | null, L: Labels, rel?: Room['rel'], q?: Fact): { tag: string; math: string } {
  const exportsWord = `<tspan font-family="${FONT.ui}" font-size="10" font-weight="600" letter-spacing=".1em" dx="10" fill-opacity=".72">EXPORTS </tspan>`;
  if (kind === 'assume') {
    if (!l || !r) return { tag: 'ASSUME', math: `<tspan font-style="italic" fill-opacity=".6">choose P</tspan>` };
    const P0: Pallet = rel === 'neq' ? { k: 'neq', l, r } : { k: 'eq', l, r };
    const Q = q ? factSVG(q, L) : `<tspan font-style="italic" fill-opacity=".55">Q</tspan>`;
    return { tag: 'ASSUME', math: `${factSVG(P0, L)}${exportsWord}${factSVG(P0, L)}<tspan> ⇒ </tspan>${Q}` };
  }
  if (!l || !r) return { tag: kind === 'classical' ? 'SUPPOSE NOT' : 'SUPPOSE', math: `<tspan font-style="italic" fill-opacity=".6">choose l and r</tspan>` };
  const assumed: Pallet = kind === 'suppose' ? { k: 'eq', l, r } : { k: 'neq', l, r };
  const exported: Pallet = kind === 'suppose' ? { k: 'neq', l, r } : { k: 'eq', l, r };
  return {
    tag: kind === 'classical' ? 'SUPPOSE NOT' : 'SUPPOSE',
    math: `${factSVG(assumed, L)}<tspan font-family="${FONT.ui}" font-size="10" font-weight="600" letter-spacing=".1em" dx="10" fill-opacity=".72">EXPORTS </tspan>${factSVG(exported, L)}`,
  };
}

export function roomSVG(room: { id: string; kind: Room['kind']; rel?: Room['rel']; l: Room['l'] | null; r: Room['r'] | null; rect: Room['rect'] }, L: Labels, ghost = false, q?: Fact): string {
  const poly = roomPoly(room.rect).map(([x, y]) => P(x, y));
  const { tag, math } = roomHeading(room.kind, room.l, room.r, L, room.rel, q);
  const a = P(room.rect.x, room.rect.y + room.rect.h * 0.5);
  const ax = a[0] - 16, ay = a[1] - 30;
  return `<g class="fl-room${ghost ? ' is-ghost' : ''}${room.kind === 'assume' ? ' is-assume' : ''}" data-r="${esc(room.id)}">` +
    `<polygon class="fl-room-fill" points="${pts(poly)}" fill="${VIOLET}" opacity="${ghost ? 0.12 : 0.085}"/>` +
    `<polygon class="fl-room-edge" points="${pts(poly)}" fill="none" stroke="${VIOLET}" stroke-width="${room.kind === 'assume' ? 2.2 : 1.4}"${ghost ? ' stroke-dasharray="5 4"' : room.kind === 'assume' ? ' stroke-dasharray="0.5 6.5" stroke-linecap="round"' : ''}/>` +
    `<g class="fl-room-head fl-rhead-out" data-rhead="${esc(room.id)}"><g class="fl-sz fl-sz-f" style="transform-origin:${f1(ax)}px ${f1(ay + 10)}px"><text x="${f1(ax)}" y="${f1(ay - 4)}" text-anchor="end" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${VIOLET}">${tag}</text>` +
    `<text x="${f1(ax)}" y="${f1(ay + 15)}" text-anchor="end" font-family="${FONT.math}" font-size="17" fill="${VIOLET}">${math}</text></g></g>` +
    // inside variant (used when the outside heading would clip the floor's edge): centred under the top corner
    // inside variant, positioned by the floor (clear of machines, on-screen) when the outside one would clip
    `<g class="fl-room-head fl-rhead-in" data-rhead="${esc(room.id)}"><g class="fl-sz fl-sz-f" style="transform-origin:0px 0px"><text x="0" y="-8" text-anchor="middle" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${VIOLET}">${tag}</text>` +
      `<text x="0" y="11" text-anchor="middle" font-family="${FONT.math}" font-size="17" fill="${VIOLET}">${math}</text></g></g></g>`;
}

export function roomHandles(r: Room['rect'], id: string): string {
  const H: [string, number, number][] = [
    ['nw', r.x, r.y], ['ne', r.x + r.w, r.y], ['se', r.x + r.w, r.y + r.h], ['sw', r.x, r.y + r.h],
    ['n', r.x + r.w / 2, r.y], ['e', r.x + r.w, r.y + r.h / 2], ['s', r.x + r.w / 2, r.y + r.h], ['w', r.x, r.y + r.h / 2],
  ];
  return H.map(([h, gx, gy]) => { const p = P(gx, gy); return `<g class="fl-rh" data-rh="${esc(id)}|${h}"><circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="12" fill="transparent"/><circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${h.length === 2 ? 5.2 : 4.2}" fill="#fff" stroke="${VIOLET}" stroke-width="1.8"/></g>`; }).join('');
}

// ───────────── belts ─────────────

const FACT = new Set(['eq', 'neq', 'bot', 'size']);
export function beltBody(bg: Pick<BGeo, 'kind' | 'fam' | 'line'>, opts: { ghost?: boolean; bad?: boolean; id?: string } = {}): string {
  const line = roundOpen(bg.line, 0.42);
  if (line.length < 2) return '';
  const ink = famInk(bg.fam), op = opts.ghost ? 0.45 : railOpacity(bg.fam);
  const card = bg.kind === 'law' || bg.kind === 'cond';
  const term = bg.kind === 'term';
  const uw = card ? 0.36 : term ? 0.44 : 0.62;
  let o = `<path class="fl-b-under" d="${band(line, 0, uw)}" fill="${INK.navy}" opacity="${opts.ghost ? 0.05 : 0.06}"/>`;
  if (FACT.has(bg.kind)) {
    o += `<path d="${band(line, -0.19, 0.105)}" fill="${ink}" opacity="${op}" class="mul"/><path d="${band(line, 0.19, 0.105)}" fill="${ink}" opacity="${op}" class="mul"/>`;
  } else if (term) {
    o += `<path d="${band(line, 0, 0.13)}" fill="${ink}" opacity="${op}" class="mul"/>`;
  } else {
    o += `<path d="${band(line, -0.13, 0.035)}" fill="${ink}" opacity="${op + 0.2}"/><path d="${band(line, 0.13, 0.035)}" fill="${ink}" opacity="${op + 0.2}"/>`;
    o += `<path d="${polyD(line)}" fill="none" stroke="${ink}" stroke-width="6" stroke-dasharray="2.5 7" opacity="${op}"/>`;
  }
  // flow chevrons at tile centres (between the rails)
  let ch = '';
  for (let i = 1; i < bg.line.length - 1; i++) {
    const a = bg.line[i - 1]!, b = bg.line[i + 1]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    ch += groundChevron(bg.line[i]!, [dx / l, dy / l], 0.075);
  }
  if (ch) o += `<path d="${ch}" fill="none" stroke="${INK.navy}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="${opts.ghost ? 0.3 : 0.26}"/>`;
  if (opts.bad) o += `<path d="${polyD(line)}" fill="none" stroke="${JAM}" stroke-width="1.6" stroke-dasharray="4 4" opacity=".8"/>`;
  return o;
}

export function beltSVG(bg: BGeo, comp: Compiled | null): string {
  const bad = !!comp?.beltErrors[bg.b.id] || !bg.ok;
  const line = roundOpen(bg.line, 0.42);
  const hit = `<path class="fl-hit" data-b="${esc(bg.b.id)}" d="${polyD(line)}" fill="none" stroke="transparent" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (bg.broken) {
    // kept, never silently dropped: a dashed red ghost of the connection; hover names the blocker
    const ln = line.length >= 2 ? line : bg.line;
    return `<g class="fl-b is-broken" data-b="${esc(bg.b.id)}"><path class="fl-b-sel" d="${band(ln, 0, 0.82)}" fill="${JAM}"/>` +
      `<path d="${band(ln, 0, 0.5)}" fill="${JAM}" opacity=".06"/>` +
      `<path d="${polyD(ln)}" fill="none" stroke="${JAM}" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round" opacity=".85"/>${hit}</g>`;
  }
  if (bg.direct) {
    // touching ports: a short coupling collar
    return `<g class="fl-b is-direct" data-b="${esc(bg.b.id)}"><path class="fl-b-sel" d="${band(line, 0, 0.82)}" fill="${INK.navy}"/>${beltBody(bg, { bad })}` +
      `<path d="${band(line, 0, 0.58)}" fill="none" stroke="${INK.navy}" stroke-width="1.3" opacity=".55"/>${hit}</g>`;
  }
  return `<g class="fl-b${bg.open ? ' is-open' : ''}" data-b="${esc(bg.b.id)}"><path class="fl-b-sel" d="${band(line, 0, 0.82)}" fill="${INK.navy}"/>${beltBody(bg, { bad })}${hit}${bg.open ? openEndSVG(bg) : ''}</g>`;
}

/** The end of an OPEN belt: a buffer-stop where items wait, and a handle to drag the belt on. */
export function openEndSVG(bg: Pick<BGeo, 'line' | 'b'>): string {
  const ln = bg.line;
  if (ln.length < 2) return '';
  const z = ln[ln.length - 1]!, a = ln[ln.length - 2]!;
  const dx = z[0] - a[0], dy = z[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const u: G2 = [dx / l, dy / l], n: G2 = [-u[1], u[0]];
  const p1 = P(z[0] + n[0] * 0.36, z[1] + n[1] * 0.36), p2 = P(z[0] - n[0] * 0.36, z[1] - n[1] * 0.36);
  const c = P(z[0], z[1]);
  return `<g class="fl-bend" data-bend="${esc(bg.b.id)}">` +
    `<line x1="${f1(p1[0])}" y1="${f1(p1[1])}" x2="${f1(p2[0])}" y2="${f1(p2[1])}" stroke="${INK.navy}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<circle class="fl-bend-knob" cx="${f1(c[0])}" cy="${f1(c[1])}" r="4.2" fill="#fff" stroke="${INK.navy}" stroke-width="1.6"/>` +
    `<circle class="fl-hit" data-bend="${esc(bg.b.id)}" cx="${f1(c[0])}" cy="${f1(c[1])}" r="14" fill="transparent"/></g>`;
}

/** A small overpass where a belt crosses another network at right angles. */
export function bridgeSVG(c: Crossing, geo: Geo): string {
  const bg = geo.bs.get(c.over); if (!bg) return '';
  const m: G2 = [c.t.x + 0.5, c.t.y + 0.5], d = c.dir;
  const seg: G2[] = [[m[0] - d[0] * 0.6, m[1] - d[1] * 0.6], m, [m[0] + d[0] * 0.6, m[1] + d[1] * 0.6]];
  return `<g class="fl-bridge" data-b="${esc(c.over)}"><path d="${band(seg, 0, 0.8)}" fill="#fff"/>` +
    `<path d="${band(seg, -0.4, 0.05)}" fill="${INK.navy}" opacity=".45"/><path d="${band(seg, 0.4, 0.05)}" fill="${INK.navy}" opacity=".45"/>` +
    beltBody({ kind: bg.kind, fam: bg.fam, line: seg }) + `</g>`;
}

// ───────────── ports ─────────────

export function portSVG(pg: PortGeo, g: MGeo): string {
  const p = pg.port;
  const d = faceVec(p.face);
  const ink = p.role === 'rule' ? famInk(g.fam === 'lemma' ? 'given' : g.fam) : INK.navy;
  let o = `<g class="fl-p fl-p-${p.dir}${pg.taken ? ' is-taken' : ''}" data-p="${esc(g.m.id)}|${esc(p.id)}">`;
  if (p.dir === 'out') {
    const c: G2 = [pg.edge[0] + d[0] * 0.14, pg.edge[1] + d[1] * 0.14];
    o += `<path d="${groundArrow(c, d, 0.24, 0.14)}" fill="${pg.taken ? INK.navy : '#fff'}" stroke="${INK.navy}" stroke-width="1.2" stroke-linejoin="round" opacity="${pg.taken ? 0.7 : 0.85}"/>`;
  } else {
    const c: G2 = [pg.edge[0] + d[0] * 0.13, pg.edge[1] + d[1] * 0.13];
    const inward: G2 = [-d[0], -d[1]];
    o += `<path d="${groundArrow(c, inward, 0.22, 0.13)}" fill="${pg.taken ? INK.navy : ink}" opacity="${pg.taken ? 0.6 : 0.75}"/>`;
    if (!pg.taken) {
      const s = P(pg.out[0], pg.out[1]);
      o += `<g class="fl-ghost-kind">${kindGhost(pg.kind, s[0], s[1] - 2, p.role === 'rule' ? ink : INK.navy3, p.role)}</g>`;
    }
  }
  const h = P(pg.edge[0] + d[0] * 0.3, pg.edge[1] + d[1] * 0.3);
  o += `<circle class="fl-hit" data-p="${esc(g.m.id)}|${esc(p.id)}" cx="${f1(h[0])}" cy="${f1(h[1])}" r="12" fill="transparent"/>`;
  return o + `</g>`;
}

// ───────────── machines ─────────────

/** Words of a plate title, uppercase; a trailing ᵒᵖ becomes the word OP. */
const plateWords = (name: string) => name.replace(/\s*ᵒᵖ\s*/g, ' OP ').trim().toUpperCase().split(/\s+/).filter(Boolean);

/** Split words into k contiguous lines, as even in length as possible. */
function splitLines(words: string[], k: number): string[] {
  if (k <= 1 || words.length <= 1) return [words.join(' ')];
  let best: string[] = [words.join(' ')], bd = Infinity;
  const go = (from: number, left: number, acc: string[]) => {
    if (left === 1) {
      const ls = [...acc, words.slice(from).join(' ')];
      const d = Math.max(...ls.map((l) => l.length));
      if (d < bd) { bd = d; best = ls; }
      return;
    }
    for (let cut = from + 1; cut <= words.length - left + 1; cut++) go(cut, left - 1, [...acc, words.slice(from, cut).join(' ')]);
  };
  go(0, Math.min(k, words.length), []);
  return best;
}

/** Estimated width of an uppercase plate line in Space Grotesk 600 with .08em tracking. */
const plateTextW = (ln: string, fs: number) => [...ln].reduce((w, ch) => w + (ch === ' ' ? 0.32 : ch === 'I' ? 0.36 : /[MW]/.test(ch) ? 0.92 : 0.7), 0) * fs + ln.length * 0.08 * fs;

/** Horizontal chord (min x, max x) of a convex screen polygon at height y, or null. */
function chordAt(poly: [number, number][], y: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return lo <= hi ? [lo, hi] : null;
}

/**
 * A plate title fitted to the top face: 1–3 balanced lines at the largest size (≤ 9.4px, ≥ 6px) whose every line
 * sits inside the face's horizontal chord at its height. A line stays centred when it can and otherwise slides along
 * the face's slant (so a long name follows the iso face instead of running off it). Fewer lines win a tie.
 */
export function fitPlate(name: string, face: [number, number][], cx: number, cy: number, tag: boolean): { lines: string[]; xs: number[]; fs: number; y0: number } {
  const words = plateWords(name);
  const lift = tag ? -4 : 0; // an IMPORTED line goes under the title
  const place = (yMid: number, w: number): number | null => {
    const ch = chordAt(face, yMid);
    if (!ch || ch[1] - ch[0] - 4 < w) return null;
    return Math.min(Math.max(cx, ch[0] + 2 + w / 2), ch[1] - 2 - w / 2);
  };
  let best: { lines: string[]; xs: number[]; fs: number; y0: number } | null = null;
  for (let k = 1; k <= Math.min(3, Math.max(1, words.length)); k++) {
    const lines = splitLines(words, k);
    for (let fs = 9.4; fs >= 6; fs -= 0.2) {
      const lead = fs + 2;
      const y0 = cy + 3.5 + lift - ((lines.length - 1) / 2) * lead;
      const xs = lines.map((ln, i) => place(y0 + i * lead - fs * 0.36, plateTextW(ln, fs)));
      const tagOk = !tag || place(y0 + lines.length * lead - 3.5, plateTextW('IMPORTED', 6.8) * 1.4) !== null;
      if (xs.every((x) => x !== null) && tagOk) {
        if (!best || fs > best.fs + 0.01) best = { lines, xs: xs as number[], fs, y0 };
        break;
      }
    }
  }
  if (best) return best;
  const lines = splitLines(words, 2);
  return { lines, xs: lines.map(() => cx), fs: 6, y0: cy + 3.5 + lift - ((lines.length - 1) / 2) * 8 };
}

export interface Ctx { L: Labels; level: LevelManifest; comp: Compiled | null; schemaName: (id: string, mirror: boolean) => string }

export function machineName(g: MGeo, cx: Ctx): string {
  const m = g.m;
  if (m.config.kind === 'given') return cx.level.givens.find((x) => x.id === (m.config as { givenId: string }).givenId)?.name ?? 'Given';
  if (m.config.kind === 'tower') return `Tower ${m.config.label}`;
  if (g.look.plate && g.look.title) return `${g.spec.name} · ${g.look.title}`;
  if (g.look.neutral) return `${g.spec.name} (no recipe yet)`;
  return `${g.spec.name} · ${g.look.label.toLowerCase()}${g.look.name ? ` ${g.look.name}` : ''}`;
}

/** A floor label: the role word(s) in uppercase UI type, then any maths name in its real case (italic maths). */
export function labelSVG(look: Pick<Look, 'label' | 'name'>, size: number): string {
  return esc(look.label.toUpperCase()) +
    (look.name ? `<tspan font-family="${FONT.math}" font-weight="400" letter-spacing="0" font-size="${f1(size * 1.3)}" dx="${f1(size * 0.4)}">${glyphSVG(look.name)}</tspan>` : '');
}

function givenFact(m: Machine, lv: LevelManifest): Fact | undefined {
  return m.config.kind === 'given' ? lv.givens.find((x) => x.id === (m.config as { givenId: string }).givenId)?.fact : undefined;
}

export function machineSVG(g: MGeo, cx: Ctx, varLabels?: Map<string, string>): string {
  const m = g.m;
  if (m.kind === 'socket') return socketSVG(g, cx, false);
  if (m.kind === 'tower') return towerSVG(g, varLabels);
  const h = heightOf(m);
  const L = g.look;
  const B = box(g.x0, g.y0, g.x1, g.y1, h, 0.09, 0.2, L.sheet ? 0.3 : 0);
  const plate = !!L.plate;
  const c = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, h);
  let o = `<g class="fl-m${m.locked ? ' is-locked' : ''}${L.neutral ? ' is-neutral' : ''}" data-m="${esc(m.id)}" data-machine="${esc(m.id)}" data-kind="${m.kind}">`;
  o += `<path class="fl-m-mark" d="${groundRect(g.x0 - 0.1, g.y0 - 0.1, g.x1 + 0.1, g.y1 + 0.1, 0, 0.3)}"/>`;
  o += `<path class="fl-m-shadow mul" d="${B.shadow}" fill="${plate ? INK.navy : L.ink}" opacity="${plate ? 0.14 : L.neutral ? 0.1 : 0.2}"/>`;
  o += `<g class="fl-body">`;
  if (plate) o += `<path d="${B.hull}" fill="${INK.navy}"/><path d="${B.band}" fill="${L.plate === 'hatch' ? 'url(#fl-hatch)' : INK.gold}"/><path d="${B.upper}" fill="${INK.navy}"/>`;
  else o += `<path d="${B.hull}" fill="${L.hull}"/>`;
  o += `<g class="fl-top"><path d="${B.top}" fill="${L.ink}"/><path class="fl-inset" d="${B.inset}" fill="#fff" opacity="${plate ? 0.07 : L.neutral ? 0.5 : isSource(m) ? 0.26 : 0.16}"/>`;
  if (L.sheet) {
    // the Given Inlet's folded sheet: a white fold triangle in the chamfered east corner
    const X1 = g.x1 - 0.09, Y0 = g.y0 + 0.09, k = 0.3;
    const a = P(X1 - k, Y0, h), b = P(X1, Y0 + k, h), f = P(X1 - k, Y0 + k, h);
    o += `<path class="fl-fold" d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}L${f1(f[0])},${f1(f[1])}Z" fill="#fff" opacity=".62" stroke="${L.hull}" stroke-width=".9" stroke-linejoin="round"/>`;
  } else if (isSource(m) && !plate) {
    const el = isoEllipse(Math.min(g.x1 - g.x0, g.y1 - g.y0) * 0.24);
    o += `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(el.rx)}" ry="${f1(el.ry)}" fill="#fff" opacity=".4"/>`;
  }
  if (plate) {
    // the title fits the top face (inset by the rounded rim): wrapped to 1–3 lines and shrunk only as needed
    const m = 0.12;
    const face = [[g.x0 + m, g.y0 + m], [g.x1 - m, g.y0 + m], [g.x1 - m, g.y1 - m], [g.x0 + m, g.y1 - m]].map(([x, y]) => P(x!, y!, h) as [number, number]);
    const { lines, xs, fs, y0 } = fitPlate(L.title ?? '', face, c[0], c[1], !!L.tag);
    const halo = `paint-order="stroke" stroke="${INK.navy}" stroke-width="3" stroke-linejoin="round"`;
    lines.forEach((ln, i) => {
      o += `<text x="${f1(xs[i]!)}" y="${f1(y0 + i * (fs + 2))}" text-anchor="middle" font-family="${FONT.ui}" font-weight="600" font-size="${f1(fs)}" letter-spacing=".08em" fill="#fff" ${halo}>${esc(ln.replace(/ OP$/, ''))}${/ OP$/.test(ln) ? `<tspan font-size="7.5" baseline-shift="35%" fill="${INK.gold}"> OP</tspan>` : ''}</text>`;
    });
    // provenance printed on the plate itself (no external tag to collide with neighbours)
    if (L.tag) o += `<text x="${f1(c[0])}" y="${f1(y0 + lines.length * (fs + 2) - 1)}" text-anchor="middle" font-family="${FONT.ui}" font-weight="600" font-size="6.8" letter-spacing=".14em" fill="${INK.gold}" ${halo}>${esc(L.tag)}</text>`;
  } else if (L.glyph === '⥲') {
    o += isoArrowSVG(c, L.on);
  } else if (L.glyph === '∵') {
    // because (∵): Latin Modern draws it tiny, so the three dots are drawn at glyph size (two above, one below)
    o += `<g class="fl-because" fill="${L.on}"><circle cx="${f1(c[0] - 5.6)}" cy="${f1(c[1] - 3.2)}" r="2.3"/><circle cx="${f1(c[0] + 5.6)}" cy="${f1(c[1] - 3.2)}" r="2.3"/><circle cx="${f1(c[0])}" cy="${f1(c[1] + 4.4)}" r="2.3"/></g>`;
  } else {
    const glyph = L.glyph;
    o += `<text x="${f1(c[0])}" y="${f1(c[1] + 6)}" text-anchor="middle" font-family="${FONT.math}" font-size="${glyph.length > 3 ? 14.5 : glyph.length > 2 ? 16 : 19}" fill="${L.on}"${L.neutral && glyph === '?' ? ' font-weight="700"' : ''}>${glyphSVG(glyph)}</text>`;
  }
  if (L.dir) {
    // a persistent direction mark on the chassis: forward → / reversed ←, readable with every lens closed
    const k = P(g.x1 - 0.14, g.y0 + 0.14, h);
    const rev = L.dir === 'rev';
    o += `<g class="fl-dir${rev ? ' is-rev' : ''}"><rect x="${f1(k[0] - 9)}" y="${f1(k[1] - 6.5)}" width="18" height="13" rx="6.5" fill="${rev ? INK.gold : '#fff'}" stroke="${INK.navy}" stroke-width="1"/>` +
      `<text x="${f1(k[0])}" y="${f1(k[1] + 3.6)}" text-anchor="middle" font-family="${FONT.ui}" font-size="10.5" font-weight="700" fill="${INK.navy}">${rev ? '←' : '→'}</text></g>`;
  }
  o += `</g></g></g>`;
  return o;
}

/**
 * The Rewriter's glyph ⥲ (isomorphism arrow) drawn on a top face: a light tilde (stroke 1.05) over →, since
 * Latin Modern has no ⥲. `c` is the screen centre of the top face.
 */
export function isoArrowSVG(c: readonly [number, number], ink: string): string {
  return `<g class="fl-iso"><text x="${f1(c[0])}" y="${f1(c[1] + 8)}" text-anchor="middle" font-family="${FONT.math}" font-size="20" fill="${ink}">→</text>` +
    `<path d="M${f1(c[0] - 7.5)},${f1(c[1] - 3)}q3.75,-4.5 7.5,0t7.5,0" fill="none" stroke="${ink}" stroke-width="1.05" stroke-linecap="round"/></g>`;
}

/** Screen position of a Tower's bulb centre (radio waves start here). */
export function towerBulb(g: Pick<MGeo, 'x0' | 'y0'>): [number, number] {
  const b = P(g.x0 + 0.3, g.y0 + 0.3, heightOf({ kind: 'tower' } as Machine));
  return [b[0], b[1] - 3 - 11 - 5 + 1.5];
}

/**
 * A Tower (review 2026-10): a standard 1×1 box, 0.55 high, in its sort's colour (ring ink for ∈G violet or ∈ℤ teal,
 * hull shaded 0.3), with the glyph x∈G / n∈ℤ. A transmitter stands on the back corner: a collar, a mast and a bulb
 * coloured like the machine (hull below, ink on top, split by a flat ellipse — no glow, no gradient). Broadcast
 * rings live in the floor's radio layer and start at the bulb (towerBulb).
 */
export function towerSVG(g: MGeo, varLabels?: Map<string, string>): string {
  void varLabels;
  const m = g.m;
  const L = g.look;
  const label = m.config.kind === 'tower' ? m.config.label : '?';
  const isZ = L.tower === 'Z' || (m.config.kind === 'tower' && m.config.sort === 'Z');
  const h = heightOf(m);
  const B = box(g.x0, g.y0, g.x1, g.y1, h);
  let o = `<g class="fl-m fl-tower" data-m="${esc(m.id)}" data-machine="${esc(m.id)}" data-kind="tower">`;
  o += `<path class="fl-m-mark" d="${groundRect(g.x0 - 0.1, g.y0 - 0.1, g.x1 + 0.1, g.y1 + 0.1, 0, 0.3)}"/>`;
  o += `<path class="fl-m-shadow mul" d="${B.shadow}" fill="${L.ink}" opacity=".2"/>`;
  o += `<g class="fl-body"><path d="${B.hull}" fill="${L.hull}"/>`;
  o += `<g class="fl-top"><path d="${B.top}" fill="${L.ink}"/><path class="fl-inset" d="${B.inset}" fill="#fff" opacity=".16"/>`;
  const gp = P((g.x0 + g.x1) / 2 + 0.1, (g.y0 + g.y1) / 2 + 0.1, h);
  o += `<text x="${f1(gp[0] + 2)}" y="${f1(gp[1] + 7)}" text-anchor="middle" font-family="${FONT.math}" font-size="${label.length > 2 ? 14 : 17}" fill="${L.on}">${varSVG(label)}<tspan font-size="72%" dx="1.5">∈${isZ ? 'ℤ' : '<tspan font-style="italic">G</tspan>'}</tspan></text>`;
  o += `</g>`;
  // transmitter on the back corner: collar and mast as small cylinders standing on the top face, then the bulb
  const bp = P(g.x0 + 0.3, g.y0 + 0.3, h), bx = bp[0], by = bp[1];
  const cr = isoEllipse(0.08), mh = 11, br = 5, bc = towerBulb(g)[1];
  const cyl = (x: number, y: number, rx: number, ry: number, hg: number, side: string, top: string) =>
    `<path d="M${f1(x - rx)},${f1(y)}A${f1(rx)},${f1(ry)} 0 0 0 ${f1(x + rx)},${f1(y)}L${f1(x + rx)},${f1(y - hg)}A${f1(rx)},${f1(ry)} 0 0 1 ${f1(x - rx)},${f1(y - hg)}Z" fill="${side}"/><ellipse cx="${f1(x)}" cy="${f1(y - hg)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${top}"/>`;
  o += `<g class="fl-mast"><ellipse cx="${f1(bx + 4)}" cy="${f1(by + 1.5)}" rx="${f1(cr.rx * 1.7)}" ry="${f1(cr.ry * 1.7)}" fill="${INK.navy}" opacity=".2"/>` +
    cyl(bx, by, cr.rx * 1.35, cr.ry * 1.35, 3, shade(L.ink, 0.38), shade(L.ink, 0.12)) +
    cyl(bx, by - 3, 1.7, 0.85, mh, 'url(#fl-mast)', '#3A4366') + `</g>`;
  o += `<g class="fl-dish"><circle cx="${f1(bx)}" cy="${f1(bc)}" r="${br}" fill="${L.hull}"/>` +
    `<path d="M${f1(bx - br)},${f1(bc)}A${br},${br} 0 0 1 ${f1(bx + br)},${f1(bc)}A${br},${f1(br * 0.5)} 0 0 1 ${f1(bx - br)},${f1(bc)}Z" fill="${L.ink}"/></g>`;
  o += `</g></g>`;
  return o;
}

/** A variable label with a REAL subscript (x₁ → x<sub>1</sub>), italic letter. */
export function varSVG(label: string): string {
  const m = /^(.*?)([₀-₉0-9]+)$/.exec(label);
  if (!m) return `<tspan font-style="italic">${esc(label)}</tspan>`;
  const digits = m[2]!.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
  return `<tspan font-style="italic">${esc(m[1]!)}</tspan><tspan font-size="68%" baseline-shift="-24%">${digits}</tspan>`;
}

/** Short upright label below the front corner (and given formulas to the west). */
export function machineLabelSVG(g: MGeo, cx: Ctx): string {
  const m = g.m;
  if (m.kind === 'socket') return '';
  if (m.kind === 'given') {
    const f = givenFact(m, cx.level);
    if (!f) return '';
    const a = P(g.x0, (g.y0 + g.y1) / 2);
    return `<g class="fl-lab"><g class="fl-sz fl-sz-f" style="transform-origin:${f1(a[0] - 12)}px ${f1(a[1] - 4)}px"><text x="${f1(a[0] - 12)}" y="${f1(a[1] + 1)}" text-anchor="end" font-family="${FONT.math}" font-size="16.5" fill="${INK.navy}">${factSVG(f, cx.L)}</text>` +
      `<text class="fl-name" x="${f1(a[0] - 12)}" y="${f1(a[1] - 16)}" text-anchor="end" font-family="${FONT.ui}" font-size="9" font-weight="600" letter-spacing=".12em" fill="${FAMILY.given.text}">${labelSVG(g.look, 9)}</text></g></g>`;
  }
  // configured sources say what they emit, beside the tile, exactly like given inlets
  if (m.kind === 'spool' || m.kind === 'hopper' || m.kind === 'carddock') {
    const v = cx.comp?.machines[m.id]?.out;
    if (v) {
      const math = v.k === 'term' ? termSVG(v.term, cx.L) : v.k === 'fact' ? factSVG(v.fact, cx.L) : factSVG(v.card, cx.L);
      const a = P(g.x0, (g.y0 + g.y1) / 2);
      const tagInk = g.fam === 'lemma' ? INK.navy2 : famText(g.fam);
      const tag = m.kind === 'carddock' ? 'CARD' : m.kind === 'hopper' ? 'TERM' : 'SPOOL';
      return `<g class="fl-lab"><g class="fl-sz fl-sz-f" style="transform-origin:${f1(a[0] - 12)}px ${f1(a[1] - 4)}px"><text x="${f1(a[0] - 12)}" y="${f1(a[1] + 1)}" text-anchor="end" font-family="${FONT.math}" font-size="16.5" fill="${INK.navy}">${math}</text>` +
        `<text class="fl-name" x="${f1(a[0] - 12)}" y="${f1(a[1] - 16)}" text-anchor="end" font-family="${FONT.ui}" font-size="9" font-weight="600" letter-spacing=".12em" fill="${tagInk}">${tag}</text></g></g>`;
    }
  }
  if (m.kind === 'tower') return '';
  if (g.look.plate) return '';
  const a = P((g.x0 + g.x1) / 2, g.y1);
  return `<g class="fl-lab fl-sz fl-sz-n" style="transform-origin:${f1(a[0] - 6)}px ${f1(a[1] + 4)}px"><text x="${f1(a[0] - 6)}" y="${f1(a[1] + 12)}" text-anchor="middle" font-family="${FONT.ui}" font-size="8.6" font-weight="600" letter-spacing=".12em" fill="${g.look.neutral ? INK.navy2 : famText(g.fam)}">${labelSVG(g.look, 8.6)}</text></g>`;
}

// ───────────── sockets ─────────────

export function socketTarget(m: Machine, lv: LevelManifest): Pallet | Card | undefined {
  return m.config.kind === 'socket' ? lv.sockets.find((s) => s.id === (m.config as { socketId: string }).socketId)?.target : undefined;
}

const sockSize = (g: MGeo) => Math.sqrt((g.x1 - g.x0) * (g.y1 - g.y0)); // 1×1 → 1, 2×1 → 1.41, 2×2 → 2
/**
 * The Receiving Dock (review 2026-10): a flat navy 2×2 proof-box slab (∎) with a white ring port in its centre.
 * Empty: a dashed inner ring. Delivered (.is-sealed): a navy ∎ in the ring. Its four inlets sit in a pinwheel.
 */
export function socketSVG(g: MGeo, cx: Ctx, filled: boolean): string {
  void cx;
  const h = heightOf(g.m);
  const c = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, h);
  const S = box(g.x0, g.y0, g.x1, g.y1, h, 0.1, 0.12);
  const o1 = isoEllipse(0.42), o2 = isoEllipse(0.27);
  return `<g class="fl-m fl-sock${filled ? ' is-sealed' : ''}" data-m="${esc(g.m.id)}" data-machine="${esc(g.m.id)}" data-kind="socket">` +
    `<path class="fl-m-mark" d="${groundRect(g.x0 - 0.1, g.y0 - 0.1, g.x1 + 0.1, g.y1 + 0.1, 0, 0.3)}"/>` +
    `<path class="fl-m-shadow mul" d="${S.shadow}" fill="${INK.navy}" opacity=".12"/>` +
    `<g class="fl-body"><path d="${S.hull}" fill="${INK.hullDark}"/><path d="${S.top}" fill="${INK.navy}"/>` +
    `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(o1.rx)}" ry="${f1(o1.ry)}" fill="#fff"/>` +
    `<ellipse class="fl-sock-dash" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(o2.rx)}" ry="${f1(o2.ry)}" fill="none" stroke="${INK.navy}" stroke-width="1.2" stroke-dasharray="2 3"/>` +
    `<g class="fl-seal" style="transform-origin:${f1(c[0])}px ${f1(c[1])}px"><rect x="${f1(c[0] - 6.5)}" y="${f1(c[1] - 8)}" width="13" height="16" fill="${INK.navy}"/></g>` +
    `<ellipse class="fl-ripple" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(o1.rx)}" ry="${f1(o1.ry)}" fill="none" stroke="${INK.navy}" stroke-width="2" style="transform-origin:${f1(c[0])}px ${f1(c[1])}px"/>` +
    `</g></g>`;
}

export function socketLabelSVG(g: MGeo, cx: Ctx, filled: boolean): string {
  const t = socketTarget(g.m, cx.level);
  const c = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2);
  const lx = Math.max(c[0] + isoEllipse(0.44 * sockSize(g) + 0.12).rx + 10, P(g.x1, g.y0)[0] + 6);
  return `<g class="fl-lab fl-socklab" data-sock="${esc(g.m.id)}"><g class="fl-sz fl-sz-f" style="transform-origin:${f1(lx)}px ${f1(c[1])}px"><text class="fl-socktag" x="${f1(lx)}" y="${f1(c[1] - 7)}" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${INK.navy}">${filled ? 'DELIVERED' : 'DELIVER'}</text>` +
    (t ? `<text x="${f1(lx)}" y="${f1(c[1] + 14)}" font-family="${FONT.math}" font-size="19" fill="${INK.navy}">${factSVG(t, cx.L)}</text>` : '') + `</g></g>`;
}

// ───────────── status pips ─────────────

export function pipAnchor(g: MGeo): [number, number] {
  const p = P(g.x1 - 0.12, g.y0 + 0.12, heightOf(g.m));
  return [p[0] + 2, p[1] - 11];
}

export function pipSVG(g: MGeo, st: LiveStatus | 'jammed' | 'starved' | undefined): string {
  if (!st || g.m.kind === 'socket' || g.m.kind === 'tower' || st === 'idle' || st === 'sealed') return '';
  const [x, y] = pipAnchor(g);
  const ink = famInk(g.fam === 'lemma' ? 'equation' : g.fam);
  let o = `<g class="fl-pip fl-pip-${st}" data-pip="${esc(g.m.id)}" transform="translate(${f1(x)},${f1(y)})">`;
  switch (st) {
    case 'working': o += `<circle class="fl-pulse" r="6" fill="none" stroke="${ink}" stroke-width="1.4"/><circle r="3.3" fill="${ink}"/><circle r="3.3" fill="none" stroke="${INK.navy}" stroke-width=".8" opacity=".35"/>`; break;
    case 'starved': o += `<circle r="4" fill="#fff" stroke="${INK.navy2}" stroke-width="1.5"/>`; break;
    case 'jammed': o += `<rect x="-9" y="-6" width="18" height="12" rx="2.5" fill="url(#fl-jam)" stroke="${JAM}" stroke-width="1"/><path d="M-3,-2.6L3,2.6M3,-2.6L-3,2.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`; break;
    case 'blocked': o += `<rect x="-6" y="-6" width="12" height="12" rx="3" fill="#fff" stroke="${INK.navy2}" stroke-width="1"/><rect x="-3.2" y="-3.4" width="2.2" height="6.8" rx=".6" fill="${INK.navy}"/><rect x="1" y="-3.4" width="2.2" height="6.8" rx=".6" fill="${INK.navy}"/>`; break;
  }
  return o + `</g>`;
}

export function liveStatusOf(id: string, run: RunState | null, comp: Compiled | null): LiveStatus | undefined {
  const st = comp?.machines[id]?.status;
  if (st?.k === 'jammed') return 'jammed';
  const l = run?.live[id];
  if (l) return l;
  if (st?.k === 'starved') return 'starved';
  return undefined;
}

export const isFactKind = (k: string) => FACT.has(k);
