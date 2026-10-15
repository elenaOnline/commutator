// COMMUTATOR v4 — hotbar presets: a verb armed with a recipe ("Rewriter · cancel", "unique inverse").
// Earned theorems and Lemma Book entries appear automatically; any recipe can be pinned from the lens.
// Placing with a preset: the floor places the verb; the HUD configures its recipe on the 'edited' event.
import type { LibRef, MachineConfig, MachineKind } from '../factory/types';
import { recipeKey, type AnyRecipe } from './library';
import { REGISTRY, safe, type S, type Store } from './util';
import * as K from '../kernel';
import type { Card } from '../kernel/types';
import { familyName } from './merge';

export interface Preset { key: string; kind: MachineKind; recipe: AnyRecipe; label: string; pinned?: boolean; earned?: boolean }

const KEY = 'commutator/hud-presets';

export const presetKey = (kind: MachineKind, r: AnyRecipe) => `${kind}|${recipeKey(r)}`;

export function pinned(): Preset[] {
  return safe(() => JSON.parse(localStorage.getItem(KEY) ?? '[]') as Preset[], []);
}
export function pin(p: Preset) {
  const all = pinned().filter((x) => x.key !== p.key);
  all.push({ ...p, pinned: true });
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
}
export function unpin(key: string) {
  try { localStorage.setItem(KEY, JSON.stringify(pinned().filter((x) => x.key !== key))); } catch { /* ignore */ }
}
export const isPinned = (key: string) => pinned().some((x) => x.key === key);

/** The same statement, up to renaming its variables, the order of its premises, and (for a law) its two sides. */
export function sameStatement(a: Card, b: Card): boolean {
  if (safe(() => K.sameCardUpToPermutation(a, b), false)) return true;
  if (a.k === 'law' && b.k === 'law') return safe(() => K.sameCardUpToRenaming(a, { ...b, l: b.r, r: b.l }), false);
  if (a.k === 'cond' && b.k === 'cond' && b.concl.k !== 'mem') {
    const c = b.concl;
    return safe(() => K.sameCardUpToPermutation(a, { ...b, concl: { k: c.k, l: c.r, r: c.l } }), false);
  }
  return false;
}

/**
 * Earned theorems and Lemma Book entries as presets (one per theorem; the side toggle is in the lens), with
 * standard names. A lemma that restates a theorem already earned (or saved earlier) is the same machine: it
 * appears once, under the earned theorem's standard name.
 */
export function earnedPresets(s: S): Preset[] {
  const out: Preset[] = [];
  const cards: Card[] = [];
  for (const id of s.ctx.level.tools.schemas) {
    const sc = s.ctx.registry[id];
    if (!sc || sc.origin === 'import' || id.startsWith('power.')) continue;
    if (cards.some((c) => sameStatement(c, sc.card))) continue;
    cards.push(sc.card);
    const ref: LibRef = { k: 'schema', id };
    const label = sc.origin === 'authored' ? sc.name : familyName(id, REGISTRY[id]?.name ?? sc.name);
    if (sc.card.k === 'cond') out.push({ key: presetKey('theorem', { k: 'library', ref }), kind: 'theorem', recipe: { k: 'library', ref }, label, earned: true });
    else out.push({ key: presetKey('rewriter', { k: 'law', ref }), kind: 'rewriter', recipe: { k: 'law', ref }, label, earned: true });
  }
  return out;
}

/** How many earned / saved theorems ride on the hotbar; the rest live in the All drawer (and pinned ones stay). */
export const HOTBAR_RECENT = 3;
/** The hotbar's theorem slots: the most recent few, then anything pinned. The All drawer lists every one. */
export function hotbarPresets(s: S): Preset[] {
  const all = earnedPresets(s);
  const out = all.slice(-HOTBAR_RECENT);
  for (const p of pinned()) if (!out.some((q) => q.key === p.key)) out.push(all.find((q) => q.key === p.key) ?? p);
  return out;
}

/** The preset waiting to configure the next placed machine of its kind. */
export const pending: { preset: Preset | null } = { preset: null };

export function armPreset(store: Store, p: Preset) {
  store.setTool({ k: 'place', kind: p.kind });
  pending.preset = p;
}

/** The machine config with this recipe applied (resetting the choice of a theorem). */
export function withRecipe(config: MachineConfig, recipe: AnyRecipe): MachineConfig {
  const c = config as MachineConfig & { recipe?: unknown };
  if (c.kind === 'carddock') return { ...c, ref: (recipe as { ref?: LibRef }).ref ?? null };
  if (c.kind === 'theorem') return { ...c, recipe: recipe as never, choice: 0 };
  if (c.kind === 'rewriter' || c.kind === 'operator' || c.kind === 'joiner') return { ...c, recipe: recipe as never } as MachineConfig;
  return config;
}
