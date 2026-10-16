import { describe, expect, it } from 'vitest';
import * as F from './index';
import { Floor, cancel as cancelM, spool as spoolM, a as aT, I as IT, P as PT, eq as eqT, order as orderT } from './compiler.testkit';
import type { KernelCtx } from '../kernel';
import { LEVELS, LEVEL_BY_ID, REGISTRY } from '../levels/levels';

function ctxOf(id: string, earned = Object.keys(REGISTRY)): KernelCtx {
  const level = LEVEL_BY_ID[id]!;
  const schemas = Object.keys(REGISTRY).filter((s) => earned.includes(s) && !level.unlocks.includes(s));
  return { level: { ...level, tools: { lift: true, merge: true, suppose: true, classical: true, press: true, conjecture: true, schemas } }, registry: REGISTRY };
}
import { footprint, frontOf, portsOf, tileKey } from './geometry';
import { migrateCanvas } from './migrate';
import { defaultConfig, libCard, libName, libPremises, libraryRefs, varLabel } from './catalog';
import {
  INITIAL_GAP, autoLinks, extendTo, spliceCandidates, branch, branchAt, connect, routeOrWhy, connectVia, copySelection, hit, initialCanvas, moveMachines, paintRoom, paste,
  place, placementWhy, remove, resizeRoom, rotateMachine, route, setConfig, setConfigCtx,
} from './editor';
import type { Belt, Canvas, Edit, Endpoint, Machine, MachineConfig, MachineKind, Rot, Tile } from './index';

const ctx = ctxOf('L01');
// ── v3-era test vocabulary on v4 machines: each legacy name places the v4 machine with the matching recipe and
//    keeps the legacy id (canceller1, inverter2 …) so the geometry stories below read as before. An "inverter"
//    (a 1×1 machine with one input) is a Spool whose t is a port; its legacy input 'q' is the Spool's 't'.
const FIRST = { k: 'first' } as const;
const RW = (recipe: Extract<MachineConfig, { kind: 'rewriter' }>['recipe']): MachineConfig => ({ kind: 'rewriter', recipe, dir: 'fwd', target: FIRST, gap: FIRST, values: {}, tidy: true });
const LEG: Record<string, { kind: MachineKind; config: MachineConfig }> = {
  canceller: { kind: 'rewriter', config: RW({ k: 'cancel' }) },
  popper: { kind: 'rewriter', config: RW({ k: 'pop' }) },
  swapper: { kind: 'operator', config: { kind: 'operator', recipe: { k: 'swap' } } },
  multiplier: { kind: 'operator', config: { kind: 'operator', recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: null } } } },
  meet: { kind: 'joiner', config: { kind: 'joiner', recipe: { k: 'chain' } } },
  anvil: { kind: 'joiner', config: { kind: 'joiner', recipe: { k: 'clash' } } },
  joiner: { kind: 'joiner', config: { kind: 'joiner', recipe: null } },
  apply: { kind: 'theorem', config: { kind: 'theorem', recipe: { k: 'routed' }, choice: 0, values: {} } },
  inverter: { kind: 'spool', config: { kind: 'spool', t: { k: 'port' } } },
};
function renameIn(c: Canvas, from: string, to: string): Canvas {
  const r = (e: Endpoint) => (e.m === from ? { ...e, m: to } : e);
  return { ...c, machines: c.machines.map((x) => (x.id === from ? { ...x, id: to } : x)), belts: c.belts.map((x) => ({ ...x, from: r(x.from), to: x.to && r(x.to) })) };
}
function lplace(c: Canvas, kind: string, at: Tile, rot: Rot, k: KernelCtx = ctx, config?: MachineConfig): Edit {
  const leg = LEG[kind];
  if (!leg) return place(c, kind as MachineKind, at, rot, k, config);
  const e = place(c, leg.kind, at, rot, k, config ?? leg.config);
  if (!e.ok) return e;
  const newId = e.ids![0]!;
  const taken = new Set(c.machines.map((x) => x.id));
  let n = 1; while (taken.has(`${kind}${n}`)) n++;
  const id = `${kind}${n}`;
  return { ...e, canvas: renameIn(e.canvas, newId, id), ids: e.ids!.map((x) => (x === newId ? id : x)) };
}
const tr = (e: Endpoint): Endpoint => (/^inverter\d+$/.test(e.m) && e.port === 'q' ? { m: e.m, port: 't' } : e);
const lconnect = (c: Canvas, f: Endpoint, t: Endpoint, k: KernelCtx, path?: Tile[]) => connect(c, tr(f), tr(t), k, path);
const lconnectVia = (c: Canvas, f: Endpoint, t: Endpoint, via: Tile[], k: KernelCtx) => connectVia(c, tr(f), tr(t), via, k);
const lbranch = (c: Canvas, belt: string, t: Endpoint, k: KernelCtx) => branch(c, belt, tr(t), k);
const lbranchAt = (c: Canvas, belt: string, i: number, t: Endpoint, k: KernelCtx) => branchAt(c, belt, i, tr(t), k);
const lroute = (c: Canvas, f: Endpoint, t: Endpoint, k: KernelCtx, via?: Tile[]) => route(c, tr(f), tr(t), k, via);
const lrouteOrWhy = (c: Canvas, f: Endpoint, t: Endpoint, k: KernelCtx) => routeOrWhy(c, tr(f), tr(t), k);

const a = { k: 'atom', id: 'a' } as const;
const b = { k: 'atom', id: 'b' } as const;
const empty = (): Canvas => ({ version: 3, levelId: 'L01', machines: [], belts: [], rooms: [] });

function must(e: Edit): Canvas & { ids: string[] } {
  if (!e.ok) throw new Error(`refused: ${e.reason}`);
  return Object.assign(e.canvas, { ids: e.ids ?? [] });
}
const m = (c: Canvas, id: string) => c.machines.find((x) => x.id === id)!;

/** Every structural invariant the editor promises. */
function invariants(c: Canvas, k: KernelCtx = ctx) {
  const occ = new Map<string, string>();
  for (const x of c.machines) for (const t of footprint(x, k)) {
    expect(occ.has(tileKey(t)), `overlap at ${tileKey(t)}`).toBe(false);
    occ.set(tileKey(t), x.id);
  }
  for (const r of c.rooms) for (const x of c.machines) {
    const fp = footprint(x, k);
    const n = fp.filter((t) => t.x >= r.rect.x && t.x < r.rect.x + r.rect.w && t.y >= r.rect.y && t.y < r.rect.y + r.rect.h).length;
    expect(n === 0 || n === fp.length, `${x.id} straddles ${r.id}`).toBe(true);
  }
  const fronts = new Map<string, string>();
  for (const x of c.machines) for (const p of portsOf(x, k)) fronts.set(tileKey(frontOf(p)), `${x.id}#${p.id}`);
  const use = new Map<string, Map<string, string>>(); // tile → network → mode (H/V straight, X otherwise)
  const fed = new Set<string>();
  for (const bl of c.belts) {
    if (bl.broken) { expect(bl.broken.length).toBeGreaterThan(3); continue; }
    const fm = m(c, bl.from.m);
    const fp = portsOf(fm, k).find((p) => p.id === bl.from.port)!;
    expect(fp.dir).toBe('out');
    const to = bl.to;
    const tm = to ? m(c, to.m) : fm;
    const tp = to ? portsOf(tm, k).find((p) => p.id === to.port)! : fp;
    if (to) expect(tp.dir).toBe('in');
    if (!to) {
      expect(bl.path.length, `open belt ${bl.id} has cells`).toBeGreaterThan(0);
    } else if (!bl.path.length) {
      expect(frontOf(fp)).toEqual(tp.tile); expect(frontOf(tp)).toEqual(fp.tile);
    } else {
      // ends on the port's doorstep or beside the port cell (never behind it, never on the machine)
      const beside = (port: typeof fp, t: Tile) => Math.abs(t.x - port.tile.x) + Math.abs(t.y - port.tile.y) === 1
        && !(t.x === port.tile.x - (frontOf(port).x - port.tile.x) && t.y === port.tile.y - (frontOf(port).y - port.tile.y));
      expect(beside(fp, bl.path[0]!), `belt ${bl.id} starts away from its port`).toBe(true);
      if (to) expect(beside(tp, bl.path[bl.path.length - 1]!), `belt ${bl.id} ends away from its port`).toBe(true);
    }
    const seen = new Set<string>();
    const net = `${bl.from.m}#${bl.from.port}`;
    bl.path.forEach((t, i) => {
      if (i) expect(Math.abs(t.x - bl.path[i - 1]!.x) + Math.abs(t.y - bl.path[i - 1]!.y)).toBe(1);
      expect(seen.has(tileKey(t))).toBe(false); seen.add(tileKey(t));
      expect(occ.has(tileKey(t)), `belt ${bl.id} under machine at ${tileKey(t)}`).toBe(false);
      const f = fronts.get(tileKey(t));
      const lastOpen = !to && i === bl.path.length - 1; // an open belt may point at a doorstep
      // W10–14 #7: a belt may run straight across a free doorstep, along the machine's face (never into it)
      const fp2 = f ? portsOf(m(c, f.split('#')[0]!), k).find((p) => p.id === f.split('#')[1]) : undefined;
      const pv = i ? bl.path[i - 1] : undefined, nx = bl.path[i + 1];
      const passes = !!fp2 && !!pv && !!nx && (pv.x === nx.x ? (fp2.face === 'E' || fp2.face === 'W') : pv.y === nx.y && (fp2.face === 'N' || fp2.face === 'S'));
      expect(lastOpen || passes || f === undefined || f === `${bl.from.m}#${bl.from.port}` || (!!to && f === `${to.m}#${to.port}`), `belt ${bl.id} on doorstep of ${f}`).toBe(true);
      const prev = i ? bl.path[i - 1]! : null, next = bl.path[i + 1];
      const straightH = prev && next && prev.y === t.y && next.y === t.y;
      const straightV = prev && next && prev.x === t.x && next.x === t.x;
      const mode = straightH ? 'H' : straightV ? 'V' : 'X';
      const cell = use.get(tileKey(t)) ?? new Map<string, string>();
      const cur = cell.get(net);
      cell.set(net, cur && cur !== mode ? 'X' : mode);
      use.set(tileKey(t), cell);
    });
    if (to) { const key = `${to.m}#${to.port}`; expect(fed.has(key)).toBe(false); fed.add(key); }
  }
  for (const [t, cell] of use) if (cell.size > 1) {
    const modes = [...cell.values()];
    expect(cell.size === 2 && modes.includes('H') && modes.includes('V'), `belts from different outputs share ${t} without a straight crossing`).toBe(true);
  }
  // copy trees: same-network belts share only a prefix
  const nets = new Map<string, Belt[]>();
  for (const bl of c.belts.filter((x) => !x.broken)) { const n = `${bl.from.m}#${bl.from.port}`; nets.set(n, [...(nets.get(n) ?? []), bl]); }
  for (const bs of nets.values()) for (const x of bs) for (const y of bs) if (x !== y) {
    let j = 0; while (j < x.path.length && j < y.path.length && tileKey(x.path[j]!) === tileKey(y.path[j]!)) j++;
    const ys = new Set(y.path.map(tileKey));
    for (let i = j; i < x.path.length; i++) expect(ys.has(tileKey(x.path[i]!)), 'branches rejoin').toBe(false);
  }
}

