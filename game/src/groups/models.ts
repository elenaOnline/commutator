// LEMMA WORKS — Book phase C: the many-sorted finite-model oracle (KERNEL-EXT §5.7). Owner: kernel lead.
//
// A model interprets every sort, map, subgroup and atom a fact (or its dependencies) mentions:
//   • group sorts: the 14 catalogue groups (|S| = n givens filter); set sorts: {0..k−1}, k = 1..3;
//   • homs: every homomorphism between the assigned groups (generator images, BFS-checked);
//   • actions: every hom G → S_k (k = |Ω|) read as σ(g, p);
//   • plain maps: SOLVED where a given forces them (sections f(s(y)) = y; left inverses g(f(x)) = x — on the image,
//     free elsewhere), else every function while the count is small, else a seeded sample: that last case is logged
//     as BOUNDED (`modelLog`), never silently skipped (SYNTHESIS §4.1 pin 4);
//   • subgroups: every (normal) subgroup of their group (+ ∅ where e ∈ S is not granted);
//   • atoms: every value of their sort.
// Cards with structure parameters quantify over them: groups over the catalogue up to order 6, homs and actions
// between them, subgroups — that bound is logged too.
import type { Card, DeskAssumption, Fact, LevelManifest, MapDecl, PatFact, SortDecl, SortId, StructBinder, StructDecl, SubRef, Term } from '../kernel/types';
import { catalogue, type Assignment, type FiniteGroup } from './index';
import { evalPoly, groupPow, subgroupsOf } from './semantics';

/** How often each bounded fallback was taken (tests print it; a non-zero count is a visible weakening). */
export const modelLog: Record<string, number> = {};
const note = (k: string) => { modelLog[k] = (modelLog[k] ?? 0) + 1; };

type Fn = (args: number[]) => number;
export interface MModel {
  groups: Map<SortId, FiniteGroup>;
  sets: Map<SortId, number>;
  maps: Map<string, Fn>;
  subs: Map<string, number>; // subgroup id → index into subgroupsOf(group) or −1 (∅)
}
interface Sig { sorts: Map<SortId, SortDecl>; maps: Map<string, MapDecl>; atomSort: Map<string, SortId>; subSort: Map<string, SortId>; subNormal: Map<string, boolean> }

const sizeOf = (m: MModel, s: SortId): number => m.groups.get(s)?.order ?? m.sets.get(s) ?? 0;

// ───────────── evaluation ─────────────

interface Env { m: MModel; sig: Sig; atoms: Assignment; metas: Assignment; metaSort: Record<string, SortId>; binds: Record<string, string> }

/** Evaluate a term to [sort, value]. Hom / action binders and group binders resolve through env.binds. */
function ev(t: Term, E: Env): [SortId, number] {
  switch (t.k) {
    case 'atom': { const s = E.sig.atomSort.get(t.id) ?? 'G'; const v = E.atoms[t.id]; if (v === undefined) throw new Error(`model: no value for ${t.id}`); return [s, v]; }
    case 'meta': { const s = E.metaSort[t.id] ?? 'G'; const v = E.metas[t.id]; if (v === undefined) throw new Error(`model: no value for ${t.id}`); return [s, v]; }
    case 'e': { const s0 = t.s ?? 'G'; return [E.binds[s0] ?? s0, 0]; }
    case 'inv': { const [s, v] = ev(t.arg, E); return [s, grp(E, s).inv(v)]; }
    case 'mul': {
      let [s, v] = ev(t.fs[0]!, E);
      for (const f of t.fs.slice(1)) { const [, w] = ev(f, E); v = grp(E, s).mul(v, w); }
      return [s, v];
    }
    case 'pow': { const [s, v] = ev(t.base, E); return [s, groupPow(grp(E, s), v, evalPoly(t.exp, E.atoms, E.metas))]; }
    case 'app': {
      const id = E.binds[t.fn] ?? t.fn;
      const f = E.m.maps.get(id);
      const d = E.sig.maps.get(id);
      if (!f || !d) throw new Error(`model: no interpretation of ${t.fn}`);
      return [d.res, f(t.args.map((a) => ev(a, E)[1]))];
    }
    case 'int': throw new Error('model: an integer is not an element');
  }
}
function grp(E: Env, s: SortId): FiniteGroup {
  const G = E.m.groups.get(s);
  if (!G) throw new Error(`model: ${s} is not a group here`);
  return G;
}
function memberIn(E: Env, sub: SubRef, s: SortId, v: number): boolean {
  const id = sub.k === 'sub' ? sub.id : E.binds[sub.id] ?? sub.id;
  const i = E.m.subs.get(id) ?? (sub.k === 'submeta' ? E.metas[`§sub:${sub.id}`] : undefined);
  if (i === undefined) throw new Error(`model: no subgroup for ${sub.id}`);
  if (i === -1) return false;
  return subgroupsOf(grp(E, s)).at(i)?.members[v] === true;
}
function patHolds(p: PatFact, E: Env): boolean {
  if (p.k === 'mem') { const [s, v] = ev(p.t, E); return memberIn(E, p.sub, s, v); }
  const eqv = ev(p.l, E)[1] === ev(p.r, E)[1];
  return p.k === 'eq' ? eqv : !eqv;
}

