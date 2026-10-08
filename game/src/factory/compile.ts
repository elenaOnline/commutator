// LEMMA WORKS v3 — canvas → ProofGraph compiler (owner: COMPILER builder).
//
// Reference: design/v3/proposals/sol-compiler.md §4–§8 (DESIGN.md wins: axioms are built into the
// Canceller / Expander / Popper; sockets accept either orientation via a recorded swap).
//
// Pure and deterministic. The compiler only *proposes* kernel nodes; `check` is the only authority.
// Preview evaluation (evalStep / applyCore) is used to resolve targets and substitutions while lowering;
// every fact and card that leaves a machine is taken from the final `check` result, never from the
// preview. Messages are in mathematical language (see JAMS below — the jam message catalogue).
import type { KernelCtx } from '../kernel';
import { evalStep } from '../kernel';
import type {
  AtomDecl, AxiomId, Card, CheckResult, Fact, GapAddr, MetaId, NodeId, Pallet, PatFact, ProofGraph, ProofNode,
  Room as KRoom, RuleRef, ScopeId, StepOp, Subst, Term, Addr,
} from '../kernel/types';
import { ROOT } from '../kernel/types';
import { applyCore, axiomCard, check as kcheck, checkGround, checkInt, flipConclusion, nodeUses, schemaInfo, stackWordHint, withVars, pressCard, resolveCond, resolveLaw, sameCardUpToRenaming, schemaCard } from '../kernel/logic';
import { E, KErr, instantiate, instantiatePartial, match, matchOpen, metasOf, norm, same, substKey, word } from '../kernel/terms';
import { polyRefs } from '../kernel/poly';
import { factText, labelsOf, substText, termText, type Labels } from '../kernel/print';
import type {
  Belt, Canvas, Compiled, ItemKind, ItemValue, LibRef, Machine, MachineResult, Param, Port, Rect, SpanTarget, Tile,
} from './types';
import { itemKindOf } from './types';
import { FACE_DELTA, footprint, portsOf, frontOf, inRect, tileKey } from './geometry';
import { SPECS, varLabel } from './catalog';
import { LEVEL_BY_ID } from '../levels/levels';
import type { SavedLemma } from '../state/factoryStore';
import {
  RAIL_ORDER, cancelCandidates, gapAddr, gapCandidates, resolveGapPin, resolveSpanPin, spanAddr, spanCandidates,
  spanCount, type GapLoc, type SpanLoc,
} from './targeting';

// ───────────────────────────── jam message catalogue ─────────────────────────────

const NOUN: Record<ItemKind, string> = {
  term: 'an element', eq: 'an equation', neq: 'an inequation', bot: 'a contradiction (⊥)',
  size: 'the order of the group', law: 'a law', cond: 'a conditional theorem',
};
const nounList = (ks: ItemKind[]) => {
  const ns = [...new Set(ks.map((k) => NOUN[k]))];
  return ns.length <= 1 ? (ns[0] ?? 'nothing') : `${ns.slice(0, -1).join(', ')} or ${ns[ns.length - 1]}`;
};
const sideWord = (s: 'l' | 'r') => (s === 'r' ? 'right' : 'left');

/** Every message the compiler can show, in one place. `{…}` parts are interpolated by the caller. */
export const JAMS = {
  // wiring / types
  notConnected: (port: string, ks: ItemKind[]) => `not connected: the ${port} inlet needs ${nounList(ks)}`,
  waiting: (who: string, ks: ItemKind[]) => `waiting on ${who} upstream: it cannot supply ${nounList(ks)} yet`,
  wrongKind: (ks: ItemKind[], got: string, gotKind: ItemKind) => `this inlet needs ${nounList(ks)}; ${got} is ${NOUN[gotKind]}`,
  ruleNeq: (f: string) => `this rule is an inequation (${f}); a rewrite needs an equation — ${f} says nothing about replacing one side by the other`,
  ruleCond: (f: string) => `${f} is conditional: route it into an Apply machine with its premises; only the resulting equation can rewrite`,
  ruleOther: (f: string, k: ItemKind) => `${f} is ${NOUN[k]}, not an equation or a law; it cannot rewrite`,
  belt: (msg: string) => `the belt into this inlet is disabled: ${msg}`,
  cycle: 'circular: this machine’s output feeds back into its own inputs',
  // knobs
  chooseElement: (what: string) => `choose an element for ${what}`,
  // targets
  noCancel: (side: string, rail: string) => `nothing to cancel: there is no element next to its inverse in the incoming ${side} side ${rail}`,
  noCancelAnywhere: (q: string) => `nothing to cancel: no x x⁻¹ or x⁻¹x anywhere in ${q}`,
  pinGone: (sel: string, side: string, rail: string) => `no ${sel} here: the incoming ${side} side is ${rail}`,
  pinAmbiguous: (sel: string, side: string) => `${sel} now occurs in several places on the ${side} side with the same neighbours; pick its bracket again`,
  gapGone: (side: string, rail: string) => `the pinned gap is no longer there: the incoming ${side} side is ${rail}`,
  gapAmbiguous: (side: string) => `the pinned gap now fits several places on the ${side} side; pick it again`,
  notInverses: (sel: string) => `${sel} is not an element next to its inverse`,
  noE: (q: string) => `there is no e beside another factor in ${q}`,
  soleE: 'a sole e cannot be removed: an empty product is not an element',
  notE: (sel: string) => `${sel} is not a single e`,
  noRedex: (pat: string, q: string, name: string) => `there is no ${pat} in ${q} for ${name}`,
  pinMismatch: (sel: string, name: string, src: string) => `the bracketed part is ${sel}, but ${name} needs ${src} here`,
  needsMeta: (m: string) => `the law needs an element for ${m}: set it on the machine`,
  notAVariable: (m: string) => `${m} is not a variable of this law`,
  ruleNotE: (name: string, dir: string) => `the ${dir} side of ${name} is not e for any choice of its variables; the Expander can only grow e into a rule side equal to e`,
  expanderMetas: (name: string, ms: string) => `${name} needs elements for ${ms}; the Expander supplies one (x) — use a Rewriter at an inserted e`,
  // apply / stamps
  premiseCount: (name: string, n: number, m: number) => `${name} takes ${n} premise${n === 1 ? '' : 's'}, but this machine has ${m} premise inlet${m === 1 ? '' : 's'}`,
  premiseShape: (i: string, want: string, got: string) => `${i} must read ${want}, but it reads ${got}`,
  noChoice: (name: string) => `${name} does not fit the incoming premises at any choice of its variables`,
  choiceGone: (n: number, k: number) => `choice ${n + 1} no longer exists (${k} fit now); pick one again`,
  applyNotCard: (f: string) => `${f} is not a universal statement; there is nothing to apply`,
  // anvil
  anvilKinds: 'a contradiction needs one equation and one inequation',
  // rooms & scope
  straddle: (name: string) => `${name} straddles the boundary of a room; place it wholly in one scope`,
  roomOverlap: 'this room partially overlaps another room; rooms must nest or stay apart',
  noRoom: 'this belongs to no room on the floor',
  leakFact: (f: string, sup: string) => `${f} still depends on the supposition ${sup} — it can only leave the room through the room’s gate`,
  leakItem: (it: string) => `${it} cannot leave its room on a belt; only the exit gate crosses outward — build it outside the room`,
  leakSibling: 'a belt cannot pass from one room into another; only the exit gate crosses outward',
  // belts
  beltPort: 'this belt’s end is not attached to a matching port',
  beltDuplicate: 'this inlet already has a belt; one inlet takes one supplier',
  beltCross: 'this belt runs along another line; belts may only cross at right angles',
  beltBrokenIn: (why: string) => `the belt into this inlet is broken (${why}); re-route it`,
  beltThrough: 'this belt runs through a machine',
  beltBroken: 'this belt’s path is broken (its cells are not consecutive)',
  beltRejoin: 'branches of one line cannot rejoin',
  // sockets
  socketWrong: (want: string, got: string) => `this dock needs ${want}, but the belt delivers ${got}`,
  socketNotRoot: 'this dock takes only finished proofs from outside every room',
  noGiven: (id: string) => `there is no given “${id}” in this work order`,
  noSocket: (id: string) => `there is no goal “${id}” in this work order`,
  budget: 'this expression has too many possible matches; choose a smaller construction',
  // v4
  chooseRecipe: 'choose a recipe',
  unknownRecipe: 'this recipe is not one this machine knows',
  oldMachine: (k: string) => `a “${k}” belongs to an older factory; replace it with a v4 machine`,
  undeclared: (x: string) => `${x}'s Tower was deleted — undo, or place a Tower and rename it ${x} to reconnect`,
  tooLarge: 'this is too large to check here (a size limit, not a mathematical verdict)',
  intFromBelt: (m: string) => `${m} is an integer; set it on the machine (a belt carries group elements, not integers)`,
  needsInt: (m: string) => `the law needs an integer for ${m}: set it on the machine`,
  towerUnnamed: 'this Tower has no name yet',
  towerDup: (x: string, who: string) => `${x} is already declared by ${who}; every Tower needs a fresh name`,
  noLagrange: 'Lagrange needs a group-size given |G| = n',
  libNotRule: (f: string, k: ItemKind) => `${f} is ${NOUN[k]}; a rewrite needs an equation or a law`,
  libNotCard: (f: string, k: ItemKind) => `${f} is ${NOUN[k]}, not a theorem with premises; a Theorem needs a law or a conditional card`,
  forallLibrary: 'a library card is already universal; ∀ needs a fact or card made on this floor',
  forallEigen: (sup: string, x: string) => `this depends on the supposition ${sup}, which mentions ${x}, so it is not about every ${x} — export it through an Assume room's gate first (giving ${sup} ⇒ …), then generalize`,
  assumeGate: (f: string) => `an Assume room exports an implication P ⇒ Q for an equation or inequation Q; ${f} is not one`,
  socketNeedsCard: (want: string, got: string) => `this dock needs the universal statement ${want}, but the belt delivers ${got} — generalize it with a ∀ machine first`,
  socketLibrary: 'this dock needs a proof made on this floor, not a library card',
  socketStack: (want: string, have: string, needed: string, hint: string) => `this dock needs ${want}: the belt carries ${have} where the goal has ${needed} — ${hint}`,
  // Lemma Book
  lemmaNotCard: 'only a ∀ machine or an Assume room’s gate makes a lemma',
  lemmaNotReady: (why: string) => `this machine has no finished card yet: ${why}`,
  lemmaInRoom: 'this card is still inside a room; a lemma must be proved at the floor’s root',
  lemmaGiven: (g: string) => `uses given ${g} — global lemmas need no level givens`,
  lemmaConst: (a: string) => `still mentions the level constant ${a} — build it with a Tower instead`,
  lemmaVar: (x: string) => `still mentions ${x} freely — generalize it with a ∀ machine`,
  lemmaSupposition: (sup: string) => `depends on the supposition ${sup} — export it through the room's gate first`,
  lemmaSelf: 'a lemma cannot be used in its own proof (or in a proof saved before it)',
  lemmaChanged: 'the saved proof no longer produces this exact card',
  gatePlace: 'this gate is not on its own room’s wall facing out; only a room’s own gate crosses its boundary',
  deskPlace: 'this desk is not inside its own room',
} as const;