describe('initialCanvas', () => {
  it.each(LEVELS.map((l) => [l.id]))('%s: inlets west, docks east, locked, roomy, valid', (id) => {
    const k = ctxOf(id);
    const lvl = k.level;
    const c = initialCanvas(lvl, k);
    invariants(c, k);
    const givens = c.machines.filter((x) => x.kind === 'given');
    const socks = c.machines.filter((x) => x.kind === 'socket');
    const pres = c.machines.filter((x) => x.kind === 'spool');
    expect(givens.map((g) => (g.config as { givenId: string }).givenId)).toEqual(lvl.givens.map((g) => g.id));
    expect(socks.map((s) => (s.config as { socketId: string }).socketId)).toEqual(lvl.sockets.map((s) => s.id));
    expect(pres.length).toBe(lvl.preStarts?.length ?? 0);
    for (const x of c.machines) expect(x.locked).toBe(true);
    for (const x of [...givens, ...pres]) expect(x.at.x).toBe(0);
    const westRight = Math.max(...[...givens, ...pres].map((x) => footprint(x, k).reduce((q, t) => Math.max(q, t.x), 0)), 0);
    for (const s of socks) expect(s.at.x - westRight - 1).toBe(INITIAL_GAP);
    expect(c.belts).toEqual([]);
    // deterministic
    expect(initialCanvas(lvl, k)).toEqual(c);
  });
  it('L01 spool and dock line up so a straight line can be built', () => {
    const c = initialCanvas(ctx.level, ctx);
    expect(m(c, 'pre:0').at).toEqual({ x: 0, y: 0 });
    expect(m(c, 'socket:s').at).toEqual({ x: 11, y: 0 });
  });
});

describe('place', () => {
  it('places with a fresh id and refuses overlap, locked or not', () => {
    const c0 = initialCanvas(ctx.level, ctx);
    const c1 = must(lplace(c0, 'canceller', { x: 5, y: 0 }, 0, ctx));
    expect(c1.ids).toEqual(['canceller1']);
    const c2 = must(lplace(c1, 'canceller', { x: 5, y: 2 }, 0, ctx));
    expect(c2.ids).toEqual(['canceller2']);
    const r = lplace(c2, 'popper', { x: 6, y: 0 }, 0, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Rewriter/);
    expect(lplace(c2, 'meet', { x: 10, y: 0 }, 0, ctx).ok).toBe(false); // over the locked dock
    expect(lplace(c2, 'socket', { x: 5, y: 6 }, 0, ctx).ok).toBe(false); // not placeable
    invariants(c2);
  });
  it('placing over a belt re-routes it', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'socket:s', port: 'q' }, ctx));
    // the 2×2 dock's W inlet 'q' sits on its lower tile (11,1): doorstep (10,1)
    expect(c.belts[0]!.path).toEqual([{ x: 7, y: 0 }, { x: 8, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 1 }, { x: 10, y: 1 }]);
    c = must(lplace(c, 'hopper', { x: 8, y: 0 }, 0, ctx));
    expect(c.belts.length).toBe(1);
    expect(c.belts[0]!.path.some((t) => t.x === 8 && t.y === 0)).toBe(false);
    invariants(c);
  });
});

describe('routing and connect', () => {
  it('First Light: spool → canceller → dock in two straight belts', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    c = must(lconnect(c, { m: 'pre:0', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx));
    expect(c.belts[0]!.path).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);
    // dragged backwards: input first
    c = must(lconnect(c, { m: 'socket:s', port: 'q' }, { m: 'canceller1', port: 'out' }, ctx));
    expect(c.belts[1]!.from).toEqual({ m: 'canceller1', port: 'out' });
    invariants(c);
  });

  it('routes around an obstacle with few turns', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 10, y: 0 }, 0, ctx));
    c = must(lplace(c, 'meet', { x: 5, y: -1 }, 0, ctx)); // wall across y = -1..0
    const p = lroute(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx)!;
    expect(p).not.toBeNull();
    expect(p[0]).toEqual({ x: 1, y: 0 });
    expect(p[p.length - 1]).toEqual({ x: 9, y: 0 });
    const turns = p.slice(2).filter((t, i) => (t.x - p[i + 1]!.x) !== (p[i + 1]!.x - p[i]!.x) || (t.y - p[i + 1]!.y) !== (p[i + 1]!.y - p[i]!.y)).length;
    expect(turns).toBe(3); // down, across, up (then into the port)
    expect(p.length).toBe(11);
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx, p));
    invariants(c);
  });

  it('avoids other belts and reports no route when boxed in', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 6, y: 0 }, 0, ctx));
    c = must(lplace(c, 'hopper', { x: 3, y: -3 }, 1, ctx)); // out faces south
    c = must(lplace(c, 'inverter', { x: 3, y: 3 }, 1, ctx)); // q faces north
    c = must(lconnect(c, { m: 'hopper2', port: 'out' }, { m: 'inverter2', port: 'q' }, ctx)); // vertical wall x = 3
    const r = lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx);
    expect(r.ok).toBe(true); // crosses the vertical belt straight over it
    const c2 = must(r);
    expect(c2.belts[1]!.path).toEqual([1, 2, 3, 4, 5].map((x) => ({ x, y: 0 })));
    invariants(c2);
  });

  it('refuses impossible endpoints but allows type mismatches', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    c = must(lplace(c, 'hopper', { x: 5, y: 3 }, 0, ctx));
    const bad = (e: Edit, re: RegExp) => { expect(e.ok).toBe(false); if (!e.ok) expect(e.reason).toMatch(re); };
    bad(lconnect(c, { m: 'canceller1', port: 'q' }, { m: 'socket:s', port: 'q' }, ctx), /inputs/);
    bad(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'pre:0', port: 'out' }, ctx), /outputs/);
    bad(lconnect(c, { m: 'canceller1', port: 'nope' }, { m: 'socket:s', port: 'q' }, ctx), /no port/);
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx)); // term into eq port: allowed
    // a fed input: the new feed replaces the old one, and says so
    const rep = lconnect(c, { m: 'pre:0', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx);
    expect(rep.ok).toBe(true);
    if (rep.ok) {
      expect(rep.note).toMatch(/Replaced the feed from the Hopper/);
      expect(rep.canvas.belts.filter((b) => b.to!.m === 'canceller1').map((b) => b.from.m)).toEqual(['pre:0']);
      invariants(rep.canvas);
    }
    bad(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx), /already there/);
    invariants(c);
  });

  it('validates explicit paths', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    const from = { m: 'pre:0', port: 'out' }, to = { m: 'canceller1', port: 'q' };
    expect(lconnect(c, from, to, ctx, [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]).ok).toBe(false);
    expect(lconnect(c, from, to, ctx, [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]).ok).toBe(false);
    const p = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 0 }];
    c = must(lconnect(c, from, to, ctx, p));
    expect(c.belts[0]!.path).toEqual(p);
  });

  it('waypoints are honoured', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    c = must(lconnectVia(c, { m: 'pre:0', port: 'out' }, { m: 'canceller1', port: 'q' }, [{ x: 2, y: 3 }], ctx));
    expect(c.belts[0]!.path.some((t) => t.x === 2 && t.y === 3)).toBe(true);
    invariants(c);
  });

  it('a route never walls in a free input port', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'hopper', { x: 0, y: 2 }, 0, ctx));
    c = must(lplace(c, 'meet', { x: 8, y: 10 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 13, y: 10 }, 0, ctx));
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'meet1', port: 'a' }, ctx));
    c = must(lconnect(c, { m: 'hopper2', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx));
    // meet1.b (front 7,11) must still be reachable: the inverter's output can come back to it
    c = must(lconnect(c, { m: 'inverter1', port: 'out' }, { m: 'meet1', port: 'b' }, ctx));
    invariants(c);
  });

  it('a one-tile belt joins facing ports one cell apart', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 2, y: 0 }, 0, ctx));
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx));
    expect(c.belts[0]!.path).toEqual([{ x: 1, y: 0 }]);
  });
});

