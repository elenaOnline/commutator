// The recipe picker's library (review 2026-10): renamed groups, no origin notes, merged rows with toggles.
import { describe, expect, it } from 'vitest';
import { LEVEL_BY_ID } from '../levels/levels';
import { ctxFor } from '../state/factoryStore';
import { GROUP_ORDER, entryFor, libraryFor } from './library';
import type { S } from './util';

const stateFor = (id: string, earned: string[]): S => {
  const level = LEVEL_BY_ID[id]!;
  return { level, ctx: ctxFor(level, earned, []), canvas: { machines: [], belts: [], rooms: [] }, compiled: null } as unknown as S;
};

describe('recipe library', () => {
  it('uses the review group names, in order', () => {
    expect(GROUP_ORDER).toEqual(['Operations', 'Group laws', 'Given here', 'Theorems', 'Saved', 'Imported', 'Made here']);
  });
  it('rewriter: one insert-pair row with an orientation toggle; no origin notes', () => {
    const lib = libraryFor(stateFor('L03', []), 'rewriter');
    expect(lib.filter((e) => e.name.startsWith('insert pair'))).toHaveLength(1);
    const pair = lib.find((e) => e.key === 'pair')!;
    expect(pair.sides).toEqual({ k: 'orient' });
    expect(pair.group).toBe('Group laws');
    expect(lib.find((e) => e.key === 'routed')?.group).toBe('Made here');
    for (const e of lib) expect(e.note ?? '').not.toMatch(/earned|imported|Lemma Book|proven/);
    expect(entryFor(stateFor('L03', []), 'rewriter', { k: 'insertPair', inv: true, x: { k: 'knob', term: null } })?.key).toBe('pair');
  });
  it('theorem: one row per mirror pair, named by family, with both sides named', () => {
    const s = stateFor('L06', ['witness', 'cancel']);
    const lib = libraryFor(s, 'theorem');
    const w = lib.find((e) => e.key === 'schema:witness')!;
    expect(w.nameHTML).toBe('unique inverse');
    expect(w.group).toBe('Theorems');
    expect(w.sides?.k).toBe('mirror');
    if (w.sides?.k === 'mirror') { expect(w.sides.plain.name).toBe('unique right inverse'); expect(w.sides.op.name).toBe('unique left inverse'); }
    expect(lib.find((e) => e.key === 'schema:cancel')?.nameHTML).toBe('cancellation');
    expect(lib.some((e) => e.key.endsWith(':op'))).toBe(false);
    expect(entryFor(s, 'theorem', { k: 'library', ref: { k: 'schema', id: 'cancel', mirror: true } })?.key).toBe('schema:cancel');
  });
});
