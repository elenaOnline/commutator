// LEMMA WORKS board — static scene as SVG strings (Overprint: flat riso inks,
// multiply where they overlap, no outlines, no lighting). Every revealable
// element carries data-o="<nodeId>" so replay can show/hide it by order.
import type { Fact, Family } from '../kernel/types';
import { FAMILY, FONT, INK } from '../ui/tokens';
import { LANE, LANE_W } from './beads';
import { P, RUN, f1, isoEllipse, pts, ribbon, shade, tileShape, type G2, type S2 } from './geom';
import type { Layout, RibbonLay, RoomLay, SLay, SocketLay, WireLay } from './layout';
import { factSVG, type Labels } from './mathsvg';

export const VIOLET = FAMILY.scope.ink;
export const ORANGE = FAMILY.contradiction.ink;

/** Text/glyph colour printed on a family tile. */
export const ON: Record<Family, string> = {
  identity: INK.navy, inverse: '#FFFFFF', structure: '#FFFFFF', equation: INK.navy,
  scope: '#FFFFFF', contradiction: INK.navy, lemma: '#FFFFFF', given: INK.navy,
};
export const wireOpacity = (f: Family) => (f === 'lemma' ? 0.32 : f === 'identity' ? 0.62 : 0.5);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function glyphSVG(g: string): string {
  if (g === '⁻¹') return `<tspan font-style="italic">x</tspan><tspan font-size="66%" baseline-shift="40%">−1</tspan>`;
  if (g === '|G|') return `|<tspan font-style="italic">G</tspan>|`;
  const pw = /^x\^(\d+)$/.exec(g);
  if (pw) return `<tspan font-style="italic">x</tspan><tspan font-size="66%" baseline-shift="40%">${pw[1]}</tspan>`;
  const sub = /^([a-zA-Z])([₀-₉0-9′']+)$/.exec(g);
  if (sub) {
    const digits = sub[2]!.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));
    return /^\d+$/.test(digits)
      ? `<tspan font-style="italic">${esc(sub[1]!)}</tspan><tspan font-size="62%" baseline-shift="-22%">${digits}</tspan>`
      : `<tspan font-style="italic">${esc(sub[1]!)}</tspan>${esc(sub[2]!)}`;
  }
  if (/^[a-zA-Z]$/.test(g)) return `<tspan font-style="italic">${esc(g)}</tspan>`;
  return esc(g);
}

export const stationTop = (s: SLay): S2 => P(s.gx, s.gy, s.h);

// ───────────── tiles ─────────────

export function tileSVG(s: SLay): string {
  const [x, y] = P(s.gx, s.gy);
  const T = tileShape(s.e, s.h);
  const ink = FAMILY[s.fam].ink;
  const lemma = s.kind === 'building' || s.kind === 'press';
  const sh = P(0.13, 0.13);
  let o = `<g transform="translate(${f1(x)},${f1(y)})">`;
  o += `<path d="${T.base}" transform="translate(${f1(sh[0])},${f1(sh[1])})" fill="${ink}" opacity="${lemma ? 0.14 : 0.2}" class="mul"/>`;
  if (lemma) {
    o += `<path d="${T.hull}" fill="${INK.navy}"/>`;
    o += `<path d="${T.band}" fill="${s.kind === 'press' ? 'url(#lw-hatch)' : INK.gold}"/>`;
    o += `<path d="${T.upper}" fill="${INK.navy}"/>`;
    o += `<path d="${T.top}" fill="${INK.navy}"/>`;
    o += `<path d="${T.inset}" fill="#fff" opacity=".07"/>`;
  } else {
    o += `<path d="${T.hull}" fill="${shade(ink, s.fam === 'identity' ? 0.2 : 0.26)}"/>`;
    o += `<path d="${T.top}" fill="${ink}"/>`;
    o += `<path d="${T.inset}" fill="#fff" opacity="${s.kind === 'inlet' || s.kind === 'start' ? 0.28 : 0.16}"/>`;
    if (s.kind === 'inlet' || s.kind === 'start') {
      const c = P(0, 0, s.h); const el = isoEllipse(s.e * 0.55);
      o += `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(el.rx)}" ry="${f1(el.ry)}" fill="#fff" opacity=".42"/>`;
    }
  }
  const c = P(0, 0, s.h);
  if (lemma) {
    const words = (s.name ?? '').replace(/\s*ᵒᵖ\s*/g, ' ').trim().toUpperCase().split(/\s+/);
    const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
    const fs = 9.6;
    lines.forEach((ln, i) => {
      o += `<text x="${f1(c[0])}" y="${f1(c[1] + 3.5 + (i - (lines.length - 1) / 2) * 11.5)}" text-anchor="middle" font-family="${FONT.ui}" font-weight="600" font-size="${fs}" letter-spacing=".08em" fill="#fff">${esc(ln)}${s.mirror && i === lines.length - 1 ? '<tspan font-size="8" baseline-shift="35%" fill="' + INK.gold + '"> OP</tspan>' : ''}</text>`;
    });
  } else {
    const fs = s.kind === 'inlet' ? 17 : 19;
    o += `<text x="${f1(c[0])}" y="${f1(c[1] + 6)}" text-anchor="middle" font-family="${FONT.math}" font-size="${fs}" fill="${ON[s.fam]}">${glyphSVG(s.glyph)}</text>`;
  }
  o += `</g>`;
  return o;
}

