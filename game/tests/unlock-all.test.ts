// The hidden play-testing switch (⌥⇧U): every level open, each lent the theorems the levels before it earn.
import { afterEach, describe, expect, it } from 'vitest';
import { isOpen, setUnlockAll } from '../src/state/progress';
import { ctxForSave, emptyCampaign } from '../src/state/factoryStore';
import { CAMPAIGN_LEVELS } from '../src/levels/campaigns';

const fresh = () => ({ campaigns: { main: emptyCampaign(), book: emptyCampaign() } });

describe('unlock all', () => {
  afterEach(() => setUnlockAll(false));
  it('opens every level of both campaigns on a fresh save, and closes them again', () => {
    const all = [...CAMPAIGN_LEVELS.main, ...CAMPAIGN_LEVELS.book];
    expect(all.filter((l) => isOpen(fresh(), l)).length).toBeLessThan(all.length);
    setUnlockAll(true);
    expect(all.every((l) => isOpen(fresh(), l))).toBe(true);
    setUnlockAll(false);
    expect(all.filter((l) => isOpen(fresh(), l)).length).toBeLessThan(all.length);
  });
  it('lends a skipped-to level the theorems earlier levels earn', () => {
    const book = CAMPAIGN_LEVELS.book;
    const i = book.findIndex((l) => l.unlocks.includes('cancel'));
    const later = book.slice(i + 1).find((l) => !l.side)!;
    const save = fresh() as unknown as Parameters<typeof ctxForSave>[1];
    expect(ctxForSave(later, save).level.tools.schemas).not.toContain('cancel');
    setUnlockAll(true);
    expect(ctxForSave(later, save).level.tools.schemas).toContain('cancel');
  });
});
