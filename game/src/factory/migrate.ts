// COMMUTATOR v4 — v3 → v4 canvas migration (owner: EDITOR builder).
//
// v3 had one machine per operation; v4 has four verbs with recipes (design/v4/DESIGN.md §1). The mapping:
//   canceller → rewriter{cancel} · popper → rewriter{pop} · expander → rewriter{insertE | insertPair | routed}
//   rewriter(v3) → rewriter{routed} · multiplier → operator{multiply} · swapper → operator{swap}
//   meet → joiner{chain} · anvil → joiner{clash}
//   apply → theorem{routed}, or theorem{library} when its card came straight from a given inlet / card dock
//   stamp → theorem{library schema} · carddock{schema} → carddock{ref} · press → carddock{lagrange}
//   term joiner / inverter → a hopper holding the computed term (or dropped when it cannot be computed)
// Positions, rotations, targets and belts are kept (ports re-keyed); belts are then re-validated like any edit
// (re-routed, or kept broken with a reason). Never throws; returns null when the input is hopeless.
import * as K from '../kernel';
import type { KernelCtx } from '../kernel';
import type { Term } from '../kernel/types';
import type { Belt, Canvas, Endpoint, GapTarget, LibRef, Machine, MachineConfig, MachineKind, Param, Room, Rot, SpanTarget, Tile } from './types';
import { FACES, FACE_DELTA, addTile, footprint, frontOf, portsOf, tileEq, tileKey } from './geometry';
import { initialCanvas, placementWhy, repairBelts } from './editor';

const V4_KINDS = new Set<MachineKind>(['spool', 'tower', 'rewriter', 'operator', 'joiner', 'theorem', 'forall', 'carddock', 'hopper', 'given', 'socket', 'desk', 'gate']);
const LEGACY = new Set(['canceller', 'expander', 'popper', 'multiplier', 'swapper', 'meet', 'apply', 'anvil', 'press', 'inverter', 'stamp']);

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const isTile = (v: unknown): v is Tile => isObj(v) && Number.isInteger(v.x) && Number.isInteger(v.y);
const FIRST = { k: 'first' } as const;
const span = (v: unknown): SpanTarget => (isObj(v) && (v.k === 'first' || v.k === 'pin') ? (v as SpanTarget) : FIRST);
const gapT = (v: unknown): GapTarget => (isObj(v) && (v.k === 'first' || v.k === 'pin') ? (v as GapTarget) : FIRST);
const param = (v: unknown): Param => (isObj(v) && v.k === 'port' ? { k: 'port' } : isObj(v) && v.k === 'knob' ? { k: 'knob', term: (v.term as Term | null) ?? null } : { k: 'knob', term: null });
const values = (v: unknown): Record<string, Param> => {
  const out: Record<string, Param> = {};
  if (isObj(v)) for (const k of Object.keys(v)) out[k] = param(v[k]);
  return out;
};
const dir = (v: unknown): 'fwd' | 'rev' => (v === 'rev' ? 'rev' : 'fwd');
const int0 = (v: unknown): number => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
const rotOf = (v: unknown): Rot => (Number.isInteger(v) ? ((((v as number) % 4) + 4) % 4) as Rot : 0);

/** Is this canvas already v4 (no legacy kinds; verb configs carry recipes)? */
function isV4(machines: Raw[]): boolean {
  return machines.every((m) => {
    const k = m.kind as string, c = (isObj(m.config) ? m.config : {}) as Raw;
    if (LEGACY.has(k)) return false;
    if (k === 'rewriter' || k === 'operator' || k === 'joiner' || k === 'theorem') return 'recipe' in c;
    if (k === 'carddock') return 'ref' in c;
    return true;
  });
}

/** Best-effort v3 → v4 canvas migration. null = give up (the caller starts from initialCanvas). */
export function migrateCanvas(raw: unknown, ctx: KernelCtx): Canvas | null {
  try { return migrateUnsafe(raw, ctx); } catch { return null; }
}

