import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from './index';
import { LEVEL_BY_ID } from '../levels/levels';
import {
  Floor, I, P, E, a, b, c, e1, eq, neq, knob, order, factOut, status,
  rw, cancel, pop, insertE, insertPair, lawRw, routed, mult, op, join, thm, spool,
} from './compiler.testkit';

const L = (lv: { atoms: K.AtomDecl[] }) => K.labelsOf(lv.atoms);
const txt = (f: F.Compiled, id: string, lv: { atoms: K.AtomDecl[] }) => K.factText(factOut(f, id), L(lv));
const reason = (comp: F.Compiled, id: string) => { const s = status(comp, id); return s.k === 'ok' ? '' : s.reason; };

describe('lowering: Rewriter recipes', () => {
  it('L01 First Light: pre-start spool → Rewriter[cancel] → dock delivers', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const spoolId = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add(cancel());
    f.wire(spoolId, can); f.wire(can, f.socket());
    const comp = f.compile();
    expect(status(comp, can)).toEqual({ k: 'ok' });
    expect(comp.machines[can]!.nodes).toEqual([`${can}#cancel`, `${can}#tidy`]);
    expect(txt(comp, can, f.level)).toBe('a⁻¹ab = b');
    expect(comp.machines[can]!.candidates![0]!.addr).toEqual({ side: 'r', path: [], range: [0, 2] });
    expect(comp.machines[can]!.duration).toBe(2);
    expect(comp.check.ok).toBe(true);
    expect(comp.solvable).toBe(true);
    const { s, metrics } = f.run();
    expect(s.delivered.s).toBeGreaterThan(0);
    expect(metrics).toMatchObject({ machines: 1, cycles: s.delivered.s });
  });

  it('no recipe chosen: starved, "choose a recipe"', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const r = f.add({ kind: 'rewriter', recipe: null, dir: 'fwd', target: { k: 'first' }, gap: { k: 'first' }, values: {}, tidy: true });
    f.wire(f.c.machines.find((m) => m.kind === 'spool')!.id, r);
    expect(status(f.compile(), r)).toEqual({ k: 'starved', reason: 'Choose a recipe.' });
  });

  it('L02 Another Identity: insert e after e′, then cite the given law H from the library (no belt)', () => {
    const f = new Floor(LEVEL_BY_ID.L02!);
    const sp = f.add(spool(e1));
    const ex = f.add(insertE(F.pinFromGap(eq(e1, e1), { side: 'r', path: [], gap: 1 })!));
    const re = f.add(lawRw({ k: 'given', givenId: 'H' }, { tidy: false }));
    f.wire(sp, ex); f.wire(ex, re); f.wire(re, f.socket());
    const comp = f.compile();
    expect(txt(comp, ex, f.level)).toBe('e′ = e′e');
    expect(txt(comp, re, f.level)).toBe('e′ = e');
    // the citation keeps its dependency exactly like a belted inlet
    const last = comp.machines[re]!.nodes.at(-1)!;
    expect(comp.check.nodes[last]!.deps).toEqual(['g:H']);
    expect(comp.solvable).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('L03: insert pair x⁻¹x (x = a) → library given h at the bracket (tidy) → b = a⁻¹', () => {
    const f = new Floor(LEVEL_BY_ID.L03!);
    const sp = f.add(spool(b));
    const ex = f.add(insertPair(a, true));
    const re = f.add(lawRw({ k: 'given', givenId: 'h' }));
    f.wire(sp, ex); f.wire(ex, re); f.wire(re, f.socket());
    const comp = f.compile();
    expect(txt(comp, ex, f.level)).toBe('b = a⁻¹ab');
    expect(txt(comp, re, f.level)).toBe('b = a⁻¹');
    expect(comp.solvable).toBe(true);
  });

  it('a law whose source side is e acts at a gap: h reversed grows e into ab', () => {
    const f = new Floor(LEVEL_BY_ID.L03!);
    const sp = f.add(spool(b));
    const re = f.add(lawRw({ k: 'given', givenId: 'h' }, { dir: 'rev' }));
    f.wire(sp, re);
    const comp = f.compile();
    expect(txt(comp, re, f.level)).toBe('b = abb');
    expect(comp.machines[re]!.nodes.map((n) => n.split('#')[1])).toEqual(['insert', 'rewrite']);
  });

  it('playtest W4–9 #13: a source-e rule may also bracket an e already in the word (no extra e inserted)', () => {
    const f = new Floor(LEVEL_BY_ID.L03!);
    const sp = f.add(spool(b));
    const ie = f.add(insertE());
    f.wire(sp, ie);
    expect(txt(f.compile(), ie, f.level)).toBe('b = eb');
    const onE = F.pinFromAddr(eq(b, P(E, b)), { side: 'r', path: [], range: [0, 1] })!;
    const re = f.add(lawRw({ k: 'given', givenId: 'h' }, { dir: 'rev', gap: onE }));
    f.wire(ie, re);
    const comp = f.compile();
    expect(txt(comp, re, f.level)).toBe('b = abb');
    expect(comp.machines[re]!.nodes.map((n) => n.split('#')[1])).toEqual(['rewrite']);
    // the lens offers carets and the bracket on e together; the bracket is chosen
    const res = comp.machines[re]!;
    expect(res.candidates!.some((c) => 'gap' in c.addr)).toBe(true);
    expect(res.candidates![res.chosen!]!.addr).toEqual({ side: 'r', path: [], range: [0, 1] });
    expect(comp.check.ok).toBe(true);
    // final W1–7 #9: the default (first match) now takes the e already there, never a fresh e at the first caret
    const re2 = f.add(lawRw({ k: 'given', givenId: 'h' }, { dir: 'rev' }));
    f.wire(ie, re2);
    const c2 = f.compile();
    expect(txt(c2, re2, f.level)).toBe('b = abb');
    expect(c2.machines[re2]!.candidates![c2.machines[re2]!.chosen!]!.addr).toEqual({ side: 'r', path: [], range: [0, 1] });
    // a caret, chosen, still inserts (the old behaviour)
    const re4 = f.add(lawRw({ k: 'given', givenId: 'h' }, { dir: 'rev', gap: F.pinFromGap(eq(b, P(E, b)), { side: 'r', path: [], gap: 0 })! }));
    f.wire(ie, re4);
    expect(txt(f.compile(), re4, f.level)).toBe('b = abeb');
    // a bracket that is not on an e is refused with a reason
    const onB = F.pinFromAddr(eq(b, P(E, b)), { side: 'r', path: [], range: [1, 2] })!;
    const re3 = f.add(lawRw({ k: 'given', givenId: 'h' }, { dir: 'rev', gap: onB }));
    f.wire(ie, re3);
    expect(reason(f.compile(), re3)).toMatch(/not on an e/);
  });

  it('routed recipe: a fact made on the floor rides into the rule port', () => {
    const f = new Floor(LEVEL_BY_ID.L03!);
    const sp = f.add(spool(b));
    const ex = f.add(insertPair(a, true));
    const re = f.add(routed());
    f.wire(sp, ex); f.wire(ex, re); f.wire(f.given('h'), re, 'rule'); f.wire(re, f.socket());
    const comp = f.compile();
    expect(txt(comp, re, f.level)).toBe('b = a⁻¹');
    expect(comp.solvable).toBe(true);
  });

  it('routed neq rule and cond rule jam in maths', () => {
    const lv = order(eq(a, b), [{ id: 'n', fact: neq(a, b) }]);
    const f = new Floor(lv);
    const sp = f.add(spool(a));
    const re = f.add(routed());
    f.wire(sp, re); f.wire(f.given('n'), re, 'rule');
    expect(reason(f.compile(), re)).toBe('a ≠ b is an inequation. A rule needs an equation.');
    const re2 = f.add(lawRw({ k: 'given', givenId: 'n' }));
    f.wire(sp, re2);
    expect(reason(f.compile(), re2)).toMatch(/is an inequation\. A rule needs an equation\./);
  });

  it('pop removes a lone e; a sole e cannot be removed', () => {
    const lv = order(eq(a, a));
    const f = new Floor(lv);
    const sp = f.add(spool(P(a, E)));
    const po = f.add(pop());
    f.wire(sp, po);
    expect(txt(f.compile(), po, lv)).toBe('ae = a');
    const s2 = f.add(spool(E));
    const p2 = f.add(pop());
    f.wire(s2, p2);
    expect(reason(f.compile(), p2)).toBe('No e to remove in e = e.');
  });
});

