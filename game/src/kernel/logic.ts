// LEMMA WORKS kernel — rules, single steps, apply, whole-graph check, generalize. Pure.
import type {
  AxiomId, Card, CheckResult, Dep, Fact, LevelManifest, MetaId, NodeId, NodeResult, Pallet, PatFact,
  ProofGraph, ProofNode, Room, RuleRef, ScopeId, SocketResult, StepOp, Subst, Term,
} from './types';
import { ROOT } from './types';
import type { KernelCtx } from './index';
import {
  E, KErr, atomsOf, instantiate, locate, locateGap, meta, metasOf, mirrorCard, mul, norm, pow, same,
  spliceRail, withRail, word,
} from './terms';
import { factText, labelsOf, termText, type Labels } from './print';

// ───────────── rule cards ─────────────

const x = meta('x');
const AXIOMS: Record<AxiomId, Card & { k: 'law' }> = {
  unitL: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [E, x] }, r: x },
  unitR: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [x, E] }, r: x },
  invL: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [{ k: 'inv', arg: x }, x] }, r: E },
  invR: { k: 'law', metas: ['x'], l: { k: 'mul', fs: [x, { k: 'inv', arg: x }] }, r: E },
};
export const AXIOM_IDS: AxiomId[] = ['unitL', 'unitR', 'invL', 'invR'];

export function axiomCard(id: AxiomId): Card & { k: 'law' } {
  const c = AXIOMS[id];
  if (!c) throw new KErr(`there is no group axiom called ${String(id)}`);
  return { k: 'law', metas: [...c.metas], l: c.l, r: c.r };
}

/** Size literals are positive whole numbers 1..24 (types.ts). */
export const validSize = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 24;

export function pressCard(n: number): Card & { k: 'law' } {
  if (!validSize(n)) throw new KErr('the order of a group must be a whole number from 1 to 24');
  return { k: 'law', metas: ['x'], l: pow(x, n), r: E };
}

const cardMetas = (c: Card): MetaId[] => {
  const out: MetaId[] = [];
  const add = (t: Term) => { for (const m of metasOf(t)) if (!out.includes(m)) out.push(m); };
  if (c.k === 'law') { add(c.l); add(c.r); } else { for (const p of c.premises) { add(p.l); add(p.r); } add(c.concl.l); add(c.concl.r); }
  return out;
};

/** Whether a registry schema may be used in the current level, with its (possibly mirrored) card. */
export function schemaCard(id: string, mirror: boolean | undefined, ctx: KernelCtx): Card {
  const sc = ctx.registry[id];
  if (!sc) throw new KErr(`there is no theorem called “${id}”`);
  if (ctx.level.unlocks.includes(id)) throw new KErr(`${sc.name} is the theorem this work order is proving; it cannot be used to prove itself`);
  if (!ctx.level.tools.schemas.includes(id)) throw new KErr(`${sc.name} (${sc.textbook}) is not available in this work order`);
  if (mirror && !sc.mirrorable) throw new KErr(`${sc.name} has no mirror image on offer`);
  return mirror ? mirrorCard(sc.card) : sc.card;
}

export interface Law { l: Term; r: Term; metas: MetaId[]; name: string }

export function ruleName(rule: RuleRef, ctx: KernelCtx): string {
  if (rule.k === 'axiom') return rule.id === 'unitL' || rule.id === 'unitR' ? 'the identity law' : 'the inverse law';
  if (rule.k === 'schema') {
    const sc = ctx.registry[rule.id];
    return sc ? `${sc.name}${rule.mirror ? ' ᵒᵖ' : ''}` : rule.id;
  }
  return 'the cited fact';
}