/** Highlight marks under a station (hover = dashed, active = solid); toggled by class. */
export function markSVG(s: SLay): string {
  const [x, y] = P(s.gx, s.gy);
  const el = isoEllipse(Math.max(s.e, 0.4) * 1.32);
  return `<g class="lw-mark" data-mk="${esc(s.key)}" data-o="${esc(s.first)}" transform="translate(${f1(x)},${f1(y)})"><ellipse class="lw-mk-fill" rx="${f1(el.rx)}" ry="${f1(el.ry)}" fill="${INK.navy}" opacity=".08"/><ellipse class="lw-mk-ring" rx="${f1(el.rx)}" ry="${f1(el.ry)}" fill="none" stroke="${INK.navy}" stroke-width="1.6"/></g>`;
}

export function gateSVG(s: SLay, closed: boolean): string {
  const a = P(s.gx, s.gy - 0.82), b = P(s.gx, s.gy + 0.82);
  let o = `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${VIOLET}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0 7.5"/>`;
  if (closed) {
    const c = P(s.gx, s.gy); const el = isoEllipse(0.2);
    o += `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(el.rx)}" ry="${f1(el.ry)}" fill="${ORANGE}" class="mul"/>`;
  }
  return o;
}

// ───────────── wires / ribbons ─────────────

export function wireSVG(w: WireLay, line: G2[] = w.line): string {
  const ink = FAMILY[w.fam].ink, op = wireOpacity(w.fam);
  if (w.lanes === 2) {
    return `<polygon points="${pts(ribbon(line, -LANE, LANE_W))}" fill="${ink}" opacity="${op}" class="mul"/><polygon points="${pts(ribbon(line, LANE, LANE_W))}" fill="${ink}" opacity="${op}" class="mul"/>`;
  }
  if (w.lanes === 1) return `<polygon points="${pts(ribbon(line, 0, w.kind === 'feed' ? LANE_W * 0.8 : LANE_W * 1.3))}" fill="${ink}" opacity="${w.kind === 'feed' ? op * 0.85 : op}" class="mul"/>`;
  return '';
}

/** Small '=' (or '≠') rung just past the producer — the string-diagram equality. */
export function rungSVG(gx: number, gy: number, neq: boolean): string {
  const a = P(gx, gy - LANE), b = P(gx, gy + LANE);
  let o = `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${INK.navy}" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>`;
  if (neq) { const m: S2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; o += `<line x1="${f1(m[0] - 5)}" y1="${f1(m[1] + 6)}" x2="${f1(m[0] + 5)}" y2="${f1(m[1] - 6)}" stroke="${ORANGE}" stroke-width="2.2" stroke-linecap="round"/>`; }
  return o;
}

export function ribbonPoints(r: RibbonLay, L: Layout): S2[] {
  const a = L.stations.get(r.from)!, b = L.stations.get(r.to)!;
  const n = 28, out: S2[] = [];
  const dist = Math.hypot(b.gx - a.gx, b.gy - a.gy);
  const lift = 0.55 + dist * 0.16;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const gx = a.gx + (b.gx - a.gx) * t, gy = a.gy + (b.gy - a.gy) * t;
    const z = (a.h + (b.h - a.h) * t) * 0.5 + lift * Math.sin(Math.PI * t);
    out.push(P(gx, gy, z));
  }
  return out;
}

export function ribbonSVG(r: RibbonLay, L: Layout): string {
  const p = ribbonPoints(r, L);
  const ink = FAMILY[r.fam].ink;
  const d = 'M' + p.map(([x, y]) => `${f1(x)},${f1(y)}`).join('L');
  const a = p[0]!, b = p[p.length - 1]!;
  return `<g class="lw-rib" data-rib="${esc(r.id)}" data-from="${esc(r.from)}" data-to="${esc(r.to)}">` +
    `<path d="${d}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>` +
    `<path class="lw-rib-ink" d="${d}" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round" opacity=".78"/>` +
    `<circle cx="${f1(a[0])}" cy="${f1(a[1])}" r="3.2" fill="${ink}"/><circle cx="${f1(b[0])}" cy="${f1(b[1])}" r="3.2" fill="${ink}"/></g>`;
}

// ───────────── rooms / sockets ─────────────

