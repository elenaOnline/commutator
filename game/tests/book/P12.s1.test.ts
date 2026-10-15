// P12.s1 Differ by a Power — Book world 10 (side). Pow nodes with ℤ Towers n₁, m₁; ℤ holes `c^?` (open docks).
//  s1 (k = 0):   Spool x₁x₁⁻¹ → cancel (right rail) → power.zero backwards at a gap (x := c): c⁰e → pop: x₁x₁⁻¹ = c⁰.
//  s2 (k = −n₁): Assume x₁y₁⁻¹ = c^n₁ → invert → inverse of a product → saved double inverse → saved negative power backwards.
//  s3 (k = n₁+m₁): two-desk Assume (x₁y₁⁻¹ = c^n₁, y₁z₁⁻¹ = c^m₁) → Joiner product → cancel y₁⁻¹y₁ → power.add.
// Relies on the player's saved lemmas double inverse (P4.4) and negative power (P10.1).
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { polyAdd, polyNeg } from '../../src/kernel/poly';
import { E, I, P, bookFloor, cancel, deliver, eq, join, lawRw, lvA, op, pinGap, pinSpan, pop, pw, spool, targetsTrue, tower, towerZ, x1, y1, Zc, Zv } from './kit-wA';
import { buildDoubleInverse, DOUBLE_INVERSE_ID, EARNED, kn, schema } from './lemmas-w123';
import { buildNegPower, multiRoom, NEG_POWER_ID } from './lemmas-w89';

const c: K.Term = { k: 'atom', id: 'c' }, z1: K.Term = { k: 'atom', id: 'z1' };

