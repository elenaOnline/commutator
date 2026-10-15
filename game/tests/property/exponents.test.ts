// v4 Phase B property tests (kernel builder): exact exponent arithmetic, the imported power library in
// every catalogue group, and seeded random play where every ACCEPTED fact (offers with random integer
// knobs, raw random substitutions, generalize, assume exits) must hold in the finite-model oracle with
// ℤ Towers ranging over −6..6. A kernel acceptance the oracle refutes is a soundness bug.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { Player, mkCtx } from '../../src/kernel/testkit';
import { oracleCheck } from '../../src/groups/oracle';
import type { Addr, Card, GapAddr, Offer, Poly, StepOp, Term, ZRef } from '../../src/kernel/types';

function rng(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
}
const ALL = ['power.add', 'power.multiply', 'power.zero', 'power.one', 'power.identity', 'power.inverseBase', 'power.negate', 'power.conjugate', 'power.literal'];

describe('exact exponent arithmetic agrees with BigInt evaluation', () => {
  it('ring operations, powers and substitution', () => {
    const random = rng(0xe1e1);
    const refs: ZRef[] = [{ k: 'zvar', id: 'n' }, { k: 'zvar', id: 'k' }, { k: 'zmeta', id: 'M' }];
    const poly = (): Poly => {
      let p: Poly = [];
      for (let i = 0; i < 1 + random(4); i++) {
        const mono = refs.filter(() => random(2)).map((ref) => ({ ref, degree: 1 + random(3) }));
        const big = random(5) === 0 ? (BigInt(random(1e9)) * 10n ** 30n).toString() : String(random(41) - 20);
        p = K.polyAdd(p, [{ coefficient: big, monomial: mono }]);
      }
      return p;
    };
    for (let t = 0; t < 400; t++) {
      const vals = new Map<string, bigint>(refs.map((r) => [r.id, BigInt(random(2001) - 1000) * (random(4) === 0 ? 10n ** 25n : 1n)]));
      const ev = (p: Poly) => K.polyEval(p, (r) => vals.get(r.id)!);
      const p = poly(), q = poly();
      expect(ev(K.polyAdd(p, q))).toBe(ev(p) + ev(q));
      expect(ev(K.polySub(p, q))).toBe(ev(p) - ev(q));
      expect(ev(K.polyMul(p, q))).toBe(ev(p) * ev(q));
      expect(ev(K.polyNeg(p))).toBe(-ev(p));
      const k = random(4);
      expect(ev(K.polyPowNat(p, k))).toBe(ev(p) ** BigInt(k));
      expect(K.polyEq(K.polyNorm([...p].reverse()), p)).toBe(true); // canonical form is order-independent
      expect(K.polyEq(K.polyMul(p, q), K.polyMul(q, p))).toBe(true);
    }
  });
});

describe('the imported power library holds in every catalogue group', () => {
  it('power.* and literal(1..6), as laws over G and ℤ (−6..6)', () => {
    const level = mkCtx().level;
    const cards: Record<string, Card> = {};
    for (const [id, sc] of Object.entries(K.POWER_SCHEMAS)) cards[id] = sc.card;
    for (let r = 1; r <= 6; r++) cards[`literal${r}`] = K.powerLiteralSchema(BigInt(r)).card;
    const nodes = Object.fromEntries(Object.entries(cards).map(([id, f]) => [id, { ok: true, fact: f, deps: [] }]));
    expect(oracleCheck(level, nodes, [])).toEqual([]);
    // and a deliberately false "import" is refuted (the oracle can see a bad law)
    const x = K.meta('x'), y = K.meta('y'), n = K.polyZmeta('n');
    const distribute: Card = { k: 'law', metas: ['x', 'y', 'n'], l: K.power(K.mul([x, y]), n), r: K.mul([K.power(x, n), K.power(y, n)]) };
    expect(oracleCheck(level, { bad: { ok: true, fact: distribute, deps: [] } }, []).length).toBe(1);
  });
});