describe('branch (copy trees)', () => {
  it('a branch shares a prefix with its trunk and never rejoins', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 10, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 6, y: 4 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 6, y: -4 }, 0, ctx));
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx));
    c = must(lbranch(c, 'b1', { m: 'inverter2', port: 'q' }, ctx));
    c = must(lbranch(c, 'b1', { m: 'inverter3', port: 'q' }, ctx));
    expect(c.belts.length).toBe(3);
    const [t, b1, b2] = c.belts;
    expect(b1!.from).toEqual(t!.from);
    expect(b2!.from).toEqual(t!.from);
    expect(b1!.path[0]).toEqual(t!.path[0]); // shares the trunk's start
    // the branch is short: it leaves the trunk near the target instead of starting a second line
    expect(b1!.path.length).toBeLessThanOrEqual(t!.path.length);
    invariants(c);
    // connecting from the same output again also builds onto the tree
    c = must(lplace(c, 'joiner', { x: 12, y: 3 }, 0, ctx));
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'joiner1', port: 'a' }, ctx));
    invariants(c);
    // branching at a chosen cell leaves exactly there
    c = must(lplace(c, 'inverter', { x: 3, y: 5 }, 0, ctx));
    const trunk = c.belts[0]!;
    const c3 = must(lbranchAt(c, trunk.id, 1, { m: 'inverter4', port: 'q' }, ctx));
    const nb = c3.belts[c3.belts.length - 1]!;
    expect(nb.path.slice(0, 2)).toEqual(trunk.path.slice(0, 2));
    expect(trunk.path.slice(2).some((t) => tileKey(t) === tileKey(nb.path[2]!))).toBe(false);
    invariants(c3);
    // removing the trunk belt keeps the branches (each owns its full path)
    c = must(remove(c, ['b1']));
    expect(c.belts.length).toBe(3);
    invariants(c);
  });
});

describe('move / rotate / remove / configure', () => {
  const line = () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    c = must(lconnect(c, { m: 'pre:0', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx));
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'socket:s', port: 'q' }, ctx));
    return c;
  };
  it('moving re-routes attached belts', () => {
    const c = must(moveMachines(line(), ['canceller1'], { x: 0, y: 3 }, ctx));
    expect(m(c, 'canceller1').at).toEqual({ x: 5, y: 3 });
    expect(c.belts.length).toBe(2);
    invariants(c);
    expect(moveMachines(line(), ['canceller1'], { x: 5, y: 0 }, ctx).ok).toBe(false); // onto the dock
  });
  it('moving a connected group carries internal belts unchanged in shape', () => {
    let c = line();
    c = must(lplace(c, 'popper', { x: 5, y: 4 }, 0, ctx));
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'popper1', port: 'q' }, ctx));
    const before = c.belts.find((x) => x.to!.m === 'popper1')!.path;
    c = must(moveMachines(c, ['canceller1', 'popper1'], { x: 1, y: 2 }, ctx));
    const after = c.belts.find((x) => x.to!.m === 'popper1')!.path;
    expect(after).toEqual(before.map((t) => ({ x: t.x + 1, y: t.y + 2 })));
    invariants(c);
  });
  it('rotation round-trips and keeps belts valid', () => {
    let c = line();
    const orig = m(c, 'canceller1');
    for (let i = 0; i < 4; i++) { c = must(rotateMachine(c, 'canceller1', ctx)); invariants(c); }
    expect(m(c, 'canceller1')).toEqual(orig);
    expect(c.belts.length).toBe(2);
  });
  it('remove: unlocked machines take their belts; locked machines stay', () => {
    const c = line();
    const r = must(remove(c, ['canceller1']));
    expect(r.machines.some((x) => x.id === 'canceller1')).toBe(false);
    expect(r.belts).toEqual([]);
    expect(remove(c, ['pre:0']).ok).toBe(false);
    const r2 = must(remove(c, ['pre:0', 'b2']));
    expect(r2.machines.some((x) => x.id === 'pre:0')).toBe(true);
    expect(r2.belts.map((x) => x.id)).toEqual(['b1']);
    // a pre-placed spool's term is part of the order
    expect(setConfig(c, 'pre:0', { kind: 'spool', t: { k: 'knob', term: a } }).ok).toBe(false);
  });
  it('setConfig: recipe changes keep belts on surviving ports, mark the rest broken, refuse when there is no room', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 2 }, 0, ctx));
    c = must(lplace(c, 'multiplier', { x: 4, y: 0 }, 0, ctx));
    c = must(setConfig(c, 'multiplier1', { kind: 'operator', recipe: { k: 'multiply', side: 'left', t: { k: 'port' } } }));
    expect(portsOf(m(c, 'multiplier1'), ctx).map((p) => p.id)).toContain('t');
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'multiplier1', port: 't' }, ctx));
    invariants(c);
    const e = setConfig(c, 'multiplier1', { kind: 'operator', recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: a } } });
    c = must(e);
    expect(c.belts.length).toBe(1); // kept, broken, never silently dropped
    expect(c.belts[0]!.broken).toMatch(/no port/);
    if (e.ok) expect(e.broken).toEqual([c.belts[0]!.id]);
    c = must(remove(c, [c.belts[0]!.id]));
    // A Rewriter growing to three parameter ports needs a wider footprint
    c = must(lplace(c, 'canceller', { x: 10, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 12, y: 0 }, 0, ctx));     // its t port faces the Rewriter's output: may touch it
    const three = { kind: 'rewriter' as const, recipe: { k: 'routed' as const }, dir: 'fwd' as const, target: FIRST, gap: FIRST, tidy: true, values: { u: { k: 'port' as const }, v: { k: 'port' as const }, w: { k: 'port' as const } } };
    const r = setConfig(c, 'canceller1', three);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/No room for the new port/);
    expect(setConfigCtx(c, 'canceller1', { ...three, values: { u: { k: 'port' }, v: { k: 'port' } } }, ctx).ok).toBe(true);
    expect(setConfig(c, 'canceller1', { kind: 'operator', recipe: { k: 'swap' } }).ok).toBe(false);
  });
  it('Joiner chain → clash keeps both input belts (ports persist)', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'hopper', { x: 0, y: 3 }, 0, ctx));
    c = must(lplace(c, 'meet', { x: 5, y: 0 }, 0, ctx));
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'meet1', port: 'a' }, ctx));
    c = must(lconnect(c, { m: 'hopper2', port: 'out' }, { m: 'meet1', port: 'b' }, ctx));
    const e = setConfig(c, 'meet1', { kind: 'joiner', recipe: { k: 'clash' } });
    const d = must(e);
    expect(d.belts.map((x) => [x.to!.port, x.broken])).toEqual([['a', undefined], ['b', undefined]]);
    if (e.ok) expect(e.broken).toBeUndefined();
  });
  it('library refs are validated: unknown theorems, missing mirrors', () => {
    const k = ctxOf('L12');
    let c: Canvas = { ...empty(), levelId: 'L12' };
    c = must(lplace(c, 'theorem', { x: 0, y: 0 }, 0, k, { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: 'witness' } }, choice: 0, values: {} }));
    expect(m(c, 'theorem1').config).toMatchObject({ recipe: { ref: { id: 'witness' } } });
    expect(setConfigCtx(c, 'theorem1', { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: 'nope' } }, choice: 0, values: {} }, k).ok).toBe(false);
    expect(setConfigCtx(c, 'theorem1', { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: 'cancel', mirror: true } }, choice: 0, values: {} }, k).ok).toBe(true);
    expect(lplace(c, 'carddock', { x: 0, y: 3 }, 0, k, { kind: 'carddock', ref: { k: 'schema', id: 'socks', mirror: true } }).ok).toBe(false);
    expect(lplace(c, 'carddock', { x: 0, y: 3 }, 0, k, { kind: 'carddock', ref: { k: 'given', givenId: 'zz' } }).ok).toBe(false);
  });
});

