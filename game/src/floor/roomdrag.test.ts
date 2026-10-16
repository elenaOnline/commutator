// Final playtest W1–7 #4 (rooms overgrow the drag) and #17 (a duplicate belt drag refused).
import { describe, expect, it } from 'vitest';
import * as F from '../factory';
import { Floor, cancel, spool } from '../factory/compiler.testkit';
import { LEVEL_BY_ID } from '../levels/levels';
import { dragRoomRect, duplicateBelt, fitRoom, type G2 } from './roomdrag';

/** A screen drag of (dx, dy) CSS px at zoom z, from grid point a (board/geom: x = (gx − gy)·42, y = (gx + gy)·21). */
const drag = (a: G2, dx: number, dy: number, z = 1): [G2, G2] => {
  const wx = dx / z, wy = dy / z;
  return [a, [a[0] + (wx / 42 + wy / 21) / 2, a[1] + (wy / 21 - wx / 42) / 2]];
};
/** Screen box (grid units: across = w + h tiles of 42 px, down = w + h half-tiles of 21 px) of a w × h room. */
const across = (r: { w: number; h: number }) => (r.w + r.h) * 42;

describe('a dragged room is sized to the drag', () => {
  it('a ~300 px screen-diagonal drag gives a room whose diamond fills the drag, not 9×8 … 13×13', () => {
    for (const z of [0.8, 1, 1.35]) {
      const r = dragRoomRect(...drag([10.3, 4.2], 300, 150, z));
      // the old rule (tile box of the four screen corners) gave w = h ≈ (u + v)/2: about twice the drag each way
      expect(across(r) * z).toBeGreaterThan(300 * 0.75);
      expect(across(r) * z).toBeLessThan(Math.max(300 * 1.3, 6 * 42 * z + 1)); // or the 3 × 3 minimum
      expect(r.w).toBeGreaterThanOrEqual(3); expect(r.h).toBeGreaterThanOrEqual(3);
    }
  });
  it('horizontal, vertical and square drags all paint (never a 1-tile strip), centred on the drag', () => {
    for (const [dx, dy] of [[320, 0], [0, 200], [300, 300], [-300, -150], [300, -150]] as const) {
      const [a, b] = drag([5, 5], dx, dy);
      const r = dragRoomRect(a, b);
      expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(3);
      expect(Math.max(r.w, r.h) / Math.min(r.w, r.h)).toBeLessThanOrEqual(2.5);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      expect(Math.abs(cx - (a[0] + b[0]) / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(cy - (a[1] + b[1]) / 2)).toBeLessThanOrEqual(1);
      expect(across(r)).toBeLessThan(Math.max(Math.abs(dx), Math.abs(dy) * 2) * 1.3);
    }
  });
  it('a tiny drag gives the 3 × 3 minimum', () => {
    expect(dragRoomRect([4, 4], [4.3, 4.1])).toMatchObject({ w: 3, h: 3 });
  });
});

describe('a dragged room cooperates without overgrowing', () => {
  it('stops short of another room it would cut (a second room is not refused for overlap)', () => {
    const { rect, note } = fitRoom({ x: 10, y: 0, w: 6, h: 5 }, { x: 13, y: 2 }, [{ x0: 4, x1: 12, y0: 0, y1: 6, kind: 'room' }]);
    expect(rect).toEqual({ x: 12, y: 0, w: 4, h: 5 });
    expect(note).toMatch(/other room/);
  });
  it('nests around or inside another room untouched', () => {
    expect(fitRoom({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 }, [{ x0: 2, x1: 5, y0: 2, y1: 5, kind: 'room' }]).rect).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
  it('takes in a machine mostly inside, leaves out one mostly outside, stops at a dock', () => {
    expect(fitRoom({ x: 0, y: 0, w: 6, h: 5 }, { x: 2, y: 2 }, [{ x0: 4, x1: 7, y0: 1, y1: 2, kind: 'machine' }]).rect).toEqual({ x: 0, y: 0, w: 7, h: 5 });
    expect(fitRoom({ x: 0, y: 0, w: 6, h: 5 }, { x: 2, y: 2 }, [{ x0: 5, x1: 8, y0: 1, y1: 2, kind: 'machine' }]).rect).toEqual({ x: 0, y: 0, w: 5, h: 5 });
    const d = fitRoom({ x: 0, y: 0, w: 8, h: 6 }, { x: 2, y: 2 }, [{ x0: 6, x1: 8, y0: 0, y1: 2, kind: 'fixed', what: 'dock' }]);
    expect(d.rect.x + d.rect.w).toBeLessThanOrEqual(6);
    expect(d.note).toMatch(/dock/);
    // the drag centred on a dock (P10.2): the room still steps off it, never painted over it and refused
    const on = fitRoom({ x: 9, y: -1, w: 6, h: 5 }, { x: 11, y: 1 }, [{ x0: 11, x1: 13, y0: 0, y1: 2, kind: 'fixed', what: 'dock' }]);
    const r = on.rect;
    expect(r.x >= 13 || r.x + r.w <= 11 || r.y >= 2 || r.y + r.h <= 0).toBe(true);
  });
});

describe('a duplicate belt drag is a no-op, not a refusal', () => {
  it('finds the belt placement already laid (any dock inlet counts)', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const sp = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add(cancel(), { x: 5, y: 3 });
    f.wire(sp, can); f.wire(can, f.socket(), 'qn');
    expect(duplicateBelt(f.c, { m: sp, port: 'out' }, { m: can, port: 'q' })).toBeDefined();
    expect(duplicateBelt(f.c, { m: can, port: 'out' }, { m: f.socket(), port: 'q' })).toBeDefined();
    expect(duplicateBelt(f.c, { m: can, port: 'out' }, { m: sp, port: 'q' })).toBeUndefined();
    // the editor itself still refuses the second belt: the floor never asks it
    expect(F.connect(f.c, { m: sp, port: 'out' }, { m: can, port: 'q' }, f.ctx)).toMatchObject({ ok: false });
    void spool;
  });
});