describe('P12.s1 Differ by a Power', () => {
  const L = lvA('P12.s1');
  it('exponent holes: the docks are open and true at their known exponents 0, −n, n + m', () => {
    expect(L.sockets.map((s) => s.holes)).toEqual([[{ id: 'k', sort: 'Z' }], [{ id: 'k', sort: 'Z' }], [{ id: 'k', sort: 'Z' }]]);
    const withK = (t: K.Pallet | K.Card, ex: K.Poly): K.Pallet | K.Card => {
      const sub = (u: K.Term): K.Term => (u.k === 'pow' ? { k: 'pow', base: sub(u.base), exp: u.exp.some((m) => m.monomial.some((q) => q.ref.k === 'zmeta' && q.ref.id === 'k')) ? ex : u.exp } : u.k === 'inv' ? { k: 'inv', arg: sub(u.arg) } : u.k === 'mul' ? { k: 'mul', fs: u.fs.map(sub) } : u);
      if (t.k === 'law') return { ...t, r: sub(t.r) };
      if (t.k === 'cond') { const q = t.concl as { k: 'eq'; l: K.Term; r: K.Term }; return { ...t, concl: { ...q, r: sub(q.r) } }; }
      return t;
    };
    const zm = (id: string): K.Poly => [{ coefficient: '1', monomial: [{ ref: { k: 'zmeta', id }, degree: 1 }] }];
    const answers = {
      s1: withK(L.sockets[0]!.target, Zc(0)),
      s2: withK(L.sockets[1]!.target, polyNeg(zm('n'))),
      s3: withK(L.sockets[2]!.target, polyAdd(zm('n'), zm('m'))),
    };
    const out = targetsTrue(L, answers);
    for (const id of ['s1', 's2', 's3']) expect(out[id], id).toBeGreaterThan(0);
    // the check has teeth: the wrong exponent fails somewhere in the catalogue
    expect(() => targetsTrue(L, { ...answers, s1: withK(L.sockets[0]!.target, Zc(1)) })).toThrow();
    expect(() => targetsTrue(L, { ...answers, s2: withK(L.sockets[1]!.target, zm('n')) })).toThrow();
    expect(() => targetsTrue(L, { ...answers, s3: withK(L.sockets[2]!.target, zm('m')) })).toThrow();
  });
  it('reference solution (double inverse and negative power are the player’s saved lemmas)', () => {
    const dbl = buildDoubleInverse().lemma;
    const neg = buildNegPower().lemma;
    const f = bookFloor(L, EARNED, [dbl, neg]);
    f.add(tower('x1', 'x₁'), { x: 2, y: 50 });
    f.add(tower('y1', 'y₁'), { x: 4, y: 50 });
    f.add(tower('z1', 'z₁'), { x: 6, y: 50 });
    f.add(towerZ('n1', 'n₁'), { x: 8, y: 50 });
    f.add(towerZ('m1', 'm₁'), { x: 10, y: 50 });
    // s1
    const T = P(x1, I(x1));
    const sp = f.add(spool(T), { x: 22, y: 4 });
    const k0 = f.add(cancel(pinSpan(eq(T, T), 'r', 0, 2)), { x: 28, y: 4 });
    const z0 = f.add(lawRw(schema('power.zero'), { dir: 'rev', gap: pinGap(eq(T, E), 'r', 0), values: { x: kn(c) } }), { x: 34, y: 4 });
    const pp = f.add(pop(), { x: 40, y: 4 });
    const al1 = f.add({ kind: 'forall' }, { x: 46, y: 4 });
    f.wire(sp, k0); f.wire(k0, z0); f.wire(z0, pp); f.wire(pp, al1); f.wire(al1, f.socket('s1'));
    // s2
    const cn = pw(c, Zv('n1'));
    const r2 = f.room({ x: 22, y: 12, w: 40, h: 10 }, 'assume', P(x1, I(y1)), cn);
    const inv = f.add(op({ k: 'invert' }), { x: 25, y: 16 });
    const sk = f.add(lawRw(schema('socks')), { x: 31, y: 16 });
    const db = f.add(lawRw(schema(DOUBLE_INVERSE_ID)), { x: 37, y: 16 });
    const ng = f.add(lawRw(schema(NEG_POWER_ID), { dir: 'rev' } as never), { x: 43, y: 16 });
    const al2 = f.add({ kind: 'forall' }, { x: 66, y: 16 });
    f.wire(r2.desk, inv); f.wire(inv, sk); f.wire(sk, db); f.wire(db, ng); f.wire(ng, r2.gate); f.wire(r2.gate, al2); f.wire(al2, f.socket('s2'));
    // s3
    const r3 = multiRoom(f, { x: 22, y: 28, w: 40, h: 14 }, [
      { rel: 'eq', l: P(x1, I(y1)), r: pw(c, Zv('n1')) }, { rel: 'eq', l: P(y1, I(z1)), r: pw(c, Zv('m1')) },
    ]);
    const pr = f.add(join({ k: 'product' }), { x: 26, y: 32 });
    const kk = f.add(cancel(pinSpan(eq(P(x1, I(y1), y1, I(z1)), P(pw(c, Zv('n1')), pw(c, Zv('m1')))), 'l', 1, 3)), { x: 32, y: 32 });
    const ad = f.add(lawRw(schema('power.add')), { x: 38, y: 32 });
    const al3 = f.add({ kind: 'forall' }, { x: 66, y: 32 });
    f.wire(r3.desks[0]!, pr, 'a'); f.wire(r3.desks[1]!, pr, 'b'); f.wire(pr, kk); f.wire(kk, ad); f.wire(ad, r3.gate); f.wire(r3.gate, al3); f.wire(al3, f.socket('s3'));
    const { comp } = deliver(f);
    const txt = (id: string) => K.factText(comp.sockets[id]!.instance!, K.labelsOf(L.atoms));
    expect(txt('s1')).toBe('∀x. xx⁻¹ = c^0');
    expect(txt('s2')).toBe('∀x, y, n. xy⁻¹ = c^n ⇒ yx⁻¹ = c^(-n)');
    expect(txt('s3')).toBe('∀x, y, z, n, m. xy⁻¹ = c^n, yz⁻¹ = c^m ⇒ xz⁻¹ = c^(m+n)');
  }, 120_000);
});
