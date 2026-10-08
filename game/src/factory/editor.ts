// LEMMA WORKS v3 — canvas editor (owner: EDITOR builder). Pure functions: Canvas in, Edit out.
//
// Invariants every successful Edit preserves:
//   • machine footprints never overlap; every machine lies wholly inside or wholly outside each room;
//     a desk lies in its own room (innermost); a gate lies on its room's boundary ring facing outward;
//   • rooms are pairwise disjoint or strictly nested;
//   • every belt runs from the cell in front of an output port to the cell in front of an input port,
//     cardinally, without repeats, off every footprint; belts from different outputs never share a tile;
//     belts from the same output share only a common prefix (a copy tree); an input has at most one belt.
// Type mismatches between ports are allowed (the compiler jams them with a reason).
import type { KernelCtx } from '../kernel';
import type { LevelManifest } from '../kernel/types';
import type { Belt, Canvas, Endpoint, Face, Machine, MachineConfig, MachineKind, Port, Rect, Room, Rot, Tile } from './types';
import type { Blueprint, Edit } from './index';
import { SPECS, defaultConfig } from './catalog';
import { LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { FACE_DELTA, FACES, OPPOSITE, addTile, footprint, frontOf, inRect, portsOf, rectOf, sizeOf, tileEq, tileKey } from './geometry';

// ───────────────────────────── small helpers ─────────────────────────────

const ok = (canvas: Canvas, ids?: string[]): Edit => (ids ? { ok: true, canvas, ids } : { ok: true, canvas });
const no = (reason: string, blockers?: string[]): Edit => (blockers?.length ? { ok: false, reason, blockers } : { ok: false, reason });
const noWhy = (w: Why): Edit => no(w.reason, w.blockers);
const clone = <T>(x: T): T => structuredClone(x);
const area = (r: Rect) => r.w * r.h;

/** `${prefix}${n}` for the smallest n ≥ 1 not already taken. */
export function freshId(taken: Set<string>, prefix: string): string {
  for (let n = 1; ; n++) { const id = `${prefix}${n}`; if (!taken.has(id)) { taken.add(id); return id; } }
}
const allIds = (c: Canvas): Set<string> => new Set([...c.machines.map((m) => m.id), ...c.belts.map((b) => b.id), ...c.rooms.map((r) => r.id)]);

const nameOf = (m: Machine): string => SPECS[m.kind]?.name ?? m.kind;
const sameEnd = (a: Endpoint, b: Endpoint) => a.m === b.m && a.port === b.port;
const endKey = (e: Endpoint) => `${e.m}#${e.port}`;

function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}
function rectsDisjoint(a: Rect, b: Rect): boolean {
  return a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
}
const rectEq = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
/** On the boundary ring of r (inside r, touching an edge). */
const onRing = (t: Tile, r: Rect) => inRect(t, r) && (t.x === r.x || t.y === r.y || t.x === r.x + r.w - 1 || t.y === r.y + r.h - 1);

/** Innermost (smallest) room whose rect contains the tile, or null for root. */
export function roomAt(c: Canvas, t: Tile): Room | null {
  let best: Room | null = null;
  for (const r of c.rooms) if (inRect(t, r.rect) && (!best || area(r.rect) < area(best.rect))) best = r;
  return best;
}
/** Innermost room containing a machine (its whole footprint; machines never straddle), or null for root. */
export function roomOfMachine(c: Canvas, m: Machine, ctx: KernelCtx): Room | null {
  return roomAt(c, footprint(m, ctx)[0]!);
}

/** Tile → machine id for every footprint cell (optionally skipping some machines). */
function occupancy(machines: Machine[], ctx: KernelCtx, skip?: Set<string>): Map<string, string> {
  const occ = new Map<string, string>();
  for (const m of machines) if (!skip?.has(m.id)) for (const t of footprint(m, ctx)) occ.set(tileKey(t), m.id);
  return occ;
}

// ───────────────────────────── placement validation ─────────────────────────────

/**
 * Can these machines sit where they are, given the rest of the canvas (minus `skip`) and the rooms?
 * Returns a reason in plain language, or null.
 */
function fitReason(c: Canvas, ms: Machine[], ctx: KernelCtx, skip: Set<string>, rooms: Room[] = c.rooms): Why | null {
  const occ = occupancy(c.machines, ctx, new Set([...skip, ...ms.map((m) => m.id)]));
  const byId = new Map(c.machines.map((m) => [m.id, m]));
  const mine = new Map<string, string>();
  for (const m of ms) {
    const cells = footprint(m, ctx);
    for (const t of cells) {
      const k = tileKey(t);
      const other = occ.get(k) ?? mine.get(k);
      if (other !== undefined) {
        const o = byId.get(other) ?? ms.find((x) => x.id === other);
        return o ? why(`${cap(who(o, ctx))} is in the way.`, [o.id]) : why('That spot is taken.');
      }
      mine.set(k, m.id);
    }
    const rr = roomReason(m, cells, rooms, ctx);
    if (rr) return why(rr, roomBlockers(m, cells, rooms));
  }
  return null;
}

/** Rooms whose wall a machine would straddle (for flashing). */
function roomBlockers(m: Machine, cells: Tile[], rooms: Room[]): string[] {
  void m;
  return rooms.filter((r) => { const n = cells.filter((t) => inRect(t, r.rect)).length; return n !== 0 && n !== cells.length; }).map((r) => r.id);
}

function roomReason(m: Machine, cells: Tile[], rooms: Room[], ctx: KernelCtx): string | null {
  void ctx;
  for (const r of rooms) {
    const n = cells.filter((t) => inRect(t, r.rect)).length;
    if (n !== 0 && n !== cells.length) return `The ${nameOf(m)} would straddle a room wall — put it wholly inside or outside.`;
  }
  const inner = (t: Tile) => { let best: Room | null = null; for (const r of rooms) if (inRect(t, r.rect) && (!best || area(r.rect) < area(best.rect))) best = r; return best; };
  if (m.config.kind === 'desk') {
    const own = m.config.room;
    if (inner(cells[0]!)?.id !== own) return 'The Assumption Desk stays inside its own room.';
  }
  if (m.config.kind === 'gate') {
    const own = rooms.find((r) => r.id === (m.config as { room: string }).room);
    const t = cells[0]!;
    if (!own || inner(t)?.id !== own.id || !onRing(t, own.rect)) return 'The Exit Gate sits on its own room’s wall.';
    const outward = addTile(t, FACE_DELTA[FACES[m.rot]!]);
    if (inRect(outward, own.rect)) return 'The Exit Gate must face out of its room.';
  }
  return null;
}

/** Rotation that makes a gate at tile t face out of rect r (E, S, N, W preference), or null if not on the ring. */
function gateRot(t: Tile, r: Rect, prefer?: Rot): Rot | null {
  if (!onRing(t, r)) return null;
  const options: Rot[] = [];
  if (t.x === r.x + r.w - 1) options.push(0);
  if (t.y === r.y + r.h - 1) options.push(1);
  if (t.y === r.y) options.push(3);
  if (t.x === r.x) options.push(2);
  if (prefer !== undefined && options.includes(prefer)) return prefer;
  return options[0] ?? null;
}

// ───────────────────────────── belt layer: rules ─────────────────────────────
//
// A belt is a list of cells from the cell in front of its output port to the cell in front of its input port.
//   • path []  = a direct link between touching ports (each port's front cell is the other port's cell).
//   • cells never sit on a footprint, nor on the front cell of any port except the belt's own two ends.
//   • belts from different outputs may share a cell only as a perpendicular crossing (an implicit overpass):
//     both run straight through it on different axes, and neither ends there. Crossing never connects.
//   • belts from the same output share only a common prefix (a copy tree); a fork cell is exclusive.
//   • with scope-compatible ends, a belt stays in its source's room and crosses each wall once, inward.
//   • a belt that no route can serve after an edit is KEPT with `broken` naming the blocker.

const STEP = 10;
const TURN = 4;
/** Small cost per crossing: crossings are fine, a straight detour of a tile or two is nicer. */
const CROSS = 6;
/** Cost for hugging the source/target machine (discourages routes that wrap around it). */
const WRAP = 5;
/** Leaving/arriving by the side of a port instead of its doorstep. */
const SIDE = 18;
/** Arriving at a dock on another face than its marked one. */
const DOCK_FACE = 2;
/** Running over the approach cell of a free input (the cell beyond its doorstep). */
const APPROACH = 30;
const dirOf = (a: Tile, b: Tile): Face => (b.x > a.x ? 'E' : b.x < a.x ? 'W' : b.y > a.y ? 'S' : 'N');
type Axis = 'H' | 'V';
type Mode = Axis | 'X';
const axisOf = (f: Face): Axis => (f === 'E' || f === 'W' ? 'H' : 'V');

export interface Why { reason: string; blockers: string[] }
const why = (reason: string, blockers: string[] = []): Why => ({ reason, blockers });

interface Seed { tile: Tile; dir: Face; prefix: Tile[]; cost?: number }

class Heap {
  private a: [number, number, number][] = []; // [f, tiebreak, payload]
  private n = 0;
  get size() { return this.a.length; }
  push(f: number, v: number) {
    const a = this.a; a.push([f, this.n++, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (less(a[i]!, a[p]!)) { [a[i], a[p]] = [a[p]!, a[i]!]; i = p; } else break; }
  }
  pop(): number {
    const a = this.a; const top = a[0]!; const last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m]!, a[i]!]; i = m;
      }
    }
    return top[2];
  }
}
const less = (x: [number, number, number], y: [number, number, number]) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);

/**
 * A* over (tile, heading). Path = seed.prefix ++ [seed.tile … goal]. Seeds may carry a start cost; goals map a
 * cell to the heading that enters the port from it (+TURN if the last heading differs) and an arrival cost.
 * `enter` prices a step (null = forbidden); `straight(t)` forces the step out of t to keep heading (crossings).
 */
