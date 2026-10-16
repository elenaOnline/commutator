// LEMMA WORKS kernel — Book phase B: Members (t ∈ S). Pure. Spec: design/pinter/KERNEL-EXT.md §4.
//
// A membership is the fact kind `{k:'mem', t, sub}`. Its single rail is its term t, addressed as side 'l'.
// Subgroups are level declarations (`level.subgroups`) or Subgroup Towers (`graph.structs`, merged into the
// context by withVars as `variable: true`). Cards may be schematic over subgroups (`card.binds`, `submeta`).
// The kind's axioms (closure under products / inverses, conjugation for normal) and the earned `e ∈ S` and the
// imported powers are kernel-owned schemas resolved here, like the power imports.
import type { Card, Fact, MemPat, MetaId, PatFact, Poly, Schema, StructBinder, SubRef, SubgroupDecl, Term } from './types';
import { KErr } from './errors';
import type { LevelManifest, SortId, SortRef } from './types';
import { mapKind, sortEnv, sortRef } from './sorts';
import { renameTerm } from './terms';

// ───────────── walking statements ─────────────

/** A card's positional binder id ('$2:f') prints as its name ('f'): never an internal id on screen. */
const bn = (id: string) => id.replace(/^\$\d+:/, '');
/** The terms of a statement inside a card (eq/neq: both sides; mem: its element). */
export function patTerms(p: PatFact): Term[] { return p.k === 'mem' ? [p.t] : [p.l, p.r]; }
/** Map the terms (and subgroup refs) of a statement. */
export function mapPat(p: PatFact, f: (t: Term) => Term, s: (r: SubRef) => SubRef = (r) => r): PatFact {
  return p.k === 'mem' ? { k: 'mem', t: f(p.t), sub: s(p.sub) } : { k: p.k, l: f(p.l), r: f(p.r) };
}
/** Every statement of a fact (laws as one eq; cards: premises then conclusion; pallets: themselves). */
export function factPats(f: Fact): PatFact[] {
  switch (f.k) {
    case 'eq': case 'neq': return [{ k: f.k, l: f.l, r: f.r }];
    case 'mem': return [f];
    case 'law': return [{ k: 'eq', l: f.l, r: f.r }];
    case 'cond': return [...f.premises, f.concl];
    default: return [];
  }
}
/** Every term occurring in a fact. */
export const factTerms = (f: Fact): Term[] => factPats(f).flatMap(patTerms);
/** Rigid subgroup ids a fact mentions (level subgroups and Subgroup Towers). */
export function factSubs(f: Fact, acc: Set<string> = new Set()): Set<string> {
  for (const p of factPats(f)) if (p.k === 'mem' && p.sub.k === 'sub') acc.add(p.sub.id);
  return acc;
}
/** Subgroup binders used in a card, in order of first occurrence. */
export function submetasOf(f: Fact): MetaId[] {
  const out: MetaId[] = [];
  for (const p of factPats(f)) if (p.k === 'mem' && p.sub.k === 'submeta' && !out.includes(p.sub.id)) out.push(p.sub.id);
  return out;
}
export const subKey = (r: SubRef) => `${r.k}:${r.id}`;
export const sameSub = (a: SubRef, b: SubRef) => a.k === b.k && a.id === b.id;

// ───────────── the subgroup environment ─────────────

/** The subgroups in scope (level declarations + the floor's Subgroup Towers). */
export const subsIn = (level: { subgroups?: SubgroupDecl[] }): SubgroupDecl[] => (Array.isArray(level.subgroups) ? level.subgroups : []);
export function subDecl(level: { subgroups?: SubgroupDecl[] }, id: string): SubgroupDecl | undefined { return subsIn(level).find((s) => s.id === id); }

/** A ground membership's subgroup must be declared (level or Tower). */
export function checkSubRef(r: SubRef, level: { subgroups?: SubgroupDecl[] }, what = 'that membership'): void {
  if (!r || typeof r !== 'object') throw new KErr(`${what} names no subgroup.`);
  if (r.k === 'submeta') throw new KErr(`${what} still has the subgroup variable ${r.id}. Choose a subgroup.`);
  if (r.k !== 'sub' || !subDecl(level, r.id)) throw new KErr(`${String((r as { id?: string }).id)} is not a subgroup here.`);
}

/**
 * Instantiate a card's structure parameters (phase B subgroups; phase C groups, sets, homomorphisms, actions).
 * `structs` maps binders to symbols in scope: a subgroup (normal binders need a normal one), a hom for a hom binder
 * and an action for an action binder (plain maps are never accepted), a group / set sort for a group / set binder.
 * Group and set binders not chosen are solved from the homs, actions and subgroups chosen ("sort parameters unify
 * across a card", SYNTHESIS §4.1 pin 2). Returns the card with no binders, every binder replaced.
 */
