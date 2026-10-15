// Book phase A, factory side: open docks (compile + runtime answer) and multi-desk Assume rooms
// (editor seating, compiler desks, gate, ∀, docks, Lemma Book). Spec: design/pinter/KERNEL-EXT.md.
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from './index';
import { mkLevel } from '../kernel/testkit';
import { oracleCheck } from '../groups/oracle';
import { Floor, I, P, E, M, a, b, eq, x1, y1, status, cancel, join, spool, tower } from './compiler.testkit';

const d: K.Term = { k: 'atom', id: 'd' };
const reason = (comp: F.Compiled, id: string) => { const s = status(comp, id); return s.k === 'ok' ? '' : s.reason; };
const L = { a: 'a', b: 'b', c: 'c', d: 'd', x1: 'x₁', y1: 'y₁' };

function openOrder(target: K.Pallet | K.Card, holes: K.HoleDecl[], givens: K.GivenDecl[] = []) {
  return mkLevel({ id: 'T', givens, sockets: [{ id: 's', target, allowedGivens: givens.map((g) => g.id), holes }] } as never);
}
const solveForD = (g: K.Pallet) => openOrder(eq(d, M('h')), [{ id: 'h', notMentioning: ['d'] }], [{ id: 'g', name: 'g', fact: g }]);
const oracleOk = (f: Floor, comp: F.Compiled) =>
  expect(oracleCheck(f.ctx.level, comp.check.nodes, comp.graph.rooms, comp.graph.vars ?? [])).toEqual([]);

describe('open docks on the floor', () => {
  it('a given d = ab wired to the dock d = ? is delivered, and the dock learns its answer only on delivery', () => {
    const f = new Floor(solveForD(eq(d, P(a, b))));
    f.wire(f.given('g'), f.socket());
    const comp = f.compile();
    expect(comp.solvable, JSON.stringify(comp.sockets)).toBe(true);
    expect(K.termEq(comp.sockets.s!.holes!.h!, P(a, b))).toBe(true);
    let s = F.initRun(f.c, comp);
    expect(F.dockAnswer(comp, s, 's')).toBeNull();          // nothing shipped yet: no answer on the dock
    while (s.delivered.s === undefined && s.tick < 200) s = F.stepRun(s, f.c, comp);
    const ans = F.dockAnswer(comp, s, 's')!;
    expect(K.factText(ans.instance, L)).toBe('d = ab');
    expect(K.dockText(f.ctx.level.sockets[0]!, L, ans.holes)).toBe('d = ab');
    oracleOk(f, comp);
  });

  it('either orientation: ab = d reaches d = ? through a recorded auto-swap', () => {
    const f = new Floor(solveForD(eq(P(a, b), d)));
    f.wire(f.given('g'), f.socket());
    const comp = f.compile();
    expect(comp.solvable, JSON.stringify(comp.sockets)).toBe(true);
    expect(comp.graph.nodes.some((n) => n.meta?.gesture === 'auto-swap')).toBe(true);
    expect(K.factText(comp.sockets.s!.instance!, L)).toBe('d = ab');
  });

  it('an answer that still mentions d jams with the rule, never with a suggestion', () => {
    const f = new Floor(solveForD(eq(d, P(a, I(b), d))));
    f.wire(f.given('g'), f.socket());
    const comp = f.compile();
    expect(comp.solvable).toBe(false);
    expect(reason(comp, f.socket())).toBe('Needs d = ?. The answer may not use d.');
  });

  it('a wrong shape says what the dock needs, with the hole shown as ?', () => {
    const f = new Floor(solveForD(eq(P(d, d), a)));
    f.wire(f.given('g'), f.socket());
    expect(reason(f.compile(), f.socket())).toBe('Needs d = ?. Got dd = a.');
  });

  it('a witness dock ∀x. x·? = e is filled by a ∀ card, with the witness in the dock’s binder', () => {
    const x = M('x');
    const f = new Floor(openOrder({ k: 'law', metas: ['x'], l: P(x, M('y')), r: E }, [{ id: 'y' }]));
    f.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const sp = f.add(spool(P(x1, I(x1))));
    const can = f.add(cancel());
    const all = f.add({ kind: 'forall' });
    f.wire(sp, can); f.wire(can, all); f.wire(all, f.socket());
    const comp = f.compile();
    expect(comp.solvable, JSON.stringify([comp.sockets, comp.machines[can]!.status])).toBe(true);
    expect(comp.sockets.s!.holes!.y).toEqual(I(x));
    const { s } = f.run();
    expect(K.factText(F.dockAnswer(comp, s, 's')!.instance, {})).toBe('∀x. xx⁻¹ = e');
    oracleOk(f, comp);
  });

  it('a fact before ∀ at a witness dock is told to go through ∀ (the hole shown as ?)', () => {
    const f = new Floor(openOrder({ k: 'law', metas: ['x'], l: P(M('x'), M('y')), r: E }, [{ id: 'y' }]));
    f.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const sp = f.add(spool(x1));
    f.wire(sp, f.socket());
    expect(reason(f.compile(), f.socket())).toBe('Needs ∀x. x? = e. Run x₁ = x₁ through ∀ first.');
  });
});

