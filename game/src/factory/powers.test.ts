// v4 Phase B: symbolic integer exponents on the floor (sol-exponents.md §7 work orders B01–B04).
// Each order is taken from levels.ts when the content writer has added it, else from the §7 spec.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from './index';
import type { Card, LevelManifest } from '../kernel/types';
import { LEVEL_BY_ID } from '../levels/levels';
import { mkLevel } from '../kernel/testkit';
import { oracleCheck } from '../groups/oracle';
import {
  Floor, I, P, E, M, a, b, eq, status, x1, y1,
  cancel, insertPair, lawRw, routed, spool, tower, towerZ, pw, Zc, Zv, Zm, Zmul, intKnob,
} from './compiler.testkit';

const reason = (comp: F.Compiled, id: string) => { const s = status(comp, id); return s.k === 'ok' ? '' : s.reason; };
const x = M('x'), y = M('y');
const ab5 = P(a, b, a, b, a, b, a, b, a, b);
const POWER_TOOLS = ['power.add', 'power.multiply', 'power.zero', 'power.one', 'power.identity', 'power.inverseBase', 'power.negate', 'power.conjugate', 'power.literal'];

function order(id: string, spec: () => LevelManifest): LevelManifest { return LEVEL_BY_ID[id] ?? spec(); }
const B01 = () => order('B01', () => mkLevel({
  id: 'B01', givens: [{ id: 'h', name: 'h', fact: eq(ab5, E) }],
  sockets: [{ id: 's', target: { k: 'law', metas: ['k'], l: pw(P(a, b), Zmul(Zc(5), Zm('k'))), r: E }, allowedGivens: ['h'] }],
  tools: { schemas: POWER_TOOLS },
}));
const B02 = () => order('B02', () => mkLevel({
  id: 'B02', atoms: [],
  sockets: [{ id: 's', target: { k: 'cond', metas: ['x', 'n', 'k'], premises: [{ k: 'eq', l: pw(x, Zm('n')), r: E }], concl: { k: 'eq', l: pw(x, Zmul(Zm('n'), Zm('k'))), r: E } }, allowedGivens: [] }],
  tools: { schemas: POWER_TOOLS },
}));
const B03 = () => order('B03', () => mkLevel({
  id: 'B03', atoms: [],
  sockets: [{ id: 's', target: { k: 'cond', metas: ['x', 'y', 'n'], premises: [{ k: 'eq', l: pw(P(x, y), Zm('n')), r: E }], concl: { k: 'eq', l: pw(P(y, x), Zm('n')), r: E } }, allowedGivens: [] }],
  tools: { schemas: POWER_TOOLS },
}));
const B04 = () => order('B04', () => mkLevel({
  id: 'B04', atoms: [{ id: 'a', label: 'a', hue: 0 }], givens: [{ id: 's', name: '|G|', fact: { k: 'size', n: 5 } }],
  sockets: [{ id: 's', target: eq(pw(a, Zc(5)), E), allowedGivens: ['s'] }],
  tools: { schemas: [] },
}));

/** Floor with the order's imports enabled exactly as ctxFor would (the store merges POWER_SCHEMAS). */
function floor(lv: LevelManifest): Floor {
  const f = new Floor(lv);
  f.ctx = { ...f.ctx, level: { ...f.ctx.level, tools: { ...f.ctx.level.tools, schemas: [...new Set([...f.ctx.level.tools.schemas, ...lv.tools.schemas.filter((id) => id.startsWith('power.'))])] } } };
  return f;
}

function delivers(f: Floor) {
  const comp = f.compile();
  expect(comp.solvable, JSON.stringify([comp.sockets, Object.values(comp.machines).filter((m) => m.status.k !== 'ok').map((m) => [m.id, m.status])])).toBe(true);
  expect(comp.check.ok, JSON.stringify(Object.values(comp.check.nodes).filter((n) => !n.ok))).toBe(true);
  expect(oracleCheck(f.ctx.level, comp.check.nodes, comp.graph.rooms, comp.graph.vars ?? [])).toEqual([]);
  const { s } = f.run();
  expect(s.delivered.s).toBeDefined();
  return comp;
}