/** Resolve a rewrite rule to an equation l = r with metas. */
export function resolveLaw(rule: RuleRef, ctx: KernelCtx, ruleFact: Fact | undefined, L: Labels): Law {
  if (!rule || typeof rule !== 'object') throw new KErr('malformed rule');
  if (rule.k === 'axiom') {
    const c = axiomCard(rule.id);
    return { l: c.l, r: c.r, metas: ['x'], name: ruleName(rule, ctx) };
  }
  if (rule.k === 'schema') {
    const c = schemaCard(rule.id, rule.mirror, ctx);
    const sc = ctx.registry[rule.id]!;
    if (c.k !== 'law') {
      throw new KErr(`${sc.name} is a conditional theorem (${factText(c, L)}); feed it its premises first, it cannot rewrite directly`);
    }
    return { l: norm(c.l), r: norm(c.r), metas: cardMetas(c), name: ruleName(rule, ctx) };
  }
  if (rule.k === 'node') {
    if (!ruleFact) throw new KErr('the cited fact is not available');
    switch (ruleFact.k) {
      case 'eq': return { l: norm(ruleFact.l), r: norm(ruleFact.r), metas: [], name: factText(ruleFact, L) };
      case 'law': return { l: norm(ruleFact.l), r: norm(ruleFact.r), metas: cardMetas(ruleFact), name: factText(ruleFact, L) };
      case 'neq': throw new KErr(`an inequation cannot be used to rewrite: ${factText(ruleFact, L)} says nothing about replacing one side by the other`);
      case 'bot': throw new KErr('a contradiction (⊥) has no sides; it cannot be used to rewrite');
      case 'size': throw new KErr(`|G| = ${ruleFact.n} is about the size of the group, not an equation between elements`);
      case 'cond': throw new KErr(`${factText(ruleFact, L)} is conditional: apply it to its premise first; only the resulting equation can rewrite`);
    }
  }
  throw new KErr('malformed rule');
}

export interface CondCard { metas: MetaId[]; premises: PatFact[]; concl: PatFact; name: string }

/** Resolve an apply rule to a conditional card (laws become zero-premise cards emitting an eq). */
export function resolveCond(rule: RuleRef, ctx: KernelCtx, ruleFact: Fact | undefined, L: Labels): CondCard {
  let c: Card;
  let name: string;
  if (!rule || typeof rule !== 'object') throw new KErr('malformed rule');
  if (rule.k === 'axiom') { c = axiomCard(rule.id); name = ruleName(rule, ctx); }
  else if (rule.k === 'schema') { c = schemaCard(rule.id, rule.mirror, ctx); name = ruleName(rule, ctx); }
  else if (rule.k === 'node') {
    if (!ruleFact) throw new KErr('the cited fact is not available');
    if (ruleFact.k !== 'law' && ruleFact.k !== 'cond') {
      throw new KErr(`${factText(ruleFact, L)} is not a universal statement; there is nothing to apply`);
    }
    c = ruleFact;
    name = factText(ruleFact, L);
  } else throw new KErr('malformed rule');
  if (c.k === 'law') return { metas: cardMetas(c), premises: [], concl: { k: 'eq', l: norm(c.l), r: norm(c.r) }, name };
  return { metas: cardMetas(c), premises: c.premises, concl: c.concl, name };
}

// ───────────── term hygiene ─────────────

export function declaredSet(ctx: KernelCtx): Set<string> { return new Set(ctx.level.atoms.map((a) => a.id)); }

/** A concrete element of this level: no variables, declared atoms only. Returns the normalized term. */
export function checkGround(t: Term, ctx: KernelCtx, what = 'that term'): Term {
  if (!t || typeof t !== 'object') throw new KErr(`${what} is not an element`);
  const n = norm(t);
  const walk = (u: Term) => {
    switch (u.k) {
      case 'meta': throw new KErr(`${what} still contains the variable ${u.id}; choose a concrete element`);
      case 'inv': walk(u.arg); return;
      case 'mul': u.fs.forEach(walk); return;
      case 'atom': return;
      case 'e': return;
      default: throw new KErr(`${what} is not an element`);
    }
  };
  walk(n);
  const decl = declaredSet(ctx);
  for (const id of atomsOf(n)) if (!decl.has(id)) throw new KErr(`${id} is not an element of this work order`);
  return n;
}

/** σ must bind exactly the rule's metas, each to a concrete element. Returns a normalized copy. */
export function checkSubst(s: Subst, metas: MetaId[], ctx: KernelCtx): Subst {
  if (!s || typeof s !== 'object') throw new KErr('malformed substitution');
  const out: Subst = {};
  for (const k of Object.keys(s)) if (!metas.includes(k)) throw new KErr(`${k} is not a variable of this rule`);
  for (const m of metas) {
    const v = s[m];
    if (!v) throw new KErr(`the rule needs a value for ${m}`);
    out[m] = checkGround(v, ctx, `the value chosen for ${m}`);
  }
  return out;
}

// ───────────── single steps ─────────────

