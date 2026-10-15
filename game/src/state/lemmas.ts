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
