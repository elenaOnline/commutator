// Floors that build the player's saved lemmas of Book worlds 2–3 (the Lemma Book entries later levels reuse).
// Each builder lays out the reference solution of its level through the editor and returns the floor and the lemma.
import type { SavedLemma } from '../../src/state/factoryStore';
import * as K from '../../src/kernel';
import {
  bookFloor, lv, saveLemma, spool, cancel, routed, mult, thm, tower, op, I, P, E, x1, y1, pop,
} from './kit-w123';

export const EARNED = ['cancel', 'witness', 'socks'];
export const kn = (t: K.Term) => ({ k: 'knob', term: t } as const);
export const given = (id: string) => ({ k: 'given', givenId: id } as const);
export const schema = (id: string, mirror = false) => ({ k: 'schema', id, ...(mirror ? { mirror: true } : {}) }) as const;

export const DOUBLE_INVERSE_ID = 'lemma:double-inverse-1';
export const COMMUTATOR_FWD_ID = 'lemma:commutator-implies-1';
export const COMMUTATOR_BWD_ID = 'lemma:commutator-implied-1';
export const IDEMPOTENT_ID = 'lemma:only-idempotent-1';
export const ONE_SIDED_ID = 'lemma:xy-e-implies-yx-e-1';

/** P4.4 · Undo the Undo: Tower x₁ · Spool x₁⁻¹x₁ → cancel → unique inverse → swap → ∀ → dock. */
export function buildDoubleInverse() {
  const f = bookFloor(lv('P4.4'), ['cancel', 'witness']);
  f.add(tower('x1', 'x₁'), { x: 4, y: 30 });
  const sp = f.add(spool(P(I(x1), x1)));
  const cn = f.add(cancel());
  const t = f.add(thm({ k: 'schema', id: 'witness' }));
  const sw = f.add(op({ k: 'swap' }));
  const all = f.add({ kind: 'forall' });
  f.wire(sp, cn); f.wire(cn, t, 'p0'); f.wire(t, sw); f.wire(sw, all); f.wire(all, f.socket());
  const lemma = saveLemma(f, all, DOUBLE_INVERSE_ID, lv('P4.4').lemmaNames![0]!, 1);
  return { f, lemma };
}

/** P4.7 · Idle Twice: Assume xx = x → multiply left by x⁻¹ → cancel twice → gate → ∀ → dock. */
export function buildIdempotent() {
  const f = bookFloor(lv('P4.7'), EARNED);
  f.add(tower('x1', 'x₁'), { x: 2, y: 30 });
  const r = f.room({ x: 18, y: 4, w: 26, h: 10 }, 'assume', P(x1, x1), x1);
  const m = f.add(mult('left', I(x1)), { x: 21, y: 8 });
  const c1 = f.add(cancel(), { x: 27, y: 8 });
  const c2 = f.add(cancel(), { x: 33, y: 8 });
  const all = f.add({ kind: 'forall' }, { x: 48, y: 20 });
  f.wire(r.desk, m); f.wire(m, c1); f.wire(c1, c2); f.wire(c2, r.gate); f.wire(r.gate, all); f.wire(all, f.socket());
  const lemma = saveLemma(f, all, IDEMPOTENT_ID, lv('P4.7').lemmaNames![0]!, 2);
  return { f, lemma };
}

