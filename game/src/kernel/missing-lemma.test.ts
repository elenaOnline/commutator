// A floor citing a saved lemma that is switched off (or gone) names it by its display name and says why — never
// the raw schema id (playtest: "There is no theorem “lemma:fibre-implies-1”." on P16.2).
import { describe, expect, it } from 'vitest';
import { schemaCard, missingTheorem } from './logic';
import { ctxFor, type SavedLemma } from '../state/factoryStore';
import { LEVEL_BY_ID } from '../levels/levels';

describe('disabled and missing lemmas', () => {
  const level = LEVEL_BY_ID.L03!;
  const card = { k: 'law' as const, metas: ['x'], l: { k: 'meta' as const, id: 'x' }, r: { k: 'meta' as const, id: 'x' } };
  const lemma = (id: string, name: string, extra: Partial<SavedLemma> = {}): SavedLemma =>
    ({ id, name, card, levelId: 'L03', canvas: { machines: [], belts: [], rooms: [] } as never, machine: 'm', savedAt: 1, ...extra });

  it('a disabled lemma: its display name and the reason it is off', () => {
    const ctx = ctxFor(level, [], [lemma('lemma:fibre-implies-1', 'fibre lemma ⟹', { verified: false, reason: 'It uses “f(e) = e”, which is disabled.' })]);
    expect(ctx.registry['lemma:fibre-implies-1']).toBeUndefined();
    expect(() => schemaCard('lemma:fibre-implies-1', false, ctx)).toThrow('The lemma “fibre lemma ⟹” isn\'t available. It uses “f(e) = e”, which is disabled.');
  });

  it('a lemma gone from the book, and an unknown theorem', () => {
    const ctx = ctxFor(level, [], []);
    expect(missingTheorem('lemma:gone-2', ctx)).toBe('This floor uses a saved lemma that is no longer in your Lemma Book.');
    expect(missingTheorem('lemma:gone-2', ctx)).not.toMatch(/lemma:/);
    const off = ctxFor(level, [], [lemma('lemma:a-1', 'A', { verified: false })]);
    expect(missingTheorem('lemma:a-1', off)).toBe('The lemma “A” isn\'t available. It is disabled in your Lemma Book.');
  });
});