describe('Phase B work orders', () => {
  it('B01 Every Fifth Shift: (ab)^(5k₁) → ((ab)⁵)^k₁ → word → h → e^k₁ → e; ∀ binds k₁', () => {
    const lv = B01();
    const f = floor(lv);
    f.add(towerZ('k1', 'k₁'), { x: 4, y: 30 });
    const sp = f.add(spool(pw(P(a, b), Zmul(Zc(5), Zv('k1')))));
    const r1 = f.add(lawRw({ k: 'schema', id: 'power.multiply' }, { dir: 'rev', values: { m: intKnob(Zc(5)), n: intKnob(Zv('k1')) } }));
    const r2 = f.add(lawRw({ k: 'schema', id: 'power.literal:5' }));
    const r3 = f.add(lawRw({ k: 'given', givenId: 'h' }));
    const r4 = f.add(lawRw({ k: 'schema', id: 'power.identity' }));
    const al = f.add({ kind: 'forall' });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, r3); f.wire(r3, r4); f.wire(r4, al); f.wire(al, f.socket());
    const comp = delivers(f);
    const last = comp.machines[al]!.out as { ref: { id: string } };
    expect(comp.check.nodes[last.ref.id]!.deps).toEqual(['g:h']);
    // not a global lemma: it rests on h
    expect(F.lemmaFrom(comp, f.c, al, f.ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/^Uses given h/) });
  });

  it('reverse (xᵐ)ⁿ = xᵐⁿ asks for its integer knobs instead of guessing a factorization', () => {
    const f = floor(B01());
    f.add(towerZ('k1', 'k₁'), { x: 4, y: 30 });
    const sp = f.add(spool(pw(P(a, b), Zmul(Zc(5), Zv('k1')))));
    const r1 = f.add(lawRw({ k: 'schema', id: 'power.multiply' }, { dir: 'rev' }));
    f.wire(sp, r1);
    expect(reason(f.compile(), r1)).toBe('Set the integer m, n on the machine.');
  });

  it('B02 Reset Multipliers: Assume xⁿ = e, (x^n)^k by the routed assumption, ∀ binds x, n, k — a savable lemma', () => {
    const f = floor(B02());
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    f.add(towerZ('n1', 'n₁'), { x: 4, y: 30 });
    f.add(towerZ('k1', 'k₁'), { x: 6, y: 30 });
    const { desk, gate } = f.room({ x: 10, y: 4, w: 30, h: 12 }, 'assume', pw(x1, Zv('n1')), E);
    const sp = f.add(spool(pw(x1, Zmul(Zv('n1'), Zv('k1')))), { x: 12, y: 12 });
    const r1 = f.add(lawRw({ k: 'schema', id: 'power.multiply' }, { dir: 'rev', values: { m: intKnob(Zv('n1')), n: intKnob(Zv('k1')) } }), { x: 16, y: 12 });
    const r2 = f.add(routed(), { x: 22, y: 12 });
    const r3 = f.add(lawRw({ k: 'schema', id: 'power.identity' }), { x: 28, y: 12 });
    const al = f.add({ kind: 'forall' }, { x: 44, y: 20 });
    f.wire(sp, r1); f.wire(r1, r2); f.wire(desk, r2, 'rule'); f.wire(r2, r3); f.wire(r3, gate); f.wire(gate, al); f.wire(al, f.socket());
    const comp = delivers(f);
    const lem = F.lemmaFrom(comp, f.c, al, f.ctx);
    expect(lem.ok, JSON.stringify(lem)).toBe(true);
  });

  it('B03 Conjugate Pair, Any Shift: insert x₁⁻¹x₁ inside the power base, conjugate the power, cite H, cancel', () => {
    const f = floor(B03());
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    f.add(tower('y1', 'y₁'), { x: 4, y: 30 });
    f.add(towerZ('n1', 'n₁'), { x: 6, y: 30 });
    const { desk, gate } = f.room({ x: 10, y: 4, w: 34, h: 12 }, 'assume', pw(P(x1, y1), Zv('n1')), E);
    const start = pw(P(y1, x1), Zv('n1'));
    const sp = f.add(spool(start), { x: 12, y: 12 });
    const ins = f.add(insertPair(x1, true, F.pinFromGap(eq(start, start), { side: 'r', path: [0], gap: 0 })!), { x: 16, y: 12 });
    const cj = f.add(lawRw({ k: 'schema', id: 'power.conjugate' }), { x: 21, y: 12 });
    const h = f.add(routed(), { x: 26, y: 12 });
    const cn = f.add(cancel(), { x: 31, y: 12 });
    const al = f.add({ kind: 'forall' }, { x: 48, y: 20 });
    f.wire(sp, ins); f.wire(ins, cj); f.wire(cj, h); f.wire(desk, h, 'rule'); f.wire(h, cn); f.wire(cn, gate); f.wire(gate, al); f.wire(al, f.socket());
    const comp = f.compile();
    const Lb = K.labelsOf([...f.ctx.level.atoms, ...comp.graph.vars!]);
    const txt = (id: string) => K.factText((comp.machines[id]!.out as { fact: K.Pallet }).fact, Lb);
    expect(txt(ins)).toMatch(/= \(x₁⁻¹x₁y₁x₁\)/);
    expect(txt(cn)).toMatch(/= e$/);
    delivers(f);
  });

  it('B04 The Finite Plant: Lagrange as a power, resting on |G| = 5', () => {
    const f = floor(B04());
    const sp = f.add(spool(pw(a, Zc(5))));
    const re = f.add(lawRw({ k: 'lagrange' }));
    f.wire(sp, re); f.wire(re, f.socket());
    const comp = delivers(f);
    expect(comp.check.nodes[comp.machines[re]!.nodes[0]!]!.deps).toEqual(['g:s']);
  });

  it('B04: a word where the dock wants a stack says so and points at Literal Power', () => {
    const f = floor(B04());
    const sp = f.add(spool(P(a, a, a, a, a)));
    const re = f.add(lawRw({ k: 'lagrange' }));
    f.wire(sp, re); f.wire(re, f.socket());
    const r = reason(f.compile(), f.socket());
    expect(r).toMatch(/^Got the product .* \(five factors\), the goal has the power .*\. Use literal power to write the product as a power\.$/);
  });

  it('a size refusal is a jam about size, not a mathematical verdict', () => {
    const f = floor(B01());
    const sp = f.add(spool(pw(a, Zc(10001))));
    const re = f.add(lawRw({ k: 'schema', id: 'power.literal:5' }));
    f.wire(sp, re);
    // (the editor refuses to configure it; a loaded floor could still carry it)
    f.c = { ...f.c, machines: f.c.machines.map((m) => (m.id === re ? { ...m, config: lawRw({ k: 'schema', id: 'power.literal:10001' }) } : m)) };
    expect(reason(f.compile(), re)).toBe(F.JAMS.tooLarge);
    void I; void y; void ({} as Card);
  });
});