export function instStructs<C extends Card>(c: C, structs: Record<MetaId, string> | undefined,
  level: { subgroups?: SubgroupDecl[]; sorts?: LevelManifest['sorts']; maps?: LevelManifest['maps']; atoms?: LevelManifest['atoms'] }, name = 'this theorem'): C {
  const binds = c.binds ?? [];
  for (const m of submetasOf(c)) if (!binds.some((b) => b.id === m)) throw new KErr(`${name} has the subgroup variable ${m} without a ∀.`);
  for (const k of Object.keys(structs ?? {})) if (!binds.some((b) => b.id === k)) throw new KErr(`${k} is not a parameter of ${name}.`);
  if (!binds.length) return c;
  const env = sortEnv({ sorts: level.sorts, maps: level.maps, atoms: level.atoms ?? [] });
  const lab = (s: SortId) => env.label(s);
  const sortOfBinder: Record<string, SortId> = {};
  const chosen: Record<string, string> = {};
  const unify = (r: SortRef, actual: SortId, what: string) => {
    if (typeof r === 'string') {
      if (sortOfBinder[r] !== undefined || binds.some((b) => (b.k === 'grp' || b.k === 'set') && b.id === r)) return unify({ k: 'sortmeta', id: r }, actual, what);
      if (r !== actual) throw new KErr(`${name} needs ${what} in ${lab(r)}, but it is in ${lab(actual)}.`);
      return;
    }
    const cur = sortOfBinder[r.id];
    if (cur === undefined) sortOfBinder[r.id] = actual;
    else if (cur !== actual) throw new KErr(`${name} needs one group for ${r.id}: here it would be both ${lab(cur)} and ${lab(actual)}.`);
  };
  for (const b of binds) if (b.k === 'grp' || b.k === 'set') {
    const id = structs?.[b.id];
    if (!id) continue;
    const d = env.sorts.get(id);
    if (!d || d.kind !== (b.k === 'grp' ? 'group' : 'set')) throw new KErr(`${id} is not a ${b.k === 'grp' ? 'group' : 'set'} here.`);
    sortOfBinder[b.id] = id;
  }
  for (const b of binds) if (b.k === 'hom' || b.k === 'act') {
    const id = structs?.[b.id];
    const what = b.k === 'hom' ? 'homomorphism' : 'action';
    if (!id) throw new KErr(`Choose which ${what} plays ${bn(b.id)}.`);
    const m = env.maps.get(id);
    if (!m) throw new KErr(`${id} is not a map here.`);
    if (mapKind(m) !== (b.k === 'hom' ? 'hom' : 'action')) throw new KErr(`${m.label} is not ${b.k === 'hom' ? 'a homomorphism' : 'an action'}. ${name} needs one for ${bn(b.id)}.`);
    if (b.k === 'hom') { unify(b.dom, m.args[0]!, `the domain of ${bn(b.id)}`); unify(b.cod, m.res, `the codomain of ${bn(b.id)}`); }
    else { unify(b.grp, m.args[0]!, `the group of ${bn(b.id)}`); unify(b.on, m.args[1]!, `the set ${bn(b.id)} acts on`); }
    chosen[b.id] = id;
  }
  for (const b of binds) if (b.k === 'sub') {
    const id = structs?.[b.id];
    if (!id) throw new KErr(`Choose which subgroup plays ${bn(b.id)}.`);
    const d = subDecl(level, id);
    if (!d) throw new KErr(`${id} is not a subgroup here.`);
    if (b.normal && !d.normal) throw new KErr(`${name} needs a normal subgroup for ${bn(b.id)}. ${d.label} is not declared normal.`);
    if (b.sort !== undefined) unify(b.sort, d.sort ?? 'G', `the group of ${bn(b.id)}`);
    chosen[b.id] = id;
  }
  for (const b of binds) if ((b.k === 'grp' || b.k === 'set') && sortOfBinder[b.id] === undefined) throw new KErr(`Choose which ${b.k === 'grp' ? 'group' : 'set'} plays ${bn(b.id)}.`);
  const isB = (s: string) => Object.hasOwn(sortOfBinder, s);
  const t1 = (t: Term) => renameTerm(t, (m) => m, (r) => r, undefined, (f) => chosen[f] ?? f, (srt) => (isB(srt) ? sortOfBinder[srt]! : srt));
  const s1 = (r: SubRef): SubRef => (r.k === 'submeta' && chosen[r.id] ? { k: 'sub', id: chosen[r.id]! } : r);
  const metaSorts = c.metaSorts ? Object.fromEntries(Object.entries(c.metaSorts).map(([m, r]) => [m, sortRef(r, sortOfBinder)])) : undefined;
  const { binds: _b, metaSorts: _m, ...rest } = c as Card;
  void _b; void _m;
  const ms = metaSorts ? { metaSorts } : {};
  if (c.k === 'law') return { ...rest, ...ms, l: t1((c as Card & { k: 'law' }).l), r: t1((c as Card & { k: 'law' }).r) } as unknown as C;
  const cc = c as Card & { k: 'cond' };
  return { ...rest, ...ms, premises: cc.premises.map((p) => mapPat(p, t1, s1)), concl: mapPat(cc.concl, t1, s1) } as unknown as C;
}

