// P9.1 Commutativity Survives — Book world 7. Towers u₁, v₁ ∈ K · Spool u₁v₁ · the section backwards at u₁ and at v₁ ·
// the hom law backwards · C inside f · the hom law · the section twice · ∀ → dock.
import { describe, expect, it } from 'vitest';
import * as F from '../../src/factory';
import type * as K from '../../src/kernel';
import { bookFloor, deliverC, lvC, nontrivialAll, targetsTrueC, app, given, schema, towerIn, lawRw, spool, P, eq } from './kit-wC';

const L = lvC('P9.1');
const A = (id: string): K.Term => ({ k: 'atom', id });
const u = A('u1'), v = A('v1');
const fs = (t: K.Term) => app('f', app('s', t));

export function buildP91() {
  const f = bookFloor(L, ['cancel', 'witness', 'socks']);
  f.add(towerIn('u1', 'u₁', 'K'), { x: 2, y: 30 });
  f.add(towerIn('v1', 'v₁', 'K'), { x: 4, y: 30 });
  const sp = f.add(spool(P(u, v)));
  const pinU = F.pinFromAddr(eq(P(u, v), P(u, v)), { side: 'r', path: [], range: [0, 1] })!;
  const b1 = f.add(lawRw(given('sec'), { dir: 'rev', target: pinU }));
  const pinV = F.pinFromAddr(eq(P(u, v), P(fs(u), v)), { side: 'r', path: [], range: [1, 2] })!;
  const b2 = f.add(lawRw(given('sec'), { dir: 'rev', target: pinV }));
  const h1 = f.add(lawRw(schema('hom.mul'), { dir: 'rev' }));
  const pinC = F.pinFromAddr(eq(P(u, v), app('f', P(app('s', u), app('s', v)))), { side: 'r', path: [0], range: [0, 2] })!;
  const c = f.add(lawRw(given('C'), { target: pinC }));
  const h2 = f.add(lawRw(schema('hom.mul')));
  const s1 = f.add(lawRw(given('sec')));
  const s2 = f.add(lawRw(given('sec')));
  const all = f.add({ kind: 'forall' });
  for (const [x, y] of [[sp, b1], [b1, b2], [b2, h1], [h1, c], [c, h2], [h2, s1], [s1, s2], [s2, all]] as const) f.wire(x, y);
  f.wire(all, f.socket());
  return f;
}

describe('P9.1 Commutativity Survives', () => {
  it('the dock is true in every model of its givens, with at least 10 nontrivial models', () => {
    targetsTrueC(L);
    expect(nontrivialAll(L).s).toBeGreaterThanOrEqual(10);
  });
  it('both givens are needed', () => {
    for (const drop of ['sec', 'C']) {
      const weak = { ...L, sockets: [{ ...L.sockets[0]!, allowedGivens: L.sockets[0]!.allowedGivens.filter((g) => g !== drop) }] };
      expect(() => targetsTrueC(weak), `dropping ${drop}`).toThrow();
    }
  });
  it('reference solution', () => {
    deliverC(buildP91());
  }, 60_000);
});
