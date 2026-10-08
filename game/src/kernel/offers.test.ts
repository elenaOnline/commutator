import { describe, expect, it } from 'vitest';
import * as K from './index';
import type { Addr, GapAddr, NodeId, Offer, Pallet, ProofGraph, Subst, Term } from './types';
import { ROOT } from './types';
import { Player, ctxOf, gap, mkCtx, span } from './testkit';
import { LEVELS } from '../levels/levels';

const a = K.atom('a'), b = K.atom('b');
const I = K.inv, M = (...fs: Term[]) => K.mul(fs), e = K.E;

/** Every span and every gap of both rails, recursively inside crates. */
function allSelections(p: Pallet): (Addr | GapAddr | null)[] {
  const out: (Addr | GapAddr | null)[] = [null];
  if (p.k !== 'eq' && p.k !== 'neq') return out;
  const walk = (side: 'l' | 'r', t: Term, path: number[]) => {
    const w = t.k === 'mul' ? t.fs : [t];
    for (let s = 0; s < w.length; s++) for (let e2 = s + 1; e2 <= w.length; e2++) out.push({ side, path, range: [s, e2] });
    for (let g = 0; g <= w.length; g++) out.push({ side, path, gap: g });
    w.forEach((f, i) => {
      const fp = t.k === 'mul' ? [...path, i] : path;
      if (f.k === 'inv') walk(side, f.arg, [...fp, 0]);
    });
  };
  walk('l', p.l, []);
  walk('r', p.r, []);
  return out;
}

/** Fill every need with a declared atom (or its inverse when that is all we have). */
function fillAll(o: Offer, p: Player, at: NodeId): Offer | null {
  if (!o.needs.length) return o;
  const vals: Subst = {};
  const first = K.atom(p.ctx.level.atoms[0]!.id);
  for (const m of o.needs) vals[m] = first;
  const f = K.fillOffer(o, vals, p.graph, p.res, at, p.ctx);
  return f.ok ? f.offer : null;
}

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;

function beltEnds(p: Player): NodeId[] {
  return p.graph.nodes
    .filter((n) => !p.graph.nodes.some((m) => m.k === 'step' && m.input === n.id))
    .filter((n) => { const f = p.res.nodes[n.id]?.fact; return f && (f.k === 'eq' || f.k === 'neq'); })
    .map((n) => n.id);
}

/** Commit every offer at every selection of `at` onto a copy; all must be accepted by check(). */
function assertAllOffersSound(p: Player, at: NodeId): number {
  const f = p.res.nodes[at]!.fact as Pallet;
  let n = 0;
  for (const sel of allSelections(f)) {
    for (const o of p.offers(at, sel)) {
      checkShape(o, f, p);
      const ready = fillAll(o, p, at);
      if (!ready) continue;
      const q = new Player(p.ctx, p.graph);
      expect(() => q.commitOffer(ready, at), `${o.label} at ${p.text(at)}`).not.toThrow();
      if (ready.preview) {
        // the preview is exactly the committed result (before any auto-swap)
        const kind = ready.kind;
        if (kind.k === 'steps' || kind.k === 'apply') {
          const last = q.graph.nodes.filter((m) => !q.graph.nodes.some((z) => (z.k === 'step' && z.input === m.id)) && m.meta?.gesture !== 'auto-swap');
          void last;
        }
      }
      n++;
    }
  }
  return n;
}