function astar(seeds: Seed[], goals: Map<string, { dir: Face | null; cost: number }>, bounds: Rect,
  enter: (a: Tile, b: Tile, d: Face) => number | null, straight: (t: Tile) => boolean): { path: Tile[]; dir: Face } | null {
  const D = FACES;
  const st: { t: Tile; d: number; g: number; parent: number; seed: number }[] = [];
  const best = new Map<string, number>();
  const heap = new Heap();
  const gt = [...goals.keys()].map((k) => { const [x, y] = k.split(',').map(Number); return { x: x!, y: y! }; });
  const h = (t: Tile) => Math.min(...gt.map((g) => Math.abs(t.x - g.x) + Math.abs(t.y - g.y))) * STEP;
  const ends: { s: number; cost: number }[] = [];
  seeds.forEach((s, i) => {
    const d = D.indexOf(s.dir);
    const k = `${s.tile.x},${s.tile.y},${d}`;
    const g0 = s.cost ?? 0;
    if (best.has(k) && best.get(k)! <= g0) return;
    st.push({ t: s.tile, d, g: g0, parent: -1, seed: i }); best.set(k, g0);
    heap.push(g0 + h(s.tile), st.length - 1);
  });
  while (heap.size) {
    const v = heap.pop();
    if (v < 0) { const e = ends[-v - 1]!; return { path: rebuild(e.s), dir: D[st[e.s]!.d]! }; }
    const s = st[v]!;
    if (best.get(`${s.t.x},${s.t.y},${s.d}`)! < s.g) continue;
    const goal = goals.get(tileKey(s.t));
    if (goal) {
      const cost = s.g + goal.cost + (goal.dir && D[s.d] !== goal.dir ? TURN : 0);
      ends.push({ s: v, cost }); heap.push(cost, -ends.length);
    }
    const onlyStraight = s.parent >= 0 && straight(s.t);
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (s.d + 2) % 4) continue;
      if (onlyStraight && nd !== s.d) continue;
      const t = addTile(s.t, FACE_DELTA[D[nd]!]);
      if (!inRect(t, bounds)) continue;
      const extra = enter(s.t, t, D[nd]!);
      if (extra === null) continue;
      const g = s.g + STEP + (nd === s.d ? 0 : TURN) + extra;
      const k = `${t.x},${t.y},${nd}`;
      const old = best.get(k);
      if (old !== undefined && old <= g) continue;
      best.set(k, g);
      st.push({ t, d: nd, g, parent: v, seed: s.seed }); heap.push(g + h(t), st.length - 1);
    }
  }
  return null;

  function rebuild(i: number): Tile[] {
    const out: Tile[] = [];
    let j = i; let seed = 0;
    while (j >= 0) { out.push(st[j]!.t); seed = st[j]!.seed; j = st[j]!.parent; }
    out.reverse();
    return [...seeds[seed]!.prefix, ...out];
  }
}

function boundsOf(c: Canvas, ctx: KernelCtx, extra: Tile[], margin = 8): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (t: Tile) => { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); };
  for (const m of c.machines) { const r = rectOf(m, ctx); add(r); add({ x: r.x + r.w - 1, y: r.y + r.h - 1 }); }
  for (const b of c.belts) b.path.forEach(add);
  for (const r of c.rooms) { add(r.rect); add({ x: r.rect.x + r.rect.w - 1, y: r.rect.y + r.rect.h - 1 }); }
  extra.forEach(add);
  if (x0 === Infinity) return { x: -margin, y: -margin, w: 2 * margin, h: 2 * margin };
  return { x: x0 - margin, y: y0 - margin, w: x1 - x0 + 1 + 2 * margin, h: y1 - y0 + 1 + 2 * margin };
}

interface Ends { fromM: Machine; toM: Machine; fromP: Port; toP: Port }
function resolveEnds(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx): Ends | string {
  const fromM = c.machines.find((m) => m.id === from.m);
  const toM = c.machines.find((m) => m.id === to.m);
  if (!fromM || !toM) return 'That machine is gone.';
  const fromP = portsOf(fromM, ctx).find((p) => p.id === from.port);
  const toP = portsOf(toM, ctx).find((p) => p.id === to.port);
  if (!fromP) return `${cap(who(fromM, ctx))} has no port “${from.port}”.`;
  if (!toP) return `${cap(who(toM, ctx))} has no port “${to.port}”.`;
  return { fromM, toM, fromP, toP };
}

// ───── naming things in refusals ─────

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** 'h₄' for a given inlet, 'the Canceller' otherwise. */
function who(m: Machine, ctx: KernelCtx): string {
  if (m.config.kind === 'given') { const id = m.config.givenId; return ctx.level.givens.find((g) => g.id === id)?.name ?? 'the Given Inlet'; }
  return `the ${nameOf(m)}`;
}
function portName(m: Machine, p: Port, ctx: KernelCtx): string {
  const plain = p.label === 'in' || p.label === 'out' ? '' : `${p.label} `;
  return `${who(m, ctx)}’s ${plain}${p.dir === 'in' ? 'input' : 'output'}`;
}
function beltName(c: Canvas, b: Belt, ctx: KernelCtx): string {
  const m = c.machines.find((x) => x.id === b.from.m);
  return m ? `the belt from ${who(m, ctx)}` : 'a belt';
}
const at = (t: Tile) => `(${t.x},${t.y})`;

// ───── scope on belts: a belt stays in its source's scope and may only step inward toward its target ─────

/** Smallest room strictly containing room r, or null (root). */
function parentRoom(c: Canvas, r: Room): Room | null {
  let best: Room | null = null;
  for (const x of c.rooms) if (x.id !== r.id && rectInside(r.rect, x.rect) && (!best || area(x.rect) < area(best.rect))) best = x;
  return best;
}
/** T lies within S (S null = root contains everything). */
const within = (t: Room | null, sc: Room | null): boolean => !sc || (!!t && (t.id === sc.id || rectInside(t.rect, sc.rect)));

interface BeltScope {
  /** The destination's scope lies within the source's: a legal belt exists in principle. */
  ok: boolean;
  allow: (t: Tile) => boolean;
  step: (a: Tile, b: Tile) => boolean;
}
/**
 * Source scope S = the source machine's room (an Exit Gate's output lives in its room's parent); target scope
 * D = the target machine's room. Legal belt tiles have scope T with D ⊆ T ⊆ S, and depth never decreases along
 * the belt: each wall is crossed once, inward. Nothing leaves a room except through its gate.
 */
function beltScope(c: Canvas, ends: Ends, ctx: KernelCtx): BeltScope {
  const S = ends.fromM.config.kind === 'gate'
    ? (() => { const own = c.rooms.find((r) => r.id === (ends.fromM.config as { room: string }).room); return own ? parentRoom(c, own) : null; })()
    : roomOfMachine(c, ends.fromM, ctx);
  const D = roomOfMachine(c, ends.toM, ctx);
  const cache = new Map<string, { r: Room | null; d: number }>();
  const info = (t: Tile) => {
    const k = tileKey(t);
    let v = cache.get(k);
    if (!v) { v = { r: roomAt(c, t), d: c.rooms.filter((r) => inRect(t, r.rect)).length }; cache.set(k, v); }
    return v;
  };
  const allow = (t: Tile) => { const T = info(t).r; return within(T, S) && within(D, T); };
  return { ok: within(D, S), allow, step: (a, b) => allow(b) && info(b).d >= info(a).d };
}

// ───── the occupied belt layer ─────

const netOf = (b: { from: Endpoint }) => endKey(b.from);

/** Mode of each cell of a path: straight interior cells carry their axis; ends and turns are exclusive. */
function cellModes(path: Tile[]): Mode[] {
  return path.map((t, i) => {
    if (i === 0 || i === path.length - 1) return 'X';
    const din = dirOf(path[i - 1]!, t), dout = dirOf(t, path[i + 1]!);
    return din === dout ? axisOf(din) : 'X';
  });
}

/** Which networks use each cell, and how. Broken belts occupy nothing. */
class Layer {
  cells = new Map<string, Map<string, { mode: Mode; belts: string[] }>>();
  constructor(belts: Belt[]) { for (const b of belts) this.add(b); }
  add(b: Belt) {
    if (b.broken) return;
    const net = netOf(b), modes = cellModes(b.path);
    b.path.forEach((t, i) => {
      const k = tileKey(t);
      let m = this.cells.get(k);
      if (!m) { m = new Map(); this.cells.set(k, m); }
      const cur = m.get(net);
      if (cur) { if (cur.mode !== modes[i]) cur.mode = 'X'; cur.belts.push(b.id); }
      else m.set(net, { mode: modes[i]!, belts: [b.id] });
    });
  }
  others(t: Tile, net: string) { return [...(this.cells.get(tileKey(t)) ?? new Map<string, { mode: Mode; belts: string[] }>()).entries()].filter(([n]) => n !== net).map(([, v]) => v); }
  own(t: Tile, net: string) { return this.cells.get(tileKey(t))?.get(net); }
  /** Belt ids a cell would clash with if `net` used it in `mode` (empty = fine, maybe as a crossing). */
  clash(t: Tile, net: string, mode: Mode): string[] {
    const os = this.others(t, net);
    if (!os.length) return [];
    const own = this.own(t, net);
    const m: Mode = own && own.mode !== mode ? 'X' : mode;
    if (m === 'X' || os.length > 1 || os[0]!.mode === 'X' || os[0]!.mode === m) return os.flatMap((o) => o.belts);
    return [];
  }
}

/** Front cell → the port that owns it (every port of every machine). */
function frontIndex(c: Canvas, ctx: KernelCtx): Map<string, { m: Machine; p: Port }> {
  const idx = new Map<string, { m: Machine; p: Port }>();
  for (const m of c.machines) for (const p of portsOf(m, ctx)) idx.set(tileKey(frontOf(p)), { m, p });
  return idx;
}
const isEnd = (m: Machine, p: Port, e: Endpoint) => m.id === e.m && p.id === e.port;

/** Touching ports: each one's front cell is the other's cell. */
function touching(e: Ends): boolean {
  return tileEq(frontOf(e.fromP), e.toP.tile) && tileEq(frontOf(e.toP), e.fromP.tile);
}

interface BeltCtx {
  c: Canvas; ctx: KernelCtx;
  occ: Map<string, string>;
  fronts: Map<string, { m: Machine; p: Port }>;
}
const beltCtx = (c: Canvas, ctx: KernelCtx): BeltCtx => ({ c, ctx, occ: occupancy(c.machines, ctx), fronts: frontIndex(c, ctx) });

