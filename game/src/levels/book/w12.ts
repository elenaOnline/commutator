// THE BOOK · World 12 — see design/pinter/SYNTHESIS.md §3 and design/pinter/AUTHOR-BRIEF.md.
import type { LevelManifest } from '../../kernel/types';
import type { ConceptCard } from '../cards';

export const LEVELS: LevelManifest[] = [];
/** Concept cards for this world's levels, keyed by level id. */
export const CARDS: Record<string, ConceptCard[]> = {};
