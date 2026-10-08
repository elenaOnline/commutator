// LEMMA WORKS — derived structure shared by board, bench and transcript.
// Architect-owned. Pure.
import type { NodeId, ProofGraph, ProofNode, ScopeId } from '../kernel/types';

/** A belt: a non-step head node followed by its chain of step nodes. */
export interface Belt {
  id: string;             // = head node id
  scope: ScopeId;
  head: ProofNode;        // start | given | assume | apply | merge | clash | exit | press
  steps: ProofNode[];     // step nodes in order
  end: NodeId;            // last node of the belt (head if no steps)
}

/** Consecutive step nodes sharing meta.station form one station (one gesture). */
export interface Station { id: string; nodes: ProofNode[] }

export function beltsOf(g: ProofGraph): Belt[] {
  const nextStep = new Map<NodeId, ProofNode>();
  for (const n of g.nodes) if (n.k === 'step' && !nextStep.has(n.input)) nextStep.set(n.input, n);
  const belts: Belt[] = [];
  for (const head of g.nodes) {
    if (head.k === 'step') continue;
    const steps: ProofNode[] = [];
    let cur: ProofNode | undefined = nextStep.get(head.id);
    while (cur) { steps.push(cur); cur = nextStep.get(cur.id); }
    belts.push({ id: head.id, scope: head.scope, head, steps, end: steps.length ? steps[steps.length - 1]!.id : head.id });
  }
  return belts;
}

export function stationsOf(b: Belt): Station[] {
  const out: Station[] = [];
  for (const n of b.steps) {
    const key = n.meta?.station ?? n.id;
    const last = out[out.length - 1];
    if (last && last.id === key) last.nodes.push(n);
    else out.push({ id: key, nodes: [n] });
  }
  return out;
}

/** Which belt a node lives on. */
export function beltOfNode(belts: Belt[], id: NodeId): Belt | undefined {
  return belts.find((b) => b.head.id === id || b.steps.some((s) => s.id === id));
}

/** Node ids a node cites or consumes (inputs + rule nodes) — the ribbons and ingredient wires. */
export function usesOf(n: ProofNode): { inputs: NodeId[]; cites: NodeId[] } {
  switch (n.k) {
    case 'step': return { inputs: [n.input], cites: n.op.k === 'rewrite' && n.op.rule.k === 'node' ? [n.op.rule.id] : [] };
    case 'apply': return { inputs: [...n.inputs], cites: n.rule.k === 'node' ? [n.rule.id] : [] };
    case 'merge': case 'clash': return { inputs: [...n.inputs], cites: [] };
    case 'exit': case 'press': return { inputs: [n.input], cites: [] };
    default: return { inputs: [], cites: [] };
  }
}
