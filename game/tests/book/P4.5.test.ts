// P4.5 Shoes and Socks — Book world 2. Towers x₁, y₁ · Spool (x₁y₁)(y₁⁻¹x₁⁻¹) → cancel twice → e → unique inverse with u = x₁y₁
// → ∀ → dock. Earns inverse of a product.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { REGISTRY } from '../../src/levels/levels';
import { I, P, bookFloor, cancel, deliver, lv, spool, targetsTrue, thm, tower, x1, y1 } from './kit-w123';
import { buildDoubleInverse } from './lemmas-w123';

const kn = (t: K.Term) => ({ k: 'knob', term: t } as const);

describe('P4.5 Shoes and Socks', () => {
  const L = lv('P4.5');
  it('the target is true in every finite group', () => {
    expect(targetsTrue(L).s).toBeGreaterThan(0);
  });
  it('earns inverse of a product, which is exactly the dock’s statement', () => {
    expect(L.unlocks).toEqual(['socks']);
    const g = L.sockets[0]!.target;
    expect(K.sameCardUpToRenaming(g as K.Card, REGISTRY.socks!.card)).toBe(true);
  });
  it('reference solution (with the saved double inverse in the book)', () => {
    const { lemma } = buildDoubleInverse();
    const f = bookFloor(L, ['cancel', 'witness'], [lemma]);
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    f.add(tower('y1', 'y₁'), { x: 4, y: 30 });
    const sp = f.add(spool(P(x1, y1, I(y1), I(x1))));
    const c1 = f.add(cancel());
    const c2 = f.add(cancel());
    const t = f.add(thm({ k: 'schema', id: 'witness' }, 0, { u: kn(P(x1, y1)), v: kn(P(I(y1), I(x1))) }));
    const all = f.add({ kind: 'forall' });
    f.wire(sp, c1); f.wire(c1, c2); f.wire(c2, t, 'p0'); f.wire(t, all); f.wire(all, f.socket());
    deliver(f);
  });
});
