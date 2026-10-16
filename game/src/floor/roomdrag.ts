// COMMUTATOR floor — the room a drag paints (pure: no DOM, testable in node).
//
// Final playtest W1–7 #4: the room used to be the tile rectangle covering the four corners of the dragged SCREEN
// rectangle. On the 2:1 isometric floor that rectangle's diamond circumscribes the drag, about twice its width and
// height (a ~300 px drag gave 9×8 … 13×13 rooms), so second rooms collided and gates landed under the HUD.
// Now the room is sized to the drag: a tile rectangle w × h projects to a diamond whose screen box is (w + h) tiles
// wide and (w + h) half-tiles high, so w + h follows the drag's screen extent, the split between w and h follows
// the drag's direction on the grid (never thinner than a third), and the room is centred on the drag. Only the
// 3 × 3 minimum is enforced.
import type { Belt, Canvas, Endpoint, Rect, Tile } from '../factory/types';

export type G2 = [number, number];
const MIN = 3;

/**
 * The room for a drag from grid point `a` to grid point `b` (continuous grid coordinates of the press and of the
 * pointer). Screen extents in grid units: across u = |Δx − Δy|, down v = |Δx + Δy|.
 */
export function dragRoomRect(a: G2, b: G2): Rect {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const u = Math.abs(dx - dy), v = Math.abs(dx + dy);
  // the room's screen box matches the drag: the geometric mean of its extents, or most of a thin drag's length
  const s = Math.max(Math.sqrt(u * v), 0.75 * Math.max(u, v), 2 * MIN);
  const p = Math.abs(dx) + Math.abs(dy) > 1e-6 ? Math.abs(dx) / (Math.abs(dx) + Math.abs(dy)) : 0.5;
  const q = Math.min(2 / 3, Math.max(1 / 3, p));
  const n = Math.round(s);
  const w = n <= 2 * MIN ? MIN : Math.max(MIN, Math.round(n * q)), h = n <= 2 * MIN ? MIN : Math.max(MIN, n - Math.round(n * q));
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
}

/** An obstacle on the floor: a machine footprint (half-open bounds) or another room. */
export interface Box { x0: number; x1: number; y0: number; y1: number; kind: 'machine' | 'fixed' | 'room'; what?: string }

/**
 * Make a dragged room cooperate with the floor, without overgrowing it:
 *  • a dock or a given (which never sit in a room) and another room it would cut through: the room stops short of it,
 *    on the side that keeps the most room (the anchor tile stays inside);
 *  • a machine half inside: taken in when most of it is inside, else left out — whichever moves the wall less.
 * `note` says what happened. The 3 × 3 minimum is the caller's to check.
 */
export function fitRoom(rect: Rect, anchor: Tile, boxes: Box[]): { rect: Rect; note: string } {
  let x0 = rect.x, x1 = rect.x + rect.w, y0 = rect.y, y1 = rect.y + rect.h;
  const ax = Math.min(Math.max(anchor.x, x0), x1 - 1), ay = Math.min(Math.max(anchor.y, y0), y1 - 1);
  let note = '';
  // the side of the obstacle that keeps the most room (the anchor's side preferred: worth a row of tiles)
  const shrinkPast = (b: Box): [number, number, number, number] | null => {
    const opts: [number, number, number, number, boolean][] = [];
    if (b.x0 > x0) opts.push([x0, b.x0, y0, y1, ax < b.x0]);
    if (b.x1 < x1) opts.push([b.x1, x1, y0, y1, ax >= b.x1]);
    if (b.y0 > y0) opts.push([x0, x1, y0, b.y0, ay < b.y0]);
    if (b.y1 < y1) opts.push([x0, x1, b.y1, y1, ay >= b.y1]);
    const score = (o: [number, number, number, number, boolean]) => (o[1] - o[0]) * (o[3] - o[2]) + (o[4] ? Math.max(o[1] - o[0], o[3] - o[2]) : 0);
    const best = opts.sort((p, q) => score(q) - score(p))[0];
    return best ? [best[0], best[1], best[2], best[3]] : null;
  };
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const b of boxes) {
      const ix = Math.min(x1, b.x1) - Math.max(x0, b.x0), iy = Math.min(y1, b.y1) - Math.max(y0, b.y0);
      if (ix <= 0 || iy <= 0) continue;
      const whole = b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1;
      if (b.kind === 'room') {
        const around = b.x0 <= x0 && b.x1 >= x1 && b.y0 <= y0 && b.y1 >= y1;
        if (whole || around) continue; // rooms nest
      } else if (b.kind === 'machine' && whole) continue;
      const area = (b.x1 - b.x0) * (b.y1 - b.y0);
      if (b.kind === 'machine' && ix * iy * 2 >= area) {
        // mostly inside: take all of it in (a wall moves by at most the machine's overhang)
        x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
        changed = true; continue;
      }
      const best = shrinkPast(b);
      if (!best) continue;
      [x0, x1, y0, y1] = best;
      note = b.kind === 'fixed' ? `Stops at the ${b.what ?? 'dock'}: those stay outside every room.`
        : b.kind === 'room' ? 'Stops at the other room: rooms nest or stay apart.' : '';
      changed = true;
    }
    if (!changed) break;
  }
  return { rect: { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) }, note };
}

/**
 * Final playtest W1–7 #17: the belt a drag asks for is already there (placing a machine auto-belted it, or it is a
 * second drag). The floor then does nothing but light it — never a refusal. A dock's four inlets count as one.
 */
export function duplicateBelt(c: Canvas, from: Endpoint, to: Endpoint): Belt | undefined {
  const dock = c.machines.find((m) => m.id === to.m)?.kind === 'socket';
  return c.belts.find((b) => !b.broken && !!b.to && b.from.m === from.m && b.from.port === from.port && b.to.m === to.m && (b.to.port === to.port || dock));
}