function mismatch(rule: RuleRef, srcInst: Term, redex: Term, s: Subst, L: Labels, name: string): string {
  const R = termText(redex, L);
  if (rule.k === 'axiom') {
    const w = word(redex);
    if (rule.id === 'invL' || rule.id === 'invR') {
      if (w.length === 2) return `${termText(w[0]!, L)} and ${termText(w[1]!, L)} are not inverses of each other`;
      if (w.length === 1 && redex.k !== 'e') return `${R} is a single factor; cancelling needs an element next to its inverse`;
      return `${R} is not an element next to its inverse`;
    }
    if (!w.some((f) => f.k === 'e')) return `there is no e in ${R} to remove`;
    return `${R} is not e next to an element`;
  }
  const at = Object.keys(s).length ? ` at ${Object.keys(s).sort().map((k) => `${k} = ${termText(s[k]!, L)}`).join(', ')}` : '';
  return `the selected part is ${R}, but ${name}${at} needs ${termText(srcInst, L)} here`;
}

export function stepCore(p: Pallet, op: StepOp, ctx: KernelCtx, ruleFact: Fact | undefined): Pallet {
  const L = labelsOf(ctx.level.atoms);
  if (!op || typeof op !== 'object') throw new KErr('malformed step');
  if (op.k === 'swap') {
    if (p.k !== 'eq' && p.k !== 'neq') throw new KErr(p.k === 'bot' ? '⊥ has no sides to swap' : 'only an equation or an inequation can be read the other way round');
    return { k: p.k, l: p.r, r: p.l };
  }
  if (p.k !== 'eq') {
    if (p.k === 'neq') throw new KErr('only an equation can be rewritten or multiplied; this is an inequation');
    if (p.k === 'bot') throw new KErr('⊥ cannot be rewritten');
    throw new KErr('only an equation between elements can be rewritten');
  }
  switch (op.k) {
    case 'insertE': {
      const g = locateGap(p, op.at);
      if (!g) throw new KErr('that gap does not exist in this equation (the address is out of date)');
      return withRail(p, g.side, spliceRail(p[g.side], g.wordPath, g.gap, g.gap, [E]));
    }
    case 'lift': {
      if (!ctx.level.tools.lift) throw new KErr('multiplying both sides is not available in this work order');
      const t = checkGround(op.term, ctx, 'the multiplier');
      if (op.side === 'left') return { k: 'eq', l: mul([t, p.l]), r: mul([t, p.r]) };
      if (op.side === 'right') return { k: 'eq', l: mul([p.l, t]), r: mul([p.r, t]) };
      throw new KErr('multiply on the left or on the right');
    }
    case 'rewrite': {
      const law = resolveLaw(op.rule, ctx, ruleFact, L);
      const s = checkSubst(op.subst, law.metas, ctx);
      if (op.dir !== 'fwd' && op.dir !== 'rev') throw new KErr('malformed direction');
      const [src, dst] = op.dir === 'fwd' ? [law.l, law.r] : [law.r, law.l];
      const loc = locate(p, op.at);
      if (!loc) throw new KErr('that part of the equation does not exist (the address is out of date)');
      const srcInst = instantiate(src, s);
      if (!same(srcInst, norm(loc.redex))) throw new KErr(mismatch(op.rule, srcInst, loc.redex, s, L, law.name));
      const dstInst = instantiate(dst, s);
      return withRail(p, loc.side, spliceRail(p[loc.side], loc.wordPath, loc.s, loc.e, word(dstInst)));
    }
    default: throw new KErr('malformed step');
  }
}

/** Apply a (resolved) card to premise facts under σ. Returns the conclusion pallet. */
export function applyCore(card: CondCard, inputs: Fact[], s0: Subst, ctx: KernelCtx): Pallet {
  const L = labelsOf(ctx.level.atoms);
  const s = checkSubst(s0, card.metas, ctx);
  if (inputs.length !== card.premises.length) {
    const n = card.premises.length;
    throw new KErr(`${card.name} takes ${n} premise${n === 1 ? '' : 's'}, but ${inputs.length} ${inputs.length === 1 ? 'was' : 'were'} supplied`);
  }
  card.premises.forEach((pr, i) => {
    const want: PatFact = { k: pr.k, l: instantiate(pr.l, s), r: instantiate(pr.r, s) };
    const got = inputs[i]!;
    const ok = (got.k === 'eq' || got.k === 'neq') && got.k === want.k && same(norm(got.l), want.l) && same(norm(got.r), want.r);
    if (!ok) {
      const which = card.premises.length > 1 ? `premise ${i + 1}` : 'the premise';
      throw new KErr(`${which} must read ${factText(want, L)}, but the supplied fact is ${factText(got, L)}`);
    }
  });
  return { k: card.concl.k, l: instantiate(card.concl.l, s), r: instantiate(card.concl.r, s) };
}

