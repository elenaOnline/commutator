// The 2×2 Receiving Dock (review 2026-10): pinwheel inlets, delivery from any face, and the 2×1 → 2×2 save migration.
import { describe, expect, it } from 'vitest';
import * as F from './index';
import { LEVEL_BY_ID } from '../levels/levels';
import { DOCK_PORTS, footprint, portsOf, sizeOf } from './geometry';
import { migrateDocks } from './migrate';
import { Floor, cancel } from './compiler.testkit';
import type { Canvas, Machine } from './types';

const dockOf = (c: Canvas, id = 'socket:s') => c.machines.find((m) => m.id === id)!;
const portsById = (m: Machine, f: Floor) => Object.fromEntries(portsOf(m, f.ctx).map((p) => [p.id, { tile: p.tile, face: p.face }]));

/** L01 floor: pre-start spool → cancel → the dock's `port` inlet. */
// the canceller sits beside the inlet under test: connect takes the nearest free inlet (playtest W10–14 #7)
const NEAR: Record<string, { x: number; y: number }> = { q: { x: 5, y: 3 }, qn: { x: 8, y: -3 }, qe: { x: 14, y: -3 }, qs: { x: 10, y: 3 } };
function l01(port: string): { f: Floor; can: string } {
  const f = new Floor(LEVEL_BY_ID.L01!);
  const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
  const can = f.add(cancel(), NEAR[port] ?? { x: 5, y: 3 });
  f.wire(spool, can);
  f.wire(can, f.socket(), port);
  return { f, can };
}

describe('Receiving Dock geometry', () => {
  it('is 2×2 with four inlets in a pinwheel; W keeps the old id q', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const d = dockOf(f.c);
    expect(sizeOf(d, f.ctx)).toEqual({ w: 2, h: 2 });
    const { x, y } = d.at;
    expect(portsById(d, f)).toEqual({
      q: { tile: { x, y: y + 1 }, face: 'W' },
      qn: { tile: { x, y }, face: 'N' },
      qe: { tile: { x: x + 1, y }, face: 'E' },
      qs: { tile: { x: x + 1, y: y + 1 }, face: 'S' },
    });
    expect(DOCK_PORTS.map((p) => p.id)).toEqual(['q', 'qn', 'qe', 'qs']);
    expect(portsOf(d, f.ctx).every((p) => p.dir === 'in' && p.role === 'work')).toBe(true);
  });

  it('the pinwheel turns with the dock: one inlet per side, one per tile, at every rotation', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    for (const rot of [0, 1, 2, 3] as const) {
      const d = { ...dockOf(f.c), rot };
      const ps = portsOf(d, f.ctx);
      expect(new Set(ps.map((p) => p.face)).size).toBe(4);
      expect(new Set(ps.map((p) => `${p.tile.x},${p.tile.y}`)).size).toBe(4);
      expect(footprint(d, f.ctx)).toHaveLength(4);
    }
  });

  it('initialCanvas stacks 2×2 docks in the east column with two empty rows between', () => {
    const lv = LEVEL_BY_ID.R01!;
    const f = new Floor(lv);
    const docks = f.c.machines.filter((m) => m.kind === 'socket');
    expect(docks).toHaveLength(lv.sockets.length);
    expect(new Set(docks.map((d) => d.at.x)).size).toBe(1);
    for (let i = 1; i < docks.length; i++) expect(docks[i]!.at.y - docks[i - 1]!.at.y).toBe(4);
    for (const d of docks) expect(sizeOf(d, f.ctx)).toEqual({ w: 2, h: 2 });
  });
});