// ───────────── structure enumeration ─────────────

const HOMS = new Map<string, number[][]>();
/** Every homomorphism G → H as an image table (generator images, BFS-checked). */
export function homsBetween(G: FiniteGroup, H: FiniteGroup): number[][] {
  const key = `${G.name}→${H.name}`;
  const hit = HOMS.get(key);
  if (hit) return hit;
  const gens = generators(G);
  const out: number[][] = [];
  const imgs = new Array<number>(gens.length).fill(0);
  const rec = (i: number) => {
    if (i === gens.length) { const t = extend(G, gens, imgs, (x, y) => H.mul(x, y)); if (t) out.push(t); return; }
    for (let h = 0; h < H.order; h++) { imgs[i] = h; rec(i + 1); }
  };
  rec(0);
  HOMS.set(key, out);
  return out;
}
const ACTS = new Map<string, number[][][]>();
/** Every action of G on {0..k−1}: per element g, the permutation p ↦ σ(g, p) (a hom G → S_k). */
export function actionsOn(G: FiniteGroup, k: number): number[][][] {
  const key = `${G.name}@${k}`;
  const hit = ACTS.get(key);
  if (hit) return hit;
  const perms: number[][] = [];
  const permRec = (cur: number[]) => { if (cur.length === k) { perms.push(cur); return; } for (let v = 0; v < k; v++) if (!cur.includes(v)) permRec([...cur, v]); };
  permRec([]);
  const pk = (p: number[]) => p.join(',');
  const idx = new Map(perms.map((p, i) => [pk(p), i]));
  const compose = (a: number, b: number) => idx.get(pk(perms[b]!.map((x) => perms[a]![x]!)))!; // (a∘b)(p) = a(b(p))
  const gens = generators(G);
  const out: number[][][] = [];
  const imgs = new Array<number>(gens.length).fill(0);
  const rec = (i: number) => {
    if (i === gens.length) { const t = extend(G, gens, imgs, compose, idx.get(pk(perms[0]!))!); if (t) out.push(t.map((pi) => perms[pi]!)); return; }
    for (let p = 0; p < perms.length; p++) { imgs[i] = p; rec(i + 1); }
  };
  rec(0);
  ACTS.set(key, out);
  return out;
}
const GENS = new Map<FiniteGroup, number[]>();
function generators(G: FiniteGroup): number[] {
  const hit = GENS.get(G);
  if (hit) return hit;
  const gens: number[] = [];
  const span = (gs: number[]) => { const seen = new Set([0]); const q = [0]; while (q.length) { const x = q.pop()!; for (const g of gs) { const y = G.mul(x, g); if (!seen.has(y)) { seen.add(y); q.push(y); } } } return seen; };
  let cur = span(gens);
  for (let g = 1; g < G.order && cur.size < G.order; g++) if (!cur.has(g)) { gens.push(g); cur = span(gens); }
  GENS.set(G, gens);
  return gens;
}
/** The map x ↦ φ(x) with φ(e) = id and φ(x·g) = φ(x)∘img(g) on generators; null if inconsistent (not a hom). */
function extend(G: FiniteGroup, gens: number[], imgs: number[], op: (a: number, b: number) => number, idImg = 0): number[] | null {
  const t = new Array<number>(G.order).fill(-1);
  t[0] = idImg;
  const q = [0];
  while (q.length) {
    const x = q.pop()!;
    for (let i = 0; i < gens.length; i++) {
      const y = G.mul(x, gens[i]!), v = op(t[x]!, imgs[i]!);
      if (t[y] === -1) { t[y] = v; q.push(y); } else if (t[y] !== v) return null;
    }
  }
  return t;
}

// ───────────── the signature of a level (plus Towers) ─────────────