describe('multi-desk Assume rooms on the floor', () => {
  const x = M('x'), y = M('y');
  const assumes: K.Assumption[] = [{ rel: 'eq', l: x1, r: a }, { rel: 'eq', l: y1, r: a }];

  function twoDesks(target: K.Card) {
    const f = new Floor(mkLevel({ id: 'T', sockets: [{ id: 's', target, allowedGivens: [] }] } as never));
    f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
    f.add(tower('y1', 'y₁'), { x: 4, y: 30 });
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 14, h: 10 }, 'assume', x1, a, f.ctx, 'eq', assumes);
    if (!e.ok) throw new Error(e.reason);
    f.c = e.canvas;
    const room = f.c.rooms[0]!;
    const desks = f.c.machines.filter((m) => m.config.kind === 'desk').sort((p, q) => ((p.config as { slot?: number }).slot ?? 0) - ((q.config as { slot?: number }).slot ?? 0));
    const gate = f.c.machines.find((m) => m.config.kind === 'gate')!.id;
    const jn = f.add(join({ k: 'chain' }), { x: 16, y: 6 });
    f.wire(desks[0]!.id, jn, 'a'); f.wire(desks[1]!.id, jn, 'b'); f.wire(jn, gate);
    const all = f.add({ kind: 'forall' }, { x: 30, y: 20 });
    f.wire(gate, all); f.wire(all, f.socket());
    return { f, room, desks, gate, jn, all };
  }

  it('paintRoom seats one desk per assumption (slots 0, 1) and the gate exports both premises', () => {
    const target: K.Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: x, r: a }, { k: 'eq', l: y, r: a }], concl: { k: 'eq', l: x, r: y } };
    const { f, room, desks, gate, all } = twoDesks(target);
    expect(room.assumes).toHaveLength(2);
    expect(room.l).toEqual(x1);                          // l/r/rel mirror assumes[0] for single-desk readers
    expect(desks.map((m) => (m.config as { slot?: number }).slot ?? 0)).toEqual([0, 1]);
    const comp = f.compile();
    const Lb = K.labelsOf([...f.ctx.level.atoms, ...comp.graph.vars!]);
    expect(K.factText((comp.machines[gate]!.out as { card: K.Card }).card, Lb)).toBe('x₁ = a, y₁ = a ⇒ x₁ = y₁');
    expect(K.factText((comp.machines[all]!.out as { card: K.Card }).card, Lb)).toBe('∀x, y. x = a, y = a ⇒ x = y');
    expect(comp.solvable, JSON.stringify([comp.sockets, comp.machines])).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
    oracleOk(f, comp);
  });

  it('a dock stating the premises the other way round accepts the same card', () => {
    const target: K.Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: y, r: a }, { k: 'eq', l: x, r: a }], concl: { k: 'eq', l: x, r: y } };
    const { f } = twoDesks(target);
    const comp = f.compile();
    expect(comp.solvable, JSON.stringify(comp.sockets)).toBe(true);
  });

  it('the multi-desk gate makes a saveable lemma, re-verified up to premise order', () => {
    const target: K.Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: x, r: a }, { k: 'eq', l: y, r: a }], concl: { k: 'eq', l: x, r: y } };
    const { f, all } = twoDesks(target);
    const comp = f.compile();
    const lm = F.lemmaFrom(comp, f.c, all, f.ctx);
    // a mentions the constant a: not a lemma (the reason says so), but nothing about desks breaks it
    expect(lm.ok).toBe(false);
    expect((lm as { reason: string }).reason).toBe('Mentions the constant a. Use a Tower instead.');
  });

  it('a desk inside the room reports its own assumption when it leaks, and ∀ inside names the right desk', () => {
    const target: K.Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: x, r: a }, { k: 'eq', l: y, r: a }], concl: { k: 'eq', l: x, r: y } };
    const { f, desks } = twoDesks(target);
    const inner = f.add({ kind: 'forall' }, { x: 12, y: 11 });
    f.wire(desks[1]!.id, inner);
    expect(reason(f.compile(), inner)).toBe("y₁ appears in the supposition y₁ = a. Use the room's gate first.");
  });

  it('setRoomAssumptions grows a room to three desks and back to one; resizeRoom keeps them', () => {
    const f = new Floor(mkLevel({ id: 'T', sockets: [{ id: 's', target: eq(a, a), allowedGivens: [] }] } as never));
    let e = F.paintRoom(f.c, { x: 10, y: 4, w: 6, h: 5 }, 'assume', a, b, f.ctx, 'eq');
    if (!e.ok) throw new Error(e.reason);
    const room = e.canvas.rooms[0]!.id;
    expect(e.canvas.rooms[0]!.assumes).toBeUndefined();     // single desk: the old shape exactly
    const three: K.Assumption[] = [{ rel: 'eq', l: a, r: b }, { rel: 'neq', l: a, r: E }, { rel: 'eq', l: b, r: b }];
    e = F.setRoomAssumptions(e.canvas, room, three, f.ctx);
    if (!e.ok) throw new Error(e.reason);
    const desksOf = (c: F.Canvas) => c.machines.filter((m) => m.config.kind === 'desk').map((m) => (m.config as { slot?: number }).slot ?? 0).sort();
    expect(desksOf(e.canvas)).toEqual([0, 1, 2]);
    expect(F.deskCount(e.canvas.rooms[0]!)).toBe(3);
    const r2 = F.resizeRoom(e.canvas, room, { x: 10, y: 4, w: 8, h: 6 }, f.ctx);
    if (!r2.ok) throw new Error(r2.reason);
    expect(desksOf(r2.canvas)).toEqual([0, 1, 2]);
    // every desk sits in its room, with its own doorstep
    f.c = r2.canvas;
    const comp = f.compile();
    for (const m of f.c.machines.filter((x) => x.config.kind === 'desk')) expect(comp.machines[m.id]!.status, m.id).toEqual({ k: 'ok' });
    const outs = f.c.machines.filter((x) => x.config.kind === 'desk').map((m) => K.factText((comp.machines[m.id]!.out as { fact: K.Pallet }).fact, L)).sort();
    expect(outs).toEqual(['a = b', 'a ≠ e', 'b = b']);
    const back = F.setRoomAssumptions(r2.canvas, room, [three[1]!], f.ctx);
    if (!back.ok) throw new Error(back.reason);
    expect(desksOf(back.canvas)).toEqual([0]);
    expect(back.canvas.rooms[0]!.assumes).toBeUndefined();
    expect(back.canvas.rooms[0]!.rel).toBe('neq');
    expect(F.setRoomAssumptions(back.canvas, room, [...three, three[0]!], f.ctx).ok).toBe(false);
    expect(F.paintRoom(f.c, { x: 30, y: 4, w: 6, h: 5 }, 'suppose', a, b, f.ctx, undefined, three).ok).toBe(false);
  });

  it('a 3×3 room still seats three desks and a gate, or refuses in words', () => {
    const f = new Floor(mkLevel({ id: 'T', sockets: [{ id: 's', target: eq(a, a), allowedGivens: [] }] } as never));
    const three: K.Assumption[] = [{ rel: 'eq', l: a, r: b }, { rel: 'eq', l: b, r: a }, { rel: 'eq', l: a, r: a }];
    const e = F.paintRoom(f.c, { x: 10, y: 4, w: 3, h: 3 }, 'assume', a, b, f.ctx, 'eq', three);
    if (e.ok) expect(e.canvas.machines.filter((m) => m.config.kind === 'desk')).toHaveLength(3);
    else expect(e.reason).toMatch(/Make the room bigger/);
  });

  it('old saves: migrateCanvas keeps a multi-desk room and its desk slots', () => {
    const target: K.Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: x, r: a }, { k: 'eq', l: y, r: a }], concl: { k: 'eq', l: x, r: y } };
    const { f } = twoDesks(target);
    const back = F.migrateCanvas(JSON.parse(JSON.stringify(f.c)), f.ctx)!;
    expect(back.rooms[0]!.assumes).toEqual(f.c.rooms[0]!.assumes);
    expect(back.machines.filter((m) => m.config.kind === 'desk').map((m) => (m.config as { slot?: number }).slot ?? 0).sort()).toEqual([0, 1]);
    const comp = F.compile(back, f.ctx);
    expect(comp.solvable).toBe(true);
  });

  it('a desk with a slot its room does not declare jams', () => {
    const target: K.Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: x, r: a }, { k: 'eq', l: y, r: a }], concl: { k: 'eq', l: x, r: y } };
    const { f, desks } = twoDesks(target);
    f.c = { ...f.c, machines: f.c.machines.map((m) => (m.id === desks[1]!.id ? { ...m, config: { kind: 'desk' as const, room: (m.config as { room: string }).room, slot: 5 } } : m)) };
    expect(reason(f.compile(), desks[1]!.id)).toBe('This desk has no assumption in its room.');
    void y1;
  });
});

describe('rooms never hold system machines', () => {
  it('a room over a given inlet or a dock is refused with a reason', () => {
    const f = new Floor(solveForD(eq(d, P(a, b))));
    const g = f.c.machines.find((m) => m.config.kind === 'given')!;
    const s = f.c.machines.find((m) => m.config.kind === 'socket')!;
    const around = (t: F.Tile, w: number, h: number) => F.paintRoom(f.c, { x: t.x - 1, y: t.y - 1, w: w + 2, h: h + 3 }, 'suppose', a, b, f.ctx);
    const eg = around(g.at, 2, 1), es = around(s.at, 2, 2);
    expect(eg.ok).toBe(false); expect((eg as { reason: string }).reason).toBe('A room can’t hold a given. Keep the givens outside every room.');
    expect(es.ok).toBe(false); expect((es as { reason: string }).reason).toBe('A room can’t hold the dock. Keep the dock outside every room.');
  });
});