describe('rooms', () => {
  const k = ctxOf('L09');
  const base = () => initialCanvas(k.level, k);
  it('paint creates desk inside and gate on the wall facing out', () => {
    const c = must(paintRoom(base(), { x: 3, y: -3, w: 6, h: 5 }, 'suppose', a, b, k));
    const [rid, did, gid] = c.ids;
    expect(c.rooms[0]!.id).toBe(rid);
    const desk = m(c, did!), gate = m(c, gid!);
    expect(desk.kind).toBe('desk'); expect(gate.kind).toBe('gate');
    expect(desk.locked && gate.locked).toBe(true);
    const r = c.rooms[0]!.rect;
    const inside = (t: Tile) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;
    expect(inside(desk.at)).toBe(true);
    const out = portsOf(gate, k).find((p) => p.id === 'out')!, q = portsOf(gate, k).find((p) => p.id === 'q')!;
    expect(inside(gate.at)).toBe(true);
    expect(inside(frontOf(out))).toBe(false);
    expect(inside(frontOf(q))).toBe(true);
    expect(gate.at.x).toBe(r.x + r.w - 1); // east wall, toward the docks
    invariants(c, k);
  });
  it('rooms nest or stay apart; never partial overlap; machines never straddle', () => {
    let c = must(paintRoom(base(), { x: 3, y: -4, w: 8, h: 9 }, 'suppose', a, b, k));
    c = must(paintRoom(c, { x: 4, y: -3, w: 5, h: 5 }, 'suppose', b, a, k)); // nested
    expect(paintRoom(c, { x: 7, y: -3, w: 6, h: 3 }, 'suppose', a, b, k).ok).toBe(false); // crosses the outer wall
    expect(paintRoom(c, { x: 3, y: -4, w: 8, h: 9 }, 'suppose', a, b, k).ok).toBe(false); // identical
    expect(paintRoom(c, { x: 20, y: 0, w: 2, h: 2 }, 'suppose', a, b, k).ok).toBe(false); // too small
    // a room cutting through the dock (at x = 11..12)
    expect(paintRoom(base(), { x: 12, y: -2, w: 4, h: 5 }, 'suppose', a, b, k).ok).toBe(false);
    invariants(c, k);
    // machines placed straddling a wall are refused
    expect(lplace(c, 'canceller', { x: 10, y: 4 }, 0, k).ok).toBe(false);
  });
  it('remove a room takes its desk and gate (and their belts) only', () => {
    let c = must(paintRoom(base(), { x: 3, y: -3, w: 6, h: 5 }, 'suppose', a, b, k));
    const [rid, did, gid] = c.ids;
    c = must(lplace(c, 'swapper', { x: 5, y: 1 }, 0, k));
    c = must(remove(c, [did!]).ok ? remove(c, [did!]) : { ok: true, canvas: c });
    expect(c.machines.some((x) => x.id === did)).toBe(true); // desk alone can't go
    c = must(remove(c, [rid!]));
    expect(c.rooms).toEqual([]);
    expect(c.machines.some((x) => x.id === did || x.id === gid)).toBe(false);
    expect(c.machines.some((x) => x.id === 'swapper1')).toBe(true);
  });
  it('resize keeps or re-seats desk and gate; refuses cutting machines', () => {
    let c = must(paintRoom(base(), { x: 3, y: -3, w: 6, h: 5 }, 'suppose', a, b, k));
    const [rid, , gid] = c.ids;
    c = must(resizeRoom(c, rid!, { x: 3, y: -3, w: 8, h: 6 }, k));
    const gate = m(c, gid!);
    const r = c.rooms[0]!.rect;
    expect(gate.at.x === r.x + r.w - 1 || gate.at.y === r.y + r.h - 1 || gate.at.x === r.x || gate.at.y === r.y).toBe(true);
    invariants(c, k);
    c = must(lplace(c, 'meet', { x: 5, y: -1 }, 0, k));
    expect(resizeRoom(c, rid!, { x: 3, y: -3, w: 3, h: 6 }, k).ok).toBe(false); // would cut the Meet
    // moving the whole room carries its contents
    const moved = must(moveMachines(c, [rid!], { x: 0, y: 2 }, k));
    expect(m(moved, 'meet1').at).toEqual({ x: 5, y: 1 });
    invariants(moved, k);
  });
});

describe('belts respect rooms', () => {
  const k = ctxOf('L09');
  const inside = (t: Tile, r: { x: number; y: number; w: number; h: number }) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;
  const setup = () => {
    let c = initialCanvas(k.level, k);
    c = must(paintRoom(c, { x: 3, y: 2, w: 8, h: 6 }, 'suppose', a, b, k));
    return c;
  };
  it('a belt between machines in a room stays inside, even when outside is shorter', () => {
    let c = setup();
    c = must(lplace(c, 'inverter', { x: 7, y: 2 }, 1, k));     // wall on the top ring row
    c = must(lplace(c, 'hopper', { x: 9, y: 3 }, 3, k));        // out faces north, onto the ring
    c = must(lplace(c, 'inverter', { x: 5, y: 3 }, 1, k));      // q faces north, onto the ring
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter2', port: 'q' }, k));
    const r = c.rooms[0]!.rect;
    for (const t of c.belts[0]!.path) expect(inside(t, r), `${t.x},${t.y} left the room`).toBe(true);
    invariants(c, k);
  });
  it('gate → outside dock stays outside the room (no shortcut along the ring)', () => {
    let c = setup();
    const gate = c.machines.find((x) => x.kind === 'gate')!;
    c = must(lconnect(c, { m: gate.id, port: 'out' }, { m: 'socket:s', port: 'q' }, k));
    const r = c.rooms[0]!.rect;
    for (const t of c.belts[0]!.path) expect(inside(t, r), `${t.x},${t.y} re-entered the room`).toBe(false);
    // an explicit path through the ring is refused
    const bad = [{ x: 11, y: 4 }, { x: 11, y: 3 }, { x: 11, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 1 }, { x: 10, y: 0 }];
    const e = lconnect(must(remove(c, [c.belts[0]!.id])), { m: gate.id, port: 'out' }, { m: 'socket:s', port: 'q' }, k, bad);
    expect(e.ok).toBe(false);
    invariants(c, k);
  });
  it('outer given → machine in a nested room crosses each wall exactly once, inward', () => {
    let c = initialCanvas(k.level, k);
    c = must(paintRoom(c, { x: 3, y: 3, w: 7, h: 7 }, 'suppose', a, b, k));
    c = must(paintRoom(c, { x: 5, y: 5, w: 4, h: 4 }, 'suppose', b, a, k));
    c = must(lplace(c, 'swapper', { x: 6, y: 8 }, 0, k));
    c = must(lconnect(c, { m: 'given:n', port: 'out' }, { m: 'swapper1', port: 'q' }, k));
    const depth = (t: Tile) => c.rooms.filter((r) => inside(t, r.rect)).length;
    const ds = c.belts[0]!.path.map(depth);
    for (let i = 1; i < ds.length; i++) expect(ds[i]!).toBeGreaterThanOrEqual(ds[i - 1]!);
    expect(ds[0]).toBe(0);
    expect(ds[ds.length - 1]).toBe(2);
    expect(ds.filter((d, i) => i > 0 && d !== ds[i - 1]).length).toBe(2);
    invariants(c, k);
  });
  it('a leak (inside → outside, not via the gate) is still buildable; the compiler jams it', () => {
    let c = setup();
    c = must(lplace(c, 'hopper', { x: 5, y: 5 }, 0, k));
    c = must(lplace(c, 'inverter', { x: 14, y: 5 }, 0, k));
    expect(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, k).ok).toBe(true);
  });
});

describe('malformed input', () => {
  it('place refuses a cyclic term instead of throwing', () => {
    const t = { k: 'inv' } as { k: 'inv'; arg: unknown };
    t.arg = t;
    const e = lplace(empty(), 'hopper', { x: 0, y: 0 }, 0, ctx, { kind: 'hopper', t: t as never });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.reason).toMatch(/malformed/);
    const c = must(lplace(empty(), 'hopper', { x: 0, y: 0 }, 0, ctx));
    expect(setConfigCtx(c, 'hopper1', { kind: 'hopper', t: t as never }, ctx).ok).toBe(false);
  });
});