/**
 * Cells a belt may start from (outputs) or end on (inputs): the port's doorstep (its front cell), and — at a
 * cost — the port cell's two side neighbours outside the machine. Sides give free fan-out from a direct-linked
 * output, let a gate take ⊥ from any inward approach, and let docks accept from a second face.
 */
function approaches(m: Machine, p: Port, ctx: KernelCtx): { tile: Tile; dir: Face; cost: number }[] {
  const fp = new Set(footprint(m, ctx).map(tileKey));
  const out = [{ tile: frontOf(p), dir: p.face, cost: 0 }];
  if (m.kind === 'socket') {
    // Docks take a belt on every free face of their inlet (doorstep and both sides), cheapest route wins.
    const i0 = FACES.indexOf(p.face);
    for (const side of [FACES[(i0 + 1) % 4]!, FACES[(i0 + 3) % 4]!]) {
      const t = addTile(p.tile, FACE_DELTA[side]);
      if (!fp.has(tileKey(t))) out.push({ tile: t, dir: side, cost: DOCK_FACE });
    }
    return out;
  }
  const i = FACES.indexOf(p.face);
  for (const side of [FACES[(i + 1) % 4]!, FACES[(i + 3) % 4]!]) {
    const t = addTile(p.tile, FACE_DELTA[side]);
    if (!fp.has(tileKey(t))) out.push({ tile: t, dir: side, cost: SIDE });
  }
  return out;
}

/** Why this path is not a legal belt for (from → to) among `belts` (which must exclude the belt itself), or null. */
function pathWhy(B: BeltCtx, belts: Belt[], from: Endpoint, to: Endpoint, path: Tile[]): Why | null {
  const { c, ctx, occ, fronts } = B;
  const ends = resolveEnds(c, from, to, ctx);
  if (typeof ends === 'string') return why(ends);
  if (!path.length) {
    if (touching(ends)) return null;
    return why(`${cap(portName(ends.fromM, ends.fromP, ctx))} does not touch ${portName(ends.toM, ends.toP, ctx)} — a belt needs at least one cell.`, [ends.toM.id]);
  }
  if (!approaches(ends.fromM, ends.fromP, ctx).some((a) => tileEq(a.tile, path[0]!))) return why('The belt must start beside the output port.');
  if (!approaches(ends.toM, ends.toP, ctx).some((a) => tileEq(a.tile, path[path.length - 1]!))) return why('The belt must end beside the input port.');
  const sc = beltScope(c, ends, ctx);
  const net = endKey(from);
  const seen = new Set<string>();
  for (let i = 0; i < path.length; i++) {
    const t = path[i]!; const k = tileKey(t);
    if (i > 0) {
      const p = path[i - 1]!;
      if (Math.abs(p.x - t.x) + Math.abs(p.y - t.y) !== 1) return why('Belts run cell to neighbouring cell.');
      if (sc.ok && !sc.step(p, t)) return why('A belt crosses each room wall once, inward.');
    }
    if (sc.ok && !sc.allow(t)) return why('That belt would leave its room — only the Exit Gate carries a result out.');
    if (seen.has(k)) return why('A belt cannot cross itself.');
    seen.add(k);
    const owner = occ.get(k);
    if (owner !== undefined) { const m = c.machines.find((x) => x.id === owner)!; return why(`${cap(who(m, ctx))} is in the way.`, [owner]); }
    const f = fronts.get(k);
    if (f && !isEnd(f.m, f.p, from) && !isEnd(f.m, f.p, to)) return why(`That would block ${portName(f.m, f.p, ctx)} — its doorstep stays free.`, [f.m.id]);
  }
  const layer = new Layer(belts);
  const network = belts.filter((b) => !b.broken && netOf(b) === net);
  let k = 0;
  for (const b of network) {
    let j = 0; while (j < b.path.length && j < path.length && tileEq(b.path[j]!, path[j]!)) j++;
    k = Math.max(k, j);
  }
  for (let i = k; i < path.length; i++) if (layer.own(path[i]!, net)) return why('A branch may share only the start of its trunk.');
  const modes = cellModes(path);
  for (let i = 0; i < path.length; i++) {
    const hitBelts = layer.clash(path[i]!, net, modes[i]!);
    if (hitBelts.length) {
      const b = belts.find((x) => x.id === hitBelts[0])!;
      return why(`${cap(beltName(c, b, ctx))} is in the way — belts may only cross straight over each other.`, hitBelts);
    }
  }
  return null;
}

type Routed = { path: Tile[] } | Why;
const isWhy = (r: Routed): r is Why => 'reason' in r;

/**
 * Route a belt for (from → to) against existing belts. Touching ports link directly (path []). The belt may
 * leave any cell of its output's existing tree (`leaveAt` forces one) or any free approach of the port; it ends
 * on any free approach of the input. Cells: off footprints, off other ports' doorsteps, crossing other belts
 * only straight and perpendicular, inside the scope chain. On failure the reason blames the real blocker(s).
 */