/** Rewrite the kernel's "z is not an element of this work order" for an undeclared variable. */
function undeclared(msg: string): string {
  if (msg.startsWith('RESOURCE_LIMIT')) return JAMS.tooLarge;
  const m = /^(.+) is not (?:an element|an integer variable) of this work order$/.exec(msg);
  return m && /^[A-Za-z]+[_0-9₀-₉]+$/.test(m[1]!) ? JAMS.undeclared(varLabel(m[1]!)) : msg;
}

/** Matching budget per machine (intervals examined), §10. */
const MATCH_BUDGET = 50_000;

// ───────────────────────────── extra compile output (runtime + lens) ─────────────────────────────

export interface PlanMachine {
  /** Periodic source (Spool with a knob, Hopper, Given, Desk, Card Dock). */
  source: boolean;
  /** Manifest socket id, for docks. */
  socket?: string;
  ok: boolean;
  /** Inputs a job needs: consumed buffers, and catalysts (rule/card slots: latched until an edit). */
  ins: { port: string; catalyst: boolean }[];
  duration: number;
}

export interface RunPlan {
  machines: Record<string, PlanMachine>;
  /** Transport graph: location key → successor keys (atomic multicast), ordered deterministically. */
  succ: Record<string, string[]>;
  /** Machine id → enabled belts leaving its output (sorted by id): one atomic multicast. */
  routes: Record<string, string[]>;
  /** Enabled belts. */
  active: string[];
  /** Occupied cells per machine (for metrics, which have no KernelCtx). */
  footprints: Record<string, Tile[]>;
  /** Input location key → the machine whose output feeds it. */
  feeds: Record<string, string>;
}

/** compile() result: the Compiled contract plus starvation causes and the runtime plan. */
export interface CompiledX extends Compiled {
  /** Machine id → id of the machine whose jam ultimately starves it (absent if not caused upstream). */
  cause: Record<string, string>;
  plan: RunPlan;
}

/** Location keys used by the runtime plan. */
export const LK = {
  out: (m: string) => `O|${m}`,
  in: (m: string, port: string) => `I|${m}|${port}`,
  belt: (belt: string, i: number) => `B|${belt}|${i}`,
};

// ───────────────────────────── helpers ─────────────────────────────

class Halt { constructor(public k: 'starved' | 'jammed', public reason: string, public cause?: string) {} }
const jam = (reason: string): never => { throw new Halt('jammed', reason); };
const starve = (reason: string, cause?: string): never => { throw new Halt('starved', reason, cause); };

const nodeId = (m: string, role: string) => `${m}#${role}`;
const area = (r: Rect) => r.w * r.h;
const rectInside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const rectDisjoint = (a: Rect, b: Rect) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Order substitutions per §6: vector of word lengths for bound metas (ascending meta id), then substKey. */
export function sortSubsts(ss: Subst[]): Subst[] {
  const vec = (s: Subst) => Object.keys(s).sort(cmp).map((k) => word(norm(s[k]!)).length);
  return [...ss].sort((a, b) => {
    const va = vec(a), vb = vec(b);
    for (let i = 0; i < Math.min(va.length, vb.length); i++) if (va[i] !== vb[i]) return va[i]! - vb[i]!;
    if (va.length !== vb.length) return va.length - vb.length;
    return cmp(substKey(a), substKey(b));
  });
}

function matchFact(p: PatFact, f: Fact, s0: Subst): Subst[] {
  if (f.k !== p.k) return [];
  const out: Subst[] = [];
  for (const s1 of match(p.l, f.l, s0)) out.push(...match(p.r, f.r, s1));
  return out;
}

/** Where each meta of a premise pattern sits on the premise fact under σ (for drawing cuts / prefixes). */
export function bindingsOn(fact: Pallet, prem: PatFact, s: Subst): { meta: MetaId; addr: Addr }[] {
  if (fact.k !== 'eq' && fact.k !== 'neq') return [];
  const out: { meta: MetaId; addr: Addr }[] = [];
  const walk = (side: 'l' | 'r', P: Term, T: Term, path: number[]) => {
    switch (P.k) {
      case 'meta': out.push({ meta: P.id, addr: { side, path } }); return;
      case 'inv': if (T.k === 'inv') walk(side, P.arg, T.arg, [...path, 0]); return;
      case 'mul': {
        const tw = word(T);
        let j = 0;
        for (const f of P.fs) {
          if (f.k === 'meta') {
            const v = s[f.id];
            if (!v) return;
            const len = word(norm(v)).length;
            out.push({ meta: f.id, addr: { side, path, range: [j, j + len] } });
            j += len;
          } else {
            const t = tw[j];
            if (!t) return;
            walk(side, f, t, T.k === 'mul' ? [...path, j] : path);
            j += 1;
          }
        }
        return;
      }
      default: return;
    }
  };
  walk('l', norm(prem.l), norm(fact.l), []);
  walk('r', norm(prem.r), norm(fact.r), []);
  return out;
}

/** The unit rewrite absorbing a lone e at position pos of word w (unitL with the right neighbour, else unitR). */
function tidyAt(side: 'l' | 'r', wordPath: number[], w: Term[], pos: number): StepOp | null {
  if (w.length < 2 || w[pos]?.k !== 'e') return null;
  if (pos + 1 < w.length) return { k: 'rewrite', rule: { k: 'axiom', id: 'unitL' }, dir: 'fwd', at: { side, path: [...wordPath], range: [pos, pos + 2] }, subst: { x: w[pos + 1]! } };
  return { k: 'rewrite', rule: { k: 'axiom', id: 'unitR' }, dir: 'fwd', at: { side, path: [...wordPath], range: [pos - 1, pos + 1] }, subst: { x: w[pos - 1]! } };
}

/** Inputs and rule of a node (kernel nodeUses, plus the v4 product / generalize nodes). */
function usesOf(n: ProofNode): { inputs: NodeId[]; rule?: NodeId } {
  if (n.k === 'product') return { inputs: [...n.inputs] };
  if (n.k === 'generalize') return { inputs: [n.input] };
  return nodeUses(n);
}

/** Is v (a ground or partially bound value) complete for every meta? */
const missing = (metas: MetaId[], s: Subst) => metas.filter((m) => !s[m]);

// ───────────────────────────── compile ─────────────────────────────