describe('forgiving belts (r2)', () => {
  const k = ctxOf('L09');
  it('perpendicular crossings are allowed; parallel overlap and crossing at a turn are refused, naming the belt', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 8, y: 0 }, 0, ctx));
    c = must(lplace(c, 'hopper', { x: 4, y: -4 }, 1, ctx));
    c = must(lplace(c, 'inverter', { x: 4, y: 4 }, 1, ctx));
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx));
    c = must(lconnect(c, { m: 'hopper2', port: 'out' }, { m: 'inverter2', port: 'q' }, ctx));
    expect(c.belts[1]!.path.some((t) => t.x === 4 && t.y === 0)).toBe(true); // the crossing
    invariants(c);
    // parallel: a third line along y = 0 is refused, naming the belt it would run on
    c = must(lplace(c, 'hopper', { x: 2, y: 2 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 7, y: 2 }, 0, ctx));
    const along = [{ x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 6, y: 2 }];
    const e = lconnect(c, { m: 'hopper3', port: 'out' }, { m: 'inverter3', port: 'q' }, ctx, along);
    expect(e.ok).toBe(false);
    if (!e.ok) { expect(e.reason).toMatch(/belt from the Hopper/); expect(e.blockers).toContain('b1'); }
  });

  it('touching ports link directly with path []; place auto-links flush compatible ports', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    const ghost: Machine = { id: 'ghost', kind: 'spool', at: { x: 1, y: 0 }, rot: 0, config: { kind: 'spool', t: { k: 'port' } } };
    expect(autoLinks(c, ghost, ctx)).toEqual([{ from: { m: 'hopper1', port: 'out' }, to: { m: 'ghost', port: 't' } }]);
    const p = must(lplace(c, 'inverter', { x: 1, y: 0 }, 0, ctx));
    expect(p.belts).toEqual([{ id: 'b1', from: { m: 'hopper1', port: 'out' }, to: { m: 'inverter1', port: 't' }, path: [] }]);
    expect(p.ids).toEqual(['inverter1', 'b1']);
    invariants(p);
    // incompatible (term into an equation inlet): no auto-link, but connect still links directly (it may jam)
    const q = must(lplace(c, 'canceller', { x: 1, y: 0 }, 0, ctx));
    expect(q.belts).toEqual([]);
    expect(lrouteOrWhy(q, { m: 'hopper1', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx)).toEqual({ path: [] });
    const r = must(lconnect(q, { m: 'hopper1', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx, []));
    expect(r.belts[0]!.path).toEqual([]);
    invariants(r);
  });

  it('never silently drops a belt: an unroutable belt is kept broken, naming the blocker, and heals later', () => {
    // Astra P1 #1: in delivered L01, a Hopper dropped right before the dock.
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    c = must(lconnect(c, { m: 'pre:0', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx));
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'socket:s', port: 'q' }, ctx));
    // the W inlet also accepts from its south side, so one Hopper on its doorstep just re-routes the belt
    const d1 = must(lplace(c, 'hopper', { x: 10, y: 1 }, 0, ctx));
    const b1 = d1.belts.find((b) => b.to!.m === 'socket:s')!;
    expect(b1.broken).toBeUndefined();
    expect(b1.path[b1.path.length - 1]).toEqual({ x: 11, y: 2 }); // the side face (its north side is the dock itself)
    invariants(d1);
    const d1b = d1;
    // blocking every approach breaks it — kept, dashed, naming the blocker
    const e = lplace(d1b, 'hopper', { x: 11, y: 2 }, 2, ctx);
    const d = must(e);
    expect(d.belts.length).toBe(2);
    const br = d.belts.find((b) => b.to!.m === 'socket:s')!;
    expect(br.broken).toMatch(/the dock.*faces the Hopper/);
    if (e.ok) { expect(e.note).toMatch(/re-routing/); expect(e.broken).toEqual([br.id]); }
    invariants(d);
    // removing an obstacle heals it
    const h = must(remove(d, ['hopper2']));
    expect(h.belts.find((b) => b.id === br.id)!.broken).toBeUndefined();
    invariants(h);
    // rotating the canceller twice breaks then re-routes nothing silently
    let r = d;
    for (let i = 0; i < 4; i++) { r = must(rotateMachine(r, 'canceller1', ctx)); expect(r.belts.length).toBe(2); invariants(r); }
    // a broken input can be re-fed directly (the broken belt is replaced)
    const refeed = lconnect(d, { m: 'hopper1', port: 'out' }, { m: 'socket:s', port: 'q' }, ctx);
    expect(refeed.ok).toBe(true);
  });

  it('refusals name the blocker: occupied cells, room walls', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 0 }, 0, ctx));
    const e = lplace(c, 'popper', { x: 4, y: 0 }, 0, ctx);
    expect(e.ok).toBe(false);
    if (!e.ok) { expect(e.reason).toBe('The cancel Rewriter is in the way.'); expect(e.blockers).toEqual(['canceller1']); }
    // an Anvil inside a room whose ≠ input faces the wall
    let r = initialCanvas(k.level, k);
    r = must(paintRoom(r, { x: 3, y: 2, w: 8, h: 6 }, 'suppose', a, b, k));
    r = must(lplace(r, 'anvil', { x: 3, y: 5 }, 0, k));             // a, b on the west wall, facing out
    r = must(lplace(r, 'swapper', { x: 6, y: 6 }, 0, k));
    r = must(lplace(r, 'hopper', { x: 3, y: 7 }, 0, k));             // and its side approach is taken
    const w = lconnect(r, { m: 'swapper1', port: 'out' }, { m: 'anvil1', port: 'b' }, k);
    expect(w.ok).toBe(false);
    if (!w.ok) { expect(w.reason).toBe('no route: the clash Joiner’s ≠ input faces the room wall.'); expect(w.blockers).toEqual([r.rooms[0]!.id]); }
  });

  it('routes never take another port’s doorstep', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 6, y: 0 }, 0, ctx));
    c = must(lplace(c, 'meet', { x: 3, y: 1 }, 3, ctx)); // rot 3: inputs face south, out faces north onto (3,0)
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx));
    const doorstep = frontOf(portsOf(m(c, 'meet1'), ctx).find((p) => p.id === 'out')!);
    expect(c.belts[0]!.path.some((t) => t.x === doorstep.x && t.y === doorstep.y)).toBe(false);
    invariants(c);
  });
});

describe('forgiving rooms and lines (r3)', () => {
  const k = ctxOf('L10');
  const inside = (t: Tile, r: { x: number; y: number; w: number; h: number }) => t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h;

  it('paint: gate centred on the east wall, desk on the inner west side, different rows, clear doorsteps', () => {
    for (const rect of [{ x: 3, y: 2, w: 8, h: 6 }, { x: 3, y: 2, w: 3, h: 3 }, { x: 3, y: 3, w: 8, h: 9 }]) {
      let c = initialCanvas(k.level, k);
      c = must(paintRoom(c, rect, 'suppose', a, a, k));
      const desk = c.machines.find((x) => x.kind === 'desk')!, gate = c.machines.find((x) => x.kind === 'gate')!;
      expect(gate.at.x).toBe(rect.x + rect.w - 1);
      expect(gate.at.y).toBe(rect.y + Math.floor((rect.h - 1) / 2));
      expect(desk.at.x).toBe(rect.x);
      expect(desk.at.y).not.toBe(gate.at.y);
      const deskOut = frontOf(portsOf(desk, k)[0]!), gateIn = frontOf(portsOf(gate, k).find((p) => p.id === 'q')!);
      expect(deskOut).not.toEqual(gateIn);
      for (const t of [deskOut, gateIn]) {
        expect(inside(t, rect)).toBe(true);
        expect(c.machines.some((x) => footprint(x, k).some((f) => f.x === t.x && f.y === t.y))).toBe(false);
      }
      invariants(c, k);
      // resizing keeps both sensible
      const rid = c.rooms[0]!.id;
      const big = must(resizeRoom(c, rid, { ...rect, w: rect.w + 2, h: rect.h + 2 }, k));
      const g2 = big.machines.find((x) => x.kind === 'gate')!, d2 = big.machines.find((x) => x.kind === 'desk')!;
      expect(g2.at.x === rect.x + rect.w + 1 || g2.at.y === rect.y || g2.at.x === rect.x || g2.at.y === rect.y + rect.h + 1).toBe(true);
      expect(d2.at).not.toEqual(g2.at);
      invariants(big, k);
    }
  });

  it('the gate takes ⊥ from any inward approach when its doorstep is taken', () => {
    let c = initialCanvas(k.level, k);
    c = must(paintRoom(c, { x: 3, y: 2, w: 8, h: 6 }, 'suppose', a, a, k));
    const gate = c.machines.find((x) => x.kind === 'gate')!;
    const gIn = frontOf(portsOf(gate, k).find((p) => p.id === 'q')!);
    c = must(lplace(c, 'hopper', gIn, 0, k));
    c = must(lplace(c, 'anvil', { x: 5, y: 5 }, 0, k));
    c = must(lconnect(c, { m: 'anvil1', port: 'out' }, { m: gate.id, port: 'q' }, k));
    const last = c.belts[c.belts.length - 1]!.path.at(-1)!;
    expect([{ x: gate.at.x, y: gate.at.y - 1 }, { x: gate.at.x, y: gate.at.y + 1 }]).toContainEqual(last);
    invariants(c, k);
  });

  it('rip-up and re-route: a belt sealing the only approach is moved aside, and the note says so', () => {
    let c = empty();
    c = must(lplace(c, 'inverter', { x: 5, y: 0 }, 0, ctx));          // B's target: q doorstep (4,0)
    for (const [x, y, r] of [[5, -1, 3], [5, 1, 1], [4, -1, 3], [4, 1, 1]] as const) c = must(lplace(c, 'hopper', { x, y }, r, ctx));
    c = must(lplace(c, 'hopper', { x: 3, y: -4 }, 1, ctx));          // A's source, out faces south
    c = must(lplace(c, 'inverter', { x: 2, y: 4 }, 1, ctx));         // A's target, q faces north
    const hopA = c.machines.at(-2)!.id, invA = c.machines.at(-1)!.id;
    const aPath = [{ x: 3, y: -3 }, { x: 3, y: -2 }, { x: 3, y: -1 }, { x: 3, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }];
    c = must(lconnect(c, { m: hopA, port: 'out' }, { m: invA, port: 'q' }, ctx, aPath)); // turns at (3,0): seals (4,0)
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    const hopB = c.machines.at(-1)!.id;
    const e = lconnect(c, { m: hopB, port: 'out' }, { m: 'inverter1', port: 'q' }, ctx);
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.note).toMatch(/Re-routed the belt from the Hopper/);
      expect(e.canvas.belts.length).toBe(2);
      expect(e.canvas.belts.every((b) => !b.broken)).toBe(true);
      invariants(e.canvas);
    }
  });

  it('free fan-out: a direct-linked output feeds a second consumer from its side', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 1, y: 0 }, 0, ctx));         // auto-linked, path []
    expect(c.belts[0]!.path).toEqual([]);
    c = must(lplace(c, 'inverter', { x: 4, y: 3 }, 0, ctx));
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter2', port: 'q' }, ctx));
    expect([{ x: 0, y: -1 }, { x: 0, y: 1 }]).toContainEqual(c.belts[1]!.path[0]);
    c = must(lplace(c, 'inverter', { x: 4, y: -3 }, 0, ctx));
    c = must(lbranch(c, c.belts[0]!.id, { m: 'inverter3', port: 'q' }, ctx)); // branching a [] belt works too
    expect(c.belts.length).toBe(3);
    invariants(c);
  });

  it('splicing: a machine dropped onto a compatible belt joins the line; previewed by spliceCandidates', () => {
    let c = initialCanvas(ctx.level, ctx);                          // pre:0 spool at (0,0), dock at (11,0)
    c = must(lconnect(c, { m: 'pre:0', port: 'out' }, { m: 'socket:s', port: 'q' }, ctx));
    const ghost: Machine = { id: 'ghost', kind: 'rewriter', at: { x: 4, y: 0 }, rot: 0, config: RW({ k: 'cancel' }) };
    expect(spliceCandidates(c, ghost, ctx).map((s) => s.belt)).toEqual(['b1']);
    const e = lplace(c, 'canceller', { x: 4, y: 0 }, 0, ctx);
    const d = must(e);
    if (e.ok) expect(e.note).toMatch(/Spliced into the belt from the Spool/);
    expect(d.belts.map((b) => [b.from.m, b.to!.m])).toEqual([['pre:0', 'canceller1'], ['canceller1', 'socket:s']]);
    invariants(d);
    // an incompatible machine (equation inlet on a term belt) does not splice: the belt just moves aside
    let t = empty();
    t = must(lplace(t, 'hopper', { x: 0, y: 0 }, 0, ctx));
    t = must(lplace(t, 'inverter', { x: 8, y: 0 }, 0, ctx));
    t = must(lconnect(t, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx));
    expect(spliceCandidates(t, ghost, ctx)).toEqual([]);
    const f = must(lplace(t, 'canceller', { x: 4, y: 0 }, 0, ctx));
    expect(f.belts.map((b) => [b.from.m, b.to!.m])).toEqual([['hopper1', 'inverter1']]);
    invariants(f);
  });
});