// ───────────── whole-graph check ─────────────

export function nodeUses(n: ProofNode): { inputs: NodeId[]; rule?: NodeId } {
  switch (n.k) {
    case 'step': return { inputs: [n.input], rule: n.op?.k === 'rewrite' && n.op.rule?.k === 'node' ? n.op.rule.id : undefined };
    case 'apply': return { inputs: Array.isArray(n.inputs) ? [...n.inputs] : [], rule: n.rule?.k === 'node' ? n.rule.id : undefined };
    case 'merge': case 'clash': return { inputs: Array.isArray(n.inputs) ? [...n.inputs] : [] };
    case 'exit': case 'press': return { inputs: [n.input] };
    default: return { inputs: [] };
  }
}

/** Is `inner` equal to `outer` or nested inside it? (rooms only; ROOT contains everything) */
export function scopeWithin(inner: ScopeId, outer: ScopeId, rooms: Map<ScopeId, Room>): boolean {
  let cur: ScopeId | undefined = inner;
  for (let guard = 0; cur !== undefined && guard < 1000; guard++) {
    if (cur === outer) return true;
    if (cur === ROOT) return false;
    cur = rooms.get(cur)?.parent;
  }
  return false;
}

const isPallet = (f: Fact | undefined): f is Pallet => !!f && (f.k === 'eq' || f.k === 'neq' || f.k === 'bot' || f.k === 'size');

export function check(g: ProofGraph, ctx: KernelCtx): CheckResult {
  const L = labelsOf(ctx.level.atoms);
  const nodes = Array.isArray(g?.nodes) ? g.nodes : [];
  const roomsArr = Array.isArray(g?.rooms) ? g.rooms : [];
  const results: Record<NodeId, NodeResult> = {};
  let ok = true;

  // ids
  const byId = new Map<NodeId, ProofNode>();
  const dupes = new Set<NodeId>();
  for (const n of nodes) { if (byId.has(n.id)) dupes.add(n.id); else byId.set(n.id, n); }

  // rooms
  const rooms = new Map<ScopeId, Room>();
  const roomErr = new Map<ScopeId, string>();
  for (const r of roomsArr) {
    if (rooms.has(r.id) || r.id === ROOT) { roomErr.set(r.id, 'two rooms share one name'); continue; }
    rooms.set(r.id, r);
  }
  for (const r of rooms.values()) {
    if (roomErr.has(r.id)) continue;
    // parent chain must reach ROOT without cycles
    let cur: ScopeId = r.parent;
    const seen = new Set<ScopeId>([r.id]);
    let bad: string | null = null;
    while (cur !== ROOT) {
      if (seen.has(cur)) { bad = 'rooms cannot be nested inside themselves'; break; }
      seen.add(cur);
      const p = rooms.get(cur);
      if (!p) { bad = 'this room sits inside a room that does not exist'; break; }
      cur = p.parent;
    }
    if (!bad && r.kind === 'suppose' && !ctx.level.tools.suppose) bad = 'supposing is not available in this work order';
    if (!bad && r.kind === 'classical' && !ctx.level.tools.classical) bad = 'proof by contradiction of an equation (classical) is not available in this work order';
    if (!bad && r.kind !== 'suppose' && r.kind !== 'classical') bad = 'unknown kind of room';
    if (!bad) {
      try { checkGround(r.l, ctx, 'the supposition'); checkGround(r.r, ctx, 'the supposition'); }
      catch (e) { bad = (e as Error).message; }
    }
    if (bad) roomErr.set(r.id, bad);
  }
  // a room nested in a bad room is bad
  for (const r of rooms.values()) {
    if (roomErr.has(r.id)) continue;
    let cur = r.parent;
    for (let guard = 0; cur !== ROOT && guard < 1000; guard++) {
      if (roomErr.has(cur)) { roomErr.set(r.id, 'this room sits inside a room that is not valid'); break; }
      cur = rooms.get(cur)?.parent ?? ROOT;
    }
  }

  // cycles (rejected before anything else)
  const color = new Map<NodeId, 0 | 1 | 2>();
  const inCycle = new Set<NodeId>();
  const order: NodeId[] = [];
  const visit = (id: NodeId, stack: NodeId[]) => {
    const c = color.get(id) ?? 0;
    if (c === 2) return;
    if (c === 1) { const i = stack.indexOf(id); for (const s of stack.slice(i)) inCycle.add(s); return; }
    const n = byId.get(id);
    if (!n) return;
    color.set(id, 1);
    stack.push(id);
    const u = nodeUses(n);
    for (const d of [...u.inputs, ...(u.rule ? [u.rule] : [])]) visit(d, stack);
    stack.pop();
    color.set(id, 2);
    order.push(id);
  };
  for (const n of nodes) visit(n.id, []);
  if (inCycle.size || dupes.size) ok = false;

  const fail = (id: NodeId, error: string): NodeResult => ({ id, ok: false, deps: [], classical: false, error });

  for (const id of order) {
    const n = byId.get(id)!;
    if (dupes.has(id)) { results[id] = fail(id, 'two steps share one name'); continue; }
    if (inCycle.has(id)) { results[id] = fail(id, 'circular reasoning: this step depends on itself'); continue; }
    try {
      results[id] = evalNode(n, ctx, L, results, byId, rooms, roomErr);
    } catch (e) {
      results[id] = fail(id, e instanceof KErr ? e.message : `malformed step (${(e as Error)?.message ?? 'unknown'})`);
    }
  }
  for (const id of dupes) if (!results[id]) results[id] = fail(id, 'two steps share one name');
  for (const r of Object.values(results)) if (!r.ok) ok = false;

  const sockets = ctx.level.sockets.map((sock) => socketResult(sock, nodes, results, L));
  return { ok, nodes: results, sockets, solved: sockets.length > 0 && sockets.every((s) => s.ok) };
}

