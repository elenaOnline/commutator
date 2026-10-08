// v4 property test (kernel builder): seeded random play that mixes the v2 bench offers with the v4
// nodes — Tower variables, assume rooms (implication introduction), invert, product, ∀-introduction
// (generalize) and room exits. Random proposals may be rejected; every ACCEPTED fact must hold in every
// catalogue group under every assignment of the level's atoms and the graph's variables that satisfies
// its dependencies (src/groups/oracle.ts). A generalize accepted in breach of the eigenvariable
// condition would yield a false law here.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { Player } from '../../src/kernel/testkit';
import { LEVELS, REGISTRY } from '../../src/levels/levels';
import { oracleCheck } from '../../src/groups/oracle';
import type { Addr, GapAddr, NodeId, Offer, ProofNode, ScopeId, Term } from '../../src/kernel/types';

function rng(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
}

describe('v4 seeded random play / finite-group soundness (variables, ∀, assume, invert, product)', () => {
  for (const [index, original] of LEVELS.entries()) {
    it(original.id, () => {
      const earlier = LEVELS.slice(0, index).flatMap((l) => l.unlocks);
      const ctx: K.KernelCtx = {
        level: { ...original, tools: { ...original.tools, lift: true,
          schemas: [...new Set([...original.tools.schemas, ...earlier])].filter((id) => !original.unlocks.includes(id)) } },
        registry: REGISTRY,
      };
      const long = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.LONG === '1';
      const count = long ? 2000 : 260;
      const seed = (0x4a11f00d + index * 7919 + (long ? 0x20000 : 0)) >>> 0;
      const random = rng(seed);
      const coverage: Record<string, number> = {};
      const rejected: Record<string, number> = {};
      const errors: string[] = [];
      const checked = new Set<string>();
      const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
      let p = new Player(ctx);
      let moves = 0, attempts = 0;

      const letters = () => K.withVars(ctx, p.graph).ctx.level.atoms.map((a) => a.id);
      const term = (): Term => {
        const ls = letters();
        return K.mul(Array.from({ length: 1 + random(3) }, () => {
          const t = random(5) === 0 || !ls.length ? K.E : K.atom(ls[random(ls.length)]!);
          return random(3) === 0 ? K.inv(t) : t;
        }));
      };
      const facts = (pred: (f: K.Fact) => boolean) => p.graph.nodes.filter((n) => { const f = p.fact(n.id); return !!f && pred(f); });
      const pick = <T>(xs: T[]): T | undefined => (xs.length ? xs[random(xs.length)] : undefined);
      const fresh = () => `r${moves}_${attempts}`;
      const tryAdd = (kind: string, node: ProofNode): boolean => {
        const r = p.tryNode(node);
        if (r.ok) bump(coverage, kind); else bump(rejected, r.error?.includes("isn't arbitrary") ? `${kind}:eigen` : kind);
        return r.ok;
      };

      function validate() {
        const res = K.check(p.graph, ctx);
        expect(res.ok, `seed=${seed} move=${moves}`).toBe(true);
        const fresh: typeof res.nodes = {};
        for (const [id, r] of Object.entries(res.nodes)) {
          const hyps = r.deps.map((d) => (d.startsWith('a:') ? p.graph.rooms.find((x) => `a:${x.id}` === d) : d));
          const key = JSON.stringify([r.fact, hyps.map((h) => (typeof h === 'object' && h ? [h.kind, h.rel, h.l, h.r] : h))]);
          if (!checked.has(key)) { fresh[id] = r; checked.add(key); }
        }
        const vars = K.withVars(ctx, p.graph).vars;
        const bad = oracleCheck(ctx.level, fresh, p.graph.rooms, vars);
        expect(bad, `seed=${seed} move=${moves} graph=${JSON.stringify(p.graph)}`).toEqual([]);
      }

      const newEpisode = () => {
        p = new Player(ctx);
        const nv = 1 + random(2);
        for (let i = 0; i < nv; i++) p.declareVar(`${'xy'[i]}₁`);
      };
      newEpisode();
      validate();
      while (moves < count && attempts++ < count * 10) {
        if (moves % 20 === 0 || p.graph.nodes.length > 45) newEpisode();
        let detail: unknown;
        try {
          const scopes: ScopeId[] = [K.ROOT, ...p.graph.rooms.map((r) => r.id)];
          const scope = scopes[random(scopes.length)]!;
          const action = random(100);
          const eqs = facts((f) => f.k === 'eq');
          const pallets = facts((f) => f.k === 'eq' || f.k === 'neq');
          let ok = false;
          if (action < 10) {
            const kinds: K.Room['kind'][] = ['assume'];
            if (ctx.level.tools.suppose) kinds.push('suppose');
            if (ctx.level.tools.classical) kinds.push('classical');
            const kind = kinds[random(kinds.length)]!;
            detail = ['room', kind, scope];
            try { p.openRoom(kind, term(), term(), scope, random(2) ? 'eq' : 'neq'); bump(coverage, `room:${kind}`); ok = true; } catch { bump(rejected, 'room'); }
          } else if (action < 20 || !pallets.length) {
            detail = ['start', scope];
            p.start(term(), scope); bump(coverage, 'start'); ok = true;
          } else if (action < 30) {
            const n = pick(pallets)!;
            detail = ['invert', n.id];
            ok = tryAdd('invert', { id: fresh(), scope: n.scope, k: 'step', input: n.id, op: { k: 'invert' } });
          } else if (action < 40 && eqs.length) {
            const x = pick(eqs)!, y = pick(eqs)!;
            detail = ['product', x.id, y.id];
            ok = tryAdd('product', { id: fresh(), scope: random(2) ? x.scope : y.scope, k: 'product', inputs: [x.id, y.id] });
          } else if (action < 55) {
            const n = pick(facts((f) => f.k !== 'bot' && f.k !== 'size'));
            if (!n) continue;
            detail = ['generalize', n.id];
            ok = tryAdd('generalize', { id: fresh(), scope: random(3) ? n.scope : scope, k: 'generalize', input: n.id });
          } else if (action < 63 && p.graph.rooms.length) {
            const room = pick(p.graph.rooms)!;
            const inside = facts((f) => f.k !== 'size').filter((n) => n.scope === room.id);
            const n = pick(inside);
            if (!n) continue;
            detail = ['exit', room.id, n.id];
            ok = tryAdd(`exit:${room.kind}`, { id: fresh(), scope: room.parent, k: 'exit', room: room.id, input: n.id });
          } else {
            const n = pick(pallets)!;
            const f = p.fact(n.id)!;
            let sel: Addr | GapAddr | null = null;
            if (f.k === 'eq' && random(3)) {
              const side = random(2) ? 'l' : 'r';
              const w = K.word(f[side]).length;
              sel = random(2) ? { side, path: [], gap: random(w + 1) } : (() => { const s = random(w); return { side, path: [], range: [s, s + 1 + random(w - s)] } as Addr; })();
            }
            const offers = K.offersAt(p.graph, p.res, n.id, sel, ctx);
            let o: Offer | undefined = pick(offers);
            if (!o) continue;
            detail = { at: n.id, sel, offer: o.label };
            if (o.needs.length) {
              const zTowers = K.withVars(ctx, p.graph).ctx.level.atoms.filter((a) => a.sort === 'Z').map((a) => a.id);
              const intVal = () => {
                let q = K.polyConst(random(9) - 4);
                if (zTowers.length && random(2)) q = K.polyAdd(q, K.polyMul(K.polyConst(random(5) - 2), K.polyZvar(zTowers[random(zTowers.length)]!)));
                return K.intVal(q);
              };
              const offer0 = o;
              const filled = K.fillOffer(o, Object.fromEntries(o.needs.map((m) => [m, offer0.needSorts?.[m] === 'Z' ? intVal() : term()])), p.graph, p.res, n.id, ctx);
              // ℤ knobs can be jointly constrained (e² → (e^m)^n needs mn = 2): a refused random choice is fine
              if (!filled.ok && Object.values(offer0.needSorts ?? {}).includes('Z')) continue;
              if (!filled.ok) throw new Error(`offered fill rejected: ${filled.error}`);
              o = filled.offer;
            }
            p.commitOffer(o, n.id as NodeId);
            bump(coverage, o.kind.k === 'steps' ? o.kind.ops[0]!.k : o.kind.k);
            ok = true;
          }
          if (!ok) continue;
          moves++;
          validate();
        } catch (e) {
          errors.push(`seed=${seed} attempt=${attempts}: ${String(e)} repro=${JSON.stringify(detail)}`.slice(0, 2000));
          newEpisode();
          if (errors.length >= 3) break;
        }
      }
      console.log(`${original.id}: moves=${moves} seed=${seed} obligations=${checked.size} coverage=${JSON.stringify(coverage)} rejected=${JSON.stringify(rejected)}`);
      expect(errors, errors.join('\n')).toEqual([]);
      expect(moves).toBe(count);
      for (const k of ['generalize', 'invert', 'start']) expect(coverage[k] ?? 0, `coverage of ${k}`).toBeGreaterThan(0);
    }, 300_000);
  }
});
