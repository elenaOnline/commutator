import { describe, expect, it } from 'vitest';
import * as F from './index';
import { mkCtx } from '../kernel/testkit';
import { LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { Floor, P, a, b, eq, neq, knob, order, cancel, routed, op } from './compiler.testkit';

/** Hand-built canvas with exact one-tile belts (Sol §9 example). */
function mouldReflectorSocket() {
  const ctx = { ...mkCtx({ sockets: [{ id: 's', target: eq(a, a), allowedGivens: [] }] }), registry: REGISTRY };
  const c: F.Canvas = {
    version: 3, levelId: 'T', rooms: [],
    machines: [
      { id: 'hop', kind: 'hopper', at: { x: 10, y: 5 }, rot: 0, config: { kind: 'hopper', t: a } },
      { id: 'spool', kind: 'spool', at: { x: 12, y: 5 }, rot: 0, config: { kind: 'spool', t: { k: 'port' } } },
      { id: 'sock', kind: 'socket', at: { x: 14, y: 4 }, rot: 0, config: { kind: 'socket', socketId: 's' }, locked: true },
    ],
    belts: [
      { id: 'b1', from: { m: 'hop', port: 'out' }, to: { m: 'spool', port: 't' }, path: [{ x: 11, y: 5 }] },
      { id: 'b2', from: { m: 'spool', port: 'out' }, to: { m: 'sock', port: 'q' }, path: [{ x: 13, y: 5 }] },
    ],
  };
  return { c, ctx };
}

describe('tick runtime (§9)', () => {
  it('Mould → belt → Reflector → belt → socket delivers at tick 5', () => {
    const { c, ctx } = mouldReflectorSocket();
    const comp = F.compile(c, ctx);
    expect(comp.beltErrors).toEqual({});
    expect(comp.solvable).toBe(true);
    let s = F.initRun(c, comp);
    expect(s.packets.map((p) => p.at)).toEqual([{ k: 'port', m: 'hop', port: 'out' }]);
    const trace: string[] = [];
    while (s.tick < 5) {
      s = F.stepRun(s, c, comp);
      trace.push(`${s.tick}:${s.packets.map((p) => (p.at.k === 'belt' ? `${p.at.belt}[${p.at.i}]` : `${p.at.m}.${p.at.port}`)).join(',')}`);
    }
    expect(trace).toEqual(['1:b1[0]', '2:', '3:spool.out', '4:b2[0]', '5:']);
    expect(s.delivered).toEqual({ s: 5 });
    expect(s.live.sock).toBe('sealed');
    expect(F.factoryMetrics(c, s, comp)).toEqual({ machines: 2, area: 4, cycles: 5 });
    // sources re-emit every 6 ticks; the line stays alive
    while (s.tick < 6) s = F.stepRun(s, c, comp);
    expect(s.packets.some((p) => p.at.k === 'port' && p.at.m === 'hop')).toBe(true);
  });

  it('is deterministic and pure', () => {
    const { c, ctx } = mouldReflectorSocket();
    const comp = F.compile(c, ctx);
    const s0 = F.initRun(c, comp);
    const snap = JSON.stringify(s0);
    const x = F.stepRun(s0, c, comp), y = F.stepRun(s0, c, comp);
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
    expect(JSON.stringify(s0)).toBe(snap);
  });

  it('an unconnected output blocks its source; a jammed machine stays jammed and emits nothing', () => {
    const lv = order(eq(a, a));
    const f = new Floor(lv);
    const sp = f.add({ kind: 'spool', t: knob(a) });
    const can = f.add(cancel());
    f.wire(sp, can);
    const comp = f.compile();
    let s = F.initRun(f.c, comp);
    for (let i = 0; i < 200; i++) s = F.stepRun(s, f.c, comp);
    expect(s.live[can]).toBe('jammed');
    expect(s.live[sp]).toBe('blocked'); // its packet waits at the jammed Canceller's inlet
    expect(s.packets.every((p) => !(p.at.k === 'port' && p.at.m === can && p.at.port === 'out'))).toBe(true);
  });

  it('fork copies atomically to both consumers; a rule catalyst latches once', () => {
    const lv = order(eq(P(a, b), P(a, b)), [{ id: 'h', fact: eq(a, b) }]);
    const f = new Floor(lv);
    const sp = f.add({ kind: 'spool', t: knob(P(a, b)) });
    const r1 = f.add(routed({ tidy: false }));
    const sw = f.add(op({ k: 'swap' }));
    f.wire(sp, r1); f.wire(f.given('h'), r1, 'rule');
    const belt = f.c.belts.find((x) => x.to?.m === r1 && x.to?.port === 'q')!;
    const br = F.branch(f.c, belt.id, { m: sw, port: 'q' }, f.ctx);
    if (!br.ok) throw new Error(br.reason);
    f.c = br.canvas;
    const comp = f.compile();
    expect(comp.machines[r1]!.status).toEqual({ k: 'ok' });
    let s = F.initRun(f.c, comp);
    let r1Done = 0, swDone = 0;
    for (let i = 0; i < 60; i++) {
      s = F.stepRun(s, f.c, comp);
      if (s.packets.some((p) => p.at.k === 'port' && p.at.m === r1 && p.at.port === 'out')) r1Done++;
      if (s.packets.some((p) => p.at.k === 'port' && p.at.m === sw && p.at.port === 'out')) swDone++;
    }
    expect(r1Done).toBeGreaterThan(0);
    expect(swDone).toBeGreaterThan(0);
    expect(Object.keys(s.latched[r1] ?? {})).toEqual(['rule']);
  });

  it('a forged packet is discarded: the runtime never creates truth', () => {
    const { c, ctx } = mouldReflectorSocket();
    const comp = F.compile(c, ctx);
    let s = F.initRun(c, comp);
    s = { ...s, packets: [{ id: 99, value: { k: 'fact', fact: eq(a, b), node: 'spool#start' }, at: { k: 'belt', belt: 'b2', i: 0 } }], nextEmit: { hop: 1000 } };
    s = F.stepRun(s, c, comp);
    s = F.stepRun(s, c, comp);
    expect(s.delivered).toEqual({});
  });

  it('First Light runs to QED with stable metrics', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add(cancel());
    f.wire(spool, can); f.wire(can, f.socket());
    const { s, metrics } = f.run();
    expect(s.delivered.s).toBe(metrics.cycles);
    expect(metrics.machines).toBe(1);
    expect(s.live[f.socket()]).toBe('sealed');
  });

  it('perpendicular crossings are independent lines; nothing mixes', () => {
    const ctx = { ...mkCtx({ sockets: [{ id: 's', target: eq(a, a), allowedGivens: [] }] }), registry: REGISTRY };
    const c: F.Canvas = {
      version: 3, levelId: 'T', rooms: [],
      machines: [
        { id: 'h1', kind: 'hopper', at: { x: 10, y: 5 }, rot: 0, config: { kind: 'hopper', t: a } },
        { id: 's1', kind: 'spool', at: { x: 14, y: 5 }, rot: 0, config: { kind: 'spool', t: { k: 'port' } } },
        { id: 'h2', kind: 'hopper', at: { x: 12, y: 3 }, rot: 1, config: { kind: 'hopper', t: b } },
        { id: 's2', kind: 'spool', at: { x: 12, y: 7 }, rot: 1, config: { kind: 'spool', t: { k: 'port' } } },
      ],
      belts: [
        { id: 'b1', from: { m: 'h1', port: 'out' }, to: { m: 's1', port: 't' }, path: [{ x: 11, y: 5 }, { x: 12, y: 5 }, { x: 13, y: 5 }] },
        { id: 'b2', from: { m: 'h2', port: 'out' }, to: { m: 's2', port: 't' }, path: [{ x: 12, y: 4 }, { x: 12, y: 5 }, { x: 12, y: 6 }] },
      ],
    };
    const comp = F.compile(c, ctx);
    expect(comp.beltErrors).toEqual({});
    let s = F.initRun(c, comp);
    const outs = new Set<string>();
    for (let i = 0; i < 12; i++) {
      s = F.stepRun(s, c, comp);
      for (const p of s.packets) if (p.at.k === 'port' && p.at.port === 'out' && (p.at.m === 's1' || p.at.m === 's2')) outs.add(`${p.at.m}:${JSON.stringify(p.value.k === 'fact' && p.value.fact.k === 'eq' ? p.value.fact.l : null)}`);
    }
    expect([...outs].sort()).toEqual(['s1:{"k":"atom","id":"a"}', 's2:{"k":"atom","id":"b"}']);
    // the same cell taken along the same axis is still refused
    const bad = { ...c, belts: [c.belts[0]!, { ...c.belts[1]!, path: [{ x: 12, y: 4 }, { x: 12, y: 5 }, { x: 13, y: 5 }] }] };
    expect(F.compile(bad, ctx).beltErrors.b2).toBeDefined();
  });

  it('touching ports link directly (path []): one tick per hop', () => {
    const ctx = { ...mkCtx({ sockets: [{ id: 's', target: eq(a, a), allowedGivens: [] }] }), registry: REGISTRY };
    const c: F.Canvas = {
      version: 3, levelId: 'T', rooms: [],
      machines: [
        { id: 'hop', kind: 'hopper', at: { x: 10, y: 5 }, rot: 0, config: { kind: 'hopper', t: a } },
        { id: 'spool', kind: 'spool', at: { x: 11, y: 5 }, rot: 0, config: { kind: 'spool', t: { k: 'port' } } },
        { id: 'sock', kind: 'socket', at: { x: 12, y: 4 }, rot: 0, config: { kind: 'socket', socketId: 's' }, locked: true },
      ],
      belts: [
        { id: 'b1', from: { m: 'hop', port: 'out' }, to: { m: 'spool', port: 't' }, path: [] },
        { id: 'b2', from: { m: 'spool', port: 'out' }, to: { m: 'sock', port: 'q' }, path: [] },
      ],
    };
    const comp = F.compile(c, ctx);
    expect(comp.beltErrors).toEqual({});
    let s = F.initRun(c, comp);
    while (s.tick < 10 && s.delivered.s === undefined) s = F.stepRun(s, c, comp);
    expect(s.delivered.s).toBe(3);
  });

  it('a kept-but-broken belt carries nothing; downstream starves with a link to the belt', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add(cancel());
    f.wire(spool, can);
    const bid = f.wire(can, f.socket());
    f.c = { ...f.c, belts: f.c.belts.map((x) => (x.id === bid ? { ...x, broken: 'cut by the Swapper' } : x)) };
    const comp = f.compile();
    expect(comp.beltErrors[bid]).toBe('cut by the Swapper');
    expect(comp.machines[can]!.status).toEqual({ k: 'ok' });
    expect(comp.machines[f.socket()]!.status.k).toBe('starved');
    expect(F.rootCause(comp, f.socket())).toBe(bid);
    let s = F.initRun(f.c, comp);
    for (let i = 0; i < 40; i++) s = F.stepRun(s, f.c, comp);
    expect(s.packets.some((p) => p.at.k === 'belt' && p.at.belt === bid)).toBe(false);
    expect(s.delivered.s).toBeUndefined();
  });

  it('no packet flood: ≤ 2 packets per belt, and the blocked output reports how many wait', () => {
    const lv = order(eq(a, a));
    const f = new Floor(lv);
    const sp = f.add({ kind: 'spool', t: knob(a) }, { x: 4, y: 20 });
    const can = f.add(cancel(), { x: 24, y: 20 });
    const bid = f.wire(sp, can);
    const comp = f.compile();
    let s = F.initRun(f.c, comp);
    let maxOnBelt = 0;
    for (let i = 0; i < 120; i++) {
      s = F.stepRun(s, f.c, comp);
      maxOnBelt = Math.max(maxOnBelt, s.packets.filter((p) => p.at.k === 'belt' && p.at.belt === bid).length);
    }
    expect(maxOnBelt).toBeLessThanOrEqual(F.MAX_IN_FLIGHT);
    expect(F.queued(s)[sp]).toBeGreaterThan(1);
    expect(s.live[sp]).toBe('blocked');
  });

  it('status honesty: a compiled-ok machine is never "starved" between packets', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add(cancel());
    f.wire(spool, can); f.wire(can, f.socket());
    const comp = f.compile();
    let s = F.initRun(f.c, comp);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) { s = F.stepRun(s, f.c, comp); seen.add(s.live[can]!); }
    expect(comp.machines[can]!.status).toEqual({ k: 'ok' });
    expect(seen.has('starved')).toBe(false);
    expect(seen.has('idle') && seen.has('working')).toBe(true);
    expect(s.live[f.socket()]).toBe('sealed');
  });

  it('side approaches: a gate fed ⊥ from beside its doorstep discharges and delivers', () => {
    const ctx = { ...mkCtx({ givens: [{ id: 'n', name: 'n', fact: neq(a, b) }], sockets: [{ id: 's', target: neq(a, b), allowedGivens: ['n'] }] }), registry: REGISTRY };
    const c: F.Canvas = {
      version: 3, levelId: 'T',
      rooms: [{ id: 'R', kind: 'suppose', l: a, r: b, rect: { x: 10, y: 0, w: 8, h: 6 } }],
      machines: [
        { id: 'n', kind: 'given', at: { x: 0, y: 2 }, rot: 0, config: { kind: 'given', givenId: 'n' }, locked: true },
        { id: 'desk', kind: 'desk', at: { x: 11, y: 1 }, rot: 0, config: { kind: 'desk', room: 'R' }, locked: true },
        { id: 'anvil', kind: 'joiner', at: { x: 13, y: 1 }, rot: 0, config: { kind: 'joiner', recipe: { k: 'clash' } } },
        { id: 'gate', kind: 'gate', at: { x: 17, y: 2 }, rot: 0, config: { kind: 'gate', room: 'R' }, locked: true },
        { id: 'sock', kind: 'socket', at: { x: 20, y: 1 }, rot: 0, config: { kind: 'socket', socketId: 's' }, locked: true },
      ],
      belts: [
        { id: 'b1', from: { m: 'desk', port: 'out' }, to: { m: 'anvil', port: 'a' }, path: [{ x: 12, y: 1 }] },
        { id: 'b2', from: { m: 'n', port: 'out' }, to: { m: 'anvil', port: 'b' }, path: Array.from({ length: 12 }, (_, i) => ({ x: 1 + i, y: 2 })) },
        // arrives at (17,1): beside the gate's cell, not its doorstep (16,2)
        { id: 'b3', from: { m: 'anvil', port: 'out' }, to: { m: 'gate', port: 'q' }, path: [{ x: 15, y: 1 }, { x: 16, y: 1 }, { x: 17, y: 1 }] },
        { id: 'b4', from: { m: 'gate', port: 'out' }, to: { m: 'sock', port: 'q' }, path: [{ x: 18, y: 2 }, { x: 19, y: 2 }] },
      ],
    };
    const comp = F.compile(c, ctx);
    expect(comp.beltErrors).toEqual({});
    expect(comp.solvable).toBe(true);
    let s = F.initRun(c, comp);
    while (s.tick < 60 && s.delivered.s === undefined) s = F.stepRun(s, c, comp);
    expect(s.delivered.s).toBeDefined();
    // behind the port (the cell opposite its facing) is never an approach
    const behind = { ...c, belts: c.belts.map((x) => (x.id === 'b4' ? { ...x, path: [{ x: 18, y: 2 }, { x: 18, y: 3 }, { x: 19, y: 3 }, { x: 19, y: 2 }] } : x)) };
    expect(F.compile(behind, ctx).beltErrors).toEqual({}); // (19,2) is still the dock's doorstep
    const bad = { ...c, belts: c.belts.map((x) => (x.id === 'b4' ? { ...x, path: [{ x: 18, y: 2 }, { x: 18, y: 1 }, { x: 19, y: 1 }, { x: 20, y: 1 }, { x: 21, y: 1 }, { x: 22, y: 1 }, { x: 22, y: 2 }] } : x)) };
    expect(F.compile(bad, ctx).beltErrors.b4).toBeDefined(); // (22,2) is behind the dock's inlet
  });

  it('fan-out beside a direct link: one output feeds a touching inlet and a side belt', () => {
    const ctx = { ...mkCtx({ sockets: [{ id: 's', target: eq(a, a), allowedGivens: [] }] }), registry: REGISTRY };
    const c: F.Canvas = {
      version: 3, levelId: 'T', rooms: [],
      machines: [
        { id: 'hop', kind: 'hopper', at: { x: 10, y: 5 }, rot: 0, config: { kind: 'hopper', t: a } },
        { id: 's1', kind: 'spool', at: { x: 11, y: 5 }, rot: 0, config: { kind: 'spool', t: { k: 'port' } } },
        { id: 's2', kind: 'spool', at: { x: 12, y: 6 }, rot: 0, config: { kind: 'spool', t: { k: 'port' } } },
      ],
      belts: [
        { id: 'b1', from: { m: 'hop', port: 'out' }, to: { m: 's1', port: 't' }, path: [] },
        { id: 'b2', from: { m: 'hop', port: 'out' }, to: { m: 's2', port: 't' }, path: [{ x: 10, y: 6 }, { x: 11, y: 6 }] },
      ],
    };
    const comp = F.compile(c, ctx);
    expect(comp.beltErrors).toEqual({});
    let s = F.initRun(c, comp);
    const made = new Map<string, number>();
    for (let i = 0; i < 8; i++) {
      s = F.stepRun(s, c, comp);
      for (const p of s.packets) if (p.at.k === 'port' && p.at.port === 'out' && p.at.m !== 'hop' && !made.has(p.at.m)) made.set(p.at.m, s.tick);
    }
    expect(Object.fromEntries(made)).toEqual({ s1: 2, s2: 4 }); // direct link: 1 edge; side belt: 3 edges (2 cells), +1 tick of work each
  });

  it('an open belt (to a ground cell) feeds nothing: packets wait at its end, ≤ 2, and the source blocks', () => {
    const ctx = { ...mkCtx({ sockets: [{ id: 's', target: eq(a, a), allowedGivens: [] }] }), registry: REGISTRY };
    const c: F.Canvas = {
      version: 3, levelId: 'T', rooms: [],
      machines: [{ id: 'hop', kind: 'hopper', at: { x: 10, y: 5 }, rot: 0, config: { kind: 'hopper', t: a } }],
      belts: [{ id: 'b1', from: { m: 'hop', port: 'out' }, to: null, path: [{ x: 11, y: 5 }, { x: 12, y: 5 }, { x: 13, y: 5 }, { x: 14, y: 5 }] }],
    };
    const comp = F.compile(c, ctx);
    expect(comp.beltErrors).toEqual({});
    expect(comp.machines.hop!.status).toEqual({ k: 'ok' });
    let s = F.initRun(c, comp);
    for (let i = 0; i < 40; i++) s = F.stepRun(s, c, comp);
    const onBelt = s.packets.filter((p) => p.at.k === 'belt');
    expect(onBelt.length).toBe(2);
    expect(onBelt.some((p) => p.at.k === 'belt' && p.at.i === 3)).toBe(true);
    expect(s.live.hop).toBe('blocked');
    expect(F.queued(s).hop).toBeGreaterThan(0);
  });
});
