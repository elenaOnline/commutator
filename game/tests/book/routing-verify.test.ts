// Verify-fixround (design/pinter/reviews/verify-fixround.md, claim 4c): the floors the verifier built with the real
// pointer, replayed placement by placement and drag by drag (routing-verify.fixtures.json, taken from its runs):
//  • P4.1: the chain Joiner beside dock s (placing it links it to the dock; the drag after is the same belt again);
//  • P4.9: a 9×4 Assume room whose last Cancel ends on the wall beside the gate, then gate → ∀ → dock s — in both
//    drag orders (the cancel → gate belt looped round the room and sealed the desk's belt, or the other way round);
//  • P4.10 (round 2): a Theorem two tiles from a Rewriter's rule port whose doorstep is boxed in — an honest refusal;
//  • P4.12: three Suppose rooms, each wired given → Clash → gate → dock;
//  • P10.2: two rooms, gate → ∀ → dock for each (the ∀ → dock belt went round both docks to the far inlet).
// A drag between neighbours always routes, and no belt runs round a room or a dock: every belt stays within
// 1.5× its Manhattan length (+ 6).
import { describe, expect, it } from 'vitest';
import * as F from '../../src/factory';
import type { DeskAssumption, LevelManifest } from '../../src/kernel/types';
import { duplicateBelt } from '../../src/floor/roomdrag';
import { bookFloor, lv } from './kit-w123';
import { EARNED } from './lemmas-w123';
import { lv89 } from './kit-w89';
import { EARNED as EARNED89 } from './lemmas-w89';
import FIX from './routing-verify.fixtures.json';

type Step = { place?: { kind: F.MachineKind; at: F.Tile; rot: F.Rot; config: F.MachineConfig }; as?: string; room?: number; wire?: [string, string, string] };
type Fixture = { level: string; rooms: { rect: F.Rect; kind: F.Room['kind']; l: F.Room['l']; r: F.Room['r']; rel?: F.Room['rel']; assumes?: DeskAssumption[] }[]; steps: Step[] };
const fixtures = FIX as unknown as Record<string, Fixture>;
const levelOf = (id: string): [LevelManifest, string[]] => (id.startsWith('P10') ? [lv89(id), EARNED89] : [lv(id), id === 'P4.10' ? [...EARNED, 'witness'] : EARNED]);

function replay(fx: Fixture, order?: (steps: Step[]) => Step[]) {
  const [level, earned] = levelOf(fx.level);
  const f = bookFloor(level, earned);
  const ids = new Map<string, string>();
  const id = (x: string) => ids.get(x) ?? x;
  const log: string[] = [];
  let skipped = 0;
  for (const s of order ? order(fx.steps) : fx.steps) {
    if (s.place) {
      const before = new Set(f.c.machines.map((m) => m.id));
      const e = F.place(f.c, s.place.kind, s.place.at, s.place.rot, f.ctx, s.place.config);
      if (!e.ok) { log.push(`place ${s.as}: ${e.reason}`); continue; }
      f.c = e.canvas; ids.set(s.as!, f.c.machines.find((m) => !before.has(m.id))!.id);
    } else if (s.room !== undefined) {
      const r = fx.rooms[s.room]!;
      const e = F.paintRoom(f.c, r.rect, r.kind, r.l, r.r, f.ctx, r.rel, r.assumes);
      if (!e.ok) { log.push(`room ${s.room}: ${e.reason}`); continue; }
      f.c = e.canvas;
    } else if (s.wire) {
      const from = { m: id(s.wire[0]), port: 'out' }, to = { m: id(s.wire[1]), port: s.wire[2] };
      if (duplicateBelt(f.c, from, to)) { skipped++; continue; } // the floor lights the belt already there
      const e = F.connect(f.c, from, to, f.ctx);
      if (!e.ok) { log.push(`wire ${s.wire.join(' ')}: ${e.reason}`); continue; }
      f.c = e.canvas;
    }
  }
  const long = f.c.belts.filter((b) => b.to && b.path.length > 1).flatMap((b) => {
    const a = b.path[0]!, z = b.path[b.path.length - 1]!;
    const man = Math.abs(a.x - z.x) + Math.abs(a.y - z.y) + 1;
    return b.broken || b.path.length > 1.5 * man + 6 ? [`${b.from.m} → ${b.to!.m}: ${b.path.length} cells, Manhattan ${man}${b.broken ? ' (broken)' : ''}`] : [];
  });
  return { f, log, long, skipped, ids };
}