describe('seeded random play with powers / finite-group soundness', () => {
  for (const seed0 of [1, 2, 3, 4]) {
    it(`episode set ${seed0}`, () => {
      const random = rng(0x5eed0000 + seed0 * 7919);
      const ctx = mkCtx({ atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }], tools: { schemas: ALL } });
      const checked = new Set<string>();
      const coverage: Record<string, number> = {};
      const bump = (k: string) => { coverage[k] = (coverage[k] ?? 0) + 1; };
      let accepted = 0;
      for (let ep = 0; ep < 10; ep++) {
        const p = new Player(ctx);
        const n1 = p.declareInt('n₁');
        const x1 = p.declareVar('x₁');
        const vctx = () => K.withVars(ctx, p.graph).ctx;
        const ints = (): Poly => {
          const c = K.polyConst(random(9) - 4);
          return random(2) ? K.polyAdd(c, K.polyMul(K.polyConst(random(5) - 2), K.polyZvar(n1))) : c;
        };
        const gterm = (depth = 0): Term => {
          const r = random(depth > 1 ? 3 : 6);
          const leaf = [K.atom('a'), K.atom('b'), K.atom(x1)][random(3)]!;
          if (r === 0) return K.E;
          if (r <= 2) return random(4) ? leaf : K.inv(leaf);
          if (r === 3) return random(3) ? K.power(gterm(depth + 1), ints()) : K.power(K.power(gterm(depth + 1), ints()), ints());
          if (r === 4) return K.mul([gterm(depth + 1), gterm(depth + 1)]);
          return K.inv(gterm(depth + 1));
        };
        const validate = () => {
          const fresh: typeof p.res.nodes = {};
          for (const [id, r] of Object.entries(p.res.nodes)) {
            const hyps = r.deps.map((d) => (d.startsWith('a:') ? p.graph.rooms.find((x) => `a:${x.id}` === d) : d));
            const key = JSON.stringify([r.fact, hyps.map((h) => (typeof h === 'object' && h ? [h.kind, h.rel, h.l, h.r] : h))]);
            if (!checked.has(key)) { fresh[id] = r; checked.add(key); }
          }
          const bad = oracleCheck(ctx.level, fresh, p.graph.rooms, K.withVars(ctx, p.graph).vars);
          expect(bad, JSON.stringify(p.graph)).toEqual([]);
        };
        if (random(3) === 0) p.openRoom('assume', gterm(), gterm(), K.ROOT, random(2) ? 'eq' : 'neq');
        for (let move = 0; move < 30; move++) {
          const pallets = p.graph.nodes.filter((nd) => { const f = p.fact(nd.id); return f && (f.k === 'eq' || f.k === 'neq'); });
          const scopes = [K.ROOT, ...p.graph.rooms.map((r) => r.id)];
          const act = random(10);
          if (act < 2 || !pallets.length) { p.start(gterm(), scopes[random(scopes.length)]!); bump('start'); accepted++; validate(); continue; }
          const nd = pallets[random(pallets.length)]!;
          const f = p.fact(nd.id) as K.Pallet & { k: 'eq' | 'neq' };
          if (act === 2) {
            const r = p.tryNode({ scope: nd.scope, k: 'generalize', input: nd.id });
            if (r.ok) { bump('generalize'); accepted++; validate(); }
            continue;
          }
          if (act === 3 && p.graph.rooms.length) {
            const room = p.graph.rooms[random(p.graph.rooms.length)]!;
            const inside = pallets.filter((x) => x.scope === room.id);
            if (inside.length) {
              const r = p.tryNode({ scope: room.parent, k: 'exit', room: room.id, input: inside[random(inside.length)]!.id });
              if (r.ok) { bump('exit'); accepted++; validate(); }
            }
            continue;
          }
          // a selection anywhere, including inside power bases
          const sels: (Addr | GapAddr | null)[] = [null];
          const walk = (side: 'l' | 'r', t: Term, path: number[]) => {
            const w = K.word(t);
            for (let s = 0; s < w.length; s++) for (let e2 = s + 1; e2 <= w.length; e2++) sels.push({ side, path, range: [s, e2] });
            w.forEach((x, i) => { const fp = t.k === 'mul' ? [...path, i] : path; if (x.k === 'inv') walk(side, x.arg, [...fp, 0]); if (x.k === 'pow') walk(side, x.base, [...fp, 0]); });
          };
          if (f.k === 'eq') { walk('l', f.l, []); walk('r', f.r, []); }
          const sel = sels[random(sels.length)]!;
          if (act < 6) {
            // offers, with random integer knobs
            const offers = K.offersAt(p.graph, p.res, nd.id, sel, ctx);
            let o: Offer | undefined = offers[random(Math.max(1, offers.length))];
            if (!o) continue;
            if (o.needs.length) {
              const card = o.kind.k === 'steps' && o.kind.ops.find((op) => op.k === 'rewrite');
              const o0 = o;
              const vals = Object.fromEntries(o.needs.map((m) => [m, o0.needSorts?.[m] === 'Z' ? K.intVal(ints()) : gterm()]));
              void card;
              const filled = K.fillOffer(o, vals, p.graph, p.res, nd.id, ctx);
              if (!filled.ok) continue; // a wrongly-sorted random knob is refused: fine
              o = filled.offer;
            }
            p.commitOffer(o, nd.id);
            bump(o.kind.k === 'steps' ? `offer:${o.kind.ops[0]!.k === 'rewrite' && o.kind.ops[0]!.rule.k === 'schema' ? o.kind.ops[0]!.rule.id.replace(/:\d+$/, '') : o.kind.ops[0]!.k}` : `offer:${o.kind.k}`);
            accepted++; validate();
            continue;
          }
          // raw rewrites: match the law at the selection, fill knobs/unbound metas at random; accepted ⟹ true
          if (!sel || !('range' in sel)) continue;
          const redex = K.termAt(f, sel);
          if (!redex) continue;
          const ids = [...ALL.filter((x) => x !== 'power.literal'), `power.literal:${1 + random(4)}`];
          const id = ids[random(ids.length)]!;
          const mirror = random(4) === 0 && id === 'power.conjugate';
          const card0 = K.powerSchema(id)!.card as Card & { k: 'law' };
          const card = (mirror ? K.mirrorCard(card0) : card0) as Card & { k: 'law' };
          const dir = random(2) ? 'fwd' : 'rev';
          const cands = K.matchOpen(dir === 'fwd' ? card.l : card.r, redex);
          const subst: Record<string, Term> = { ...(cands[random(Math.max(1, cands.length))] ?? {}) };
          for (const m of card.metas) {
            if (subst[m]) continue;
            const isZ = JSON.stringify(card).includes(`"zmeta","id":"${m}"`);
            subst[m] = isZ ? K.intVal(ints()) : gterm();
          }
          const op: StepOp = { k: 'rewrite', rule: { k: 'schema', id, ...(mirror ? { mirror: true } : {}) }, dir, at: sel, subst };
          const r = p.tryNode({ scope: nd.scope, k: 'step', input: nd.id, op });
          if (r.ok) { bump(`raw:${id.replace(/:\d+$/, '')}`); accepted++; validate(); }
          void vctx;
        }
      }
      console.log(`exponents set ${seed0}: accepted=${accepted} obligations=${checked.size} coverage=${JSON.stringify(coverage)}`);
      expect(accepted).toBeGreaterThan(50);
    }, 300_000);
  }
});

