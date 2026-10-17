// COMMUTATOR — sorts as the player sees them (Book phase C; NORMS › Floor › Sorts). A fact lives in one group (or
// a set). In a level with more than one sort, items wear their sort on their tray (a pale ground tint, a hairline
// in the sort's ink, the sort's name as a small tag); the level's first group stays white and untagged, so a
// one-group level looks exactly as before. Identity is written e_G, e_K once the level has two groups.
import * as K from '../kernel';
import type { LevelManifest, ProofGraph, StructBinder, Term } from '../kernel/types';
import { displayCard } from '../kernel/print';

/** Aliases key: how many groups the card being typeset ranges over ('one' | 'many'; absent outside a card). */
export const CARD_GROUPS = '\u0003cardgroups';

/**
 * A card's group and set parameters by the kernel's display names (K displayCard, KERNEL-EXT §5.13): groups G, K, L,
 * M, Q, R — never H, which is for subgroups — sets Ω, Γ, … whatever ids the card stores (S, T, G₁, $1:K). One rule
 * for every renderer (HUD strips, picker figures, chooser, floor plates), so a card reads the same everywhere.
 */
export function cardAliases(binds: readonly StructBinder[] | undefined, metas: readonly string[] = []): Record<string, string> {
  if (!binds?.some((b) => b.k === 'grp' || b.k === 'set')) return {};
  try {
    const e: Term = { k: 'e' };
    const d = displayCard({ k: 'law', metas: [...metas], l: e, r: e, binds: [...binds] } as never) as { binds?: StructBinder[] };
    // a card over two or more groups tags every identity (e_G, e_K), as the kernel's factText does (MULTI_GROUP);
    // a card over one group writes plain e on a one-group floor: e(p) = p, never e_G(p) (W6 #5)
    const groups = binds.filter((b) => b.k === 'grp').length;
    const al: Record<string, string> = Object.fromEntries(binds.flatMap((b, i) => (b.k === 'grp' || b.k === 'set' ? [[b.id, d.binds?.[i]?.id ?? b.id]] : [])));
    // never print one group as another: a parameter is not named after a fixed group the card also mentions
    // (f : G → K₁ generalized over K₁ reads ∀K, f : G → K, never ∀G, f : G → G — W8–14 N6)
    const own = new Set(binds.map((b) => b.id));
    const fixed = new Set(binds.flatMap((b) => [(b as { dom?: unknown }).dom, (b as { cod?: unknown }).cod, (b as { sort?: unknown }).sort, (b as { grp?: unknown }).grp, (b as { on?: unknown }).on])
      .filter((r): r is string => typeof r === 'string' && !own.has(r)));
    if (fixed.size) {
      const used = new Set([...fixed, ...Object.values(al), ...metas]);
      for (const b of binds) {
        if ((b.k !== 'grp' && b.k !== 'set') || !fixed.has(al[b.id]!)) continue;
        const pool = b.k === 'grp' ? ['G', 'K', 'L', 'M', 'Q', 'R'] : ['Ω', 'Γ', 'Δ', 'Λ'];
        const nm = pool.find((n) => !used.has(n));
        if (nm) { used.add(nm); al[b.id] = nm; }
      }
    }
    return { ...al, [CARD_GROUPS]: groups + fixed.size >= 2 ? 'many' : 'one' };
  } catch { return {}; }
}

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

/**
 * An action's application σ(g, p) reads g(p) — the group element applied to the point (Pinter; KERNEL-EXT §5.11).
 * A declared map is an action by its kind. Anything else applied to two arguments is a card's binder, and the only
 * two-argument binder is an action's (a hom binder takes one): the action laws read (gh)(p) = g(h(p)) and
 * e(p) = p in every picker, lens, direction pill and map node, never σ(gh, p) (NORMS › Sorts; W6 #5).
 */
