// LEMMA WORKS kernel — Book phase C: sorts and maps. Pure. Spec: design/pinter/KERNEL-EXT.md §5.
//
// A level is SINGLE-SORTED (one group 'G', everything as before) unless it declares sorts or maps, or the floor
// declares a group / Hom Tower. In a many-sorted context every ground term is sort-checked and every (in)equation a
// node produces must have both sides in one sort; a membership's term must live in its subgroup's group.
import type { Card, LevelManifest, MapDecl, MetaId, SortDecl, SortId, SortRef, StructBinder, Term } from './types';
import { KErr } from './errors';

export const DEFAULT_GROUP: SortId = 'G';

export interface SortEnv {
  multi: boolean;
  sorts: Map<SortId, SortDecl>;
  maps: Map<string, MapDecl>;
  atomSort: Map<string, SortId>;
  label: (s: SortId) => string;
}

/** The sorts and maps in scope (level declarations; withVars merges group and Hom Towers into the level). */
const ENV_CACHE = new WeakMap<object, SortEnv>();
export function sortEnv(level: Pick<LevelManifest, 'sorts' | 'maps' | 'atoms'>): SortEnv {
  const hit = ENV_CACHE.get(level);
  if (hit) return hit;
  const env = buildSortEnv(level);
  ENV_CACHE.set(level, env);
  return env;
}
function buildSortEnv(level: Pick<LevelManifest, 'sorts' | 'maps' | 'atoms'>): SortEnv {
  const declared = Array.isArray(level.sorts) ? level.sorts : [];
  const maps = Array.isArray(level.maps) ? level.maps : [];
  const multi = declared.length > 0 || maps.length > 0;
  const sorts = new Map<SortId, SortDecl>(declared.map((s) => [s.id, s]));
  if (!sorts.has(DEFAULT_GROUP) && (!multi || level.atoms.some((a) => a.sort !== 'Z' && (a.carrier ?? DEFAULT_GROUP) === DEFAULT_GROUP))) {
    sorts.set(DEFAULT_GROUP, { id: DEFAULT_GROUP, kind: 'group', label: 'G' });
  }
  const atomSort = new Map<string, SortId>();
  for (const a of level.atoms) if (a.sort !== 'Z') atomSort.set(a.id, a.carrier ?? DEFAULT_GROUP);
  return {
    multi, sorts, maps: new Map(maps.map((m) => [m.id, m])), atomSort,
    label: (s) => sorts.get(s)?.label ?? s,
  };
}

export const isGroupSort = (env: SortEnv, s: SortId) => env.sorts.get(s)?.kind === 'group';
export const mapKind = (m: MapDecl) => m.kind ?? 'map';

/**
 * The sort of a term. `metaSort` gives metas their sorts (absent: metas are not allowed). Throws a maths-language
 * KErr when the term is ill-sorted ("f takes an element of A; x⁻¹ is in G").
 */
export function sortOf(t: Term, env: SortEnv, metaSort?: (m: MetaId) => SortId | undefined, L: Record<string, string> = {}): SortId {
  const name = (s: SortId) => env.label(s);
  const go = (u: Term): SortId => {
    switch (u.k) {
      case 'atom': {
        const s = env.atomSort.get(u.id);
        if (!s) throw new KErr(`${L[u.id] ?? u.id} is not an element here.`);
        return s;
      }
      case 'meta': {
        const s = metaSort?.(u.id);
        if (!s) throw new KErr(`${u.id} has no sort here.`);
        return s;
      }
      case 'e': {
        const s = u.s ?? DEFAULT_GROUP;
        if (!isGroupSort(env, s)) throw new KErr(`There is no group ${name(s)} here, so no identity e of it.`);
        return s;
      }
      case 'inv': {
        const s = go(u.arg);
        if (!isGroupSort(env, s)) throw new KErr(`${name(s)} is a set, not a group: its elements have no inverses.`);
        return s;
      }
      case 'mul': {
        const ss = u.fs.map(go);
        const s = ss[0]!;
        if (!isGroupSort(env, s)) throw new KErr(`${name(s)} is a set, not a group: its elements cannot be multiplied.`);
        const bad = ss.find((x) => x !== s);
        if (bad) throw new KErr(`A product mixes elements of ${name(s)} and ${name(bad)}. Multiply within one group.`);
        return s;
      }
      case 'pow': {
        const s = go(u.base);
        if (!isGroupSort(env, s)) throw new KErr(`${name(s)} is a set, not a group: its elements have no powers.`);
        return s;
      }
      case 'app': {
        const m = env.maps.get(u.fn);
        if (!m) throw new KErr(`${L[u.fn] ?? u.fn} is not a map here.`);
        if (u.args.length !== m.args.length) throw new KErr(`${m.label} takes ${m.args.length} argument${m.args.length === 1 ? '' : 's'}.`);
        u.args.forEach((a, i) => {
          const s = go(a);
          if (s !== m.args[i]) throw new KErr(`${m.label} takes an element of ${name(m.args[i]!)} there, but this one is in ${name(s)}.`);
        });
        return m.res;
      }
      case 'int': throw new KErr('An integer is not an element.');
    }
  };
  return go(t);
}

