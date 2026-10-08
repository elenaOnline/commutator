// LEMMA WORKS board — colouring/justification adapters. The kernel is the
// authority (K.familyOf / K.justify). While its bodies are still stubs, fall
// back to the documented mapping in kernel/index.ts so the board stays usable.
// This is presentation only: it never decides legality.
import * as K from '../kernel';
import type { Family, ProofGraph, ProofNode } from '../kernel/types';

function fallbackFamily(n: ProofNode, g: ProofGraph): Family {
  switch (n.k) {
    case 'start': return 'equation';
    case 'given': return 'given';
    case 'assume': case 'exit': return 'scope';
    case 'clash': return 'contradiction';
    case 'press': return 'lemma';
    case 'merge': return 'equation';
    case 'apply': {
      if (n.rule.k === 'schema') return 'lemma';
      return 'given';
    }
    case 'step': {
      const op = n.op;
      if (op.k === 'swap') return 'equation';
      if (op.k === 'lift') return 'structure';
      if (op.k === 'insertE') {
        const st = n.meta?.station;
        const pair = st && g.nodes.some((m) => m.meta?.station === st && m.k === 'step' && m.op.k === 'rewrite' && m.op.rule.k === 'axiom' && (m.op.rule.id === 'invL' || m.op.rule.id === 'invR'));
        return pair ? 'inverse' : 'identity';
      }
      const r = op.rule;
      if (r.k === 'axiom') return r.id === 'unitL' || r.id === 'unitR' ? 'identity' : 'inverse';
      if (r.k === 'schema') return 'lemma';
      return 'given';
    }
  }
}

export function familyOf(n: ProofNode, g: ProofGraph): Family {
  try { return K.familyOf(n, g); } catch { return fallbackFamily(n, g); }
}

export function justify(n: ProofNode, g: ProofGraph, ctx: K.KernelCtx): string {
  try { return K.justify(n, g, ctx); } catch { /* kernel pending */ }
  if (n.meta?.gesture) return n.meta.gesture;
  switch (n.k) {
    case 'start': return 'reflexivity';
    case 'given': return 'given';
    case 'assume': return 'assumption';
    case 'clash': return 'contradiction';
    case 'exit': return 'discharge';
    case 'press': return 'Lagrange (imported)';
    case 'merge': return 'transitivity';
    case 'apply': return n.rule.k === 'schema' ? n.rule.id : 'given';
    case 'step': return n.op.k;
  }
}
