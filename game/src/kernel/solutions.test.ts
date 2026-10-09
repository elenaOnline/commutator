// Intended campaign solutions, built two ways:
//  1. by a headless Player that may ONLY commit offers from offersAt (so the UI can do it), and
//  2. as raw hand-written ProofGraphs, each of whose stations is shown to be reachable as an offer.
import { describe, expect, it } from 'vitest';
import * as K from './index';
import type { NodeId, Offer, ProofGraph, ProofNode, StepOp, Subst, Term } from './types';
import { ROOT } from './types';
import { DOUBLE_FLIP, Player, ctxOf, gap, span, withAuthored } from './testkit';
import { LEVELS } from '../levels/levels';

const a = K.atom('a'), b = K.atom('b');
const I = K.inv, M = (...fs: Term[]) => K.mul(fs), e = K.E;

function solved(p: Player) {
  const bad = Object.values(p.res.nodes).filter((n) => !n.ok);
  expect(bad).toEqual([]);
  expect(p.res.solved).toBe(true);
  return K.metrics(p.graph, p.res, p.ctx);
}

// ───────────── offer-driven solutions (every level) ─────────────

describe('campaign via offers only', () => {
  it('L01 First Light: cancel with auto-tidy', () => {
    const p = new Player(ctxOf('L01'));
    p.play('pre0', span('r', 0, 2), 'cancel a⁻¹a');
    expect(solved(p)).toEqual({ parts: 1, axioms: 2, peak: 3 });
  });

  it('L02 Another Identity: insert e, cite H at x = e', () => {
    const p = new Player(ctxOf('L02'));
    let n = p.start("e'");
    n = p.play(n, gap('r', 1), 'insert e');
    expect(p.text(n)).toBe('e′ = e′e');
    n = p.play(n, span('r', 0, 2), 'e′e → e (by H at x = e)');
    expect(p.text(n)).toBe('e′ = e');
    expect(solved(p)).toMatchObject({ parts: 2, axioms: 2 });
  });

  it('L03 Inverse Is Unique: insert a chosen pair, use h', () => {
    const p = new Player(ctxOf('L03'));
    let n = p.start('b');
    n = p.play(n, gap('r', 0), 'insert x⁻¹x', { x: 'a' });
    expect(p.text(n)).toBe('b = a⁻¹ab');
    n = p.play(n, span('r', 1, 3), 'ab → e (by h)');
    expect(p.text(n)).toBe('b = a⁻¹');
    expect(solved(p)).toMatchObject({ parts: 2, axioms: 4 });
  });

  it('L04 Conjugate Pair (∀ goal): towers + assume room + shifted frame + ∀', () => {
    const p = new Player(ctxOf('L04'));
    p.declareVar('x₁'); p.declareVar('y₁');
    const { room } = p.openRoom('assume', '(x₁ y₁)^5', 'e', ROOT, 'eq');
    let n = p.start('(y₁ x₁)^5', room);
    n = p.play(n, gap('r', 0), 'insert x⁻¹x', { x: 'x₁' });
    n = p.play(n, span('r', 1, 11), /→ e \(by the supposition\)/);
    n = p.play(n, span('r', 0, 2), 'cancel x₁⁻¹x₁');
    p.generalize(p.exit(room, n));
    expect(solved(p)).toMatchObject({ parts: 4, axioms: 7 });
  });

  it('L05 Cancellation: lift then cancel both sides', () => {
    const p = new Player(ctxOf('L05'));
    let n = p.play('g:h', null, 'multiply both sides on the left by t', { t: 'a^-1' });
    expect(p.text(n)).toBe('a⁻¹ab = a⁻¹ac');
    n = p.play(n, span('l', 0, 2), 'cancel a⁻¹a');
    n = p.play(n, span('r', 0, 2), 'cancel a⁻¹a');
    expect(p.text(n)).toBe('b = c');
    expect(solved(p)).toMatchObject({ parts: 3, axioms: 5 });
  });

  it('L06 Shoes and Socks — bench route', () => {
    const p = new Player(ctxOf('L06'));
    let n = p.start('(ab)^-1');
    n = p.play(n, gap('r', 1), 'insert xx⁻¹', { x: 'a' });
    n = p.play(n, gap('r', 2), 'insert xx⁻¹', { x: 'b' });
    expect(p.text(n)).toBe('(ab)⁻¹ = (ab)⁻¹abb⁻¹a⁻¹');
    n = p.play(n, span('r', 0, 3), 'cancel (ab)⁻¹ab');
    expect(p.text(n)).toBe('(ab)⁻¹ = b⁻¹a⁻¹');
    expect(solved(p)).toMatchObject({ parts: 3, axioms: 6 });
  });

  it('L06 Shoes and Socks — unique right inverse route (with recorded auto-swap)', () => {
    const p = new Player(ctxOf('L06'));
    let n = p.start('a b b^-1 a^-1');
    n = p.play(n, span('r', 1, 3), 'cancel bb⁻¹');
    expect(p.text(n)).toBe('abb⁻¹a⁻¹ = aa⁻¹');
    n = p.play(n, span('r', 0, 2), 'cancel aa⁻¹');
    n = p.play(n, null, 'unique right inverse: b⁻¹a⁻¹ = (ab)⁻¹');
    expect(p.text(n)).toBe('(ab)⁻¹ = b⁻¹a⁻¹');
    expect(solved(p)).toMatchObject({ parts: 3, axioms: 8 });
  });

  it('L07 Squares Distribute: both left cancellations', () => {
    const p = new Player(ctxOf('L07'));
    let n = p.play('g:h', null, 'left cancellation: bab = abb');
    n = p.play(n, null, 'right cancellation: ba = ab');
    expect(p.text(n)).toBe('ab = ba');
    expect(solved(p)).toMatchObject({ parts: 2, axioms: 11 });
  });

  it('L08 Every Square Is e: instantiate H at ba', () => {
    const p = new Player(ctxOf('L08'));
    let n = p.start('ab');
    n = p.play(n, gap('r', 2), 'insert xx (by H)', { x: 'ba' });
    expect(p.text(n)).toBe('ab = abbaba');
    n = p.play(n, span('r', 1, 3), 'bb → e (by H at x = b)');
    n = p.play(n, span('r', 0, 2), 'aa → e (by H at x = a)');
    expect(p.text(n)).toBe('ab = ba');
    expect(solved(p)).toMatchObject({ parts: 3, axioms: 6 });
  });

  it('L09 No Fixed Points — right cancellation route', () => {
    const p = new Player(ctxOf('L09'));
    const { assume } = p.openRoom('suppose', 'ab', 'b');
    let n = p.play(assume, gap('r', 0), 'insert e');
    n = p.play(n, null, 'right cancellation: a = e');
    n = p.play(n, null, 'contradiction with n: a ≠ e');
    expect(p.text(n)).toBe('ab ≠ b');
    expect(p.res.nodes[n]!.deps).toEqual(['g:n']);
    expect(solved(p)).toMatchObject({ parts: 3, axioms: 8 });
  });

  it('L09 No Fixed Points — lift route', () => {
    const p = new Player(ctxOf('L09'));
    const { assume } = p.openRoom('suppose', 'ab', 'b');
    let n = p.play(assume, null, 'multiply both sides on the right by t', { t: 'b^-1' });
    n = p.play(n, span('l', 1, 3), 'cancel bb⁻¹');
    expect(p.text(n)).toBe('a = bb⁻¹');
    n = p.play(n, span('r', 0, 2), 'cancel bb⁻¹');
    n = p.play(n, null, /contradiction with n/);
    expect(solved(p)).toMatchObject({ parts: 4 });
  });

  it('L10 The Only Idler: classical room, the assumption feeds H', () => {
    const p = new Player(ctxOf('L10'));
    const { assume } = p.openRoom('classical', 'a', 'e');
    let n = p.play(assume, null, 'use H at x = a: aa = a');
    n = p.play(n, gap('r', 1), 'insert e');
    n = p.play(n, null, 'left cancellation: a = e');
    n = p.play(n, null, 'contradiction with a ≠ e');
    expect(p.text(n)).toBe('a = e');
    expect(p.res.nodes[n]!.classical).toBe(true);
    expect(solved(p)).toMatchObject({ parts: 4, axioms: 9 });
  });

  it('L11 Clockwork: the Lagrange press', () => {
    const p = new Player(ctxOf('L11'));
    p.press('g:s');
    let n = p.start('a');
    n = p.play(n, gap('r', 1), 'insert x⁵ (Lagrange)', { x: 'a' });
    expect(p.text(n)).toBe('a = a⁶');
    n = p.play(n, span('r', 0, 3), 'a³ → e (by h)');
    n = p.play(n, span('r', 0, 3), 'a³ → e (by h)');
    expect(p.text(n)).toBe('a = e');
    expect(solved(p)).toMatchObject({ parts: 4, axioms: 6 });
  });

  it('L12 Prime Time: room + press at ab + unique right inverse + a second belt', () => {
    const p = new Player(ctxOf('L12'));
    p.press('g:s');
    const { room, assume } = p.openRoom('suppose', '(ab)^3', 'e');
    let n = p.start('ab', room);
    n = p.play(n, gap('r', 2), 'insert (ab)³ (by the supposition)');
    n = p.play(n, gap('r', 8), 'insert (ab)³ (by the supposition)');
    expect(p.text(n)).toBe('ab = (ab)⁷');
    n = p.play(n, span('r', 0, 14), '(ab)⁷ → e (Lagrange at x = ab)');
    n = p.play(n, null, 'unique right inverse: b = a⁻¹');
    let m = p.start('ba', room);
    m = p.play(m, span('r', 0, 1), 'b → a⁻¹ (by b = a⁻¹)');
    m = p.play(m, span('r', 0, 2), 'cancel a⁻¹a');
    m = p.play(m, null, 'contradiction with n: ba ≠ e');
    expect(p.text(m)).toBe('(ab)³ ≠ e');
    expect(p.res.nodes[m]!.deps).toEqual(['g:n', 'g:s']);
    void assume;
    expect(solved(p)).toMatchObject({ parts: 8, axioms: 14 });
  });

  it('S01 Undo the Undo (∀ goal): unique right inverse on a compound part, then ∀', () => {
    const p = new Player(ctxOf('S01'));
    p.declareVar('x₁');
    let n = p.start('x₁^-1 x₁');
    n = p.play(n, span('r', 0, 2), 'cancel x₁⁻¹x₁');
    n = p.play(n, null, 'unique right inverse: x₁ = (x₁⁻¹)⁻¹');
    n = p.play(n, null, 'swap sides');
    const g = p.generalize(n);
    expect(p.text(g)).toBe('∀x. (x⁻¹)⁻¹ = x');
    expect(solved(p)).toMatchObject({ parts: 4 });
  });

  it('T01 Matched Pair (∀ goal): assume, invert, Double Flip, ∀', () => {
    const p = new Player(withAuthored(ctxOf('T01'), DOUBLE_FLIP));
    p.declareVar('x₁'); p.declareVar('y₁');
    const { room, assume } = p.openRoom('assume', 'x₁^-1', 'y₁', ROOT, 'eq');
    let n = p.play(assume, null, 'invert both sides');
    n = p.play(n, span('l', 0, 1), /Double Flip/);
    expect(p.text(n)).toBe('x₁ = y₁⁻¹');
    const g = p.generalize(p.exit(room, n));
    expect(p.text(g)).toBe('∀x, y. x⁻¹ = y ⇒ x = y⁻¹');
    expect(solved(p)).toBeTruthy();
  });

  it('T02 Returning a Return (∀ goal): inverse of a product backwards inside the crate, saved Double Flip, ∀', () => {
    const p = new Player(withAuthored(ctxOf('T02'), DOUBLE_FLIP));
    p.declareVar('x₁'); p.declareVar('y₁');
    let n = p.start('(y₁^-1 x₁^-1)^-1');
    n = p.play(n, { side: 'r', path: [0], range: [0, 2] }, /→ \(x₁y₁\)⁻¹ \(inverse of a product/);
    expect(p.text(n)).toBe('(y₁⁻¹x₁⁻¹)⁻¹ = ((x₁y₁)⁻¹)⁻¹');
    n = p.play(n, span('r', 0, 1), /→ x₁y₁ \(Double Flip/);
    const g = p.generalize(n);
    expect(p.text(g)).toBe('∀y, x. (y⁻¹x⁻¹)⁻¹ = xy');
    expect(solved(p)).toMatchObject({ parts: 3 });
  });

  it('S02 Disguised Clock', () => {
    const p = new Player(ctxOf('S02'));
    let n = p.start('(b a b^-1)^3');
    n = p.play(n, span('r', 2, 4), 'cancel b⁻¹b');
    n = p.play(n, span('r', 3, 5), 'cancel b⁻¹b');
    expect(p.text(n)).toBe('(bab⁻¹)³ = ba³b⁻¹');
    n = p.play(n, span('r', 1, 4), 'a³ → e (by h)');
    n = p.play(n, span('r', 0, 2), 'cancel bb⁻¹');
    expect(solved(p)).toMatchObject({ parts: 4, axioms: 7 });
  });
});

// ───────────── raw graphs + station reachability ─────────────

const st = (s: string) => ({ station: s });
const step = (id: string, input: string, op: StepOp, station: string, scope = ROOT): ProofNode =>
  ({ id, scope, k: 'step', input, op, meta: st(station) });
const rw = (rule: K.RuleRef, dir: 'fwd' | 'rev', side: 'l' | 'r', s: number, e2: number, subst: Subst = {}): StepOp =>
  ({ k: 'rewrite', rule, dir, at: { side, path: [], range: [s, e2] }, subst });
const ax = (id: K.AxiomId): K.RuleRef => ({ k: 'axiom', id });
const ins = (side: 'l' | 'r', g: number): StepOp => ({ k: 'insertE', at: { side, path: [], gap: g } });

const RAW: Record<string, { level: string; graph: ProofGraph }> = {
  L03: {
    level: 'L03',
    graph: {
      rooms: [],
      nodes: [
        { id: 'g:h', scope: ROOT, k: 'given', givenId: 'h' },
        { id: 's', scope: ROOT, k: 'start', term: b },
        step('1', 's', ins('r', 0), 'A'),
        step('2', '1', rw(ax('invL'), 'rev', 'r', 0, 1, { x: a }), 'A'),
        step('3', '2', rw({ k: 'node', id: 'g:h' }, 'fwd', 'r', 1, 3), 'B'),
        step('4', '3', rw(ax('unitR'), 'fwd', 'r', 0, 2, { x: I(a) }), 'B'),
      ],
    },
  },
  L06bench: {
    level: 'L06',
    graph: {
      rooms: [],
      nodes: [
        { id: 's', scope: ROOT, k: 'start', term: I(M(a, b)) },
        step('1', 's', ins('r', 1), 'A'),
        step('2', '1', rw(ax('invR'), 'rev', 'r', 1, 2, { x: a }), 'A'),
        step('3', '2', ins('r', 2), 'B'),
        step('4', '3', rw(ax('invR'), 'rev', 'r', 2, 3, { x: b }), 'B'),
        step('5', '4', rw(ax('invL'), 'fwd', 'r', 0, 3, { x: M(a, b) }), 'C'),
        step('6', '5', rw(ax('unitL'), 'fwd', 'r', 0, 2, { x: I(b) }), 'C'),
      ],
    },
  },
  L06witness: {
    level: 'L06',
    graph: {
      rooms: [],
      nodes: [
        { id: 's', scope: ROOT, k: 'start', term: M(a, b, I(b), I(a)) },
        step('1', 's', rw(ax('invR'), 'fwd', 'r', 1, 3, { x: b }), 'A'),
        step('2', '1', rw(ax('unitL'), 'fwd', 'r', 1, 3, { x: I(a) }), 'A'),
        step('3', '2', rw(ax('invR'), 'fwd', 'r', 0, 2, { x: a }), 'B'),
        { id: '4', scope: ROOT, k: 'apply', rule: { k: 'schema', id: 'witness' }, inputs: ['3'], subst: { u: M(a, b), v: M(I(b), I(a)) }, meta: st('C') },
        { id: '5', scope: ROOT, k: 'step', input: '4', op: { k: 'swap' }, meta: { station: 'D', gesture: 'auto-swap' } },
      ],
    },
  },
  L09: {
    level: 'L09',
    graph: {
      rooms: [{ id: 'R', parent: ROOT, kind: 'suppose', l: M(a, b), r: b }],
      nodes: [
        { id: 'g:n', scope: ROOT, k: 'given', givenId: 'n' },
        { id: 'h', scope: 'R', k: 'assume', room: 'R' },
        step('1', 'h', ins('r', 0), 'A', 'R'),
        { id: '2', scope: 'R', k: 'apply', rule: { k: 'schema', id: 'cancel', mirror: true }, inputs: ['1'], subst: { u: b, v: a, w: e }, meta: st('B') },
        { id: '3', scope: 'R', k: 'clash', inputs: ['2', 'g:n'], meta: st('C') },
        { id: '4', scope: ROOT, k: 'exit', room: 'R', input: '3', meta: st('C') },
      ],
    },
  },
  L10: {
    level: 'L10',
    graph: {
      rooms: [{ id: 'R', parent: ROOT, kind: 'classical', l: a, r: e }],
      nodes: [
        { id: 'g:H', scope: ROOT, k: 'given', givenId: 'H' },
        { id: 'n', scope: 'R', k: 'assume', room: 'R' },
        { id: '1', scope: 'R', k: 'apply', rule: { k: 'node', id: 'g:H' }, inputs: ['n'], subst: { x: a }, meta: st('A') },
        step('2', '1', ins('r', 1), 'B', 'R'),
        { id: '3', scope: 'R', k: 'apply', rule: { k: 'schema', id: 'cancel' }, inputs: ['2'], subst: { u: a, v: a, w: e }, meta: st('C') },
        { id: '4', scope: 'R', k: 'clash', inputs: ['3', 'n'], meta: st('D') },
        { id: '5', scope: ROOT, k: 'exit', room: 'R', input: '4', meta: st('D') },
      ],
    },
  },
  L12: {
    level: 'L12',
    graph: {
      rooms: [{ id: 'R', parent: ROOT, kind: 'suppose', l: K.pow(M(a, b), 3), r: e }],
      nodes: [
        { id: 'g:s', scope: ROOT, k: 'given', givenId: 's' },
        { id: 'g:n', scope: ROOT, k: 'given', givenId: 'n' },
        { id: 'P', scope: ROOT, k: 'press', input: 'g:s', meta: st('P') },
        { id: 'h', scope: 'R', k: 'assume', room: 'R' },
        { id: 's1', scope: 'R', k: 'start', term: M(a, b) },
        step('1', 's1', ins('r', 2), 'A', 'R'),
        step('2', '1', rw({ k: 'node', id: 'h' }, 'rev', 'r', 2, 3), 'A', 'R'),
        step('3', '2', ins('r', 8), 'B', 'R'),
        step('4', '3', rw({ k: 'node', id: 'h' }, 'rev', 'r', 8, 9), 'B', 'R'),
        step('5', '4', rw({ k: 'node', id: 'P' }, 'fwd', 'r', 0, 14, { x: M(a, b) }), 'C', 'R'),
        { id: '6', scope: 'R', k: 'apply', rule: { k: 'schema', id: 'witness' }, inputs: ['5'], subst: { u: a, v: b }, meta: st('D') },
        { id: 's2', scope: 'R', k: 'start', term: M(b, a) },
        step('7', 's2', rw({ k: 'node', id: '6' }, 'fwd', 'r', 0, 1), 'E', 'R'),
        step('8', '7', rw(ax('invL'), 'fwd', 'r', 0, 2, { x: a }), 'F', 'R'),
        { id: '9', scope: 'R', k: 'clash', inputs: ['8', 'g:n'], meta: st('G') },
        { id: '10', scope: ROOT, k: 'exit', room: 'R', input: '9', meta: st('G') },
      ],
    },
  },
};

/** Normalize an op/kind for comparison (terms normalized, keys sorted). */
const canon = (x: unknown): string => JSON.stringify(x, (_k, v) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('k' in v && ['atom', 'e', 'inv', 'mul', 'meta'].includes((v as { k: string }).k)) return K.norm(v as Term);
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]));
  }
  return v;
});

