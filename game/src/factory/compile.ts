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
  AxiomId, Card, CheckResult, Fact, GapAddr, MetaId, NodeId, Pallet, PatFact, ProofGraph, ProofNode,
  Room as KRoom, RuleRef, ScopeId, StepOp, Subst, Term, Addr,
} from '../kernel/types';
import { ROOT } from '../kernel/types';
import { applyCore, axiomCard, check as kcheck, checkGround, nodeUses, pressCard, resolveCond, resolveLaw, schemaCard } from '../kernel/logic';
import { E, KErr, instantiate, instantiatePartial, match, metasOf, norm, same, substKey, word } from '../kernel/terms';
import { factText, labelsOf, substText, termText, type Labels } from '../kernel/print';
import type {
  Belt, Canvas, Compiled, ItemKind, ItemValue, Machine, MachineConfig, MachineResult, Param, Port, Rect, Tile,
} from './types';
import { itemKindOf } from './types';
import { FACE_DELTA, footprint, portsOf, frontOf, inRect, tileKey } from './geometry';
import { SPECS, schemaMachineName } from './catalog';
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
  gatePlace: 'this gate is not on its own room’s wall facing out; only a room’s own gate crosses its boundary',
  deskPlace: 'this desk is not inside its own room',
} as const;

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

/** Is v (a ground or partially bound value) complete for every meta? */
const missing = (metas: MetaId[], s: Subst) => metas.filter((m) => !s[m]);

// ───────────────────────────── compile ─────────────────────────────