describe('Receiving Dock delivery', () => {
  it.each(['q', 'qn', 'qe', 'qs'])('delivers through the %s inlet', (port) => {
    const { f } = l01(port);
    const { comp, s } = f.run();
    expect(comp.sockets.s).toMatchObject({ ok: true });
    expect(comp.plan.machines[f.socket()]!.ins).toEqual([{ port, catalyst: false }]);
    expect(s.delivered.s).toBeGreaterThan(0);
    expect(s.live[f.socket()]).toBe('sealed');
  });

  it('any inlet may deliver: a wrong item on one inlet does not stop the right one on another', () => {
    const { f } = l01('q');
    const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
    f.wire(spool, f.socket(), 'qn'); // the raw spool equation is not the goal
    const { comp, s } = f.run();
    expect(comp.sockets.s).toMatchObject({ ok: true });
    expect(comp.plan.machines[f.socket()]!.ins).toEqual([{ port: 'q', catalyst: false }]);
    expect(s.delivered.s).toBeGreaterThan(0);
  });

  it('two right inlets: both are certified, the first arrival seals', () => {
    const { f, can } = l01('q');
    const can2 = f.add(cancel(), { x: 5, y: 8 });
    const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
    f.wire(spool, can2);
    f.wire(can2, f.socket(), 'qs');
    void can;
    const { comp, s } = f.run();
    expect(comp.plan.machines[f.socket()]!.ins.map((i) => i.port).sort()).toEqual(['q', 'qs']);
    expect(s.delivered.s).toBeGreaterThan(0);
  });

  it('nothing right arrives: the jam names the belt it is about only when several inlets are wired', () => {
    const one = new Floor(LEVEL_BY_ID.L01!);
    const spool = one.c.machines.find((m) => m.kind === 'spool')!.id;
    one.wire(spool, one.socket(), 'qe');
    const r1 = one.compile().machines[one.socket()]!.status;
    expect(r1.k).toBe('jammed');
    expect((r1 as { reason: string }).reason).not.toMatch(/^From the/);

    const two = new Floor(LEVEL_BY_ID.L01!);
    const sp2 = two.c.machines.find((m) => m.kind === 'spool')!.id;
    two.wire(sp2, two.socket(), 'qe');
    two.wire(sp2, two.socket(), 'qs');
    const r2 = two.compile().machines[two.socket()]!.status;
    expect(r2.k).toBe('jammed');
    expect((r2 as { reason: string }).reason).toMatch(/^From the Spool: Needs/);
  });

  it('an unconnected dock still starves on its W inlet', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    expect(f.compile().machines[f.socket()]!.status.k).toBe('starved');
  });
});