function migrateUnsafe(raw: unknown, ctx: KernelCtx): Canvas | null {
  if (!isObj(raw) || !Array.isArray(raw.machines) || !Array.isArray(raw.belts ?? [])) return null;
  const levelId = typeof raw.levelId === 'string' ? raw.levelId : ctx.level.id;
  if (levelId !== ctx.level.id) return null;
  const rawMs = (raw.machines as unknown[]).filter((m): m is Raw => isObj(m) && typeof m.id === 'string' && typeof m.kind === 'string' && isTile(m.at));
  const rawBs = ((raw.belts as unknown[]) ?? []).filter((b): b is Raw => isObj(b) && typeof b.id === 'string' && isObj(b.from) && (isObj(b.to) || b.to === null));
  const rooms: Room[] = (Array.isArray(raw.rooms) ? raw.rooms : []).filter((r): r is Raw => isObj(r) && typeof r.id === 'string' && isObj(r.rect))
    .map((r) => ({
      id: r.id as string,
      kind: r.kind === 'classical' || r.kind === 'assume' ? r.kind : 'suppose',
      ...(r.kind === 'assume' ? { rel: r.rel === 'neq' ? 'neq' as const : 'eq' as const } : {}),
      l: r.l as Term, r: r.r as Term, rect: r.rect as unknown as Room['rect'],
      // Book phase A: a multi-desk Assume room keeps its assumptions (the kernel validates them)
      ...(r.kind === 'assume' && Array.isArray(r.assumes) ? { assumes: structuredClone(r.assumes) as Room['assumes'] } : {}),
    }));
  const v4 = isV4(rawMs);

  // Belts by endpoint, for following the v3 term network and spotting direct card feeds.
  const feedOf = (m: string, port: string) => rawBs.find((b) => isObj(b.to) && (b.to as Raw).m === m && (b.to as Raw).port === port);
  const byId = new Map(rawMs.map((m) => [m.id as string, m]));

  // Terms computed by v3 term machines (hopper / joiner / inverter chains).
  const termMemo = new Map<string, Term | null>();
  const termOf = (id: string, depth = 0): Term | null => {
    if (termMemo.has(id)) return termMemo.get(id)!;
    if (depth > 64) return null;
    const m = byId.get(id); const c = (m && isObj(m.config) ? m.config : {}) as Raw;
    let t: Term | null = null;
    const src = (port: string) => { const b = feedOf(id, port); return b ? termOf((b.from as Raw).m as string, depth + 1) : null; };
    if (m?.kind === 'hopper') t = (c.t as Term | null) ?? null;
    else if (m?.kind === 'inverter') { const a = src('q'); t = a ? K.inv(a) : null; }
    else if (m?.kind === 'joiner' && !('recipe' in c)) { const a = src('a'), b = src('b'); t = a && b ? K.mul([a, b]) : null; }
    termMemo.set(id, t);
    return t;
  };

  const machines: Machine[] = [];
  const portMap = new Map<string, Map<string, string | null>>(); // machine → v3 port → v4 port (null = drop the belt)
  const dropBelt = new Set<string>();
  const remap = (id: string, map: Record<string, string | null>) => portMap.set(id, new Map(Object.entries(map)));

  for (const m of rawMs) {
    const id = m.id as string, kind = m.kind as string, c = (isObj(m.config) ? m.config : {}) as Raw;
    const base = { id, at: { x: (m.at as Tile).x, y: (m.at as Tile).y }, rot: rotOf(m.rot), ...(m.locked ? { locked: true } : {}) };
    const add = (k: MachineKind, config: MachineConfig) => machines.push({ ...base, kind: k, config });
    const rw = (recipe: Extract<MachineConfig, { kind: 'rewriter' }>['recipe'], extra: Partial<Extract<MachineConfig, { kind: 'rewriter' }>> = {}) =>
      add('rewriter', { kind: 'rewriter', recipe, dir: 'fwd', target: FIRST, gap: FIRST, values: {}, tidy: true, ...extra });
    if (v4 && V4_KINDS.has(kind as MachineKind)) { machines.push({ ...base, kind: kind as MachineKind, config: structuredClone(c) as unknown as MachineConfig }); continue; }
    switch (kind) {
      case 'spool': add('spool', { kind: 'spool', t: param(c.t) }); break;
      case 'hopper': add('hopper', { kind: 'hopper', t: (c.t as Term | null) ?? null }); break;
      case 'given': add('given', { kind: 'given', givenId: String(c.givenId ?? '') }); break;
      case 'socket': add('socket', { kind: 'socket', socketId: String(c.socketId ?? '') }); break;
      case 'desk': add('desk', { kind: 'desk', room: String(c.room ?? ''), ...(Number.isInteger(c.slot) && (c.slot as number) > 0 ? { slot: c.slot as number } : {}) }); break;
      case 'gate': add('gate', { kind: 'gate', room: String(c.room ?? '') }); break;
      case 'canceller': rw({ k: 'cancel' }, { target: span(c.target), tidy: c.tidy !== false }); break;
      case 'popper': rw({ k: 'pop' }, { target: span(c.target) }); break;
      case 'expander': {
        const ins = c.insert, x = param(c.x);
        if (ins === 'pair' || ins === 'pairInv') rw({ k: 'insertPair', inv: ins === 'pairInv', x }, { gap: gapT(c.target), dir: dir(c.dir) });
        else if (ins === 'rule') {
          rw({ k: 'routed' }, { gap: gapT(c.target), dir: dir(c.dir), values: x.k === 'port' ? { x } : x.term ? { x } : {} });
          remap(id, { x: 'meta:x' });
        } else rw({ k: 'insertE' }, { gap: gapT(c.target), dir: dir(c.dir) });
        break;
      }
      case 'rewriter':
        if ('recipe' in c) { machines.push({ ...base, kind: 'rewriter', config: structuredClone(c) as unknown as MachineConfig }); break; }
        rw({ k: 'routed' }, { target: span(c.target), dir: dir(c.dir), values: values(c.values), tidy: c.tidy !== false });
        break;
      case 'multiplier': add('operator', { kind: 'operator', recipe: { k: 'multiply', side: c.side === 'right' ? 'right' : 'left', t: param(c.t) } }); break;
      case 'swapper': add('operator', { kind: 'operator', recipe: { k: 'swap' } }); break;
      case 'meet': add('joiner', { kind: 'joiner', recipe: { k: 'chain' } }); break;
      case 'anvil': add('joiner', { kind: 'joiner', recipe: { k: 'clash' } }); break;
      case 'stamp': {
        const ref: LibRef = { k: 'schema', id: String(c.schema ?? ''), ...(c.mirror ? { mirror: true } : {}) };
        add('theorem', { kind: 'theorem', recipe: { k: 'library', ref }, choice: int0(c.choice), values: values(c.values) });
        break;
      }
      case 'apply': {
        // A card fed straight from a given inlet or a card dock becomes a library recipe (no belt needed).
        const feed = feedOf(id, 'rule');
        const src = feed ? byId.get((feed.from as Raw).m as string) : undefined;
        const sc = (src && isObj(src.config) ? src.config : {}) as Raw;
        let ref: LibRef | null = null;
        if (src?.kind === 'given') {
          const g = ctx.level.givens.find((d) => d.id === sc.givenId);
          if (g && (g.fact.k === 'cond' || g.fact.k === 'law')) ref = { k: 'given', givenId: g.id };
        } else if (src?.kind === 'carddock' && typeof sc.schema === 'string') ref = { k: 'schema', id: sc.schema, ...(sc.mirror ? { mirror: true } : {}) };
        if (ref && feed) dropBelt.add(feed.id as string);
        add('theorem', { kind: 'theorem', recipe: ref ? { k: 'library', ref } : { k: 'routed' }, choice: int0(c.choice), values: values(c.values) });
        remap(id, { rule: ref ? null : 'card' });
        break;
      }
      case 'carddock': {
        if ('ref' in c) { add('carddock', { kind: 'carddock', ref: (c.ref as LibRef | null) ?? null }); break; }
        add('carddock', { kind: 'carddock', ref: typeof c.schema === 'string' && c.schema ? { k: 'schema', id: c.schema, ...(c.mirror ? { mirror: true } : {}) } : null });
        break;
      }
      case 'press':
        add('carddock', { kind: 'carddock', ref: { k: 'lagrange' } });
        remap(id, { q: null });
        break;
      case 'inverter': case 'joiner': {
        if (kind === 'joiner' && 'recipe' in c) { machines.push({ ...base, kind: 'joiner', config: structuredClone(c) as unknown as MachineConfig }); break; }
        const t = termOf(id);
        if (!t) break; // dropped (its belts go with it)
        add('hopper', { kind: 'hopper', t });
        remap(id, { q: null, a: null, b: null });
        break;
      }
      case 'tower': case 'operator': case 'theorem': case 'forall':
        machines.push({ ...base, kind: kind as MachineKind, config: structuredClone(c) as unknown as MachineConfig });
        break;
      default: break; // unknown kind: dropped
    }
  }

  // Every dock in a pre-2×2 canvas was 2×1: grow it to 2×2 keeping its W inlet where it was (see migrateDocks).
  const provisional: Canvas = {
    version: 3, levelId: ctx.level.id, machines, rooms,
    belts: rawBs.filter((b) => isObj(b.to) && Array.isArray(b.path)).map((b) => ({
      id: String(b.id), from: b.from as unknown as Endpoint, to: b.to as unknown as Endpoint,
      path: (b.path as unknown[]).filter(isTile), ...(typeof b.broken === 'string' ? { broken: b.broken } : {}),
    })),
  };
  // a canvas still in v3 shape predates the 2×2 dock outright; a v4-shaped one is judged dock by dock
  const grown = growDocks(machines, rooms, ctx, (m) => !v4 || dockLooksOld(provisional, m, ctx), provisional.belts);
  machines.splice(0, machines.length, ...grown.machines);

  // Machines must still fit (footprints changed size only downwards, but be safe).
  const occ = new Map<string, string>();
  for (const m of machines) for (const t of footprint(m, ctx)) {
    const k = `${t.x},${t.y}`;
    if (occ.has(k)) return null;
    occ.set(k, m.id);
  }
  // The order's own inlets and docks must exist; restore missing ones where they started.
  const init = initialCanvas(ctx.level, ctx);
  for (const m of init.machines) {
    if (m.kind !== 'given' && m.kind !== 'socket' && !m.id.startsWith('pre:')) continue;
    if (machines.some((x) => x.config.kind === m.config.kind && JSON.stringify(x.config) === JSON.stringify(m.config))) continue;
    if (machines.some((x) => x.id === m.id)) continue;
    if (footprint(m, ctx).some((t) => occ.has(`${t.x},${t.y}`))) return null;
    machines.push(m);
    for (const t of footprint(m, ctx)) occ.set(`${t.x},${t.y}`, m.id);
  }

  // Belts: re-key ports; drop belts whose machines are gone or whose port no longer exists in the mapping.
  const present = new Set(machines.map((m) => m.id));
  const belts: Belt[] = [];
  const reKey = (e: Raw): Endpoint | null => {
    const m = String(e.m), port = String(e.port);
    if (!present.has(m)) return null;
    const map = portMap.get(m);
    if (map && map.has(port)) { const p = map.get(port); return p === null || p === undefined ? null : { m, port: p }; }
    return { m, port };
  };
  for (const b of rawBs) {
    if (dropBelt.has(b.id as string)) continue;
    const from = reKey(b.from as Raw);
    const open = b.to === null;                                   // v4.1 open belt (ends on the floor)
    const to = open ? null : reKey(b.to as Raw);
    if (!from || (!open && !to)) continue;
    const path = Array.isArray(b.path) ? (b.path as unknown[]).filter(isTile).map((t) => ({ x: t.x, y: t.y })) : [];
    belts.push({ id: b.id as string, from, to, path, ...(typeof b.broken === 'string' ? { broken: b.broken } : {}) });
  }

  const canvas: Canvas = { version: 3, levelId: ctx.level.id, machines, belts, rooms };
  return reattachDockBelts(canvas, grown.moved, ctx);
}

