// P6.2 A Section That Inverts — Book world 5. Tower x₁ ∈ A · Spool f(s(f(x₁))) · the section law at y := f(x₁) ·
// injectivity of f · ∀ → dock.
import { describe, expect, it } from 'vitest';
import type * as K from '../../src/kernel';
import { deliverC, lvC, nontrivialAll, targetsTrueC, app, given, towerIn, thm, lawRw, spool } from './kit-wC';

const L = lvC('P6.2');
const X = { k: 'atom', id: 'x1' } as K.Term;

export function buildP62() {
  const f = bookFloor62();
  f.add(towerIn('x1', 'x₁', 'A'), { x: 2, y: 30 });
  const sp = f.add(spool(app('f', app('s', app('f', X)))));
  const sec = f.add(lawRw(given('sec')));
  const inj = f.add(thm(given('injf')));
  const all = f.add({ kind: 'forall' });
  f.wire(sp, sec); f.wire(sec, inj, 'p0'); f.wire(inj, all); f.wire(all, f.socket());
  return f;
}
import { bookFloor } from './kit-wC';
function bookFloor62() { return bookFloor(L, ['cancel', 'witness', 'socks']); }

describe('P6.2 A Section That Inverts', () => {
  it('the dock is true in every model of its givens, with at least 10 nontrivial models', () => {
    targetsTrueC(L);
    // f injective with a section is a bijection, so with sets of size ≤ 3 there are only 2 + 6 = 8 nontrivial models
    // (the kernel oracle's bound); sets of size ≤ 4 give 32.
    expect(nontrivialAll(L, 3, 8).s).toBe(8);
    expect(nontrivialAll(L, 4).s).toBeGreaterThanOrEqual(10);
  });
  it('without injectivity the dock is false (the givens are both needed)', () => {
    const sock = L.sockets[0]!;
    const weak = { ...L, sockets: [{ ...sock, allowedGivens: ['sec'] }] };
    expect(() => targetsTrueC(weak)).toThrow();
  });
  it('reference solution', () => {
    deliverC(buildP62());
  }, 60_000);
});