/** For every station of a raw graph, find an offer at its input that reproduces it exactly. */
function assertStationsReachable(graph: ProofGraph, ctx: K.KernelCtx) {
  const nodes = graph.nodes;
  const done = new Set<NodeId>();
  let i = 0;
  let checked = 0;
  while (i < nodes.length) {
    const n = nodes[i]!;
    const station = n.meta?.station;
    // group consecutive nodes of one station
    let j = i + 1;
    if (station) while (j < nodes.length && nodes[j]!.meta?.station === station) j++;
    const group = nodes.slice(i, j);
    const prefix: ProofGraph = { rooms: graph.rooms, nodes: nodes.slice(0, i) };
    const isSource = n.k === 'given' || n.k === 'start' || n.k === 'assume' || n.k === 'press' || n.meta?.gesture === 'auto-swap';
    if (!isSource) {
      const res = K.check(prefix, ctx);
      let active: NodeId; let sel: K.Addr | K.GapAddr | null = null; let want: unknown;
      if (n.k === 'step') {
        active = n.input;
        const ops = group.filter((g): g is ProofNode & { k: 'step' } => g.k === 'step').map((g) => g.op);
        const op0 = ops[0]!;
        sel = op0.k === 'rewrite' ? op0.at : op0.k === 'insertE' ? op0.at : null;
        want = { k: 'steps', ops };
      } else if (n.k === 'apply') {
        active = n.inputs[0]!;
        want = { k: 'apply', rule: n.rule, inputs: n.inputs, subst: n.subst };
      } else if (n.k === 'clash') {
        active = n.inputs[0]!;
        want = { k: 'clash', neq: n.inputs[1] };
      } else throw new Error(`unexpected station head ${n.k}`);
      const offers = K.offersAt(prefix, res, active, sel, ctx);
      const hit = offers.find((o: Offer) => {
        let ready = o;
        if (o.needs.length) {
          // supply the values the raw station used
          const vals: Subst = {};
          const w = want as { k: string; ops?: StepOp[]; subst?: Subst };
          for (const m of o.needs) {
            const fromOps = w.ops?.map((op) => (op.k === 'rewrite' ? op.subst[m] : op.k === 'lift' && m === 't' ? op.term : undefined)).find(Boolean);
            const v = fromOps ?? w.subst?.[m];
            if (v) vals[m] = v;
          }
          const f = K.fillOffer(o, vals, prefix, res, active, ctx);
          if (!f.ok) return false;
          ready = f.offer;
        }
        return canon(ready.kind) === canon(want);
      });
      expect(hit, `station ${station ?? n.id} (${n.k}) should be offered; offers: ${offers.map((o) => o.label).join(' | ')}`).toBeTruthy();
      checked++;
    }
    for (const g of group) done.add(g.id);
    i = j;
  }
  return checked;
}

