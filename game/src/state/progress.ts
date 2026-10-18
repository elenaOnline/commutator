// COMMUTATOR — campaign progression, pure (no DOM, no store). UI-lead owned.
//
// The save keeps one CampaignSave per campaign (factoryStore.ts). These helpers read a save in either the
// namespaced shape ({ campaigns }) or a flat one ({ levels }, e.g. a test fixture), so callers never care.
//
// Opening rules:
//   main: the first order is open; any other opens when every main order it `uses` is solved (unchanged).
//   book: worlds open in book order, a world when every main level of the previous (non-empty) world is
//         solved. Inside an open world, main levels open one after another; side levels open with their world.
import type { LevelManifest } from '../kernel/types';
import { CAMPAIGN_LEVELS, LEVEL_BY_ID, bookWorlds, campaignOf, type Campaign } from '../levels/campaigns';

type Prog = { solvedAt?: number } | undefined;
export type SaveLike =
  | { campaigns: Record<string, { levels: Record<string, Prog> } | undefined> }
  | { levels: Record<string, Prog> };

/** Progress record of a level, wherever the save keeps it. */
export function levelsOf(save: SaveLike, c: Campaign): Record<string, Prog> {
  return 'campaigns' in save ? save.campaigns[c]?.levels ?? {} : save.levels;
}
export const isSolved = (save: SaveLike, id: string): boolean => !!levelsOf(save, campaignOf(id))[id]?.solvedAt;

// A hidden play-testing switch (⌥⇧U in the game, or ?unlock=1): every level of both campaigns is open.
let unlockAllLevels = false;
export const setUnlockAll = (on: boolean): void => { unlockAllLevels = on; };
export const isUnlockAll = (): boolean => unlockAllLevels;

export function isOpen(save: SaveLike, lv: LevelManifest): boolean {
  if (unlockAllLevels) return true;
  const c = campaignOf(lv);
  const all = CAMPAIGN_LEVELS[c];
  if (c === 'book') {
    const ws = bookWorlds();
    const wi = ws.findIndex((w) => w.world === (lv.world ?? 0));
    if (wi < 0) return false;
    if (wi > 0 && !ws[wi - 1]!.main.every((l) => isSolved(save, l.id))) return false;
    if (lv.side) return true;
    const mains = ws[wi]!.main;
    const i = mains.indexOf(lv);
    return i <= 0 || isSolved(save, mains[i - 1]!.id);
  }
  if (lv.id === all[0]?.id) return true;
  return lv.uses.filter((u) => !LEVEL_BY_ID[u]?.side).every((u) => isSolved(save, u));
}

/**
 * The order to suggest next in a campaign (default: the campaign of `after`, else main). After a side order,
 * another open side order first; otherwise the next unsolved open main order after `after`, wrapping around.
 */
export function nextLevel(save: SaveLike, after?: string, campaign?: Campaign): LevelManifest | null {
  const c = campaign ?? (after ? campaignOf(after) : 'main');
  const all = CAMPAIGN_LEVELS[c];
  const main = all.filter((l) => !l.side);
  if (after && LEVEL_BY_ID[after]?.side) {
    // in the Book, a side order hands on to its own world's side orders only
    const w = LEVEL_BY_ID[after]!.world;
    const side = all.filter((l) => l.side && l.id !== after && (c !== 'book' || l.world === w) && isOpen(save, l) && !isSolved(save, l.id));
    if (side.length) return side[0]!;
  }
  let start = 0;
  if (after) {
    const al = LEVEL_BY_ID[after];
    if (al && !al.side) start = main.indexOf(al) + 1;
    else if (al && c === 'book') start = main.findIndex((l) => (l.world ?? 0) > (al.world ?? 0)); // after a side level: its world's successors
    if (start < 0) start = 0;
  }
  const order = [...main.slice(start), ...main.slice(0, start)];
  return order.find((l) => isOpen(save, l) && !isSolved(save, l.id)) ?? null;
}

/** Main levels of a campaign, and how many are solved. */
export function tally(save: SaveLike, c: Campaign): { solved: number; total: number } {
  const main = CAMPAIGN_LEVELS[c].filter((l) => !l.side);
  return { solved: main.filter((l) => isSolved(save, l.id)).length, total: main.length };
}