function socketResult(
  sock: LevelManifest['sockets'][number], nodes: ProofNode[], results: Record<NodeId, NodeResult>, L: Labels,
): SocketResult {
  const t = sock.target;
  if (t.k !== 'eq' && t.k !== 'neq') return { id: sock.id, ok: false, error: 'malformed goal' };
  const allowed = new Set(sock.allowedGivens.map((g) => `g:${g}`));
  let nearly: string | undefined;
  for (const n of nodes) {
    if (n.scope !== ROOT) continue;
    const r = results[n.id];
    if (!r?.ok || !r.fact) continue;
    const f = r.fact;
    if (f.k !== t.k) continue;
    const exact = same(norm(f.l), norm(t.l)) && same(norm(f.r), norm(t.r));
    if (!exact) {
      if (!nearly && same(norm(f.l), norm(t.r)) && same(norm(f.r), norm(t.l))) nearly = 'the goal is proved with its sides the other way round; swap them';
      continue;
    }
    const extra = r.deps.filter((d) => !allowed.has(d));
    if (extra.length) {
      nearly = `this proof of ${factText(t, L)} still relies on ${extra.map((d) => (d.startsWith('a:') ? 'an open assumption' : `given ${d.slice(2)}`)).join(', ')}, which this goal does not allow`;
      continue;
    }
    return { id: sock.id, ok: true, filledBy: n.id };
  }
  return { id: sock.id, ok: false, error: nearly ?? `${factText(t, L)} is not proved yet` };
}

