// Floors that build the player's saved homomorphism lemmas for Book worlds 12–14, the way a player would: a Hom Tower
// floor, then ∀, then "save to the Lemma Book". The chapter-9 levels (P9.3 e Goes to e, P9.4 Inverses Go to Inverses) are
// authored in parallel elsewhere, so this file carries stand-in manifests with their SYNTHESIS statements instead of
// importing that unfinished code. The ch. 4 lemmas (the only idempotent is e, the commutator criterion) come from
// lemmas-w123; P16.1's fibre lemmas are built here from the real P16.1 manifest.
import type { SavedLemma } from '../../src/state/factoryStore';
import type * as K from '../../src/kernel';
import * as F from '../../src/factory';
import type { Card, LevelManifest, StructBinder, Term, Toolset } from '../../src/kernel/types';
import {
  bookFloor, saveLemma, spool, cancel, routed, thm, lawRw, mult, op, P, I, M, eq, pinSpan,
  app, eS, groupTower, homTower, elemTower, lvZ, tower, pw, Zc, E, intKnob, pop,
} from './kit-w1214';
import { buildIdempotent, buildCommutator, EARNED } from './lemmas-w123';
import { buildNegPower, multiRoom } from './lemmas-w89';
import { lv89 } from './kit-w89';

export { EARNED };
export const HOM_E_ID = 'lemma:hom-identity-1';
export const HOM_INV_ID = 'lemma:hom-inverse-1';
export const FIBRE_FWD_ID = 'lemma:fibre-implies-1';
export const FIBRE_BWD_ID = 'lemma:fibre-implied-1';
export const sch = (id: string, structs?: Record<string, string>, mirror = false) =>
  ({ k: 'schema', id, ...(mirror ? { mirror: true } : {}), ...(structs ? { structs } : {}) }) as const;
export const given = (id: string) => ({ k: 'given', givenId: id }) as const;

/** ∀S, T groups, ∀f : S → T — the binders every hom card in this batch opens with. */
export const HOM_BINDS: StructBinder[] = [{ k: 'grp', id: 'S' }, { k: 'grp', id: 'T' }, { k: 'hom', id: 'f', dom: { k: 'sortmeta', id: 'S' }, cod: { k: 'sortmeta', id: 'T' } }];
const f = (t: Term): Term => app('f', t);
const eT = eS('T');

const none: Toolset = { lift: false, merge: false, suppose: false, classical: false, press: false, schemas: [], conjecture: false };
/** Stand-in manifests for P9.3 and P9.4 (SYNTHESIS §3 W7): a Hom Tower and ∀f docks. */
function stand(id: string, target: Card): LevelManifest {
  return {
    id, index: id === 'P9.3' ? 37 : 38, campaign: 'book', world: 7, chapter: 9, title: id, memo: '', idea: '',
    atoms: [], givens: [], sockets: [{ id: 's', target, allowedGivens: [] }],
    tools: { ...none, lift: true, merge: true, suppose: true, schemas: EARNED }, unlocks: [], par: { parts: 0, axioms: 0 }, uses: [],
  };
}
export const P93 = stand('P9.3', { k: 'law', metas: [], l: f(eS('S')), r: eT, binds: HOM_BINDS });
export const P94 = stand('P9.4', { k: 'law', metas: ['x'], metaSorts: { x: { k: 'sortmeta', id: 'S' } }, l: f(I(M('x'))), r: I(f(M('x'))), binds: HOM_BINDS });

/** P9.3 · e Goes to e: group Towers G₁, K₁ · Hom Tower f₁ · Spool f₁(e) → e = ee inside → hom law → swap → the only idempotent is e → ∀. */
export function buildHomE() {
  const { lemma: idem } = buildIdempotent();
  const fl = bookFloor(P93, EARNED, [idem]);
  fl.add(groupTower('G1', 'G₁'), { x: 2, y: 30 });
  fl.add(groupTower('K1', 'K₁'), { x: 4, y: 30 });
  fl.add(homTower('f1', 'f₁', 'G1', 'K1'), { x: 6, y: 30 });
  const fE = app('f1', eS('G1'));
  const sp = fl.add(spool(fE));
  const ee = fl.add(lawRw({ k: 'axiom', id: 'unitL' }, { dir: 'rev', target: F.pinFromAddr(eq(fE, fE), { side: 'r', path: [0] })! }));
  const hm = fl.add(lawRw(sch('hom.mul')));
  const sw = fl.add(op({ k: 'swap' }));
  const id = fl.add(thm(sch(idem.id)));
  const all = fl.add({ kind: 'forall' });
  fl.wire(sp, ee); fl.wire(ee, hm); fl.wire(hm, sw); fl.wire(sw, id, 'p0'); fl.wire(id, all); fl.wire(all, fl.socket());
  const lemma = saveLemma(fl, all, HOM_E_ID, 'f(e) = e', 10);
  return { f: fl, lemma, idem };
}

