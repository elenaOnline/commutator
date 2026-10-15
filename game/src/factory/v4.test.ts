// v4: Towers, ∀, Assume rooms, card docks and the Lemma Book (COMPILER builder).
import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from './index';
import { ctxFor, type SavedLemma } from '../state/factoryStore';
import { mkLevel } from '../kernel/testkit';
import {
  Floor, I, P, E, M, a, b, eq, x1, y1, status,
  cancel, insertPair, lawRw, routed, thm, spool, tower,
} from './compiler.testkit';

const reason = (comp: F.Compiled, id: string) => { const s = status(comp, id); return s.k === 'ok' ? '' : s.reason; };
const x = M('x'), y = M('y');
const pow5 = (t: K.Term) => P(t, t, t, t, t);

/** A ∀ goal order (card dock). */
function cardOrder(id: string, target: K.Card, givens: K.GivenDecl[] = []) {
  return mkLevel({ id, givens, sockets: [{ id: 's', target, allowedGivens: givens.map((g) => g.id) }] } as never);
}

/** Toolsmith: Tower x₁ · Spool (x₁⁻¹)⁻¹ · insert x₁⁻¹x₁ after it · cancel · ∀ → dock ∀x. (x⁻¹)⁻¹ = x */
function doubleFlip(levelId = 'TDF') {
  const lv = cardOrder(levelId, { k: 'law', metas: ['x'], l: I(I(x)), r: x });
  const f = new Floor(lv);
  const tw = f.add(tower('x1', 'x₁'), { x: 4, y: 14 });
  const sp = f.add(spool(I(I(x1))));
  const ins = f.add(insertPair(x1, true, F.pinFromGap(eq(I(I(x1)), I(I(x1))), { side: 'r', path: [], gap: 1 })!));
  const can = f.add(cancel());
  const all = f.add({ kind: 'forall' });
  f.wire(sp, ins); f.wire(ins, can); f.wire(can, all); f.wire(all, f.socket());
  return { f, tw, sp, ins, can, all, lv };
}

