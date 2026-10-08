// LEMMA WORKS kernel — test helpers (used by src/kernel/*.test.ts; also handy for
// other builders' tests). Mirrors Store.commitOffer / openRoom / press exactly,
// without DOM or localStorage.
import type {
  Addr, CheckResult, GapAddr, LevelManifest, NodeId, Offer, ProofGraph, ProofNode, Room, ScopeId, StepOp, Subst, Term,
} from './types';
import { ROOT } from './types';
import * as K from './index';
import { LEVEL_BY_ID, REGISTRY } from '../levels/levels';

/** Context for a campaign level with every listed schema treated as earned. */
export function ctxOf(levelId: string): K.KernelCtx {
  const level = LEVEL_BY_ID[levelId];
  if (!level) throw new Error(`no level ${levelId}`);
  return { level, registry: REGISTRY };
}

/** An ad-hoc level manifest for kernel tests. */
export function mkLevel(p: Omit<Partial<LevelManifest>, 'tools'> & { tools?: Partial<LevelManifest['tools']> } = {}): LevelManifest {
  return {
    id: 'T', index: 0, chapter: 1, title: 'test', memo: '', idea: '', par: { parts: 0, axioms: 0 }, uses: [],
    atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'c', label: 'c', hue: 2 }, { id: 'd', label: 'd', hue: 3 }],
    givens: [], sockets: [], unlocks: [],
    ...p,
    tools: { lift: true, merge: true, suppose: true, classical: true, press: true, schemas: [], conjecture: false, ...(p.tools ?? {}) },
  };
}
export const mkCtx = (p: Parameters<typeof mkLevel>[0] = {}): K.KernelCtx => ({ level: mkLevel(p), registry: REGISTRY });

let uid = 0;
const fresh = (p: string) => `${p}${(uid++).toString(36)}`;

/** A headless player: holds a graph, commits offers like the store does, and rejects anything check() rejects. */
export class Player {
  graph: ProofGraph;
  res: CheckResult;
  /** every station committed, in order (for reachability assertions) */
  log: { at: NodeId; sel: Addr | GapAddr | null; offer: Offer }[] = [];
  constructor(public ctx: K.KernelCtx, graph?: ProofGraph) {
    const level = ctx.level;
    this.graph = graph ?? {
      nodes: [
        ...level.givens.map((g): ProofNode => ({ id: `g:${g.id}`, scope: ROOT, k: 'given', givenId: g.id })),
        ...(level.preStarts ?? []).map((t, i): ProofNode => ({ id: `pre${i}`, scope: ROOT, k: 'start', term: K.norm(t) })),
      ],
      rooms: [],
    };
    this.res = K.check(this.graph, ctx);
  }
  fact(id: NodeId) { return this.res.nodes[id]?.fact; }
  text(id: NodeId) { const f = this.fact(id); return f ? K.factText(f, K.labelsOf(this.ctx.level.atoms)) : '(none)'; }
  private commit(g: ProofGraph): CheckResult {
    const r = K.check(g, this.ctx);
    const bad = Object.values(r.nodes).find((n) => !n.ok);
    if (!r.ok || bad) throw new Error(`kernel rejected commit: ${bad?.error ?? 'graph not ok'}`);
    this.graph = g; this.res = r;
    this.afterCommit();
    return r;
  }
  /** Store.afterCommit's auto-swap delivery. */
  private afterCommit() {
    for (const sock of this.res.sockets) {
      if (sock.ok) continue;
      const t = this.ctx.level.sockets.find((d) => d.id === sock.id)!.target;
      if (t.k !== 'eq' && t.k !== 'neq') continue;
      for (const n of this.graph.nodes) {
        if (n.scope !== ROOT) continue;
        if (this.graph.nodes.some((m) => m.k === 'step' && m.input === n.id)) continue;
        const f = this.res.nodes[n.id]?.fact;
        if (!f || f.k !== t.k) continue;
        if (K.termEq(f.l, t.r) && K.termEq(f.r, t.l)) {
          const node: ProofNode = { id: fresh('n'), scope: ROOT, k: 'step', input: n.id, op: { k: 'swap' }, meta: { station: fresh('st'), gesture: 'auto-swap' } };
          this.commit({ ...this.graph, nodes: [...this.graph.nodes, node] });
          this.lastAutoSwap = node.id;
          return;
        }
      }
    }
  }
  lastAutoSwap: NodeId | null = null;

  start(term: Term | string, scope: ScopeId = ROOT): NodeId {
    const t = typeof term === 'string' ? this.parse(term) : K.norm(term);
    const node: ProofNode = { id: fresh('s'), scope, k: 'start', term: t };
    this.commit({ ...this.graph, nodes: [...this.graph.nodes, node] });
    return node.id;
  }
  parse(src: string): Term {
    const r = K.parseTerm(src, this.ctx.level.atoms);
    if (!r.ok) throw new Error(r.error);
    return r.term;
  }
  openRoom(kind: Room['kind'], l: Term | string, r: Term | string, parent: ScopeId = ROOT): { room: ScopeId; assume: NodeId } {
    const room: Room = { id: fresh('room'), parent, kind, l: typeof l === 'string' ? this.parse(l) : K.norm(l), r: typeof r === 'string' ? this.parse(r) : K.norm(r) };
    const assume: ProofNode = { id: fresh('n'), scope: room.id, k: 'assume', room: room.id, meta: { station: fresh('st'), gesture: kind } };
    this.commit({ nodes: [...this.graph.nodes, assume], rooms: [...this.graph.rooms, room] });
    return { room: room.id, assume: assume.id };
  }
  press(sizeNode: NodeId): NodeId {
    const scope = this.graph.nodes.find((n) => n.id === sizeNode)?.scope ?? ROOT;
    const node: ProofNode = { id: fresh('p'), scope, k: 'press', input: sizeNode, meta: { station: fresh('st'), gesture: 'Lagrange press' } };
    this.commit({ ...this.graph, nodes: [...this.graph.nodes, node] });
    return node.id;
  }
  offers(at: NodeId, sel: Addr | GapAddr | null): Offer[] { return K.offersAt(this.graph, this.res, at, sel, this.ctx); }