export function isActionApp(t: Term, c: SortCtx = sortCtx.cur): boolean {
  if (t.k !== 'app' || t.args.length !== 2) return false;
  const decl = c.env?.maps.get(t.fn);
  return decl ? decl.kind === 'action' : true;
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
  // a positional Lemma Book binder ($1:K) prints by its name (#6); a one-group card on a one-group floor: plain e
  if (t.s && eAliases.cur[t.s]) return eAliases.cur[CARD_GROUPS] === 'one' && !c.eTags ? null : eAliases.cur[t.s]!;
  if (t.s && t.s === c.base && !c.eTags) return null; // one group on the floor: its identity is plain e (e(p) = p)
  if (t.s) return c.styles.get(t.s)?.label ?? (c.env?.sorts.has(t.s) ? c.env.label(t.s) : null) ?? t.s.replace(/^\$\d+:/, '');
  return c.eTags ? (c.styles.get(c.base)?.label ?? c.base) : null;
}

/**
 * Run `fn` with another level's sorts in force (the theorem map typesets every level's statement: its actions read
 * α(p), its identities e_G / e_K by that level's groups, its carriers by that level's sorts).
 */
export function withSortCtx<T>(level: LevelManifest, fn: () => T): T {
  const prev = sortCtx.cur;
  sortCtx.cur = sortStylesOf(level);
  try { return fn(); } finally { sortCtx.cur = prev; }
}

/**
 * A card's element variables grouped by where they live, for its ∀ prefix: `∀u, v ∈ K.`, `∀g, h ∈ G, p ∈ Ω.`.
 * Carriers are printed only when some variable lives outside the floor's first group (a one-group statement reads
 * `∀x, y.` exactly as before); then every run says its carrier. `sort` is a display label, or null (unknown).
 */
export function metaCarriers(metas: readonly string[], metaSorts: Readonly<Record<string, string | { k: 'sortmeta'; id: string }>> | undefined,
  L: Readonly<Record<string, string>> = {}, c: SortCtx = sortCtx.cur): { metas: string[]; sort: string | null }[] {
  const idOf = (m: string): { id: string; concrete: boolean } | null => {
    const r = metaSorts?.[m];
    return r === undefined ? null : typeof r === 'string' ? { id: r, concrete: true } : { id: r.id, concrete: false };
  };
  const shown = metas.some((m) => { const s = idOf(m); return !!s && s.concrete && s.id !== c.base && s.id !== 'Z'; });
  const label = (m: string): string | null => {
    if (!shown) return null;
    const s = idOf(m);
    if (!s || s.id === 'Z') return null;
    return L[s.id] ?? c.styles.get(s.id)?.label ?? (c.env?.sorts.has(s.id) ? c.env.label(s.id) : null) ?? s.id.replace(/^\$\d+:/, '');
  };
  const out: { metas: string[]; sort: string | null }[] = [];
  for (const m of metas) {
    const s = label(m);
    const last = out[out.length - 1];
    if (last && last.sort === s) last.metas.push(m); else out.push({ metas: [m], sort: s });
  }
  return out;
}

// ───────── Towers and sorts (the Tower lens; W5–7 #6, #11, #20) ─────────

/** The sort the level's docks quantify over, when they agree (P6.1: A, P9.1: K); null when mixed, ℤ or unsaid. */
export function docksSort(level: Pick<LevelManifest, 'sockets'>): string | null {
  const ss = new Set<string>();
  for (const sk of level.sockets) {
    const ms = (sk.target as { metaSorts?: Record<string, unknown> }).metaSorts ?? {};
    for (const r of Object.values(ms)) if (typeof r === 'string' && r !== 'Z') ss.add(r);
  }
  return ss.size === 1 ? [...ss][0]! : null;
}
/** A level with no group at all (Pinter ch. 6, sets and maps): no product, inverse or e, no group Tower. */
export function setsOnlyLevel(level: Pick<LevelManifest, 'sorts' | 'maps' | 'atoms'>): boolean {
  try {
    const env = K.sortEnv(level);
    return env.multi && ![...env.sorts.values()].some((x) => x.kind === 'group');
  } catch { return false; }
}
/**
 * The level's default group G is only a placeholder: it declares no group and nothing lives in G (P9.3, P9.4:
 * "∀G, K, f : G → K …" is proved with group Towers G₁, K₁). A Hom Tower then goes between the floor's group Towers.
 */