export function signatureOf(level: LevelManifest, structs: StructDecl[] = [], vars: { id: string; carrier?: string; sort?: string }[] = []): Sig {
  const sorts = new Map<SortId, SortDecl>((level.sorts ?? []).map((s) => [s.id, s]));
  if (!sorts.has('G')) sorts.set('G', { id: 'G', kind: 'group', label: 'G' });
  const maps = new Map<string, MapDecl>((level.maps ?? []).map((m) => [m.id, m]));
  for (const st of structs) {
    if (st.k === 'grp') sorts.set(st.id, { id: st.id, kind: 'group', label: st.label });
    if (st.k === 'hom') maps.set(st.id, { id: st.id, label: st.label, args: [st.dom], res: st.cod, kind: 'hom' });
  }
  const atomSort = new Map<string, SortId>();
  for (const a of [...level.atoms, ...vars]) if (a.sort !== 'Z') atomSort.set(a.id, a.carrier ?? 'G');
  const subSort = new Map<string, SortId>(), subNormal = new Map<string, boolean>();
  for (const s of level.subgroups ?? []) { subSort.set(s.id, s.sort ?? 'G'); subNormal.set(s.id, s.normal === true); }
  for (const s of structs) if (s.k === 'sub') { subSort.set(s.id, s.sort ?? 'G'); subNormal.set(s.id, s.normal); }
  return { sorts, maps, atomSort, subSort, subNormal };
}

/** Symbols a fact mentions: atoms, maps, identity sorts, subgroups. */
function symbolsOf(f: Fact, acc: { atoms: Set<string>; z: Set<string>; maps: Set<string>; esorts: Set<string>; subs: Set<string> }) {
  const walk = (t: Term) => {
    switch (t.k) {
      case 'atom': acc.atoms.add(t.id); break;
      case 'e': acc.esorts.add(t.s ?? 'G'); break;
      case 'inv': walk(t.arg); break;
      case 'mul': t.fs.forEach(walk); break;
      case 'pow': walk(t.base); for (const m of t.exp) for (const x of m.monomial) if (x.ref.k === 'zvar') acc.z.add(x.ref.id); break;
      case 'app': acc.maps.add(t.fn); t.args.forEach(walk); break;
      default: break;
    }
  };
  const pats: PatFact[] = f.k === 'eq' || f.k === 'neq' ? [f] : f.k === 'mem' ? [f] : f.k === 'law' ? [{ k: 'eq', l: f.l, r: f.r }] : f.k === 'cond' ? [...f.premises, f.concl] : [];
  for (const p of pats) {
    if (p.k === 'mem') { walk(p.t); if (p.sub.k === 'sub') acc.subs.add(p.sub.id); } else { walk(p.l); walk(p.r); }
  }
}

const PLAIN_LIMIT = 4096;
/** Largest set sort in a model. */
export const SET_MAX = 4;
const SAMPLE = 300;
function rng(seed: number) { return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }; }

/**
 * Enumerate models of the symbols in `facts` (the node's fact and its dependencies), calling visit(model, env-base).
 * false from visit stops. `sizeFacts` filter group orders. Returns false iff stopped by visit.
 */