describe('every imported law: random true instances are accepted, perturbed knobs refused', () => {
  it('instances over G terms and ℤ polynomials with Towers', () => {
    const random = rng(0xc0ffee);
    const ctx = mkCtx({ atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }], tools: { schemas: ALL } });
    const p = new Player(ctx);
    const n1 = p.declareInt('n₁'), k1 = p.declareInt('k₁');
    const vctx = K.withVars(ctx, p.graph).ctx;
    const ints = (): Poly => {
      let q = K.polyConst(random(11) - 5);
      if (random(2)) q = K.polyAdd(q, K.polyMul(K.polyConst(random(5) - 2), K.polyZvar(n1)));
      if (random(3) === 0) q = K.polyAdd(q, K.polyMul(K.polyZvar(n1), K.polyZvar(k1)));
      return q;
    };
    const gterm = (): Term => {
      const leaves = [K.atom('a'), K.atom('b'), K.E, K.inv(K.atom('a'))];
      const w = Array.from({ length: 1 + random(2) }, () => (random(4) === 0 ? K.power(leaves[random(4)]!, ints()) : leaves[random(4)]!));
      return K.mul(w);
    };
    const tally: Record<string, [number, number]> = {};
    const nodes: Record<string, { ok: boolean; fact: K.Fact; deps: string[] }> = {};
    for (let t = 0; t < 600; t++) {
      const ids = [...ALL.filter((x) => x !== 'power.literal'), `power.literal:${1 + random(5)}`];
      const id = ids[random(ids.length)]!;
      const mirror = id === 'power.conjugate' && random(2) === 0;
      const card0 = K.powerSchema(id)!.card as Card & { k: 'law' };
      const card = (mirror ? K.mirrorCard(card0) : card0) as Card & { k: 'law' };
      const subst: Record<string, Term> = {};
      for (const m of card.metas) subst[m] = JSON.stringify(card).includes(`"zmeta","id":"${m}"`) ? K.intVal(ints()) : gterm();
      const dir = random(2) ? 'fwd' : 'rev';
      const src = K.instantiate(dir === 'fwd' ? card.l : card.r, subst);
      const pallet: K.Pallet = { k: 'eq', l: src, r: src };
      const op: StepOp = { k: 'rewrite', rule: { k: 'schema', id, ...(mirror ? { mirror: true } : {}) }, dir, at: { side: 'r', path: [], range: [0, K.word(src).length] }, subst };
      const r = K.evalStep(pallet, op, vctx);
      expect(r.ok, `${id} ${dir} ${JSON.stringify(subst)} ${r.ok ? '' : r.error}`).toBe(true);
      if (r.ok) nodes[`n${t}`] = { ok: true, fact: r.pallet, deps: [] };
      // perturb one ℤ knob: accepted only if the instance happens to coincide
      const zs = card.metas.filter((m) => subst[m]!.k === 'int');
      if (zs.length) {
        const m = zs[random(zs.length)]!;
        const bad = { ...subst, [m]: K.intVal(K.polyAdd((subst[m] as { val: Poly }).val, K.polyConst(1 + random(3)))) };
        const r2 = K.evalStep(pallet, { ...op, subst: bad } as StepOp, vctx);
        const coincide = K.termEq(K.instantiate(dir === 'fwd' ? card.l : card.r, bad), src);
        expect(r2.ok).toBe(coincide);
      }
      const key = id.replace(/:\d+$/, '');
      tally[key] = [(tally[key]?.[0] ?? 0) + 1, 0];
    }
    const vars = K.withVars(ctx, p.graph).vars;
    expect(oracleCheck(ctx.level, nodes, [], vars)).toEqual([]);
    for (const id of ['power.add', 'power.multiply', 'power.conjugate', 'power.negate', 'power.inverseBase', 'power.identity', 'power.zero', 'power.one', 'power.literal']) expect(tally[id]?.[0] ?? 0, id).toBeGreaterThan(20);
  }, 300_000);
});
