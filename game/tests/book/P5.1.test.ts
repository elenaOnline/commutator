// P5.1 A Subgroup Contains e — Book world 4. Theorem (closed under inverses) on the given a ∈ H → Theorem (closed under products) on
// a ∈ H and a⁻¹ ∈ H → cancel inside the membership (aa⁻¹ ⟶ e): e ∈ H. The level earns `sub.e`, which is not in its own toolset.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import * as F from '../../src/factory';
import { libraryRefs } from '../../src/factory/catalog';
import { cancel, deliver, expectNontrivial, lvM, membersFloor, memTruth, neededGivensM, thm } from './kit-members';
import { EARNED } from './lemmas-w123';

describe('P5.1 A Subgroup Contains e', () => {
  const L = lvM('P5.1');
  it('truth: e ∈ H from a ∈ H, over every closed subset of every catalogue group (∅ included, the given excludes it)', () => {
    expect(memTruth(L)).toBeGreaterThan(0);
    expect(expectNontrivial(L)).toBeGreaterThanOrEqual(10);
  });
  it('the given is needed: without a ∈ H the dock fails (the empty set is closed under products and inverses)', () => {
    expect(neededGivensM(L)).toEqual({ g: true });
  });
  it('the level earns sub.e and does not offer it itself; the subgroup axioms are offered', () => {
    expect(L.unlocks).toEqual(['sub.e']);
    expect(L.tools.schemas).not.toContain('sub.e');
    const f = membersFloor(L, EARNED);
    const names = libraryRefs(f.ctx, 'theorem').map((r) => F.libName(f.ctx, r));
    expect(names).toEqual(expect.arrayContaining(['closed under products (H)', 'closed under inverses (H)']));
    expect(names.some((n) => n.startsWith('a subgroup contains e'))).toBe(false);
    expect(K.subAllowed('sub.e', f.ctx.level)).toBe(false);
  });
  it('reference solution', () => {
    const f = membersFloor(L, EARNED);
    const iv = f.add(thm({ k: 'schema', id: 'sub.inv', structs: { H: 'H' } }), { x: 22, y: 6 });
    const ml = f.add(thm({ k: 'schema', id: 'sub.mul' }), { x: 28, y: 12 });
    const cn = f.add(cancel(), { x: 34, y: 12 });
    f.wire(f.given('g'), iv, 'p0'); f.wire(f.given('g'), ml, 'p0'); f.wire(iv, ml, 'p1'); f.wire(ml, cn); f.wire(cn, f.socket());
    const { comp } = deliver(f);
    expect(K.factText((comp.machines[cn]!.out as { fact: K.Pallet }).fact, K.levelLabels(f.ctx.level))).toBe('e ∈ H');
  });
  it('sub.e cannot prove itself here', () => {
    const f = membersFloor({ ...L, tools: { ...L.tools, schemas: [...L.tools.schemas, 'sub.e'] } }, EARNED);
    const e = f.add(thm({ k: 'schema', id: 'sub.e', structs: { H: 'H' } }), { x: 22, y: 6 });
    f.wire(e, f.socket());
    expect(f.compile().solvable).toBe(false);
  });
});