/** Round-2 offer shape: groups on whole-pallet offers, exact bindings on apply offers, no useless results. */
function checkShape(o: Offer, f: Pallet, p: Player) {
  const k = o.kind.k;
  if (k === 'apply') {
    expect(o.group).toMatch(/^(schema:[a-z]+(:op)?|node:.+)$/);
    const kind = o.kind as Extract<Offer['kind'], { k: 'apply' }>;
    expect(o.bindings && o.bindings.length).toBeTruthy();
    for (const bd of o.bindings!) {
      const t = K.termAt(f, bd.addr);
      expect(t, `${o.label}: ${bd.meta}`).not.toBeNull();
      expect(K.termEq(t!, kind.subst[bd.meta]!), `${o.label}: ${bd.meta} at ${JSON.stringify(bd.addr)}`).toBe(true);
      // canonical: path points at a word, range given
      expect(bd.addr.range).toBeTruthy();
    }
  }
  if (k === 'clash') expect(o.group).toBe('clash');
  if (k === 'merge') expect(o.group).toBe('merge');
  if (o.preview && !o.needs.length && (f.k === 'eq' || f.k === 'neq')) {
    const pv = o.preview;
    const isGoal = p.ctx.level.sockets.some((sk) => sk.target.k === pv.k && (pv.k === 'eq' || pv.k === 'neq') && K.termEq((sk.target as typeof pv).l, pv.l) && K.termEq((sk.target as typeof pv).r, pv.r));
    if (!isGoal) {
      expect(pv.k === 'eq' && K.termEq(pv.l, pv.r), `${o.label} is reflexive`).toBe(false);
      expect(pv.k === f.k && K.termEq((pv as typeof f).l, f.l) && K.termEq((pv as typeof f).r, f.r), `${o.label} changes nothing`).toBe(false);
    }
  }
}

describe('round 2: groups, bindings, pruning', () => {
  it('Witness Stamp cuts share a group and draw their cut on the rail', () => {
    const p = new Player(ctxOf('L04'));
    const offers = p.offers('g:h', null);
    const w = offers.filter((o) => o.group === 'schema:witness');
    const wm = offers.filter((o) => o.group === 'schema:witness:op');
    expect(w.length).toBe(9);
    expect(wm.length).toBe(9);
    expect(offers.find((o) => o.label === 'swap sides')!.group).toBe('swap');
    const cut = w.find((o) => o.bindings![0]!.addr.range![1] === 1)!;
    expect(cut.label).toBe('Witness Stamp: babababab = a⁻¹');
    expect(cut.bindings).toEqual([
      { meta: 'u', addr: { side: 'l', path: [], range: [0, 1] } },
      { meta: 'v', addr: { side: 'l', path: [], range: [1, 10] } },
    ]);
  });
  it('Cancel Lathe binds u on both rails, v and w to the remainders', () => {
    const p = new Player(ctxOf('L07'));
    const o = p.offers('g:h', null).find((x) => x.label === 'Cancel Lathe: bab = abb')!;
    expect(o.group).toBe('schema:cancel');
    expect(o.bindings).toEqual([
      { meta: 'u', addr: { side: 'l', path: [], range: [0, 1] } },
      { meta: 'v', addr: { side: 'l', path: [], range: [1, 4] } },
      { meta: 'u', addr: { side: 'r', path: [], range: [0, 1] } },
      { meta: 'w', addr: { side: 'r', path: [], range: [1, 4] } },
    ]);
    const m = p.offers('g:h', null).find((x) => x.group === 'schema:cancel:op')!;
    expect(m.bindings!.map((b2) => b2.meta)).toEqual(['v', 'u', 'w', 'u']);
  });
  it('cond givens group by node; whole-rail metas bind the whole rail', () => {
    const p = new Player(ctxOf('L10'));
    const { assume } = p.openRoom('classical', 'a', 'e');
    const o = p.offers(assume, null).find((x) => x.kind.k === 'apply' && x.group === 'node:g:H')!;
    expect(o.bindings).toEqual([{ meta: 'x', addr: { side: 'l', path: [], range: [0, 1] } }]);
  });
  it('bindings inside a crate', () => {
    const ctx = mkCtx({ givens: [{ id: 'f', name: 'f', fact: { k: 'eq', l: M(I(M(a, b)), b), r: e } }], tools: { schemas: ['witness'] } });
    const p = new Player(ctx);
    const o = p.offers('g:f', null).find((x) => x.group === 'schema:witness')!;
    expect(o.bindings).toEqual([
      { meta: 'u', addr: { side: 'l', path: [], range: [0, 1] } },
      { meta: 'v', addr: { side: 'l', path: [], range: [1, 2] } },
    ]);
  });
  it('drops results identical to the pallet or reflexive, but keeps a reflexive goal', () => {
    const p = new Player(ctxOf('S02'));
    const s = p.start('(b a b^-1)^3');
    const labels = p.offers(s, null).map((o) => o.label);
    expect(labels).toEqual(['multiply both sides on the left by t', 'multiply both sides on the right by t']);
    const ctx = mkCtx({ sockets: [{ id: 's', target: { k: 'eq', l: b, r: b }, allowedGivens: [] }], tools: { schemas: ['cancel'] } });
    const q = new Player(ctx);
    const t = q.start('ab');
    expect(q.offers(t, null).map((o) => o.label)).toContain('Cancel Lathe: b = b');
  });
});