describe('Towers and ∀ (Toolsmith)', () => {
  it('proves ∀x. (x⁻¹)⁻¹ = x with a Tower + Spool + Rewriter recipes + ∀ into a card dock', () => {
    const { f, can, all, lv } = doubleFlip();
    const comp = f.compile();
    expect(comp.graph.vars).toEqual([{ id: 'x1', label: 'x₁', hue: 0, variable: true }]);
    const Lb = K.labelsOf([...lv.atoms, ...comp.graph.vars!]);
    expect(K.factText((comp.machines[can]!.out as { fact: K.Pallet }).fact, Lb)).toBe('(x₁⁻¹)⁻¹ = x₁');
    const out = comp.machines[all]!.out!;
    expect(out.k).toBe('card');
    expect(K.sameCardUpToRenaming((out as { card: K.Card }).card, { k: 'law', metas: ['x'], l: I(I(x)), r: x })).toBe(true);
    expect(comp.solvable, JSON.stringify(comp.sockets)).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('a law delivered the other way round fills its dock (as the kernel accepts it)', () => {
    const lv = cardOrder('TFL', { k: 'law', metas: ['x'], l: x, r: I(I(x)) });
    const { f } = doubleFlip();
    f.level = lv;
    f.ctx = { ...f.ctx, level: { ...f.ctx.level, id: lv.id, sockets: lv.sockets } };
    const comp = f.compile();
    expect(comp.solvable, JSON.stringify(comp.sockets)).toBe(true);
  });

  it('an undeclared variable says to place a Tower; duplicate Tower names jam', () => {
    const f = new Floor(cardOrder('T', { k: 'law', metas: ['x'], l: x, r: x }));
    const sp = f.add(spool(x1));
    expect(reason(f.compile(), sp)).toBe('x₁\'s Tower was deleted. Undo, or add a Tower named x₁.');
    // the editor never re-binds a dangling id silently, so a Tower placed now is a fresh x₂; declare first
    const g = new Floor(f.level);
    g.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const sp2 = g.add(spool(x1));
    expect(status(g.compile(), sp2)).toEqual({ k: 'ok' });
    // a forged duplicate (the editor renumbers real ones) jams the later Tower
    const t1 = g.c.machines.find((m) => m.kind === 'tower')!;
    g.c = { ...g.c, machines: [...g.c.machines, { ...t1, id: 'tower9', at: { x: 4, y: 18 } }] };
    expect(reason(g.compile(), 'tower9')).toBe('x₁ is taken. Rename this Tower.');
  });

  it('a fact about a dock-delivered equation (not generalized) is refused at a card dock', () => {
    const lv = cardOrder('T', { k: 'law', metas: ['x'], l: x, r: x });
    const f = new Floor(lv);
    f.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const sp = f.add(spool(x1));
    f.wire(sp, f.socket());
    expect(reason(f.compile(), f.socket())).toBe('Needs ∀x. x = x. Run x₁ = x₁ through ∀ first.');
  });
});

/** Assume room: assume (x₁y₁)⁵ = e; prove (y₁x₁)⁵ = e inside; gate exports ⟹; ∀ binds x, y. */
function conjugate(levelId = 'TCJ') {
  const target: K.Card = { k: 'cond', metas: ['x', 'y'], premises: [{ k: 'eq', l: pow5(P(x, y)), r: E }], concl: { k: 'eq', l: pow5(P(y, x)), r: E } };
  const lv = cardOrder(levelId, target);
  const f = new Floor(lv);
  f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
  f.add(tower('y1', 'y₁'), { x: 4, y: 30 });
  const { room, desk, gate } = f.room({ x: 10, y: 4, w: 26, h: 12 }, 'assume', pow5(P(x1, y1)), E);
  const sp = f.add(spool(pow5(P(y1, x1))), { x: 12, y: 12 });
  const ins = f.add(insertPair(x1, true), { x: 16, y: 12 });
  const re = f.add(routed(), { x: 22, y: 12 });
  const can = f.add(cancel(), { x: 28, y: 12 });
  const all = f.add({ kind: 'forall' }, { x: 40, y: 20 });
  f.wire(sp, ins); f.wire(ins, re); f.wire(desk, re, 'rule'); f.wire(re, can); f.wire(can, gate);
  f.wire(gate, all); f.wire(all, f.socket());
  return { f, room, desk, gate, all, can, target, lv };
}

describe('Assume rooms', () => {
  it('exports ∀x,y. (xy)⁵ = e ⟹ (yx)⁵ = e through the gate and ∀', () => {
    const { f, gate, all, can, target, room } = conjugate();
    const comp = f.compile();
    expect(comp.scopeOf[can]).toBe(room);
    expect(comp.machines[gate]!.out?.k, JSON.stringify(comp.machines[gate]!.status)).toBe('card');
    const card = (comp.machines[all]!.out as { card: K.Card }).card;
    expect(K.sameCardUpToRenaming(card, target)).toBe(true);
    expect(comp.solvable, JSON.stringify([comp.sockets, comp.beltErrors])).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('∀ inside the room on a fact resting on the assumption names it and points at the gate', () => {
    const { f, can } = conjugate();
    const inner = f.add({ kind: 'forall' }, { x: 30, y: 6 });
    f.wire(can, inner);
    expect(reason(f.compile(), inner)).toBe('x₁ appears in the supposition (x₁y₁)⁵ = e. Use the room\'s gate first.');
  });
});

describe('Lemma Book', () => {
  const save = (f: Floor, machine: string, id = 'lemma:double-flip-1', savedAt = 1): SavedLemma => {
    const comp = f.compile();
    const r = F.lemmaFrom(comp, f.c, machine, f.ctx);
    if (!r.ok) throw new Error(r.reason);
    return { id, name: 'Double Flip', card: r.card, levelId: f.level.id, canvas: f.c, machine, savedAt };
  };

  it('save → verify → use as a Rewriter recipe and as a Theorem recipe on another floor', () => {
    const { f, all } = doubleFlip('L01'); // proved on any order: it needs no givens
    const dbl = save(f, all);
    expect(F.verifyLemma(dbl, f.ctx)).toEqual({ ok: true });

    const lv = mkLevel({ id: 'U1', sockets: [{ id: 's', target: eq(I(I(a)), a), allowedGivens: [] }] });
    const g = new Floor(lv);
    g.ctx = ctxFor(lv, [], [dbl]);
    const sp = g.add(spool(I(I(a))));
    const re = g.add(lawRw({ k: 'schema', id: dbl.id }));
    g.wire(sp, re); g.wire(re, g.socket());
    const comp = g.compile();
    expect(comp.solvable, JSON.stringify(comp.machines[re]!.status)).toBe(true);

    // the Conjugate lemma (a cond card) as a Theorem recipe on L04-style h: (ab)⁵ = e
    const cj = conjugate('L01');
    const conjL = save(cj.f, cj.all, 'lemma:conjugate-1', 2);
    expect(F.verifyLemma(conjL, cj.f.ctx)).toEqual({ ok: true });
    const lv2 = mkLevel({ id: 'U2', givens: [{ id: 'h', name: 'h', fact: eq(pow5(P(a, b)), E) }], sockets: [{ id: 's', target: eq(pow5(P(b, a)), E), allowedGivens: ['h'] }] });
    const h = new Floor(lv2);
    h.ctx = ctxFor(lv2, [], [dbl, conjL]);
    const th = h.add(thm({ k: 'schema', id: conjL.id }));
    h.wire(h.given('h'), th, 'p0'); h.wire(th, h.socket());
    const c2 = h.compile();
    expect(c2.solvable, JSON.stringify(c2.machines[th]!.status)).toBe(true);
  });

  it('refuses lemmas that rest on a given, a constant, or a supposition — with distinct reasons', () => {
    // a given: h ⊢ ... generalized over x₁ still depends on g:h
    const lv = cardOrder('T', { k: 'law', metas: ['x'], l: x, r: x }, [{ id: 'h', name: 'h', fact: eq(P(a, b), E) }]);
    const f = new Floor(lv);
    f.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const mu = f.add({ kind: 'operator', recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: x1 } } });
    const all = f.add({ kind: 'forall' });
    f.wire(f.given('h'), mu); f.wire(mu, all);
    let r = F.lemmaFrom(f.compile(), f.c, all, f.ctx);
    expect(r).toEqual({ ok: false, reason: 'Uses given h: ab = e. Lemmas need no givens.' });
    // a constant: ∀ over x₁a = x₁a keeps the level constant a
    const g = new Floor(lv);
    g.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const sp = g.add(spool(P(x1, a)));
    const all2 = g.add({ kind: 'forall' });
    g.wire(sp, all2);
    r = F.lemmaFrom(g.compile(), g.c, all2, g.ctx);
    expect(r).toEqual({ ok: false, reason: 'Mentions the constant a. Use a Tower instead.' });
    // a supposition: ∀ inside a suppose room over a fact resting on a = b (no tower variable in it)
    const k = new Floor(lv);
    k.add(tower('x1', 'x₁'), { x: 4, y: 30 });
    const rm = k.room({ x: 10, y: 4, w: 20, h: 10 }, 'suppose', a, b);
    const m2 = k.add({ kind: 'operator', recipe: { k: 'multiply', side: 'left', t: { k: 'knob', term: x1 } } }, { x: 13, y: 8 });
    const all3 = k.add({ kind: 'forall' }, { x: 20, y: 8 });
    k.wire(rm.desk, m2); k.wire(m2, all3);
    r = F.lemmaFrom(k.compile(), k.c, all3, k.ctx);
    expect(r).toEqual({ ok: false, reason: 'Rests on a = b. Use the room\'s gate first.' });
    // Lagrange keeps its |G| dependency, so ∀ cannot launder it into a global lemma
    const lv3 = cardOrder('T3', { k: 'law', metas: ['x'], l: x, r: x }, [{ id: 'z', name: '|G|', fact: { k: 'size', n: 3 } }]);
    const q = new Floor(lv3);
    q.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const s3 = q.add(spool(P(x1, x1, x1)));
    const r3 = q.add(lawRw({ k: 'lagrange' }));
    const all4 = q.add({ kind: 'forall' });
    q.wire(s3, r3); q.wire(r3, all4);
    r = F.lemmaFrom(q.compile(), q.c, all4, q.ctx);
    expect(r).toEqual({ ok: false, reason: 'Uses given |G|: |G| = 3. Lemmas need no givens.' });
  });

  it('verification: a lemma may cite only earlier-saved lemmas; a changed proof is disabled', () => {
    const { f, all } = doubleFlip('L01');
    const dbl = save(f, all);
    // a second lemma whose proof cites `dbl`
    const lv = cardOrder('L01', { k: 'law', metas: ['x'], l: I(I(x)), r: x });
    const g = new Floor(lv);
    g.ctx = ctxFor(lv, [], [dbl]);
    g.add(tower('x1', 'x₁'), { x: 4, y: 14 });
    const sp = g.add(spool(I(I(x1))));
    const re = g.add(lawRw({ k: 'schema', id: dbl.id }));
    const al = g.add({ kind: 'forall' });
    g.wire(sp, re); g.wire(re, al);
    const second = save(g, al, 'lemma:again-1', 2);
    expect(F.verifyLemma(second, g.ctx, [dbl.id])).toEqual({ ok: true });
    expect(F.verifyLemma(second, g.ctx)).toEqual({ ok: false, reason: F.JAMS.lemmaSelf });
    // the whole book, in save order
    const book = F.verifyLemmas([second, dbl], () => ctxFor(lv, [], [dbl, second]));
    expect(book.map((l) => l.verified)).toEqual([true, true]);
    // a forged card is refused
    const forged = { ...dbl, card: { k: 'law', metas: ['x'], l: x, r: E } as K.Card };
    expect(F.verifyLemma(forged, f.ctx)).toEqual({ ok: false, reason: F.JAMS.lemmaChanged });
    void y; void b;
  });
});