function everyModel(sig: Sig, facts: Fact[], withEmpty: boolean, visit: (m: MModel) => boolean, forcing: Fact[] = []): boolean {
  const acc = { atoms: new Set<string>(), z: new Set<string>(), maps: new Set<string>(), esorts: new Set<string>(), subs: new Set<string>() };
  for (const f of facts) symbolsOf(f, acc);
  // sorts in play: of atoms, maps (args/res), identities, subgroups; plus those of hom/act binders' fixed sorts
  const sortsUsed = new Set<SortId>();
  for (const a of acc.atoms) sortsUsed.add(sig.atomSort.get(a) ?? 'G');
  for (const m of acc.maps) { const d = sig.maps.get(m); if (d) { d.args.forEach((s) => sortsUsed.add(s)); sortsUsed.add(d.res); } }
  for (const s of acc.esorts) if (sig.sorts.has(s)) sortsUsed.add(s);
  for (const s of acc.subs) sortsUsed.add(sig.subSort.get(s) ?? 'G');
  for (const f of facts) if ((f.k === 'law' || f.k === 'cond') && f.metaSorts) for (const r of Object.values(f.metaSorts)) if (typeof r === 'string' && sig.sorts.has(r)) sortsUsed.add(r);
  if (!sortsUsed.size) sortsUsed.add('G');
  const sizes = facts.filter((f): f is Fact & { k: 'size' } => f.k === 'size');
  const groupSorts = [...sortsUsed].filter((s) => sig.sorts.get(s)?.kind === 'group').sort();
  const setSorts = [...sortsUsed].filter((s) => sig.sorts.get(s)?.kind === 'set').sort();
  const mapIds = [...acc.maps].filter((m) => sig.maps.has(m)).sort();
  // plain maps last, those forced by a law given after the maps they depend on
  const plain = mapIds.filter((m) => (sig.maps.get(m)!.kind ?? 'map') === 'map');
  const kinded = mapIds.filter((m) => (sig.maps.get(m)!.kind ?? 'map') !== 'map');
  // only HYPOTHESES force a map (never the claim under test)
  const forced = forcedPlans(plain, forcing);
  const orderedPlain = [...plain.filter((m) => !forced.has(m)), ...plain.filter((m) => forced.has(m))];
  const subIds = [...acc.subs].sort();
  const m: MModel = { groups: new Map(), sets: new Map(), maps: new Map(), subs: new Map() };
  const cat = catalogue();
  const goGroups = (i: number): boolean => {
    if (i === groupSorts.length) return goSets(0);
    const s = groupSorts[i]!;
    for (const G of cat) {
      if (sizes.some((z) => (z.s ?? 'G') === s && z.n !== G.order)) continue;
      m.groups.set(s, G);
      if (!goGroups(i + 1)) return false;
    }
    return true;
  };
  // sets of size 1–4 (architect 2026-10-15: so small-model thresholds bind honestly); with three or more set
  // sorts the product grows past the budget, so those levels stay at ≤ 3 — logged
  const setMax = setSorts.length >= 3 ? 3 : SET_MAX;
  if (setMax < SET_MAX) note('three or more set sorts: sets of size ≤ 3');
  const goSets = (i: number): boolean => {
    if (i === setSorts.length) return goKinded(0);
    for (let k = 1; k <= setMax; k++) { m.sets.set(setSorts[i]!, k); if (!goSets(i + 1)) return false; }
    return true;
  };
  const goKinded = (i: number): boolean => {
    if (i === kinded.length) return goPlain(0);
    const d = sig.maps.get(kinded[i]!)!;
    if (d.kind === 'hom') {
      const G = m.groups.get(d.args[0]!), H = m.groups.get(d.res);
      if (!G || !H) return true;
      for (const t of homsBetween(G, H)) { m.maps.set(d.id, (a) => t[a[0]!]!); if (!goKinded(i + 1)) return false; }
    } else {
      const G = m.groups.get(d.args[0]!), k = m.sets.get(d.args[1]!) ?? m.groups.get(d.args[1]!)?.order;
      if (!G || !k || k > 4) { note('action on a set larger than 4 (skipped)'); return true; }
      for (const t of actionsOn(G, k)) { m.maps.set(d.id, (a) => t[a[0]!]![a[1]!]!); if (!goKinded(i + 1)) return false; }
    }
    return true;
  };
  const goPlain = (i: number): boolean => {
    if (i === orderedPlain.length) return goSubs(0);
    const d = sig.maps.get(orderedPlain[i]!)!;
    const dom = d.args.map((s) => sizeOf(m, s)), cod = sizeOf(m, d.res);
    const n = dom.reduce((x, y) => x * y, 1);
    const idx = (a: number[]) => a.reduce((acc0, v, j) => acc0 * dom[j]! + v, 0);
    const plan = forced.get(d.id);
    // choices per input: forced plans narrow them, else every value
    const choice: number[][] = Array.from({ length: n }, () => Array.from({ length: cod }, (_, v) => v));
    if (plan && dom.length === 1) {
      const other = m.maps.get(plan.other);
      if (other) {
        if (plan.k === 'section') { // other(this(y)) = y: this(y) ∈ other⁻¹(y)
          for (let y = 0; y < n; y++) choice[y] = choice[y]!.filter((x) => other([x]) === y);
        } else { // this(other(x)) = x: forced on im(other)
          const od = sizeOf(m, sig.maps.get(plan.other)!.args[0]!);
          for (let x = 0; x < od; x++) { const y = other([x]); choice[y] = choice[y]!.filter((v) => v === x); }
        }
      }
    }
    if (choice.some((c) => !c.length)) return true; // no such map in this model
    const total = choice.reduce((p, c) => p * c.length, 1);
    const table = new Array<number>(n).fill(0);
    m.maps.set(d.id, (a) => table[idx(a)]!);
    if (total <= PLAIN_LIMIT) {
      const rec = (j: number): boolean => { if (j === n) return goPlain(i + 1); for (const v of choice[j]!) { table[j] = v; if (!rec(j + 1)) return false; } return true; };
      return rec(0);
    }
    note(`plain map ${d.label}: ${total} functions, sampled ${SAMPLE}`);
    const r = rng(0x9e3779b9 ^ total);
    for (let k = 0; k < SAMPLE; k++) {
      for (let j = 0; j < n; j++) table[j] = choice[j]![Math.floor(r() * choice[j]!.length)]!;
      if (!goPlain(i + 1)) return false;
    }
    return true;
  };
  const goSubs = (i: number): boolean => {
    if (i === subIds.length) return visit(m);
    const id = subIds[i]!;
    const G = m.groups.get(sig.subSort.get(id) ?? 'G');
    if (!G) return true;
    const idx = subgroupsOf(G).map((sg, k) => (sig.subNormal.get(id) && !sg.normal ? -2 : k)).filter((k) => k >= 0);
    for (const k of withEmpty ? [-1, ...idx] : idx) { m.subs.set(id, k); if (!goSubs(i + 1)) return false; }
    return true;
  };
  return goGroups(0);
}

