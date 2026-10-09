// Merged recipes (review 2026-10): one picker row per mirror pair / insert pair; the toggle in the recipe
// section writes only LibRef.mirror / insertPair.inv, so configs, saves and the compiler are unchanged.
import { describe, expect, it } from 'vitest';
import { SIDE_PAIRS } from '../levels/levels';
import { entryKeyOf, familyName, isMirrored, sideName, sidePairOf, withOrientation, withSide } from './merge';
import type { TheoremRecipe } from '../factory/types';

describe('merged recipes', () => {
  const plain: TheoremRecipe = { k: 'library', ref: { k: 'schema', id: 'witness' } };

  it('the side toggle sets LibRef.mirror and nothing else', () => {
    const op = withSide(plain, true);
    expect(op).toEqual({ k: 'library', ref: { k: 'schema', id: 'witness', mirror: true } });
    expect(isMirrored(op)).toBe(true);
    const back = withSide(op, false);
    expect(back).toEqual(plain); // no mirror flag at all: exactly the pre-merge plain config
    expect('mirror' in (back as { ref: object }).ref).toBe(false);
    expect(isMirrored(back)).toBe(false);
  });

  it('toggling never touches a ref that is not a schema', () => {
    const given: TheoremRecipe = { k: 'library', ref: { k: 'given', givenId: 'h' } };
    expect(withSide(given, true)).toBe(given);
  });

  it('the orientation toggle sets insertPair.inv and keeps x', () => {
    const r = { k: 'insertPair' as const, inv: false, x: { k: 'knob' as const, term: { k: 'atom' as const, id: 'a' } } };
    expect(withOrientation(r, true)).toEqual({ ...r, inv: true });
  });

  it('both sides and both orientations find the same picker row', () => {
    expect(entryKeyOf('schema:witness:op')).toBe('schema:witness');
    expect(entryKeyOf('schema:witness')).toBe('schema:witness');
    expect(entryKeyOf('pairInv')).toBe('pair');
    expect(entryKeyOf('pair')).toBe('pair');
    expect(entryKeyOf('cancel')).toBe('cancel');
  });

  it('rows use the SIDE_PAIRS family; header and plate use the side’s full standard name', () => {
    for (const [id, p] of Object.entries(SIDE_PAIRS)) {
      expect(familyName(id, 'x')).toBe(p.family);
      expect(sideName(id, false, 'x')).toBe(p.plain);
      expect(sideName(id, true, 'x')).toBe(p.op);
    }
    expect(sideName('cancel', true, 'Cancel Lathe')).toBe('right cancellation');
    expect(sideName('witness', true, 'x')).toBe('unique left inverse');
    expect(sideName('socks', false, 'inverse of a product')).toBe('inverse of a product');
    expect(sidePairOf('socks')).toBeNull();
    for (const p of Object.values(SIDE_PAIRS)) expect(`${p.family} ${p.plain} ${p.op}`).not.toMatch(/ᵒᵖ/);
  });
});
