// P6.3 Onto, Twice — Book world 5. Tower z₁ ∈ C · Spool g(f(s(t(z₁)))) · section of f at y := t(z₁) · section of g at
// z := z₁ · ∀ → the witness dock ∀z. g(f(?)) = z, which then shows x = s(t(z)).
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { bookFloor, deliverC, lvC, nontrivialAll, targetsTrueC, app, given, towerIn, lawRw, spool } from './kit-wC';

const L = lvC('P6.3');
const Z = { k: 'atom', id: 'z1' } as K.Term;
const M = (id: string): K.Term => ({ k: 'meta', id });
/** The dock's answer: the witness x = s(t(z)). */
const ANSWER: K.Card = { k: 'law', metas: ['z'], metaSorts: { z: 'C' }, l: app('g', app('f', app('s', app('t', M('z'))))), r: M('z') };

export function buildP63() {
  const f = bookFloor(L, ['cancel', 'witness', 'socks']);
  f.add(towerIn('z1', 'z₁', 'C'), { x: 2, y: 30 });
  const sp = f.add(spool(app('g', app('f', app('s', app('t', Z))))));
  const r1 = f.add(lawRw(given('secf')));
  const r2 = f.add(lawRw(given('secg')));
  const all = f.add({ kind: 'forall' });
  f.wire(sp, r1); f.wire(r1, r2); f.wire(r2, all); f.wire(all, f.socket());
  return f;
}

describe('P6.3 Onto, Twice', () => {
  it('the witness works in every model of the givens, with at least 10 nontrivial models', () => {
    targetsTrueC(L, { s: ANSWER });
    expect(nontrivialAll(L).s).toBeGreaterThanOrEqual(10);
  });
  it('the dock is open and empty floor does not fill it; a bare Spool of either side does not either', () => {
    const f = bookFloor(L, ['cancel', 'witness', 'socks']);
    expect(f.compile().solvable).toBe(false);
    f.add(towerIn('z1', 'z₁', 'C'), { x: 2, y: 30 });
    const sp = f.add(spool(app('g', app('f', app('s', app('t', Z))))));
    const all = f.add({ kind: 'forall' });
    f.wire(sp, all); f.wire(all, f.socket());
    expect(f.compile().solvable).toBe(false);
  });
  it('reference solution; the dock then reads the witness', () => {
    const r = deliverC(buildP63());
    const inst = r.comp.sockets.s!.instance as K.Card;
    expect(K.factText(inst as never, K.levelLabels(L))).toBe('∀z. g(f(s(t(z)))) = z');
  }, 60_000);
});