export function roomSVG(r: RoomLay, L: Labels): string {
  const p = r.poly.map(([x, y]) => P(x, y));
  const kind = r.room.kind;
  const assumed: Fact = kind === 'suppose' ? { k: 'eq', l: r.room.l, r: r.room.r } : { k: 'neq', l: r.room.l, r: r.room.r };
  const lab = P(r.x0 + 0.1, r.y1 - 0.75);
  const tag = kind === 'classical' ? 'CLASSICAL · SUPPOSE' : 'SUPPOSE';
  return `<polygon data-room="${esc(r.room.id)}" points="${pts(p)}" fill="${VIOLET}" opacity="${r.closed ? 0.07 : 0.095}" class="mul"/>` +
    `<g class="lw-lab" data-pri="4"><g class="lw-roomlab lw-sz" style="transform-origin:${f1(lab[0] - 14)}px ${f1(lab[1] + 8)}px"><text x="${f1(lab[0] - 14)}" y="${f1(lab[1] - 2)}" text-anchor="end" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${VIOLET}">${tag}</text>` +
    `<text x="${f1(lab[0] - 14)}" y="${f1(lab[1] + 17)}" text-anchor="end" font-family="${FONT.math}" font-size="17" fill="${VIOLET}">${factSVG(assumed, L)}</text></g></g>`;
}

export function socketSVG(s: SocketLay, filled: boolean, L: Labels): string {
  const [x, y] = P(s.gx, s.gy);
  const E = (r: number) => isoEllipse(r);
  return `<g class="lw-lab" data-pri="${s.claim ? 4 : 5}">${socketInner(s, filled, L, x, y, E)}</g>`;
}
function socketInner(s: SocketLay, filled: boolean, L: Labels, x: number, y: number, E: (r: number) => { rx: number; ry: number }): string {
  const o1 = E(0.55), o2 = E(0.34), d = E(1.0);
  let o = '';
  if (s.claim) {
    o += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(o1.rx)}" ry="${f1(o1.ry)}" fill="#fff" stroke="${INK.navy3}" stroke-width="1.6" stroke-dasharray="4 4"/>`;
    o += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(o2.rx)}" ry="${f1(o2.ry)}" fill="none" stroke="${INK.navy3}" stroke-width="1.1" stroke-dasharray="2 3"/>`;
  } else {
    o += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(d.rx)}" ry="${f1(d.ry)}" fill="${INK.navy}" opacity=".07" class="mul"/>`;
    o += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(o1.rx)}" ry="${f1(o1.ry)}" fill="#fff" stroke="${INK.navy}" stroke-width="2.4"/>`;
    o += `<g class="lw-seal" style="opacity:${filled ? 1 : 0}"><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(o2.rx * 1.25)}" ry="${f1(o2.ry * 1.25)}" fill="${INK.navy}"/>` +
      `<rect x="${f1(x - 4.5)}" y="${f1(y - 5.5)}" width="9" height="11" fill="#fff"/></g>`;
    o += `<ellipse class="lw-sock-dash" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(o2.rx)}" ry="${f1(o2.ry)}" fill="none" stroke="${INK.navy}" stroke-width="1.2" stroke-dasharray="2 3" style="opacity:${filled ? 0 : 1}"/>`;
  }
  const lx = x + o1.rx + 16;
  const tag = s.claim ? 'CLAIM' : filled ? 'DELIVERED' : 'SOCKET';
  o += `<g class="lw-sz" style="transform-origin:${f1(lx)}px ${f1(y)}px">`;
  o += `<text class="lw-socktag" x="${f1(lx)}" y="${f1(y - 6)}" font-family="${FONT.ui}" font-size="10.5" font-weight="600" letter-spacing=".12em" fill="${s.claim ? INK.navy2 : INK.navy}">${tag}</text>`;
  o += `<text x="${f1(lx)}" y="${f1(y + 15)}" font-family="${FONT.math}" font-size="${s.claim ? 16 : 19}" fill="${s.claim ? INK.navy2 : INK.navy}">${factSVG(s.target, L)}</text></g>`;
  return o;
}

/** Registration crosses every 2 grid units over the extent (one path). */
export function crossesSVG(ext: Layout['ext']): string {
  let d = '';
  const x0 = Math.floor(ext.x0 / 2) * 2 - 2, y0 = Math.floor(ext.y0 / 2) * 2 - 2;
  for (let gx = x0; gx <= ext.x1 + 2; gx += 2) for (let gy = y0; gy <= ext.y1 + 2; gy += 2) {
    const [x, y] = P(gx, gy);
    d += `M${f1(x - 3.5)},${f1(y)}h7M${f1(x)},${f1(y - 3.5)}v7`;
  }
  return `<path d="${d}" stroke="${INK.grid}" stroke-width="1" fill="none"/>`;
}

export const inletLabelAnchor = (s: SLay): S2 => { const p = P(s.gx - s.e - 0.12, s.gy + 0.0); return [p[0] - 10, p[1]]; };

export function inletLabelSVG(s: SLay, f: Fact | undefined, L: Labels): string {
  if (!f) return '';
  const [x, y] = inletLabelAnchor(s);
  return `<g class="lw-lab" data-pri="3"><g class="lw-sz" style="transform-origin:${f1(x)}px ${f1(y)}px"><text x="${f1(x)}" y="${f1(y + 5)}" text-anchor="end" font-family="${FONT.math}" font-size="16.5" fill="${INK.navy}">${factSVG(f, L)}</text></g></g>`;
}

export const runPoint = (gx: number, gy: number, along: number): S2 => { const p = P(gx, gy); return [p[0] + RUN[0] * along, p[1] + RUN[1] * along]; };