describe('final polish', () => {
  /** Cells reachable from a free doorstep over open floor (machines, doorsteps and belt turns block). */
  function openRegion(c: Canvas, t: Tile, limit = 40): number {
    const occ = new Set(c.machines.flatMap((x) => footprint(x, ctx).map(tileKey)));
    const doors = new Set(c.machines.flatMap((x) => portsOf(x, ctx).map((p) => tileKey(frontOf(p)))));
    const beltCells = new Set(c.belts.flatMap((b) => b.path.map(tileKey)));
    const seen = new Set([tileKey(t)]); const q = [t];
    while (q.length && seen.size < limit) {
      const u = q.shift()!;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = { x: u.x + d[0], y: u.y + d[1] }; const k = tileKey(n);
        if (seen.has(k) || occ.has(k) || doors.has(k) || beltCells.has(k)) continue;
        seen.add(k); q.push(n);
      }
    }
    return seen.size;
  }

  it('a route never seals a free output doorstep — not even its own target machine’s', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 5, y: 0 }, 2, ctx));          // q faces east, out (doorstep 4,0) faces west
    for (const x of [3, 4, 5]) c = must(lplace(c, 'hopper', { x, y: 1 }, 1, ctx)); // a wall under it
    c = must(lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx));
    const outDoor = frontOf(portsOf(m(c, 'inverter1'), ctx).find((p) => p.id === 'out')!);
    expect(openRegion(c, outDoor)).toBeGreaterThanOrEqual(40);
    invariants(c);
  });

  it('docks take the belt on the near face (no loop round the dock)', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 5, y: 3 }, 0, ctx));
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'socket:s', port: 'q' }, ctx));
    const p = c.belts[0]!.path;
    expect(p.at(-1)).toEqual({ x: 11, y: 2 });                         // the W inlet's south face
    expect(p.length).toBe(6);
    invariants(c);
  });

  it('splices when dropped on the belt: in line directly, across it with routed halves (final playtest W8–14 N7)', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lconnect(c, { m: 'pre:0', port: 'out' }, { m: 'socket:s', port: 'q' }, ctx));
    const g = (at: Tile, rot: Rot): Machine => ({ id: 'g', kind: 'rewriter', at, rot, config: RW({ k: 'pop' }) });
    expect(spliceCandidates(c, g({ x: 4, y: 1 }, 0), ctx)).toEqual([]); // beside the belt, not on it: no splice
    for (const x of [g({ x: 4, y: 0 }, 1), g({ x: 4, y: 0 }, 2)]) expect(spliceCandidates(c, x, ctx).map((s) => s.belt)).toHaveLength(1);
    // N7 (was: across the belt re-routes it, no splice): dropped across the belt, the machine splices in and both
    // halves are routed like any belt
    const d = must(lplace(c, 'popper', { x: 4, y: 0 }, 1, ctx));
    expect(d.belts.map((b) => [b.from.m, b.to!.m])).toEqual([['pre:0', 'popper1'], ['popper1', 'socket:s']]);
    expect(d.belts.every((b) => !b.broken)).toBe(true);
    invariants(d);
    const s2 = must(lplace(c, 'popper', { x: 4, y: 0 }, 0, ctx));      // in line: splices
    expect(s2.belts.map((b) => [b.from.m, b.to!.m])).toEqual([['pre:0', 'popper1'], ['popper1', 'socket:s']]);
  });

  it('a wall of machines is blamed as a wall, naming both ends', () => {
    let c = empty();
    c = must(lplace(c, 'hopper', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 0, y: 4 }, 0, ctx));
    // a closed box of swappers around the inverter
    for (let x = -2; x <= 3; x += 2) for (const y of [2, 6]) c = must(lplace(c, 'swapper', { x, y }, 0, ctx));
    for (const y of [3, 4, 5]) { c = must(lplace(c, 'hopper', { x: -2, y }, 2, ctx)); c = must(lplace(c, 'hopper', { x: 3, y }, 0, ctx)); }
    const e = lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx);
    expect(e.ok).toBe(false);
    if (!e.ok) { expect(e.reason).toMatch(/walls? the Hopper off from the Spool/); expect(e.blockers!.length).toBeGreaterThan(0); }
  });
});

describe('hit testing', () => {
  it('machine > belt > room', () => {
    const k = ctxOf('L09');
    let c = initialCanvas(k.level, k);
    c = must(paintRoom(c, { x: 2, y: -2, w: 8, h: 5 }, 'suppose', a, b, k));
    c = must(lplace(c, 'swapper', { x: 5, y: -2 }, 0, k));
    c = must(lconnect(c, { m: 'given:n', port: 'out' }, { m: 'swapper1', port: 'q' }, k));
    expect(hit(c, { x: 6, y: -2 }, k)).toEqual({ k: 'machine', id: 'swapper1' });
    const bt = c.belts[0]!.path[1]!;
    expect(hit(c, bt, k)).toMatchObject({ k: 'belt', id: c.belts[0]!.id, i: 1 });
    expect(hit(c, { x: 8, y: 2 }, k)).toEqual({ k: 'room', id: c.rooms[0]!.id });
    expect(hit(c, { x: 30, y: 30 }, k)).toBeNull();
  });
});

describe('copy / paste', () => {
  it('copies machines + internal belts, pastes with fresh ids, translated belts', () => {
    let c = initialCanvas(ctx.level, ctx);
    c = must(lplace(c, 'canceller', { x: 4, y: 3 }, 0, ctx));
    c = must(lplace(c, 'popper', { x: 8, y: 3 }, 0, ctx));
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'popper1', port: 'q' }, ctx));
    c = must(lconnect(c, { m: 'pre:0', port: 'out' }, { m: 'canceller1', port: 'q' }, ctx));
    const bp = copySelection(c, ['canceller1', 'popper1', 'pre:0', 'b2']);
    expect(bp.machines.map((x) => x.id)).toEqual(['canceller1', 'popper1']); // locked spool skipped
    expect(bp.belts.length).toBe(1);
    expect(bp.origin).toEqual({ x: 4, y: 3 });
    const p = must(paste(c, bp, { x: 4, y: 6 }, ctx));
    expect(p.ids.slice(0, 2)).toEqual(['rewriter1', 'rewriter2']);
    const nb = p.belts.find((x) => x.to!.m === 'rewriter2')!;
    expect(nb.from.m).toBe('rewriter1');
    expect(nb.path).toEqual(c.belts[0]!.path.map((t) => ({ x: t.x, y: t.y + 3 })));
    invariants(p);
    expect(paste(c, bp, { x: 4, y: 3 }, ctx).ok).toBe(false); // on top of the originals
    expect(paste(c, copySelection(c, ['pre:0']), { x: 4, y: 9 }, ctx).ok).toBe(false);
    // the blueprint is a deep copy
    (bp.machines[0] as Machine).at.x = 99;
    expect(m(c, 'canceller1').at.x).toBe(4);
  });
});