export function compile(c: Canvas, ctx0: KernelCtx): CompiledX {
  const machines = [...c.machines].sort((a, b) => cmp(a.id, b.id));
  const byId = new Map<string, Machine>(machines.map((m) => [m.id, m]));

  // ── towers → graph variables (unique ids and labels; never a level constant's name) ──
  const vars: AtomDecl[] = [];
  const towerErr: Record<string, string> = {};
  {
    const taken = new Map<string, string>();
    for (const a of ctx0.level.atoms) { taken.set(`id:${a.id}`, 'a constant of this order'); taken.set(`lb:${a.label}`, 'a constant of this order'); }
    for (const m of machines) {
      if (m.config.kind !== 'tower') continue;
      const cfg = m.config;
      if (!cfg.varId || !cfg.label) { towerErr[m.id] = JAMS.towerUnnamed; continue; }
      const dup = taken.get(`id:${cfg.varId}`) ?? taken.get(`lb:${cfg.label}`);
      if (dup) { towerErr[m.id] = JAMS.towerDup(cfg.label, dup); continue; }
      taken.set(`id:${cfg.varId}`, `another Tower (${m.id})`); taken.set(`lb:${cfg.label}`, `another Tower (${m.id})`);
      vars.push({ id: cfg.varId, label: cfg.label, hue: vars.length % 6, variable: true, ...(cfg.sort === 'Z' ? { sort: 'Z' as const } : {}) });
    }
    // the kernel's own admission rule (e.g. a name a given or goal already uses is not fresh)
    if (vars.length) {
      const wv = withVars(ctx0, { nodes: [], rooms: [], vars });
      const okIds = new Set(wv.vars.map((v) => v.id));
      for (const m of machines) {
        if (m.config.kind !== 'tower' || towerErr[m.id]) continue;
        if (!okIds.has(m.config.varId)) towerErr[m.id] = wv.error ?? JAMS.towerUnnamed;
      }
      vars.splice(0, vars.length, ...vars.filter((v) => okIds.has(v.id)));
    }
  }
  /** Lowering context: the level's constants plus this floor's declared variables (for ground checks). */
  const ctx: KernelCtx = vars.length ? { ...ctx0, level: { ...ctx0.level, atoms: [...ctx0.level.atoms, ...vars] } } : ctx0;
  const L = labelsOf(ctx.level.atoms);
  const T = (t: Term) => termText(t, L);
  const F = (f: Fact) => factText(f, L);
  const itemText = (v: ItemValue) => (v.k === 'term' ? T(v.term) : v.k === 'fact' ? F(v.fact) : F(v.card));
  /** Ground check with the Tower message for an undeclared variable. */
  const ground = (t: Term, what: string): Term => {
    try { return checkGround(t, ctx, what); } catch (e) { return jam(undeclared((e as Error).message)); }
  };
  const nameOf = (m: Machine) => SPECS[m.kind]?.name ?? m.kind;

  // ── rooms: geometry, parents, scope of a tile ──
  const rooms = [...c.rooms].sort((a, b) => cmp(a.id, b.id));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const roomBad = new Set<string>();
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i]!, b = rooms[j]!;
    if (rectDisjoint(a.rect, b.rect)) continue;
    const nested = (rectInside(a.rect, b.rect) || rectInside(b.rect, a.rect)) && area(a.rect) !== area(b.rect);
    if (!nested) { roomBad.add(a.id); roomBad.add(b.id); }
  }
  const parentOf = new Map<string, ScopeId>();
  for (const r of rooms) {
    let best: (typeof rooms)[number] | null = null;
    for (const o of rooms) {
      if (o === r || roomBad.has(o.id) || !rectInside(r.rect, o.rect) || area(o.rect) === area(r.rect)) continue;
      if (!best || area(o.rect) < area(best.rect)) best = o;
    }
    parentOf.set(r.id, best ? best.id : ROOT);
  }
  const kRooms: KRoom[] = rooms.map((r) => ({ id: r.id, parent: parentOf.get(r.id) ?? ROOT, kind: r.kind, l: r.l, r: r.r, ...(r.kind === 'assume' ? { rel: r.rel ?? 'eq' } : {}) }));
  const tileScope = (t: Tile): ScopeId => {
    let best: (typeof rooms)[number] | null = null;
    for (const r of rooms) if (inRect(t, r.rect) && (!best || area(r.rect) < area(best.rect))) best = r;
    return best ? best.id : ROOT;
  };
  const within = (inner: ScopeId, outer: ScopeId): boolean => {
    let cur: ScopeId | undefined = inner;
    for (let g = 0; cur !== undefined && g < 1000; g++) {
      if (cur === outer) return true;
      if (cur === ROOT) return false;
      cur = parentOf.get(cur);
    }
    return false;
  };
  const supposition = (roomId: string): string => {
    const r = roomById.get(roomId);
    if (!r) return 'a supposition';
    const k = r.kind === 'suppose' || (r.kind === 'assume' && (r.rel ?? 'eq') === 'eq') ? 'eq' : 'neq';
    try { return F({ k, l: r.l, r: r.r }); } catch { return 'a supposition'; }
  };

  // ── machines: ports, footprints, scopes ──
  const ports = new Map<string, Port[]>();
  const occupied = new Map<string, string>(); // tile → machine id
  const scopeOf: Record<string, ScopeId> = {};
  const scopeErr: Record<string, string> = {};
  const footprints: Record<string, Tile[]> = {};
  for (const m of machines) {
    let ps: Port[] = [], fp: Tile[] = [];
    try { ps = portsOf(m, ctx); fp = footprint(m, ctx); } catch { /* malformed config: handled in lowering */ }
    ports.set(m.id, ps);
    footprints[m.id] = fp;
    for (const t of fp) if (!occupied.has(tileKey(t))) occupied.set(tileKey(t), m.id);
    const cfg = m.config;
    if (cfg.kind === 'desk' || cfg.kind === 'gate') {
      const r = roomById.get(cfg.room);
      if (!r) { scopeOf[m.id] = ROOT; scopeErr[m.id] = JAMS.noRoom; continue; }
      scopeOf[m.id] = cfg.kind === 'desk' ? r.id : parentOf.get(r.id) ?? ROOT;
      if (roomBad.has(r.id)) scopeErr[m.id] = JAMS.roomOverlap;
      else if (m.kind !== cfg.kind) scopeErr[m.id] = cfg.kind === 'gate' ? JAMS.gatePlace : JAMS.deskPlace;
      else if (cfg.kind === 'desk' && (fp.length !== 1 || tileScope(fp[0]!) !== r.id)) scopeErr[m.id] = JAMS.deskPlace;
      else if (cfg.kind === 'gate') {
        // the one boundary exception: a 1-tile pad on the room's own ring, inlet facing in, outlet facing out
        const t = fp[0];
        const o = ps.find((p) => p.id === 'out'), q = ps.find((p) => p.id === 'q');
        const ring = !!t && (t.x === r.rect.x || t.y === r.rect.y || t.x === r.rect.x + r.rect.w - 1 || t.y === r.rect.y + r.rect.h - 1);
        const good = fp.length === 1 && !!t && tileScope(t) === r.id && ring && !!o && !!q
          && !inRect(frontOf(o), r.rect) && tileScope(frontOf(q)) === r.id;
        if (!good) scopeErr[m.id] = JAMS.gatePlace;
      }
      continue;
    }
    const ss = new Set(fp.map(tileScope));
    const s = fp.length ? tileScope(fp[0]!) : ROOT;
    scopeOf[m.id] = s;
    if (ss.size > 1) scopeErr[m.id] = JAMS.straddle(nameOf(m));
    else if (s !== ROOT && roomBad.has(s)) scopeErr[m.id] = JAMS.roomOverlap;
  }
  /** Scope at a port: a gate's inlet is inside its room; everything else is the machine's scope. */
  const portScope = (m: Machine, port: string): ScopeId =>
    m.config.kind === 'gate' && port !== 'out' && roomById.has(m.config.room) ? m.config.room : scopeOf[m.id] ?? ROOT;

  // ── belts: endpoints, duplicates, paths, crossings, scope transitions ──
  const beltErrors: Record<string, string> = {};
  const leakRoom: Record<string, ScopeId> = {}; // belt id → the room it illegally leaves
  const belts = [...c.belts].sort((a, b) => cmp(a.id, b.id));
  const inBelt = new Map<string, Belt>();       // `${m}|${port}` → enabled belt
  const badIn = new Map<string, string>();      // `${m}|${port}` → disabled belt id
  /** Cell → belts already through it: network (producer), predecessor cell, and whether it runs straight on which axis. */
  const cellUse = new Map<string, { net: string; pred: string; straight: boolean; axis: 'h' | 'v' }[]>();
  const brokenIn = new Map<string, string>();   // `${m}|${port}` → kept-but-broken belt id
  const takenIn = new Set<string>();
  const same2 = (p: Tile, q: Tile) => p.x === q.x && p.y === q.y;
  for (const b of belts) {
    const fm = byId.get(b.from?.m), tm = byId.get(b.to?.m);
    const fp = fm ? ports.get(fm.id)?.find((p) => p.id === b.from.port && p.dir === 'out') : undefined;
    const tp = tm ? ports.get(tm.id)?.find((p) => p.id === b.to.port && p.dir === 'in') : undefined;
    if (!fm || !tm || !fp || !tp || !Array.isArray(b.path)) { beltErrors[b.id] = b.broken ?? JAMS.beltPort; continue; }
    const inKey = `${tm.id}|${tp.id}`;
    if (takenIn.has(inKey)) { beltErrors[b.id] = JAMS.beltDuplicate; continue; }
    if (b.broken) {
      // kept by the editor, transports nothing; its consumer starves with a link to this belt
      beltErrors[b.id] = b.broken;
      if (!badIn.has(inKey)) brokenIn.set(inKey, b.id);
      continue;
    }
    const fail = (msg: string) => { beltErrors[b.id] = msg; if (!takenIn.has(inKey)) badIn.set(inKey, b.id); };
    // path continuity; [] = a direct link between touching, facing ports
    const path = b.path;
    let broken = false;
    if (path.length) {
      // an end cell is the port's doorstep or a side approach: orthogonally adjacent to the port's own
      // cell and not behind it (the cell opposite its facing); footprints are refused just below
      const approach = (pt: Port, t: Tile) => {
        const d = FACE_DELTA[pt.face];
        const behind = { x: pt.tile.x - d.x, y: pt.tile.y - d.y };
        return Math.abs(t.x - pt.tile.x) + Math.abs(t.y - pt.tile.y) === 1 && !same2(t, behind);
      };
      if (!approach(fp, path[0]!) || !approach(tp, path[path.length - 1]!)) broken = true;
      for (let i = 1; i < path.length && !broken; i++) if (Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.y - path[i - 1]!.y) !== 1) broken = true;
    } else if (!same2(frontOf(fp), tp.tile) || !same2(frontOf(tp), fp.tile)) broken = true;
    if (broken) { fail(JAMS.beltBroken); continue; }
    if (path.some((t) => occupied.has(tileKey(t)))) { fail(JAMS.beltThrough); continue; }
    // sharing a cell: the same line's copy-tree prefix, or a perpendicular crossing (independent transport)
    let clash: string | null = null;
    const mine: { k: string; use: { net: string; pred: string; straight: boolean; axis: 'h' | 'v' } }[] = [];
    for (let i = 0; i < path.length && !clash; i++) {
      const cell = path[i]!, prev = i === 0 ? fp.tile : path[i - 1]!, next = i === path.length - 1 ? tp.tile : path[i + 1]!;
      const inAx = prev.x !== cell.x ? 'h' : 'v', outAx = next.x !== cell.x ? 'h' : 'v';
      const use = { net: fm.id, pred: tileKey(prev), straight: inAx === outAx, axis: inAx as 'h' | 'v' };
      const k = tileKey(cell);
      for (const o of cellUse.get(k) ?? []) {
        if (o.net === use.net && o.pred === use.pred) continue;
        if (o.straight && use.straight && o.axis !== use.axis) continue;
        clash = o.net === use.net ? JAMS.beltRejoin : JAMS.beltCross;
        break;
      }
      mine.push({ k, use });
    }
    if (clash) { fail(clash); continue; }
    // scope transitions: only stay or go inward
    const seq: ScopeId[] = [portScope(fm, fp.id), ...path.map(tileScope), portScope(tm, tp.id)];
    let leak: ScopeId | null = null;
    for (let i = 1; i < seq.length; i++) if (!within(seq[i]!, seq[i - 1]!)) { leak = seq[i - 1]!; break; }
    if (leak !== null) { leakRoom[b.id] = leak; fail(JAMS.leakSibling); continue; }
    for (const x of mine) { const arr = cellUse.get(x.k) ?? []; arr.push(x.use); cellUse.set(x.k, arr); }
    takenIn.add(inKey);
    badIn.delete(inKey);
    brokenIn.delete(inKey);
    inBelt.set(inKey, b);
  }

  // ── dependency DAG over machines, deterministic topological order ──
  const consumers = new Map<string, string[]>();
  const indeg = new Map<string, number>(machines.map((m) => [m.id, 0]));
  for (const b of inBelt.values()) {
    const arr = consumers.get(b.from.m) ?? [];
    arr.push(b.to.m);
    consumers.set(b.from.m, arr);
    indeg.set(b.to.m, (indeg.get(b.to.m) ?? 0) + 1);
  }
  const order: string[] = [];
  const done = new Set<string>();
  const kahn = () => {
    const ready = machines.filter((m) => !done.has(m.id) && (indeg.get(m.id) ?? 0) === 0).map((m) => m.id);
    while (ready.length) {
      ready.sort(cmp);
      const id = ready.shift()!;
      if (done.has(id)) continue;
      done.add(id); order.push(id);
      for (const to of consumers.get(id) ?? []) {
        indeg.set(to, (indeg.get(to) ?? 0) - 1);
        if (indeg.get(to) === 0 && !done.has(to)) ready.push(to);
      }
    }
  };
  kahn();
  const inCycle = new Set<string>();
  if (done.size < machines.length) {
    // members of a cycle reach themselves through not-yet-ordered machines
    const rest = machines.filter((m) => !done.has(m.id)).map((m) => m.id);
    for (const id of rest) {
      const seen = new Set<string>();
      const stack = [...(consumers.get(id) ?? [])];
      while (stack.length) {
        const x = stack.pop()!;
        if (x === id) { inCycle.add(id); break; }
        if (seen.has(x) || done.has(x)) continue;
        seen.add(x);
        stack.push(...(consumers.get(x) ?? []));
      }
    }
    for (const id of [...inCycle].sort(cmp)) {
      done.add(id); order.push(id);
      for (const to of consumers.get(id) ?? []) indeg.set(to, (indeg.get(to) ?? 0) - 1);
    }
    kahn();
    for (const m of machines) if (!done.has(m.id)) { done.add(m.id); order.push(m.id); }
  }

  // ── preview evaluation (mirrors the kernel; `check` remains the authority) ──
  const nodes: ProofNode[] = [];
  const pfact = new Map<NodeId, Fact>();
  const pdeps = new Map<NodeId, Set<string>>();
  const roomsK = new Map(kRooms.map((r) => [r.id, r]));
  /** Ask the kernel itself (on n's ancestor closure) for nodes whose result the compiler does not mirror. */
  const kernelEval = (n: ProofNode, deps: Set<string>): Fact => {
    const byNode = new Map(nodes.map((x) => [x.id, x]));
    byNode.set(n.id, n);
    const seen = new Set<NodeId>();
    const stack = [n.id];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      const nn = byNode.get(x);
      if (nn) { const u = usesOf(nn); stack.push(...u.inputs, ...(u.rule ? [u.rule] : [])); }
    }
    const g: ProofGraph = { nodes: [...byNode.values()].filter((x) => seen.has(x.id)), rooms: kRooms, ...(vars.length ? { vars } : {}) };
    const res = kcheck(g, ctx0).nodes[n.id];
    if (!res?.ok || !res.fact) throw new KErr(res?.error ?? 'the kernel rejected this step');
    deps.clear();
    for (const d of res.deps) deps.add(d);
    return res.fact;
  };
  const preview = (n: ProofNode): { ok: true; fact: Fact } | { ok: false; error: string } => {
    const deps = new Set<string>();
    const use = (id: NodeId): Fact => {
      const f = pfact.get(id);
      if (!f) throw new KErr('an ingredient of this step is not valid');
      for (const d of pdeps.get(id) ?? []) deps.add(d);
      return f;
    };
    try {
      let f: Fact;
      switch (n.k) {
        case 'start': { const t = checkGround(n.term, ctx, 'the starting element'); f = { k: 'eq', l: t, r: t }; break; }
        case 'given': {
          const gd = ctx.level.givens.find((g) => g.id === n.givenId);
          if (!gd) throw new KErr(JAMS.noGiven(n.givenId));
          deps.add(`g:${gd.id}`);
          f = gd.fact.k === 'eq' || gd.fact.k === 'neq' ? { k: gd.fact.k, l: norm(gd.fact.l), r: norm(gd.fact.r) } : gd.fact;
          break;
        }
        case 'assume': {
          const r = roomsK.get(n.room);
          if (!r) throw new KErr('there is no such room to suppose in');
          deps.add(`a:${r.id}`);
          const l = checkGround(r.l, ctx, 'the supposition'), rr = checkGround(r.r, ctx, 'the supposition');
          const asEq = r.kind === 'suppose' || (r.kind === 'assume' && (r.rel ?? 'eq') === 'eq');
          f = asEq ? { k: 'eq', l, r: rr } : { k: 'neq', l, r: rr };
          break;
        }
        case 'step': {
          const inp = use(n.input);
          if (inp.k === 'law' || inp.k === 'cond') throw new KErr('a universal statement cannot be rewritten; cite it as a rule instead');
          if (n.op.k === 'invert') {
            if (inp.k !== 'eq' && inp.k !== 'neq') throw new KErr('only an equation or an inequation can be inverted on both sides');
            f = { k: inp.k, l: norm({ k: 'inv', arg: inp.l }), r: norm({ k: 'inv', arg: inp.r }) };
            break;
          }
          const rf = n.op.k === 'rewrite' && n.op.rule.k === 'node' ? use(n.op.rule.id) : undefined;
          const r = evalStep(inp, n.op, ctx, rf);
          if (!r.ok) throw new KErr(r.error);
          f = r.pallet;
          break;
        }
        case 'apply': {
          const rf = n.rule.k === 'node' ? use(n.rule.id) : undefined;
          const card = resolveCond(n.rule, ctx, rf, L);
          const ins = n.inputs.map((id, i) => {
            const x = use(id);
            if (x.k !== 'eq' && x.k !== 'neq') throw new KErr(`premise ${i + 1} must be an equation or an inequation`);
            return x;
          });
          f = applyCore(card, ins, n.subst, ctx);
          break;
        }
        case 'merge': {
          const a = use(n.inputs[0]), b = use(n.inputs[1]);
          if (a.k !== 'eq' || b.k !== 'eq') throw new KErr('only two equations can be merged');
          if (!same(norm(a.r), norm(b.r))) throw new KErr(`the right-hand sides ${T(a.r)} and ${T(b.r)} differ; both equations must end in the same element`);
          f = { k: 'eq', l: norm(a.l), r: norm(b.l) };
          break;
        }
        case 'clash': {
          const a = use(n.inputs[0]), b = use(n.inputs[1]);
          const [q, ne] = a.k === 'eq' && b.k === 'neq' ? [a, b] : b.k === 'eq' && a.k === 'neq' ? [b, a] : [null, null];
          if (!q || !ne) throw new KErr(JAMS.anvilKinds);
          const hit = (same(norm(q.l), norm(ne.l)) && same(norm(q.r), norm(ne.r))) || (same(norm(q.l), norm(ne.r)) && same(norm(q.r), norm(ne.l)));
          if (!hit) throw new KErr(`${F(q)} and ${F(ne)} do not contradict each other`);
          f = { k: 'bot' };
          break;
        }
        case 'product': {
          const a = use(n.inputs[0]), b = use(n.inputs[1]);
          if (a.k !== 'eq' || b.k !== 'eq') throw new KErr('a product of equations needs two equations');
          f = { k: 'eq', l: norm({ k: 'mul', fs: [a.l, b.l] }), r: norm({ k: 'mul', fs: [a.r, b.r] }) };
          break;
        }
        case 'generalize': { use(n.input); f = kernelEval(n, deps); break; }
        case 'exit': {
          const r = roomsK.get(n.room);
          if (!r) throw new KErr('there is no such room to close');
          if (r.kind === 'assume') { use(n.input); f = kernelEval(n, deps); break; }
          const inp = use(n.input);
          if (inp.k !== 'bot') throw new KErr('a room is closed only by a contradiction (⊥)');
          deps.delete(`a:${r.id}`);
          f = r.kind === 'suppose' ? { k: 'neq', l: norm(r.l), r: norm(r.r) } : { k: 'eq', l: norm(r.l), r: norm(r.r) };
          break;
        }
        case 'press': {
          const inp = use(n.input);
          if (inp.k !== 'size') throw new KErr('the Lagrange press needs the order of the group (|G| = n)');
          f = pressCard(inp.n, !!(n as { power?: boolean }).power);
          break;
        }
        default: throw new KErr('unknown kind of step');
      }
      pfact.set(n.id, f);
      pdeps.set(n.id, deps);
      return { ok: true, fact: f };
    } catch (e) {
      return { ok: false, error: e instanceof KErr ? e.message : `malformed step (${(e as Error)?.message ?? 'unknown'})` };
    }
  };

  // ── lowering, machine by machine in topological order ──
  const results: Record<string, MachineResult> = {};
  const pout: Record<string, ItemValue | undefined> = {};   // preview output
  const cause: Record<string, string> = {};
  const plan: RunPlan = { machines: {}, succ: {}, routes: {}, active: [], footprints, feeds: {} };
  const socketStatic: Record<string, { by?: string; P?: NodeId; reason?: string }> = {};

  // ── the library: a given node for EVERY level given (inlet or not) and the Lagrange law ──
  // Citing a given as a recipe cites this node, so the citation carries the dependency g:<id> exactly
  // as a belted inlet does; Lagrange is a press node on the |G| given (dependency kept).
  const givenNode = new Map<string, NodeId>();
  const libErr = new Map<NodeId, string>();
  const libNode = (n: ProofNode) => {
    nodes.push(n);
    const res = preview(n);
    if (!res.ok) libErr.set(n.id, res.error);
  };
  for (const gd of [...ctx.level.givens].sort((a, b) => cmp(a.id, b.id))) {
    const nid = `lib#given:${gd.id}`;
    givenNode.set(gd.id, nid);
    libNode({ k: 'given', id: nid, scope: ROOT, givenId: gd.id, meta: { station: `lib:given:${gd.id}`, gesture: 'given' } });
  }
  const sizeGiven = ctx.level.givens.find((g) => g.fact.k === 'size');
  const lagrangeNode = sizeGiven ? 'lib#lagrange' : undefined;
  // Lagrange in two shapes on the same |G| given: the word x x … x (classic orders) and the power x^{|G|}
  // (Phase B). A Rewriter picks the power shape when its equation has powers, a card the power shape
  // on orders that enable the power imports.
  const powerLevel = ctx.level.tools.schemas.some((id) => id.startsWith('power.'));
  const lagrangePow = sizeGiven ? 'lib#lagrange.pow' : undefined;
  if (sizeGiven) {
    libNode({ k: 'press', id: 'lib#lagrange', scope: ROOT, input: givenNode.get(sizeGiven.id)!, meta: { station: 'lib:lagrange', gesture: 'Lagrange (imported)' } });
    libNode({ k: 'press', id: 'lib#lagrange.pow', scope: ROOT, input: givenNode.get(sizeGiven.id)!, power: true, meta: { station: 'lib:lagrange', gesture: 'Lagrange (imported)' } } as ProofNode);
  }
  const hasPow = (f: Fact | undefined) => !!f && JSON.stringify(f).includes('"k":"pow"');
  const givenName = (id: string) => ctx.level.givens.find((g) => g.id === id)?.name ?? id;

  /** A library entry as a rewrite rule (equation or law). */
  const libRule = (ref: LibRef, on?: Fact): { ref: RuleRef; fact?: Fact; text: string } => {
    switch (ref.k) {
      case 'axiom': return { ref: { k: 'axiom', id: ref.id }, text: F(axiomCard(ref.id)) };
      case 'given': {
        const nid = givenNode.get(ref.givenId);
        const f = nid ? pfact.get(nid) : undefined;
        if (!nid || !f) return jam(nid ? libErr.get(nid) ?? JAMS.noGiven(ref.givenId) : JAMS.noGiven(ref.givenId));
        const text = `${givenName(ref.givenId)}: ${F(f)}`;
        if (f.k === 'neq') return jam(JAMS.ruleNeq(F(f)));
        if (f.k === 'cond') return jam(JAMS.ruleCond(F(f)));
        if (f.k !== 'eq' && f.k !== 'law') return jam(JAMS.libNotRule(F(f), f.k));
        return { ref: { k: 'node', id: nid }, fact: f, text };
      }
      case 'schema': {
        let card: Card;
        try { card = schemaCard(ref.id, ref.mirror, ctx); } catch (e) { return jam((e as Error).message); }
        const name = `${schemaInfo(ref.id, ctx)?.name ?? ref.id}${ref.mirror ? ' ᵒᵖ' : ''}`;
        if (card.k === 'cond') return jam(JAMS.ruleCond(`${name} (${F(card)})`));
        return { ref: { k: 'schema', id: ref.id, ...(ref.mirror ? { mirror: true } : {}) }, text: name };
      }
      case 'lagrange': {
        const ln = hasPow(on) ? lagrangePow : lagrangeNode;
        if (!ln || !pfact.get(ln)) return jam(ln ? libErr.get(ln) ?? JAMS.noLagrange : JAMS.noLagrange);
        return { ref: { k: 'node', id: ln }, fact: pfact.get(ln)!, text: `Lagrange (imported): ${F(pfact.get(ln)!)}` };
      }
    }
    return jam(JAMS.unknownRecipe);
  };
  /** A library entry as a card (for Theorem recipes and Card Docks). */
  const libCard = (ref: LibRef): { ref: RuleRef; card: Card; name: string } => {
    switch (ref.k) {
      case 'axiom': return { ref: { k: 'axiom', id: ref.id }, card: axiomCard(ref.id), name: F(axiomCard(ref.id)) };
      case 'given': {
        const nid = givenNode.get(ref.givenId);
        const f = nid ? pfact.get(nid) : undefined;
        if (!nid || !f) return jam(nid ? libErr.get(nid) ?? JAMS.noGiven(ref.givenId) : JAMS.noGiven(ref.givenId));
        if (f.k !== 'law' && f.k !== 'cond') return jam(JAMS.libNotCard(`${givenName(ref.givenId)}: ${F(f)}`, f.k));
        return { ref: { k: 'node', id: nid }, card: f, name: givenName(ref.givenId) };
      }
      case 'schema': {
        let card: Card;
        try { card = schemaCard(ref.id, ref.mirror, ctx); } catch (e) { return jam((e as Error).message); }
        return { ref: { k: 'schema', id: ref.id, ...(ref.mirror ? { mirror: true } : {}) }, card, name: `${schemaInfo(ref.id, ctx)?.name ?? ref.id}${ref.mirror ? ' ᵒᵖ' : ''}` };
      }
      case 'lagrange': {
        const ln = powerLevel ? lagrangePow : lagrangeNode;
        if (!ln || !pfact.get(ln)) return jam(ln ? libErr.get(ln) ?? JAMS.noLagrange : JAMS.noLagrange);
        return { ref: { k: 'node', id: ln }, card: pfact.get(ln) as Card, name: 'Lagrange (imported)' };
      }
    }
    return jam(JAMS.unknownRecipe);
  };

  for (const id of order) {
    const m = byId.get(id)!;
    const cfg = m.config;
    const S = scopeOf[id] ?? ROOT;
    const mine: NodeId[] = [];
    const inputs: Record<string, ItemValue | undefined> = {};
    const ins: { port: string; catalyst: boolean }[] = [];
    const r: MachineResult = { id, status: { k: 'ok' }, scope: S, nodes: mine, inputs, duration: 0 };
    let source = false;
    results[id] = r;
    const myPorts = ports.get(id) ?? [];
    const station = { station: id };

    // gather inputs (values present at each connected inlet)
    for (const p of myPorts) {
      if (p.dir !== 'in') continue;
      const b = inBelt.get(`${id}|${p.id}`);
      if (b && results[b.from.m]?.status.k === 'ok') inputs[p.id] = pout[b.from.m];
    }

    const emit = (n: Omit<ProofNode, 'scope' | 'meta'> & { k: ProofNode['k'] }, gesture: string, role: string): Fact => {
      const node = { ...n, id: nodeId(id, role), scope: S, meta: { ...station, gesture } } as ProofNode;
      nodes.push(node);
      mine.push(node.id);
      const res = preview(node);
      if (!res.ok) return jam(undeclared(res.error));
      return res.fact;
    };
    const lastNode = () => mine[mine.length - 1]!;
    const portOf = (pid: string) => myPorts.find((p) => p.id === pid);

    /** The value at an inlet, or halt: disabled belt → jam; not connected / upstream not ok → starved. */
    const get = (pid: string, catalyst = false): ItemValue => {
      const p = portOf(pid);
      const accepts = p?.accepts ?? [];
      const bad = badIn.get(`${id}|${pid}`);
      if (bad) return jam(JAMS.belt(beltErrors[bad] ?? 'it is broken'));
      const brk = brokenIn.get(`${id}|${pid}`);
      if (brk) return starve(JAMS.beltBrokenIn(beltErrors[brk] ?? 'no route'), brk);
      const b = inBelt.get(`${id}|${pid}`);
      if (!b) return starve(JAMS.notConnected(p?.label && p.label !== 'in' ? p.label : pid, accepts));
      const pr = results[b.from.m];
      const v = pout[b.from.m];
      if (!pr || pr.status.k !== 'ok' || !v) {
        const root = cause[b.from.m] ?? b.from.m;
        const pm = byId.get(b.from.m);
        return starve(JAMS.waiting(pm ? nameOf(pm) : b.from.m, accepts), root);
      }
      ins.push({ port: pid, catalyst });
      return v;
    };
    const getFact = (pid: string): ItemValue & { k: 'fact' } => {
      const v = get(pid);
      if (v.k !== 'fact') return jam(JAMS.wrongKind(portOf(pid)?.accepts ?? ['eq'], itemText(v), itemKindOf(v)));
      return v;
    };
    const getTerm = (pid: string): Term => {
      const v = get(pid);
      if (v.k !== 'term') return jam(JAMS.wrongKind(['term'], itemText(v), itemKindOf(v)));
      return v.term;
    };
    const param = (p: Param, pid: string, what: string, z = false): Term => {
      if (z) {
        // an exponent knob: an integer polynomial over ℤ Towers (never a belt item)
        if (p.k === 'port') return jam(JAMS.intFromBelt(what));
        if (!p.term) return starve(JAMS.needsInt(what));
        try { return checkInt(p.term, ctx, what); } catch (e) { return jam(undeclared((e as Error).message)); }
      }
      if (p.k === 'port') return getTerm(pid);
      if (!p.term) return starve(JAMS.chooseElement(what));
      return ground(p.term, what);
    };
    /** "needs …" for the first missing metas, integer or element. */
    const needMsg = (ms: string[], z: Set<string>) => (ms.length && ms.every((m) => z.has(m)) ? JAMS.needsInt(ms.join(', ')) : JAMS.needsMeta(ms.join(', ')));
    /** A routed rewrite rule: an equation fact or a law card. */
    const getRule = (pid: string): { ref: RuleRef; fact?: Fact; text: string } => {
      const v = get(pid, true);
      if (v.k === 'fact') {
        if (v.fact.k === 'eq') return { ref: { k: 'node', id: v.node }, fact: v.fact, text: F(v.fact) };
        if (v.fact.k === 'neq') return jam(JAMS.ruleNeq(F(v.fact)));
        return jam(JAMS.ruleOther(F(v.fact), v.fact.k));
      }
      if (v.k === 'card') {
        if (v.card.k === 'cond') return jam(JAMS.ruleCond(F(v.card)));
        return { ref: v.ref, fact: v.ref.k === 'node' ? v.card : undefined, text: F(v.card) };
      }
      return jam(JAMS.ruleOther(T(v.term), 'term'));
    };
    const qText = (q: Pallet) => F(q);
    const railText = (q: Pallet, s: 'l' | 'r') => (q.k === 'eq' || q.k === 'neq' ? T(q[s]) : '');

    /** Resolve a span target to one location among `cands` (each with a payload), or halt. */
    function pickSpan<X>(q: Pallet, target: SpanTarget,
      cands: { loc: SpanLoc; x: X }[], noneMsg: () => string, misfit: (loc: SpanLoc) => string): { loc: SpanLoc; x: X } {
      r.candidates = cands.map((cd) => ({ addr: spanAddr(cd.loc), label: `${T(cd.loc.redex)} (${sideWord(cd.loc.side)})` }));
      if (target.k === 'first') {
        if (!cands.length) return jam(noneMsg());
        r.chosen = 0;
        return cands[0]!;
      }
      const t = target as Extract<typeof target, { k: 'pin' }> & { selected: Term };
      const res = resolveSpanPin(q, t as never);
      if (!res.ok) {
        if (res.why === 'ambiguous') return jam(JAMS.pinAmbiguous(T(t.selected), sideWord(t.side)));
        return jam(JAMS.pinGone(T(t.selected), sideWord(t.side), railText(q, t.side)));
      }
      const key = (l: SpanLoc) => `${l.side}/${l.wordPath.join('.')}/${l.s}-${l.e}`;
      const k = key(res.loc);
      const i = cands.findIndex((cd) => key(cd.loc) === k);
      if (i < 0) return jam(misfit(res.loc));
      r.chosen = i;
      return cands[i]!;
    }
    function pickGap(q: Pallet, target: { k: 'first' } | ({ k: 'pin' } & Record<string, unknown>)): GapLoc {
      const cands = gapCandidates(q);
      r.candidates = cands.map((g) => {
        const a = g.word.slice(0, g.gap), b = g.word.slice(g.gap);
        const txt = (w: Term[]) => (w.length ? T(w.length === 1 ? w[0]! : { k: 'mul', fs: w }) : '');
        return { addr: gapAddr(g) as GapAddr, label: `${txt(a)}‸${txt(b)} (${sideWord(g.side)})` };
      });
      if (target.k === 'first') { r.chosen = 0; return cands[0]!; }
      const t = target as never as { k: 'pin'; side: 'l' | 'r' };
      const res = resolveGapPin(q, target as never);
      if (!res.ok) return jam(res.why === 'ambiguous' ? JAMS.gapAmbiguous(sideWord(t.side)) : JAMS.gapGone(sideWord(t.side), railText(q, t.side)));
      const i = cands.findIndex((g) => g.side === res.loc.side && g.gap === res.loc.gap && g.wordPath.join('.') === res.loc.wordPath.join('.'));
      r.chosen = i;
      return res.loc;
    }

    /** Apply-style lowering shared by Apply and stamps. */
    const lowerApply = (ref: RuleRef, ruleFact: Fact | undefined, name: string, premisePorts: number,
      values: Record<MetaId, Param>, choice: number) => {
      let card;
      try { card = resolveCond(ref, ctx, ruleFact, L); } catch (e) { return jam((e as Error).message); }
      if (card.premises.length !== premisePorts) return jam(JAMS.premiseCount(name, card.premises.length, premisePorts));
      const facts: Pallet[] = [];
      const premNodes: NodeId[] = [];
      for (let i = 0; i < premisePorts; i++) {
        const v = getFact(`p${i}`);
        if (v.fact.k !== 'eq' && v.fact.k !== 'neq') return jam(JAMS.wrongKind(['eq', 'neq'], F(v.fact), v.fact.k));
        facts.push(v.fact); premNodes.push(v.node);
      }
      const partial: Subst = {};
      for (const mId of Object.keys(values).sort(cmp)) {
        if (!card.metas.includes(mId)) return jam(JAMS.notAVariable(mId));
        const p = values[mId]!;
        if (p.k === 'knob' && !p.term) continue;
        partial[mId] = param(p, `meta:${mId}`, mId, card.zmetas.has(mId));
      }
      let ss: Subst[] = [partial];
      for (let i = 0; i < card.premises.length; i++) {
        const next: Subst[] = [];
        for (const s of ss) next.push(...matchFact(card.premises[i]!, facts[i]!, s));
        if (!next.length) {
          const pr = card.premises[i]!;
          const s0 = ss[0] ?? partial;
          const want: PatFact = { k: pr.k, l: instantiatePartial(pr.l, s0), r: instantiatePartial(pr.r, s0) };
          const which = card.premises.length > 1 ? `premise ${i + 1}` : 'the premise';
          return jam(JAMS.premiseShape(which, F(want), F(facts[i]!)));
        }
        ss = next;
      }
      const seen = new Set<string>();
      ss = sortSubsts(ss.filter((s) => { const k = substKey(s); if (seen.has(k)) return false; seen.add(k); return true; }));
      const complete = ss.filter((s) => !missing(card.metas, s).length);
      if (!complete.length) return jam(needMsg(missing(card.metas, ss[0]!), card.zmetas));
      r.choices = complete.map((s) => {
        let concl = '';
        try { concl = F({ k: card.concl.k, l: instantiate(card.concl.l, s), r: instantiate(card.concl.r, s) }); } catch { /* shown as σ only */ }
        return {
          label: `${concl}${concl ? '  ' : ''}(${substText(s, L)})`,
          bindings: facts[0] && card.premises[0] ? bindingsOn(facts[0], card.premises[0], s) : [],
        };
      });
      if (choice < 0 || choice >= complete.length) return jam(JAMS.choiceGone(choice, complete.length));
      r.chosen = choice;
      emit({ k: 'apply', rule: ref, inputs: premNodes, subst: complete[choice]! } as never, name, 'apply');
      r.duration = 2;
    };

    /** After a rewrite at `loc` whose result there is a lone e: the single explicit unit rewrite. */
    const tidyAfter = (loc: SpanLoc) => {
      const w = [...loc.word.slice(0, loc.s), E, ...loc.word.slice(loc.e)];
      const op = tidyAt(loc.side, loc.wordPath, w, loc.s);
      if (op) emit({ k: 'step', input: lastNode(), op } as never, 'auto-tidy', 'tidy');
    };
    /** Rewrite with a rule (library or routed): at a bracket, or at a gap when the source side is e. */
    const rewriteWith = (qv: ItemValue & { k: 'fact' }, rule: { ref: RuleRef; fact?: Fact; text: string }) => {
      if (cfg.kind !== 'rewriter') return;
      const q = qv.fact;
      let law;
      try { law = resolveLaw(rule.ref, ctx, rule.fact, L); } catch (e) { law = jam((e as Error).message); }
      const [src, dst] = cfg.dir === 'fwd' ? [law.l, law.r] : [law.r, law.l];
      const partial: Subst = {};
      for (const mId of Object.keys(cfg.values).sort(cmp)) {
        const p = cfg.values[mId]!;
        if (p.k === 'knob' && !p.term) continue;
        if (!law.metas.includes(mId)) jam(JAMS.notAVariable(mId));
        partial[mId] = param(p, `meta:${mId}`, mId, law.zmetas.has(mId));
      }
      if (norm(src).k === 'e') {
        // e → the other side, grown at a gap: insert e, then the reversed/forward rule at that e
        const ss = sortSubsts(match(src, E, partial));
        const s = ss.find((x) => !missing(law.metas, x).length);
        if (!s) jam(needMsg(missing(law.metas, ss[0] ?? partial), law.zmetas));
        const g = pickGap(q, cfg.gap);
        emit({ k: 'step', input: qv.node, op: { k: 'insertE', at: gapAddr(g) } } as never, `insert by ${rule.text}`, 'insert');
        emit({ k: 'step', input: lastNode(), op: { k: 'rewrite', rule: rule.ref, dir: cfg.dir, at: { side: g.side, path: [...g.wordPath], range: [g.gap, g.gap + 1] }, subst: s! } } as never, `by ${rule.text}`, 'rewrite');
        return;
      }
      let incomplete: string[] | null = null;
      const cands: { loc: SpanLoc; x: Subst }[] = [];
      const fixedLen = metasOf(src).length ? undefined : word(norm(src)).length;
      if (fixedLen === undefined && spanCount(q) > MATCH_BUDGET) jam(JAMS.budget);
      for (const loc of spanCandidates(q, RAIL_ORDER, fixedLen)) {
        const ms = sortSubsts(match(src, loc.redex, partial));
        const full = ms.find((x) => !missing(law.metas, x).length);
        if (full) { cands.push({ loc, x: full }); continue; }
        if (incomplete) continue;
        // exponents the matcher will not guess (e.g. reverse (xᵐ)ⁿ = xᵐⁿ): ask for knobs
        const open = ms.length ? ms : matchOpen(src, loc.redex, partial);
        if (open.length) incomplete = missing(law.metas, open[0]!);
      }
      const pat = T(instantiatePartial(src, partial));
      const pick = pickSpan(q, cfg.target, cands,
        () => (incomplete ? needMsg(incomplete, law.zmetas) : JAMS.noRedex(pat, qText(q), rule.text)),
        (loc) => {
          const ms = matchOpen(src, loc.redex, partial);
          if (ms.length) return needMsg(missing(law.metas, ms[0]!), law.zmetas);
          return JAMS.pinMismatch(T(loc.redex), rule.text, pat);
        });
      emit({ k: 'step', input: qv.node, op: { k: 'rewrite', rule: rule.ref, dir: cfg.dir, at: spanAddr(pick.loc), subst: pick.x } } as never, `by ${rule.text}`, 'rewrite');
      if (cfg.tidy) {
        let dstInst: Term | null = null;
        try { dstInst = instantiate(dst, pick.x); } catch { dstInst = null; }
        if (dstInst && dstInst.k === 'e') tidyAfter(pick.loc);
      }
    };

    try {
      if (inCycle.has(id)) jam(JAMS.cycle);
      if (scopeErr[id]) jam(scopeErr[id]!);
      // type pre-pass: a wrong kind on a connected inlet jams before anything is starved
      for (const p of myPorts) {
        if (p.dir !== 'in') continue;
        const bad = badIn.get(`${id}|${p.id}`);
        if (bad) {
          const lr = leakRoom[bad];
          const pv = (() => { const b = c.belts.find((x) => x.id === bad); return b ? pout[b.from.m] : undefined; })();
          if (lr !== undefined && pv) {
            const dep = pv.k === 'fact' ? [...(pdeps.get(pv.node) ?? [])].find((d) => d.startsWith('a:')) : undefined;
            beltErrors[bad] = dep ? JAMS.leakFact(itemText(pv), supposition(dep.slice(2))) : JAMS.leakItem(itemText(pv));
          }
          jam(beltErrors[bad] ?? JAMS.beltPort);
        }
        const v = inputs[p.id];
        if (!v || !p.accepts.length) continue;
        const k = itemKindOf(v);
        if (p.accepts.includes(k)) continue;
        // courtesy: the clash Joiner sorts its inlets by kind; gates, ∀ and docks check kinds themselves
        if (cfg.kind === 'joiner' || cfg.kind === 'gate' || cfg.kind === 'forall' || cfg.kind === 'socket') continue;
        if (p.id === 'rule' && cfg.kind === 'rewriter') {
          if (k === 'neq') jam(JAMS.ruleNeq(itemText(v)));
          if (k === 'cond') jam(JAMS.ruleCond(itemText(v)));
          jam(JAMS.ruleOther(itemText(v), k));
        }
        jam(JAMS.wrongKind(p.accepts, itemText(v), k));
      }

      switch (cfg.kind) {
        // ───── sources ─────
        case 'spool': {
          const t = cfg.t.k === 'port' ? getTerm('t') : cfg.t.term ? ground(cfg.t.term, 'the spool’s element') : starve(JAMS.chooseElement('the spool'));
          source = cfg.t.k === 'knob';
          emit({ k: 'start', term: t } as never, 'reflexivity', 'start');
          r.duration = source ? 0 : 1;
          break;
        }
        case 'tower': {
          // declares a variable for the whole floor (graph.vars); no ports, no node, nothing to emit
          if (towerErr[id]) jam(towerErr[id]!);
          break;
        }
        case 'hopper': {
          source = true;
          if (!cfg.t) starve(JAMS.chooseElement('the hopper'));
          pout[id] = { k: 'term', term: ground(cfg.t!, 'the hopper’s element') };
          break;
        }
        case 'given': {
          source = true;
          const gn = givenNode.get(cfg.givenId);
          if (!gn) jam(JAMS.noGiven(cfg.givenId));
          mine.push(gn!);
          if (!pfact.get(gn!)) jam(libErr.get(gn!) ?? JAMS.noGiven(cfg.givenId));
          break;
        }
        case 'desk': {
          source = true;
          emit({ k: 'assume', room: cfg.room } as never, 'suppose', 'assume');
          break;
        }
        case 'carddock': {
          source = true;
          if (!cfg.ref) starve(JAMS.chooseRecipe);
          const lib = libCard(cfg.ref!);
          pout[id] = { k: 'card', card: lib.card, ref: lib.ref };
          if (lib.ref.k === 'node') mine.push(lib.ref.id);
          break;
        }
        // ───── Rewriter: one bracket (or gap) of one equation ─────
        case 'rewriter': {
          if (!cfg.recipe) starve(JAMS.chooseRecipe);
          const rc = cfg.recipe!;
          const qv = getFact('q');
          const q = qv.fact;
          if (q.k !== 'eq') jam(JAMS.wrongKind(['eq'], F(q), q.k));
          switch (rc.k) {
            case 'cancel': {
              const cands = cancelCandidates(q).map((cd) => ({ loc: cd.loc, x: { id: cd.id as AxiomId, s: { x: cd.x } as Subst } }));
              const pick = pickSpan(q, cfg.target, cands,
                () => (cfg.target.k === 'first' ? JAMS.noCancelAnywhere(qText(q)) : JAMS.noCancel('right', railText(q, 'r'))),
                (loc) => JAMS.notInverses(T(loc.redex)));
              emit({ k: 'step', input: qv.node, op: { k: 'rewrite', rule: { k: 'axiom', id: pick.x.id }, dir: 'fwd', at: spanAddr(pick.loc), subst: pick.x.s } } as never, 'cancel', 'cancel');
              if (cfg.tidy) tidyAfter(pick.loc);
              break;
            }
            case 'pop': {
              const cands = spanCandidates(q, RAIL_ORDER, 1).filter((l) => l.redex.k === 'e' && l.word.length >= 2).map((loc) => ({ loc, x: null }));
              const pick = pickSpan(q, cfg.target, cands, () => JAMS.noE(qText(q)),
                (loc) => (loc.redex.k === 'e' ? JAMS.soleE : JAMS.notE(T(loc.redex))));
              emit({ k: 'step', input: qv.node, op: tidyAt(pick.loc.side, pick.loc.wordPath, pick.loc.word, pick.loc.s)! } as never, 'remove e', 'pop');
              break;
            }
            case 'insertE': {
              const g = pickGap(q, cfg.gap);
              emit({ k: 'step', input: qv.node, op: { k: 'insertE', at: gapAddr(g) } } as never, 'insert e', 'insert');
              break;
            }
            case 'insertPair': {
              const X = param(rc.x, 'x', 'x');
              const g = pickGap(q, cfg.gap);
              const ax: AxiomId = rc.inv ? 'invL' : 'invR';
              emit({ k: 'step', input: qv.node, op: { k: 'insertE', at: gapAddr(g) } } as never, 'insert pair', 'insert');
              emit({ k: 'step', input: lastNode(), op: { k: 'rewrite', rule: { k: 'axiom', id: ax }, dir: 'rev', at: { side: g.side, path: [...g.wordPath], range: [g.gap, g.gap + 1] }, subst: { x: X } } } as never, 'insert pair', 'expand');
              break;
            }
            case 'law': rewriteWith(qv, libRule(rc.ref, q)); break;
            case 'routed': rewriteWith(qv, getRule('rule')); break;
            default: jam(JAMS.unknownRecipe);
          }
          r.duration = mine.length;
          break;
        }
        // ───── Operator: the whole equation ─────
        case 'operator': {
          if (!cfg.recipe) starve(JAMS.chooseRecipe);
          const rc = cfg.recipe!;
          const qv = getFact('q');
          if (qv.fact.k !== 'eq' && qv.fact.k !== 'neq') jam(JAMS.wrongKind(['eq', 'neq'], F(qv.fact), qv.fact.k));
          if (rc.k === 'multiply') {
            if (qv.fact.k !== 'eq') jam(`only an equation can be multiplied on both sides; ${F(qv.fact)} is an inequation`);
            const t = param(rc.t, 't', 't');
            emit({ k: 'step', input: qv.node, op: { k: 'lift', side: rc.side, term: t } } as never, `multiply on the ${rc.side}`, 'lift');
          } else if (rc.k === 'invert') emit({ k: 'step', input: qv.node, op: { k: 'invert' } } as never, 'invert both sides', 'invert');
          else if (rc.k === 'swap') emit({ k: 'step', input: qv.node, op: { k: 'swap' } } as never, 'symmetry', 'swap');
          else jam(JAMS.unknownRecipe);
          r.duration = 1;
          break;
        }
        // ───── Joiner: two facts ─────
        case 'joiner': {
          if (!cfg.recipe) starve(JAMS.chooseRecipe);
          const rc = cfg.recipe!;
          const a = getFact('a'), b = getFact('b');
          if (rc.k === 'clash') {
            // either inlet may carry either statement: sort by kind, then clash([eq, neq])
            const [qn, nn] = a.fact.k === 'eq' && b.fact.k === 'neq' ? [a.node, b.node] : b.fact.k === 'eq' && a.fact.k === 'neq' ? [b.node, a.node] : [null, null];
            if (!qn || !nn) {
              const both = a.fact.k === b.fact.k && (a.fact.k === 'eq' || a.fact.k === 'neq') ? `; both inlets carry ${a.fact.k === 'eq' ? 'equations' : 'inequations'}` : '';
              jam(`${JAMS.anvilKinds}${both}`);
            }
            emit({ k: 'clash', inputs: [qn!, nn!] } as never, 'contradiction', 'clash');
          } else {
            for (const v of [a, b]) if (v.fact.k !== 'eq') jam(JAMS.wrongKind(['eq'], F(v.fact), v.fact.k));
            if (rc.k === 'chain') emit({ k: 'merge', inputs: [a.node, b.node] } as never, 'transitivity', 'merge');
            else if (rc.k === 'product') emit({ k: 'product', inputs: [a.node, b.node] } as never, 'multiply equations', 'product');
            else jam(JAMS.unknownRecipe);
          }
          r.duration = 2;
          break;
        }
        // ───── Theorem: premises → conclusion by a conditional card ─────
        case 'theorem': {
          if (!cfg.recipe) starve(JAMS.chooseRecipe);
          const rc = cfg.recipe!;
          let ref: RuleRef, rf: Fact | undefined, name: string;
          if (rc.k === 'library') { const lb = libCard(rc.ref); ref = lb.ref; rf = lb.ref.k === 'node' ? lb.card : undefined; name = lb.name; }
          else if (rc.k === 'routed') {
            const v = get('card', true);
            if (v.k !== 'card') jam(JAMS.applyNotCard(itemText(v)));
            const cv = v as ItemValue & { k: 'card' };
            ref = cv.ref; rf = cv.ref.k === 'node' ? cv.card : undefined; name = F(cv.card);
          } else { ref = jam(JAMS.unknownRecipe); rf = undefined; name = ''; }
          const pPorts = myPorts.filter((p) => p.dir === 'in' && /^p\d+$/.test(p.id)).length;
          lowerApply(ref, rf, name, pPorts, cfg.values, cfg.choice);
          break;
        }
        // ───── ∀: generalize over the floor's tower variables ─────
        case 'forall': {
          const v = get('q');
          if (v.k === 'term') jam(JAMS.wrongKind(['eq', 'neq', 'law', 'cond'], T(v.term), 'term'));
          if (v.k === 'card' && v.ref.k !== 'node') jam(JAMS.forallLibrary);
          const node = v.k === 'fact' ? v.node : (v as { ref: { id: string } }).ref.id;
          // eigenvariable condition, explained before the kernel decides: no supposition this rests on
          // may mention a variable being bound
          const free = atomsOfFact(v.k === 'fact' ? v.fact : (v as ItemValue & { k: 'card' }).card);
          for (const d of [...(pdeps.get(node) ?? [])].sort(cmp)) {
            if (!d.startsWith('a:')) continue;
            const rm = roomById.get(d.slice(2));
            if (!rm) continue;
            const hit = [...atomsOfFact({ k: 'eq', l: rm.l, r: rm.r })].find((x) => free.has(x) && vars.some((vv) => vv.id === x));
            if (hit) jam(JAMS.forallEigen(supposition(rm.id), vars.find((vv) => vv.id === hit)!.label));
          }
          emit({ k: 'generalize', input: node } as never, 'generalize', 'forall');
          r.duration = 2;
          break;
        }
        // ───── rooms ─────
        case 'gate': {
          const room = roomById.get(cfg.room);
          const ins0 = myPorts.filter((p) => p.dir === 'in').map((p) => p.id).sort(cmp);
          const gp = ins0.find((pid) => inBelt.has(`${id}|${pid}`) || badIn.has(`${id}|${pid}`) || brokenIn.has(`${id}|${pid}`)) ?? ins0[0] ?? 'q';
          const qv = getFact(gp);
          if (room?.kind === 'assume') {
            if (qv.fact.k !== 'eq' && qv.fact.k !== 'neq') jam(JAMS.assumeGate(F(qv.fact)));
          } else if (qv.fact.k !== 'bot') jam(`this would leave the room with its assumption still open: a room is closed only by a contradiction (⊥), not ${F(qv.fact)}`);
          emit({ k: 'exit', room: cfg.room, input: qv.node } as never, room?.kind === 'assume' ? 'discharge (⇒)' : 'discharge', 'exit');
          r.duration = 1;
          break;
        }
        // ───── delivery ─────
        case 'socket': {
          const sd = ctx.level.sockets.find((s) => s.id === cfg.socketId);
          if (!sd) jam(JAMS.noSocket(cfg.socketId));
          socketStatic[cfg.socketId] = {};
          const tg = sd!.target;
          const prod = inBelt.get(`${id}|q`)?.from.m;
          const v = get('q');
          if (tg.k === 'law' || tg.k === 'cond') {
            // a ∀ goal: a card proved on this floor, equal to the target up to renaming its variables
            if (v.k !== 'card') jam(v.k === 'fact' ? JAMS.socketNeedsCard(F(tg), F(v.fact)) : JAMS.socketWrong(F(tg), itemText(v)));
            const cv = v as ItemValue & { k: 'card' };
            if (cv.ref.k !== 'node') jam(JAMS.socketLibrary);
            // as the kernel: a law read either way round (and a cond with a flipped = conclusion) fills it
            if (!sameCardUpToRenaming(cv.card, tg) && !sameCardUpToRenaming(flipConclusion(cv.card), tg)) jam(JAMS.socketWrong(F(tg), F(cv.card)));
            socketStatic[cfg.socketId] = { by: prod, P: (cv.ref as { id: string }).id };
            break;
          }
          if (v.k !== 'fact') jam(JAMS.socketWrong(F(tg), itemText(v)));
          if (tg.k !== 'eq' && tg.k !== 'neq') jam(JAMS.socketWrong(F(tg), itemText(v)));
          const f = (v as ItemValue & { k: 'fact' }).fact as Pallet & { k: 'eq' | 'neq'; l: Term; r: Term };
          if (f.k !== 'eq' && f.k !== 'neq') jam(JAMS.socketWrong(F(tg), F(f)));
          const node = (v as ItemValue & { k: 'fact' }).node;
          const tq = tg as Pallet & { k: 'eq' | 'neq'; l: Term; r: Term };
          if (f.k === tq.k && same(norm(f.l), norm(tq.l)) && same(norm(f.r), norm(tq.r))) {
            socketStatic[cfg.socketId] = { by: prod, P: node };
          } else if (f.k === tq.k && same(norm(f.l), norm(tq.r)) && same(norm(f.r), norm(tq.l))) {
            emit({ k: 'step', input: node, op: { k: 'swap' } } as never, 'auto-swap', 'swap');
            socketStatic[cfg.socketId] = { by: prod, P: lastNode() };
          } else {
            // words versus stacks: say which is which and point at Literal Power (the kernel's wording)
            const hl = f.k === tq.k ? stackWordHint(f.l, tq.l, L) : null, hr = f.k === tq.k ? stackWordHint(f.r, tq.r, L) : null;
            const sideOk = (u: Term, w: Term, h: unknown) => !!h || same(norm(u), norm(w));
            const h = hl ?? hr;
            if (h && sideOk(f.l, tq.l, hl) && sideOk(f.r, tq.r, hr)) jam(JAMS.socketStack(F(tg), h.have, h.want, h.hint));
            jam(JAMS.socketWrong(F(tg), F(f)));
          }
          break;
        }
        default:
          jam(JAMS.oldMachine((m as { kind: string }).kind));
      }
    } catch (e) {
      if (!(e instanceof Halt)) throw e;
      const why = undeclared(e.reason);
      r.status = e.k === 'jammed' ? { k: 'jammed', reason: why } : { k: 'starved', reason: why };
      if (e.k === 'starved' && e.cause) cause[id] = e.cause;
      if (cfg.kind === 'socket' && socketStatic[cfg.socketId] === undefined) socketStatic[cfg.socketId] = {};
      if (cfg.kind === 'socket') socketStatic[cfg.socketId] = { ...socketStatic[cfg.socketId], reason: e.reason };
    }
    if (r.status.k === 'ok' && mine.length && pout[id] === undefined) {
      const f = pfact.get(lastNode());
      if (f) pout[id] = f.k === 'law' || f.k === 'cond' ? { k: 'card', card: f, ref: { k: 'node', id: lastNode() } } : { k: 'fact', fact: f, node: lastNode() };
    }
    const insU = ins.filter((x, i) => ins.findIndex((y) => y.port === x.port) === i);
    plan.machines[id] = {
      source, ...(cfg.kind === 'socket' ? { socket: cfg.socketId } : {}),
      ok: r.status.k === 'ok', ins: insU, duration: r.duration,
    };
  }

  // ── the authority: one full kernel check ──
  const graph: ProofGraph = { nodes, rooms: kRooms, ...(vars.length ? { vars } : {}) };
  const chk: CheckResult = kcheck(graph, ctx0);

  // reconcile: kernel failures jam their owner; dependants starve with the cause
  for (const id of order) {
    const r = results[id]!;
    const m = byId.get(id)!;
    if (r.status.k === 'ok') {
      const ups = plan.machines[id]!.ins.map((p) => inBelt.get(`${id}|${p.port}`)?.from.m).filter((x): x is string => !!x);
      const badUp = ups.find((u) => results[u]?.status.k !== 'ok');
      if (badUp) {
        r.status = { k: 'starved', reason: JAMS.waiting(nameOf(byId.get(badUp)!), [...new Set((ports.get(id) ?? []).filter((p) => p.dir === 'in').flatMap((p) => p.accepts))]) };
        cause[id] = cause[badUp] ?? badUp;
      } else {
        const failed = r.nodes.map((n) => chk.nodes[n]).find((nr) => nr && !nr.ok);
        if (failed) r.status = { k: 'jammed', reason: undeclared(failed.error ?? 'the kernel rejected this step') };
      }
    }
    // final values come from the kernel's result, never from the preview
    if (r.status.k === 'ok' && r.nodes.length && m.kind !== 'socket') {
      const last = r.nodes[r.nodes.length - 1]!;
      const f = chk.nodes[last]?.fact;
      if (f) pout[id] = f.k === 'law' || f.k === 'cond' ? { k: 'card', card: f, ref: { k: 'node', id: last } } : { k: 'fact', fact: f, node: last };
    }
    if (r.status.k === 'ok' && pout[id]) r.out = pout[id];
    else delete r.out;
    // inputs reflect the authoritative upstream values
    for (const p of ports.get(id) ?? []) {
      if (p.dir !== 'in') continue;
      const b = inBelt.get(`${id}|${p.id}`);
      if (b && results[b.from.m]?.status.k === 'ok') r.inputs[p.id] = results[b.from.m]!.out;
      else delete r.inputs[p.id];
    }
    plan.machines[id]!.ok = r.status.k === 'ok';
  }

  // ── sockets: wired delivery with a P-first closure check (§8) ──
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sockets: Compiled['sockets'] = {};
  for (const sd of ctx.level.sockets) {
    const st = socketStatic[sd.id];
    const sm = machines.find((m) => m.config.kind === 'socket' && m.config.socketId === sd.id);
    if (!sm || !st) { sockets[sd.id] = { ok: false, reason: 'there is no dock for this goal on the floor' }; continue; }
    const r = results[sm.id]!;
    if (r.status.k !== 'ok' || !st.P) { sockets[sd.id] = { ...(st.by ? { by: st.by } : {}), ok: false, reason: r.status.k !== 'ok' ? r.status.reason : st.reason ?? 'nothing arrives' }; continue; }
    const P = st.P;
    const pn = nodeById.get(P);
    let ok = false, reason: string | undefined;
    if (!pn || pn.scope !== ROOT) reason = JAMS.socketNotRoot;
    else {
      const seen = new Set<NodeId>();
      const stack = [P];
      while (stack.length) {
        const x = stack.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        const n = nodeById.get(x);
        if (!n) continue;
        const u = usesOf(n);
        stack.push(...u.inputs, ...(u.rule ? [u.rule] : []));
      }
      // the delivered proof's own closure, re-checked by the kernel (in topological order)
      const closure: ProofGraph = { nodes: nodes.filter((n) => seen.has(n.id)), rooms: kRooms, ...(vars.length ? { vars } : {}) };
      const cr = kcheck(closure, ctx0);
      const so = cr.sockets.find((s) => s.id === sd.id);
      const pr = cr.nodes[P];
      const allowed = new Set(sd.allowedGivens.map((g) => `g:${g}`));
      const tg = sd.target;
      const pf = pr?.fact;
      const matches = !!pf && ((tg.k === 'law' || tg.k === 'cond')
        ? (pf.k === 'law' || pf.k === 'cond') && (sameCardUpToRenaming(pf, tg) || sameCardUpToRenaming(flipConclusion(pf), tg))
        : (pf.k === tg.k && (tg.k === 'eq' || tg.k === 'neq') && (pf.k === 'eq' || pf.k === 'neq') && same(norm(pf.l), norm(tg.l)) && same(norm(pf.r), norm(tg.r))));
      const extra = pr?.deps.filter((d) => !allowed.has(d)) ?? [];
      ok = cr.ok && !!so?.ok && !!pr?.ok && matches && !extra.length;
      if (!ok) reason = (extra.length || !so?.ok ? so?.error : undefined) ?? Object.values(cr.nodes).find((n) => !n.ok)?.error ?? 'the kernel does not accept this delivery';
    }
    sockets[sd.id] = { ...(st.by ? { by: st.by } : {}), ok, ...(reason ? { reason } : {}) };
    if (!ok) { r.status = { k: 'jammed', reason: reason! }; plan.machines[sm.id]!.ok = false; }
  }
  const solvable = ctx.level.sockets.length > 0 && ctx.level.sockets.every((s) => sockets[s.id]?.ok);

  // ── transport plan: buffers per belt cell (B|belt|i), so crossings are independent lines ──
  for (const b of belts) {
    if (beltErrors[b.id] || inBelt.get(`${b.to.m}|${b.to.port}`) !== b) continue;
    plan.active.push(b.id);
    plan.feeds[LK.in(b.to.m, b.to.port)] = b.from.m;
    (plan.routes[b.from.m] ??= []).push(b.id);
    const keys = [LK.out(b.from.m), ...b.path.map((_t, i) => LK.belt(b.id, i)), LK.in(b.to.m, b.to.port)];
    for (let i = 0; i + 1 < keys.length; i++) (plan.succ[keys[i]!] ??= []).push(keys[i + 1]!);
  }

  return { graph, check: chk, machines: results, scopeOf, sockets, solvable, beltErrors, cause, plan };
}

