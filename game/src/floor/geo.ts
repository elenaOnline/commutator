// LEMMA WORKS v3 floor — derived geometry for one canvas epoch (footprints,
// ports, belt centre-lines, occupancy). Pure; recomputed when canvas changes.
import type { KernelCtx } from '../kernel';
import type { Family } from '../kernel/types';
import type { Belt, Canvas, Compiled, ItemKind, Machine, MachineSpec, Port, Tile } from '../factory/types';
import { itemKindOf } from '../factory/types';
import { P, type G2, type S2 } from '../board/geom';
import { faceVec, footprint, portsOf, spec } from './adapt';
import { lookOf, type Look } from './look';

export interface MGeo {
  m: Machine; spec: MachineSpec; fam: Family; look: Look;
  tiles: Tile[];
  x0: number; y0: number; x1: number; y1: number; // half-open bounds
  ports: Port[];
}
export interface BGeo {
  b: Belt; kind: ItemKind; fam: Family;
  /** Grid-space centre line from the output port edge, through tile centres, to the input port edge. */
  line: G2[];
  ok: boolean;
  /** Touching ports linked with no belt cells (drawn as a short coupling). */
  direct: boolean;
  /** v4.1: an open belt (to = null) — ends on a ground cell, items wait at its end cap. */
  open?: boolean;
  /** Set by the editor when an edit left this belt without a route: kept, drawn dashed red, carries nothing. */
  broken?: string;
}
/** A tile where two different belt networks cross at right angles: `over` is drawn as a bridge. */
export interface Crossing { t: Tile; over: string; dir: G2 }
export interface PortGeo { m: string; port: Port; edge: G2; out: G2; taken: boolean; kind: ItemKind }
export interface Geo {
  ms: Map<string, MGeo>;
  bs: Map<string, BGeo>;
  ports: PortGeo[];
  crossings: Crossing[];
  /** Tower variables on this floor: var id → its tower and label (x₁). */
  vars: Map<string, { tower: string; label: string; sort: 'G' | 'Z' }>;
  occ: Map<string, string>;        // tile key → machine id
  beltOcc: Map<string, string>;    // tile key → belt id
  /** World-px bounds of everything (for fit). */
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

export const tkey = (t: Tile) => `${t.x},${t.y}`;
export const centre = (t: Tile): G2 => [t.x + 0.5, t.y + 0.5];
export const portEdge = (p: Port): G2 => { const [dx, dy] = faceVec(p.face); return [p.tile.x + 0.5 + dx * 0.5, p.tile.y + 0.5 + dy * 0.5]; };
export const portOut = (p: Port, k: number): G2 => { const [dx, dy] = faceVec(p.face); return [p.tile.x + 0.5 + dx * (0.5 + k), p.tile.y + 0.5 + dy * (0.5 + k)]; };

/**
 * Where a belt meets its port. Normally the port's mouth (doorstep approach). A side approach — the belt ends on a
 * tile beside the port's cell because the doorstep is taken — enters through that side wall close to the mouth,
 * so it reads as feeding this port rather than cutting across the doorstep.
 */
export function portEnd(p: Port, t: Tile | undefined, isStart: boolean): G2[] {
  const [fx, fy] = faceVec(p.face);
  const front = { x: p.tile.x + fx, y: p.tile.y + fy };
  if (!t || (t.x === front.x && t.y === front.y)) return [portEdge(p)];
  const sx = t.x - p.tile.x, sy = t.y - p.tile.y;
  if (Math.abs(sx) + Math.abs(sy) !== 1) return [portEdge(p)];
  const wall: G2 = [p.tile.x + 0.5 + sx * 0.5 + fx * 0.3, p.tile.y + 0.5 + sy * 0.5 + fy * 0.3];
  void isStart;
  return [wall];
}

export function familyOfMachine(m: Machine, s: MachineSpec, ctx?: KernelCtx): Family {
  if (ctx) return lookOf(m, ctx).fam;
  return s.family;
}

export function buildGeo(c: Canvas, comp: Compiled | null, ctx: KernelCtx): Geo {
  // the floor's Towers by label (H₁, f₁): a recipe's "at f₁" and glyph read them, never a Tower's id (x3)
  const towerLabels: Record<string, string> = {};
  for (const m of c.machines) if (m.config.kind === 'tower') towerLabels[m.config.varId] = m.config.label;
  const lookCtx = { ...ctx, labels: towerLabels } as KernelCtx;
  const ms = new Map<string, MGeo>();
  const occ = new Map<string, string>();
  for (const m of c.machines) {
    const s = spec(m.kind);
    const tiles = footprint(m, ctx);
    const xs = tiles.map((t) => t.x), ys = tiles.map((t) => t.y);
    let look = lookOf(m, lookCtx);
    // Book phase A: a multi-desk Assume room numbers its desks ⊢₁ ⊢₂ ⊢₃ (desk i emits assumption Pᵢ)
    if (m.config.kind === 'desk') {
      const room = c.rooms.find((r) => r.id === (m.config as { room: string }).room);
      if ((room?.assumes?.length ?? 0) > 1) {
        const i = ((m.config as { slot?: number }).slot ?? 0) + 1;
        look = { ...look, glyph: `⊢${'₀₁₂₃₄₅₆₇₈₉'[i]}`, label: `${look.label} ${i}` };
      }
    }
    const g: MGeo = { m, spec: s, fam: look.fam, look, tiles, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, ports: portsOf(m, ctx) };
    ms.set(m.id, g);
    for (const t of tiles) occ.set(tkey(t), m.id);
  }
  const bs = new Map<string, BGeo>();
  const beltOcc = new Map<string, string>();
  const taken = new Set<string>();
  const outUsed = new Set<string>();
  for (const b of c.belts) {
    const to = b.to;
    const fm = ms.get(b.from.m), tm = to ? ms.get(to.m) : undefined;
    const fp = fm?.ports.find((p) => p.id === b.from.port), tp = to ? tm?.ports.find((p) => p.id === to.port) : undefined;
    if (to) taken.add(`${to.m}|${to.port}`);
    outUsed.add(`${b.from.m}|${b.from.port}`);
    let line: G2[] = [];
    const direct = b.path.length === 0;
    if (direct && fp) {
      const [dx, dy] = faceVec(fp.face); const e = portEdge(fp);
      line = [[e[0] - dx * 0.22, e[1] - dy * 0.22], [e[0] + dx * 0.22, e[1] + dy * 0.22]];
    } else {
      const first = b.path[0], last = b.path[b.path.length - 1];
      if (fp) line.push(...portEnd(fp, first, true));
      for (const t of b.path) { line.push(centre(t)); if (!beltOcc.has(tkey(t))) beltOcc.set(tkey(t), b.id); }
      if (tp) line.push(...portEnd(tp, last, false));
      else if (!to && line.length >= 2) {
        // an OPEN belt: it runs a little past its last cell into an end cap where items wait
        const a = line[line.length - 2]!, z = line[line.length - 1]!;
        const dx = z[0] - a[0], dy = z[1] - a[1], l = Math.hypot(dx, dy) || 1;
        line.push([z[0] + dx / l * 0.34, z[1] + dy / l * 0.34]);
      }
    }
    const out = comp?.machines[b.from.m]?.out;
    const kind: ItemKind = out ? itemKindOf(out) : (fp?.accepts[0] ?? 'eq');
    bs.set(b.id, { b, kind, fam: fm?.fam ?? 'equation', line, ok: !!fp && (!to || !!tp) && !comp?.beltErrors[b.id], direct: direct && !!to, broken: b.broken, open: !to });
  }
  // crossings: a tile used by belts of different networks (different source port); the later belt bridges
  const byTile = new Map<string, { id: string; root: string; dir: G2; t: Tile }[]>();
  for (const b of c.belts) {
    if (b.broken) continue;
    const bg = bs.get(b.id)!;
    b.path.forEach((t, i) => {
      const a = bg.line[i] ?? centre(t), z = bg.line[i + 2] ?? centre(t);
      const dx = z[0] - a[0], dy = z[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const k = tkey(t); const arr = byTile.get(k) ?? []; arr.push({ id: b.id, root: `${b.from.m}|${b.from.port}`, dir: [dx / l, dy / l], t }); byTile.set(k, arr);
    });
  }
  const crossings: Crossing[] = [];
  for (const arr of byTile.values()) {
    const roots = new Set(arr.map((x) => x.root));
    if (roots.size < 2) continue;
    const over = arr[arr.length - 1]!;
    crossings.push({ t: over.t, over: over.id, dir: over.dir });
  }
  const ports: PortGeo[] = [];
  for (const g of ms.values()) for (const p of g.ports) {
    const key = `${g.m.id}|${p.id}`;
    const out = comp?.machines[g.m.id]?.out;
    const kind: ItemKind = p.dir === 'out' && out ? itemKindOf(out) : (p.accepts[0] ?? 'eq');
    ports.push({ m: g.m.id, port: p, edge: portEdge(p), out: portOut(p, 0.42), taken: p.dir === 'in' ? taken.has(key) : outUsed.has(key), kind });
  }
  // bounds in world px
  const pts: S2[] = [];
  // machine tops count (a Tower's transmitter reaches about 1.7 tile heights above the floor)
  for (const g of ms.values()) { pts.push(P(g.x0, g.y0, g.m.kind === 'tower' ? 1.7 : 0.5), P(g.x1, g.y0), P(g.x0, g.y1), P(g.x1, g.y1)); }
  for (const r of c.rooms) { pts.push(P(r.rect.x, r.rect.y), P(r.rect.x + r.rect.w, r.rect.y), P(r.rect.x, r.rect.y + r.rect.h), P(r.rect.x + r.rect.w, r.rect.y + r.rect.h)); }
  for (const b of bs.values()) for (const p of b.line) pts.push(P(p[0], p[1]));
  const bounds = pts.length
    ? { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) }
    : { x0: -300, y0: -200, x1: 300, y1: 200 };
  // room for labels left of inlets / right of sockets
  bounds.x0 -= 150; bounds.x1 += 190; bounds.y0 -= 50; bounds.y1 += 40;
  const vars = new Map<string, { tower: string; label: string; sort: 'G' | 'Z' }>();
  for (const m of c.machines) if (m.config.kind === 'tower') vars.set(m.config.varId, { tower: m.id, label: m.config.label, sort: m.config.sort === 'Z' ? 'Z' : 'G' });
  return { ms, bs, ports, crossings, vars, occ, beltOcc, bounds };
}
