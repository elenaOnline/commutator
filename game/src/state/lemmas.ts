// COMMUTATOR — Lemma Book records are POSITIONAL (KERNEL-EXT §3½, "Records are positional"). A saved card's
// structure binders (subgroups, groups, homs, actions) are stored by position and never under a level's own id:
// binder i is renamed `$i:<name>` everywhere it occurs (its declaration, submeta / sortmeta references, map heads,
// identity and size tags, meta sorts). Applying a record then binds each position to a symbol of the CURRENT
// level, so a reused id (`f` a set map in W5 and a hom in W7; `H` a subgroup in W4 and a group in W7) can never
// carry a law into a level where it does not hold. The name after the colon is only for display (posName).
import type { Card } from '../kernel/types';

const POS = /^\$\d+:/;
export const isPositional = (id: string) => POS.test(id);

/** The card with every structure binder renamed positionally ($0:f, $1:H). Idempotent; element metas untouched. */
export function positional(card: Card): Card {
  const binds = card.binds ?? [];
  if (!binds.length || binds.every((b) => isPositional(b.id))) return card;
  const ren = new Map<string, string>();
  binds.forEach((b, i) => { if (!isPositional(b.id)) ren.set(b.id, `$${i}:${b.id}`); });
  const r = (id: unknown) => (typeof id === 'string' && ren.has(id) ? ren.get(id)! : id);
  const walk = (x: unknown, inBinder = false): unknown => {
    if (Array.isArray(x)) return x.map((y) => walk(y, inBinder));
    if (!x || typeof x !== 'object') return x;
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = walk(v);
    switch (o.k) {
      case 'submeta': case 'sortmeta': out.id = r(o.id); break;
      case 'app': out.fn = r(o.fn); break;
      case 'e': case 'size': if (o.s !== undefined) out.s = r(o.s); break;
    }
    if (inBinder) {
      out.id = r(o.id);
      for (const f of ['dom', 'cod', 'grp', 'on', 'sort']) if (typeof o[f] === 'string') out[f] = r(o[f]);
    }
    return out;
  };
  const next = walk(card) as Card;
  next.binds = binds.map((b) => walk(b, true)) as Card['binds'];
  if (card.metaSorts) next.metaSorts = Object.fromEntries(Object.entries(card.metaSorts).map(([m, s]) => [m, typeof s === 'string' ? (r(s) as string) : (walk(s) as typeof s)]));
  return next;
}

/**
 * Floors saved before records became positional bind a lemma's structures under the old names
 * (`{ k:'schema', id:'lemma:…', structs: { f: 'f' } }`). Rewrite every such reference to the record's positional
 * binder ids (`{ '$2:f': 'f' }`) so those floors keep compiling. Keys already positional, or naming no binder, are
 * left alone. Pure; returns the input unchanged when nothing needs rewriting.
 */
export function positionalRefs<T>(x: T, lemmas: readonly { id: string; card: Card }[]): T {
  const byId = new Map(lemmas.map((l) => [l.id, (positional(l.card).binds ?? []).map((b) => b.id)]));
  if (!byId.size) return x;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) { let ch = false; const out = v.map((y) => { const z = walk(y); if (z !== y) ch = true; return z; }); return ch ? out : v; }
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    let out: Record<string, unknown> | null = null;
    for (const [k, y] of Object.entries(o)) { const z = walk(y); if (z !== y) (out ??= { ...o })[k] = z; }
    const ids = o.k === 'schema' && typeof o.id === 'string' ? byId.get(o.id) : undefined;
    const structs = o.structs as Record<string, unknown> | undefined;
    if (ids && structs && Object.keys(structs).some((k) => !isPositional(k))) {
      const next: Record<string, unknown> = {};
      for (const [k, y] of Object.entries(structs)) next[isPositional(k) ? k : (ids.find((b) => b.replace(POS, '') === k) ?? k)] = y;
      (out ??= { ...o }).structs = next;
    }
    return out ?? v;
  };
  return walk(x) as T;
}