/** Recognized forcing givens (law cards): `A(s(y)) = y` makes s a section of A; `g(A(x)) = x` a left inverse of A. */
function forcedPlans(plain: string[], facts: Fact[]): Map<string, { k: 'section' | 'left'; other: string }> {
  const out = new Map<string, { k: 'section' | 'left'; other: string }>();
  for (const f of facts) {
    if (f.k !== 'law' || f.metas.length !== 1) continue;
    const y = f.metas[0]!;
    for (const [lhs, rhs] of [[f.l, f.r], [f.r, f.l]] as const) {
      if (rhs.k !== 'meta' || rhs.id !== y || lhs.k !== 'app' || lhs.args.length !== 1) continue;
      const inner = lhs.args[0]!;
      if (inner.k !== 'app' || inner.args.length !== 1 || inner.args[0]!.k !== 'meta' || (inner.args[0] as { id: string }).id !== y) continue;
      if (plain.includes(inner.fn) && !out.has(inner.fn) && inner.fn !== lhs.fn) out.set(inner.fn, { k: 'section', other: lhs.fn });
      else if (plain.includes(lhs.fn) && !out.has(lhs.fn) && inner.fn !== lhs.fn) out.set(lhs.fn, { k: 'left', other: inner.fn });
    }
  }
  return out;
}

// ───────────── truth ─────────────

const BINDER_GROUPS = () => catalogue().filter((G) => G.order <= 6);

/** Truth of a fact in a model under an atom assignment (cards quantify their metas and structure parameters). */
export function holdsM(m: MModel, sig: Sig, f: Fact, atoms: Assignment): boolean {
  const base: Env = { m, sig, atoms, metas: Object.create(null), metaSort: {}, binds: {} };
  switch (f.k) {
    case 'eq': case 'neq': case 'mem': return patHolds(f, base);
    case 'bot': return false;
    case 'size': { const G = m.groups.get(f.s ?? 'G'); return !!G && G.order === f.n; }
    case 'law': case 'cond': return cardHolds(m, sig, f, atoms);
  }
}