describe('raw intended solutions', () => {
  for (const [name, { level, graph }] of Object.entries(RAW)) {
    it(`${name} checks as solved, and every station is reachable from offersAt`, () => {
      const ctx = ctxOf(level);
      const res = K.check(graph, ctx);
      expect(Object.values(res.nodes).filter((n) => !n.ok)).toEqual([]);
      expect(res.ok).toBe(true);
      expect(res.solved).toBe(true);
      expect(assertStationsReachable(graph, ctx)).toBeGreaterThan(0);
    });
  }
  it('L12 raw metrics match the offer-driven build', () => {
    const ctx = ctxOf('L12');
    const res = K.check(RAW.L12!.graph, ctx);
    expect(K.metrics(RAW.L12!.graph, res, ctx)).toMatchObject({ parts: 8, axioms: 14, peak: 14 });
  });
});

describe('registry contracts equal the generalized levels', () => {
  for (const level of LEVELS) {
    for (const id of level.unlocks) {
      it(`${level.id} → ${id}`, () => {
        const gen = K.generalize(level, level.sockets[0]!.id);
        expect(gen).not.toBeNull();
        const card = (REGISTRY as Record<string, K.Schema>)[id]!.card;
        const ok = K.sameCardUpToRenaming(card, gen!) || K.sameCardUpToRenaming(K.mirrorCard(card), gen!);
        expect(ok).toBe(true);
      });
    }
  }
});

import { REGISTRY } from '../levels/levels';
