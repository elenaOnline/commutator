// Book phase B, factory side: membership items, the Subgroup recipe family, Rewriters on the membership rail,
// membership desks, Subgroup Towers and ∀ over them, the reuse-lens data. Spec: design/pinter/KERNEL-EXT.md §4.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from './index';
import { libraryRefs, structChoices, subgroupsInScope } from './catalog';
import { mkLevel } from '../kernel/testkit';
import { oracleCheck } from '../groups/oracle';
import { Floor, I, P, E, M, a, b, cancel, thm, tower } from './compiler.testkit';

const sub = (id: string): K.SubRef => ({ k: 'sub', id });
const mem = (t: K.Term, s: K.SubRef): K.Pallet => ({ k: 'mem', t, sub: s });
const reason = (comp: F.Compiled, id: string) => { const s = comp.machines[id]!.status; return s.k === 'ok' ? '' : s.reason; };
const SC = (id: string, structs?: Record<string, string>): F.LibRef => ({ k: 'schema', id, ...(structs ? { structs } : {}) });
const oracleOk = (f: Floor, comp: F.Compiled) =>
  expect(oracleCheck(f.ctx.level, comp.check.nodes, comp.graph.rooms, comp.graph.vars ?? [], comp.graph.structs ?? [])).toEqual([]);

function p51() {
  return mkLevel({ id: 'T', subgroups: [{ id: 'H', label: 'H' }], givens: [{ id: 'g', name: 'g', fact: mem(a, sub('H')) }],
    sockets: [{ id: 's', target: mem(E, sub('H')), allowedGivens: ['g'] }], unlocks: ['sub.e'] } as never);
}

describe('P5.1 on the floor: e ∈ H from a member', () => {
  it('Theorem (closed under inverses) · Theorem (closed under products) · cancel → e ∈ H, delivered', () => {
    const f = new Floor(p51());
    const refs = libraryRefs(f.ctx, 'theorem').map((r) => F.libName(f.ctx, r));
    expect(refs).toEqual(expect.arrayContaining(['closed under products (H)', 'closed under inverses (H)']));
    expect(refs.some((n) => n.startsWith('a subgroup contains e'))).toBe(false); // earned here, so not offered
    const iv = f.add(thm(SC('sub.inv', { H: 'H' })));
    const ml = f.add(thm(SC('sub.mul')), { x: 20, y: 30 });      // its subgroup is read off the premises
    const cn = f.add(cancel());
    f.wire(f.given('g'), iv, 'p0'); f.wire(f.given('g'), ml, 'p0'); f.wire(iv, ml, 'p1'); f.wire(ml, cn); f.wire(cn, f.socket());
    const comp = f.compile();
    const Lb = K.levelLabels(f.ctx.level);
    expect(K.factText((comp.machines[ml]!.out as { fact: K.Pallet }).fact, Lb)).toBe('aa⁻¹ ∈ H');
    expect(comp.machines[ml]!.structs).toEqual([{ binder: 'H', normal: false, options: [{ id: 'H', label: 'H' }], chosen: 'H' }]);
    expect(comp.solvable, JSON.stringify([comp.sockets, comp.machines[cn]!.status])).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
    oracleOk(f, comp);
  });

  it('a premise in the wrong subgroup jams in words; two candidate subgroups ask for a choice', () => {
    const lv = mkLevel({ id: 'T', subgroups: [{ id: 'H', label: 'H' }, { id: 'K', label: 'K' }], givens: [{ id: 'g', name: 'g', fact: mem(a, sub('H')) }],
      sockets: [{ id: 's', target: mem(E, sub('H')), allowedGivens: ['g'] }] } as never);
    const f = new Floor(lv);
    const wrong = f.add(thm(SC('sub.inv', { H: 'K' })));
    f.wire(f.given('g'), wrong, 'p0');
    expect(reason(f.compile(), wrong)).toBe('The premise must be x ∈ K. It is a ∈ H.');
    const g = new Floor(lv);
    const e = g.add(thm(SC('sub.e')));
    const comp = g.compile();
    expect(reason(comp, e)).toMatch(/not available|Choose which subgroup plays H/);
    expect(structChoices(K.SUB_SCHEMAS['sub.mul']!.card, subgroupsInScope(g.ctx))).toEqual([{ H: 'H' }, { H: 'K' }]);
  });
});

