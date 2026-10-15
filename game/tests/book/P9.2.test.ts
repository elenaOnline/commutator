// P9.2 The Inverse of an Isomorphism — Book world 7. Towers u₁, v₁ ∈ K · Spool g(u₁v₁) · R backwards at u₁ and v₁ (inside g) ·
// the hom law backwards inside g · L · ∀ → dock.
import { describe, expect, it } from 'vitest';
import * as F from '../../src/factory';
import type * as K from '../../src/kernel';
import { bookFloor, deliverC, lvC, nontrivialAll, targetsTrueC, app, given, schema, towerIn, lawRw, spool, P, eq } from './kit-wC';

const L = lvC('P9.2');
const A = (id: string): K.Term => ({ k: 'atom', id });
const u = A('u1'), v = A('v1');
const fg = (t: K.Term) => app('f', app('g', t));

export function buildP92() {
  const f = bookFloor(L, ['cancel', 'witness', 'socks']);
  f.add(towerIn('u1', 'u₁', 'K'), { x: 2, y: 30 });
  f.add(towerIn('v1', 'v₁', 'K'), { x: 4, y: 30 });
  const sp = f.add(spool(app('g', P(u, v))));
  const pinU = F.pinFromAddr(eq(app('g', P(u, v)), app('g', P(u, v))), { side: 'r', path: [0], range: [0, 1] })!;
  const b1 = f.add(lawRw(given('R'), { dir: 'rev', target: pinU }));
  const pinV = F.pinFromAddr(eq(app('g', P(u, v)), app('g', P(fg(u), v))), { side: 'r', path: [0], range: [1, 2] })!;
  const b2 = f.add(lawRw(given('R'), { dir: 'rev', target: pinV }));
  const h = f.add(lawRw(schema('hom.mul'), { dir: 'rev' }));
  const l = f.add(lawRw(given('L')));
  const all = f.add({ kind: 'forall' });
  for (const [x, y] of [[sp, b1], [b1, b2], [b2, h], [h, l], [l, all]] as const) f.wire(x, y);
  f.wire(all, f.socket());
  return f;
}

describe('P9.2 The Inverse of an Isomorphism', () => {
  it('the dock is true in every model of its givens, with at least 10 nontrivial models', () => {
    targetsTrueC(L);
    expect(nontrivialAll(L).s).toBeGreaterThanOrEqual(10);
  });
  it('both givens are needed', () => {
    for (const drop of ['L', 'R']) {
      const weak = { ...L, sockets: [{ ...L.sockets[0]!, allowedGivens: L.sockets[0]!.allowedGivens.filter((g) => g !== drop) }] };
      expect(() => targetsTrueC(weak), `dropping ${drop}`).toThrow();
    }
  });
  it('reference solution', () => {
    deliverC(buildP92());
  }, 60_000);
});
