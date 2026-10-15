// Shared helpers for the reference-solution tests of Book worlds 8–9 (P10.x, P11.x). Not a test file.
import type { LevelManifest } from '../../src/kernel/types';
import { LEVELS as W08 } from '../../src/levels/book/w08';
import { LEVELS as W09 } from '../../src/levels/book/w09';

export * from './kit-w123';

export const BOOK_89: LevelManifest[] = [...W08, ...W09];
export const lv89 = (id: string): LevelManifest => {
  const l = BOOK_89.find((x) => x.id === id);
  if (!l) throw new Error(`no Book level ${id}`);
  return l;
};