describe('Subgroup Towers, membership desks and ∀ (P12.1 trans)', () => {
  it('∀H ≤ G ∀x,y,z. xy⁻¹ ∈ H, yz⁻¹ ∈ H ⟹ xz⁻¹ ∈ H — saveable', () => {
    const x = M('x'), y = M('y'), z = M('z'), Hm: K.SubRef = { k: 'submeta', id: 'H' };
    const target: K.Card = { k: 'cond', metas: ['x', 'y', 'z'], binds: [{ k: 'sub', id: 'H', normal: false }],
      premises: [{ k: 'mem', t: P(x, I(y)), sub: Hm }, { k: 'mem', t: P(y, I(z)), sub: Hm }], concl: { k: 'mem', t: P(x, I(z)), sub: Hm } };
    const f = new Floor(mkLevel({ id: 'T', sockets: [{ id: 's', target, allowedGivens: [] }] } as never));
    const ht = f.add({ kind: 'tower', varId: 'H1', label: 'H₁', sort: 'G', sub: 'sub' }, { x: 2, y: 30 });
    f.add(tower('x1', 'x₁'), { x: 4, y: 30 }); f.add(tower('y1', 'y₁'), { x: 6, y: 30 }); f.add(tower('z1', 'z₁'), { x: 8, y: 30 });
    const X: K.Term = { k: 'atom', id: 'x1' }, Y: K.Term = { k: 'atom', id: 'y1' }, Z: K.Term = { k: 'atom', id: 'z1' };
    const assumes: K.DeskAssumption[] = [{ rel: 'mem', t: P(X, I(Y)), sub: sub('H1') }, { rel: 'mem', t: P(Y, I(Z)), sub: sub('H1') }];
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 16, h: 10 }, 'assume', X, X, f.ctx, undefined, assumes);
    if (!e.ok) throw new Error(e.reason);
    f.c = e.canvas;
    const desks = f.c.machines.filter((m) => m.config.kind === 'desk').sort((p, q) => ((p.config as { slot?: number }).slot ?? 0) - ((q.config as { slot?: number }).slot ?? 0));
    const gate = f.c.machines.find((m) => m.config.kind === 'gate')!.id;
    expect(subgroupsInScope(f.ctx, f.c).map((s) => s.label)).toEqual(['H₁']);
    const ml = f.add(thm(SC('sub.mul')), { x: 15, y: 6 });
    const cn = f.add(cancel(), { x: 19, y: 6 });
    const pp = cn; // the Canceller tidies the lone e itself
    f.wire(desks[0]!.id, ml, 'p0'); f.wire(desks[1]!.id, ml, 'p1'); f.wire(ml, cn); f.wire(cn, gate);
    const all = f.add({ kind: 'forall' }, { x: 32, y: 20 });
    f.wire(gate, all); f.wire(all, f.socket());
    const comp = f.compile();
    const Lb = K.levelLabels(K.withVars(f.ctx, comp.graph).ctx.level);
    expect(comp.graph.structs).toEqual([{ k: 'sub', id: 'H1', label: 'H₁', normal: false }]);
    expect(K.factText((comp.machines[pp]!.out as { fact: K.Pallet }).fact, Lb)).toBe('x₁z₁⁻¹ ∈ H₁');
    expect(K.factText((comp.machines[all]!.out as { card: K.Card }).card, Lb)).toBe('∀H ≤ G. ∀x, y, z. xy⁻¹ ∈ H, yz⁻¹ ∈ H ⟹ xz⁻¹ ∈ H');
    expect(comp.solvable, JSON.stringify(comp.sockets)).toBe(true);
    expect(F.lemmaFrom(comp, f.c, all, f.ctx)).toMatchObject({ ok: true });
    expect(f.run().s.delivered.s).toBeDefined();
    oracleOk(f, comp);
    void ht; void b;
  });

  it('∀ on a membership resting on a desk that names the Subgroup Tower is refused, naming it', () => {
    const f = new Floor(mkLevel({ id: 'T', sockets: [{ id: 's', target: mem(a, sub('Q')) as never, allowedGivens: [] }] } as never));
    f.add({ kind: 'tower', varId: 'H1', label: 'H₁', sort: 'G', sub: 'sub' }, { x: 2, y: 30 });
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 10, h: 8 }, 'assume', a, a, f.ctx, undefined, [{ rel: 'mem', t: a, sub: sub('H1') }]);
    if (!e.ok) throw new Error(e.reason);
    f.c = e.canvas;
    const desk = f.c.machines.find((m) => m.config.kind === 'desk')!.id;
    const inner = f.add({ kind: 'forall' }, { x: 13, y: 9 });
    f.wire(desk, inner);
    expect(reason(f.compile(), inner)).toBe("H₁ appears in the supposition a ∈ H₁. Use the room's gate first.");
  });

  it('a card naming a level subgroup is not a lemma', () => {
    const lv = mkLevel({ id: 'T', subgroups: [{ id: 'H', label: 'H' }], sockets: [{ id: 's', target: mem(a, sub('H')), allowedGivens: [] }] } as never);
    const f = new Floor(lv);
    f.add(tower('x1', 'x₁'), { x: 4, y: 30 });
    const X: K.Term = { k: 'atom', id: 'x1' };
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 10, h: 8 }, 'assume', X, X, f.ctx, undefined, [{ rel: 'mem', t: X, sub: sub('H') }]);
    if (!e.ok) throw new Error(e.reason);
    f.c = e.canvas;
    const desk = f.c.machines.find((m) => m.config.kind === 'desk')!.id;
    const gate = f.c.machines.find((m) => m.config.kind === 'gate')!.id;
    const iv = f.add(thm(SC('sub.inv', { H: 'H' })), { x: 13, y: 6 });
    f.wire(desk, iv, 'p0'); f.wire(iv, gate);
    const all = f.add({ kind: 'forall' }, { x: 30, y: 20 });
    f.wire(gate, all);
    const comp = f.compile();
    expect(F.lemmaFrom(comp, f.c, all, f.ctx)).toEqual({ ok: false, reason: 'Mentions the subgroup H of this order. Use a Subgroup Tower instead.' });
  });
});
