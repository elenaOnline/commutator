// P6.1 One-to-One — Book world 5. Two docks, both inside an Assume room over Towers x₁, y₁ ∈ A.
//   s1: Assume g(f(x₁)) = g(f(y₁)) → injectivity of g (u := f(x₁), v := f(y₁)) → injectivity of f → gate → ∀ → dock.
//   s2: Assume f(x₁) = f(y₁) → apply g to both sides → injectivity of g∘f → gate → ∀ → dock.
import { describe, expect, it } from 'vitest';
import type * as K from '../../src/kernel';
import { bookFloor, deliverC, lvC, nontrivialAll, targetsTrueC, app, given, towerIn, thm, op } from './kit-wC';

const L = lvC('P6.1');
const X = { k: 'atom', id: 'x1' } as K.Term, Y = { k: 'atom', id: 'y1' } as K.Term;

export function buildP61() {
  const f = bookFloor(L, ['cancel', 'witness', 'socks']);
  f.add(towerIn('x1', 'x₁', 'A'), { x: 2, y: 44 });
  f.add(towerIn('y1', 'y₁', 'A'), { x: 4, y: 44 });
  // s1
  const r1 = f.room({ x: 18, y: 4, w: 30, h: 10 }, 'assume', app('g', app('f', X)), app('g', app('f', Y)));
  const tg = f.add(thm({ k: 'given', givenId: 'injg' }), { x: 22, y: 8 });
  const tf = f.add(thm({ k: 'given', givenId: 'injf' }), { x: 30, y: 8 });
  const all1 = f.add({ kind: 'forall' }, { x: 54, y: 6 });
  f.wire(r1.desk, tg, 'p0'); f.wire(tg, tf, 'p0'); f.wire(tf, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('s1'));
  // s2
  const r2 = f.room({ x: 18, y: 18, w: 30, h: 10 }, 'assume', app('f', X), app('f', Y));
  const ap = f.add(op({ k: 'apply', fn: 'g' }), { x: 22, y: 22 });
  const tgf = f.add(thm({ k: 'given', givenId: 'injgf' }), { x: 30, y: 22 });
  const all2 = f.add({ kind: 'forall' }, { x: 54, y: 20 });
  f.wire(r2.desk, ap); f.wire(ap, tgf, 'p0'); f.wire(tgf, r2.gate); f.wire(r2.gate, all2); f.wire(all2, f.socket('s2'));
  return f;
}

describe('P6.1 One-to-One', () => {
  it('both docks are true in every model of their givens, with at least 10 nontrivial models each', () => {
    targetsTrueC(L);
    const n = nontrivialAll(L);
    expect(n.s1).toBeGreaterThanOrEqual(10);
    expect(n.s2).toBeGreaterThanOrEqual(10);
  });
  it('reference solution', () => {
    deliverC(buildP61());
  }, 60_000);
});