describe('v4: towers, assume rooms, pipette', () => {
  const tower = (c: Canvas, id: string) => m(c, id).config as Extract<MachineConfig, { kind: 'tower' }>;
  const x = (id: string) => ({ k: 'atom', id }) as const;

  it('tower labels are plain and unique: x, y, z, w, then x₂ … (place and rename)', () => {
    let c = empty();
    c = must(place(c, 'tower', { x: 0, y: 0 }, 0, ctx));
    c = must(place(c, 'tower', { x: 2, y: 0 }, 0, ctx));
    expect([tower(c, 'tower1'), tower(c, 'tower2')].map((t) => [t.label, t.varId])).toEqual([['x', 'x'], ['y', 'y']]);
    for (const x0 of [4, 6, 8]) c = must(place(c, 'tower', { x: x0, y: 0 }, 0, ctx));
    expect(['tower3', 'tower4', 'tower5'].map((id) => tower(c, id).label)).toEqual(['z', 'w', 'x₂']);
    expect(portsOf(m(c, 'tower1'), ctx)).toEqual([]);
    // renaming tower2 to a taken label picks the next free name; its varId (and so its uses) stays
    c = must(setConfig(c, 'tower2', { kind: 'tower', varId: 'y', label: 'x', sort: 'G' }));
    expect([tower(c, 'tower2').label, tower(c, 'tower2').varId]).toEqual(['y', 'y']);
    // renaming may drop a subscript when the plain letter is free
    c = must(remove(c, ['tower1']));
    c = must(setConfig(c, 'tower5', { kind: 'tower', varId: 'x2', label: 'x', sort: 'G' }));
    expect([tower(c, 'tower5').label, tower(c, 'tower5').varId]).toEqual(['x', 'x2']);
    invariants(c);
  });

  it('deleting a tower never silently re-binds its symbol; undo (the old canvas) keeps the same varId', () => {
    let c = empty();
    c = must(place(c, 'tower', { x: 0, y: 0 }, 0, ctx));
    c = must(place(c, 'spool', { x: 3, y: 0 }, 0, ctx, { kind: 'spool', t: { k: 'knob', term: x('x') } }));
    const before = c;
    c = must(remove(c, ['tower1']));                 // allowed; the Spool's x now jams in the compiler
    c = must(place(c, 'tower', { x: 0, y: 3 }, 0, ctx));
    // a NEW variable, and not visibly “x” either: that label is reserved while orphaned uses remain
    expect([tower(c, 'tower1').label, tower(c, 'tower1').varId]).toEqual(['y', 'y']);
    expect(tower(before, 'tower1').varId).toBe('x');
    // renaming the new Tower to the orphaned label is the explicit remap: it takes over x and its uses
    c = must(setConfig(c, 'tower1', { kind: 'tower', varId: 'y', label: 'x', sort: 'G' }));
    expect([tower(c, 'tower1').label, tower(c, 'tower1').varId]).toEqual(['x', 'x']);
    expect(varLabel('x1')).toBe('x₁');
    expect(varLabel('x')).toBe('x');
  });

  it('copy/paste: a pasted tower is a new variable; machines pasted with it follow it, others keep the original', () => {
    let c = empty();
    c = must(place(c, 'tower', { x: 0, y: 0 }, 0, ctx));
    c = must(place(c, 'spool', { x: 3, y: 0 }, 0, ctx, { kind: 'spool', t: { k: 'knob', term: x('x') } }));
    const withTower = must(paste(c, copySelection(c, ['tower1', 'spool1']), { x: 0, y: 4 }, ctx));
    const t2 = withTower.machines.find((q) => q.kind === 'tower' && q.id !== 'tower1')!.config as Extract<MachineConfig, { kind: 'tower' }>;
    expect([t2.label, t2.varId]).toEqual(['y', 'y']);
    expect(withTower.machines.find((q) => q.kind === 'spool' && q.id !== 'spool1')!.config).toEqual({ kind: 'spool', t: { k: 'knob', term: x('y') } });
    const alone = must(paste(c, copySelection(c, ['spool1']), { x: 3, y: 4 }, ctx));
    expect(alone.machines.find((q) => q.kind === 'spool' && q.id !== 'spool1')!.config).toEqual({ kind: 'spool', t: { k: 'knob', term: x('x') } });
  });

  it('pipette: place keeps a full recipe configuration intact', () => {
    const cfg: MachineConfig = { kind: 'rewriter', recipe: { k: 'law', ref: { k: 'axiom', id: 'invL' } }, dir: 'rev', target: FIRST, gap: FIRST, values: { x: { k: 'knob', term: a } }, tidy: false };
    const c = must(place(empty(), 'rewriter', { x: 0, y: 0 }, 0, ctx, cfg));
    expect(m(c, 'rewriter1').config).toEqual(cfg);
  });

  it('assume rooms: kind + rel, desk inside, gate on the east wall', () => {
    const k = ctxOf('L09');
    const c = must(paintRoom(initialCanvas(k.level, k), { x: 3, y: 2, w: 8, h: 6 }, 'assume', a, b, k, 'neq'));
    expect(c.rooms[0]).toMatchObject({ kind: 'assume', rel: 'neq' });
    expect(c.machines.filter((q) => q.kind === 'desk' || q.kind === 'gate').length).toBe(2);
    invariants(c, k);
  });
});

describe('v4 Phase B: integer towers and imported power laws', () => {
  const kz: KernelCtx = { ...ctx, level: { ...ctx.level, tools: { ...ctx.level.tools, schemas: ['power.add', 'power.zero', 'power.literal'] } } };
  const tw = (c: Canvas, id: string) => { const t = m(c, id).config as Extract<MachineConfig, { kind: 'tower' }>; return [t.label, t.varId, t.sort]; };

  it('towers auto-label per sort (x, y … / n, k …), unique across both sorts', () => {
    let c = empty();
    c = must(place(c, 'tower', { x: 0, y: 0 }, 0, kz, defaultConfig('tower', kz, { sort: 'Z' })));
    c = must(place(c, 'tower', { x: 2, y: 0 }, 0, kz, defaultConfig('tower', kz, { sort: 'Z' })));
    c = must(place(c, 'tower', { x: 4, y: 0 }, 0, kz));
    expect([tw(c, 'tower1'), tw(c, 'tower2'), tw(c, 'tower3')]).toEqual([['n', 'n', 'Z'], ['k', 'k', 'Z'], ['x', 'x', 'G']]);
    // switching an element tower to ℤ relabels it in the integer letters, still unique
    c = must(setConfig(c, 'tower3', { kind: 'tower', varId: 'x', label: 'x', sort: 'Z' }));
    expect(tw(c, 'tower3')).toEqual(['m', 'x', 'Z']);
    // a player's own letter that fits the sort is kept
    c = must(setConfig(c, 'tower1', { kind: 'tower', varId: 'n', label: 'j', sort: 'Z' }));
    expect(tw(c, 'tower1')[0]).toBe('j');
  });

  it('the library lists the order’s imported power laws, the literal family as one entry with an r knob', () => {
    const refs = libraryRefs(kz, 'rule');
    expect(refs).toContainEqual({ k: 'schema', id: 'power.add' });
    expect(refs).toContainEqual({ k: 'schema', id: 'power.literal' });
    expect(refs).not.toContainEqual({ k: 'schema', id: 'power.multiply' });   // not listed by the order
    expect(libCard(kz, { k: 'schema', id: 'power.zero' })?.k).toBe('law');
    expect(libCard(kz, { k: 'schema', id: 'power.literal' })).toBeNull();     // r not chosen yet
    expect(libCard(kz, { k: 'schema', id: 'power.literal:3' })?.k).toBe('law');
    expect(libName(kz, { k: 'schema', id: 'power.add' })).toBe('product of powers');
    expect(libName(kz, { k: 'schema', id: 'power.literal' })).toBe('literal power (choose r)');
    expect(libPremises(kz, { k: 'schema', id: 'power.add' })).toBe(0);
    const law = (id: string): MachineConfig => ({ kind: 'rewriter', recipe: { k: 'law', ref: { k: 'schema', id } }, dir: 'fwd', target: FIRST, gap: FIRST, values: {}, tidy: true });
    for (const id of ['power.add', 'power.literal', 'power.literal:4']) expect(place(empty(), 'rewriter', { x: 0, y: 0 }, 0, kz, law(id)).ok).toBe(true);
    expect(place(empty(), 'rewriter', { x: 0, y: 0 }, 0, kz, law('power.bogus')).ok).toBe(false);
  });
});

describe('v4 r2: doorsteps and the L12 floor', () => {
  const k12: KernelCtx = { ...ctxOf('L12'), registry: REGISTRY };
  const RWr: MachineConfig = { kind: 'rewriter', recipe: { k: 'routed' }, dir: 'fwd', target: FIRST, gap: FIRST, values: {}, tidy: true };

  it('every doorstep (rule ports included) is hard for placement, named in the refusal and the preview', () => {
    let c = empty();
    c = must(place(c, 'rewriter', { x: 4, y: 4 }, 0, ctx, RWr));        // rule port on the north side → doorstep (4,3)
    const e = place(c, 'joiner', { x: 3, y: 2 }, 0, ctx);
    expect(e.ok).toBe(false);
    if (!e.ok) { expect(e.reason).toBe('That would block the routed Rewriter’s rule input.'); expect(e.blockers).toEqual(['rewriter1']); }
    const ghost: Machine = { id: 'g', kind: 'hopper', at: { x: 4, y: 3 }, rot: 0, config: { kind: 'hopper', t: null } };
    expect(placementWhy(c, ghost, ctx)?.reason).toBe('That would block the routed Rewriter’s rule input.');
    expect(placementWhy(c, { ...ghost, at: { x: 7, y: 3 } }, ctx)).toBeNull();
  });

  it('L12-shaped floor (playtest v4 r1 #2): a Suppose room with a Lagrange line, Witness feeding a rule port, clash and gate — every belt routes', () => {
    let c = initialCanvas(k12.level, k12);
    const ab = [a, b, a, b, a, b];
    c = must(paintRoom(c, { x: 3, y: 3, w: 14, h: 9 }, 'suppose', { k: 'mul', fs: ab } as never, { k: 'e' }, k12));
    const P = (kind: MachineKind, x: number, y: number, cfg: MachineConfig) => { c = must(place(c, kind, { x, y }, 0, k12, cfg)); return c.machines.at(-1)!.id; };
    const lag = P('carddock', 5, 9, { kind: 'carddock', ref: { k: 'lagrange' } });
    const r1 = P('rewriter', 7, 9, RWr), r2 = P('rewriter', 10, 9, RWr);
    const wit = P('theorem', 13, 9, { kind: 'theorem', recipe: { k: 'library', ref: { k: 'schema', id: 'witness' } }, choice: 0, values: {} });
    const r3 = P('rewriter', 8, 5, RWr);
    const an = P('joiner', 12, 5, { kind: 'joiner', recipe: { k: 'clash' } });
    const desk = c.machines.find((q) => q.kind === 'desk')!.id, gate = c.machines.find((q) => q.kind === 'gate')!.id;
    const wires: [string, string, string, string][] = [
      [desk, 'out', r1, 'q'], [lag, 'out', r1, 'rule'], [r1, 'out', r2, 'q'], [desk, 'out', r2, 'rule'], [r2, 'out', wit, 'p0'],
      [wit, 'out', r3, 'rule'], [desk, 'out', r3, 'q'], [r3, 'out', an, 'a'], ['given:n', 'out', an, 'b'], [an, 'out', gate, 'q'], [gate, 'out', 'socket:s', 'qe'], // the dock's east inlet faces the gate
    ];
    for (const [f, fp, t, tp] of wires) c = must(connect(c, { m: f, port: fp }, { m: t, port: tp }, k12));
    expect(c.belts.length).toBe(wires.length);
    expect(c.belts.filter((x) => x.broken)).toEqual([]);
    for (const x of c.belts) expect(x.path.length, `${x.from.m}→${x.to!.m}`).toBeLessThanOrEqual(16);
    invariants(c, k12);
  });
});