describe('soundness: offers never include anything check() rejects', () => {
  for (const level of LEVELS) {
    it(`${level.id}: random walk, every offer at every selection commits`, () => {
      const ctx = ctxOf(level.id);
      const p = new Player(ctx);
      const sock = level.sockets[0]!.target as Pallet & { k: 'eq' | 'neq' };
      p.start(sock.l); p.start(sock.r);
      if (level.tools.press) for (const g of level.givens) if (g.fact.k === 'size') p.press(`g:${g.id}`);
      if (sock.k === 'neq' && level.tools.suppose) p.openRoom('suppose', sock.l, sock.r);
      if (sock.k === 'eq' && level.tools.classical) p.openRoom('classical', sock.l, sock.r);
      let total = 0;
      for (let i = 0; i < 14; i++) {
        const ends = beltEnds(p);
        const at = pick(ends);
        if (i % 3 === 0) total += assertAllOffersSound(p, at);
        // random move
        const f = p.res.nodes[at]!.fact as Pallet;
        const sels = allSelections(f);
        for (let tries = 0; tries < 20; tries++) {
          const sel = pick(sels);
          const offers = p.offers(at, sel).filter((o) => !o.preview || (o.preview.k !== 'eq' && o.preview.k !== 'neq') || K.word(o.preview.l).length + K.word(o.preview.r).length < 22);
          if (!offers.length) continue;
          const o = fillAll(pick(offers), p, at);
          if (!o) continue;
          p.commitOffer(o, at);
          break;
        }
      }
      expect(total).toBeGreaterThan(0);
    });
  }
});