function evalNode(
  n: ProofNode, ctx: KernelCtx, L: Labels, results: Record<NodeId, NodeResult>,
  byId: Map<NodeId, ProofNode>, rooms: Map<ScopeId, Room>, roomErr: Map<ScopeId, string>,
): NodeResult {
  const id = n.id;
  const scope = n.scope;
  if (typeof scope !== 'string') throw new KErr('this step has no scope');
  if (scope !== ROOT) {
    if (!rooms.has(scope)) throw new KErr('this step sits in a room that does not exist');
    const re = roomErr.get(scope);
    if (re) throw new KErr(re);
  }
  const deps = new Set<Dep>();
  let classical = false;

  /** Fetch an upstream node's result, enforcing existence, validity and the scope law. */
  const use = (ref: NodeId, role: string): { fact: Fact; node: ProofNode } => {
    const m = byId.get(ref);
    if (!m) throw new KErr(`${role} does not exist`);
    const r = results[ref];
    if (!r || !r.ok || !r.fact) throw new KErr(`${role} is not valid, so this step cannot be trusted`);
    if (!scopeWithin(scope, m.scope, rooms)) {
      throw new KErr(`${role} was proved under an assumption that is not in force here`);
    }
    for (const d of r.deps) deps.add(d);
    if (r.classical) classical = true;
    return { fact: r.fact, node: m };
  };

  const done = (fact: Fact): NodeResult => ({ id, ok: true, fact, deps: [...deps].sort(), classical });

  switch (n.k) {
    case 'start': {
      const t = checkGround(n.term, ctx, 'the starting element');
      return done({ k: 'eq', l: t, r: t });
    }
    case 'given': {
      const gd = ctx.level.givens.find((x) => x.id === n.givenId);
      if (!gd) throw new KErr(`there is no given “${String(n.givenId)}” in this work order`);
      if (gd.fact.k === 'size' && !validSize(gd.fact.n)) throw new KErr('the order of a group must be a whole number from 1 to 24');
      deps.add(`g:${gd.id}`);
      const f = gd.fact;
      return done(f.k === 'eq' || f.k === 'neq' ? { k: f.k, l: norm(f.l), r: norm(f.r) } : f);
    }
    case 'assume': {
      const room = rooms.get(n.room);
      if (!room) throw new KErr('there is no such room to suppose in');
      if (scope !== n.room) throw new KErr('a supposition lives inside its own room');
      deps.add(`a:${room.id}`);
      const l = norm(room.l), r = norm(room.r);
      return done(room.kind === 'suppose' ? { k: 'eq', l, r } : { k: 'neq', l, r });
    }
    case 'step': {
      const inp = use(n.input, 'the equation this step continues');
      if (!isPallet(inp.fact)) throw new KErr('a universal statement cannot be rewritten; cite it as a rule instead');
      let ruleFact: Fact | undefined;
      if (n.op?.k === 'rewrite' && n.op.rule?.k === 'node') ruleFact = use(n.op.rule.id, 'the cited fact').fact;
      return done(stepCore(inp.fact, n.op, ctx, ruleFact));
    }
    case 'apply': {
      let ruleFact: Fact | undefined;
      if (n.rule?.k === 'node') ruleFact = use(n.rule.id, 'the cited statement').fact;
      const card = resolveCond(n.rule, ctx, ruleFact, L);
      const ins = (Array.isArray(n.inputs) ? n.inputs : []).map((ref, i) => {
        const f = use(ref, `premise ${i + 1}`).fact;
        if (f.k !== 'eq' && f.k !== 'neq') throw new KErr(`premise ${i + 1} must be an equation or an inequation`);
        return f;
      });
      return done(applyCore(card, ins, n.subst ?? {}, ctx));
    }
    case 'merge': {
      if (!ctx.level.tools.merge) throw new KErr('the merge machine is not available in this work order');
      if (!Array.isArray(n.inputs) || n.inputs.length !== 2) throw new KErr('merging needs exactly two equations');
      const a = use(n.inputs[0], 'the first equation').fact;
      const b = use(n.inputs[1], 'the second equation').fact;
      if (a.k !== 'eq' || b.k !== 'eq') throw new KErr('only two equations can be merged');
      if (!same(norm(a.r), norm(b.r))) {
        throw new KErr(`the right-hand sides ${termText(a.r, L)} and ${termText(b.r, L)} differ; both equations must end in the same element`);
      }
      return done({ k: 'eq', l: norm(a.l), r: norm(b.l) });
    }
    case 'clash': {
      if (!Array.isArray(n.inputs) || n.inputs.length !== 2) throw new KErr('a contradiction needs an equation and an inequation');
      const a = use(n.inputs[0], 'the equation').fact;
      const b = use(n.inputs[1], 'the inequation').fact;
      // accept either order: clash is symmetric in its two inputs
      const [q, ne] = a.k === 'eq' && b.k === 'neq' ? [a, b] : b.k === 'eq' && a.k === 'neq' ? [b, a] : [null, null];
      if (!q || !ne) throw new KErr('a contradiction needs one equation and one inequation');
      const ql = norm(q.l), qr = norm(q.r), nl = norm(ne.l), nr = norm(ne.r);
      const hit = (same(ql, nl) && same(qr, nr)) || (same(ql, nr) && same(qr, nl));
      if (!hit) throw new KErr(`${factText(q, L)} and ${factText(ne, L)} do not contradict each other`);
      return done({ k: 'bot' });
    }
    case 'exit': {
      const room = rooms.get(n.room);
      if (!room) throw new KErr('there is no such room to close');
      if (scope !== room.parent) throw new KErr('a room’s conclusion lands in the scope that contains the room');
      const m = byId.get(n.input);
      if (!m) throw new KErr('the contradiction closing this room does not exist');
      if (m.scope !== room.id) throw new KErr('the contradiction must be reached inside this room itself');
      const r = results[n.input];
      if (!r || !r.ok || !r.fact) throw new KErr('the contradiction closing this room is not valid');
      if (r.fact.k !== 'bot') throw new KErr('this would leave the room with its assumption still open: a room is closed only by a contradiction (⊥)');
      for (const d of r.deps) if (d !== `a:${room.id}`) deps.add(d);
      classical = r.classical || room.kind === 'classical';
      const l = norm(room.l), rr = norm(room.r);
      return done(room.kind === 'suppose' ? { k: 'neq', l, r: rr } : { k: 'eq', l, r: rr });
    }
    case 'press': {
      if (!ctx.level.tools.press) throw new KErr('the Lagrange press is not available in this work order');
      const inp = use(n.input, 'the group order');
      if (inp.fact.k !== 'size') throw new KErr('the Lagrange press needs the order of the group (|G| = n)');
      return done(pressCard(inp.fact.n));
    }
    default: throw new KErr('unknown kind of step');
  }
}

