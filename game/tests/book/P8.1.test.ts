// P8.1 Determined by Its Square — Book world 6. Spool α → h₁ backwards at the end gap (α ⟶ ααα·α) → αα ⟶ ββ twice (h₃) → βββ ⟶ e (h₂).
// (The printed exercise 8.D6 is false for even order, e.g. (12) and (34); the odd-order version is used.)
import { describe, expect, it } from 'vitest';
import { P, bookFloor, deliver, eq, lawRw, lvA, neededGivens, pinGap, pinSpan, spool, targetsTrue } from './kit-wA';
import { EARNED, given } from './lemmas-w123';
import type * as K from '../../src/kernel';

const a: K.Term = { k: 'atom', id: 'a' }, b: K.Term = { k: 'atom', id: 'b' };

describe('P8.1 Determined by Its Square', () => {
  const L = lvA('P8.1');
  it('the target is true in every finite group under the givens, and every given is needed', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
    expect(neededGivens(L, 's')).toEqual({ h1: true, h2: true, h3: true });
  });
  it('the printed version (without the cubes) fails: even order breaks it', () => {
    const printed = { ...L, givens: L.givens.filter((g) => g.id === 'h3'), sockets: [{ ...L.sockets[0]!, allowedGivens: ['h3'] }] };
    expect(() => targetsTrue(printed)).toThrow();
  });
  it('reference solution', () => {
    const f = bookFloor(L, EARNED);
    const sp = f.add(spool(a), { x: 12, y: 8 });
    const i1 = f.add(lawRw(given('h1'), { dir: 'rev', gap: pinGap(eq(a, a), 'r', 1) }), { x: 18, y: 8 });
    const u1 = f.add(lawRw(given('h3'), { target: pinSpan(eq(a, P(a, a, a, a)), 'r', 0, 2) }), { x: 24, y: 8 });
    const u2 = f.add(lawRw(given('h3'), { target: pinSpan(eq(a, P(b, b, a, a)), 'r', 2, 4) }), { x: 30, y: 8 });
    const u3 = f.add(lawRw(given('h2')), { x: 36, y: 8 });
    f.wire(sp, i1); f.wire(i1, u1); f.wire(u1, u2); f.wire(u2, u3); f.wire(u3, f.socket());
    deliver(f);
  });
});