describe('v4 final: short-belt splices and unambiguous blame', () => {
  it('a machine dropped over a 2-cell belt splices both ends (direct links to source and target)', () => {
    let c = empty();
    c = must(lplace(c, 'canceller', { x: 0, y: 0 }, 0, ctx));          // out doorstep (2,0)
    c = must(lplace(c, 'popper', { x: 4, y: 0 }, 0, ctx));             // q doorstep (3,0)
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'popper1', port: 'q' }, ctx));
    expect(c.belts[0]!.path).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }]);
    const op: Machine = { id: 'g', kind: 'operator', at: { x: 2, y: 0 }, rot: 0, config: { kind: 'operator', recipe: { k: 'swap' } } };
    expect(spliceCandidates(c, op, ctx).map((s) => s.belt)).toEqual(['b1']);
    const e = place(c, 'operator', { x: 2, y: 0 }, 0, ctx, op.config);
    const d = must(e);
    if (e.ok) expect(e.note).toMatch(/Spliced/);
    expect(d.belts.map((b) => [b.from.m, b.to!.m, b.path.length, b.broken])).toEqual([['canceller1', 'operator1', 0, undefined], ['operator1', 'popper1', 0, undefined]]);
    invariants(d);
  });

  it('blame names a belt by its source’s role, never coordinates, and still flashes its id', () => {
    let c = empty();
    c = must(lplace(c, 'canceller', { x: 0, y: 0 }, 0, ctx));
    c = must(lplace(c, 'popper', { x: 9, y: 0 }, 0, ctx));
    c = must(lconnect(c, { m: 'canceller1', port: 'out' }, { m: 'popper1', port: 'q' }, ctx));
    c = must(lplace(c, 'hopper', { x: 3, y: 2 }, 0, ctx));
    c = must(lplace(c, 'inverter', { x: 8, y: 2 }, 0, ctx));
    const along = [{ x: 4, y: 2 }, { x: 4, y: 1 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 7, y: 2 }];
    const e = lconnect(c, { m: 'hopper1', port: 'out' }, { m: 'inverter1', port: 'q' }, ctx, along);
    expect(e.ok).toBe(false);
    if (!e.ok) { expect(e.reason).toMatch(/[Tt]he belt from the cancel Rewriter is in the way/); expect(e.reason).not.toMatch(/\(\d+,\s*-?\d+\)/); expect(e.blockers).toContain('b1'); }
  });
});

describe('v4.1 open belts', () => {
  const spoolAt = (c: Canvas) => must(place(c, 'spool', { x: 0, y: 0 }, 0, ctx, { kind: 'spool', t: { k: 'knob', term: a } }));

  it('drag from an output to a ground cell makes an open belt; extending keeps its start', () => {
    let c = spoolAt(empty());
    const e = extendTo(c, { m: 'spool1', port: 'out' }, { x: 5, y: 2 }, ctx);
    c = must(e);
    const b = c.belts[0]!;
    expect(b.to).toBeNull();
    expect(b.path[0]).toEqual({ x: 1, y: 0 });
    expect(b.path.at(-1)).toEqual({ x: 5, y: 2 });
    invariants(c);
    const before = b.path;
    c = must(extendTo(c, { belt: b.id, end: true }, { x: 8, y: 2 }, ctx));
    expect(c.belts.length).toBe(1);
    expect(c.belts[0]!.path.slice(0, before.length)).toEqual(before);
    expect(c.belts[0]!.path.at(-1)).toEqual({ x: 8, y: 2 });
    invariants(c);
    expect(extendTo(c, { m: 'spool1', port: 'out' }, { x: 0, y: 0 }, ctx).ok).toBe(false); // onto a machine
  });

  it('drag from an open end to an input completes the belt (same id)', () => {
    let c = spoolAt(empty());
    c = must(place(c, 'rewriter', { x: 10, y: 4 }, 0, ctx));
    c = must(extendTo(c, { m: 'spool1', port: 'out' }, { x: 5, y: 4 }, ctx));
    const id = c.belts[0]!.id;
    c = must(extendTo(c, { belt: id }, { m: 'rewriter1', port: 'q' }, ctx));
    expect(c.belts.map((b) => [b.id, b.to])).toEqual([[id, { m: 'rewriter1', port: 'q' }]]);
    expect(c.belts[0]!.path).toContainEqual({ x: 5, y: 4 });
    invariants(c);
  });

  it('placing a machine whose compatible input faces the open end completes it (and autoLinks previews it)', () => {
    let c = spoolAt(empty());
    c = must(extendTo(c, { m: 'spool1', port: 'out' }, { x: 5, y: 3 }, ctx));
    const id = c.belts[0]!.id;
    const ghost: Machine = { id: 'g', kind: 'rewriter', at: { x: 6, y: 3 }, rot: 0, config: RW(null) };   // q doorstep (5,3)
    expect(autoLinks(c, ghost, ctx)).toEqual([{ from: { m: 'spool1', port: 'out' }, to: { m: 'g', port: 'q' }, belt: id }]);
    const d = must(place(c, 'rewriter', { x: 6, y: 3 }, 0, ctx));
    expect(d.belts).toEqual([{ ...c.belts[0]!, to: { m: 'rewriter1', port: 'q' } }]);
    invariants(d);
    // an incompatible input (a term port) leaves it open
    const t = must(place(c, 'spool', { x: 6, y: 3 }, 0, ctx, { kind: 'spool', t: { k: 'port' } }));
    expect(t.belts[0]!.to).toBeNull();
    invariants(t);
  });

  it('open belts move with their source, go with it on remove, copy/paste and migrate as open', () => {
    let c = spoolAt(empty());
    c = must(extendTo(c, { m: 'spool1', port: 'out' }, { x: 4, y: 0 }, ctx));
    const moved = must(moveMachines(c, ['spool1'], { x: 0, y: 3 }, ctx));
    expect(moved.belts[0]!.path).toEqual(c.belts[0]!.path.map((t) => ({ x: t.x, y: t.y + 3 })));
    expect(moved.belts[0]!.to).toBeNull();
    const gone = must(remove(c, ['spool1']));
    expect(gone.belts).toEqual([]);
    const bp = copySelection(c, ['spool1']);
    expect(bp.belts.length).toBe(1);
    const p = must(paste(c, bp, { x: 0, y: 5 }, ctx));
    expect(p.belts.filter((b) => b.to === null).length).toBe(2);
    invariants(p);
    const lvl = must(extendTo(initialCanvas(ctx.level, ctx), { m: 'pre:0', port: 'out' }, { x: 4, y: 2 }, ctx));
    expect(migrateCanvas(lvl, ctx)!.belts).toEqual(lvl.belts);
  });
});

describe('UX fixes (playtest 2026-10-15)', () => {
  it('MIN_ROOM is exported; the desk refusal says how to remove the room', () => {
    expect(F.MIN_ROOM).toEqual({ w: 3, h: 3 });
    const f = new Floor(orderT(eqT(aT, aT)));
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 6, h: 5 }, 'suppose', aT, aT, f.ctx);
    if (!e.ok) throw new Error(e.reason);
    const desk = e.canvas.machines.find((m) => m.config.kind === 'desk')!.id;
    const r = F.remove(e.canvas, [desk]);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe('The desk and gate belong to their room. Select the room and press ⌫, or use Delete room.');
  });
  it('moving a machine re-routes its belts where a route exists; with none, the belt stays (dashed) with a note', () => {
    const f = new Floor(orderT(eqT(aT, aT)));
    const sp = f.add(spoolM(PT(aT, IT(aT))), { x: 6, y: 6 });
    const c1 = f.add(cancelM(), { x: 12, y: 6 });
    const c2 = f.add(cancelM(), { x: 18, y: 10 });
    f.wire(sp, c1); f.wire(c1, c2);
    for (const d of [{ x: 0, y: 5 }, { x: -10, y: 0 }, { x: 3, y: -4 }]) {
      const e = F.moveMachines(f.c, [c1], d, f.ctx);
      expect(e.ok).toBe(true);
      expect((e as { canvas: F.Canvas }).canvas.belts.every((b) => !b.broken)).toBe(true);
      expect((e as { note?: string }).note).toBeUndefined();
    }
    // box the spool's output in: the belt cannot leave, so it is kept broken with an honest note
    const g = new Floor(orderT(eqT(aT, aT)));
    const s0 = g.add(spoolM(aT), { x: 6, y: 6 });
    const tgt = g.add(cancelM(), { x: 12, y: 6 });
    g.wire(s0, tgt);
    for (const t of [{ x: 7, y: 5 }, { x: 7, y: 7 }, { x: 8, y: 6 }]) g.add(spoolM(aT), t);
    const e2 = F.moveMachines(g.c, [tgt], { x: 0, y: 6 }, g.ctx);
    expect(e2.ok).toBe(true);
    const kept = (e2 as { canvas: F.Canvas }).canvas.belts.find((b) => b.from.m === s0);
    expect(kept).toBeDefined();
    if (kept!.broken) expect((e2 as { note?: string }).note).toMatch(/belt needs re-routing/);
  });
});