// ───────────── generalize ─────────────

/** The universal theorem a solved socket proves (atoms → metas, allowed eq/neq givens → premises). */
export function generalize(level: LevelManifest, socketId: string): Card | null {
  const sock = level.sockets.find((s) => s.id === socketId);
  if (!sock || (sock.target.k !== 'eq' && sock.target.k !== 'neq')) return null;
  const premises: PatFact[] = [];
  for (const gid of sock.allowedGivens) {
    const gd = level.givens.find((g) => g.id === gid);
    if (!gd) return null;
    if (gd.fact.k !== 'eq' && gd.fact.k !== 'neq') return null;
    premises.push({ k: gd.fact.k, l: norm(gd.fact.l), r: norm(gd.fact.r) });
  }
  const toMeta = (t: Term): Term => {
    switch (t.k) {
      case 'atom': return { k: 'meta', id: t.id };
      case 'inv': return { k: 'inv', arg: toMeta(t.arg) };
      case 'mul': return { k: 'mul', fs: t.fs.map(toMeta) };
      default: return t;
    }
  };
  const used = new Set<string>();
  const pf = (p: PatFact): PatFact => {
    atomsOf(p.l, used); atomsOf(p.r, used);
    return { k: p.k, l: toMeta(p.l), r: toMeta(p.r) };
  };
  const prem = premises.map(pf);
  const concl = pf({ k: sock.target.k, l: norm(sock.target.l), r: norm(sock.target.r) });
  const metas = level.atoms.map((a) => a.id).filter((id) => used.has(id));
  if (!prem.length && concl.k === 'eq') return { k: 'law', metas, l: concl.l, r: concl.r };
  return { k: 'cond', metas, premises: prem, concl };
}

/** Card equality up to a bijective renaming of metas (premise order significant). */
export function sameCardUpToRenaming(a: Card, b: Card): boolean {
  const canon = (c: Card): string => {
    const ren = new Map<string, string>();
    const go = (t: Term): string => {
      switch (t.k) {
        case 'meta': { if (!ren.has(t.id)) ren.set(t.id, `#${ren.size}`); return ren.get(t.id)!; }
        case 'atom': return `a:${t.id}`;
        case 'e': return 'e';
        case 'inv': return `i(${go(t.arg)})`;
        case 'mul': return `[${t.fs.map(go).join(',')}]`;
      }
    };
    const pf = (p: PatFact) => `${p.k}(${go(norm(p.l))},${go(norm(p.r))})`;
    if (c.k === 'law') return `law ${pf({ k: 'eq', l: c.l, r: c.r })}`;
    return `cond ${c.premises.map(pf).join(';')} => ${pf(c.concl)}`;
  };
  return canon(a) === canon(b);
}