// ───────────────────────────── the 2×2 Receiving Dock (review 2026-10) ─────────────────────────────
//
// The dock was 2×1 with one inlet 'q' on the W face of local (0,0). It is now 2×2 with four inlets in a pinwheel;
// 'q' (W) sits on local (0,1). An old dock grows by one row toward its local −y, so the old inlet tile and face
// stay put and every old belt still lands on 'q'. If those cells are taken (machines, a room wall, a doorstep) it
// grows toward +y instead; failing that it takes the nearest free spot. Belts into a moved dock are re-attached to
// whichever inlet their end now meets, else opened (`to: null`) with a `broken` note. No machine is ever deleted.

const DOCK_NOTE = 'The Receiving Dock grew to 2×2 and this belt no longer reaches an input. Drag its end onto one.';

/** Local → world for a w×h rectangle turned r quarter turns (same convention as geometry.ts). */
function rotCell(x: number, y: number, w: number, h: number, r: number): Tile {
  for (let i = 0; i < r; i++) { const nx = h - 1 - y; y = x; x = nx; const t = w; w = h; h = t; }
  return { x, y };
}
/** The pre-2×2 dock at (at, rot): its two cells and its one inlet (W of local (0,0)). */
function oldDock(m: Pick<Machine, 'at' | 'rot'>): { cells: Tile[]; q: { tile: Tile; face: (typeof FACES)[number] } } {
  const cells = [rotCell(0, 0, 2, 1, m.rot), rotCell(1, 0, 2, 1, m.rot)].map((t) => addTile(t, m.at));
  return { cells, q: { tile: addTile(rotCell(0, 0, 2, 1, m.rot), m.at), face: FACES[(FACES.indexOf('W') + m.rot) % 4]! } };
}

