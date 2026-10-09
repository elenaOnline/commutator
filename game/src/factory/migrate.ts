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
import { footprint } from './geometry';
import { initialCanvas, repairBelts } from './editor';

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
      case 'desk': add('desk', { kind: 'desk', room: String(c.room ?? '') }); break;
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
  return repairBelts(canvas, ctx);
}
