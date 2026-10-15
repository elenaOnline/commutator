// COMMUTATOR — sorts as the player sees them (Book phase C; NORMS › Floor › Sorts). A fact lives in one group (or
// a set). In a level with more than one sort, items wear their sort on their tray (a pale ground tint, a hairline
// in the sort's ink, the sort's name as a small tag); the level's first group stays white and untagged, so a
// one-group level looks exactly as before. Identity is written e_G, e_K once the level has two groups.
import * as K from '../kernel';
import type { LevelManifest, ProofGraph, Term } from '../kernel/types';

export interface SortStyle { id: string; label: string; kind: 'group' | 'set'; fill: string; ring: string; ink: string; plain: boolean }

/** Pale grounds for the second, third … group, and for sets: never a mechanic's ink. */
const GROUP_GROUNDS = [
  { fill: '#F5EDDA', ring: '#B89B5E', ink: '#6B5320' }, // sand
  { fill: '#E6EDF6', ring: '#7C93B5', ink: '#34507A' }, // slate-blue
  { fill: '#EEF0E4', ring: '#8E9A66', ink: '#4F5A2B' }, // reed
];
const SET_GROUND = { fill: '#EFEFEF', ring: '#9A9A9A', ink: '#4A4A4A' };
const PLAIN = { fill: '#FFFFFF', ring: '#FFFFFF', ink: '#1B2340' };

export interface SortCtx {
  /** More than one sort in play: trays are tinted and tagged. */
  multi: boolean;
  /** Two or more GROUP sorts: e is written with its group (e_G). */
  eTags: boolean;
  env: K.SortEnv | null;
  styles: Map<string, SortStyle>;
  /** The level's first group (untinted). */
  base: string;
}
const EMPTY: SortCtx = { multi: false, eTags: false, env: null, styles: new Map(), base: K.DEFAULT_GROUP };
/** The current floor's sorts (set by the app on every render, like the Tower labels). */
export const sortCtx: { cur: SortCtx } = { cur: EMPTY };

/** Sort styles for a level, after the floor's group and Hom Towers are merged in (K.withVars). */
export function sortStylesOf(level: LevelManifest): SortCtx {
  const env = (() => { try { return K.sortEnv(level); } catch { return null; } })();
  if (!env || !env.multi || env.sorts.size < 2) return { ...EMPTY, env };
  const styles = new Map<string, SortStyle>();
  let gi = 0;
  const groups = [...env.sorts.values()].filter((s) => s.kind === 'group');
  const base = env.sorts.has(K.DEFAULT_GROUP) ? K.DEFAULT_GROUP : groups[0]?.id ?? K.DEFAULT_GROUP;
  for (const s of env.sorts.values()) {
    const plain = s.id === base;
    const g = plain ? PLAIN : s.kind === 'set' ? SET_GROUND : GROUP_GROUNDS[gi++ % GROUP_GROUNDS.length]!;
    styles.set(s.id, { id: s.id, label: s.label, kind: s.kind, ...g, plain });
  }
  return { multi: true, eTags: groups.length >= 2, env, styles, base };
}

/** Set the current floor's sort context from its level and compiled graph (Towers declare groups and homs). */
export function setSortCtx(ctx: K.KernelCtx | null | undefined, graph?: ProofGraph | null): SortCtx {
  if (!ctx) { sortCtx.cur = EMPTY; return EMPTY; }
  let level = ctx.level;
  try { level = K.withVars(ctx, graph ?? null).ctx.level; } catch { /* the level alone */ }
  sortCtx.cur = sortStylesOf(level);
  return sortCtx.cur;
}

/** An action's application σ(g, p) reads g(p) — the group element applied to the point (Pinter; KERNEL-EXT §5.11). */
export function isActionApp(t: Term, c: SortCtx = sortCtx.cur): boolean {
  return t.k === 'app' && t.args.length === 2 && (c.env?.maps.get(t.fn)?.kind ?? 'map') === 'action';
}
/** The sort of a term in the current context (null when unsortable or one-sorted). */
export function sortOfTerm(t: Term, c: SortCtx = sortCtx.cur): string | null {
  if (!c.multi || !c.env) return null;
  try { return K.sortOf(t, c.env); } catch { return null; }
}
/** The style an item of term t wears (null = the plain white tray). */
export function styleOfTerm(t: Term, c: SortCtx = sortCtx.cur): SortStyle | null {
  const s = sortOfTerm(t, c);
  const st = s ? c.styles.get(s) : undefined;
  return st && !st.plain ? st : null;
}
/** While a card is typeset, its group parameters' display names (S → G, T → K): identity tags follow them. */
export const eAliases: { cur: Record<string, string> } = { cur: {} };
/** The subscript an identity shows: its own sort, or the base group's when two groups are in play. */
export function eTag(t: { k: 'e'; s?: string }, c: SortCtx = sortCtx.cur): string | null {
  // a positional Lemma Book binder ($1:K) prints by its name (#6)
  if (t.s && eAliases.cur[t.s]) return eAliases.cur[t.s]!;
  if (t.s) return c.styles.get(t.s)?.label ?? (c.env?.sorts.has(t.s) ? c.env.label(t.s) : null) ?? t.s.replace(/^\$\d+:/, '');
  return c.eTags ? (c.styles.get(c.base)?.label ?? c.base) : null;
}
