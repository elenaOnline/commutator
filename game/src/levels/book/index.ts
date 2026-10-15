// THE BOOK — a second campaign that works through Pinter's *A Book of Abstract Algebra*, chapters 2–16.
// Design: design/pinter/SYNTHESIS.md (architect). One file per world (w01.ts … w14.ts), each exporting
// `LEVELS: LevelManifest[]` with campaign 'book'. Level ids: 'P<chapter>.<n>' (main) and 'P<chapter>.s<n>' (side).
// Every level ships with a reference factory solution in tests/book/ (built through the real editor).
import type { LevelManifest } from '../../kernel/types';
import type { ConceptCard } from '../cards';
import * as W01 from './w01';
import * as W02 from './w02';
import * as W03 from './w03';
import * as W04 from './w04';
import * as W05 from './w05';
import * as W06 from './w06';
import * as W07 from './w07';
import * as W08 from './w08';
import * as W09 from './w09';
import * as W10 from './w10';
import * as W11 from './w11';
import * as W12 from './w12';
import * as W13 from './w13';
import * as W14 from './w14';


/** World number → title (SYNTHESIS §3). */
export const BOOK_WORLDS: Record<number, { title: string; chapters: string }> = {
  1: { title: 'Groups', chapters: '2–3' },
  2: { title: 'First Theorems', chapters: '4' },
  3: { title: 'Group Algebra', chapters: '4' },
  4: { title: 'Subgroups', chapters: '5' },
  5: { title: 'Functions', chapters: '6' },
  6: { title: 'Permutations', chapters: '7–8' },
  7: { title: 'Isomorphism', chapters: '9' },
  8: { title: 'Order of Elements', chapters: '10' },
  9: { title: 'Cyclic Groups', chapters: '11' },
  10: { title: 'Equivalence Relations', chapters: '12' },
  11: { title: 'Lagrange', chapters: '13' },
  12: { title: 'Homomorphisms', chapters: '14' },
  13: { title: 'Quotient Groups', chapters: '15' },
  14: { title: 'The Fundamental Homomorphism Theorem', chapters: '16' },
};

/** All Book levels in campaign order. World files register here as they land. */
const WORLDS = [W01, W02, W03, W04, W05, W06, W07, W08, W09, W10, W11, W12, W13, W14];
export const BOOK_LEVELS: LevelManifest[] = WORLDS.flatMap((w) => w.LEVELS);
/** Book concept cards, keyed by level id (merged into the HUD's card lookup). */
export const BOOK_CARDS: Record<string, ConceptCard[]> = Object.assign({}, ...WORLDS.map((w) => w.CARDS));
