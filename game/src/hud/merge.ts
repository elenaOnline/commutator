// COMMUTATOR — merged recipes (review 2026-10, 7511891e + round 2 chat "merge theorem mirror pairs").
// Mirror pairs and the two insert-pair orientations are ONE picker row each, with a toggle in the recipe
// section. The toggle only rewrites the field that already existed (LibRef.mirror, insertPair.inv), so a
// configured machine, a save and the compiler see exactly what they saw before the merge.
import { SIDE_PAIRS } from '../levels/levels';
import type { LibRef } from '../factory/types';

type WithRef = { k: string; ref?: LibRef };

/** The SIDE_PAIRS entry for a schema id ('witness', 'cancel', …), or null when it has no named sides. */
export function sidePairOf(id: string | undefined): { family: string; plain: string; op: string } | null {
  return id ? SIDE_PAIRS[id] ?? null : null;
}

/** Is this recipe (or LibRef) on its mirrored side? */
export function isMirrored(r: WithRef | LibRef | null | undefined): boolean {
  if (!r) return false;
  const ref = 'ref' in r && r.ref ? r.ref : (r as LibRef);
  return ref.k === 'schema' && !!ref.mirror;
}

/** The same recipe on the chosen side: mirror → `ref.mirror: true`; plain → no mirror flag at all. */
export function withSide<R extends WithRef>(r: R, mirror: boolean): R {
  const ref = r.ref;
  if (!ref || ref.k !== 'schema') return r;
  const { mirror: _old, ...rest } = ref;
  void _old;
  return { ...r, ref: mirror ? { ...rest, mirror: true } : rest } as R;
}

/** The insert-pair recipe in the chosen orientation (inv: x⁻¹x, else x x⁻¹). */
export function withOrientation<R extends { k: 'insertPair'; inv: boolean }>(r: R, inv: boolean): R {
  return { ...r, inv };
}

/**
 * The picker row a configured recipe belongs to. Recipe keys (presets, pins) still tell the sides apart;
 * picker rows do not: 'schema:witness:op' → 'schema:witness', 'pairInv' → 'pair'.
 */
export function entryKeyOf(recipeKey: string): string {
  if (recipeKey === 'pairInv') return 'pair';
  return recipeKey.endsWith(':op') ? recipeKey.slice(0, -3) : recipeKey;
}

/** The full standard name of a side: SIDE_PAIRS when named, else the schema's own name (ᵒᵖ never shown). */
export function sideName(id: string, mirror: boolean, fallback: string): string {
  const p = sidePairOf(id);
  return p ? (mirror ? p.op : p.plain) : fallback;
}

/** The picker row's name for a mergeable schema: the pair's family ('cancellation'), else its own name. */
export function familyName(id: string, fallback: string): string {
  return sidePairOf(id)?.family ?? fallback;
}