/** P4.9 · The Commutator, both docks. Returns both lemmas. */
export function buildCommutator() {
  const f = bookFloor(lv('P4.9'), EARNED);
  f.add(tower('x1', 'x₁'), { x: 2, y: 44 });
  f.add(tower('y1', 'y₁'), { x: 4, y: 44 });
  const W = P(x1, y1, I(x1), I(y1));
  // s: assume xy = yx; Spool xyx⁻¹y⁻¹ → rewrite xy by the desk → cancel → cancel
  const r1 = f.room({ x: 18, y: 4, w: 30, h: 10 }, 'assume', P(x1, y1), P(y1, x1));
  const sp = f.add(spool(W), { x: 20, y: 8 });
  const rw = f.add(routed(), { x: 26, y: 8 });
  const c1 = f.add(cancel(), { x: 32, y: 8 });
  const c2 = f.add(cancel(), { x: 38, y: 8 });
  const all1 = f.add({ kind: 'forall' }, { x: 54, y: 6 });
  f.wire(sp, rw); f.wire(r1.desk, rw, 'rule'); f.wire(rw, c1); f.wire(c1, c2); f.wire(c2, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('s'));
  // t: assume xyx⁻¹y⁻¹ = e; multiply right by yx → cancel y⁻¹y → cancel x⁻¹x → pop the e in e·yx
  const r2 = f.room({ x: 18, y: 18, w: 40, h: 10 }, 'assume', W, E);
  const m1 = f.add(mult('right', P(y1, x1)), { x: 21, y: 22 });
  const d1 = f.add(cancel(), { x: 27, y: 22 });
  const d2 = f.add(cancel(), { x: 33, y: 22 });
  const pp = f.add(pop(), { x: 39, y: 22 });
  const all2 = f.add({ kind: 'forall' }, { x: 60, y: 20 });
  f.wire(r2.desk, m1); f.wire(m1, d1); f.wire(d1, d2); f.wire(d2, pp); f.wire(pp, r2.gate); f.wire(r2.gate, all2); f.wire(all2, f.socket('t'));
  const fwd = saveLemma(f, all1, COMMUTATOR_FWD_ID, lv('P4.9').lemmaNames![0]!, 3);
  const bwd = saveLemma(f, all2, COMMUTATOR_BWD_ID, lv('P4.9').lemmaNames![1]!, 4);
  return { f, fwd, bwd };
}
export type { SavedLemma };

/** P4.10 · One-Sided Inverses, both docks. Returns the floor and the saved lemma xy = e ⟹ yx = e. */
export function buildOneSided() {
  const level = lv('P4.10');
  const a: K.Term = { k: 'atom', id: 'a' }, b: K.Term = { k: 'atom', id: 'b' }, c: K.Term = { k: 'atom', id: 'c' };
  const f = bookFloor(level, EARNED);
  f.add(tower('x1', 'x₁'), { x: 2, y: 44 });
  f.add(tower('y1', 'y₁'), { x: 4, y: 44 });
  // s: assume xy = e → unique inverse (y = x⁻¹) → Spool yx → rewrite y by the inverse → cancel → yx = e
  const r1 = f.room({ x: 18, y: 4, w: 34, h: 10 }, 'assume', P(x1, y1), E);
  const w1 = f.add(thm({ k: 'schema', id: 'witness' }), { x: 21, y: 8 });
  const sp = f.add(spool(P(y1, x1)), { x: 21, y: 11 });
  const rw = f.add(routed(), { x: 29, y: 9 });
  const cn = f.add(cancel(), { x: 36, y: 9 });
  const all1 = f.add({ kind: 'forall' }, { x: 56, y: 6 });
  f.wire(r1.desk, w1, 'p0'); f.wire(sp, rw); f.wire(w1, rw, 'rule'); f.wire(rw, cn); f.wire(cn, r1.gate); f.wire(r1.gate, all1); f.wire(all1, f.socket('s'));
  // t: h: bac = a⁻¹ → multiply right by a → cancel → (ba)(ca) = e → the card xy = e ⟹ yx = e at x = ba, y = ca → unique left inverse at cab·a = e
  const m = f.add(mult('right', a), { x: 20, y: 24 });
  const c1 = f.add(cancel(), { x: 26, y: 24 });
  const rot = f.add(thm('routed', 1), { x: 32, y: 24 }); // the second cut: x = ba, y = ca
  const un = f.add(thm({ k: 'schema', id: 'witness', mirror: true }, 0, { u: kn(a), v: kn(P(c, a, b)) }), { x: 40, y: 24 });
  f.wire(f.given('h'), m); f.wire(m, c1); f.wire(c1, rot, 'p0'); f.wire(all1, rot, 'card'); f.wire(rot, un, 'p0'); f.wire(un, f.socket('t'));
  const lemma = saveLemma(f, all1, ONE_SIDED_ID, lv('P4.10').lemmaNames![0]!, 5);
  return { f, lemma };
}