/** P9.4 · Inverses Go to Inverses: Spool f₁(x₁)f₁(x₁⁻¹) → hom law backwards → cancel inside → f(e) = e at f₁ → unique inverse → ∀. */
export function buildHomInv() {
  const { lemma: homE } = buildHomE();
  const fl = bookFloor(P94, EARNED, [homE]);
  fl.add(groupTower('G1', 'G₁'), { x: 2, y: 30 });
  fl.add(groupTower('K1', 'K₁'), { x: 4, y: 30 });
  fl.add(homTower('f1', 'f₁', 'G1', 'K1'), { x: 6, y: 30 });
  fl.add(elemTower('x1', 'x₁', 'G1'), { x: 8, y: 30 });
  const X: Term = { k: 'atom', id: 'x1' };
  const W = P(app('f1', X), app('f1', I(X)));
  const sp = fl.add(spool(W));
  const hm = fl.add(lawRw(sch('hom.mul'), { dir: 'rev', target: pinSpan(eq(W, W), 'r', 0, 2) }));
  const cn = fl.add(cancel());
  const fe = fl.add(lawRw(sch(homE.id, { f: 'f1' })));
  const w = fl.add(thm(sch('witness')));
  const all = fl.add({ kind: 'forall' });
  fl.wire(sp, hm); fl.wire(hm, cn); fl.wire(cn, fe); fl.wire(fe, w, 'p0'); fl.wire(w, all); fl.wire(all, fl.socket());
  const lemma = saveLemma(fl, all, HOM_INV_ID, 'f(x⁻¹) = f(x)⁻¹', 11);
  return { f: fl, lemma, homE };
}

/** The ch. 4 and ch. 9 lemmas the homomorphism levels rely on, in Lemma Book order. */
export function homLemmas() {
  const { lemma: homInv, homE } = buildHomInv();
  return { homE, homInv };
}
export function commutatorLemmas() {
  const { fwd, bwd } = buildCommutator();
  return { fwd, bwd };
}
export type { SavedLemma, K };


/** P10.4 · Orders 3 and 5, saved as "x³ = e, x⁵ = e ⟹ x = e" (the reference floor of tests/book/P10.4.test.ts, then save). */
export const ORDERS35_ID = 'lemma:orders-3-5-1';
export function buildOrders35() {
  const { lemma: neg } = buildNegPower();
  const fl = bookFloor(lv89('P10.4'), EARNED, [neg]);
  fl.add(tower('x1', 'x₁'), { x: 2, y: 30 });
  const x1: Term = { k: 'atom', id: 'x1' };
  const { desks, gate } = multiRoom(fl, { x: 10, y: 4, w: 60, h: 14 }, [{ rel: 'eq', l: pw(x1, Zc(3)), r: E }, { rel: 'eq', l: pw(x1, Zc(5)), r: E }]);
  const sp = fl.add(spool(x1), { x: 14, y: 12 });
  const r1 = fl.add(lawRw(sch('power.one'), { dir: 'rev' }), { x: 18, y: 12 });
  const r2 = fl.add(lawRw(sch('power.add'), { dir: 'rev', values: { m: intKnob(Zc(6)), n: intKnob(Zc(-5)) } }), { x: 22, y: 12 });
  const r3 = fl.add(lawRw(sch('power.multiply'), { dir: 'rev', values: { m: intKnob(Zc(3)), n: intKnob(Zc(2)) } }), { x: 26, y: 12 });
  const r4 = fl.add(routed(), { x: 30, y: 12 });
  const r5 = fl.add(lawRw(sch('power.identity'), { tidy: false }), { x: 34, y: 12 });
  const r6 = fl.add(lawRw(sch(neg.id)), { x: 38, y: 12 });
  const r7 = fl.add(routed(), { x: 42, y: 12 });
  const r8 = fl.add(cancel(), { x: 46, y: 12 });
  const all = fl.add({ kind: 'forall' }, { x: 74, y: 20 });
  fl.wire(sp, r1); fl.wire(r1, r2); fl.wire(r2, r3); fl.wire(r3, r4); fl.wire(desks[0]!, r4, 'rule'); fl.wire(r4, r5); fl.wire(r5, r6);
  fl.wire(r6, r7); fl.wire(desks[1]!, r7, 'rule'); fl.wire(r7, r8); fl.wire(r8, gate); fl.wire(gate, all); fl.wire(all, fl.socket());
  const lemma = saveLemma(fl, all, ORDERS35_ID, 'x³ = e, x⁵ = e ⟹ x = e', 7);
  return { f: fl, lemma, neg };
}