function routeWhy(B: BeltCtx, belts: Belt[], from: Endpoint, to: Endpoint, via: Tile[] = [], leaveAt?: Tile): Routed {
  const { c, ctx, occ, fronts } = B;
  const ends = resolveEnds(c, from, to, ctx);
  if (typeof ends === 'string') return why(ends);
  const { fromM, toM, fromP, toP } = ends;
  const live = belts.filter((b) => !b.broken);
  const net = endKey(from);
  const network = live.filter((b) => netOf(b) === net);
  const direct = network.some((b) => !b.path.length);
  if (touching(ends) && !direct && !via.length && !leaveAt) return { path: [] };
  const layer = new Layer(live);
  const sc = beltScope(c, ends, ctx);
  const isOtherDoorstep = (k: string) => { const f = fronts.get(k); return !!f && !isEnd(f.m, f.p, from) && !isEnd(f.m, f.p, to); };
  /** Blocker of an approach cell (null = free). */
  const cellBlock = (t: Tile, startCell: boolean): Why | null => {
    const k = tileKey(t);
    const owner = occ.get(k);
    if (owner !== undefined) { const o = c.machines.find((x) => x.id === owner)!; return why(`${who(o, ctx)}`, [owner]); }
    if (sc.ok && !sc.allow(t)) return why('the room wall', [roomAt(c, t)?.id ?? roomOfMachine(c, startCell ? fromM : toM, ctx)?.id ?? (startCell ? fromM : toM).id]);
    if (isOtherDoorstep(k)) { const f = fronts.get(k)!; return why(`${portName(f.m, f.p, ctx)}`, [f.m.id]); }
    const os = layer.others(t, net);
    if (os.length) { const b = live.find((x) => x.id === os[0]!.belts[0])!; return why(beltName(c, b, ctx), os.flatMap((o) => o.belts)); }
    if (!startCell && layer.own(t, net)) return why('its own belt', []);
    return null;
  };

  // Goals: the input's free approaches. Side approaches are a second resort (phase 2), used only when the
  // doorstep is taken or no route reaches it — e.g. a fan-out beside a direct link, a gate fed from the side.
  const arrAll = approaches(toM, toP, ctx);
  const depAll = approaches(fromM, fromP, ctx);
  const attempt = (sides: boolean): Routed => {
  const arr = sides || toM.kind === 'socket' ? arrAll : arrAll.slice(0, 1);
  const goals = new Map<string, { dir: Face | null; cost: number }>();
  for (const a of arr) if (!cellBlock(a.tile, false)) goals.set(tileKey(a.tile), { dir: OPPOSITE[a.dir], cost: a.cost });
  if (!goals.size) {
    const b = cellBlock(arr[0]!.tile, false)!;
    return why(`no route: ${portName(toM, toP, ctx)} faces ${b.reason}.`, b.blockers);
  }
  // Seeds: cells of the own tree (not crossings, not doorsteps, in scope) and the output's free approaches.
  let seeds: Seed[] = [];
  const seen = new Set<string>();
  for (const b of network) b.path.forEach((t, i) => {
    const k = tileKey(t); if (seen.has(k)) return; seen.add(k);
    if (layer.others(t, net).length || isOtherDoorstep(k) || (sc.ok && !sc.allow(t))) return;
    seeds.push({ tile: t, dir: i === 0 ? dirOf(fromP.tile, t) : dirOf(b.path[i - 1]!, t), prefix: b.path.slice(0, i) });
  });
  const dep = sides ? depAll : depAll.slice(0, 1);
  for (const a of dep) if (!seen.has(tileKey(a.tile)) && !cellBlock(a.tile, true)) seeds.push({ tile: a.tile, dir: a.dir, prefix: [], cost: a.cost });
  if (leaveAt) seeds = seeds.filter((sd) => tileEq(sd.tile, leaveAt));
  if (!seeds.length) {
    if (leaveAt) return why('A branch cannot leave the belt at that cell (a crossing, a doorstep or a wall) — drag from another cell.');
    const b = cellBlock(dep[0]!.tile, true) ?? why('its own belts');
    return why(`no route: ${portName(fromM, fromP, ctx)} faces ${b.reason}.`, b.blockers);
  }
  const bounds = boundsOf(c, ctx, [...dep.map((a) => a.tile), ...arr.map((a) => a.tile), ...via]);
  const hug = new Set<string>();
  for (const m of [fromM, toM]) for (const t of footprint(m, ctx)) for (const d of FACES) hug.add(tileKey(addTile(t, FACE_DELTA[d])));
  for (const a of [...dep, ...arr]) hug.delete(tileKey(a.tile));
  // The cell beyond each free input's doorstep is its approach: unrelated belts avoid it if they can.
  const usedEnds = new Set(live.flatMap((b) => [endKey(b.from), endKey(b.to)]));
  const approach = new Set<string>();
  for (const [, f] of fronts) {
    if (f.p.dir !== 'in' || isEnd(f.m, f.p, to) || usedEnds.has(endKey({ m: f.m.id, port: f.p.id }))) continue;
    approach.add(tileKey(addTile(frontOf(f.p), FACE_DELTA[f.p.face])));
  }

  // weights: null = hard; numbers = relaxed costs used only to find the fewest blockers when no route exists.
  type W = { belt: number | null; machine: number | null };
  const search = (w: W, extra: Set<string>): Tile[] | null => {
    const targets: Map<string, { dir: Face | null; cost: number }>[] = [
      ...via.map((t) => new Map([[tileKey(t), { dir: null as Face | null, cost: 0 }]])),
      goals,
    ];
    let sd = seeds;
    let acc: Tile[] | null = null;
    const used = new Set<string>(extra);
    for (const target of targets) {
      const isGoal = target === goals;
      const enter = (a: Tile, t: Tile, d: Face): number | null => {
        const k = tileKey(t);
        if (used.has(k)) return null;
        if (sc.ok && !sc.step(a, t)) return null;
        let cost = hug.has(k) ? WRAP : 0;
        if (approach.has(k)) cost += APPROACH;
        if (occ.has(k) || isOtherDoorstep(k)) { if (w.machine === null) return null; cost += w.machine; }
        if (layer.own(t, net)) return null;                // never rejoin the own tree
        const os = layer.others(t, net);
        if (os.length) {
          const crossable = !target.has(k) && os.length === 1 && os[0]!.mode !== 'X' && os[0]!.mode !== axisOf(d);
          if (!crossable) { if (w.belt === null) return null; cost += w.belt; } else cost += CROSS;
        }
        return cost;
      };
      const straight = (t: Tile) => { const os = layer.others(t, net); return os.length === 1 && os[0]!.mode !== 'X'; };
      const r = astar(sd, target, bounds, enter, straight);
      if (!r) return null;
      acc = r.path;
      for (const t of acc) used.add(tileKey(t));
      if (!isGoal) { const last = acc[acc.length - 1]!; sd = [{ tile: last, dir: r.dir, prefix: acc.slice(0, -1) }]; }
    }
    return acc;
  };

  /**
   * Would this path wall a free port's doorstep into a small pocket? Flood from the doorstep over cells a belt
   * could use (not machines, other doorsteps, exclusive belt cells or the path); a region under POCKET cells is
   * sealed, and the path cells around it are returned so the next try avoids them.
   */
  const POCKET = 40;
  const pocket = (f: Tile, onPath: Set<string>): Set<string> | null => {
    const seenP = new Set([tileKey(f)]);
    const queue = [f];
    const border = new Set<string>();
    while (queue.length && seenP.size < POCKET) {
      const t = queue.shift()!;
      for (const d of FACES) {
        const n = addTile(t, FACE_DELTA[d]); const k = tileKey(n);
        if (seenP.has(k) || !inRect(n, bounds)) continue;
        if (onPath.has(k)) { border.add(k); continue; }
        if (occ.has(k) || (fronts.has(k) && !tileEq(n, f)) || layer.others(n, net).some((o) => o.mode === 'X') || layer.own(n, net)) continue;
        seenP.add(k); queue.push(n);
      }
    }
    return seenP.size < POCKET && border.size ? border : null;
  };
  // Do not wall in a still-free port: retry with the walling cells forbidden; if nothing better, keep the first.
  const freeFronts: Tile[] = [];
  for (const [k, f] of fronts) {
    if (isEnd(f.m, f.p, from) || isEnd(f.m, f.p, to) || usedEnds.has(endKey({ m: f.m.id, port: f.p.id })) || occ.has(k)) continue;
    freeFronts.push(frontOf(f.p));
  }
  const extra = new Set<string>();
  let firstPath: Tile[] | null = null;
  for (let tries = 0; tries < 4; tries++) {
    const p = search({ belt: null, machine: null }, extra);
    if (!p) break;
    firstPath ??= p;
    const onPath = new Set(p.map(tileKey));
    let sealed = false;
    for (const f of freeFronts) {
      if (onPath.has(tileKey(f))) continue;
      const border = pocket(f, onPath);
      if (border) for (const k of border) if (!seeds.some((x) => tileKey(x.tile) === k) && !goals.has(k)) { extra.add(k); sealed = true; }
    }
    if (!sealed) return { path: p };
  }
  if (firstPath) return { path: firstPath };

  // No route. Find the fewest things in the way: belts are cheaper to blame than machines.
  const relaxed = search({ belt: 400, machine: 4000 }, new Set());
  if (relaxed) {
    const beltIds: string[] = [];
    const machineIds: string[] = [];
    const modes = cellModes(relaxed);
    relaxed.forEach((t, i) => {
      const k = tileKey(t);
      const mid = occ.get(k) ?? (isOtherDoorstep(k) ? fronts.get(k)!.m.id : undefined);
      if (mid !== undefined && !machineIds.includes(mid)) machineIds.push(mid);
      for (const id of layer.clash(t, net, modes[i]!)) if (!beltIds.includes(id)) beltIds.push(id);
    });
    if (machineIds.length) {
      const names = [...new Set(machineIds.map((id) => who(c.machines.find((x) => x.id === id)!, ctx)))];
      const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
      return why(`no route: ${list} wall${names.length > 1 ? '' : 's'} ${who(fromM, ctx)} off from ${who(toM, ctx)} — leave a gap or move one.`, [...machineIds, ...beltIds]);
    }
    if (beltIds.length) {
      const names = [...new Set(beltIds.map((id) => beltName(c, live.find((b) => b.id === id)!, ctx)))];
      return why(`no route: sealed by ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ' and others' : ''}.`, beltIds);
    }
  }
  const room = roomOfMachine(c, toM, ctx) ?? roomOfMachine(c, fromM, ctx);
  return why(sc.ok ? 'no route inside the room walls between these ports.' : 'no route between these ports.', room ? [room.id] : []);
  };
  const first = attempt(false);
  return isWhy(first) ? attempt(true) : first;
}

/**
 * Re-validate every belt after an edit. Untouched belts are kept when still legal; suspects next; broken belts
 * last. An illegal belt is re-routed; if no route exists it is KEPT with `broken` naming the blocker (its last
 * good path stays for drawing). A broken belt that can be routed again is repaired. Order is preserved.
 */
function settle(c: Canvas, ctx: KernelCtx, suspects: Set<string>): { canvas: Canvas; broken: Belt[] } {
  const B = beltCtx(c, ctx);
  const order = [
    ...c.belts.filter((b) => !b.broken && !suspects.has(b.id)),
    ...c.belts.filter((b) => !b.broken && suspects.has(b.id)),
    ...c.belts.filter((b) => b.broken),
  ];
  const kept: Belt[] = [];
  const fed = new Set<string>();
  const out = new Map<string, Belt>();
  const breakIt = (b: Belt, reason: string) => out.set(b.id, { ...b, broken: reason });
  for (const b of order) {
    const ends = resolveEnds(c, b.from, b.to, ctx);
    if (typeof ends === 'string') { breakIt(b, ends); continue; }
    if (ends.fromP.dir !== 'out' || ends.toP.dir !== 'in') { breakIt(b, 'This belt no longer runs from an output to an input.'); continue; }
    if (fed.has(endKey(b.to))) { breakIt(b, `Another belt already feeds ${portName(ends.toM, ends.toP, ctx)}.`); continue; }
    let path: Tile[] | null = null;
    if (!b.broken && !pathWhy(B, kept, b.from, b.to, b.path)) path = b.path;
    else {
      const r = routeWhy(B, kept, b.from, b.to);
      if (isWhy(r)) { breakIt(b, `re-route me — ${r.reason}`); continue; }
      path = r.path;
    }
    const { broken: _gone, ...rest } = b; void _gone;
    const nb: Belt = { ...rest, path };
    kept.push(nb); fed.add(endKey(b.to)); out.set(b.id, nb);
  }
  const belts = c.belts.map((b) => out.get(b.id)!);
  const broken = belts.filter((b) => b.broken && !c.belts.find((x) => x.id === b.id)!.broken);
  return { canvas: { ...c, belts }, broken };
}

/** settle, then turn newly broken belts into an Edit note. */
function settled(c: Canvas, ctx: KernelCtx, suspects: Set<string>, ids: string[]): Edit {
  const s = settle(c, ctx, suspects);
  return okNote(s.canvas, ids, s.broken);
}
function okNote(canvas: Canvas, ids: string[], broken: Belt[]): Edit {
  if (!broken.length) return { ok: true, canvas, ids };
  const note = broken.length === 1
    ? `A belt needs re-routing: ${broken[0]!.broken!.replace(/^re-route me — /, '')}`
    : `${broken.length} belts need re-routing (dashed): ${broken[0]!.broken!.replace(/^re-route me — /, '')}`;
  return { ok: true, canvas, ids, note, broken: broken.map((b) => b.id) };
}

/**
 * Direct links a machine would make where it stands: each of its ports that touches an opposite, compatible,
 * unfed port of another machine (output front = input cell and vice versa). For the placement ghost and place().
 */
export function autoLinks(c: Canvas, m: Machine, ctx: KernelCtx): { from: Endpoint; to: Endpoint }[] {
  const out: { from: Endpoint; to: Endpoint }[] = [];
  const cell = new Map<string, { m: Machine; p: Port }[]>();
  for (const o of c.machines) if (o.id !== m.id) for (const p of portsOf(o, ctx)) {
    const k = tileKey(p.tile); cell.set(k, [...(cell.get(k) ?? []), { m: o, p }]);
  }
  // A broken feed does not count: the direct link replaces it. An output may fan out freely.
  const fed = new Set(c.belts.filter((b) => !b.broken).map((b) => endKey(b.to)));
  for (const p of portsOf(m, ctx)) for (const q of cell.get(tileKey(frontOf(p))) ?? []) {
    if (!tileEq(frontOf(q.p), p.tile) || p.dir === q.p.dir) continue;
    const [o, i] = p.dir === 'out' ? [{ m: m.id, port: p.id }, { m: q.m.id, port: q.p.id }] : [{ m: q.m.id, port: q.p.id }, { m: m.id, port: p.id }];
    const oa = p.dir === 'out' ? p.accepts : q.p.accepts, ia = p.dir === 'out' ? q.p.accepts : p.accepts;
    if (!oa.some((k) => ia.includes(k))) continue;
    if (fed.has(endKey(i))) continue;
    out.push({ from: o, to: i });
  }
  return out;
}