/** Does belt b (into this dock's inlet `port`) end where that inlet takes a belt: its doorstep or its free side? */
function meets(c: Canvas, b: Belt, dock: Machine, port: string, ctx: KernelCtx): boolean {
  const p = portsOf(dock, ctx).find((x) => x.id === port);
  if (!p) return false;
  const own = new Set(footprint(dock, ctx).map(tileKey));
  const ends: Tile[] = [frontOf(p)];
  const i0 = FACES.indexOf(p.face);
  for (const side of [FACES[(i0 + 1) % 4]!, FACES[(i0 + 3) % 4]!]) { const t = addTile(p.tile, FACE_DELTA[side]); if (!own.has(tileKey(t))) ends.push(t); }
  if (b.path.length) return ends.some((t) => tileEq(t, b.path[b.path.length - 1]!));
  // a direct link: the source port sits on the inlet's doorstep, facing it
  const src = c.machines.find((x) => x.id === b.from.m);
  const sp = src ? portsOf(src, ctx).find((x) => x.id === b.from.port) : undefined;
  return !!sp && tileEq(sp.tile, frontOf(p)) && tileEq(frontOf(sp), p.tile);
}

/** Grow each dock `isOld` picks from 2×1 to 2×2 (positions only). Returns the machines and the ids that moved. */
function growDocks(machines: Machine[], rooms: Room[], ctx: KernelCtx, isOld: (m: Machine) => boolean, belts: Belt[] = []): { machines: Machine[]; moved: Set<string> } {
  const out = [...machines];
  const moved = new Set<string>();
  out.forEach((m, i) => {
    if (m.kind !== 'socket' || !isOld(m)) return;
    const old = oldDock(m);
    const cands: Tile[] = [];
    for (const dy of [-1, 0]) for (const dx of [-1, 0]) {
      const at = { x: m.at.x + dx, y: m.at.y + dy };
      const cells = new Set(footprint({ ...m, at }, ctx).map(tileKey));
      if (old.cells.every((t) => cells.has(tileKey(t)))) cands.push(at);
    }
    // toward local −y first: the candidate whose W inlet is the old inlet (same tile, same face)
    const keepsQ = (at: Tile) => { const q = portsOf({ ...m, at }, ctx).find((p) => p.id === 'q'); return !!q && tileEq(q.tile, old.q.tile) && q.face === old.q.face; };
    cands.sort((a, b) => Number(keepsQ(b)) - Number(keepsQ(a)));
    const cv: Canvas = { version: 3, levelId: ctx.level.id, machines: out, belts, rooms };
    const free = (at: Tile) => !placementWhy({ ...cv, belts: [] }, { ...m, at }, ctx);
    // belts count too: a growth that swallows belt cells or strands this dock's belts is a worse fit
    const cost = (at: Tile) => {
      const d = { ...m, at };
      const cells = new Set(footprint(d, ctx).map(tileKey));
      const covered = belts.filter((b) => !b.broken).reduce((n, b) => n + b.path.filter((t) => cells.has(tileKey(t))).length, 0);
      const ins = portsOf(d, ctx).filter((p) => p.dir === 'in').map((p) => p.id);
      const stranded = belts.filter((b) => !b.broken && b.to?.m === m.id && !ins.some((pid) => meets(cv, b, d, pid, ctx))).length;
      return stranded * 100 + covered;
    };
    const fits = cands.filter(free);
    let at = fits.length ? fits.reduce((best, t) => (cost(t) < cost(best) ? t : best)) : undefined;
    for (let r = 1; !at && r <= 8; r++) {
      // both growths blocked: the nearest free spot (ring by ring), so nothing is ever deleted
      for (let dy = -r; dy <= r && !at; dy++) for (let dx = -r; dx <= r && !at; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = { x: m.at.x + dx, y: m.at.y + dy };
        if (free(t)) at = t;
      }
    }
    at ??= cands[0] ?? m.at;
    out[i] = { ...m, at };
    moved.add(m.id);
  });
  return { machines: out, moved };
}