function cardHolds(m: MModel, sig: Sig, c: Card, atoms: Assignment): boolean {
  const binds = c.binds ?? [];
  const zs = new Set<string>();
  const walkZ = (t: Term) => { if (t.k === 'pow') { walkZ(t.base); for (const x of t.exp) for (const y of x.monomial) if (y.ref.k === 'zmeta') zs.add(y.ref.id); } else if (t.k === 'inv') walkZ(t.arg); else if (t.k === 'mul') t.fs.forEach(walkZ); else if (t.k === 'app') t.args.forEach(walkZ); };
  const pats: PatFact[] = c.k === 'law' ? [{ k: 'eq', l: c.l, r: c.r }] : [...c.premises, c.concl];
  for (const p of pats) (p.k === 'mem' ? [p.t] : [p.l, p.r]).forEach(walkZ);
  if (binds.some((b) => b.k !== 'sub')) note('card over groups/homs: binder groups of order ≤ 6');
  // extend the model with binder interpretations, then quantify the element metas
  const sig2: Sig = { ...sig, sorts: new Map(sig.sorts), maps: new Map(sig.maps) };
  const m2: MModel = { groups: new Map(m.groups), sets: new Map(m.sets), maps: new Map(m.maps), subs: new Map(m.subs) };
  const bindVal: Record<string, string> = {};
  const sortOfRef = (r: string | { k: 'sortmeta'; id: string }) => (typeof r === 'string' ? (bindVal[r] ?? r) : bindVal[r.id] ?? r.id);
  const metasOfSort = (): Record<string, SortId> => {
    const out: Record<string, SortId> = {};
    for (const mm of c.metas) if (!zs.has(mm)) out[mm] = c.metaSorts?.[mm] ? sortOfRef(c.metaSorts[mm]!) : 'G';
    return out;
  };
  const goB = (i: number): boolean => {
    if (i === binds.length) return metasAll();
    const b = binds[i]!;
    switch (b.k) {
      case 'grp': for (const G of (m.groups.size || sig.sorts.size > 1 ? BINDER_GROUPS() : catalogue())) {
        const id = `§${b.id}`; bindVal[b.id] = id; sig2.sorts.set(id, { id, kind: 'group', label: b.id }); m2.groups.set(id, G);
        if (!goB(i + 1)) return false;
      } return true;
      case 'set': for (let k = 1; k <= SET_MAX; k++) {
        const id = `§${b.id}`; bindVal[b.id] = id; sig2.sorts.set(id, { id, kind: 'set', label: b.id }); m2.sets.set(id, k);
        if (!goB(i + 1)) return false;
      } return true;
      case 'hom': {
        const D = sortOfRef(b.dom), C = sortOfRef(b.cod);
        const G = m2.groups.get(D), H = m2.groups.get(C);
        if (!G || !H) return true;
        const id = `§${b.id}`; bindVal[b.id] = id; sig2.maps.set(id, { id, label: b.id, args: [D], res: C, kind: 'hom' });
        for (const t of homsBetween(G, H)) { m2.maps.set(id, (a) => t[a[0]!]!); if (!goB(i + 1)) return false; }
        return true;
      }
      case 'act': {
        const D = sortOfRef(b.grp), O = sortOfRef(b.on);
        const G = m2.groups.get(D), k = m2.sets.get(O);
        if (!G || !k) return true;
        const id = `§${b.id}`; bindVal[b.id] = id; sig2.maps.set(id, { id, label: b.id, args: [D, O], res: O, kind: 'action' });
        for (const t of actionsOn(G, k)) { m2.maps.set(id, (a) => t[a[0]!]![a[1]!]!); if (!goB(i + 1)) return false; }
        return true;
      }
      case 'sub': {
        const S = b.sort ? sortOfRef(b.sort) : 'G';
        const G = m2.groups.get(S);
        if (!G) return true;
        const idx = subgroupsOf(G).map((sg, k) => (b.normal && !sg.normal ? -2 : k)).filter((k) => k >= 0);
        const id = `§${b.id}`; bindVal[b.id] = id; sig2.subSort.set(id, S);
        for (const k of idx) { m2.subs.set(id, k); if (!goB(i + 1)) return false; }
        return true;
      }
    }
  };
  const metasAll = (): boolean => {
    const ms = metasOfSort();
    const ids = Object.keys(ms), zids = [...zs];
    const metas: Assignment = Object.create(null);
    const E: Env = { m: m2, sig: sig2, atoms, metas, metaSort: ms, binds: bindVal };
    const goM = (j: number): boolean => {
      if (j === ids.length) return goZ(0);
      const n = sizeOf(m2, ms[ids[j]!]!);
      for (let v = 0; v < n; v++) { metas[ids[j]!] = v; if (!goM(j + 1)) return false; }
      return true;
    };
    const goZ = (j: number): boolean => {
      if (j === zids.length) return c.k === 'law' ? patHolds({ k: 'eq', l: c.l, r: c.r }, E) : !c.premises.every((p) => patHolds(p, E)) || patHolds(c.concl, E);
      for (let v = -6; v <= 6; v++) { metas[zids[j]!] = v; if (!goZ(j + 1)) return false; }
      return true;
    };
    return goM(0);
  };
  return goB(0);
}

// ───────────── the check ─────────────

/** A room's hypotheses as facts, in desk order. */
function roomFacts(room: { kind: string; l: Term; r: Term; rel?: string; assumes?: DeskAssumption[] }): Fact[] {
  if (room.kind === 'assume' && room.assumes?.length) return room.assumes.map((a): Fact => (a.rel === 'mem' ? { k: 'mem', t: a.t, sub: a.sub } : { k: a.rel, l: a.l, r: a.r }));
  const k = room.kind === 'suppose' ? 'eq' : room.kind === 'classical' ? 'neq' : room.rel === 'neq' ? 'neq' : 'eq';
  return [{ k, l: room.l, r: room.r }];
}

/**
 * The many-sorted oracle: every node's fact holds in every model of its dependencies (models above). Atoms range
 * over their sort's carrier. Returns violations (as oracleCheck).
 */
