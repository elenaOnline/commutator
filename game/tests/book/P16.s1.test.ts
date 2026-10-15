// P16.s1 Conjugation as an Automorphism — Book world 14 (side). Towers a₁, b₁, x₁, y₁; words. Uses the player's saved double inverse (P4.4).
//  s1: Spool a(xy)a⁻¹ → insert a⁻¹a between x and y (right rail).
//  s2: Spool a(bxb⁻¹)a⁻¹ → b⁻¹a⁻¹ ⟶ (ab)⁻¹ (inverse of a product, backwards).
//  s3: Spool a⁻¹(axa⁻¹)(a⁻¹)⁻¹ → cancel a⁻¹a → (a⁻¹)⁻¹ ⟶ a (double inverse) → cancel aa⁻¹.
import { describe, expect, it } from 'vitest';
import { I, P, bookFloor, cancel, deliver, eq, insertPair, lawRw, lvA, pinGap, pinSpan, spool, targetsTrue, tower } from './kit-wA';
import { buildDoubleInverse, DOUBLE_INVERSE_ID, EARNED, schema } from './lemmas-w123';
import type * as K from '../../src/kernel';

const A = (id: string): K.Term => ({ k: 'atom', id });
const a1 = A('a1'), b1 = A('b1'), x1 = A('x1'), y1 = A('y1');

describe('P16.s1 Conjugation as an Automorphism', () => {
  const L = lvA('P16.s1');
  it('all three targets are true in every finite group', () => {
    const n = targetsTrue(L);
    for (const id of ['s1', 's2', 's3']) expect(n[id], id).toBeGreaterThan(0);
  });
  it('reference solution (with the saved double inverse)', () => {
    const { lemma } = buildDoubleInverse();
    const f = bookFloor(L, EARNED, [lemma]);
    f.add(tower('a1', 'a₁'), { x: 2, y: 50 });
    f.add(tower('b1', 'b₁'), { x: 4, y: 50 });
    f.add(tower('x1', 'x₁'), { x: 6, y: 50 });
    f.add(tower('y1', 'y₁'), { x: 8, y: 50 });
    // s1
    const T1 = P(a1, x1, y1, I(a1));
    const sp1 = f.add(spool(T1), { x: 22, y: 4 });
    const ip = f.add(insertPair(a1, true, pinGap(eq(T1, T1), 'r', 2)), { x: 28, y: 4 });
    const al1 = f.add({ kind: 'forall' }, { x: 36, y: 4 });
    f.wire(sp1, ip); f.wire(ip, al1); f.wire(al1, f.socket('s1'));
    // s2
    const T2 = P(a1, b1, x1, I(b1), I(a1));
    const sp2 = f.add(spool(T2), { x: 22, y: 14 });
    const sk = f.add(lawRw(schema('socks'), { dir: 'rev', target: pinSpan(eq(T2, T2), 'r', 3, 5) }), { x: 28, y: 14 });
    const al2 = f.add({ kind: 'forall' }, { x: 36, y: 14 });
    f.wire(sp2, sk); f.wire(sk, al2); f.wire(al2, f.socket('s2'));
    // s3
    const T3 = P(I(a1), a1, x1, I(a1), I(I(a1)));
    const sp3 = f.add(spool(T3), { x: 22, y: 24 });
    const c1 = f.add(cancel(pinSpan(eq(T3, T3), 'r', 0, 2)), { x: 28, y: 24 });
    const db = f.add(lawRw(schema(DOUBLE_INVERSE_ID), { target: pinSpan(eq(T3, P(x1, I(a1), I(I(a1)))), 'r', 2, 3) }), { x: 34, y: 24 });
    const c2 = f.add(cancel(pinSpan(eq(T3, P(x1, I(a1), a1)), 'r', 1, 3)), { x: 40, y: 24 });
    const al3 = f.add({ kind: 'forall' }, { x: 48, y: 24 });
    f.wire(sp3, c1); f.wire(c1, db); f.wire(db, c2); f.wire(c2, al3); f.wire(al3, f.socket('s3'));
    void y1;
    deliver(f);
  });
});