export interface Splice { belt: string; from: Endpoint; to: Endpoint; into: Endpoint; outOf: Endpoint }
/**
 * Belts a machine would splice into where it stands (Factorio/shapez inline insertion). Only a machine dropped
 * ON a belt, lined up with it: the belt runs into the machine's work-input doorstep, straight through the
 * footprint, and out of its output doorstep (in that order). The belt's item must fit the work input and the
 * machine's output must fit the belt's target. A belt merely passing nearby never splices. The floor previews
 * these; place() splices iff exactly one.
 */
export function spliceCandidates(c: Canvas, m: Machine, ctx: KernelCtx): Splice[] {
  const ps = portsOf(m, ctx);
  const q = ps.find((p) => p.id === 'q' && p.dir === 'in'), out = ps.find((p) => p.id === 'out' && p.dir === 'out');
  if (!q || !out) return [];
  const fp = new Set(footprint(m, ctx).map(tileKey));
  const fq = tileKey(frontOf(q)), fo = tileKey(frontOf(out));
  const res: Splice[] = [];
  for (const b of c.belts) {
    if (b.broken || b.from.m === m.id || b.to.m === m.id) continue;
    const keys = b.path.map(tileKey);
    const i = keys.indexOf(fq), j = keys.indexOf(fo);
    if (i < 0 || j < 0 || j - i < 2) continue;
    if (!keys.slice(i + 1, j).every((k) => fp.has(k))) continue;
    const e = resolveEnds(c, b.from, b.to, ctx);
    if (typeof e === 'string') continue;
    if (!e.fromP.accepts.some((k) => q.accepts.includes(k)) || !out.accepts.some((k) => e.toP.accepts.includes(k))) continue;
    res.push({ belt: b.id, from: b.from, to: b.to, into: { m: m.id, port: 'q' }, outOf: { m: m.id, port: 'out' } });
  }
  return res;
}

const attached = (c: Canvas, ids: Set<string>) => new Set(c.belts.filter((b) => ids.has(b.from.m) || ids.has(b.to.m)).map((b) => b.id));

// ───────────────────────────── initial canvas ─────────────────────────────

/** Empty floor between the west inlets and the east docks. */
export const INITIAL_GAP = 10;

/**
 * The level's starting floor. West column (x = 0): given inlets, then pre-start spools, one empty row between
 * each. East column: receiving docks (2×2), one empty row between. INITIAL_GAP empty tiles between the columns.
 * The shorter column is centred against the taller. Ids: `given:<id>`, `pre:<i>`, `socket:<id>`; all locked.
 */
export function initialCanvas(level: LevelManifest, ctx: KernelCtx): Canvas {
  rememberCtx(ctx);
  const west: Machine[] = [
    ...level.givens.map((g): Machine => ({ id: `given:${g.id}`, kind: 'given', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'given', givenId: g.id }, locked: true })),
    ...(level.preStarts ?? []).map((t, i): Machine => ({ id: `pre:${i}`, kind: 'spool', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'spool', t: { k: 'knob', term: t } }, locked: true })),
  ];
  const east: Machine[] = level.sockets.map((s): Machine => ({ id: `socket:${s.id}`, kind: 'socket', at: { x: 0, y: 0 }, rot: 0, config: { kind: 'socket', socketId: s.id }, locked: true }));
  const stack = (ms: Machine[]): number => { let y = 0; for (const m of ms) { m.at = { x: m.at.x, y }; y += sizeOf(m, ctx).h + 1; } return Math.max(0, y - 1); };
  const hw = stack(west), he = stack(east);
  const westW = Math.max(1, ...west.map((m) => sizeOf(m, ctx).w));
  const dyW = Math.floor(Math.max(0, he - hw) / 2), dyE = Math.floor(Math.max(0, hw - he) / 2);
  for (const m of west) m.at = { x: 0, y: m.at.y + dyW };
  for (const m of east) m.at = { x: westW + INITIAL_GAP, y: m.at.y + dyE };
  return { version: 3, levelId: level.id, machines: [...west, ...east], belts: [], rooms: [] };
}

// ───────────────────────────── place / move / rotate ─────────────────────────────

/** Place a machine (fails on overlap or straddling a room wall). Belts under it are re-routed or dropped. */
export function place(c: Canvas, kind: MachineKind, at: Tile, rot: Rot, ctx: KernelCtx, config?: MachineConfig): Edit {
  try { return placeUnsafe(c, kind, at, rot, ctx, config); } catch (e) { return no(`That cannot be built: ${(e as Error)?.message ?? 'malformed input'}.`); }
}
function placeUnsafe(c: Canvas, kind: MachineKind, at: Tile, rot: Rot, ctx: KernelCtx, config?: MachineConfig): Edit {
  rememberCtx(ctx);
  const spec = SPECS[kind];
  if (!spec) return no(`Unknown machine “${kind}”.`);
  if (!spec.placeable) return no(`The ${spec.name} is placed by the order or its room, not from the hotbar.`);
  const cfg = config ?? defaultConfig(kind, ctx);
  if (cfg.kind !== kind) return no(`That configuration belongs to a ${SPECS[cfg.kind]?.name ?? cfg.kind}.`);
  const bad = configReason(cfg, ctx);
  if (bad) return no(bad);
  const id = freshId(allIds(c), kind);
  const m: Machine = { id, kind, at: { x: at.x, y: at.y }, rot: (((rot % 4) + 4) % 4) as Rot, config: clone(cfg) };
  const w = fitReason(c, [m], ctx, new Set());
  if (w) return noWhy(w);
  const cells = new Set(footprint(m, ctx).map(tileKey));
  const under = new Set(c.belts.filter((b) => b.path.some((t) => cells.has(tileKey(t)))).map((b) => b.id));
  // Dropped onto (or beside) exactly one compatible belt: splice into the line.
  const sp = spliceCandidates(c, m, ctx);
  if (sp.length === 1) {
    const x = sp[0]!;
    const taken = allIds(c); taken.add(id);
    const old = c.belts.find((b) => b.id === x.belt)!;
    const nb: Belt[] = [
      { id: freshId(taken, 'b'), from: { ...x.from }, to: { ...x.into }, path: [] },
      { id: freshId(taken, 'b'), from: { ...x.outOf }, to: { ...x.to }, path: [] },
    ];
    const cand = { ...c, machines: [...c.machines, m], belts: [...c.belts.filter((b) => b.id !== x.belt), ...nb] };
    const s = settle(cand, ctx, new Set([...under, ...nb.map((b) => b.id)]));
    if (!s.broken.some((b) => nb.some((n) => n.id === b.id))) {
      const r = okNote(s.canvas, [id, ...nb.map((b) => b.id)], s.broken);
      const src = c.machines.find((mm) => mm.id === old.from.m);
      const msg = `Spliced into the belt from ${src ? who(src, ctx) : 'its source'}.`;
      return r.ok ? { ...r, note: [msg, r.note].filter(Boolean).join(' ') } : r;
    }
  }
  const s = settle({ ...c, machines: [...c.machines, m] }, ctx, under);
  // Flush against a compatible port: link directly (path []), replacing a broken feed if there is one.
  const links = autoLinks(s.canvas, m, ctx);
  const taken = allIds(s.canvas);
  const direct: Belt[] = links.map((l) => ({ id: freshId(taken, 'b'), from: l.from, to: l.to, path: [] }));
  const belts = s.canvas.belts.filter((b) => !(b.broken && direct.some((d) => sameEnd(d.to, b.to))));
  return okNote({ ...s.canvas, belts: [...belts, ...direct] }, [id, ...direct.map((b) => b.id)], s.broken.filter((b) => belts.includes(b)));
}

/**
 * Move machines (and rooms: a room id moves its rect and everything wholly inside it) by delta.
 * Belts between moved machines move with them; belts to the outside are re-routed or dropped.
 */
export function moveMachines(c: Canvas, ids: string[], delta: Tile, ctx: KernelCtx): Edit {
  rememberCtx(ctx);
  const roomIds = new Set(ids.filter((id) => c.rooms.some((r) => r.id === id)));
  // A moved room carries its nested rooms and every machine inside it.
  for (const r of c.rooms) for (const rid of [...roomIds]) {
    const R = c.rooms.find((x) => x.id === rid)!;
    if (r.id !== rid && rectInside(r.rect, R.rect)) roomIds.add(r.id);
  }
  const moving = new Set(ids.filter((id) => c.machines.some((m) => m.id === id)));
  for (const m of c.machines) {
    const t = footprint(m, ctx)[0]!;
    if ([...roomIds].some((rid) => inRect(t, c.rooms.find((r) => r.id === rid)!.rect))) moving.add(m.id);
    if ((m.config.kind === 'desk' || m.config.kind === 'gate') && roomIds.has(m.config.room)) moving.add(m.id);
  }
  if (!moving.size && !roomIds.size) return no('Nothing to move.');
  if (delta.x === 0 && delta.y === 0) return ok(c, [...moving, ...roomIds]);

  const rooms = c.rooms.map((r) => (roomIds.has(r.id) ? { ...r, rect: { ...r.rect, x: r.rect.x + delta.x, y: r.rect.y + delta.y } } : r));
  const rr = roomSetReason(rooms);
  if (rr) return no(rr);
  const machines = c.machines.map((m) => {
    if (!moving.has(m.id)) return m;
    const n: Machine = { ...m, at: addTile(m.at, delta) };
    if (n.config.kind === 'gate' && !roomIds.has(n.config.room)) {
      const own = rooms.find((r) => r.id === (n.config as { room: string }).room);
      const gr = own ? gateRot(n.at, own.rect, n.rot) : null;
      if (gr === null) return n; // fitReason reports it
      n.rot = gr;
    }
    return n;
  });
  const movedMs = machines.filter((m) => moving.has(m.id));
  // Every machine must still respect every room (moved rooms can swallow or cut stationary machines).
  const w = fitReason({ ...c, machines }, movedMs, ctx, new Set(), rooms);
  if (w) return noWhy(w);
  for (const m of machines) if (!moving.has(m.id)) {
    const cells = footprint(m, ctx);
    const rr = roomReason(m, cells, rooms, ctx);
    if (rr) return no(rr, [m.id, ...roomBlockers(m, cells, rooms)]);
  }
  const internal = new Set(c.belts.filter((b) => moving.has(b.from.m) && moving.has(b.to.m)).map((b) => b.id));
  const belts = c.belts.map((b) => (internal.has(b.id) ? { ...b, path: b.path.map((t) => addTile(t, delta)) } : b));
  const suspects = attached(c, moving);
  for (const id of internal) suspects.delete(id);
  // Internal belts are processed after untouched ones but before belts to the outside.
  const s = settleOrdered({ ...c, machines, rooms, belts }, ctx, internal, suspects);
  return okNote(s.canvas, [...moving, ...roomIds], s.broken);
}