export function compile(c: Canvas, ctx: KernelCtx): CompiledX {
  const L = labelsOf(ctx.level.atoms);
  const T = (t: Term) => termText(t, L);
  const F = (f: Fact) => factText(f, L);
  const itemText = (v: ItemValue) => (v.k === 'term' ? T(v.term) : v.k === 'fact' ? F(v.fact) : F(v.card));

  const machines = [...c.machines].sort((a, b) => cmp(a.id, b.id));
  const byId = new Map<string, Machine>(machines.map((m) => [m.id, m]));
  const nameOf = (m: Machine) => (m.config.kind === 'stamp' || m.config.kind === 'carddock'
    ? schemaMachineName(ctx, m.config.schema, m.config.mirror) : SPECS[m.kind]?.name ?? m.kind);

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
  const kRooms: KRoom[] = rooms.map((r) => ({ id: r.id, parent: parentOf.get(r.id) ?? ROOT, kind: r.kind, l: r.l, r: r.r }));
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
    try { return F(r.kind === 'suppose' ? { k: 'eq', l: r.l, r: r.r } : { k: 'neq', l: r.l, r: r.r }); } catch { return 'a supposition'; }
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
          f = r.kind === 'suppose' ? { k: 'eq', l, r: rr } : { k: 'neq', l, r: rr };
          break;
        }
        case 'step': {
          const inp = use(n.input);
          if (inp.k === 'law' || inp.k === 'cond') throw new KErr('a universal statement cannot be rewritten; cite it as a rule instead');
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
        case 'exit': {
          const r = roomsK.get(n.room);
          if (!r) throw new KErr('there is no such room to close');
          const inp = use(n.input);
          if (inp.k !== 'bot') throw new KErr('a room is closed only by a contradiction (⊥)');
          deps.delete(`a:${r.id}`);
          f = r.kind === 'suppose' ? { k: 'neq', l: norm(r.l), r: norm(r.r) } : { k: 'eq', l: norm(r.l), r: norm(r.r) };
          break;
        }
        case 'press': {
          const inp = use(n.input);
          if (inp.k !== 'size') throw new KErr('the Lagrange press needs the order of the group (|G| = n)');
          f = pressCard(inp.n);
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
      if (!res.ok) return jam(res.error);
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
    const param = (p: Param, pid: string, what: string): Term => {
      if (p.k === 'port') return getTerm(pid);
      if (!p.term) return starve(JAMS.chooseElement(what));
      try { return checkGround(p.term, ctx, what); } catch (e) { return jam((e as Error).message); }
    };
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
    function pickSpan<X>(q: Pallet, target: Extract<MachineConfig, { target: unknown }>['target'] & { k: string },
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
      values: Record<MetaId, Param>, choice: number, catalystPort: boolean) => {
      void catalystPort;
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
        partial[mId] = param(p, `meta:${mId}`, mId);
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
      if (!complete.length) return jam(JAMS.needsMeta(missing(card.metas, ss[0]!).join(', ')));
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
        // courtesy: the Anvil sorts its two inlets by kind; a gate takes ⊥ from any inward port
        if (cfg.kind === 'anvil' && (k === 'eq' || k === 'neq')) continue;
        if (cfg.kind === 'gate' && k === 'bot') continue;
        if (p.id === 'rule' && (cfg.kind === 'rewriter' || cfg.kind === 'expander')) {
          if (k === 'neq') jam(JAMS.ruleNeq(itemText(v)));
          if (k === 'cond') jam(JAMS.ruleCond(itemText(v)));
          jam(JAMS.ruleOther(itemText(v), k));
        }
        jam(JAMS.wrongKind(p.accepts, itemText(v), k));
      }

      switch (cfg.kind) {
        // ───── sources ─────
        case 'spool': {
          const t = param(cfg.t, 't', 't');
          source = cfg.t.k === 'knob';
          emit({ k: 'start', term: t } as never, 'reflexivity', 'start');
          r.duration = source ? 0 : 1;
          break;
        }
        case 'hopper': {
          source = true;
          if (!cfg.t) starve(JAMS.chooseElement('the hopper'));
          let t: Term;
          try { t = checkGround(cfg.t!, ctx, 'the hopper’s element'); } catch (e) { t = jam((e as Error).message); }
          pout[id] = { k: 'term', term: t };
          break;
        }
        case 'given': {
          source = true;
          const gd = ctx.level.givens.find((g) => g.id === cfg.givenId);
          if (!gd) jam(JAMS.noGiven(cfg.givenId));
          emit({ k: 'given', givenId: cfg.givenId } as never, 'given', 'given');
          break;
        }
        case 'desk': {
          source = true;
          emit({ k: 'assume', room: cfg.room } as never, 'suppose', 'assume');
          break;
        }
        case 'carddock': {
          source = true;
          let card: Card;
          try { card = schemaCard(cfg.schema, cfg.mirror, ctx); } catch (e) { card = jam((e as Error).message); }
          pout[id] = { k: 'card', card, ref: { k: 'schema', id: cfg.schema, ...(cfg.mirror ? { mirror: true } : {}) } };
          break;
        }
        // ───── term syntax ─────
        case 'joiner': {
          const a = getTerm('a'), b = getTerm('b');
          pout[id] = { k: 'term', term: norm({ k: 'mul', fs: [a, b] }) };
          r.duration = 1;
          break;
        }
        case 'inverter': {
          const t = getTerm('q');
          pout[id] = { k: 'term', term: norm({ k: 'inv', arg: t }) };
          r.duration = 1;
          break;
        }
        // ───── built-in axioms ─────
        case 'canceller': {
          const qv = getFact('q');
          const q = qv.fact;
          if (q.k !== 'eq') jam(JAMS.wrongKind(['eq'], F(q), q.k));
          const cands: { loc: SpanLoc; x: { id: AxiomId; s: Subst } }[] =
            cancelCandidates(q).map((cd) => ({ loc: cd.loc, x: { id: cd.id, s: { x: cd.x } } }));
          const pick = pickSpan(q, cfg.target, cands,
            () => (cfg.target.k === 'first' ? JAMS.noCancelAnywhere(qText(q)) : JAMS.noCancel('right', railText(q, 'r'))),
            (loc) => JAMS.notInverses(T(loc.redex)));
          const at: Addr = spanAddr(pick.loc);
          emit({ k: 'step', input: qv.node, op: { k: 'rewrite', rule: { k: 'axiom', id: pick.x.id }, dir: 'fwd', at, subst: pick.x.s } } as never, 'cancel', 'cancel');
          if (cfg.tidy) {
            const w = [...pick.loc.word.slice(0, pick.loc.s), E, ...pick.loc.word.slice(pick.loc.e)];
            const op = tidyAt(pick.loc.side, pick.loc.wordPath, w, pick.loc.s);
            if (op) emit({ k: 'step', input: lastNode(), op } as never, 'auto-tidy', 'tidy');
          }
          r.duration = mine.length;
          break;
        }
        case 'popper': {
          const qv = getFact('q');
          const q = qv.fact;
          if (q.k !== 'eq') jam(JAMS.wrongKind(['eq'], F(q), q.k));
          const all = spanCandidates(q, RAIL_ORDER, 1);
          const cands = all.filter((l) => l.e - l.s === 1 && l.redex.k === 'e' && l.word.length >= 2).map((loc) => ({ loc, x: null }));
          const pick = pickSpan(q, cfg.target, cands, () => JAMS.noE(qText(q)),
            (loc) => (loc.redex.k === 'e' ? JAMS.soleE : JAMS.notE(T(loc.redex))));
          const op = tidyAt(pick.loc.side, pick.loc.wordPath, pick.loc.word, pick.loc.s)!;
          emit({ k: 'step', input: qv.node, op } as never, 'remove e', 'pop');
          r.duration = 1;
          break;
        }
        case 'expander': {
          const qv = getFact('q');
          const q = qv.fact;
          if (q.k !== 'eq') jam(JAMS.wrongKind(['eq'], F(q), q.k));
          // ingredients first (starved before targeting), then the gap
          let X: Term | null = null;
          let rule: { ref: RuleRef; fact?: Fact; text: string } | null = null;
          if (cfg.insert === 'pair' || cfg.insert === 'pairInv') X = param(cfg.x, 'x', 'x');
          if (cfg.insert === 'rule') {
            rule = getRule('rule');
            if (cfg.x.k === 'port' || cfg.x.term) X = param(cfg.x, 'x', 'x');
          }
          const g = pickGap(q, cfg.target);
          const ga: GapAddr = gapAddr(g);
          const at: Addr = { side: g.side, path: [...g.wordPath], range: [g.gap, g.gap + 1] };
          if (cfg.insert === 'e') {
            emit({ k: 'step', input: qv.node, op: { k: 'insertE', at: ga } } as never, 'insert e', 'insert');
            r.duration = 1;
            break;
          }
          if (cfg.insert === 'pair' || cfg.insert === 'pairInv') {
            const ax: AxiomId = cfg.insert === 'pair' ? 'invR' : 'invL';
            emit({ k: 'step', input: qv.node, op: { k: 'insertE', at: ga } } as never, 'insert pair', 'insert');
            emit({ k: 'step', input: lastNode(), op: { k: 'rewrite', rule: { k: 'axiom', id: ax }, dir: 'rev', at, subst: { x: X! } } } as never, 'insert pair', 'expand');
            r.duration = 2;
            break;
          }
          // insert = 'rule': e → the rule's other side, at the new e
          let law;
          try { law = resolveLaw(rule!.ref, ctx, rule!.fact, L); } catch (e) { law = jam((e as Error).message); }
          const [src, dst] = cfg.dir === 'fwd' ? [law.l, law.r] : [law.r, law.l];
          const partial: Subst = {};
          if (X && law.metas.length) {
            const srcMetas = metasOf(src);
            const dstOnly = law.metas.filter((mm) => !srcMetas.includes(mm));
            if (law.metas.length > 1 && dstOnly.length > 1) jam(JAMS.expanderMetas(rule!.text, dstOnly.join(', ')));
            partial[law.metas.length === 1 ? law.metas[0]! : (dstOnly[0] ?? law.metas[0]!)] = X;
          }
          const ss = sortSubsts(match(src, E, partial));
          if (!ss.length) jam(JAMS.ruleNotE(rule!.text, cfg.dir === 'fwd' ? 'left' : 'right'));
          const s = ss.find((x) => !missing(law.metas, x).length);
          if (!s) jam(JAMS.needsMeta(missing(law.metas, ss[0]!).join(', ')));
          void dst;
          emit({ k: 'step', input: qv.node, op: { k: 'insertE', at: ga } } as never, `insert ${rule!.text}`, 'insert');
          emit({ k: 'step', input: lastNode(), op: { k: 'rewrite', rule: rule!.ref, dir: cfg.dir, at, subst: s! } } as never, `insert ${rule!.text}`, 'expand');
          r.duration = 2;
          break;
        }
        // ───── routed rules ─────
        case 'rewriter': {
          const qv = getFact('q');
          const q = qv.fact;
          if (q.k !== 'eq') jam(JAMS.wrongKind(['eq'], F(q), q.k));
          const rule = getRule('rule');
          let law;
          try { law = resolveLaw(rule.ref, ctx, rule.fact, L); } catch (e) { law = jam((e as Error).message); }
          const [src, dst] = cfg.dir === 'fwd' ? [law.l, law.r] : [law.r, law.l];
          const partial: Subst = {};
          for (const mId of Object.keys(cfg.values).sort(cmp)) {
            const p = cfg.values[mId]!;
            if (!law.metas.includes(mId)) { if (p.k === 'knob' && !p.term) continue; jam(JAMS.notAVariable(mId)); }
            if (p.k === 'knob' && !p.term) continue;
            partial[mId] = param(p, `meta:${mId}`, mId);
          }
          let incomplete: string[] | null = null;
          const cands: { loc: SpanLoc; x: Subst }[] = [];
          const fixedLen = metasOf(src).length ? undefined : word(norm(src)).length;
          if (fixedLen === undefined && spanCount(q) > MATCH_BUDGET) jam(JAMS.budget);
          for (const loc of spanCandidates(q, RAIL_ORDER, fixedLen)) {
            const ms = sortSubsts(match(src, loc.redex, partial));
            if (!ms.length) continue;
            const full = ms.find((s) => !missing(law.metas, s).length);
            if (full) cands.push({ loc, x: full });
            else if (!incomplete) incomplete = missing(law.metas, ms[0]!);
          }
          const pat = T(instantiatePartial(src, partial));
          const pick = pickSpan(q, cfg.target, cands,
            () => (incomplete ? JAMS.needsMeta(incomplete.join(', ')) : JAMS.noRedex(pat, qText(q), rule.text)),
            (loc) => {
              const ms = match(src, loc.redex, partial);
              if (ms.length) return JAMS.needsMeta(missing(law.metas, ms[0]!).join(', '));
              return JAMS.pinMismatch(T(loc.redex), rule.text, pat);
            });
          emit({ k: 'step', input: qv.node, op: { k: 'rewrite', rule: rule.ref, dir: cfg.dir, at: spanAddr(pick.loc), subst: pick.x } } as never, `by ${rule.text}`, 'rewrite');
          if (cfg.tidy) {
            let dstInst: Term | null = null;
            try { dstInst = instantiate(dst, pick.x); } catch { dstInst = null; }
            if (dstInst && dstInst.k === 'e') {
              const w = [...pick.loc.word.slice(0, pick.loc.s), E, ...pick.loc.word.slice(pick.loc.e)];
              const op = tidyAt(pick.loc.side, pick.loc.wordPath, w, pick.loc.s);
              if (op) emit({ k: 'step', input: lastNode(), op } as never, 'auto-tidy', 'tidy');
            }
          }
          r.duration = mine.length;
          break;
        }
        case 'multiplier': {
          const qv = getFact('q');
          if (qv.fact.k !== 'eq') jam(`only an equation can be multiplied; ${F(qv.fact)} is ${NOUN[qv.fact.k]}`);
          const t = param(cfg.t, 't', 't');
          emit({ k: 'step', input: qv.node, op: { k: 'lift', side: cfg.side, term: t } } as never, `multiply on the ${cfg.side}`, 'lift');
          r.duration = 1;
          break;
        }
        case 'swapper': {
          const qv = getFact('q');
          emit({ k: 'step', input: qv.node, op: { k: 'swap' } } as never, 'symmetry', 'swap');
          r.duration = 1;
          break;
        }
        case 'meet': {
          const a = getFact('a'), b = getFact('b');
          emit({ k: 'merge', inputs: [a.node, b.node] } as never, 'transitivity', 'merge');
          r.duration = 2;
          break;
        }
        case 'anvil': {
          const a = getFact('a'), b = getFact('b');
          // either inlet may carry either statement: sort by kind, then clash([eq, neq])
          const [qn, nn] = a.fact.k === 'eq' && b.fact.k === 'neq' ? [a.node, b.node] : b.fact.k === 'eq' && a.fact.k === 'neq' ? [b.node, a.node] : [null, null];
          if (!qn || !nn) {
            const both = a.fact.k === b.fact.k && (a.fact.k === 'eq' || a.fact.k === 'neq') ? `; both inlets carry ${a.fact.k === 'eq' ? 'equations' : 'inequations'}` : '';
            jam(`${JAMS.anvilKinds}${both}`);
          }
          emit({ k: 'clash', inputs: [qn!, nn!] } as never, 'contradiction', 'clash');
          r.duration = 2;
          break;
        }
        case 'press': {
          const qv = getFact('q');
          emit({ k: 'press', input: qv.node } as never, 'Lagrange', 'press');
          r.duration = 3;
          break;
        }
        case 'apply': {
          const v = get('rule', true);
          let ref: RuleRef, rf: Fact | undefined, name: string;
          if (v.k === 'card') { ref = v.ref; rf = v.ref.k === 'node' ? v.card : undefined; name = F(v.card); }
          else if (v.k === 'fact') { ref = jam(JAMS.applyNotCard(F(v.fact))); rf = undefined; name = ''; }
          else { ref = jam(JAMS.applyNotCard(T(v.term))); rf = undefined; name = ''; }
          lowerApply(ref, rf, name, Math.max(0, Math.floor(cfg.premises)), cfg.values, cfg.choice, true);
          break;
        }
        case 'stamp': {
          const name = schemaMachineName(ctx, cfg.schema, cfg.mirror);
          try { schemaCard(cfg.schema, cfg.mirror, ctx); } catch (e) { jam((e as Error).message); }
          const sc = ctx.registry[cfg.schema]!;
          const n = sc.card.k === 'cond' ? sc.card.premises.length : 0;
          lowerApply({ k: 'schema', id: cfg.schema, ...(cfg.mirror ? { mirror: true } : {}) }, undefined, name, n, cfg.values, cfg.choice, false);
          break;
        }
        // ───── rooms ─────
        case 'gate': {
          const ins0 = myPorts.filter((p) => p.dir === 'in').map((p) => p.id).sort(cmp);
          const gp = ins0.find((pid) => inBelt.has(`${id}|${pid}`) || badIn.has(`${id}|${pid}`) || brokenIn.has(`${id}|${pid}`)) ?? ins0[0] ?? 'q';
          const qv = getFact(gp);
          if (qv.fact.k !== 'bot') jam(`this would leave the room with its assumption still open: a room is closed only by a contradiction (⊥), not ${F(qv.fact)}`);
          emit({ k: 'exit', room: cfg.room, input: qv.node } as never, 'discharge', 'exit');
          r.duration = 1;
          break;
        }
        // ───── delivery ─────
        case 'socket': {
          const sd = ctx.level.sockets.find((s) => s.id === cfg.socketId);
          if (!sd) jam(JAMS.noSocket(cfg.socketId));
          socketStatic[cfg.socketId] = {};
          const qv = getFact('q');
          const tg = sd!.target as Pallet & { k: 'eq' | 'neq' };
          const f = qv.fact;
          const prod = inBelt.get(`${id}|q`)?.from.m;
          if (f.k === tg.k && same(norm(f.l), norm(tg.l)) && same(norm(f.r), norm(tg.r))) {
            socketStatic[cfg.socketId] = { by: prod, P: qv.node };
          } else if (f.k === tg.k && same(norm(f.l), norm(tg.r)) && same(norm(f.r), norm(tg.l))) {
            emit({ k: 'step', input: qv.node, op: { k: 'swap' } } as never, 'auto-swap', 'swap');
            socketStatic[cfg.socketId] = { by: prod, P: lastNode() };
          } else jam(JAMS.socketWrong(F(tg), F(f)));
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof Halt)) throw e;
      r.status = e.k === 'jammed' ? { k: 'jammed', reason: e.reason } : { k: 'starved', reason: e.reason };
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
  const graph: ProofGraph = { nodes, rooms: kRooms };
  const chk: CheckResult = kcheck(graph, ctx);

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
        if (failed) r.status = { k: 'jammed', reason: failed.error ?? 'the kernel rejected this step' };
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
        const u = nodeUses(n);
        stack.push(...u.inputs, ...(u.rule ? [u.rule] : []));
      }
      const closure: ProofGraph = { nodes: [pn, ...nodes.filter((n) => n.id !== P && seen.has(n.id))], rooms: kRooms };
      const cr = kcheck(closure, ctx);
      const so = cr.sockets.find((s) => s.id === sd.id);
      ok = cr.ok && !!so?.ok && so.filledBy === P;
      if (!ok) reason = so?.error ?? Object.values(cr.nodes).find((n) => !n.ok)?.error ?? 'the kernel does not accept this delivery';
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
