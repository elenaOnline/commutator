// P9.4 Inverses Go to Inverses — Book world 7. G₁, H₁, f₁ : G₁ → H₁, x₁ ∈ G₁ · Spool f₁(x₁)f₁(x₁⁻¹) · hom law backwards ·
// x₁x₁⁻¹ ⟶ e inside f₁ · the saved "f(e) = e" at f₁ (P9.3) · unique inverse, read in H₁ · ∀ → dock.
import { describe, expect, it } from 'vitest';
import * as F from '../../src/factory';
import type * as K from '../../src/kernel';
import { bookFloor, deliverC, lvC, nontrivialHoms, nontrivialModels, targetsTrueC, app, schema, towerIn, lawRw, thm, spool, P, I, eq, cancel } from './kit-wC';
import { EARNED, buildFE, groupTower, homTower } from './lemmas-wC';

const L = lvC('P9.4');
const x = { k: 'atom', id: 'x1' } as K.Term;

export function buildInv() {
  const { lemma, idem } = buildFE();
  const f = bookFloor(L, EARNED, [idem, lemma]);
  f.add(groupTower('G1', 'G₁'), { x: 2, y: 30 });
  f.add(groupTower('H1', 'H₁'), { x: 4, y: 30 });
  f.add(homTower('f1', 'f₁', 'G1', 'H1'), { x: 6, y: 30 });
  f.add(towerIn('x1', 'x₁', 'G1'), { x: 8, y: 30 });
  const fx = app('f1', x), fxi = app('f1', I(x));
  const sp = f.add(spool(P(fx, fxi)));
  const hr = f.add(lawRw(schema('hom.mul'), { dir: 'rev' }));
  const arrived = eq(P(fx, fxi), app('f1', P(x, I(x))));
  const cn = f.add(cancel(F.pinFromAddr(arrived, { side: 'r', path: [0], range: [0, 2] })!)); // x₁x₁⁻¹ ⟶ e inside f₁: the HUD's cancel
  const fe = f.add(lawRw(schema(lemma.id)));
  const un = f.add(thm(schema('witness')));
  const all = f.add({ kind: 'forall' });
  f.wire(sp, hr); f.wire(hr, cn); f.wire(cn, fe); f.wire(fe, un, 'p0'); f.wire(un, all); f.wire(all, f.socket());
  return f;
}

describe('P9.4 Inverses Go to Inverses', () => {
  it('the target holds for every homomorphism between catalogue groups; nontrivial models', () => {
    targetsTrueC(L);
    expect(nontrivialHoms()).toBeGreaterThanOrEqual(10);
    expect(nontrivialModels(L, 's').ok).toBe(true);
  });
  it('reference solution', () => {
    const r = deliverC(buildInv());
    expect(r.comp.sockets.s!.ok).toBe(true);
  }, 60_000);
});