/** settle with two suspect tiers: first `a`, then `b`. */
function settleOrdered(c: Canvas, ctx: KernelCtx, a: Set<string>, b: Set<string>): { canvas: Canvas; broken: Belt[] } {
  if (!a.size) return settle(c, ctx, b);
  // Order: untouched, then tier a, then tier b (broken belts always last inside settle).
  const order = [...c.belts.filter((x) => !a.has(x.id) && !b.has(x.id)), ...c.belts.filter((x) => a.has(x.id)), ...c.belts.filter((x) => b.has(x.id) && !a.has(x.id))];
  const s = settle({ ...c, belts: order }, ctx, b);
  const byId = new Map(s.canvas.belts.map((x) => [x.id, x]));
  return { canvas: { ...s.canvas, belts: c.belts.map((x) => byId.get(x.id)!) }, broken: s.broken };
}

/** Rotate a machine a quarter turn clockwise about its minimum corner. Exit Gates keep facing out of their room. */
export function rotateMachine(c: Canvas, id: string, ctx: KernelCtx): Edit {
  rememberCtx(ctx);
  const m = c.machines.find((x) => x.id === id);
  if (!m) return no('That machine is gone.');
  if (m.kind === 'gate') return no('The Exit Gate always faces out of its room — move it along the wall instead.');
  const n: Machine = { ...m, rot: ((m.rot + 1) % 4) as Rot };
  const w = fitReason(c, [n], ctx, new Set());
  if (w) return noWhy(w);
  const machines = c.machines.map((x) => (x.id === id ? n : x));
  return settled({ ...c, machines }, ctx, attached(c, new Set([id])), [id]);
}

// ───────────────────────────── remove / configure ─────────────────────────────

/** Remove machines (unlocked only), belts, rooms (with their desk and gate). A machine takes its belts with it. */
export function remove(c: Canvas, ids: string[]): Edit {
  const want = new Set(ids);
  const rooms = new Set(c.rooms.filter((r) => want.has(r.id)).map((r) => r.id));
  const gone = new Set<string>();
  let refused: string | null = null;
  for (const m of c.machines) {
    const roomPart = (m.config.kind === 'desk' || m.config.kind === 'gate') ? m.config.room : null;
    if (roomPart !== null && rooms.has(roomPart)) { gone.add(m.id); continue; }
    if (!want.has(m.id)) continue;
    if (roomPart !== null) { refused = 'The desk and gate belong to their room — remove the room instead.'; continue; }
    if (m.locked) { refused = `The ${nameOf(m)} is part of this order and stays.`; continue; }
    gone.add(m.id);
  }
  const belts = c.belts.filter((b) => !want.has(b.id) && !gone.has(b.from.m) && !gone.has(b.to.m));
  const removedSomething = gone.size > 0 || rooms.size > 0 || belts.length !== c.belts.length;
  if (!removedSomething) return no(refused ?? 'Nothing to remove.', refused ? ids.filter((id) => c.machines.some((m) => m.id === id)) : undefined);
  const next = { ...c, machines: c.machines.filter((m) => !gone.has(m.id)), belts, rooms: c.rooms.filter((r) => !rooms.has(r.id)) };
  // Removed ids include every belt that went with its machine. Freed space may repair broken belts.
  return retryBroken(next, geometryCtx(next), [...gone, ...rooms, ...c.belts.filter((b) => !belts.includes(b)).map((b) => b.id)]);
}

/** Any edit re-attempts broken belts; a no-op when there are none. */
function retryBroken(c: Canvas, ctx: KernelCtx | null, ids: string[]): Edit {
  if (!ctx || !c.belts.some((b) => b.broken)) return ok(c, ids);
  return settled(c, ctx, new Set(), ids);
}

/** A configuration must be a finite tree of plain data (terms in knobs/pins can arrive from untrusted saves). */
function malformedReason(x: unknown): string | null {
  const stack = new Set<object>();
  let nodes = 0;
  const walk = (v: unknown, depth: number): string | null => {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? 'That configuration is malformed.' : null;
    if (stack.has(v)) return 'That term is malformed: it contains itself.';
    if (depth > 400 || ++nodes > 100_000) return 'That term is too deep to build.';
    stack.add(v);
    for (const k of Object.keys(v)) { const r = walk((v as Record<string, unknown>)[k], depth + 1); if (r) return r; }
    stack.delete(v);
    return null;
  };
  return walk(x, 0);
}

/** Static validation of a configuration (not legality — the compiler/kernel decide that). */
function configReason(cfg: MachineConfig, ctx: KernelCtx): string | null {
  const bad = malformedReason(cfg);
  if (bad) return bad;
  switch (cfg.kind) {
    case 'apply':
      if (!Number.isInteger(cfg.premises) || cfg.premises < 0 || cfg.premises > 8) return 'Apply takes 0 to 8 premises.';
      if (!Number.isInteger(cfg.choice) || cfg.choice < 0) return 'Choose a binding.';
      return null;
    case 'stamp': case 'carddock': {
      const s = ctx.registry[cfg.schema];
      if (!s) return cfg.schema ? `No theorem called “${cfg.schema}”.` : 'No earned theorem to build yet.';
      if (cfg.kind === 'stamp' && s.card.k !== 'cond') return `${s.name} is a law — use a Card Dock for it.`;
      if (cfg.kind === 'carddock' && s.card.k !== 'law') return `${s.name} has premises — use its stamp.`;
      if (cfg.mirror && !s.mirrorable) return `${s.name} has no mirror image.`;
      if (cfg.kind === 'stamp' && (!Number.isInteger(cfg.choice) || cfg.choice < 0)) return 'Choose a binding.';
      return null;
    }
    default: return null;
  }
}

/** Reconfigure a machine. Ports may appear/disappear; a bigger footprint needs space (refused otherwise). */
export function setConfig(c: Canvas, id: string, config: MachineConfig): Edit {
  const ctx = geometryCtx(c);
  if (!ctx) return no('The editor has no level context for this floor — use setConfigCtx.');
  return setConfigCtx(c, id, config, ctx);
}

/**
 * setConfig's contract has no KernelCtx, but footprints need one (given widths, premise counts). Geometry only
 * reads static level data (givens, sockets, atoms) and the registry, so it is recovered from the canvas's level
 * (or the last context an editor op saw for that level, e.g. an ad-hoc test level). Prefer setConfigCtx.
 */
const CTX_REF: { ctx: KernelCtx | null } = { ctx: null };
export function rememberCtx(ctx: KernelCtx) { CTX_REF.ctx = ctx; }
function geometryCtx(c: Canvas): KernelCtx | null {
  if (CTX_REF.ctx && CTX_REF.ctx.level.id === c.levelId) return CTX_REF.ctx;
  const level = LEVEL_BY_ID[c.levelId];
  return level ? { level, registry: REGISTRY } : null;
}

export function setConfigCtx(c: Canvas, id: string, config: MachineConfig, ctx: KernelCtx): Edit {
  try { return setConfigCtxUnsafe(c, id, config, ctx); } catch (e) { return no(`That cannot be built: ${(e as Error)?.message ?? 'malformed input'}.`); }
}
function setConfigCtxUnsafe(c: Canvas, id: string, config: MachineConfig, ctx: KernelCtx): Edit {
  const m = c.machines.find((x) => x.id === id);
  if (!m) return no('That machine is gone.');
  if (config.kind !== m.kind) return no(`That configuration belongs to a ${SPECS[config.kind]?.name ?? config.kind}.`);
  if (m.locked || m.kind === 'given' || m.kind === 'socket' || m.kind === 'desk' || m.kind === 'gate') {
    if (JSON.stringify(config) !== JSON.stringify(m.config)) return no(`The ${nameOf(m)} is fixed by the ${m.kind === 'desk' || m.kind === 'gate' ? 'room' : 'order'}.`);
    return ok(c, [id]);
  }
  if (!ctx) return no('The editor has no level context yet.');
  const bad = configReason(config, ctx);
  if (bad) return no(bad);
  const n: Machine = { ...m, config: clone(config) };
  const w = fitReason(c, [n], ctx, new Set());
  if (w) {
    const grew = footprint(n, ctx).length > footprint(m, ctx).length;
    return no(grew ? `No room for the new port: ${w.reason.replace(/\.$/, '')} — move ${who(m, ctx)} first.` : w.reason, w.blockers);
  }
  const machines = c.machines.map((x) => (x.id === id ? n : x));
  const cells = new Set(footprint(n, ctx).map(tileKey));
  const suspects = attached(c, new Set([id]));
  for (const b of c.belts) if (b.path.some((t) => cells.has(tileKey(t)))) suspects.add(b.id);
  return settled({ ...c, machines }, ctx, suspects, [id]);
}

// ───────────────────────────── belts ─────────────────────────────

/** Manhattan route from an output port to an input port (or [] for touching ports); null if none. */
export function route(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx, via?: Tile[]): Tile[] | null {
  const r = routeOrWhy(c, from, to, ctx, via);
  return isWhy(r) ? null : r.path;
}

/** route() with the reason and blocker ids when there is no route (for the drag preview). */
export function routeOrWhy(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx, via?: Tile[]): { path: Tile[] } | Why {
  rememberCtx(ctx);
  const f = orient(c, from, to, ctx);
  if (typeof f === 'string') return why(f);
  const r = routeWhy(beltCtx(c, ctx), c.belts.filter((b) => !sameEnd(b.to, f.to)), f.from, f.to, via ?? []);
  return isWhy(r) ? withLeak(c, f.from, f.to, ctx, r) : r;
}

