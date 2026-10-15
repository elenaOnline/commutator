// Book phase C, factory side: Hom / group Towers, the hom law as a Rewriter recipe, the Operator's "apply f to both
// sides", one-group cards reused in another group, ∀ over a hom, the Lemma Book. Spec: KERNEL-EXT.md §5.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from './index';
import { libraryRefs } from './catalog';
import { mkLevel } from '../kernel/testkit';
import { oracleCheck } from '../groups/oracle';
import { REGISTRY } from '../levels/levels';
import { Floor, P, M, lawRw, op, thm, spool } from './compiler.testkit';

const app = (fn: string, ...args: K.Term[]): K.Term => ({ k: 'app', fn, args });
const eS = (s: string): K.Term => ({ k: 'e', s });
const A = (id: string): K.Term => ({ k: 'atom', id });
const reason = (comp: F.Compiled, id: string) => { const s = comp.machines[id]!.status; return s.k === 'ok' ? '' : s.reason; };
const oracleOk = (f: Floor, comp: F.Compiled) =>
  expect(oracleCheck(f.ctx.level, comp.check.nodes, comp.graph.rooms, comp.graph.vars ?? [], comp.graph.structs ?? [])).toEqual([]);
const IDEM: K.Schema = { id: 'idem', name: 'the only idempotent is e', textbook: 'the only idempotent is e', origin: 'earned', fromLevel: 'P4.7', mirrorable: false,
  card: { k: 'cond', metas: ['x'], premises: [{ k: 'eq', l: P(M('x'), M('x')), r: M('x') }], concl: { k: 'eq', l: M('x'), r: K.E } } };

describe('P9.1 on the floor: f(e) = e for every homomorphism', () => {
  it('group Towers G₁, H₁ · Hom Tower f₁ · e = ee · hom law · the idempotent card in H₁ · ∀ → dock; a saveable lemma', () => {
    const target: K.Card = { k: 'law', metas: [], l: app('f', eS('S')), r: eS('T'),
      binds: [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'T' } }] };
    const f = new Floor(mkLevel({ id: 'T', sockets: [{ id: 's', target, allowedGivens: [] }] } as never), ['idem']);
    f.ctx = { ...f.ctx, registry: { ...REGISTRY, idem: IDEM } };
    f.add({ kind: 'tower', varId: 'G1', label: 'G₁', sort: 'G', group: true }, { x: 2, y: 30 });
    f.add({ kind: 'tower', varId: 'H1', label: 'H₁', sort: 'G', group: true }, { x: 4, y: 30 });
    f.add({ kind: 'tower', varId: 'f1', label: 'f₁', sort: 'G', hom: { dom: 'G1', cod: 'H1' } }, { x: 6, y: 30 });
    const fE = app('f1', eS('G1'));
    const sp = f.add(spool(fE));
    const ee = f.add(lawRw({ k: 'axiom', id: 'unitL' }, { dir: 'rev', target: F.pinFromAddr({ k: 'eq', l: fE, r: fE }, { side: 'r', path: [0] })! }));
    const hm = f.add(lawRw({ k: 'schema', id: 'hom.mul' }));            // the only hom in scope plays f
    const sw = f.add(op({ k: 'swap' }));
    const id = f.add(thm({ k: 'schema', id: 'idem' }));
    const all = f.add({ kind: 'forall' });
    f.wire(sp, ee); f.wire(ee, hm); f.wire(hm, sw); f.wire(sw, id, 'p0'); f.wire(id, all); f.wire(all, f.socket());
    const comp = f.compile();
    const Lb = K.levelLabels(K.withVars(f.ctx, comp.graph).ctx.level);
    for (const m of [sp, ee, hm, sw, id, all]) expect(comp.machines[m]!.status, `${m}: ${reason(comp, m)}`).toEqual({ k: 'ok' });
    expect(K.factText((comp.machines[hm]!.out as { fact: K.Pallet }).fact, Lb)).toBe('f₁(e_G₁) = f₁(e_G₁)f₁(e_G₁)');
    expect(K.factText((comp.machines[id]!.out as { fact: K.Pallet }).fact, Lb)).toBe('f₁(e_G₁) = e_H₁');
    expect(comp.machines[hm]!.structs).toEqual([{ binder: 'f', normal: false, options: [{ id: 'f1', label: 'f₁' }], chosen: 'f1' }]);
    expect(comp.solvable, JSON.stringify(comp.sockets)).toBe(true);
    expect(F.lemmaFrom(comp, f.c, all, f.ctx)).toMatchObject({ ok: true });
    expect(f.run().s.delivered.s).toBeDefined();
    oracleOk(f, comp);
    // the picker offers the hom law once per hom in scope, Hom Towers included
    expect(libraryRefs(f.ctx, 'rule', f.c).filter((r) => r.k === 'schema' && r.id === 'hom.mul').map((r) => F.libName(f.ctx, r))).toEqual(['homomorphism law (f₁)']);
  });
});

describe("the Operator's apply f to both sides", () => {
  it('ab = c ⟹ f(ab) = f(c) ⟹ f(a)f(b) = f(c)', () => {
    const lv = mkLevel({ id: 'T', sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'H', kind: 'group', label: 'H' }],
      maps: [{ id: 'f', label: 'f', args: ['G'], res: 'H', kind: 'hom' }],
      atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'c', label: 'c', hue: 2 }],
      givens: [{ id: 'h', name: 'h', fact: { k: 'eq', l: P(A('a'), A('b')), r: A('c') } }],
      sockets: [{ id: 's', target: { k: 'eq', l: P(app('f', A('a')), app('f', A('b'))), r: app('f', A('c')) }, allowedGivens: ['h'] }] } as never);
    const f = new Floor(lv);
    const ap = f.add(op({ k: 'apply', fn: 'f' }));
    const hm = f.add(lawRw({ k: 'schema', id: 'hom.mul', structs: { f: 'f' } }, { target: { k: 'first' } }));
    f.wire(f.given('h'), ap); f.wire(ap, hm); f.wire(hm, f.socket());
    const comp = f.compile();
    const Lb = K.levelLabels(f.ctx.level);
    expect(K.factText((comp.machines[ap]!.out as { fact: K.Pallet }).fact, Lb)).toBe('f(ab) = f(c)');
    expect(comp.solvable, JSON.stringify([comp.sockets, comp.machines[hm]!.status])).toBe(true);
    oracleOk(f, comp);
    // an inequation is refused with a reason
    const g = new Floor({ ...lv, givens: [{ id: 'h', name: 'h', fact: { k: 'neq', l: A('a'), r: A('b') } }] } as never);
    const ap2 = g.add(op({ k: 'apply', fn: 'f' }));
    g.wire(g.given('h'), ap2);
    expect(reason(g.compile(), ap2)).toMatch(/inequation/);
  });
});
