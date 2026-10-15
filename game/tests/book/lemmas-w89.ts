// Floors that build the player's saved lemmas of Book world 8 (the Lemma Book entries later levels reuse).
// Each builder lays out the reference solution of its level through the editor and returns the floor and the lemma(s).
import type { SavedLemma } from '../../src/state/factoryStore';
import * as F from '../../src/factory';
import type * as K from '../../src/kernel';
import type { Floor } from '../../src/factory/compiler.testkit';
import {
  bookFloor, lv89, saveLemma, spool, cancel, routed, thm, tower, towerZ, lawRw, pw, Zc, Zv, Zmul, x1, y1, I, P, E, eq, insertPair, pinGap,
} from './kit-w89';

export const EARNED = ['cancel', 'witness', 'socks'];
export const NEG_POWER_ID = 'lemma:negative-power-1';
export const CONJ_FWD_ID = 'lemma:conjugate-order-1';
export const CONJ_BWD_ID = 'lemma:conjugate-order-2';
export const sch = (id: string, mirror = false) => ({ k: 'schema', id, ...(mirror ? { mirror: true } : {}) }) as const;
export const given = (id: string) => ({ k: 'given', givenId: id }) as const;

/** P10.1 · Negative Powers: Spool xⁿ·x⁻ⁿ → power.add → power.zero → unique inverse → ∀ → dock. */
export function buildNegPower() {
  const f = bookFloor(lv89('P10.1'), EARNED);
  f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
  f.add(towerZ('n1', 'n₁'), { x: 4, y: 30 });
  const sp = f.add(spool(P(pw(x1, Zv('n1')), pw(x1, Zmul(Zc(-1), Zv('n1'))))));
  const r1 = f.add(lawRw(sch('power.add')));
  const r2 = f.add(lawRw(sch('power.zero')));
  const w = f.add(thm(sch('witness')));
  const all = f.add({ kind: 'forall' });
  f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, w, 'p0'); f.wire(w, all); f.wire(all, f.socket());
  const lemma = saveLemma(f, all, NEG_POWER_ID, 'negative power', 1);
  return { f, lemma };
}

/** P10.2 · Conjugates Share an Order, both docks. Returns the floor and both saved lemmas. */
export function buildConjugate() {
  const f = bookFloor(lv89('P10.2'), EARNED);
  f.add(tower('x1', 'x₁'), { x: 2, y: 44 });
  f.add(tower('y1', 'y₁'), { x: 4, y: 44 });
  f.add(towerZ('n1', 'n₁'), { x: 6, y: 44 });
  const conj = P(I(y1), x1, y1);
  // s: assume xⁿ = e; Spool (y⁻¹xy)ⁿ → power.conjugate → rewrite xⁿ by the desk → cancel y⁻¹ y
  const r1 = f.room({ x: 18, y: 4, w: 30, h: 10 }, 'assume', pw(x1, Zv('n1')), E);
  const sp = f.add(spool(pw(conj, Zv('n1'))), { x: 20, y: 8 });
  const c1 = f.add(lawRw(sch('power.conjugate')), { x: 26, y: 8 });
  const rw = f.add(routed(), { x: 32, y: 8 });
  const all1 = f.add({ kind: 'forall' }, { x: 54, y: 6 });
  const k1 = f.add(cancel(), { x: 38, y: 8 });
  f.wire(sp, c1); f.wire(c1, rw); f.wire(r1.desk, rw, 'rule'); f.wire(rw, k1); f.wire(k1, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('s'));
  // t: assume (y⁻¹xy)ⁿ = e; Spool xⁿ → insert yy⁻¹ at both ends → power.conjugate backwards on y⁻¹xⁿy → desk → cancel
  const r2 = f.room({ x: 18, y: 18, w: 44, h: 12 }, 'assume', pw(conj, Zv('n1')), E);
  const xn = pw(x1, Zv('n1'));
  const sp2 = f.add(spool(xn), { x: 20, y: 22 });
  const i1 = f.add(insertPair(y1, false), { x: 25, y: 22 });
  const p1 = eq(xn, P(y1, I(y1), xn));
  const i2 = f.add(insertPair(y1, false, pinGap(p1, 'r', 3)), { x: 30, y: 22 });
  const c2 = f.add(lawRw(sch('power.conjugate'), { dir: 'rev' }), { x: 35, y: 22 });
  const d2 = f.add(routed(), { x: 41, y: 22 });
  const k2 = f.add(cancel(), { x: 47, y: 22 });
  const all2 = f.add({ kind: 'forall' }, { x: 66, y: 20 });
  f.wire(sp2, i1); f.wire(i1, i2); f.wire(i2, c2); f.wire(c2, d2); f.wire(r2.desk, d2, 'rule'); f.wire(d2, k2); f.wire(k2, r2.gate); f.wire(r2.gate, all2); f.wire(all2, f.socket('t'));
  const fwd = saveLemma(f, all1, CONJ_FWD_ID, 'conjugate has the same order', 2);
  const bwd = saveLemma(f, all2, CONJ_BWD_ID, 'same order as its conjugate', 3);
  return { f, fwd, bwd };
}
export type { SavedLemma };

/** An Assume room with several desks (Book phase A). Returns the room, its desks in slot order and its gate. */
export function multiRoom(f: Floor, rect: F.Rect, assumes: K.Assumption[]) {
  const e = F.paintRoom(f.c, rect, 'assume', assumes[0]!.l, assumes[0]!.r, f.ctx, 'eq', assumes);
  if (!e.ok) throw new Error(e.reason);
  f.c = e.canvas;
  const room = f.c.rooms[f.c.rooms.length - 1]!;
  const desks = f.c.machines.filter((m) => m.config.kind === 'desk' && m.config.room === room.id)
    .sort((p, q) => ((p.config as { slot?: number }).slot ?? 0) - ((q.config as { slot?: number }).slot ?? 0)).map((m) => m.id);
  const gate = f.c.machines.find((m) => m.config.kind === 'gate' && m.config.room === room.id)!.id;
  return { room: room.id, desks, gate };
}