/** Every atom id (level constant or tower variable) occurring in a fact or card. */
export function atomsOfFact(f: Fact): Set<string> {
  const out = new Set<string>();
  const walk = (t: Term) => {
    switch (t.k) {
      case 'atom': out.add(t.id); return;
      case 'inv': walk(t.arg); return;
      case 'mul': t.fs.forEach(walk); return;
      case 'pow': walk(t.base); for (const r of polyRefs(t.exp)) if (r.k === 'zvar') out.add(r.id); return;
      case 'int': for (const r of polyRefs(t.val)) if (r.k === 'zvar') out.add(r.id); return;
      default: return;
    }
  };
  if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { walk(f.l); walk(f.r); }
  else if (f.k === 'cond') { for (const p of f.premises) { walk(p.l); walk(p.r); } walk(f.concl.l); walk(f.concl.r); }
  return out;
}

// ───────────────────────────── Lemma Book ─────────────────────────────

/**
 * The card a ∀ machine or an Assume gate emits, if it is a theorem of group theory: a CLOSED card
 * (only metas — no level constant, no free tower variable), proved at the root, with no dependencies
 * (no level given, no open supposition). Everything is read from the kernel's check, never from
 * recipe metadata.
 */
export function lemmaFrom(comp: Compiled, c: Canvas, machineId: string, ctx: KernelCtx): { ok: true; card: Card } | { ok: false; reason: string } {
  const m = c.machines.find((x) => x.id === machineId);
  const room = m?.config.kind === 'gate' ? c.rooms.find((x) => x.id === (m.config as { room: string }).room) : undefined;
  if (!m || !(m.kind === 'forall' || (m.kind === 'gate' && room?.kind === 'assume'))) return { ok: false, reason: JAMS.lemmaNotCard };
  const r = comp.machines[machineId];
  if (!r || r.status.k !== 'ok') return { ok: false, reason: JAMS.lemmaNotReady(r && r.status.k !== 'ok' ? r.status.reason : 'nothing comes out yet') };
  if (r.out?.k !== 'card' || r.out.ref.k !== 'node') return { ok: false, reason: JAMS.lemmaNotReady('nothing comes out yet') };
  const nodeIdOut = r.out.ref.id;
  const node = comp.graph.nodes.find((n) => n.id === nodeIdOut);
  const nr = comp.check.nodes[nodeIdOut];
  if (!node || !nr?.ok || !nr.fact || (nr.fact.k !== 'law' && nr.fact.k !== 'cond')) return { ok: false, reason: JAMS.lemmaNotReady(nr?.error ?? 'the kernel has not certified it') };
  const L = labelsOf([...ctx.level.atoms, ...(comp.graph.vars ?? [])]);
  for (const d of [...nr.deps].sort(cmp)) {
    if (d.startsWith('g:')) {
      const gd = ctx.level.givens.find((g) => g.id === d.slice(2));
      return { ok: false, reason: JAMS.lemmaGiven(gd ? `${gd.name}: ${factText(gd.fact, L)}` : d.slice(2)) };
    }
    if (d.startsWith('a:')) {
      const rm = c.rooms.find((x) => x.id === d.slice(2));
      const k = rm && (rm.kind === 'suppose' || (rm.kind === 'assume' && (rm.rel ?? 'eq') === 'eq')) ? 'eq' : 'neq';
      return { ok: false, reason: JAMS.lemmaSupposition(rm ? factText({ k, l: rm.l, r: rm.r }, L) : 'a room’s assumption') };
    }
    return { ok: false, reason: JAMS.lemmaNotReady(`it rests on ${d}`) };
  }
  if (node.scope !== ROOT) return { ok: false, reason: JAMS.lemmaInRoom };
  const atoms = [...atomsOfFact(nr.fact)].sort(cmp);
  const varIds = new Set((comp.graph.vars ?? []).map((v) => v.id));
  const constant = atoms.find((x) => !varIds.has(x));
  if (constant) return { ok: false, reason: JAMS.lemmaConst(L[constant] ?? constant) };
  if (atoms.length) return { ok: false, reason: JAMS.lemmaVar(L[atoms[0]!] ?? atoms[0]!) };
  return { ok: true, card: nr.fact };
}