/** Re-attach belts into moved docks to the inlet their end meets, else open them with a note; then repair all belts. */
function reattachDockBelts(c: Canvas, moved: Set<string>, ctx: KernelCtx): Canvas {
  const opened = new Set<string>();
  const fed = new Set(c.belts.filter((b) => b.to && !b.broken).map((b) => `${b.to!.m}|${b.to!.port}`));
  const belts = c.belts.map((b): Belt => {
    if (!b.to || !moved.has(b.to.m)) return b;
    const dock = c.machines.find((x) => x.id === b.to!.m)!;
    if (meets(c, b, dock, b.to.port, ctx)) return b;
    // cells the grown dock now covers are cut off the belt's end; what is left may meet an inlet
    const own = new Set(footprint(dock, ctx).map(tileKey));
    const cut = b.path.findIndex((t) => own.has(tileKey(t)));
    const t0: Belt = cut < 0 ? b : { ...b, path: b.path.slice(0, cut) };
    if (cut === 0) { opened.add(b.id); return { ...b, to: null, path: [] }; }
    const other = portsOf(dock, ctx).find((p) => p.dir === 'in' && (p.id === b.to!.port || !fed.has(`${dock.id}|${p.id}`)) && meets(c, t0, dock, p.id, ctx));
    fed.delete(`${b.to.m}|${b.to.port}`);
    if (other) { fed.add(`${dock.id}|${other.id}`); return { ...t0, to: { m: dock.id, port: other.id } }; }
    opened.add(b.id);
    if (t0.path.length) return { ...t0, to: null };
    // a direct link has no cell to end on: give it the source's doorstep
    const src = c.machines.find((x) => x.id === b.from.m);
    const sp = src ? portsOf(src, ctx).find((x) => x.id === b.from.port) : undefined;
    return { ...b, to: null, path: sp ? [frontOf(sp)] : [] };
  });
  const fixed = repairBelts({ ...c, belts }, ctx);
  return { ...fixed, belts: fixed.belts.map((b) => (opened.has(b.id) ? { ...b, broken: b.broken ?? DOCK_NOTE } : b)) };
}

