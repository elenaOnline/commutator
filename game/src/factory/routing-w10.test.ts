// Playtest W4–9 #3 / W10–14 #7 — the room and routing grind: dense rooms route, desks line up opposite the gate,
// a machine beside the dock takes the nearest inlet, and refusals name machines by role, never by coordinates.
import { describe, expect, it } from 'vitest';
import type { KernelCtx } from '../kernel';
import { LEVEL_BY_ID, REGISTRY } from '../levels/levels';
import { connect, initialCanvas, paintRoom, place, placementWhy } from './editor';
import { frontOf, portsOf } from './geometry';
import type { Canvas, Machine, MachineConfig, Tile } from './index';

const ctxOf = (id: string): KernelCtx => ({
  level: { ...LEVEL_BY_ID[id]!, tools: { lift: true, merge: true, suppose: true, classical: true, press: true, conjecture: true, schemas: [] } },
  registry: REGISTRY,
});
const k = ctxOf('L09');
const a = { k: 'atom', id: 'a' } as const, b = { k: 'atom', id: 'b' } as const;
const RW: MachineConfig = { kind: 'rewriter', recipe: { k: 'cancel' }, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true };
const COORDS = /\(\s*-?\d+\s*,\s*-?\d+\s*\)/;
const must = (e: ReturnType<typeof connect>): Canvas => { if (!e.ok) throw new Error(e.reason); return e.canvas; };

describe('dense rooms route (W4–9 #3)', () => {
  it('a 10×10 room with 8 machines: desk → eight Rewriters → gate, every belt laid, none broken', () => {
    let c = initialCanvas(k.level, k);
    const room = { x: 3, y: 4, w: 10, h: 10 };
    c = must(paintRoom(c, room, 'suppose', a, b, k));
    const desk = c.machines.find((m) => m.kind === 'desk')!, gate = c.machines.find((m) => m.kind === 'gate')!;
    // two columns of four, one free row between machines: every corridor is someone's doorstep
    const ids: string[] = [];
    for (const dx of [2, 6]) for (const dy of [1, 3, 5, 7]) { const e = place(c, 'rewriter', { x: room.x + dx, y: room.y + dy }, 0, k, RW); c = must(e); ids.push(e.ok ? e.ids![0]! : ''); }
    const chain = [desk.id, ...ids, gate.id];
    for (let i = 0; i + 1 < chain.length; i++) c = must(connect(c, { m: chain[i]!, port: 'out' }, { m: chain[i + 1]!, port: 'q' }, k));
    expect(c.belts).toHaveLength(9);
    expect(c.belts.filter((x) => x.broken)).toEqual([]);
    // a belt crosses a free doorstep only straight along the machine's face, never into it
    const fronts = new Map<string, { m: Machine; face: string }>();
    for (const m of c.machines) for (const p of portsOf(m, k)) fronts.set(`${frontOf(p).x},${frontOf(p).y}`, { m, face: p.face });
    for (const bl of c.belts) bl.path.forEach((t, i) => {
      const f = fronts.get(`${t.x},${t.y}`);
      if (!f || f.m.id === bl.from.m || f.m.id === bl.to?.m) return;
      const pv = bl.path[i - 1]!, nx = bl.path[i + 1]!;
      expect(pv && nx, 'never ends on another doorstep').toBeTruthy();
      expect(pv.x === nx.x ? f.face === 'E' || f.face === 'W' : pv.y === nx.y && (f.face === 'N' || f.face === 'S')).toBe(true);
    });
  });
});

describe('desks along one edge, the gate opposite (W10–14 #7)', () => {
  it('three desks stand on the west wall facing the east gate, two rows apart, in slot order', () => {
    let c = initialCanvas(k.level, k);
    const room = { x: 3, y: 4, w: 10, h: 10 };
    const as = [{ rel: 'eq' as const, l: a, r: b }, { rel: 'neq' as const, l: a, r: b }, { rel: 'eq' as const, l: b, r: a }];
    c = must(paintRoom(c, room, 'assume', a, b, k, 'eq', as));
    const desks = c.machines.filter((m) => m.kind === 'desk').sort((p, q) => ((p.config as { slot?: number }).slot ?? 0) - ((q.config as { slot?: number }).slot ?? 0));
    const gate = c.machines.find((m) => m.kind === 'gate')!;
    expect(desks).toHaveLength(3);
    expect(gate.at.x).toBe(room.x + room.w - 1);
    for (const d of desks) { expect(d.at.x).toBe(room.x); expect(d.rot).toBe(0); }
    for (let i = 1; i < desks.length; i++) expect(desks[i]!.at.y - desks[i - 1]!.at.y).toBeGreaterThanOrEqual(2);
    // each desk's output reaches the gate without the next desk walling it in
    for (const d of desks) {
      const r = connect(c, { m: d.id, port: 'out' }, { m: gate.id, port: 'q' }, k);
      expect(r.ok).toBe(true);
    }
  });
});

describe('short belts to the dock (W10–14 #7)', () => {
  it('a ∀ beside the dock takes the nearest free inlet instead of belting round it', () => {
    const k1 = ctxOf('L01');
    let c = initialCanvas(k1.level, k1);
    const dock = c.machines.find((m) => m.kind === 'socket')!;
    const e = place(c, 'forall', { x: dock.at.x + 2, y: dock.at.y + 2 }, 0, k1, { kind: 'forall' });
    c = must(e);
    const fa = e.ok ? e.ids![0]! : '';
    c = must(connect(c, { m: fa, port: 'out' }, { m: dock.id, port: 'q' }, k1)); // asked for the far (west) inlet
    const bl = c.belts.at(-1)!;
    expect(bl.to!.port).not.toBe('q');
    expect(bl.path.length).toBeLessThanOrEqual(4);
  });
});

describe('names by role, never coordinates (W10–14 #7, W4–9 #5)', () => {
  it('overlap and doorstep refusals give a reason that names the machine by its recipe', () => {
    let c = initialCanvas(k.level, k);
    c = must(place(c, 'rewriter', { x: 4, y: 6 }, 0, k, RW));
    const ghost = (at: Tile, rot: Machine['rot'] = 0): Machine => ({ id: 'g', kind: 'rewriter', at, rot, config: RW });
    const over = placementWhy(c, ghost({ x: 5, y: 6 }), k);
    expect(over?.reason).toBe('The cancel Rewriter is in the way.');
    const door = placementWhy(c, ghost({ x: 3, y: 6 }, 1), k);
    expect(door?.reason).toMatch(/^That would block the cancel Rewriter’s/);
    for (const w of [over, door]) expect(w!.reason).not.toMatch(COORDS);
    const e = place(c, 'rewriter', { x: 5, y: 6 }, 0, k, RW);
    expect(e.ok).toBe(false);
    if (!e.ok) { expect(e.reason).toBeTruthy(); expect(e.reason).not.toMatch(COORDS); }
  });
});