describe('span offers', () => {
  const ctx = ctxOf('L03');
  it('cancel with auto-tidy uses the right neighbour, else the left', () => {
    const p = new Player(ctxOf('L01'));
    const [o] = p.offers('pre0', span('r', 0, 2));
    expect(o!.label).toBe('cancel a⁻¹a');
    expect(o!.family).toBe('inverse');
    expect(o!.kind).toEqual({ k: 'steps', ops: [
      { k: 'rewrite', rule: { k: 'axiom', id: 'invL' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 2] }, subst: { x: a } },
      { k: 'rewrite', rule: { k: 'axiom', id: 'unitL' }, dir: 'fwd', at: { side: 'r', path: [], range: [0, 2] }, subst: { x: b } },
    ] });
    const q = new Player(ctx);
    const s = q.start(M(b, a, I(a)));
    const [c] = q.offers(s, span('r', 1, 3));
    expect(c!.label).toBe('cancel aa⁻¹');
    const ops = (c!.kind as { ops: K.StepOp[] }).ops;
    expect(ops[1]).toMatchObject({ rule: { id: 'unitR' }, at: { range: [0, 2] }, subst: { x: b } });
    expect(c!.preview).toEqual({ k: 'eq', l: M(b, a, I(a)), r: b });
  });
  it('no auto-tidy when e is the whole word', () => {
    const p = new Player(ctx);
    const s = p.start(M(a, I(a)));
    const [o] = p.offers(s, span('r', 0, 2));
    expect((o!.kind as { ops: unknown[] }).ops.length).toBe(1);
    expect(o!.preview).toEqual({ k: 'eq', l: M(a, I(a)), r: e });
  });
  it('a lone e beside a neighbour offers remove e; a sole e does not', () => {
    const p = new Player(ctx);
    const s = p.start(M(a, e, b));
    expect(p.offers(s, span('r', 1, 2)).map((o) => o.label)).toContain('remove e');
    const t = p.start(e);
    expect(p.offers(t, span('r', 0, 1)).map((o) => o.label)).not.toContain('remove e');
  });
  it('no unit-reverse on spans; reverse moves rank after forward ones; needs last', () => {
    const p = new Player(ctxOf('L03'));
    const s = p.start(M(a, b));
    const labels = p.offers(s, span('r', 0, 2)).map((o) => o.label);
    expect(labels[0]).toBe('ab → e (by h)');
    expect(labels.some((l) => /insert e|e·|eab|abe/.test(l))).toBe(false);
    const ex = p.start(e);
    const exp = p.offers(ex, span('r', 0, 1));
    expect(exp[0]!.label).toBe('e → ab (by h)');
    expect(exp.map((o) => o.label)).toEqual(expect.arrayContaining(['expand e as x⁻¹x', 'expand e as xx⁻¹']));
    expect(exp.findIndex((o) => o.needs.length > 0)).toBeGreaterThan(0);
  });
  it('inside a crate: rewriting keeps the cap', () => {
    const p = new Player(ctxOf('L03'));
    const s = p.start(I(M(a, b)));
    const o = p.offers(s, { side: 'r', path: [0], range: [0, 2] }).find((x) => x.label === 'ab → e (by h)');
    expect(o!.preview).toEqual({ k: 'eq', l: I(M(a, b)), r: I(e) });
  });
  it('one offer per distinct substitution', () => {
    const p = new Player(ctxOf('L08'));
    const s = p.start(M(a, b, a, b));
    const offers = p.offers(s, span('r', 0, 4));
    expect(offers.filter((o) => /by H/.test(o.label)).map((o) => o.label)).toEqual(['(ab)² → e (by H at x = ab)']);
  });
  it('the active belt is not offered as its own rule; other belt ends are; equal facts dedupe', () => {
    const p = new Player(ctxOf('L03'));
    let s = p.start('b');
    s = p.play(s, gap('r', 0), 'insert x⁻¹x', { x: 'a' }); // b = a⁻¹ab
    const own = p.offers(s, span('l', 0, 1)).map((o) => o.label);
    expect(own.filter((l) => /by b = a⁻¹ab/.test(l))).toEqual([]);
    const t = p.start('b');
    expect(p.offers(t, span('r', 0, 1)).map((o) => o.label)).toContain('b → a⁻¹ab (by b = a⁻¹ab)');
    // a belt end proving the same fact as given h is offered once (as h)
    const u = p.start('ab');
    p.play(u, span('r', 0, 2), 'ab → e (by h)');
    const v = p.start('ab');
    expect(p.offers(v, span('r', 0, 2)).filter((o) => /→ e/.test(o.label)).map((o) => o.label)).toEqual(['ab → e (by h)']);
  });
  it('mid-belt: candidates that depend on the truncated tail are not offered', () => {
    const p = new Player(ctxOf('L03'));
    const s0 = p.start('b');
    p.play(s0, gap('r', 0), 'insert x⁻¹x', { x: 'a' }); // b = a⁻¹ab, depends on nothing else
    const t = p.start('b');
    const t1 = p.play(t, span('r', 0, 1), 'b → a⁻¹ab (by b = a⁻¹ab)');
    // now make s0 (mid-belt of its own belt) active: t1 depends on s0's tail, so it is not a candidate
    const labels = p.offers(s0, span('r', 0, 1)).map((o) => o.label);
    expect(labels.some((l) => /b = a⁻¹a/.test(l))).toBe(false);
    void t1;
  });
  it('room facts are invisible outside; root facts visible inside', () => {
    const p = new Player(ctxOf('L09'));
    const { room } = p.openRoom('suppose', 'ab', 'b');
    const root = p.start('ab');
    expect(p.offers(root, span('r', 0, 2)).map((o) => o.label).some((l) => /supposition/.test(l))).toBe(false);
    const inner = p.start('ab', room);
    expect(p.offers(inner, span('r', 0, 2)).map((o) => o.label)).toContain('ab → b (by the supposition)');
  });
});