/** Authored-lemma ids a canvas cites (recipes and card docks referring to registry schemas). */
function citedSchemas(c: Canvas): Set<string> {
  const out = new Set<string>();
  const walk = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const o = x as Record<string, unknown>;
    if (o.k === 'schema' && typeof o.id === 'string') out.add(o.id);
    for (const v of Object.values(o)) walk(v);
  };
  for (const m of c.machines) walk(m.config);
  return out;
}

/**
 * Re-verify a saved lemma: recompile its canvas (under its own level) with every authored lemma that
 * is not EARLIER-saved removed from the library, and require its machine to emit the same card,
 * closed, at root, with no dependencies. `earlier` = ids of lemmas saved before this one (acyclic
 * citation); omitted = no other authored lemma may be cited. Use verifyLemmas() for a whole book.
 */
export function verifyLemma(l: SavedLemma, ctx: KernelCtx, earlier: string[] = []): { ok: true } | { ok: false; reason: string } {
  try {
    const allowed = new Set(earlier.filter((x) => x !== l.id));
    const authoredOut = (id: string) => ctx.registry[id]?.origin === 'authored' && !allowed.has(id);
    for (const id of citedSchemas(l.canvas)) if (id === l.id || authoredOut(id)) return { ok: false, reason: JAMS.lemmaSelf };
    const level = ctx.level.id === l.levelId ? ctx.level : LEVEL_BY_ID[l.levelId];
    if (!level) return { ok: false, reason: `the order ${l.levelId} it was proved on no longer exists` };
    const registry = Object.fromEntries(Object.entries(ctx.registry).filter(([id]) => id !== l.id && !authoredOut(id)));
    const schemas = ctx.level.tools.schemas.filter((id) => id !== l.id && !authoredOut(id));
    const vctx: KernelCtx = { level: { ...level, tools: { ...ctx.level.tools, schemas } }, registry };
    const comp = compile(l.canvas, vctx);
    const res = lemmaFrom(comp, l.canvas, l.machine, vctx);
    if (!res.ok) return res;
    if (!sameCardUpToRenaming(res.card, l.card)) return { ok: false, reason: JAMS.lemmaChanged };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `the saved proof could not be read (${(e as Error)?.message ?? 'unknown'})` };
  }
}

/** Verify a whole Lemma Book in save order; each lemma may cite only verified, earlier-saved ones. */
export function verifyLemmas(lemmas: SavedLemma[], ctxOf: (levelId: string) => KernelCtx): SavedLemma[] {
  const ordered = [...lemmas].sort((a, b) => a.savedAt - b.savedAt || cmp(a.id, b.id));
  const good: string[] = [];
  const out = new Map<string, SavedLemma>();
  for (const l of ordered) {
    const v = verifyLemma(l, ctxOf(l.levelId), good);
    if (v.ok) good.push(l.id);
    out.set(l.id, v.ok ? { ...l, verified: true, reason: undefined } : { ...l, verified: false, reason: v.reason });
  }
  return lemmas.map((l) => out.get(l.id)!);
}

/** The machine whose jam starves `id` (itself if it is jammed), for the lens's causal link. */
export function rootCause(comp: Compiled, id: string): string | undefined {
  const r = comp.machines[id];
  if (!r) return undefined;
  if (r.status.k === 'jammed') return id;
  return (comp as Partial<CompiledX>).cause?.[id];
}

// keep a couple of imports referenced for type-only consumers
export type { SpanLoc, GapLoc };
export { RAIL_ORDER };
