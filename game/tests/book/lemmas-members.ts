// Floors that build the player's saved lemmas of the Members levels (the Lemma Book entries P13.1 reuses).
// P12.1 · Same Coset: refl, symm and trans, each saved "for every subgroup" (∀H ≤ G).
import * as F from '../../src/factory';
import * as K from '../../src/kernel';
import type { SavedLemma } from '../../src/state/factoryStore';
import { EARNED, DOUBLE_INVERSE_ID, buildDoubleInverse, schema } from './lemmas-w123';
import { I, P, cancel, insertPair, pop, lawRw, lvM, memA, memRoom, membersFloor, saveLemma, sc, subTower, thm, tower, x1, y1 } from './kit-members';

export const COSET_REFL_ID = 'lemma:same-coset-reflexive-1';
export const COSET_SYMM_ID = 'lemma:same-coset-symmetric-1';
export const COSET_TRANS_ID = 'lemma:same-coset-transitive-1';
export const z1: K.Term = { k: 'atom', id: 'z1' };

/** P12.1 · Same Coset, all three docks. Returns the floor, the three saved lemmas and the double-inverse lemma it relied on. */
export function buildSameCoset() {
  const dbl = buildDoubleInverse().lemma;
  const f = membersFloor(lvM('P12.1'), EARNED, [dbl]);
  f.add(subTower('H1', 'H₁'), { x: 2, y: 62 });
  f.add(tower('x1', 'x₁'), { x: 4, y: 62 }); f.add(tower('y1', 'y₁'), { x: 6, y: 62 }); f.add(tower('z1', 'z₁'), { x: 8, y: 62 });
  // s1 (refl): e ∈ H₁ → insert x₁x₁⁻¹ at the gap of e → pop the e → ∀
  const se = f.add(thm(sc('sub.e')), { x: 20, y: 6 });
  const ip = f.add(insertPair(x1, false), { x: 26, y: 6 });
  const pp = f.add(pop(), { x: 32, y: 6 });
  const a1 = f.add({ kind: 'forall' }, { x: 38, y: 6 });
  f.wire(se, ip); f.wire(ip, pp); f.wire(pp, a1); f.wire(a1, f.socket('s1'));
  // s2 (symm): desk x₁y₁⁻¹ ∈ H₁ → inverses → inverse of a product → double inverse → gate → ∀
  const r2 = memRoom(f, { x: 18, y: 18, w: 34, h: 10 }, [memA(P(x1, I(y1)), 'H1')], x1);
  const iv = f.add(thm(sc('sub.inv')), { x: 21, y: 22 });
  const sk = f.add(lawRw(schema('socks')), { x: 27, y: 22 });
  const di = f.add(lawRw(schema(DOUBLE_INVERSE_ID)), { x: 33, y: 22 });
  const a2 = f.add({ kind: 'forall' }, { x: 56, y: 22 });
  f.wire(r2.desks[0]!, iv, 'p0'); f.wire(iv, sk); f.wire(sk, di); f.wire(di, r2.gate); f.wire(r2.gate, a2); f.wire(a2, f.socket('s2'));
  // s3 (trans): two desks → closed under products → cancel → gate → ∀
  const r3 = memRoom(f, { x: 18, y: 36, w: 34, h: 12 }, [memA(P(x1, I(y1)), 'H1'), memA(P(y1, I(z1)), 'H1')], x1);
  const ml = f.add(thm(sc('sub.mul')), { x: 25, y: 40 });
  const cn = f.add(cancel(), { x: 31, y: 40 });
  const a3 = f.add({ kind: 'forall' }, { x: 56, y: 40 });
  f.wire(r3.desks[0]!, ml, 'p0'); f.wire(r3.desks[1]!, ml, 'p1'); f.wire(ml, cn); f.wire(cn, r3.gate); f.wire(r3.gate, a3); f.wire(a3, f.socket('s3'));
  return { f, dbl, a1, a2, a3, save: () => ({
    refl: saveLemma(f, a1, COSET_REFL_ID, 'same coset: reflexive', 10),
    symm: saveLemma(f, a2, COSET_SYMM_ID, 'same coset: symmetric', 11),
    trans: saveLemma(f, a3, COSET_TRANS_ID, 'same coset: transitive', 12),
  }) };
}
export type { SavedLemma, F };