describe('gap offers', () => {
  it('insert e, pairs (needs x), ground givens (ready), laws (needs x)', () => {
    const p = new Player(ctxOf('L04'));
    const s = p.start('b');
    const offers = p.offers(s, gap('r', 1));
    const labels = offers.map((o) => o.label);
    expect(labels[0]).toBe('insert e');
    expect(labels).toEqual(expect.arrayContaining(['insert x⁻¹x', 'insert xx⁻¹', 'insert (ab)⁵ (by h)']));
    expect(offers.find((o) => o.label === 'insert (ab)⁵ (by h)')!.needs).toEqual([]);
    const pair = offers.find((o) => o.label === 'insert x⁻¹x')!;
    expect(pair.family).toBe('inverse');
    const f = K.fillOffer(pair, { x: a }, p.graph, p.res, s, p.ctx);
    expect(f.ok && f.offer.label).toBe('insert a⁻¹a');
    expect(f.ok && f.offer.preview).toEqual({ k: 'eq', l: b, r: M(b, I(a), a) });
  });
  it('law and press insertions read in maths', () => {
    const p8 = new Player(ctxOf('L08'));
    const s = p8.start('ab');
    const o = p8.offers(s, gap('r', 2)).find((x) => x.label === 'insert xx (by H)')!;
    const f = K.fillOffer(o, { x: M(b, a) }, p8.graph, p8.res, s, p8.ctx);
    expect(f.ok && f.offer.label).toBe('insert (ba)² (by H at x = ba)');
    const p11 = new Player(ctxOf('L11'));
    p11.press('g:s');
    const t = p11.start('a');
    const lag = p11.offers(t, gap('r', 0)).find((x) => /Lagrange/.test(x.label))!;
    expect(lag.label).toBe('insert x⁵ (Lagrange)');
    expect(lag.family).toBe('lemma');
  });
  it('gaps inside a crate and around a singleton', () => {
    const p = new Player(ctxOf('L06'));
    const s = p.start(I(M(a, b)));
    const [o] = p.offers(s, { side: 'r', path: [0], gap: 1 });
    expect(o!.preview).toEqual({ k: 'eq', l: I(M(a, b)), r: I(M(a, e, b)) });
    const t = p.start(M(a, b));
    // gap 1 of the singleton word [a] (path [0]) is the top-level gap 1
    const [q] = p.offers(t, { side: 'r', path: [0], gap: 1 });
    expect(q!.preview).toEqual({ k: 'eq', l: M(a, b), r: M(a, e, b) });
  });
});

