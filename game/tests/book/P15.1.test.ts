// P15.1 Coset Multiplication — Book world 13. Normal Subgroup Tower N₁, element Towers a₁, b₁, c₁, d₁; an Assume room with two
// membership desks ac⁻¹ ∈ N₁, bd⁻¹ ∈ N₁. Closed under conjugation (desk 2 by c₁) → closed under products (desk 1, that) →
// cancel c⁻¹c inside → inverse of a product backwards inside → gate → ∀.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import * as F from '../../src/factory';
import { sch, EARNED } from './lemmas-w1214';
import { bookFloor, lvZ, thm, cancel, lawRw, P, I, knob, subTower, tower, sub, deliverZ, enoughModels, targetsHold, falsified } from './kit-w1214';

describe('P15.1 Coset Multiplication', { timeout: 120_000 }, () => {
  const L = lvZ('P15.1');
  it('the target is true for every normal subgroup, and false for some plain subgroup (S₃)', () => {
    targetsHold(L);
    enoughModels(L);
    const t = L.sockets[0]!.target as K.Card & { k: 'cond' };
    expect(falsified(L, { ...t, binds: [{ k: 'sub', id: 'N', normal: false }] }, []).length).toBeGreaterThan(0);
  });
  it('reference solution; the card is saveable for every normal subgroup', () => {
    const f = bookFloor(L, EARNED);
    f.add(subTower('N1', 'N₁', true), { x: 2, y: 40 });
    const [a, b, c, d] = ['a1', 'b1', 'c1', 'd1'].map((id) => ({ k: 'atom', id }) as K.Term) as [K.Term, K.Term, K.Term, K.Term];
    ['a1', 'b1', 'c1', 'd1'].forEach((id, i) => f.add(tower(id, `${id[0]}₁`), { x: 4 + 2 * i, y: 40 }));
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 40, h: 12 }, 'assume', a, a, f.ctx, undefined,
      [{ rel: 'mem', t: P(a, I(c)), sub: sub('N1') }, { rel: 'mem', t: P(b, I(d)), sub: sub('N1') }]);
    if (!e.ok) throw new Error(e.reason);
    f.c = e.canvas;
    const desks = f.c.machines.filter((m) => m.config.kind === 'desk').sort((p, q) => ((p.config as { slot?: number }).slot ?? 0) - ((q.config as { slot?: number }).slot ?? 0)).map((m) => m.id);
    const gate = f.c.machines.find((m) => m.config.kind === 'gate')!.id;
    const cj = f.add(thm(sch('sub.conj'), 0, { g: knob(c) }), { x: 14, y: 10 });
    const ml = f.add(thm(sch('sub.mul')), { x: 20, y: 8 });
    const cn = f.add(cancel(), { x: 26, y: 8 });
    const sx = f.add(lawRw(sch('socks'), { dir: 'rev' }), { x: 32, y: 8 });
    const all = f.add({ kind: 'forall' }, { x: 56, y: 8 });
    f.wire(desks[1]!, cj, 'p0'); f.wire(desks[0]!, ml, 'p0'); f.wire(cj, ml, 'p1'); f.wire(ml, cn); f.wire(cn, sx); f.wire(sx, gate); f.wire(gate, all); f.wire(all, f.socket());
    const { comp } = deliverZ(f);
    expect(F.lemmaFrom(comp, f.c, all, f.ctx)).toMatchObject({ ok: true });
  });
});
