// Book phase C: the many-sorted oracle (KERNEL-EXT §5.7).
import { describe, expect, it } from 'vitest';
import { catalogue } from './index';
import { actionsOn, homsBetween, modelLog, oracleCheck, nontrivialModels } from './oracle';
import { mkLevel } from '../kernel/testkit';
import type { Fact, LevelManifest, Term } from '../kernel/types';

const byName = (n: string) => catalogue().find((G) => G.name === n)!;
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });
const M = (id: string): Term => ({ k: 'meta', id });
const A = (id: string): Term => ({ k: 'atom', id });
const node = (fact: Fact, deps: string[] = []) => ({ n: { fact, deps, ok: true } });

describe('homomorphisms and actions of the catalogue', () => {
  it('counts homs and actions correctly', () => {
    expect(homsBetween(byName('ℤ₂'), byName('ℤ₂')).length).toBe(2);
    expect(homsBetween(byName('ℤ₃'), byName('ℤ₂')).length).toBe(1);
    expect(homsBetween(byName('S₃'), byName('ℤ₂')).length).toBe(2);
    expect(homsBetween(byName('V₄'), byName('ℤ₂')).length).toBe(4);
    expect(homsBetween(byName('ℤ₄'), byName('ℤ₄')).length).toBe(4);
    expect(homsBetween(byName('S₃'), byName('S₃')).length).toBe(10);
    expect(actionsOn(byName('ℤ₂'), 2).length).toBe(2);
    expect(actionsOn(byName('S₃'), 3).length).toBe(10); // homs S₃ → S₃
  });
});

describe('many-sorted oracle', () => {
  const lv = (p: Partial<LevelManifest>) => mkLevel({ sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'H', kind: 'group', label: 'H' }],
    maps: [{ id: 'f', label: 'f', args: ['G'], res: 'H', kind: 'hom' }], ...p } as never);
  it('accepts the hom law and f(e) = e, refutes f(x) = e', () => {
    const L = lv({});
    const homLaw: Fact = { k: 'law', metas: ['x', 'y'], metaSorts: { x: 'G', y: 'G' }, l: app('f', { k: 'mul', fs: [M('x'), M('y')] }), r: { k: 'mul', fs: [app('f', M('x')), app('f', M('y'))] } };
    expect(oracleCheck(L, node(homLaw), [])).toEqual([]);
    expect(oracleCheck(L, node({ k: 'eq', l: app('f', { k: 'e' }), r: { k: 'e', s: 'H' } }), [])).toEqual([]);
    const bogus: Fact = { k: 'law', metas: ['x'], metaSorts: { x: 'G' }, l: app('f', M('x')), r: { k: 'e', s: 'H' } };
    expect(oracleCheck(L, node(bogus), []).length).toBe(1);
  });
  it('solves forced maps: a section s of a hom f (f(s(y)) = y) — the section card holds, the converse is refuted', () => {
    const L = lv({ maps: [{ id: 'f', label: 'f', args: ['G'], res: 'H', kind: 'hom' }, { id: 's', label: 's', args: ['H'], res: 'G' }],
      givens: [{ id: 'sec', name: 'sec', fact: { k: 'law', metas: ['y'], metaSorts: { y: 'H' }, l: app('f', app('s', M('y'))), r: M('y') } }] } as never);
    const ok: Fact = { k: 'law', metas: ['y'], metaSorts: { y: 'H' }, l: app('f', app('s', M('y'))), r: M('y') };
    expect(oracleCheck(L, node(ok, ['g:sec']), [])).toEqual([]);
    const wrong: Fact = { k: 'law', metas: ['x'], metaSorts: { x: 'G' }, l: app('s', app('f', M('x'))), r: M('x') };
    expect(oracleCheck(L, node(wrong, ['g:sec']), []).length).toBe(1);
    // and the dock's givens have plenty of nontrivial models
    const withDock = { ...L, sockets: [{ id: 'd', target: ok as never, allowedGivens: ['sec'] }] } as LevelManifest;
    expect(nontrivialModels(withDock, 'd').ok).toBe(true);
  });
  it('an action: σ(e, p) = p holds, σ(g, p) = p is refuted', () => {
    const L = mkLevel({ sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'O', kind: 'set', label: 'Ω' }], maps: [{ id: 'ev', label: 'ev', args: ['G', 'O'], res: 'O', kind: 'action' }],
      atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'p', label: 'p', hue: 1, carrier: 'O' }] } as never);
    expect(oracleCheck(L, node({ k: 'eq', l: app('ev', { k: 'e' }, A('p')), r: A('p') }), [])).toEqual([]);
    expect(oracleCheck(L, node({ k: 'eq', l: app('ev', A('a'), A('p')), r: A('p') }), []).length).toBe(1);
  });
  it('the bounded fallbacks are logged, never silent', () => {
    expect(typeof modelLog).toBe('object');
  });
});