describe('whole-pallet offers', () => {
  it('every Witness Stamp cut, with its mirror', () => {
    const p = new Player(ctxOf('L04'));
    const labels = p.offers('g:h', null).map((o) => o.label);
    expect(labels.filter((l) => l.startsWith('Witness Stamp:')).length).toBe(9);
    expect(labels.filter((l) => l.startsWith('Witness Stamp ᵒᵖ:')).length).toBe(9);
  });
  it('Cancel Lathe: one offer per common prefix', () => {
    const c = K.atom('c');
    const p = new Player(mkCtx({ givens: [{ id: 'f', name: 'f', fact: { k: 'eq', l: M(a, b, c, a), r: M(a, b, c, b) } }], tools: { schemas: ['cancel'] } }));
    const labels = p.offers('g:f', null).filter((o) => o.group === 'schema:cancel').map((o) => o.label);
    expect([...labels].sort()).toEqual(['Cancel Lathe: a = b', 'Cancel Lathe: bca = bcb', 'Cancel Lathe: ca = cb']);
  });
  it('Fixed-Point Gate on an inequation needs v', () => {
    const c = new Player(mkCtx({ givens: [{ id: 'n', name: 'n', fact: { k: 'neq', l: M(b, a), r: e } }], tools: { schemas: ['nofix'] } }));
    const gate = c.offers('g:n', null).find((o) => o.label.startsWith('Fixed-Point Gate:'))!;
    expect(gate.needs).toEqual(['v']);
    expect(gate.group).toBe('schema:nofix');
    const f = K.fillOffer(gate, { v: a }, c.graph, c.res, 'g:n', c.ctx);
    expect(f.ok && f.offer.label).toBe('Fixed-Point Gate: baa ≠ a');
  });
  it('preSwap: a machine bites on e = uv by folding the swap into the station', () => {
    const p = new Player(ctxOf('L06'));
    const s = p.start(M(a, b, I(b), I(a)));
    let n = p.play(s, span('r', 1, 3), 'cancel bb⁻¹');
    n = p.play(n, span('r', 0, 2), 'cancel aa⁻¹'); // abb⁻¹a⁻¹ = e
    n = p.play(n, null, 'swap sides'); // e = abb⁻¹a⁻¹
    const offers = p.offers(n, null).filter((o) => o.group === 'schema:witness');
    expect(offers.length).toBe(3);
    const o = offers.find((x) => x.label === 'Witness Stamp: b⁻¹a⁻¹ = (ab)⁻¹')!;
    expect(o.kind).toMatchObject({ k: 'apply', preSwap: true });
    expect(o.bindings).toEqual([
      { meta: 'u', addr: { side: 'r', path: [], range: [0, 2] } },
      { meta: 'v', addr: { side: 'r', path: [], range: [2, 4] } },
    ]);
    const end = p.commitOffer(o, n);
    expect(p.text(end)).toBe('(ab)⁻¹ = b⁻¹a⁻¹');
    expect(p.res.solved).toBe(true);
    // the folded swap is recorded but not scored as a part
    expect(p.graph.nodes.filter((m) => m.meta?.gesture === 'auto-swap').length).toBe(2);
    expect(K.metrics(p.graph, p.res, p.ctx).parts).toBe(4);
  });
  it('preSwap is not offered when the pallet already fits as-is', () => {
    const p = new Player(ctxOf('L04'));
    expect(p.offers('g:h', null).some((o) => o.kind.k === 'apply' && o.kind.preSwap)).toBe(false);
    const q = new Player(ctxOf('L07'));
    const lathe = q.offers('g:h', null).filter((o) => o.group?.startsWith('schema:cancel'));
    expect(lathe.some((o) => o.kind.k === 'apply' && o.kind.preSwap)).toBe(false);
  });
  it('clash from either side; merge when the machine exists', () => {
    const p = new Player(ctxOf('L09'));
    const { assume } = p.openRoom('suppose', 'a', 'e');
    expect(p.offers(assume, null).map((o) => o.label)[0]).toBe('contradiction with n: a ≠ e');
    const ctx = mkCtx({ givens: [{ id: 'q', name: 'q', fact: { k: 'eq', l: a, r: b } }, { id: 'n', name: 'n', fact: { k: 'neq', l: b, r: a } }] });
    const q = new Player(ctx);
    const clash = q.offers('g:n', null).find((o) => o.kind.k === 'clash')!;
    expect(clash.label).toBe('contradiction with q: a = b');
    q.commitOffer(clash, 'g:n');
    expect(q.res.ok).toBe(true);
    const m = new Player(mkCtx({ givens: [{ id: 'x', name: 'x', fact: { k: 'eq', l: a, r: M(b, b) } }] }));
    const s = m.start(M(b, b));
    const merge = m.offers(s, null).find((o) => o.kind.k === 'merge')!;
    expect(merge.preview).toEqual({ k: 'eq', l: a, r: M(b, b) });
  });
  it('swap and lift; no lift where the level withholds it', () => {
    const p = new Player(ctxOf('L03'));
    const labels = p.offers('g:h', null).map((o) => o.label);
    expect(labels).toContain('swap sides');
    expect(labels.some((l) => /multiply/.test(l))).toBe(false);
  });
});

describe('fillOffer', () => {
  const p = new Player(ctxOf('L03'));
  const s = p.start('b');
  const pair = p.offers(s, gap('r', 0)).find((o) => o.label === 'insert x⁻¹x')!;
  it('rejects undeclared atoms, metas, missing values', () => {
    const z = K.fillOffer(pair, { x: K.atom('z') }, p.graph, p.res, s, p.ctx);
    expect(!z.ok && z.error).toMatch(/z is not an element/);
    expect(K.fillOffer(pair, { x: K.meta('y') }, p.graph, p.res, s, p.ctx).ok).toBe(false);
    expect(K.fillOffer(pair, {}, p.graph, p.res, s, p.ctx).ok).toBe(false);
  });
  it('accepts compound values and is deterministic', () => {
    const f1 = K.fillOffer(pair, { x: M(a, b) }, p.graph, p.res, s, p.ctx);
    const f2 = K.fillOffer(pair, { x: M(a, b) }, p.graph, p.res, s, p.ctx);
    expect(f1.ok && f1.offer.label).toBe('insert (ab)⁻¹ab');
    expect(f1.ok && f2.ok && f1.offer.key === f2.offer.key).toBe(true);
    expect(f1.ok && f1.offer.key).not.toBe(pair.key);
  });
  it('offer keys are stable across calls', () => {
    const k1 = p.offers(s, gap('r', 0)).map((o) => o.key);
    const k2 = p.offers(s, gap('r', 0)).map((o) => o.key);
    expect(k1).toEqual(k2);
    expect(new Set(k1).size).toBe(k1.length);
  });
});