describe('the verifier\'s floors route short', () => {
  it('P4.1: the Joiner beside dock s is linked once, directly; nothing loops', () => {
    const { f, log, long, skipped } = replay(fixtures['P4.1']!);
    expect(log).toEqual([]);
    expect(long).toEqual([]);
    expect(skipped).toBe(1); // joiner → dock s: already linked when the Joiner was placed
    expect(f.c.belts.filter((b) => b.from.m === 'joiner1')).toHaveLength(1);
  });

  for (const [name, order] of [
    ['the verifier\'s order', undefined],
    ['cancel → gate before the desk\'s belt', (s: Step[]) => { const i = s.findIndex((x) => x.wire?.[1] === 'gate:room1'); const j = s.findIndex((x) => x.wire?.[0] === 'desk:room1'); const out = [...s]; const [g] = out.splice(i, 1); out.splice(j, 0, g!); return out; }],
  ] as const) {
    it(`P4.9 (${name}): cancel → gate inside the 9×4 room is short, the desk's belt still routes, ∀ → dock is short`, () => {
      const { f, log, long } = replay(fixtures['P4.9']!, order);
      expect(log).toEqual([]);
      expect(long).toEqual([]);
      const cg = f.c.belts.find((b) => b.from.m === 'rewriter3' && b.to?.m === 'gate:room1');
      expect(cg?.path.length).toBeLessThanOrEqual(3);
      const solved = f.run(400);
      expect(solved.s.delivered.s).toBeDefined();
    });
  }

  it('P4.12: three Suppose rooms, given → clash, clash → gate, gate → dock: every belt short', () => {
    for (const k of ['P4.12', 'P4.12b']) { // round 1's rooms, and round 2's (below and left of the docks)
      const { log, long } = replay(fixtures[k]!);
      expect(log, k).toEqual([]);
      expect(long, k).toEqual([]);
    }
  });

  it('P4.10 (round 2): Theorem → rule port boxed in by the Spool\'s belt and the room wall says so, naming them; the rest routes', () => {
    const { f, log, long, ids } = replay(fixtures['P4.10']!);
    // the one refusal is honest: the rule input's doorstep (north side, on the room's top row) is walled by the room
    // wall, the Rewriter itself and the Spool's belt — it names those, never "another routed Rewriter"
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/^wire theorem1 rewriter1 rule: no route: the routed Rewriter’s rule input is boxed in by the belt from the Spool and the room wall/);
    expect(log[0]).not.toMatch(/another/);
    expect(long).toEqual([]);
    // the reverse drag (input onto output) asks the editor for the same belt, so it gets the same answer
    const again = F.connect(f.c, { m: ids.get('theorem1') ?? 'theorem1', port: 'out' }, { m: ids.get('rewriter1') ?? 'rewriter1', port: 'rule' }, f.ctx);
    expect(again.ok ? '' : again.reason).toBe(log[0]!.replace(/^wire theorem1 rewriter1 rule: /, ''));
  });

  it('P10.2: gate → ∀ → dock for both rooms; the ∀ → dock t belt takes the near inlet', () => {
    const { f, log, long } = replay(fixtures['P10.2']!);
    expect(log).toEqual([]);
    expect(long).toEqual([]);
    const toT = f.c.belts.find((b) => b.to?.m === 'socket:t')!;
    expect(toT.to!.port).not.toBe('q'); // the far (west) inlet the drag pointed at was the loop
  });
});