export function oracleCheckM(level: LevelManifest, factsByNode: Record<string, { fact?: Fact; deps: string[]; ok: boolean }>,
  rooms: { id: string; kind: string; l: Term; r: Term; rel?: string; assumes?: DeskAssumption[] }[],
  vars: { id: string; carrier?: string; sort?: string }[] = [], structs: StructDecl[] = []): string[] {
  const sig = signatureOf(level, structs, vars);
  const withEmpty = !(level.tools.schemas.includes('sub.e') && !level.unlocks.includes('sub.e'));
  const deps = new Map<string, Fact>();
  for (const g of level.givens) deps.set(`g:${g.id}`, g.fact);
  for (const r of rooms) roomFacts(r).forEach((f, i) => deps.set(i ? `a:${r.id}/${i}` : `a:${r.id}`, f));
  const out: string[] = [];
  // the same statement on the same hypotheses is one obligation (floors repeat facts along belts)
  const done = new Set<string>();
  for (const [id, node] of Object.entries(factsByNode)) {
    const fact = node.fact;
    if (!node.ok || !fact || fact.k === 'size') continue;
    const missing = node.deps.filter((d) => !deps.has(d));
    if (missing.length) { out.push(`Node ${id}: unresolved dependencies ${missing.join(', ')}`); continue; }
    const key = JSON.stringify([fact, [...node.deps].sort()]);
    if (done.has(key)) continue;
    done.add(key);
    const prem = node.deps.map((d) => deps.get(d)!);
    const acc = { atoms: new Set<string>(), z: new Set<string>(), maps: new Set<string>(), esorts: new Set<string>(), subs: new Set<string>() };
    for (const f of [fact, ...prem]) symbolsOf(f, acc);
    // a CLOSED card (a lemma: no level symbol, every sort a parameter) does not depend on the level's model —
    // check it once instead of once per model of the level's sorts
    if (!prem.length && (fact.k === 'law' || fact.k === 'cond') && !acc.atoms.size && !acc.z.size && !acc.subs.size
      && [...acc.maps].every((m0) => (fact.binds ?? []).some((b) => b.id === m0))
      && [...acc.esorts].every((e0) => (fact.binds ?? []).some((b) => b.id === e0))
      && Object.values(fact.metaSorts ?? {}).every((r) => typeof r !== 'string')
      && (fact.binds ?? []).some((b) => b.k === 'grp')) {
      const empty: MModel = { groups: new Map(), sets: new Map(), maps: new Map(), subs: new Map() };
      if (!holdsM(empty, sig, fact, Object.create(null))) out.push(`Node ${id}: ${fact.k} fails for some interpretation of its parameters`);
      continue;
    }
    const atomIds = [...acc.atoms].sort(), zIds = [...acc.z].sort();
    let budget = 1_000_000;
    let violation: string | null = null;
    // hypotheses that mention no atom / ℤ Tower (e.g. ∀-givens) depend only on the model: test them once per model
    const atomFree = (f: Fact) => { const x = { atoms: new Set<string>(), z: new Set<string>(), maps: new Set<string>(), esorts: new Set<string>(), subs: new Set<string>() }; symbolsOf(f, x); return !x.atoms.size && !x.z.size; };
    const premModel = prem.filter(atomFree), premAtoms = prem.filter((f) => !atomFree(f));
    everyModel(sig, [fact, ...prem], withEmpty, (m) => {
      const s: Assignment = Object.create(null);
      if (!premModel.every((p) => holdsM(m, sig, p, s))) return true;
      const goA = (j: number): boolean => {
        if (j === atomIds.length) return goZ(0);
        const n = sizeOf(m, sig.atomSort.get(atomIds[j]!) ?? 'G');
        for (let v = 0; v < n; v++) { s[atomIds[j]!] = v; if (!goA(j + 1)) return false; }
        return true;
      };
      const goZ = (j: number): boolean => {
        if (j === zIds.length) {
          if (--budget < 0) return false;
          if (!premAtoms.every((p) => holdsM(m, sig, p, s)) || holdsM(m, sig, fact, s)) return true;
          violation = `Node ${id}: ${fact.k} fails with ${[...m.groups].map(([k, G]) => `${k}=${G.name}`).join(', ')} ${JSON.stringify(s)}`;
          return false;
        }
        for (let v = -6; v <= 6; v++) { s[zIds[j]!] = v; if (!goZ(j + 1)) return false; }
        return true;
      };
      return goA(0);
    }, prem);
    if (violation) out.push(violation);
    else if (budget < 0) note('evaluation budget (10⁶) reached for one node');
  }
  return out;
}

/** Is a map constant in this model (one value on its whole domain)? */
function constantMap(m: MModel, d: MapDecl): boolean {
  const f = m.maps.get(d.id);
  if (!f) return true;
  const sizes = d.args.map((s) => sizeOf(m, s));
  const seen = new Set<number>();
  const rec = (args: number[]): boolean => {
    if (args.length === sizes.length) { seen.add(f(args)); return seen.size < 2; }
    for (let v = 0; v < sizes[args.length]!; v++) if (!rec([...args, v])) return false;
    return true;
  };
  rec([]);
  return seen.size < 2;
}