  /** Find an offer by label (exact or regex) or predicate; fill needs; commit. Returns the new belt end. */
  play(at: NodeId, sel: Addr | GapAddr | null, pick: string | RegExp | ((o: Offer) => boolean), values: Record<string, Term | string> = {}): NodeId {
    const offers = this.offers(at, sel);
    const pred = typeof pick === 'function' ? pick : typeof pick === 'string' ? (o: Offer) => o.label === pick : (o: Offer) => pick.test(o.label);
    let o = offers.find(pred);
    if (!o) throw new Error(`no offer matching ${String(pick)} at ${this.text(at)} sel=${JSON.stringify(sel)}; have: ${offers.map((x) => x.label).join(' | ')}`);
    if (o.needs.length) {
      const vals: Subst = {};
      for (const [k, v] of Object.entries(values)) vals[k] = typeof v === 'string' ? this.parse(v) : v;
      const f = K.fillOffer(o, vals, this.graph, this.res, at, this.ctx);
      if (!f.ok) throw new Error(`fill failed: ${f.error}`);
      o = f.offer;
    }
    this.log.push({ at, sel, offer: o });
    return this.commitOffer(o, at);
  }

  /** Store.commitOffer, verbatim semantics. */
  commitOffer(offer: Offer, nodeId: NodeId): NodeId {
    if (offer.needs.length) throw new Error('offer still needs values');
    const g = this.graph;
    const doomed = new Set<NodeId>();
    const after = g.nodes.find((n) => n.k === 'step' && n.input === nodeId);
    if (after) this.collect(after.id, g, doomed);
    const base: ProofGraph = { ...g, nodes: g.nodes.filter((n) => !doomed.has(n.id)) };
    const scope = base.nodes.find((n) => n.id === nodeId)!.scope;
    const station = fresh('st');
    const nodes = [...base.nodes];
    let last = nodeId;
    const pushStep = (op: StepOp, gesture?: string) => {
      const id = fresh('n');
      nodes.push({ id, scope, k: 'step', input: last, op, meta: { station, gesture } });
      last = id;
    };
    const kind = offer.kind;
    if (kind.k === 'steps') {
      const isTidy = (op: StepOp) => op.k === 'rewrite' && op.rule.k === 'axiom' && (op.rule.id === 'unitL' || op.rule.id === 'unitR') && op.dir === 'fwd';
      kind.ops.forEach((op, i) => pushStep(op, i > 0 && isTidy(op) ? 'auto-tidy' : offer.label));
    } else if (kind.k === 'apply') {
      let inputs = kind.inputs;
      if (kind.preSwap) {
        const sw = fresh('n');
        nodes.push({ id: sw, scope, k: 'step', input: nodeId, op: { k: 'swap' }, meta: { station: fresh('st'), gesture: 'auto-swap' } });
        inputs = inputs.map((i) => (i === nodeId ? sw : i));
      }
      const id = fresh('n');
      nodes.push({ id, scope, k: 'apply', rule: kind.rule, inputs, subst: kind.subst, meta: { station, gesture: offer.label } });
      last = id;
      for (const op of kind.tidy ?? []) pushStep(op, 'auto-tidy');
    } else if (kind.k === 'clash') {
      const id = fresh('n');
      nodes.push({ id, scope, k: 'clash', inputs: [nodeId, kind.neq], meta: { station, gesture: offer.label } });
      last = id;
      const room = base.rooms.find((r) => r.id === scope);
      if (room) {
        const ex = fresh('n');
        nodes.push({ id: ex, scope: room.parent, k: 'exit', room: room.id, input: id, meta: { station, gesture: 'discharge' } });
        last = ex;
      }
    } else if (kind.k === 'merge') {
      const id = fresh('n');
      nodes.push({ id, scope, k: 'merge', inputs: [kind.other, nodeId], meta: { station, gesture: offer.label } });
      last = id;
    }
    this.lastAutoSwap = null;
    this.commit({ ...base, nodes });
    return this.lastAutoSwap ?? last;
  }
  private collect(id: NodeId, g: ProofGraph, acc: Set<NodeId>) {
    if (acc.has(id)) return;
    acc.add(id);
    for (const n of g.nodes) {
      const uses: NodeId[] = [];
      if (n.k === 'step') { uses.push(n.input); if (n.op.k === 'rewrite' && n.op.rule.k === 'node') uses.push(n.op.rule.id); }
      if (n.k === 'apply') { uses.push(...n.inputs); if (n.rule.k === 'node') uses.push(n.rule.id); }
      if (n.k === 'merge' || n.k === 'clash') uses.push(...n.inputs);
      if (n.k === 'exit' || n.k === 'press') uses.push(n.input);
      if (uses.includes(id)) this.collect(n.id, g, acc);
    }
  }
}

/** Address helpers */
export const span = (side: 'l' | 'r', s: number, e: number, path: number[] = []): Addr => ({ side, path, range: [s, e] });
export const gap = (side: 'l' | 'r', g: number, path: number[] = []): GapAddr => ({ side, path, gap: g });
