// LEMMA WORKS kernel — families, justifications, metrics. Pure.
import type { CheckResult, Family, NodeId, ProofGraph, ProofNode, RuleRef, StepOp } from './types';
import type { KernelCtx, Metrics } from './index';
import { beads, norm } from './terms';
import { assumptionOf, check, nodeUses, schemaInfo, withVars } from './logic';
import { atomsOf } from './terms';
import { factText, labelsOf, substText, termText, type Labels } from './print';
import { LEVEL_BY_ID, MIRROR_NAMES } from '../levels/levels';

// ───────────── families ─────────────

/** Family of a rewrite rule (node rules need the graph to tell a press law from a given). */
export function ruleFamily(rule: RuleRef, nodeKind?: ProofNode['k']): Family {
  if (rule.k === 'axiom') return rule.id === 'unitL' || rule.id === 'unitR' ? 'identity' : 'inverse';
  if (rule.k === 'schema') return 'lemma';
  return nodeKind === 'press' ? 'lemma' : 'given';
}

export function opFamily(op: StepOp, next: StepOp | undefined, kindOf: (id: NodeId) => ProofNode['k'] | undefined): Family {
  switch (op.k) {
    case 'insertE':
      return next?.k === 'rewrite' ? ruleFamily(next.rule, next.rule.k === 'node' ? kindOf(next.rule.id) : undefined) : 'identity';
    case 'rewrite': return ruleFamily(op.rule, op.rule.k === 'node' ? kindOf(op.rule.id) : undefined);
    case 'lift': return 'structure';
    case 'invert': return 'structure';
    case 'swap': return 'equation';
  }
}

export function familyOf(n: ProofNode, g: ProofGraph): Family {
  const kindOf = (id: NodeId) => g.nodes.find((m) => m.id === id)?.k;
  switch (n.k) {
    case 'start': return 'equation';
    case 'given': return 'given';
    case 'assume': case 'exit': return 'scope';
    case 'clash': return 'contradiction';
    case 'press': return 'lemma';
    case 'merge': return 'equation';
    case 'product': return 'structure';
    case 'generalize': return 'lemma';
    case 'apply': return n.rule.k === 'node' && kindOf(n.rule.id) === 'given' ? 'given' : 'lemma';
    case 'step': {
      let next: StepOp | undefined;
      if (n.op.k === 'insertE') {
        const st = n.meta?.station;
        const succ = g.nodes.find((m) => m.k === 'step' && m.input === n.id && (st === undefined || m.meta?.station === st));
        if (succ && succ.k === 'step') next = succ.op;
      }
      return opFamily(n.op, next, kindOf);
    }
  }
}

// ───────────── justifications ─────────────

const cache = new WeakMap<ProofGraph, WeakMap<KernelCtx, CheckResult>>();
export function cachedCheck(g: ProofGraph, ctx: KernelCtx): CheckResult {
  let m = cache.get(g);
  if (!m) { m = new WeakMap(); cache.set(g, m); }
  let r = m.get(ctx);
  if (!r) { r = check(g, ctx); m.set(ctx, r); }
  return r;
}

export function schemaTitle(id: string, mirror: boolean | undefined, ctx: KernelCtx): string {
  const sc = schemaInfo(id, ctx);
  if (!sc) return id;
  if (mirror) {
    const mn = MIRROR_NAMES[id];
    return mn ? `${mn.name} (${mn.textbook})` : `${sc.name} ᵒᵖ (${sc.textbook}, mirrored)`;
  }
  return `${sc.name} (${sc.textbook})`;
}

/** How a cited node is named in prose: its given name, 'the supposition', 'Lagrange', or its statement. */
export function citeName(id: NodeId, g: ProofGraph, ctx: KernelCtx, L: Labels, res?: CheckResult): string {
  const n = g.nodes.find((m) => m.id === id);
  if (!n) return 'a missing fact';
  if (n.k === 'given') return ctx.level.givens.find((x) => x.id === n.givenId)?.name ?? n.givenId;
  if (n.k === 'assume') {
    const room = g.rooms.find((r) => r.id === n.room);
    return room?.kind === 'classical' ? 'the assumption' : 'the supposition';
  }
  if (n.k === 'press') return 'Lagrange';
  const f = (res ?? cachedCheck(g, ctx)).nodes[id]?.fact;
  return f ? factText(f, L) : 'an earlier fact';
}

const at = (s: Record<string, unknown>, L: Labels) =>
  Object.keys(s).length ? ` at ${substText(s as never, L)}` : '';