/** Put (from, to) in out → in order if the caller dragged backwards; or explain why it cannot be a belt. */
function orient(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx): { from: Endpoint; to: Endpoint } | string {
  const e = resolveEnds(c, from, to, ctx);
  if (typeof e === 'string') return e;
  if (e.fromP.dir === 'in' && e.toP.dir === 'out') return { from: to, to: from };
  if (e.fromP.dir === 'in') return 'Both ends are inputs — a belt runs from an output to an input.';
  if (e.toP.dir === 'out') return 'Both ends are outputs — a belt runs from an output to an input.';
  return { from, to };
}

/** When a failed belt would also be a scope leak, say so first (only the Exit Gate carries a result out). */
function withLeak(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx, w: Why): Why {
  const ends = resolveEnds(c, from, to, ctx);
  if (typeof ends === 'string' || beltScope(c, ends, ctx).ok) return w;
  const room = roomOfMachine(c, ends.fromM, ctx);
  return why(`This would carry a fact out of its room — only the Exit Gate can. Also ${w.reason}`, [...w.blockers, ...(room ? [room.id] : [])]);
}

/**
 * Connect output → input: an explicit path (or [] for touching ports), else auto-route ([] when touching).
 * An input that is already fed has its old feed replaced (reported in `note`; undo restores it). If belts are
 * in the way, they are ripped up and re-routed around the new one when every one of them still fits.
 * Refuses only impossible endpoints, naming the blocker. Type mismatches and scope leaks are legal.
 */
export function connect(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx, path?: Tile[]): Edit {
  rememberCtx(ctx);
  const f = orient(c, from, to, ctx);
  if (typeof f === 'string') return no(f);
  return addBelt(c, f.from, f.to, ctx, { path });
}

/** Shared by connect / branchAt: replace the old feed, route (with one round of rip-up), retry broken belts. */
function addBelt(c: Canvas, from: Endpoint, to: Endpoint, ctx: KernelCtx, o: { path?: Tile[]; leaveAt?: Tile }): Edit {
  const feeding = c.belts.filter((b) => sameEnd(b.to, to));
  const replaced = feeding.filter((b) => !b.broken && !sameEnd(b.from, from));
  if (feeding.some((b) => !b.broken && sameEnd(b.from, from))) return no('That belt is already there.', feeding.map((b) => b.id));
  const base: Canvas = { ...c, belts: c.belts.filter((b) => !feeding.includes(b)) };
  const B = beltCtx(base, ctx);
  const ends = resolveEnds(base, from, to, ctx);
  if (typeof ends === 'string') return no(ends);
  const notes: string[] = [];
  if (replaced.length) notes.push(`Replaced the feed from ${replaced.map((b) => who(c.machines.find((m) => m.id === b.from.m)!, ctx)).join(' and ')}.`);
  const id = freshId(allIds(c), 'b');
  const finish = (canvas: Canvas) => {
    const r = retryBroken(canvas, ctx, [id]);
    if (!r.ok || !notes.length) return r;
    return { ...r, note: [...notes, r.note].filter(Boolean).join(' ') };
  };
  if (o.path !== undefined && (o.path.length > 0 || touching(ends))) {
    const w = pathWhy(B, base.belts.filter((b) => !b.broken), from, to, o.path);
    if (w) return noWhy(w);
    return finish({ ...base, belts: [...base.belts, { id, from: { ...from }, to: { ...to }, path: o.path.map((t) => ({ x: t.x, y: t.y })) }] });
  }
  const r = routeWhy(B, base.belts, from, to, [], o.leaveAt);
  if (!isWhy(r)) return finish({ ...base, belts: [...base.belts, { id, from: { ...from }, to: { ...to }, path: r.path }] });
  // Rip-up and re-route: lift the belts in the way (then also the endpoint machines' own belts), lay the new
  // one, then re-lay each lifted belt. Commits only if every lifted belt fits again.
  const tryRip = (lift: Set<string>): Canvas | null => {
    if (!lift.size) return null;
    let belts = base.belts.filter((b) => !lift.has(b.id));
    const r2 = routeWhy(B, belts, from, to, [], o.leaveAt);
    if (isWhy(r2)) return null;
    belts = [...belts, { id, from: { ...from }, to: { ...to }, path: r2.path }];
    for (const b of base.belts.filter((x) => lift.has(x.id))) {
      const rr = routeWhy(B, belts, b.from, b.to);
      if (isWhy(rr)) return null;
      belts = [...belts, { ...b, path: rr.path }];
    }
    const byId = new Map(belts.map((b) => [b.id, b]));
    notes.push(`Re-routed ${[...new Set([...lift].map((x) => beltName(c, base.belts.find((b) => b.id === x)!, ctx)))].join(' and ')} to make way.`);
    return { ...base, belts: [...base.belts.map((b) => byId.get(b.id)!), byId.get(id)!] };
  };
  const live = (x: string) => base.belts.some((b) => b.id === x && !b.broken);
  const blockers = new Set(r.blockers.filter(live));
  const own = new Set(base.belts.filter((b) => !b.broken && [from.m, to.m].some((m) => b.from.m === m || b.to.m === m)).map((b) => b.id));
  const ripped = tryRip(blockers) ?? tryRip(new Set([...blockers, ...own]));
  if (ripped) return finish(ripped);
  return noWhy(withLeak(base, from, to, ctx, r));
}

/** Connect via waypoints (the cursor's anchors). */
export function connectVia(c: Canvas, from: Endpoint, to: Endpoint, via: Tile[], ctx: KernelCtx): Edit {
  const f = orient(c, from, to, ctx);
  if (typeof f === 'string') return no(f);
  const r = routeOrWhy(c, f.from, f.to, ctx, via);
  if (isWhy(r)) return noWhy(r);
  return connect(c, f.from, f.to, ctx, r.path);
}

/** Branch: a new belt from the same output as `belt` (free copy) to `to`; it leaves the trunk where it is shortest. */
export function branch(c: Canvas, belt: string, to: Endpoint, ctx: KernelCtx): Edit {
  const b = c.belts.find((x) => x.id === belt);
  if (!b) return no('That belt is gone.');
  return connect(c, b.from, to, ctx);
}

/**
 * Branch off a belt at a chosen tile (the cell the player dragged from): the new belt shares the trunk up to
 * path[i] and leaves from there. Refused (naming the blocker, and the scope if it is a leak) if it cannot.
 */
export function branchAt(c: Canvas, belt: string, i: number, to: Endpoint, ctx: KernelCtx): Edit {
  rememberCtx(ctx);
  const b = c.belts.find((x) => x.id === belt);
  if (!b) return no('That belt is gone.');
  if (b.broken) return no('That belt is broken — re-route it first.', [b.id]);
  const cell = b.path[i];
  const f = orient(c, b.from, to, ctx);
  if (typeof f === 'string') return no(f);
  if (!sameEnd(f.from, b.from)) return no('A branch carries the belt’s item to an input.');
  // Leave at the dragged cell if possible; otherwise anywhere on the tree or beside the port (free fan-out).
  if (cell) { const e = addBelt(c, f.from, f.to, ctx, { leaveAt: cell }); if (e.ok) return e; }
  return addBelt(c, f.from, f.to, ctx, {});
}

// ───────────────────────────── rooms ─────────────────────────────

const MIN_ROOM = { w: 3, h: 3 };

function roomSetReason(rooms: Room[]): string | null {
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i]!.rect, b = rooms[j]!.rect;
    if (rectEq(a, b)) return 'Two rooms cannot cover exactly the same floor.';
    if (!rectsDisjoint(a, b) && !rectInside(a, b) && !rectInside(b, a)) return 'Rooms nest or stay apart — this one would cut through another room.';
  }
  return null;
}

/**
 * Find spots for a room's desk and gate, each with a clear doorstep, never on the same row/approach:
 * the gate centred on the east wall facing out (then south, north, west walls), the desk on the inner west
 * side facing east, on a row next to — not on — the gate's row. Cells avoid machines, belts, other ports'
 * doorsteps and child rooms. Valid kept desk/gate (resize) stay where they are.
 */
function seatRoom(c: Canvas, room: Room, rooms: Room[], ctx: KernelCtx, skip: Set<string>, keepDesk?: Machine, keepGate?: Machine):
  { desk: Machine; gate: Machine } | string {
  const r = room.rect;
  const occ = occupancy(c.machines, ctx, skip);
  const beltCells = new Set(c.belts.filter((b) => !b.broken).flatMap((b) => b.path.map(tileKey)));
  const doorsteps = new Set<string>();
  for (const m of c.machines) if (!skip.has(m.id) && m.id !== keepDesk?.id && m.id !== keepGate?.id) for (const p of portsOf(m, ctx)) doorsteps.add(tileKey(frontOf(p)));
  const children = rooms.filter((x) => x.id !== room.id && rectInside(x.rect, r));
  const inOwn = (t: Tile) => inRect(t, r) && !children.some((ch) => inRect(t, ch.rect));
  const clear = (t: Tile) => !occ.has(tileKey(t)) && !beltCells.has(tileKey(t));
  const free = (t: Tile) => inOwn(t) && clear(t) && !doorsteps.has(tileKey(t));
  const byMid = (lo: number, n: number, mid: number) => Array.from({ length: n }, (_, i) => lo + i).sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q);
  const midY = r.y + Math.floor((r.h - 1) / 2), midX = r.x + Math.floor((r.w - 1) / 2);
  const inner = (g: Machine) => addTile(g.at, FACE_DELTA[OPPOSITE[FACES[g.rot]!]]);

  let gate: Machine | null = null;
  if (keepGate && gateRot(keepGate.at, r, keepGate.rot) !== null && inOwn(keepGate.at)) {
    gate = { ...keepGate, rot: gateRot(keepGate.at, r, keepGate.rot)! };
  } else {
    const walls: { rot: Rot; cells: Tile[] }[] = [
      { rot: 0, cells: byMid(r.y, r.h, midY).map((y) => ({ x: r.x + r.w - 1, y })) },
      { rot: 1, cells: byMid(r.x, r.w, midX).map((x) => ({ x, y: r.y + r.h - 1 })) },
      { rot: 3, cells: byMid(r.x, r.w, midX).map((x) => ({ x, y: r.y })) },
      { rot: 2, cells: byMid(r.y, r.h, midY).map((y) => ({ x: r.x, y })) },
    ];
    const id = keepGate?.id ?? `gate:${room.id}`;
    outer: for (const strict of [true, false]) for (const w of walls) for (const t of w.cells) {
      const g: Machine = { id, kind: 'gate', at: t, rot: w.rot, config: { kind: 'gate', room: room.id }, locked: true };
      const outside = addTile(t, FACE_DELTA[FACES[w.rot]!]);
      if (!free(t) || !clear(outside) || (keepDesk && (tileEq(keepDesk.at, t) || tileEq(frontOf(portsOf(keepDesk, ctx)[0]!), t)))) continue;
      if (strict && (!free(inner(g)) || (keepDesk && tileEq(inner(g), frontOf(portsOf(keepDesk, ctx)[0]!))))) continue;
      gate = g; break outer;
    }
  }
  if (!gate) return 'No free spot on the room’s wall for its Exit Gate.';
  const g = gate;
  const gIn = inner(g);
  let desk: Machine | null = keepDesk ?? null;
  if (!desk) {
    // Rows nearest the gate's, never the gate's own row (when there is another).
    const rowPref = g.rot === 0 || g.rot === 2 ? g.at.y - 1 : midY;
    const rows = byMid(r.y, r.h, rowPref).filter((y) => r.h === 1 || !(g.rot % 2 === 0 && y === g.at.y));
    const ok = (t: Tile) => free(t) && !tileEq(t, g.at) && !tileEq(t, gIn);
    outer2: for (const strict of [true, false]) for (let x = r.x; x < r.x + r.w; x++) for (const y of rows) {
      const t = { x, y };
      if (!ok(t)) continue;
      const rot = ([0, 1, 3, 2] as Rot[]).find((q) => {
        const f = addTile(t, FACE_DELTA[FACES[q]!]);
        return (strict ? free(f) : inOwn(f) && clear(f)) && !tileEq(f, g.at) && !tileEq(f, gIn);
      });
      if (rot === undefined) continue;
      desk = { id: `desk:${room.id}`, kind: 'desk', at: t, rot, config: { kind: 'desk', room: room.id }, locked: true };
      break outer2;
    }
  }
  if (!desk) return 'No free spot inside the room for its Assumption Desk.';
  return { desk, gate: g };
}