/**
 * P16.1 · Fibres Are Cosets, both docks, on the real P16.1 manifest. Hom Tower f₁ : G₁ → K₁, Towers a₁, b₁ in G₁.
 *  ⟹: desk f(a₁) = f(b₁) · Spool f(a₁b₁⁻¹) → hom law → your f(x⁻¹) = f(x)⁻¹ at f₁ → desk → cancel → gate → ∀.
 *  ⟸: desk f(a₁b₁⁻¹) = e → hom law → your f(x⁻¹) = f(x)⁻¹ at f₁ → multiply right by f(b₁) → cancel → pop → gate → ∀.
 */
export function buildFibre() {
  const { homInv, homE } = homLemmas();
  const fl = bookFloor(lvZ('P16.1'), EARNED, [homE, homInv]);
  fl.add(groupTower('G1', 'G₁'), { x: 2, y: 40 });
  fl.add(groupTower('K1', 'K₁'), { x: 4, y: 40 });
  fl.add(homTower('f1', 'f₁', 'G1', 'K1'), { x: 6, y: 40 });
  fl.add(elemTower('a1', 'a₁', 'G1'), { x: 8, y: 40 });
  fl.add(elemTower('b1', 'b₁', 'G1'), { x: 10, y: 40 });
  const a: Term = { k: 'atom', id: 'a1' }, b: Term = { k: 'atom', id: 'b1' };
  const fx = (t: Term) => app('f1', t);
  const W = fx(P(a, I(b)));
  // ⟹
  const r1 = multiRoom(fl, { x: 14, y: 4, w: 36, h: 10 }, [{ rel: 'eq', l: fx(a), r: fx(b) }]);
  const sp = fl.add(spool(W), { x: 16, y: 8 });
  const h1 = fl.add(lawRw(sch('hom.mul'), { target: pinSpan(eq(W, W), 'r', 0, 1) }), { x: 20, y: 8 });
  const v1 = fl.add(lawRw(sch(homInv.id, { f: 'f1' })), { x: 24, y: 8 });
  const d1 = fl.add(routed(), { x: 28, y: 8 });
  const c1 = fl.add(cancel(), { x: 32, y: 8 });
  const all1 = fl.add({ kind: 'forall' }, { x: 54, y: 6 });
  fl.wire(sp, h1); fl.wire(h1, v1); fl.wire(v1, d1); fl.wire(r1.desks[0]!, d1, 'rule'); fl.wire(d1, c1); fl.wire(c1, r1.gate); fl.wire(r1.gate, all1); fl.wire(all1, fl.socket('fwd'));
  // ⟸
  const r2 = multiRoom(fl, { x: 14, y: 18, w: 36, h: 10 }, [{ rel: 'eq', l: W, r: eS('K1') }]);
  const h2 = fl.add(lawRw(sch('hom.mul')), { x: 16, y: 22 });
  const v2 = fl.add(lawRw(sch(homInv.id, { f: 'f1' })), { x: 20, y: 22 });
  const m2 = fl.add(mult('right', fx(b)), { x: 24, y: 22 });
  const c2 = fl.add(cancel(), { x: 28, y: 22 });
  const p2 = fl.add(pop(), { x: 32, y: 22 });
  const all2 = fl.add({ kind: 'forall' }, { x: 54, y: 20 });
  fl.wire(r2.desks[0]!, h2); fl.wire(h2, v2); fl.wire(v2, m2); fl.wire(m2, c2); fl.wire(c2, p2); fl.wire(p2, r2.gate); fl.wire(r2.gate, all2); fl.wire(all2, fl.socket('bwd'));
  const fwd = saveLemma(fl, all1, FIBRE_FWD_ID, 'fibre lemma ⟹', 20);
  const bwd = saveLemma(fl, all2, FIBRE_BWD_ID, 'fibre lemma ⟸', 21);
  return { f: fl, fwd, bwd, ids: { sp, h1, v1, d1, c1, h2, v2, m2, c2, p2 } };
}