describe('save migration: the old 2×1 dock grows to 2×2', () => {
  /** A delivered L01 floor as it was saved before the change: the dock one row lower (its 2×1 row = the W inlet's row). */
  function oldSave(): { f: Floor; now: Canvas; old: Canvas } {
    const { f } = l01('q');
    const now = f.c;
    const d = dockOf(now);
    const old: Canvas = { ...now, machines: now.machines.map((m) => (m.id === d.id ? { ...m, at: { x: d.at.x, y: d.at.y + 1 } } : m)) };
    return { f, now, old };
  }

  it('grows toward local −y: the W inlet and every old belt stay where they were', () => {
    const { f, now, old } = oldSave();
    const m = migrateDocks(old, f.ctx);
    expect(dockOf(m).at).toEqual(dockOf(now).at);
    expect(m.belts).toEqual(now.belts);
    expect(F.compile(m, f.ctx).solvable).toBe(true);
  });

  it('is idempotent and leaves a current canvas alone', () => {
    const { f, now, old } = oldSave();
    expect(migrateDocks(now, f.ctx)).toBe(now);
    const once = migrateDocks(old, f.ctx);
    expect(migrateDocks(once, f.ctx)).toBe(once);
    const fresh = F.initialCanvas(f.level, f.ctx);
    expect(migrateDocks(fresh, f.ctx)).toBe(fresh);
  });

  it('blocked above: grows toward +y; a belt from the south is cut back to the W inlet\'s side', () => {
    const { f, old } = oldSave();
    const od = dockOf(old);
    const blocker: Machine = { id: 'hopper9', kind: 'hopper', at: { x: od.at.x + 1, y: od.at.y - 1 }, rot: 0, config: { kind: 'hopper', t: null } };
    const c: Canvas = { ...old, machines: [...old.machines, blocker] };
    const m = migrateDocks(c, f.ctx);
    expect(m.machines.map((x) => x.id).sort()).toEqual(c.machines.map((x) => x.id).sort());   // nothing deleted
    expect(dockOf(m).at).toEqual(od.at);                                                     // grew downward
    const b = m.belts.find((x) => x.from.m !== 'pre:0')!;
    expect(b.to).toEqual({ m: od.id, port: 'q' });
    expect(b.broken).toBeUndefined();
    expect(F.compile(m, f.ctx).solvable).toBe(true);
  });

  it('blocked above: grows toward +y and re-attaches a doorstep belt to the inlet it now meets', () => {
    const { f, can } = l01('q');
    // the old floor: dock one row lower, its belt arriving on the W doorstep
    const d0 = dockOf(f.c);
    const od = { ...d0, at: { x: d0.at.x, y: d0.at.y + 1 } };
    const path = [{ x: 7, y: 3 }, { x: 8, y: 3 }, { x: 9, y: 3 }, { x: 9, y: 2 }, { x: 9, y: 1 }, { x: 10, y: 1 }];
    const old: Canvas = {
      ...f.c,
      machines: f.c.machines.map((x) => (x.id === od.id ? od : x)),
      belts: f.c.belts.map((b) => (b.from.m === can ? { ...b, path } : b)),
    };
    const blocker: Machine = { id: 'hopper9', kind: 'hopper', at: { x: od.at.x + 1, y: od.at.y - 1 }, rot: 0, config: { kind: 'hopper', t: null } };
    const c: Canvas = { ...old, machines: [...old.machines, blocker] };
    const m = migrateDocks(c, f.ctx);
    expect(m.machines.map((x) => x.id).sort()).toEqual(c.machines.map((x) => x.id).sort());   // nothing deleted
    expect(dockOf(m).at).toEqual(od.at);                                                     // grew downward
    const b = m.belts.find((x) => x.to?.m === od.id)!;
    expect(b.to).toEqual({ m: od.id, port: 'qn' });                                          // its end now meets the N inlet's side
    expect(b.broken).toBeUndefined();
    expect(F.compile(m, f.ctx).solvable).toBe(true);
  });

  it('blocked both ways: moves to the nearest free spot and opens the belt with a note', () => {
    const { f, old } = oldSave();
    const od = dockOf(old);
    const hop = (id: string, x: number, y: number): Machine => ({ id, kind: 'hopper', at: { x, y }, rot: 0, config: { kind: 'hopper', t: null } });
    const c: Canvas = { ...old, machines: [...old.machines, hop('hopper8', od.at.x + 1, od.at.y - 1), hop('hopper9', od.at.x + 1, od.at.y + 1)] };
    const m = migrateDocks(c, f.ctx);
    expect(m.machines.map((x) => x.id).sort()).toEqual(c.machines.map((x) => x.id).sort());
    const d = dockOf(m);
    const cells = new Set(footprint(d, f.ctx).map((t) => `${t.x},${t.y}`));
    for (const o of m.machines) if (o.id !== d.id) for (const t of footprint(o, f.ctx)) expect(cells.has(`${t.x},${t.y}`)).toBe(false);
    const b = m.belts.find((x) => x.from.m !== 'pre:0')!;
    if (b.to === null) expect(b.broken).toMatch(/Receiving Dock grew to 2×2/);
    else expect(b.to.m).toBe(od.id);
  });

  it('v3 saves go through the same rule (migrateCanvas)', () => {
    const { f, now, old } = oldSave();
    const m = F.migrateCanvas(old, f.ctx)!;
    expect(dockOf(m).at).toEqual(dockOf(now).at);
    expect(m.belts.filter((b) => b.broken)).toEqual([]);
  });
});
