// LEMMA WORKS v3 floor — the static scene for one epoch (rooms, belts, ports,
// machines, sockets, labels) as SVG strings. Hover/selection/status are toggled
// by class afterwards, so this only re-runs on edits.
import type { Card, Fact, Pallet } from '../kernel/types';
import type { Compiled, LiveStatus, Machine, Room, RunState } from '../factory/types';
import type { LevelManifest } from '../kernel/types';
import { FAMILY, FONT, INK } from '../ui/tokens';
import { P, f1, isoEllipse, roundGrid, gridRect, pts, shade, type G2 } from '../board/geom';
import { FORALL_INK } from './look';
import { factSVG, termSVG, type Labels } from './math';
import type { BGeo, Crossing, Geo, MGeo, PortGeo } from './geo';
import { faceVec } from './adapt';
import {
  JAM, ON, VIOLET, band, box, esc, famInk, famText, glyphSVG, groundArrow, groundChevron, groundRect, hullFill, kindGhost,
  polyD, railOpacity, roundOpen,
} from './svg';

export const labelsOf = (lv: LevelManifest): Labels => Object.fromEntries(lv.atoms.map((a) => [a.id, a.label]));

export function heightOf(m: Machine): number {
  switch (m.kind) {
    case 'socket': return 0;
    case 'given': case 'spool': case 'hopper': case 'carddock': return 0.24;
    case 'desk': return 0.26;
    case 'gate': return 0.16;
    case 'theorem': return 0.34;
    case 'forall': return 0.32;
    case 'tower': return 0.1;
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
  return `<g class="fl-b" data-b="${esc(bg.b.id)}"><path class="fl-b-sel" d="${band(line, 0, 0.82)}" fill="${INK.navy}"/>${beltBody(bg, { bad })}${hit}</g>`;
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

/** Plate title in at most two lines, split where the two halves are most even in length. */
function lemmaLines(name: string): string[] {
  const words = name.replace(/\s*ᵒᵖ\s*/g, ' OP ').trim().toUpperCase().split(/\s+/);
  if (words.length < 2) return words;
  let best = 1, bd = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length;
    if (Math.max(a, b) < bd) { bd = Math.max(a, b); best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

export interface Ctx { L: Labels; level: LevelManifest; comp: Compiled | null; schemaName: (id: string, mirror: boolean) => string }

export function machineName(g: MGeo, cx: Ctx): string {
  const m = g.m;
  if (m.config.kind === 'given') return cx.level.givens.find((x) => x.id === (m.config as { givenId: string }).givenId)?.name ?? 'Given';
  if (m.config.kind === 'tower') return `Tower ${m.config.label}`;
  if (g.look.plate && g.look.title) return `${g.spec.name} · ${g.look.title}`;
  if (g.look.neutral) return `${g.spec.name} (no recipe yet)`;
  return `${g.spec.name} · ${g.look.label.toLowerCase()}`;
}

function givenFact(m: Machine, lv: LevelManifest): Fact | undefined {
  return m.config.kind === 'given' ? lv.givens.find((x) => x.id === (m.config as { givenId: string }).givenId)?.fact : undefined;
}

export function machineSVG(g: MGeo, cx: Ctx, varLabels?: Map<string, string>): string {
  const m = g.m;
  if (m.kind === 'socket') return socketSVG(g, cx, false);
  if (m.kind === 'tower') return towerSVG(g, varLabels);
  const h = heightOf(m);
  const B = box(g.x0, g.y0, g.x1, g.y1, h);
  const L = g.look;
  const plate = !!L.plate;
  const c = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, h);
  let o = `<g class="fl-m${m.locked ? ' is-locked' : ''}${L.neutral ? ' is-neutral' : ''}" data-m="${esc(m.id)}" data-machine="${esc(m.id)}" data-kind="${m.kind}">`;
  o += `<path class="fl-m-mark" d="${groundRect(g.x0 - 0.1, g.y0 - 0.1, g.x1 + 0.1, g.y1 + 0.1, 0, 0.3)}"/>`;
  o += `<path class="fl-m-shadow mul" d="${B.shadow}" fill="${plate ? INK.navy : L.ink}" opacity="${plate ? 0.14 : L.neutral ? 0.1 : 0.2}"/>`;
  o += `<g class="fl-body">`;
  if (plate) o += `<path d="${B.hull}" fill="${INK.navy}"/><path d="${B.band}" fill="${L.plate === 'hatch' ? 'url(#fl-hatch)' : INK.gold}"/><path d="${B.upper}" fill="${INK.navy}"/>`;
  else o += `<path d="${B.hull}" fill="${L.hull}"/>`;
  o += `<g class="fl-top"><path d="${B.top}" fill="${L.ink}"/><path class="fl-inset" d="${B.inset}" fill="#fff" opacity="${plate ? 0.07 : L.neutral ? 0.5 : isSource(m) ? 0.26 : 0.16}"/>`;
  if (isSource(m) && !plate) {
    const el = isoEllipse(Math.min(g.x1 - g.x0, g.y1 - g.y0) * 0.24);
    o += `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(el.rx)}" ry="${f1(el.ry)}" fill="#fff" opacity=".4"/>`;
  }
  if (plate) {
    const lines = lemmaLines(L.title ?? '');
    const longest = Math.max(...lines.map((l) => l.length));
    const fs = Math.max(7, Math.min(9.4, ((g.x1 - g.x0 + g.y1 - g.y0) * 30) / Math.max(1, longest * 0.74)));
    const halo = `paint-order="stroke" stroke="${INK.navy}" stroke-width="3" stroke-linejoin="round"`;
    const lift = L.tag ? -4 : 0;
    lines.forEach((ln, i) => {
      o += `<text x="${f1(c[0])}" y="${f1(c[1] + 3.5 + lift + (i - (lines.length - 1) / 2) * (fs + 2))}" text-anchor="middle" font-family="${FONT.ui}" font-weight="600" font-size="${f1(fs)}" letter-spacing=".08em" fill="#fff" ${halo}>${esc(ln.replace(/ OP$/, ''))}${/ OP$/.test(ln) ? `<tspan font-size="7.5" baseline-shift="35%" fill="${INK.gold}"> OP</tspan>` : ''}</text>`;
    });
    // provenance printed on the plate itself (no external tag to collide with neighbours)
    if (L.tag) o += `<text x="${f1(c[0])}" y="${f1(c[1] + 3.5 + lift + (lines.length + 1) / 2 * (fs + 2) + 1)}" text-anchor="middle" font-family="${FONT.ui}" font-weight="600" font-size="6.8" letter-spacing=".14em" fill="${INK.gold}" ${halo}>${esc(L.tag)}</text>`;
  } else {
    const glyph = L.glyph;
    o += `<text x="${f1(c[0])}" y="${f1(c[1] + 6)}" text-anchor="middle" font-family="${FONT.math}" font-size="${glyph.length > 3 ? 14.5 : glyph.length > 2 ? 16 : 19}" fill="${L.on}"${L.neutral ? ' font-weight="700"' : ''}>${glyphSVG(glyph)}</text>`;
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
 * A Tower: a slim lattice mast on a small pad, a transmitter dish at the top, the variable's name on a
 * plaque. Broadcast rings live in the floor's radio layer (they pulse when a machine reads the symbol).
 */
export function towerSVG(g: MGeo, varLabels?: Map<string, string>): string {
  const m = g.m;
  const label = m.config.kind === 'tower' ? m.config.label : '?';
  const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
  const pad = box(g.x0 + 0.12, g.y0 + 0.12, g.x1 - 0.12, g.y1 - 0.12, 0.1, 0.04, 0.24);
  const base = P(cx, cy, 0.1), top = P(cx, cy, 1.55);
  const hw = 4.2; // half width of the mast at its base
  let o = `<g class="fl-m fl-tower" data-m="${esc(m.id)}" data-machine="${esc(m.id)}" data-kind="tower">`;
  o += `<path class="fl-m-mark" d="${groundRect(g.x0 - 0.1, g.y0 - 0.1, g.x1 + 0.1, g.y1 + 0.1, 0, 0.3)}"/>`;
  o += `<path class="fl-m-shadow mul" d="${pad.shadow}" fill="${FORALL_INK}" opacity=".16"/>`;
  o += `<path d="${pad.hull}" fill="${shade(FORALL_INK, 0.3)}"/><path d="${pad.top}" fill="${FORALL_INK}"/><path d="${pad.inset}" fill="#fff" opacity=".18"/>`;
  // lattice mast: two rails converging upward, with zig-zag bracing
  const bl: [number, number] = [base[0] - hw, base[1]], br: [number, number] = [base[0] + hw, base[1]];
  const tl: [number, number] = [top[0] - 1.3, top[1] + 6], tr: [number, number] = [top[0] + 1.3, top[1] + 6];
  let truss = `M${f1(bl[0])},${f1(bl[1])}L${f1(tl[0])},${f1(tl[1])}M${f1(br[0])},${f1(br[1])}L${f1(tr[0])},${f1(tr[1])}`;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const L0: [number, number] = [bl[0] + (tl[0] - bl[0]) * t0, bl[1] + (tl[1] - bl[1]) * t0];
    const R1: [number, number] = [br[0] + (tr[0] - br[0]) * t1, br[1] + (tr[1] - br[1]) * t1];
    const L1: [number, number] = [bl[0] + (tl[0] - bl[0]) * t1, bl[1] + (tl[1] - bl[1]) * t1];
    truss += `M${f1(L0[0])},${f1(L0[1])}L${f1(R1[0])},${f1(R1[1])}L${f1(L1[0])},${f1(L1[1])}`;
  }
  o += `<rect class="fl-tower-hit" x="${f1(top[0] - 14)}" y="${f1(top[1] - 12)}" width="28" height="${f1(base[1] - top[1] + 14)}" fill="transparent"/>`;
  o += `<path class="fl-mast" d="${truss}" fill="none" stroke="${INK.navy}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>`;
  // transmitter dish, tilted toward the floor, with its feed
  const d: [number, number] = [top[0] + 1, top[1] + 1];
  o += `<g class="fl-dish" transform="translate(${f1(d[0])},${f1(d[1])}) rotate(-24)">` +
    `<ellipse rx="12.5" ry="5.6" fill="#fff" stroke="${INK.navy}" stroke-width="1.6"/>` +
    `<ellipse rx="8" ry="3.2" fill="none" stroke="${INK.navy}" stroke-width=".8" opacity=".45"/>` +
    `<path d="M0,0L6,-9" stroke="${INK.navy}" stroke-width="1.2" stroke-linecap="round"/><circle cx="6.4" cy="-9.6" r="2.1" fill="${VIOLET}"/></g>`;
  // plaque with the variable's name
  const px = base[0] + 11, py = base[1] - 30;
  const w = 12 + label.length * 7.4;
  o += `<g class="fl-plaque"><path d="M${f1(base[0] + 3)},${f1(py + 2)}L${f1(px)},${f1(py + 2)}" stroke="${INK.navy}" stroke-width="1" opacity=".5"/>` +
    `<rect x="${f1(px)}" y="${f1(py - 9)}" width="${f1(w + 22)}" height="21" rx="4" fill="#fff" stroke="${FORALL_INK}" stroke-width="1.3"/>` +
    `<text x="${f1(px + 6)}" y="${f1(py + 6)}" font-family="${FONT.math}" font-size="15" fill="${INK.navy}">${varSVG(label)}<tspan font-style="normal" font-size="12" fill="${INK.navy2}"> ∈ ${m.config.kind === 'tower' && m.config.sort === 'Z' ? 'ℤ' : 'G'}</tspan></text></g>`;
  void varLabels;
  o += `</g>`;
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
      `<text class="fl-name" x="${f1(a[0] - 12)}" y="${f1(a[1] - 16)}" text-anchor="end" font-family="${FONT.ui}" font-size="9" font-weight="600" letter-spacing=".12em" fill="${FAMILY.given.text}">GIVEN</text></g></g>`;
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
  const name = g.look.label.toUpperCase();
  return `<g class="fl-lab fl-sz fl-sz-n" style="transform-origin:${f1(a[0] - 6)}px ${f1(a[1] + 4)}px"><text x="${f1(a[0] - 6)}" y="${f1(a[1] + 12)}" text-anchor="middle" font-family="${FONT.ui}" font-size="8.6" font-weight="600" letter-spacing=".12em" fill="${g.look.neutral ? INK.navy2 : famText(g.fam)}">${esc(name)}</text></g>`;
}

// ───────────── sockets ─────────────

export function socketTarget(m: Machine, lv: LevelManifest): Pallet | Card | undefined {
  return m.config.kind === 'socket' ? lv.sockets.find((s) => s.id === (m.config as { socketId: string }).socketId)?.target : undefined;
}

const sockSize = (g: MGeo) => Math.sqrt((g.x1 - g.x0) * (g.y1 - g.y0)); // 1×1 → 1, 2×1 → 1.41, 2×2 → 2
export function socketSVG(g: MGeo, cx: Ctx, filled: boolean): string {
  void cx;
  const c = P((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2);
  const z = sockSize(g);
  const o1 = isoEllipse(0.3 * z + 0.12), o2 = isoEllipse(0.18 * z + 0.08), d = isoEllipse(0.44 * z + 0.12);
  const k = z >= 2 ? 1.45 : z > 1.2 ? 1.25 : 1;
  return `<g class="fl-m fl-sock${filled ? ' is-sealed' : ''}" data-m="${esc(g.m.id)}" data-machine="${esc(g.m.id)}" data-kind="socket">` +
    `<path class="fl-m-mark" d="${groundRect(g.x0 - 0.1, g.y0 - 0.1, g.x1 + 0.1, g.y1 + 0.1, 0, 0.3)}"/>` +
    `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(d.rx)}" ry="${f1(d.ry)}" fill="${INK.navy}" opacity=".07" class="mul"/>` +
    `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(o1.rx)}" ry="${f1(o1.ry)}" fill="#fff" stroke="${INK.navy}" stroke-width="2.4"/>` +
    `<ellipse class="fl-sock-dash" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(o2.rx)}" ry="${f1(o2.ry)}" fill="none" stroke="${INK.navy}" stroke-width="1.2" stroke-dasharray="2 3"/>` +
    `<g class="fl-seal" style="transform-origin:${f1(c[0])}px ${f1(c[1])}px"><ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(o2.rx * 1.25)}" ry="${f1(o2.ry * 1.25)}" fill="${INK.navy}"/>` +
    `<rect x="${f1(c[0] - 4.5 * k)}" y="${f1(c[1] - 5.5 * k)}" width="${f1(9 * k)}" height="${f1(11 * k)}" fill="#fff"/></g>` +
    `<ellipse class="fl-ripple" cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(o1.rx)}" ry="${f1(o1.ry)}" fill="none" stroke="${INK.navy}" stroke-width="2" style="transform-origin:${f1(c[0])}px ${f1(c[1])}px"/>` +
    `</g>`;
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
