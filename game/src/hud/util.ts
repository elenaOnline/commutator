// LEMMA WORKS v3 — HUD helpers: DOM, guarded calls, campaign progress, catalogue access, floor anchors.
// Owner: HUD builder. Typesetting is reused from the v2 shell (import only; v2 folders stay untouched).
import * as F from '../factory';
import { rectToScreen } from '../floor/project';
import type { Family, LevelManifest, Term } from '../kernel/types';
import type { FactoryStore, FState } from '../state/factoryStore';
import { LEVELS, LEVEL_BY_ID, REGISTRY, MIRROR_NAMES } from '../levels/levels';
import type { ItemValue, Machine, MachineKind, MachineSpec } from '../factory/types';
import { FAMILY } from '../ui/tokens';
import { fH as fH0, tH as tH0 } from '../shell/util';

export { tH, fH, tU, richHTML, statementOf, schemaNames, schemaLemmaNo, nameHTML, labels } from '../shell/util';
export { LEVELS, LEVEL_BY_ID, REGISTRY, MIRROR_NAMES };

export type Store = FactoryStore;
export type S = FState;

// ───────── DOM ─────────
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | number | boolean | undefined | null> = {}, ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'html') el.innerHTML = String(v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Call a function from a concurrently-built module; quiet fallback while it is still a stub. */
export function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch (err) {
    if (!(err instanceof Error) || !/not implemented/.test(err.message)) console.warn('[hud]', err);
    return fallback;
  }
}

// ───────── campaign progress (v3 save) ─────────
type SaveLike = { levels: Record<string, { solvedAt?: number } | undefined> };
export const MAIN = LEVELS.filter((l) => !l.side);
export const isSolved = (save: SaveLike, id: string) => !!save.levels[id]?.solvedAt;
export function isOpen(save: SaveLike, lv: LevelManifest): boolean {
  if (lv.id === LEVELS[0]!.id) return true;
  return lv.uses.filter((u) => !LEVEL_BY_ID[u]?.side).every((u) => isSolved(save, u));
}
export function nextLevel(save: SaveLike, after?: string): LevelManifest | null {
  if (after && LEVEL_BY_ID[after]?.side) {
    const side = LEVELS.filter((l) => l.side && l.id !== after && isOpen(save, l) && !isSolved(save, l.id));
    if (side.length) return side[0]!;
  }
  const start = after && !LEVEL_BY_ID[after]?.side ? MAIN.findIndex((l) => l.id === after) + 1 : 0;
  const order = [...MAIN.slice(start), ...MAIN.slice(0, start)];
  return order.find((l) => isOpen(save, l) && !isSolved(save, l.id)) ?? null;
}
export const CHAPTERS: Record<number, { roman: string; name: string }> = {
  1: { roman: 'I', name: 'The Works' },
  2: { roman: 'II', name: 'Suppose' },
  3: { roman: 'III', name: 'Clockwork' },
};

export const hues = (level: LevelManifest): Record<string, number> => Object.fromEntries(level.atoms.map((a) => [a.id, a.hue]));

// ───────── catalogue ─────────
export const FAMILY_ORDER: Family[] = ['equation', 'inverse', 'identity', 'given', 'structure', 'lemma', 'contradiction', 'scope'];

const FALLBACK: Partial<Record<MachineKind, MachineSpec>> = {
  spool: { kind: 'spool', name: 'Spool', family: 'equation', glyph: 't=t', blurb: 'reflexivity: from a term t, emit t = t', hotkey: '1', placeable: true },
  canceller: { kind: 'canceller', name: 'Canceller', family: 'inverse', glyph: 'xx⁻¹', blurb: 'x x⁻¹ → e at the bracket', hotkey: '2', placeable: true },
};
export function spec(kind: MachineKind): MachineSpec {
  const s = (F.SPECS as Partial<Record<MachineKind, MachineSpec>> | undefined)?.[kind] ?? FALLBACK[kind];
  return s ?? { kind, name: kind[0]!.toUpperCase() + kind.slice(1), family: 'equation', glyph: '?', blurb: '', placeable: true };
}
export const hotbarKinds = (): MachineKind[] => safe(() => [...F.HOTBAR], ['spool', 'canceller', 'expander', 'popper', 'rewriter', 'multiplier', 'swapper', 'meet', 'apply', 'anvil']);
export const drawerKinds = (): MachineKind[] => safe(() => [...F.DRAWER], ['press', 'hopper', 'joiner', 'inverter']);

/** Static "in → out" reading for hover cards (fallback when ports are not computable). */
export const IO: Partial<Record<MachineKind, [string, string]>> = {
  spool: ['term t (knob or port)', 'equation t = t'],
  canceller: ['equation', 'equation'],
  expander: ['equation · [rule] · [term x]', 'equation'],
  popper: ['equation', 'equation'],
  rewriter: ['equation · rule (equation or law) · [terms]', 'equation'],
  multiplier: ['equation · [term t]', 'equation'],
  swapper: ['equation or inequation', 'the same, sides exchanged'],
  meet: ['two equations with a common right side', 'equation'],
  apply: ['card · premises', 'equation or inequation'],
  anvil: ['equation · inequation', '⊥'],
  press: ['|G| = n', 'law ∀x. xⁿ = e'],
  hopper: ['—', 'term'],
  joiner: ['term · term', 'term'],
  inverter: ['term', 'term'],
  stamp: ['premise equation(s)', 'conclusion'],
  carddock: ['—', 'law card'],
};
export const KIND_WORD: Record<string, string> = { term: 'term', eq: 'equation', neq: 'inequation', bot: '⊥', size: '|G| = n', law: 'law', cond: 'card' };