/**
 * Hom / action parameters of a dock's ∀ target (Hom-Tower levels with no level maps, e.g. P9.3, P9.4, P14.1, P16.1):
 * how many interpretations make some hom or action non-constant (catalogue groups, sets of size ≤ SET_MAX).
 */
export function nontrivialBinderModels(target: Card, cap = 10_000): number {
  const binds = target.binds ?? [];
  const homs = binds.filter((b) => b.k === 'hom' || b.k === 'act');
  if (!homs.length) return 0;
  const val: Record<string, FiniteGroup | number> = {};
  const ref = (r: string | { k: 'sortmeta'; id: string }) => (typeof r === 'string' ? r : r.id);
  let count = 0;
  // group / set parameters, plus any level group a hom parameter names directly (it ranges over the catalogue too)
  const sortsOf: { k: 'grp' | 'set'; id: string }[] = binds.filter((b): b is StructBinder & { k: 'grp' | 'set' } => b.k === 'grp' || b.k === 'set').map((b) => ({ k: b.k, id: b.id }));
  for (const b of homs) for (const r of b.k === 'hom' ? [b.dom, b.cod] : [b.grp]) {
    const id = ref(r);
    if (!sortsOf.some((x) => x.id === id)) sortsOf.push({ k: 'grp', id });
  }
  const goSorts = (i: number): boolean => {
    if (i === sortsOf.length) return goMaps(0, false);
    const b = sortsOf[i]!;
    if (b.k === 'grp') { for (const G of catalogue()) { val[b.id] = G; if (!goSorts(i + 1)) return false; } }
    else for (let k = 1; k <= SET_MAX; k++) { val[b.id] = k; if (!goSorts(i + 1)) return false; }
    return true;
  };
  const grpOf = (r: string | { k: 'sortmeta'; id: string }) => { const v = val[ref(r)]; return typeof v === 'object' ? v : catalogue().find((G) => G.order === 1)!; };
  const goMaps = (j: number, nontrivial: boolean): boolean => {
    if (j === homs.length) { if (nontrivial) count++; return count < cap; }
    const b = homs[j]!;
    if (b.k === 'hom') {
      for (const t of homsBetween(grpOf(b.dom), grpOf(b.cod))) if (!goMaps(j + 1, nontrivial || new Set(t).size > 1)) return false;
    } else if (b.k === 'act') {
      const k = val[ref(b.on)];
      if (typeof k !== 'number') return true;
      for (const t of actionsOn(grpOf(b.grp), k)) if (!goMaps(j + 1, nontrivial || t.some((perm) => perm.some((v, p) => v !== p)))) return false;
    }
    return true;
  };
  goSorts(0);
  return count;
}

/** Book phase C, pin 4: nontrivial models of a dock's allowed givens in a many-sorted level (see nontrivialModels). */
export function nontrivialModelsM(level: LevelManifest, socketId: string, cap = 10_000): number {
  const sock = level.sockets.find((s) => s.id === socketId);
  if (!sock) throw new Error(`no socket ${socketId}`);
  const givens = level.givens.filter((g) => sock.allowedGivens.includes(g.id)).map((g) => g.fact);
  const sig = signatureOf(level);
  const withEmpty = !(level.tools.schemas.includes('sub.e') && !level.unlocks.includes('sub.e'));
  const acc = { atoms: new Set<string>(), z: new Set<string>(), maps: new Set<string>(), esorts: new Set<string>(), subs: new Set<string>() };
  for (const f of [...givens, sock.target]) symbolsOf(f, acc);
  const atomIds = [...acc.atoms].sort();
  let count = 0;
  const usedMaps = [...acc.maps].filter((id) => sig.maps.has(id));
  everyModel(sig, [...givens, sock.target], withEmpty, (m) => {
    // nontrivial: a group of order ≥ 2; or, in a level of sets only, a set of size ≥ 2 and some map not constant
    if (m.groups.size) { if (![...m.groups.values()].some((G) => G.order >= 2)) return true; }
    else {
      if (![...m.sets.values()].some((k) => k >= 2)) return true;
      if (usedMaps.length && !usedMaps.some((id) => !constantMap(m, sig.maps.get(id)!))) return true;
    }
    const s: Assignment = Object.create(null);
    const goA = (j: number): boolean => {
      if (j === atomIds.length) { if (givens.every((f) => holdsM(m, sig, f, s))) count++; return count < cap; }
      const n = sizeOf(m, sig.atomSort.get(atomIds[j]!) ?? 'G');
      for (let v = 0; v < n; v++) { s[atomIds[j]!] = v; if (!goA(j + 1)) return false; }
      return true;
    };
    return goA(0);
  }, givens);
  return count;
}

export type { StructBinder };