/** Paint a room rectangle; creates its desk (inside) and gate (on the boundary). Rooms nest, never partially overlap. */
export function paintRoom(c: Canvas, rect: Rect, kind: Room['kind'], l: Room['l'], r: Room['r'], ctx: KernelCtx): Edit {
  rememberCtx(ctx);
  const R = normRect(rect);
  if (R.w < MIN_ROOM.w || R.h < MIN_ROOM.h) return no(`A room needs at least ${MIN_ROOM.w}×${MIN_ROOM.h} tiles.`);
  const taken = allIds(c);
  const id = freshId(taken, 'room');
  const room: Room = { id, kind, l: clone(l), r: clone(r), rect: R };
  const rooms = [...c.rooms, room];
  const rr = roomSetReason(rooms);
  if (rr) return no(rr);
  for (const m of c.machines) { const why = roomReason(m, footprint(m, ctx), rooms, ctx); if (why) return no(why); }
  const seat = seatRoom(c, room, rooms, ctx, new Set());
  if (typeof seat === 'string') return no(seat);
  const desk = { ...seat.desk, id: taken.has(seat.desk.id) ? freshId(taken, 'desk') : seat.desk.id };
  const gate = { ...seat.gate, id: taken.has(seat.gate.id) ? freshId(taken, 'gate') : seat.gate.id };
  const next = { ...c, rooms, machines: [...c.machines, desk, gate] };
  return retryBroken(next, ctx, [id, desk.id, gate.id]);
}

function normRect(r: Rect): Rect {
  const x0 = Math.min(r.x, r.x + r.w), y0 = Math.min(r.y, r.y + r.h);
  return { x: x0, y: y0, w: Math.abs(r.w), h: Math.abs(r.h) };
}

/** Resize/move a room's rectangle. Its desk and gate stay if still valid, else are re-seated (belts re-routed). */
export function resizeRoom(c: Canvas, room: string, rect: Rect, ctx: KernelCtx): Edit {
  rememberCtx(ctx);
  const old = c.rooms.find((r) => r.id === room);
  if (!old) return no('That room is gone.');
  const R = normRect(rect);
  if (R.w < MIN_ROOM.w || R.h < MIN_ROOM.h) return no(`A room needs at least ${MIN_ROOM.w}×${MIN_ROOM.h} tiles.`);
  const nroom = { ...old, rect: R };
  const rooms = c.rooms.map((r) => (r.id === room ? nroom : r));
  const rr = roomSetReason(rooms);
  if (rr) return no(rr);
  const own = (m: Machine) => (m.config.kind === 'desk' || m.config.kind === 'gate') && m.config.room === room;
  for (const m of c.machines) {
    if (own(m)) continue;
    const why = roomReason(m, footprint(m, ctx), rooms, ctx);
    if (why) return no(why);
  }
  const desk = c.machines.find((m) => own(m) && m.kind === 'desk');
  const gate = c.machines.find((m) => own(m) && m.kind === 'gate');
  const deskOk = desk && !roomReason(desk, footprint(desk, ctx), rooms, ctx) ? desk : undefined;
  const gateKeep = gate && !roomReason(gate, footprint(gate, ctx), rooms, ctx) ? gate : undefined;
  const skip = new Set([desk?.id, gate?.id].filter((x): x is string => !!x));
  const base = { ...c, machines: c.machines.filter((m) => !skip.has(m.id)) };
  const seat = seatRoom(base, nroom, rooms, ctx, new Set(), deskOk, gateKeep ?? gate);
  if (typeof seat === 'string') return no(seat);
  const d = { ...seat.desk, id: desk?.id ?? seat.desk.id }, g = { ...seat.gate, id: gate?.id ?? seat.gate.id };
  const machines = c.machines.map((m) => (m.id === d.id ? d : m.id === g.id ? g : m));
  if (!desk) machines.push(d);
  if (!gate) machines.push(g);
  const next = { ...c, rooms, machines };
  return settled(next, ctx, attached(c, skip), [room]);
}

// ───────────────────────────── picking ─────────────────────────────

/** Top-most thing at a tile: machine > belt > room (innermost). */
export function hit(c: Canvas, t: Tile, ctx: KernelCtx): { k: 'machine'; id: string } | { k: 'belt'; id: string; i: number } | { k: 'room'; id: string } | null {
  for (const m of c.machines) if (inRect(t, rectOf(m, ctx))) return { k: 'machine', id: m.id };
  for (const b of c.belts) { const i = b.path.findIndex((p) => tileEq(p, t)); if (i >= 0) return { k: 'belt', id: b.id, i }; }
  const r = roomAt(c, t);
  return r ? { k: 'room', id: r.id } : null;
}

/** The port (of any machine) whose front cell is t — handy for snapping a dragged belt end. */
export function portFacing(c: Canvas, t: Tile, ctx: KernelCtx, dir?: 'in' | 'out'): { m: string; port: Port } | null {
  for (const m of c.machines) for (const p of portsOf(m, ctx)) if ((!dir || p.dir === dir) && tileEq(frontOf(p), t)) return { m: m.id, port: p };
  return null;
}

// ───────────────────────────── blueprints ─────────────────────────────

const SYSTEM: MachineKind[] = ['given', 'socket', 'desk', 'gate'];

/** Copy the selected player machines and the belts running between them. Locked/system machines are skipped. */
export function copySelection(c: Canvas, ids: string[]): Blueprint {
  const want = new Set(ids);
  const machines = c.machines.filter((m) => want.has(m.id) && !m.locked && !SYSTEM.includes(m.kind));
  const inSel = new Set(machines.map((m) => m.id));
  const belts = c.belts.filter((b) => inSel.has(b.from.m) && inSel.has(b.to.m));
  const origin = machines.length
    ? { x: Math.min(...machines.map((m) => m.at.x)), y: Math.min(...machines.map((m) => m.at.y)) }
    : { x: 0, y: 0 };
  return clone({ machines, belts, origin });
}

/** Paste a blueprint with its origin at `at`: fresh ids; internal belts translated, else re-routed, else dropped. */
export function paste(c: Canvas, bp: Blueprint, at: Tile, ctx: KernelCtx): Edit {
  try { return pasteUnsafe(c, bp, at, ctx); } catch (e) { return no(`That cannot be built: ${(e as Error)?.message ?? 'malformed input'}.`); }
}
function pasteUnsafe(c: Canvas, bp: Blueprint, at: Tile, ctx: KernelCtx): Edit {
  rememberCtx(ctx);
  if (!bp.machines.length) return no('Nothing to paste.');
  const delta = { x: at.x - bp.origin.x, y: at.y - bp.origin.y };
  const taken = allIds(c);
  const idMap = new Map<string, string>();
  const ms: Machine[] = [];
  for (const m of bp.machines) {
    if (SYSTEM.includes(m.kind) || !SPECS[m.kind]?.placeable) continue;
    const bad = configReason(m.config, ctx);
    if (bad) return no(bad);
    const id = freshId(taken, m.kind);
    idMap.set(m.id, id);
    ms.push({ id, kind: m.kind, at: addTile(m.at, delta), rot: m.rot, config: clone(m.config) });
  }
  if (!ms.length) return no('Nothing to paste.');
  const w = fitReason(c, ms, ctx, new Set());
  if (w) return noWhy(w);
  const nb: Belt[] = [];
  for (const b of bp.belts) {
    const f = idMap.get(b.from.m), t = idMap.get(b.to.m);
    if (!f || !t) continue;
    nb.push({ id: freshId(taken, 'b'), from: { m: f, port: b.from.port }, to: { m: t, port: b.to.port }, path: b.path.map((p) => addTile(p, delta)) });
  }
  const cells = new Set(ms.flatMap((m) => footprint(m, ctx).map(tileKey)));
  const under = new Set(c.belts.filter((b) => b.path.some((t) => cells.has(tileKey(t)))).map((b) => b.id));
  const s = settleOrdered({ ...c, machines: [...c.machines, ...ms], belts: [...c.belts, ...nb] }, ctx, new Set(nb.map((b) => b.id)), under);
  return okNote(s.canvas, [...ms.map((m) => m.id), ...nb.map((b) => b.id)], s.broken);
}