export function familyInk(f: Family) { return FAMILY[f]; }

/** Display name of a machine on the canvas (earned machines carry their theorem's name). */
export function machineName(m: Pick<Machine, 'kind' | 'config'>): string {
  const c = m.config;
  if ((c.kind === 'stamp' || c.kind === 'carddock') && c.schema) {
    const s = REGISTRY[c.schema];
    if (s) return c.mirror ? (MIRROR_NAMES[c.schema]?.name ?? `${s.name} ᵒᵖ`) : s.name;
  }
  return spec(m.kind).name;
}

// ───────── items as maths ─────────
export function itemHTML(v: ItemValue | undefined, L: Record<string, string>): string {
  if (!v) return '';
  if (v.k === 'term') return tH0(v.term, L);
  return fH0(v.k === 'fact' ? v.fact : v.card, L, 'proof');
}
export const termOf = (v: ItemValue | undefined): Term | null => (v && v.k === 'term' ? v.term : null);

// ───────── floor anchors ─────────
// The lens and hints anchor to machines on the floor. Order: a helper exported by ../floor (if any);
// the floor's own projection (floor/project.ts: camera convention shared with the HUD) applied to the
// machine's grid rect; elements tagged data-machine="<id>"; else null (callers dock at the right edge).
type RectLike = { left: number; top: number; width: number; height: number };
const FLOOR_HELPERS = ['machineScreenRect', 'screenRectOf', 'machineRect', 'rectOfMachine', 'anchorOf'];
/** The floor module, once its dynamic import resolves (index.ts sets it). */
export const floorModule: { mod: Record<string, unknown> } = { mod: {} };
export function machineRect(id: string, s?: S): RectLike | null {
  const fl = floorModule.mod;
  for (const name of FLOOR_HELPERS) {
    const fn = fl[name];
    if (typeof fn !== 'function') continue;
    try {
      const r = (fn as (id: string) => unknown)(id) as Partial<RectLike & { x: number; y: number; w: number; h: number }> | null;
      if (r) {
        const left = r.left ?? r.x, top = r.top ?? r.y, width = r.width ?? r.w ?? 0, height = r.height ?? r.h ?? 0;
        if (typeof left === 'number' && typeof top === 'number') return { left, top, width, height };
      }
    } catch { /* not ready */ }
  }
  const root = document.getElementById('floor');
  if (!root || !root.querySelector('svg, canvas')) return null; // the floor has not drawn anything yet
  const q = CSS.escape(id);
  const tagged = root.querySelector(`[data-machine="${q}"], [data-machine-id="${q}"], [data-mid="${q}"]`);
  if (tagged) {
    const r = tagged.getBoundingClientRect();
    if (r.width || r.height) return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  if (!s) return null;
  const m = s.canvas.machines.find((x) => x.id === id);
  if (!m) return null;
  const g = safe(() => F.rectOf(m, s.ctx), null);
  const fr = root.getBoundingClientRect();
  if (!g || !fr.width) return null;
  const sr = rectToScreen(s.ui.camera, { w: fr.width, h: fr.height }, g.x, g.y, g.x + g.w, g.y + g.h, 0.3);
  return { left: fr.left + sr.x, top: fr.top + sr.y, width: sr.w, height: sr.h };
}

/** Last pointer position (toasts appear near it). */
export const pointer = { x: innerWidth / 2, y: innerHeight - 120 };
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true, capture: true });

/** Copy text, with a textarea fallback. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', {}, text); document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove(); return ok;
  }
}

// ───────── v3 copy for each order's "new idea" (the manifest's idea lines describe v2 bench mechanics) ─────────
const V3_IDEA: Record<string, string> = {
  L01: 'Place a Canceller and route the spool through it to the dock.',
  L02: 'Route a law into a Rewriter, or Apply it at x = e.',
  L03: 'Expand a pair a⁻¹a where it helps; feed the hypothesis to a Rewriter.',
  L04: 'Re-read the word in a shifted frame: conjugate with two Multipliers.',
  L05: 'A Multiplier acts on both rails at once.',
  L06: 'The inverse of a product does not unpack: feed the Witness Stamp a product equal to e and cut it.',
  L07: 'Earned theorems are hardware: route the equation through Cancel Lathes.',
  L08: 'Route the law into a Rewriter and set x to a compound element.',
  L09: 'Paint a room that supposes the opposite; clash at an Anvil; leave through the gate.',
  L10: 'A classical room assumes the negation, and that ≠ is the premise the card needs.',
  R01: 'Branch one intermediate product to two docks.',
  L11: 'The Lagrange Press turns |G| = n into the law xⁿ = e.',
  L12: 'Everything at once: a room, the press, a stamp and a branched belt.',
  S01: 'Feed the Witness Stamp a compound part.',
  S02: 'Neighbouring b⁻¹b pairs cancel on the line.',
};
export const ideaOf = (lv: LevelManifest): string => V3_IDEA[lv.id] ?? lv.idea;
