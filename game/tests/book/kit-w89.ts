// Shared helpers for the reference-solution tests of Book worlds 8–9 (P10.x, P11.x). Not a test file.
import type { LevelManifest } from '../../src/kernel/types';
import { LEVELS as W08 } from '../../src/levels/book/w08';
import { LEVELS as W09 } from '../../src/levels/book/w09';

import { MEMBERS_IDS } from './members-ids';

export * from './kit-w123';

/** Worlds 8–9 without the Members level P11.1 (that one is in kit-members). */
export const BOOK_89: LevelManifest[] = [...W08, ...W09].filter((l) => !MEMBERS_IDS.includes(l.id));
export const lv89 = (id: string): LevelManifest => {
  const l = BOOK_89.find((x) => x.id === id);
  if (!l) throw new Error(`no Book level ${id}`);
  return l;
};
