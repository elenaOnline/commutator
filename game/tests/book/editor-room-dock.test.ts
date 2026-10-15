// paintRoom used to accept a rectangle that fully contains a Receiving Dock (P4.9's second dock sits at (11,4), 2×2;
// the rect x 10–39, y 4–13 swallows it). Fixed in editor.ts roomReason (kernel lead): a room refuses to hold a dock
// or a given inlet, with a reason.
import { describe, expect, it } from 'vitest';
import * as F from '../../src/factory';
import { bookFloor, lv } from './kit-w123';

describe('editor: a room may not cover a Receiving Dock', () => {
  it('paintRoom refuses a rectangle over the dock of P4.9', () => {
    const f = bookFloor(lv('P4.9'));
    const dock = f.c.machines.find((m) => m.id === 'socket:t')!; // the second dock, at (11, 4)
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 30, h: 10 }, 'assume', { k: 'e' }, { k: 'e' }, f.ctx);
    expect(e.ok).toBe(false);
    expect((e as { reason: string }).reason).toBe('A room can’t hold the dock. Keep the dock outside every room.');
    void dock;
  });
});
