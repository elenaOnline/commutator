// COMMUTATOR v4 — hotbar presets: a verb armed with a recipe ("Rewriter · cancel", "Witness").
// Earned theorems and Lemma Book entries appear automatically; any recipe can be pinned from the lens.
// Placing with a preset: the floor places the verb; the HUD configures its recipe on the 'edited' event.
import type { LibRef, MachineConfig, MachineKind } from '../factory/types';
import { recipeKey, type AnyRecipe } from './library';
import { REGISTRY, safe, type S, type Store } from './util';

export interface Preset { key: string; kind: MachineKind; recipe: AnyRecipe; label: string; pinned?: boolean; earned?: boolean }

const KEY = 'commutator/hud-presets';
const SHORT: Record<string, string> = { witness: 'Witness', cancel: 'Lathe', socks: 'Socks', nofix: 'Gate', dbl: 'Flip' };

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

/** Earned theorems and Lemma Book entries as presets (one per theorem; the ᵒᵖ hand is in the lens). */
export function earnedPresets(s: S): Preset[] {
  const out: Preset[] = [];
  for (const id of s.ctx.level.tools.schemas) {
    const sc = s.ctx.registry[id];
    if (!sc || sc.origin === 'import' || id.startsWith('power.')) continue;
    const ref: LibRef = { k: 'schema', id };
    const label = SHORT[id] ?? (sc.origin === 'authored' ? sc.name : (REGISTRY[id]?.name ?? sc.name).split(' ')[0]!);
    if (sc.card.k === 'cond') out.push({ key: presetKey('theorem', { k: 'library', ref }), kind: 'theorem', recipe: { k: 'library', ref }, label, earned: true });
    else out.push({ key: presetKey('rewriter', { k: 'law', ref }), kind: 'rewriter', recipe: { k: 'law', ref }, label, earned: true });
  }
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
