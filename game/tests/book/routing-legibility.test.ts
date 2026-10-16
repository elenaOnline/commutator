// Final playtests W1–7 #3 and W8–14 N20 (router spaghetti). On the isometric floor a Manhattan-shortest L-route between
// two ports one above the other runs along two edges of a diamond and reads as a loop round the floor. The router now
// keeps each belt in a band round the straight screen line between its ends, avoids labels, and tries the ports'
// sides when a doorstep is reached only the long way round.
//
// Fixtures: the Book reference floors that carry rooms, ∀ machines and docks (the lemma builders). Every belt is laid
// again by the router alone — in the reference order and in reverse — and each belt's own run (past the cells it shares
// with an earlier belt from the same output) must stay near its Manhattan length, inside the band, and off labels.
import { afterEach, describe, expect, it } from 'vitest';
import * as F from '../../src/factory';
import type { Tile } from '../../src/factory/types';
import { buildCommutator, buildDoubleInverse, buildIdempotent, buildOneSided } from './lemmas-w123';
import { buildConjugate, buildNegPower } from './lemmas-w89';
import { buildFibre, buildHomInv, buildOrders35 } from './lemmas-w1214';
import { buildSameCoset } from './lemmas-members';
import { buildFE } from './lemmas-wC';

type Floor = { c: F.Canvas; ctx: Parameters<typeof F.connect>[3] };
const FIXTURES: [string, () => Floor][] = [
  ['P4.4', () => buildDoubleInverse().f], ['P4.7', () => buildIdempotent().f], ['P4.9', () => buildCommutator().f],
  ['P4.10', () => buildOneSided().f], ['P9.3', () => buildFE().f], ['P9.4', () => buildHomInv().f],
  ['P10.1', () => buildNegPower().f], ['P10.2', () => buildConjugate().f], ['P10.4', () => buildOrders35().f],
  ['P12.1', () => buildSameCoset().f], ['P16.1', () => buildFibre().f],
];
const key = (t: Tile) => `${t.x},${t.y}`;

/** Re-lay every belt of a floor with the router alone; report each belt's own run. */
function relay(f: Floor, reverse: boolean) {
  const belts = f.c.belts.filter((b) => b.to);
  let c: F.Canvas = { ...f.c, belts: [] };
  const fails: string[] = [];
  for (const b of reverse ? [...belts].reverse() : belts) {
    const e = F.connect(c, b.from, b.to!, f.ctx);
    if (e.ok) c = e.canvas; else fails.push(e.reason);
  }
  const labels = F.labelCells(c, f.ctx);
  const runs = c.belts.filter((b) => b.to && b.path.length > 1).map((b, i, all) => {
    // the belt's own run: past the prefix it shares with an earlier belt from the same output (a copy tree)
    let k = 0;
    for (const o of all.slice(0, i)) if (o.from.m === b.from.m && o.from.port === b.from.port) {
      let j = 0; while (j < o.path.length && j < b.path.length && o.path[j]!.x === b.path[j]!.x && o.path[j]!.y === b.path[j]!.y) j++;
      k = Math.max(k, j);
    }
    const run = b.path.slice(Math.max(0, k - 1));
    const a = run[0]!, z = run[run.length - 1]!;
    const man = Math.abs(a.x - z.x) + Math.abs(a.y - z.y) + 1;
    return {
      what: `${b.from.m} → ${b.to!.m}`, len: run.length, man,
      // the band is the router's: round the line from the output's doorstep to the input's
      excess: Math.max(...run.map((t) => F.corridorExcess(b.path[0]!, z, t))),
      underLabels: run.filter((t) => labels.has(key(t))).length,
    };
  });
  return { runs, fails };
}

/** A run reads as legible: near its Manhattan length, inside the band round its straight line, at most a label crossing. */
const bad = (r: ReturnType<typeof relay>['runs'][number]) => r.len > 1.5 * r.man + 6 || r.excess > 1 || r.underLabels > 3;

describe('belt routes on the Book floors stay short and legible', () => {
  afterEach(() => { F.ROUTE_TUNING.corridor = 4; F.ROUTE_TUNING.label = 30; });
  for (const [id, build] of FIXTURES) {
    it(`${id}: every belt re-laid by the router (both orders) is within 1.5× Manhattan + 6, in its band, off labels`, () => {
      const f = build();
      for (const reverse of [false, true]) {
        const { runs, fails } = relay(f, reverse);
        expect(fails, `${id}${reverse ? ' (reverse)' : ''} routes every belt`).toEqual([]);
        expect(runs.filter(bad).map((r) => `${r.what}: ${r.len} cells, Manhattan ${r.man}, ${r.excess.toFixed(1)} tiles out of band, ${r.underLabels} under labels`)).toEqual([]);
      }
    });
  }
  it('control: the plain shortest route (no band, no label cost) fails the same check on these floors', () => {
    F.ROUTE_TUNING.corridor = 0; F.ROUTE_TUNING.label = 0;
    const loops = FIXTURES.flatMap(([id, build]) => relay(build(), false).runs.filter(bad).map((r) => `${id} ${r.what}`));
    expect(loops.length).toBeGreaterThan(3); // e.g. P4.4, P9.3, P9.4, P10.1: ∀ → dock as a wide L round the floor
  });
});
