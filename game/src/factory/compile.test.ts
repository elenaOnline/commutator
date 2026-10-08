import { describe, expect, it } from 'vitest';
import * as K from '../kernel';
import * as F from './index';
import { LEVEL_BY_ID } from '../levels/levels';
import { Floor, I, P, E, a, b, c, e1, eq, neq, knob, order, factOut, status } from './compiler.testkit';

const L = (lv: { atoms: K.AtomDecl[] }) => K.labelsOf(lv.atoms);
const txt = (f: F.Compiled, id: string, lv: { atoms: K.AtomDecl[] }) => K.factText(factOut(f, id), L(lv));
const reason = (comp: F.Compiled, id: string) => { const s = status(comp, id); return s.k === 'ok' ? '' : s.reason; };

describe('lowering per machine', () => {
  it('L01 First Light: pre-start spool → Canceller → dock delivers', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add({ kind: 'canceller', target: { k: 'first' }, tidy: true });
    f.wire(spool, can); f.wire(can, f.socket());
    const comp = f.compile();
    expect(status(comp, can)).toEqual({ k: 'ok' });
    expect(comp.machines[can]!.nodes).toEqual([`${can}#cancel`, `${can}#tidy`]);
    expect(txt(comp, can, f.level)).toBe('a⁻¹ab = b');
    expect(comp.machines[can]!.candidates![0]!.addr).toEqual({ side: 'r', path: [], range: [0, 2] });
    expect(comp.machines[can]!.chosen).toBe(0);
    expect(comp.machines[can]!.duration).toBe(2);
    expect(comp.check.ok).toBe(true);
    expect(comp.solvable).toBe(true);
    const { s, metrics } = f.run();
    expect(s.delivered.s).toBeGreaterThan(0);
    expect(metrics.machines).toBe(1);
    expect(metrics.cycles).toBe(s.delivered.s);
  });

  it('L02 Another Identity: Spool e′ → Expander (pinned gap after e′) → Rewriter routed H', () => {
    const f = new Floor(LEVEL_BY_ID.L02!);
    const sp = f.add({ kind: 'spool', t: knob(e1) });
    const gap = F.pinFromGap(eq(e1, e1), { side: 'r', path: [], gap: 1 })!;
    const ex = f.add({ kind: 'expander', target: gap, insert: 'e', x: knob(null), dir: 'fwd' });
    const rw = f.add({ kind: 'rewriter', target: { k: 'first' }, dir: 'fwd', values: {}, tidy: false });
    f.wire(sp, ex); f.wire(ex, rw); f.wire(f.given('H'), rw, 'rule'); f.wire(rw, f.socket());
    const comp = f.compile();
    expect(txt(comp, ex, f.level)).toBe('e′ = e′e');
    expect(txt(comp, rw, f.level)).toBe('e′ = e');
    expect(comp.solvable).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('L03 Inverse Is Unique: Spool b → Expander x⁻¹x (x = a) → Rewriter with h, tidy', () => {
    const f = new Floor(LEVEL_BY_ID.L03!);
    const sp = f.add({ kind: 'spool', t: knob(b) });
    const ex = f.add({ kind: 'expander', target: { k: 'first' }, insert: 'pairInv', x: knob(a), dir: 'fwd' });
    const rw = f.add({ kind: 'rewriter', target: { k: 'first' }, dir: 'fwd', values: {}, tidy: true });
    f.wire(sp, ex); f.wire(ex, rw); f.wire(f.given('h'), rw, 'rule'); f.wire(rw, f.socket());
    const comp = f.compile();
    expect(txt(comp, ex, f.level)).toBe('b = a⁻¹ab');
    expect(comp.machines[ex]!.nodes.length).toBe(2);
    expect(txt(comp, rw, f.level)).toBe('b = a⁻¹');
    expect(comp.solvable).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('L05 Cancellation: given h → Multiplier a⁻¹ on the left → Canceller → Canceller', () => {
    const f = new Floor(LEVEL_BY_ID.L05!);
    const mu = f.add({ kind: 'multiplier', side: 'left', t: knob(I(a)) });
    const c1 = f.add({ kind: 'canceller', target: { k: 'first' }, tidy: true });
    const c2 = f.add({ kind: 'canceller', target: { k: 'first' }, tidy: true });
    f.wire(f.given('h'), mu); f.wire(mu, c1); f.wire(c1, c2); f.wire(c2, f.socket());
    const comp = f.compile();
    expect(txt(comp, mu, f.level)).toBe('a⁻¹ab = a⁻¹ac');
    expect(txt(comp, c1, f.level)).toBe('a⁻¹ab = c'); // right rail first
    expect(txt(comp, c2, f.level)).toBe('b = c');
    expect(comp.solvable).toBe(true);
    const { s, metrics } = f.run();
    expect(s.delivered.s).toBeDefined();
    expect(metrics.machines).toBe(3);
  });

  it('Popper, Swapper, Meet, Anvil, Apply (cond given), Joiner/Inverter/Hopper', () => {
    const lv = order(eq(P(a, b), b), [{ id: 'H', fact: { k: 'cond', metas: ['x'], premises: [{ k: 'neq', l: K.meta('x'), r: E }], concl: { k: 'eq', l: P(a, K.meta('x')), r: K.meta('x') } } }, { id: 'n', fact: neq(b, E) }]);
    const f = new Floor(lv);
    const ap = f.add({ kind: 'apply', premises: 1, choice: 0, values: {} });
    f.wire(f.given('H'), ap, 'rule'); f.wire(f.given('n'), ap, 'p0'); f.wire(ap, f.socket());
    let comp = f.compile();
    expect(txt(comp, ap, lv)).toBe('ab = b');
    expect(comp.machines[ap]!.choices!.length).toBe(1);
    expect(comp.solvable).toBe(true);
    // term syntax machines feed a Spool through its term port
    const h1 = f.add({ kind: 'hopper', t: a });
    const h2 = f.add({ kind: 'hopper', t: b });
    const jn = f.add({ kind: 'joiner' });
    const iv = f.add({ kind: 'inverter' });
    const sp = f.add({ kind: 'spool', t: { k: 'port' } });
    f.wire(h1, jn, 'a'); f.wire(h2, jn, 'b'); f.wire(jn, iv); f.wire(iv, sp, 't');
    const ex = f.add({ kind: 'expander', target: { k: 'first' }, insert: 'e', x: knob(null), dir: 'fwd' });
    const po = f.add({ kind: 'popper', target: { k: 'first' } });
    const sw = f.add({ kind: 'swapper' });
    f.wire(sp, ex); f.wire(ex, po); f.wire(po, sw);
    comp = f.compile();
    expect(comp.machines[iv]!.out).toEqual({ k: 'term', term: I(P(a, b)) });
    expect(txt(comp, ex, lv)).toBe('(ab)⁻¹ = e(ab)⁻¹');
    expect(txt(comp, po, lv)).toBe('(ab)⁻¹ = (ab)⁻¹');
    expect(txt(comp, sw, lv)).toBe('(ab)⁻¹ = (ab)⁻¹');
    // Meet: X = M, Y = M ⟹ X = Y ; Anvil: eq + neq ⟹ ⊥
    const s1 = f.add({ kind: 'spool', t: knob(b) });
    const me = f.add({ kind: 'meet' });
    f.wire(s1, me, 'a'); f.wire(f.given('n'), me, 'b');
    comp = f.compile();
    expect(status(comp, me).k).toBe('jammed');
    expect(reason(comp, me)).toContain('needs an equation');
    const an = f.add({ kind: 'anvil' });
    const s2 = f.add({ kind: 'spool', t: knob(b) });
    const ex2 = f.add({ kind: 'expander', target: { k: 'first' }, insert: 'e', x: knob(null), dir: 'fwd' });
    const po2 = f.add({ kind: 'popper', target: { k: 'first' } });
    f.wire(s2, ex2); f.wire(ex2, po2);
    // b = b against b ≠ e does not clash
    f.wire(po2, an, 'a');
    const n2 = f.add({ kind: 'apply', premises: 1, choice: 0, values: {} });
    void n2;
    comp = f.compile();
    expect(status(comp, an).k).toBe('starved'); // ≠ inlet not connected
  });

  it('Rewriter: neq rule, cond rule and unknown variables jam in maths', () => {
    const lv = order(eq(a, b), [{ id: 'n', fact: neq(a, b) }, { id: 'H', fact: { k: 'cond', metas: ['x'], premises: [{ k: 'neq', l: K.meta('x'), r: E }], concl: { k: 'eq', l: K.meta('x'), r: E } } }]);
    const f = new Floor(lv);
    const sp = f.add({ kind: 'spool', t: knob(a) });
    const rw = f.add({ kind: 'rewriter', target: { k: 'first' }, dir: 'fwd', values: {}, tidy: false });
    f.wire(sp, rw); f.wire(f.given('n'), rw, 'rule');
    let comp = f.compile();
    expect(reason(comp, rw)).toMatch(/^this rule is an inequation \(a ≠ b\); a rewrite needs an equation/);
    const rw2 = f.add({ kind: 'rewriter', target: { k: 'first' }, dir: 'fwd', values: {}, tidy: false });
    f.wire(sp, rw2); f.wire(f.given('H'), rw2, 'rule');
    comp = f.compile();
    expect(reason(comp, rw2)).toContain('is conditional');
  });

  it('Stamp (Witness Stamp) offers every cut as a choice with bindings', () => {
    const f = new Floor(LEVEL_BY_ID.L06!, ['witness', 'cancel']);
    const sp = f.add({ kind: 'spool', t: knob(P(a, b, I(b), I(a))) });
    const c1 = f.add({ kind: 'canceller', target: { k: 'first' }, tidy: true });
    const c2 = f.add({ kind: 'canceller', target: { k: 'first' }, tidy: true });
    const st = f.add({ kind: 'stamp', schema: 'witness', mirror: false, choice: 1, values: {} });
    f.wire(sp, c1); f.wire(c1, c2); f.wire(c2, st, 'p0'); f.wire(st, f.socket());
    const comp = f.compile();
    expect(txt(comp, c2, f.level)).toBe('abb⁻¹a⁻¹ = e');
    const ch = comp.machines[st]!.choices!;
    expect(ch.length).toBe(3); // u|v cuts of a·b·b⁻¹a⁻¹ … in §6 order (shortest u first)
    expect(ch[1]!.bindings).toEqual([{ meta: 'u', addr: { side: 'l', path: [], range: [0, 2] } }, { meta: 'v', addr: { side: 'l', path: [], range: [2, 4] } }]);
    expect(txt(comp, st, f.level)).toBe('b⁻¹a⁻¹ = (ab)⁻¹');
    expect(comp.solvable).toBe(true); // reversed at the dock: recorded auto-swap
    const sock = comp.machines[f.socket()]!;
    expect(sock.nodes.length).toBe(1);
    const sw = comp.graph.nodes.find((n) => n.id === sock.nodes[0])!;
    expect(sw.meta?.gesture).toBe('auto-swap');
  });
});

describe('port courtesy (r3)', () => {
  it('Anvil sorts its inlets by kind: ≠ in the = port and = in the ≠ port still clash', () => {
    const lv = order(eq(a, a), [{ id: 'h', fact: eq(a, b) }, { id: 'n', fact: neq(b, a) }]);
    const f = new Floor(lv);
    const an = f.add({ kind: 'anvil' });
    f.wire(f.given('n'), an, 'a'); f.wire(f.given('h'), an, 'b');
    const comp = f.compile();
    expect(status(comp, an)).toEqual({ k: 'ok' });
    const node = comp.graph.nodes.find((x) => x.id === comp.machines[an]!.nodes[0])!;
    expect(node).toMatchObject({ k: 'clash', inputs: [`${f.given('h')}#given`, `${f.given('n')}#given`] });
    expect(comp.machines[an]!.out).toMatchObject({ k: 'fact', fact: { k: 'bot' } });
  });

  it('Anvil jams when both inlets carry the same kind', () => {
    const lv = order(eq(a, a), [{ id: 'h', fact: eq(a, b) }, { id: 'k', fact: eq(b, a) }]);
    const f = new Floor(lv);
    const an = f.add({ kind: 'anvil' });
    f.wire(f.given('h'), an, 'a'); f.wire(f.given('k'), an, 'b');
    expect(reason(f.compile(), an)).toBe('a contradiction needs one equation and one inequation; both inlets carry equations');
  });

  it('Meet accepts its two equations in either inlet (output follows inlet order)', () => {
    const lv = order(eq(a, a), [{ id: 'h', fact: eq(a, c) }, { id: 'k', fact: eq(b, c) }]);
    const f = new Floor(lv);
    const m1 = f.add({ kind: 'meet' }), m2 = f.add({ kind: 'meet' });
    f.wire(f.given('h'), m1, 'a'); f.wire(f.given('k'), m1, 'b');
    f.wire(f.given('h'), m2, 'b'); f.wire(f.given('k'), m2, 'a');
    const comp = f.compile();
    expect(txt(comp, m1, lv)).toBe('a = b');
    expect(txt(comp, m2, lv)).toBe('b = a');
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
    expect(sw.k).toBe('step');
    expect(comp.check.nodes[sw.id]!.fact).toEqual(eq(b, a));
    expect(f.run().s.delivered.s).toBeDefined();
  });

  it('wrong shipment jams the dock; the jam is explained; downstream starves with a causal link', () => {
    const f = new Floor(LEVEL_BY_ID.L01!);
    const spool = f.c.machines.find((m) => m.kind === 'spool')!.id;
    const can = f.add({ kind: 'canceller', target: { k: 'pin', side: 'r', selected: P(b, I(b)), neighbours: { left: [], right: [], leftEdge: false, rightEdge: false }, ancestors: [] }, tidy: true });
    f.wire(spool, can); f.wire(can, f.socket());
    const comp = f.compile();
    expect(reason(comp, can)).toBe('no bb⁻¹ here: the incoming right side is a⁻¹ab');
    expect(status(comp, f.socket()).k).toBe('starved');
    expect(F.rootCause(comp, f.socket())).toBe(can);
    expect(comp.solvable).toBe(false);
    // the dock itself refuses a wrong statement
    const g = new Floor(LEVEL_BY_ID.L01!);
    g.wire(g.c.machines.find((m) => m.kind === 'spool')!.id, g.socket());
    const c2 = g.compile();
    expect(reason(c2, g.socket())).toBe('this dock needs a⁻¹ab = b, but the belt delivers a⁻¹ab = a⁻¹ab');
    const { s } = g.run(60);
    expect(s.delivered.s).toBeUndefined();
    expect(s.live[g.socket()]).toBe('jammed');
  });

  it('forbidden dependency at the dock is rejected even with the right formula', () => {
    const lv = order(eq(a, b), [{ id: 'h', fact: eq(a, b) }]);
    lv.sockets[0]!.allowedGivens = [];
    const f = new Floor(lv);
    f.wire(f.given('h'), f.socket());
    const comp = f.compile();
    expect(comp.solvable).toBe(false);
    expect(reason(comp, f.socket())).toContain('still relies on given h');
  });

  it('a feedback loop is a jam, not an infinite word', () => {
    const lv = order(eq(a, b));
    const f = new Floor(lv);
    const j = f.add({ kind: 'joiner' });
    const iv = f.add({ kind: 'inverter' });
    f.wire(j, iv); f.wire(iv, j, 'a');
    const comp = f.compile();
    expect(reason(comp, j)).toContain('circular');
    expect(reason(comp, iv)).toContain('circular');
  });
});

describe('scope from geometry', () => {
  it('a fact made inside a room cannot leave on a belt; it leaves only through the gate', () => {
    const lv = order(neq(P(a, b), b), [{ id: 'n', fact: neq(a, E) }]);
    const f = new Floor(lv);
    const { room, desk, gate } = f.room({ x: 14, y: 2, w: 16, h: 8 }, 'suppose', P(a, b), b);
    // leak: desk straight to a root Multiplier
    const mu = f.add({ kind: 'multiplier', side: 'right', t: knob(I(b)) }, { x: 34, y: 14 });
    const leak = f.wire(desk, mu);
    let comp = f.compile();
    expect(comp.beltErrors[leak]).toBe('ab = b still depends on the supposition ab = b — it can only leave the room through the room’s gate');
    expect(status(comp, mu).k).toBe('jammed');
    expect(reason(comp, mu)).toContain('still depends on the supposition ab = b');
    expect(comp.scopeOf[desk]).toBe(room);
    // the proper route: inside the room, then out through the gate
    f.c = { ...f.c, belts: f.c.belts.filter((x) => x.id !== leak), machines: f.c.machines.filter((m) => m.id !== mu) };
    const m2 = f.add({ kind: 'multiplier', side: 'right', t: knob(I(b)) }, { x: 17, y: 3 });
    const k1 = f.add({ kind: 'canceller', target: F.pinFromAddr(eq(P(a, b, I(b)), P(b, I(b))), { side: 'l', path: [], range: [1, 3] })!, tidy: true }, { x: 21, y: 3 });
    const k2 = f.add({ kind: 'canceller', target: { k: 'first' }, tidy: true }, { x: 25, y: 3 });
    const an = f.add({ kind: 'anvil' }, { x: 22, y: 6 });
    f.wire(desk, m2); f.wire(m2, k1); f.wire(k1, k2); f.wire(k2, an, 'a'); f.wire(f.given('n'), an, 'b');
    f.wire(an, gate);
    // explicit path around the room (the auto-router may cut through the room's ring)
    const around = [...[5, 4, 3, 2, 1, 0, -1].map((y) => ({ x: 30, y })), ...Array.from({ length: 20 }, (_, i) => ({ x: 29 - i, y: -1 })), { x: 10, y: 0 }];
    f.wire(gate, f.socket(), 'q', around);
    comp = f.compile();
    for (const id of [m2, k1, k2, an]) expect(comp.scopeOf[id]).toBe(room);
    expect(txt(comp, k1, lv)).toBe('a = bb⁻¹');
    expect(txt(comp, k2, lv)).toBe('a = e');
    expect(comp.machines[gate]!.out).toMatchObject({ k: 'fact', fact: neq(P(a, b), b) });
    expect(comp.check.nodes[(comp.machines[gate]!.out as { node: string }).node]!.deps).toEqual(['g:n']);
    expect(comp.solvable, JSON.stringify([comp.beltErrors, comp.sockets, Object.values(comp.machines).map((r) => [r.id, r.status])])).toBe(true);
    expect(f.run().s.delivered.s).toBeDefined();
  });
});

describe('performance', () => {
  it('compiles a 30-machine canvas in well under 10 ms', () => {
    const lv = order(eq(P(a, b), P(a, b)));
    const f = new Floor(lv);
    let prev = f.add({ kind: 'spool', t: knob(P(a, b)) }, { x: 4, y: 30 });
    let n = 1;
    for (let row = 0; n < 30; row++) {
      for (let col = 0; col < 7 && n < 30; col++, n++) {
        const at = { x: 10 + col * 5 + (row % 2 ? 2 : 0), y: 30 + row * 4 };
        const kind = n % 3;
        const cfg: F.MachineConfig = kind === 1 ? { kind: 'expander', target: { k: 'first' }, insert: 'pair', x: knob(a), dir: 'fwd' }
          : kind === 2 ? { kind: 'canceller', target: { k: 'first' }, tidy: true }
            : { kind: 'swapper' };
        const id = f.add(cfg, at);
        f.wire(prev, id);
        prev = id;
      }
    }
    expect(f.c.machines.length).toBeGreaterThanOrEqual(31);
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