/** Is this dock still laid out as the old 2×1 one? Its 2×2 cells overlap a machine, or a belt into 'q' misses the 2×2 inlet. */
function dockLooksOld(c: Canvas, m: Machine, ctx: KernelCtx): boolean {
  if (m.kind !== 'socket') return false;
  const cells = new Set(footprint(m, ctx).map(tileKey));
  if (c.machines.some((o) => o.id !== m.id && footprint(o, ctx).some((t) => cells.has(tileKey(t))))) return true;
  return c.belts.some((b) => !b.broken && b.to?.m === m.id && b.to.port === 'q' && !meets(c, b, m, 'q', ctx));
}

/**
 * Bring a saved canvas up to the 2×2 Receiving Dock. Idempotent: a dock is treated as an old 2×1 one only when the
 * canvas is inconsistent for it as a 2×2 (its new cells overlap another machine, or a belt into 'q' does not meet
 * the 2×2 inlet). An unconnected old dock with free cells below simply keeps its corner. `legacy` forces every dock
 * to be treated as 2×1 (for canvases known to predate the change). Never throws; returns the input on failure.
 */
export function migrateDocks(c: Canvas, ctx: KernelCtx, opts: { legacy?: boolean } = {}): Canvas {
  try {
    const g = growDocks(c.machines, c.rooms, ctx, (m) => !!opts.legacy || dockLooksOld(c, m, ctx), c.belts);
    if (!g.moved.size) return c;
    return reattachDockBelts({ ...c, machines: g.machines }, g.moved, ctx);
  } catch { return c; }
}