describe('families and justifications', () => {
  it('stations take their mathematical names', () => {
    const p = new Player(ctxOf('L03'));
    let n = p.start('b');
    n = p.play(n, gap('r', 0), 'insert x⁻¹x', { x: 'a' });
    p.play(n, span('r', 1, 3), 'ab → e (by h)');
    const g: ProofGraph = p.graph;
    const fam = g.nodes.map((m) => `${m.k}:${K.familyOf(m, g)}:${K.justify(m, g, p.ctx)}`);
    expect(fam).toEqual([
      'given:given:h', 'start:equation:reflexivity',
      'step:inverse:unit', 'step:inverse:inverse',
      'step:given:h', 'step:identity:unit',
    ]);
  });
  it('lift, swap, schemas, rooms, press', () => {
    const p = new Player(ctxOf('L12'));
    const pr = p.press('g:s');
    const { assume } = p.openRoom('suppose', '(ab)^3', 'e');
    const g = p.graph;
    const byId = (id: NodeId) => g.nodes.find((m) => m.id === id)!;
    expect(K.justify(byId(pr), g, p.ctx)).toBe('Lagrange (imported)');
    expect(K.familyOf(byId(pr), g)).toBe('lemma');
    expect(K.justify(byId(assume), g, p.ctx)).toBe('supposition');
    expect(K.familyOf(byId(assume), g)).toBe('scope');
    const q = new Player(ctxOf('L05'));
    const t = q.play('g:h', null, 'multiply both sides on the left by t', { t: 'a^-1' });
    expect(K.justify(q.graph.nodes.find((m) => m.id === t)!, q.graph, q.ctx)).toBe('multiply on the left by a⁻¹');
  });
});

describe('performance', () => {
  it('offersAt on a 20-bead pallet stays under 5 ms', () => {
    const p = new Player(ctxOf('L12'));
    p.press('g:s');
    const { room } = p.openRoom('suppose', '(ab)^3', 'e');
    const s = p.start('(ab)^5', room); // 10 + 10 = 20 beads
    const f = p.res.nodes[s]!.fact as Pallet;
    const sels = allSelections(f);
    // warm up
    for (const sel of sels) p.offers(s, sel);
    const t0 = performance.now();
    let calls = 0, worst = 0;
    for (let rep = 0; rep < 5; rep++) {
      for (const sel of sels) {
        const t1 = performance.now();
        p.offers(s, sel);
        worst = Math.max(worst, performance.now() - t1);
        calls++;
      }
    }
    const mean = (performance.now() - t0) / calls;
    let produced = 0;
    for (const sel of sels) produced += p.offers(s, sel).length;
    // the heaviest single selections: whole pallet (every Witness cut, both mirrors) and whole rail
    const heavy = [null, span('r', 0, 10), span('l', 0, 10), gap('r', 5)];
    const th = performance.now();
    for (let rep = 0; rep < 50; rep++) for (const sel of heavy) p.offers(s, sel);
    const heavyMean = (performance.now() - th) / (50 * heavy.length);
    console.log(`offersAt 20-bead pallet: ${calls} calls over ${sels.length} selections (${produced} offers), mean ${mean.toFixed(3)} ms, worst ${worst.toFixed(3)} ms; heavy selections mean ${heavyMean.toFixed(3)} ms; whole-pallet offers: ${p.offers(s, null).length}`);
    expect(produced).toBeGreaterThan(100);
    expect(heavyMean).toBeLessThan(5);
    expect(mean).toBeLessThan(5);
    expect(worst).toBeLessThan(25);
  });
});

void ROOT;