export function justify(n: ProofNode, g: ProofGraph, ctx0: KernelCtx): string {
  const ctx = withVars(ctx0, g).ctx;
  const L = labelsOf(ctx.level.atoms);
  switch (n.k) {
    case 'start': return 'reflexivity';
    case 'given': return ctx.level.givens.find((x) => x.id === n.givenId)?.name ?? n.givenId;
    case 'assume': {
      const room = g.rooms.find((r) => r.id === n.room);
      if (room?.kind === 'assume') return `assume ${factText(assumptionOf(room), L)}`;
      return room?.kind === 'classical' ? 'assume the opposite (for contradiction)' : 'supposition';
    }
    case 'step': {
      const op = n.op;
      switch (op.k) {
        case 'insertE': return 'unit';
        case 'swap': return 'symmetry';
        case 'invert': return 'invert both sides';
        case 'lift': return `multiply on the ${op.side} by ${termText(op.term, L)}`;
        case 'rewrite': {
          const r = op.rule;
          if (r.k === 'axiom') return r.id === 'unitL' || r.id === 'unitR' ? 'unit' : 'inverse';
          if (r.k === 'schema') return schemaTitle(r.id, r.mirror, ctx);
          return `${citeName(r.id, g, ctx, L)}${at(op.subst, L)}`;
        }
      }
      return '';
    }
    case 'apply': {
      const r = n.rule;
      if (r.k === 'axiom') return `${r.id === 'unitL' || r.id === 'unitR' ? 'unit' : 'inverse'}${at(n.subst, L)}`;
      if (r.k === 'schema') return schemaTitle(r.id, r.mirror, ctx);
      return `${citeName(r.id, g, ctx, L)}${at(n.subst, L)}`;
    }
    case 'merge': return 'transitivity';
    case 'product': return 'multiply the two equations';
    case 'generalize': {
      const f = cachedCheck(g, ctx0).nodes[n.input]?.fact;
      const vars = new Set((g.vars ?? []).map((v) => v.id));
      const seen = new Set<string>();
      if (f && (f.k === 'eq' || f.k === 'neq' || f.k === 'law')) { atomsOf(f.l, seen); atomsOf(f.r, seen); }
      if (f && f.k === 'cond') for (const p of [...f.premises, f.concl]) { atomsOf(p.l, seen); atomsOf(p.r, seen); }
      const names = [...seen].filter((id) => vars.has(id)).map((id) => L[id] ?? id);
      return names.length ? `${names.join(', ')} ${names.length === 1 ? 'was' : 'were'} arbitrary: generalize` : 'generalize';
    }
    case 'clash': return 'contradiction';
    case 'exit': {
      const room = g.rooms.find((r) => r.id === n.room);
      if (room?.kind === 'assume') return 'discharge the assumption (implication)';
      return room?.kind === 'classical' ? 'proof by contradiction (classical)' : 'the supposition led to a contradiction';
    }
    case 'press': return 'Lagrange (imported)';
  }
}

// ───────────── metrics ─────────────

function schemaAxioms(id: string, ctx: KernelCtx): number {
  const sc = ctx.registry[id];
  if (!sc || sc.origin !== 'earned' || !sc.fromLevel) return 1;
  return LEVEL_BY_ID[sc.fromLevel]?.par.axioms ?? 1;
}

export function metrics(g: ProofGraph, res: CheckResult, ctx: KernelCtx): Metrics {
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const reach = new Set<NodeId>();
  const stack: NodeId[] = res.sockets.filter((s) => s.ok && s.filledBy).map((s) => s.filledBy!);
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id)) continue;
    const n = byId.get(id);
    if (!n) continue;
    reach.add(id);
    const u = nodeUses(n);
    stack.push(...u.inputs);
    if (u.rule) stack.push(u.rule);
  }
  const stations = new Set<string>();
  let axioms = 0;
  let peak = 0;
  for (const id of reach) {
    const n = byId.get(id)!;
    // parts
    if (n.k === 'step' || n.k === 'apply' || n.k === 'merge' || n.k === 'clash' || n.k === 'press' || n.k === 'product' || n.k === 'generalize') {
      if (n.meta?.gesture !== 'auto-swap') stations.add(`s:${n.meta?.station ?? `n:${n.id}`}`);
    }
    // axioms
    switch (n.k) {
      case 'start': case 'given': case 'assume': break;
      case 'step':
        axioms += n.op.k === 'rewrite' && n.op.rule.k === 'schema' ? schemaAxioms(n.op.rule.id, ctx) : 1;
        break;
      case 'apply':
        axioms += n.rule.k === 'schema' ? schemaAxioms(n.rule.id, ctx) : 1;
        break;
      default: axioms += 1;
    }
    // peak
    const f = res.nodes[id]?.fact;
    if (f && (f.k === 'eq' || f.k === 'neq')) peak = Math.max(peak, beads(norm(f.l)), beads(norm(f.r)));
  }
  return { parts: stations.size, axioms, peak };
}

export type { Labels };