describe('lowering: Operator, Joiner, Theorem', () => {
  it('L05: Operator[multiply left a⁻¹] → cancel → cancel', () => {
    const f = new Floor(LEVEL_BY_ID.L05!);
    const mu = f.add(mult('left', I(a)));
    const c1 = f.add(cancel()), c2 = f.add(cancel());
    f.wire(f.given('h'), mu); f.wire(mu, c1); f.wire(c1, c2); f.wire(c2, f.socket());
    const comp = f.compile();
    expect(txt(comp, mu, f.level)).toBe('a⁻¹ab = a⁻¹ac');
    expect(txt(comp, c1, f.level)).toBe('a⁻¹ab = c');
    expect(txt(comp, c2, f.level)).toBe('b = c');
    expect(comp.solvable).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('Operator invert and swap', () => {
    const lv = order(eq(a, a), [{ id: 'h', fact: eq(P(a, b), c) }, { id: 'n', fact: neq(a, b) }]);
    const f = new Floor(lv);
    const iv = f.add(op({ k: 'invert' }));
    const sw = f.add(op({ k: 'swap' }));
    f.wire(f.given('h'), iv); f.wire(f.given('n'), sw);
    const comp = f.compile();
    expect(txt(comp, iv, lv)).toBe('(ab)⁻¹ = c⁻¹');
    expect(txt(comp, sw, lv)).toBe('b ≠ a');
  });

  it('Joiner: chain, product, and clash in either inlet order', () => {
    const lv = order(eq(a, a), [{ id: 'h', fact: eq(a, c) }, { id: 'k', fact: eq(b, c) }, { id: 'n', fact: neq(c, a) }]);
    const f = new Floor(lv);
    const ch = f.add(join({ k: 'chain' })), pr = f.add(join({ k: 'product' })), cl = f.add(join({ k: 'clash' }));
    f.wire(f.given('h'), ch, 'a'); f.wire(f.given('k'), ch, 'b');
    f.wire(f.given('h'), pr, 'a'); f.wire(f.given('k'), pr, 'b');
    f.wire(f.given('n'), cl, 'a'); f.wire(f.given('h'), cl, 'b');
    const comp = f.compile();
    expect(txt(comp, ch, lv)).toBe('a = b');
    expect(txt(comp, pr, lv)).toBe('ab = cc');
    expect(comp.machines[cl]!.out).toMatchObject({ k: 'fact', fact: { k: 'bot' } });
  });

  it('Theorem with a library cond given (L10 style) and with the unique right inverse schema (choices + bindings)', () => {
    const H: K.Card = { k: 'cond', metas: ['x'], premises: [{ k: 'neq', l: K.meta('x'), r: E }], concl: { k: 'eq', l: P(a, K.meta('x')), r: K.meta('x') } };
    const lv = order(eq(P(a, b), b), [{ id: 'H', fact: H }, { id: 'n', fact: neq(b, E) }]);
    const f = new Floor(lv);
    const th = f.add(thm({ k: 'given', givenId: 'H' }));
    f.wire(f.given('n'), th, 'p0'); f.wire(th, f.socket());
    let comp = f.compile();
    expect(txt(comp, th, lv)).toBe('ab = b');
    expect(comp.solvable).toBe(true);

    const g = new Floor(LEVEL_BY_ID.L06!, ['witness', 'cancel']);
    const sp = g.add(spool(P(a, b, I(b), I(a))));
    const k1 = g.add(cancel()), k2 = g.add(cancel());
    const st = g.add(thm({ k: 'schema', id: 'witness' }, 1));
    g.wire(sp, k1); g.wire(k1, k2); g.wire(k2, st, 'p0'); g.wire(st, g.socket());
    comp = g.compile();
    expect(comp.machines[st]!.choices!.length).toBe(3);
    expect(comp.machines[st]!.choices![1]!.bindings).toEqual([{ meta: 'u', addr: { side: 'l', path: [], range: [0, 2] } }, { meta: 'v', addr: { side: 'l', path: [], range: [2, 4] } }]);
    expect(txt(comp, st, g.level)).toBe('b⁻¹a⁻¹ = (ab)⁻¹');
    expect(comp.solvable).toBe(true); // reversed at the dock: recorded auto-swap
    const sw = comp.graph.nodes.find((n) => n.id === comp.machines[g.socket()]!.nodes[0])!;
    expect(sw.meta?.gesture).toBe('auto-swap');
  });

  it('Lagrange is an imported library law that depends on the |G| given; no |G| given → jam', () => {
    const lv = order(eq(P(a, a, a), E), [{ id: 's', fact: { k: 'size', n: 3 } }]);
    const f = new Floor(lv);
    const sp = f.add(spool(P(a, a, a)));
    const re = f.add(lawRw({ k: 'lagrange' }, { tidy: false }));
    f.wire(sp, re); f.wire(re, f.socket());
    const comp = f.compile();
    expect(txt(comp, re, lv)).toBe('a³ = e');
    expect(comp.check.nodes[comp.machines[re]!.nodes[0]!]!.deps).toEqual(['g:s']);
    expect(comp.solvable).toBe(true);
    const g = new Floor(order(eq(a, a)));
    const s2 = g.add(spool(a));
    const r2 = g.add(lawRw({ k: 'lagrange' }));
    g.wire(s2, r2);
    expect(reason(g.compile(), r2)).toBe('Lagrange needs a |G| = n given.');
  });
});

describe('docks, jams and causes', () => {
  it('socket auto-swap: a reversed delivery is accepted through a recorded swap', () => {
    const lv = order(eq(b, a), [{ id: 'h', fact: eq(a, b) }]);
    const f = new Floor(lv);
    f.wire(f.given('h'), f.socket());
    const comp = f.compile();
    expect(comp.solvable).toBe(true);
    const sw = comp.graph.nodes.find((n) => n.meta?.gesture === 'auto-swap')!;
    expect(comp.check.nodes[sw.id]!.fact).toEqual(eq(b, a));
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('wrong shipment jams the dock; a pinned bracket that is gone jams; downstream starves with a causal link', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const spoolId = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add(cancel({ k: 'pin', side: 'r', selected: P(b, I(b)), neighbours: { left: [], right: [], leftEdge: false, rightEdge: false }, ancestors: [] }));
    f.wire(spoolId, can); f.wire(can, f.socket());
    const comp = f.compile();
    expect(reason(comp, can)).toBe('No bb⁻¹ in a⁻¹ab. Pick the bracket again.');
    expect(status(comp, f.socket()).k).toBe('starved');
    expect(F.rootCause(comp, f.socket())).toBe(can);
    const g = new Floor(LEVEL_BY_ID.L01!);
    g.wire(g.c.machines.find((m) => m.kind === 'spool')!.id, g.socket());
    expect(reason(g.compile(), g.socket())).toBe('Needs a⁻¹ab = b. Got a⁻¹ab = a⁻¹ab.');
  });

  it('forbidden dependency at the dock is rejected even with the right formula', () => {
    const lv = order(eq(a, b), [{ id: 'h', fact: eq(a, b) }]);
    lv.sockets[0]!.allowedGivens = [];
    const f = new Floor(lv);
    f.wire(f.given('h'), f.socket());
    expect(reason(f.compile(), f.socket())).toContain('rests on the given h');
  });

  it('a feedback loop is a jam', () => {
    const f = new Floor(order(eq(a, b)));
    const o1 = f.add(op({ k: 'swap' })), o2 = f.add(op({ k: 'swap' }));
    f.wire(o1, o2); f.wire(o2, o1);
    const comp = f.compile();
    expect(reason(comp, o1)).toBe('This feeds itself. Break the loop.');
  });
});

describe('scope from geometry', () => {
  it('a fact made inside a room cannot leave on a belt; it leaves only through the gate', () => {
    const lv = order(neq(P(a, b), b), [{ id: 'n', fact: neq(a, E) }]);
    const f = new Floor(lv);
    const { room, desk, gate } = f.room({ x: 14, y: 2, w: 16, h: 8 }, 'suppose', P(a, b), b);
    const mu = f.add(mult('right', I(b)), { x: 34, y: 14 });
    const leak = f.wire(desk, mu);
    let comp = f.compile();
    expect(comp.beltErrors[leak]).toBe('ab = b rests on ab = b. Leave through the gate.');
    expect(status(comp, mu).k).toBe('jammed');
    expect(comp.scopeOf[desk]).toBe(room);
    f.c = { ...f.c, belts: f.c.belts.filter((x) => x.id !== leak), machines: f.c.machines.filter((m) => m.id !== mu) };
    const m2 = f.add(mult('right', I(b)), { x: 17, y: 3 });
    const k1 = f.add(cancel(F.pinFromAddr(eq(P(a, b, I(b)), P(b, I(b))), { side: 'l', path: [], range: [1, 3] })!), { x: 21, y: 3 });
    const k2 = f.add(cancel(), { x: 25, y: 3 });
    const cl = f.add(join({ k: 'clash' }), { x: 22, y: 6 });
    f.wire(desk, m2); f.wire(m2, k1); f.wire(k1, k2); f.wire(k2, cl, 'a'); f.wire(f.given('n'), cl, 'b');
    f.wire(cl, gate);
    f.wire(gate, f.socket());
    comp = f.compile();
    for (const id of [m2, k1, k2, cl]) expect(comp.scopeOf[id]).toBe(room);
    expect(txt(comp, k2, lv)).toBe('a = e');
    expect(comp.machines[gate]!.out).toMatchObject({ k: 'fact', fact: neq(P(a, b), b) });
    expect(comp.solvable, JSON.stringify([comp.beltErrors, comp.sockets])).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });
});

describe('performance', () => {
  it('compiles a 30-machine canvas in well under 10 ms', () => {
    const lv = order(eq(P(a, b), P(a, b)));
    const f = new Floor(lv);
    let prev = f.add(spool(P(a, b)), { x: 4, y: 30 });
    let n = 1;
    for (let row = 0; n < 30; row++) {
      for (let col = 0; col < 7 && n < 30; col++, n++) {
        const at = { x: 10 + col * 5 + (row % 2 ? 2 : 0), y: 30 + row * 4 };
        const kind = n % 3;
        const cfg = kind === 1 ? insertPair(a, false) : kind === 2 ? cancel() : op({ k: 'swap' });
        const id = f.add(cfg, at);
        f.wire(prev, id);
        prev = id;
      }
    }
    for (let i = 0; i < 20; i++) f.compile();
    const N = 50, t0 = performance.now();
    for (let i = 0; i < N; i++) f.compile();
    const ms = (performance.now() - t0) / N;
    const comp = f.compile();
    expect(Object.values(comp.machines).filter((r) => r.status.k === 'jammed')).toEqual([]);
    console.log(`PERF compile 30 machines: ${ms.toFixed(2)} ms, ${comp.graph.nodes.length} nodes`);
    expect(ms).toBeLessThan(10);
  });
});

void rw; void knob;