export function defaultGroupIsPlaceholder(level: Pick<LevelManifest, 'sorts' | 'atoms' | 'givens'>): boolean {
  return !(level.sorts ?? []).some((x) => x.kind === 'group') && !level.atoms.some((a) => a.sort !== 'Z') && !level.givens.length;
}
/**
 * The groups a Hom Tower may go from and to, in the order its defaults take them: the level's groups, then the
 * floor's group Towers — or, when the level's G is a placeholder, the group Towers alone (G stays listed only while
 * the Tower already uses it, so the lens can show what is chosen).
 */
export function homGroupChoices(level: Pick<LevelManifest, 'sorts' | 'atoms' | 'givens'>, levelGroups: readonly { id: string; label: string }[],
  towerGroups: readonly { id: string; label: string }[], inUse: readonly string[] = []): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const add = (g: { id: string; label: string }) => { if (!out.some((x) => x.id === g.id)) out.push(g); };
  if (defaultGroupIsPlaceholder(level) && towerGroups.length) {
    towerGroups.forEach(add);
    levelGroups.filter((g) => inUse.includes(g.id)).forEach(add);
  } else { levelGroups.forEach(add); towerGroups.forEach(add); }
  return out;
}
/** Plain one-line definitions of the Tower's subgroup options (a symbol is defined where it first appears). */
export const SUBGROUP_DEFS = {
  sub: 'H ≤ G, a subgroup: contains e, closed under products and inverses.',
  normal: 'N ⊴ G, a normal subgroup: also closed under conjugation, gng⁻¹ ∈ N.',
} as const;

/**
 * A fresh id for a group or Hom Tower: `grp1`, `hom2` …, never an element letter. A Tower that turns into a group or
 * a homomorphism takes a new id, so its label can never be read for an element variable or a card's bound x (the ∀
 * lens printed "for all G, K, f, f₁, y" when f₁ kept the id x — verify-fixround #1).
 */
export function freshStructId(kind: 'grp' | 'hom', taken: Iterable<string>): string {
  const t = new Set(taken);
  for (let i = 1; ; i++) if (!t.has(`${kind}${i}`)) return `${kind}${i}`;
}

/**
 * An element Tower's name chips: the letters the docks bind in its carrier first (P16.1's a, b; P6.3's z ∈ C), then
 * the usual letters (x, y, z, u in a group; u, v, w in a set). A dock variable over a card's own group (a sort
 * parameter) counts for a group Tower; integer variables (in exponents) never do.
 */
export function towerLetters(level: Pick<LevelManifest, 'sockets'>, carrier: string | undefined, isSet: boolean): string[] {
  const docks = level.sockets.flatMap((sk) => {
    const t = sk.target as { metas?: string[]; metaSorts?: Record<string, unknown> };
    const json = JSON.stringify(sk.target);
    return (t.metas ?? []).filter((m) => {
      if (json.includes(`"k":"zmeta","id":${JSON.stringify(m)}`)) return false;
      const r = t.metaSorts?.[m];
      if (r === 'Z') return false;
      if (typeof r === 'string') return r === (carrier ?? DEFAULT_SORT);
      return !isSet; // unsaid, or a card's sort parameter: an element of a group
    });
  });
  return [...new Set([...docks, ...(isSet ? ['u', 'v', 'w'] : ['x', 'y', 'z', 'u'])])].slice(0, 4);
}
const DEFAULT_SORT = K.DEFAULT_GROUP;
