// COMMUTATOR — the two campaigns as one lookup. UI-lead owned (design/pinter/SYNTHESIS.md §2.1, §4).
//   'main': the original 21-level campaign (levels.ts), the short introduction.
//   'book': The Book, Pinter's chapters worked in order (book/index.ts, one file per world).
// Ids never collide ('L…'/'T…'/'S…'/'R…'/'B…' vs 'P…'). Importing this module registers every Book level in
// levels.ts's LEVEL_BY_ID, so the factory and kernel lookups (lemma re-verification, geometry, metrics) see both
// campaigns. levels.ts itself never imports the Book, so a world file may import from '../levels' without a cycle.
import type { LevelManifest } from '../kernel/types';
import { LEVELS, LEVEL_BY_ID } from './levels';
import { CARDS, type ConceptCard } from './cards';
import { BOOK_CARDS, BOOK_LEVELS, BOOK_WORLDS } from './book';
import { letterSlot } from '../ui/letters';

export type Campaign = 'main' | 'book';
export const CAMPAIGNS: Campaign[] = ['main', 'book'];
/** Display names for the map's campaign switch. */
export const CAMPAIGN_NAMES: Record<Campaign, string> = { main: 'Commutator', book: 'The Book' };

// The Book: a letter keeps its bead shape on every floor, lens and card (playtest W1–3 #16): the shape slot comes
// from the letter itself, not from where the author listed it.
for (const l of BOOK_LEVELS) for (const a of l.atoms) if (!a.variable) a.hue = letterSlot(a.label);
for (const l of BOOK_LEVELS) {
  const prev = LEVEL_BY_ID[l.id];
  if (prev && prev !== l) console.warn(`[campaigns] level id ${l.id} is declared twice`);
  else LEVEL_BY_ID[l.id] = l;
}

export const CAMPAIGN_LEVELS: Record<Campaign, LevelManifest[]> = { main: LEVELS, book: BOOK_LEVELS };
/** Every level of both campaigns (main first). */
export const ALL_LEVELS: LevelManifest[] = [...LEVELS, ...BOOK_LEVELS];
/** Concept cards of both campaigns, keyed by level id. */
export const ALL_CARDS: Record<string, ConceptCard[]> = { ...CARDS, ...BOOK_CARDS };
export { BOOK_WORLDS, LEVEL_BY_ID };

/** The campaign a level (or level id) belongs to. Unknown 'P…' ids are Book ids (a removed Book level). */
export function campaignOf(lv: LevelManifest | string | null | undefined): Campaign {
  if (!lv) return 'main';
  const l = typeof lv === 'string' ? LEVEL_BY_ID[lv] : lv;
  if (l) return l.campaign === 'book' ? 'book' : 'main';
  return typeof lv === 'string' && /^P\d/.test(lv) ? 'book' : 'main';
}

/** The Book's worlds that have levels, in order, with their main and side levels (in campaign order). */
export function bookWorlds(): { world: number; title: string; chapters: string; main: LevelManifest[]; side: LevelManifest[] }[] {
  const ns = [...new Set(BOOK_LEVELS.map((l) => l.world ?? 0))].sort((a, b) => a - b);
  return ns.map((w) => {
    const ls = BOOK_LEVELS.filter((l) => (l.world ?? 0) === w);
    const meta = BOOK_WORLDS[w] ?? { title: `World ${w}`, chapters: '' };
    return { world: w, title: meta.title, chapters: meta.chapters, main: ls.filter((l) => !l.side), side: ls.filter((l) => l.side) };
  });
}

/**
 * The number a level shows on its badge. Main campaign: its index, side orders S1, S2 … after the main count.
 * The Book: main levels 1 … n in book order, side levels S1 … in book order (authors' `index` is not trusted
 * to be dense while worlds are still landing).
 */
export function displayNo(lv: LevelManifest): string {
  if (campaignOf(lv) === 'book') {
    const pool = BOOK_LEVELS.filter((l) => !!l.side === !!lv.side);
    const i = pool.indexOf(lv) + 1;
    return lv.side ? `S${i}` : String(i);
  }
  return lv.side ? `S${lv.index - LEVELS.filter((l) => !l.side).length}` : String(lv.index);
}