// ───────────── the kind's library ─────────────

const x: Term = { k: 'meta', id: 'x' }, y: Term = { k: 'meta', id: 'y' }, g: Term = { k: 'meta', id: 'g' };
const H: SubRef = { k: 'submeta', id: 'H' }, N: SubRef = { k: 'submeta', id: 'N' };
const mem = (t: Term, sub: SubRef): MemPat => ({ k: 'mem', t, sub });
const nPoly: Poly = [{ coefficient: '1', monomial: [{ ref: { k: 'zmeta', id: 'n' }, degree: 1 }] }];
const binder = (id: MetaId, normal = false): StructBinder => ({ k: 'sub', id, normal });

/**
 * Kernel-owned subgroup schemas:
 * - axioms of the kind (origin 'axiom', always available where a subgroup is in scope): sub.mul, sub.inv,
 *   sub.conj (normal subgroups only);
 * - sub.e (earned in P5.1, unconditional — subgroups are nonempty; KERNEL-EXT §4.3, SYNTHESIS §4.1 pin 6);
 * - sub.pow (imported from ch. 11).
 */
export const SUB_SCHEMAS: Record<string, Schema> = {
  'sub.mul': { id: 'sub.mul', name: 'closed under products', textbook: 'a subgroup is closed under products', origin: 'axiom', mirrorable: false,
    card: { k: 'cond', metas: ['x', 'y'], binds: [binder('H')], premises: [mem(x, H), mem(y, H)], concl: mem({ k: 'mul', fs: [x, y] }, H) } },
  'sub.inv': { id: 'sub.inv', name: 'closed under inverses', textbook: 'a subgroup is closed under inverses', origin: 'axiom', mirrorable: false,
    card: { k: 'cond', metas: ['x'], binds: [binder('H')], premises: [mem(x, H)], concl: mem({ k: 'inv', arg: x }, H) } },
  'sub.conj': { id: 'sub.conj', name: 'closed under conjugation', textbook: 'a normal subgroup is closed under conjugation', origin: 'axiom', mirrorable: true,
    card: { k: 'cond', metas: ['g', 'x'], binds: [binder('N', true)], premises: [mem(x, N)], concl: mem({ k: 'mul', fs: [g, x, { k: 'inv', arg: g }] }, N) } },
  'sub.e': { id: 'sub.e', name: 'a subgroup contains e', textbook: 'a subgroup contains e', origin: 'earned', fromLevel: 'P5.1', mirrorable: false,
    card: { k: 'cond', metas: [], binds: [binder('H')], premises: [], concl: mem({ k: 'e' }, H) } },
  'sub.pow': { id: 'sub.pow', name: 'powers of a member are members', textbook: 'powers of a member are members (imported)', origin: 'import', mirrorable: false,
    card: { k: 'cond', metas: ['x', 'n'], binds: [binder('H')], premises: [mem(x, H)], concl: mem({ k: 'pow', base: x, exp: nPoly }, H) } },
};
export const SUB_AXIOMS = ['sub.mul', 'sub.inv', 'sub.conj'] as const;

export function subSchema(id: string): Schema | null { return Object.hasOwn(SUB_SCHEMAS, id) ? SUB_SCHEMAS[id]! : null; }

/**
 * Availability: the kind's axioms wherever a subgroup is in scope; sub.e and sub.pow only when the level lists
 * them (sub.e is earned: never on the level that earns it).
 */
export function subAllowed(id: string, level: { subgroups?: SubgroupDecl[]; tools: { schemas: string[] }; unlocks: string[] }): boolean {
  if (!subSchema(id)) return false;
  if ((SUB_AXIOMS as readonly string[]).includes(id)) return subsIn(level).length > 0;
  return level.tools.schemas.includes(id) && !level.unlocks.includes(id);
}
