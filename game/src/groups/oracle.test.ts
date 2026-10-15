import { describe, expect, it } from 'vitest';
import type { Fact, Term } from '../kernel/types';
import { LEVELS } from '../levels/levels';
import { oracleCheck } from './oracle';
const a: Term = { k: 'atom', id: 'a' }, b: Term = { k: 'atom', id: 'b' }, x: Term = { k: 'meta', id: 'x' }, e: Term = { k: 'e' };
const mul = (...fs: Term[]): Term => ({ k: 'mul', fs });
const commute: Fact = { k: 'eq', l: mul(a, b), r: mul(b, a) };
const level = LEVELS.find(l => l.id === 'L08')!;
const node = (fact: Fact, deps: string[] = []) => ({ fact, deps, ok: true });
it('flags unsupported commutativity, without implicitly using level givens', () => {
  const errors = oracleCheck(level, { fake: node(commute) }, []);
  expect(errors).toHaveLength(1); expect(errors[0]).toMatch(/fake.*S₃/);
});
it('accepts commutativity with a dependency on the exponent-two law', () => {
  expect(oracleCheck(level, { good: node(commute, ['g:H']) }, [])).toEqual([]);
});
it('accepts bottom vacuously under contradictory given and suppose assumptions', () => {
  const l = { ...level, givens: [{ id: 'n', name: 'n', fact: { k: 'neq' as const, l: a, r: e } }] };
  expect(oracleCheck(l, { bot: node({ k: 'bot' }, ['g:n', 'a:room']) }, [{ id: 'room', kind: 'suppose', l: a, r: e }])).toEqual([]);
});
it('interprets classical assumptions as inequalities', () => {
  const rooms = [{ id: 'c', kind: 'classical' as const, l: a, r: e }];
  expect(oracleCheck(level, { neq: node({ k: 'neq', l: a, r: e }, ['a:c']) }, rooms)).toEqual([]);
  expect(oracleCheck(level, { wrong: node({ k: 'eq', l: a, r: e }, ['a:c']) }, rooms)[0]).toMatch(/wrong.*ℤ₂/);
});
it('checks universally quantified law and conditional conclusions', () => {
  const law: Fact = { k: 'law', metas: ['x'], l: x, r: e };
  const cond: Fact = { k: 'cond', metas: ['x'], premises: [{ k: 'neq', l: x, r: e }], concl: { k: 'eq', l: x, r: e } };
  expect(oracleCheck(level, { law: node(law), cond: node(cond) }, [])).toHaveLength(2);
  const trueLaw: Fact = { k: 'law', metas: ['x'], l: mul({ k: 'inv', arg: x }, x), r: e };
  expect(oracleCheck(level, { law: node(trueLaw) }, [])).toEqual([]);
});
it('ignores failed/missing nodes and size pallets; diagnoses unknown dependencies', () => {
  expect(oracleCheck(level, { failed: { ...node(commute), ok: false }, absent: { deps: [], ok: true }, size: node({ k: 'size', n: 9 }) }, [])).toEqual([]);
  expect(oracleCheck(level, { missing: node(commute, ['g:unknown', 'a:unknown']) }, [])[0]).toMatch(/unresolved dependencies/);
});
it('restricts models by dependency size, rather than every level given', () => {
  const l = { ...level, givens: [{ id: 's', name: 'size', fact: { k: 'size' as const, n: 7 } }] };
  expect(oracleCheck(l, { commute: node(commute, ['g:s']) }, [])).toEqual([]);
  expect(oracleCheck(l, { commute: node(commute) }, [])).toHaveLength(1);
});

import { nontrivialModels } from './oracle';
import { mkLevel } from '../kernel/testkit';
describe('nontrivialModels (authoring helper)', () => {
  it('counts models of the allowed givens with |G| ≥ 2 and some named element ≠ e; flags near-vacuous levels', () => {
    const a = { k: 'atom' as const, id: 'a' }, e = { k: 'e' as const };
    const rich = mkLevel({ givens: [{ id: 'g', name: 'g', fact: { k: 'eq', l: { k: 'mul', fs: [a, a] }, r: e } }], sockets: [{ id: 's', target: { k: 'eq', l: a, r: { k: 'inv', arg: a } }, allowedGivens: ['g'] }] });
    expect(nontrivialModels(rich, 's').ok).toBe(true);
    const vacuous = mkLevel({ givens: [{ id: 'g', name: 'g', fact: { k: 'eq', l: a, r: e } }], sockets: [{ id: 's', target: { k: 'eq', l: a, r: a }, allowedGivens: ['g'] }] });
    expect(nontrivialModels(vacuous, 's')).toMatchObject({ count: 0, ok: false, threshold: 10 });
    const members = mkLevel({ subgroups: [{ id: 'H', label: 'H' }], givens: [{ id: 'g', name: 'g', fact: { k: 'mem', t: a, sub: { k: 'sub', id: 'H' } } }], sockets: [{ id: 's', target: { k: 'mem', t: e, sub: { k: 'sub', id: 'H' } }, allowedGivens: ['g'] }] } as never);
    expect(nontrivialModels(members, 's').count).toBeGreaterThan(10);
  });
});