/** Sort check of a ground (in)equation: both sides in one sort. Returns that sort. */
export function checkEqSorts(l: Term, r: Term, env: SortEnv, L: Record<string, string> = {}): SortId {
  const a = sortOf(l, env, undefined, L), b = sortOf(r, env, undefined, L);
  if (a !== b) throw new KErr(`The two sides live in different places: one in ${env.label(a)}, the other in ${env.label(b)}.`);
  return a;
}

/** Map ids occurring in a term (app heads), in order of first occurrence. */
export function mapsOf(t: Term, out: string[] = []): string[] {
  switch (t.k) {
    case 'app': if (!out.includes(t.fn)) out.push(t.fn); t.args.forEach((a) => mapsOf(a, out)); break;
    case 'inv': mapsOf(t.arg, out); break;
    case 'mul': t.fs.forEach((f) => mapsOf(f, out)); break;
    case 'pow': mapsOf(t.base, out); break;
    default: break;
  }
  return out;
}
/** Sort tags of identities occurring in a term (e_S), in order of first occurrence (untagged = 'G'). */
export function eSortsOf(t: Term, out: string[] = []): string[] {
  switch (t.k) {
    case 'e': { const s = t.s ?? DEFAULT_GROUP; if (!out.includes(s)) out.push(s); break; }
    case 'app': t.args.forEach((a) => eSortsOf(a, out)); break;
    case 'inv': eSortsOf(t.arg, out); break;
    case 'mul': t.fs.forEach((f) => eSortsOf(f, out)); break;
    case 'pow': eSortsOf(t.base, out); break;
    default: break;
  }
  return out;
}

/** Retag every untagged / 'G' identity to sort s (a one-group card used in group s). */
export function retagE(t: Term, s: SortId): Term {
  if (s === DEFAULT_GROUP) return t;
  const go = (u: Term): Term => {
    switch (u.k) {
      case 'e': return (u.s ?? DEFAULT_GROUP) === DEFAULT_GROUP ? { k: 'e', s } : u;
      case 'inv': return { k: 'inv', arg: go(u.arg) };
      case 'mul': return { k: 'mul', fs: u.fs.map(go) };
      case 'pow': return { k: 'pow', base: go(u.base), exp: u.exp };
      case 'app': return { k: 'app', fn: u.fn, args: u.args.map(go) };
      default: return u;
    }
  };
  return go(t);
}

/** A ONE-GROUP card (KERNEL-EXT §5.6): no meta sorts, no maps, no structure parameters other than subgroups. */
export function isOneGroup(c: Card): boolean {
  if (c.metaSorts && Object.keys(c.metaSorts).length) return false;
  if ((c.binds ?? []).some((b) => b.k !== 'sub')) return false;
  const terms = c.k === 'law' ? [c.l, c.r] : [...c.premises, c.concl].flatMap((p) => (p.k === 'mem' ? [p.t] : [p.l, p.r]));
  return terms.every((t) => !mapsOf(t).length && eSortsOf(t).every((s) => s === DEFAULT_GROUP));
}

/** Resolve a sort reference under a binder → sort assignment. */
export const sortRef = (r: SortRef, sorts: Record<MetaId, SortId>): SortId => (typeof r === 'string' ? r : sorts[r.id] ?? r.id);

/** Structure binders of a card by kind. */
export const bindersOf = (c: Card, k: StructBinder['k']) => (c.binds ?? []).filter((b) => b.k === k);
