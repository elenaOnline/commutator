// Shared helpers for the phase-A levels scattered over Book worlds 4, 6, 7, 10, 11, 13 and 14 (P5.x, P7.1, P8.1, P9.s1,
// P12.2, P12.s1, P13.2–P13.s1, P15.4, P16.s1–s3). Not a test file.
import type { LevelManifest } from '../../src/kernel/types';
import { LEVELS as W04 } from '../../src/levels/book/w04';
import { LEVELS as W06 } from '../../src/levels/book/w06';
import { LEVELS as W07 } from '../../src/levels/book/w07';
import { LEVELS as W10 } from '../../src/levels/book/w10';
import { LEVELS as W11 } from '../../src/levels/book/w11';
import { LEVELS as W13 } from '../../src/levels/book/w13';
import { LEVELS as W14 } from '../../src/levels/book/w14';

import { MEMBERS_IDS } from './members-ids';
import { MAPS_IDS } from './maps-ids';
import { WZ_IDS } from './wZ-ids';

export * from './kit-w123';

/** The phase-A levels of those worlds (the Members levels P5.1, P5.4, P12.1, P13.1 are in kit-members; the Maps levels are in kit-wC). */
export const BOOK_A: LevelManifest[] = [...W04, ...W06, ...W07, ...W10, ...W11, ...W13, ...W14].filter((l) => !MEMBERS_IDS.includes(l.id) && !MAPS_IDS.includes(l.id) && !WZ_IDS.includes(l.id));
export const lvA = (id: string): LevelManifest => {
  const l = BOOK_A.find((x) => x.id === id);
  if (!l) throw new Error(`no phase-A Book level ${id}`);
  return l;
};

/** deliver() without the par assertions, logging the measured `PAR <id> <parts> <axioms>` (authoring aid; tests then use deliver()). */
import { deliver as deliverRaw } from './kit-w123';
export function measured(f: Parameters<typeof deliverRaw>[0]) {
  const r = deliverRaw(f, { parParts: false });
  console.log('PAR', f.level.id, r.parts, r.axioms);
  return r;
}
