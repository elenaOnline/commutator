// Floors that build the player's saved lemmas of the Maps worlds (the Lemma Book entries later levels reuse).
// Each builder lays out the reference solution of its level through the editor and returns the floor and the lemma.
import * as F from '../../src/factory';
import type * as K from '../../src/kernel';
import type { SavedLemma } from '../../src/state/factoryStore';
import { buildIdempotent } from './lemmas-w123';
import { bookFloor, lvC, saveLemma, spool, lawRw, thm, op, schema, app, eS, eq, towerIn } from './kit-wC';

export const EARNED = ['cancel', 'witness', 'socks'];
export const FE_ID = 'lemma:f-of-e-1';
/** The hom tower f₁ : G₁ → H₁ and its two groups, as the factory declares them. */
export const groupTower = (varId: string, label: string) => ({ kind: 'tower', varId, label, sort: 'G', group: true }) as const;
export const homTower = (varId: string, label: string, dom: string, cod: string) => ({ kind: 'tower', varId, label, sort: 'G', hom: { dom, cod } }) as const;

/** P9.3 · e Goes to e: G₁, H₁, f₁ · Spool f₁(e) · e ⟶ ee inside f₁ · hom law · swap · the only idempotent is e · ∀ → dock. */
export function buildFE() {
  const idem = buildIdempotent().lemma;
  const f = bookFloor(lvC('P9.3'), EARNED, [idem]);
  f.add(groupTower('G1', 'G₁'), { x: 2, y: 30 });
  f.add(groupTower('H1', 'H₁'), { x: 4, y: 30 });
  f.add(homTower('f1', 'f₁', 'G1', 'H1'), { x: 6, y: 30 });
  const fE = app('f1', eS('G1'));
  const sp = f.add(spool(fE));
  const ee = f.add(lawRw({ k: 'axiom', id: 'unitL' }, { dir: 'rev', target: F.pinFromAddr(eq(fE, fE), { side: 'r', path: [0] })! }));
  const hm = f.add(lawRw(schema('hom.mul')));
  const sw = f.add(op({ k: 'swap' }));
  const id = f.add(thm(schema(idem.id)));
  const all = f.add({ kind: 'forall' });
  f.wire(sp, ee); f.wire(ee, hm); f.wire(hm, sw); f.wire(sw, id, 'p0'); f.wire(id, all); f.wire(all, f.socket());
  const lemma = saveLemma(f, all, FE_ID, 'f(e) = e', 6);
  return { f, lemma, idem };
}
export type { SavedLemma, K };
void towerIn;
