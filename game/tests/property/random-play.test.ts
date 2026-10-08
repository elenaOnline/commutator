import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { Player } from '../../src/kernel/testkit';
import { LEVELS, REGISTRY } from '../../src/levels/levels';
import { oracleCheck } from '../../src/groups/oracle';
import type { Addr, GapAddr, Term, Offer } from '../../src/kernel/types';

// Reproducible PRNG; LONG explores fresh seeds as well as longer campaigns.
function rng(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
}
function term(random: (n: number) => number, letters: string[]): Term {
  return K.mul(Array.from({ length: 1 + random(3) }, () => {
    const t = random(5) === 0 ? K.E : K.atom(letters[random(letters.length)]!);
    return random(3) === 0 ? K.inv(t) : t;
  }));
}
function selection(random: (n: number) => number, fact: K.Fact): Addr | GapAddr | null {
  if (fact.k !== 'eq' || random(3) === 0) return null;
  const side = random(2) ? 'l' : 'r';
  let t = fact[side];
  const path: number[] = [];
  while (random(3) === 0 && (t.k === 'inv' || t.k === 'mul')) {
    const i = t.k === 'inv' ? 0 : random(t.fs.length);
    path.push(i); t = t.k === 'inv' ? t.arg : t.fs[i]!;
  }
  const n = K.word(t).length;
  if (random(2)) return { side, path, gap: random(n + 1) };
  const start = random(n);
  return { side, path, range: [start, start + 1 + random(n - start)] };
}

describe('seeded random player / finite-group soundness', () => {
  for (const [index, original] of LEVELS.entries()) {
    it(original.id, () => {
      const began = performance.now();
      // Earlier earned cards are made available, but never this level's reward.
      const earlier = LEVELS.slice(0, index).flatMap(l => l.unlocks);
      const ctx: K.KernelCtx = { level: { ...original, tools: { ...original.tools,
        schemas: [...new Set([...original.tools.schemas, ...earlier])].filter(id => !original.unlocks.includes(id)),
      } }, registry: REGISTRY };
      const long = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.LONG === '1';
      const count = long ? 6000 : 1500;
      const seed = (0x51a7c0de + index * 997 + (long ? 0x10000 : 0)) >>> 0;
      const random = rng(seed);
      const letters = original.atoms.map(a => a.id);
      const checked = new Set<string>();
      const errors: string[] = [];
      const coverage: Record<string, number> = {};
      let p = new Player(ctx), moves = 0, attempts = 0;
      function validate() {
        const res = K.check(p.graph, ctx);
        expect(res.ok, `seed=${seed} move=${moves} graph=${JSON.stringify(p.graph)}`).toBe(true);
        const fresh: typeof res.nodes = {};
        for (const [id, result] of Object.entries(res.nodes)) {
          const hypotheses = result.deps.map(d => d.startsWith('a:')
            ? p.graph.rooms.find(r => `a:${r.id}` === d) : d);
          // Room names are immaterial: cache by kind, sides and parent hypotheses.
          const key = JSON.stringify([result.fact, hypotheses.map(h => typeof h === 'object' && h
            ? [h.kind, h.l, h.r] : h)]);
          if (!checked.has(key)) { fresh[id] = result; checked.add(key); }
        }
        const bad = oracleCheck(ctx.level, fresh, p.graph.rooms);
        expect(bad, `seed=${seed} move=${moves} graph=${JSON.stringify(p.graph)}`).toEqual([]);
      }
      validate();
      while (moves < count && attempts++ < count * 8) {
        // Short independent episodes bound graph/word growth, preserving branching
        // and nested rooms inside each episode. Nothing is removed before checking.
        if (moves % 24 === 0 || p.graph.nodes.length > 65) p = new Player(ctx);
        let detail: unknown;
        try {
          const scopes = [K.ROOT, ...p.graph.rooms.map(r => r.id)];
          const scope = scopes[random(scopes.length)]!;
          const action = random(100);
          const sizes = p.graph.nodes.filter(n => p.fact(n.id)?.k === 'size');
          if (action < 9 && (ctx.level.tools.suppose || ctx.level.tools.classical)) {
            const kinds: ('suppose' | 'classical')[] = [];
            if (ctx.level.tools.suppose) kinds.push('suppose');
            if (ctx.level.tools.classical) kinds.push('classical');
            detail = ['room', scope];
            p.openRoom(kinds[random(kinds.length)]!, term(random, letters), term(random, letters), scope);
            coverage.room = (coverage.room ?? 0) + 1;
          } else if (action < 15 && ctx.level.tools.press && sizes.length) {
            const at = sizes[random(sizes.length)]!.id;
            detail = ['press', at]; p.press(at); coverage.press = (coverage.press ?? 0) + 1;
          } else if (action < 25 || !p.graph.nodes.some(n => ['eq', 'neq'].includes(p.fact(n.id)?.k ?? ''))) {
            const t = term(random, letters); detail = ['start', scope, t];
            p.start(t, scope); coverage.start = (coverage.start ?? 0) + 1;
          } else {
            const candidates = p.graph.nodes.filter(n => ['eq', 'neq'].includes(p.fact(n.id)?.k ?? ''));
            const at = candidates[random(candidates.length)]!.id;
            const sel = selection(random, p.fact(at)!);
            const offers = K.offersAt(p.graph, p.res, at, sel, ctx);
            if (!offers.length) continue;
            let offer: Offer = offers[random(offers.length)]!;
            const values = Object.fromEntries(offer.needs.map(m => [m, term(random, letters)]));
            detail = { at, sel, offer, values, graph: p.graph };
            if (offer.needs.length) {
              const filled = K.fillOffer(offer, values, p.graph, p.res, at, ctx);
              if (!filled.ok) throw new Error(`offered fill rejected: ${filled.error}`);
              offer = filled.offer;
            }
            p.commitOffer(offer, at);
            const category = offer.kind.k === 'steps' ? offer.kind.ops[0]!.k : offer.kind.k;
            coverage[category] = (coverage[category] ?? 0) + 1;
          }
          moves++; validate();
        } catch (e) {
          errors.push(`seed=${seed} attempt=${attempts}: ${String(e)} repro=${JSON.stringify(detail)}`);
          p = new Player(ctx);
          // Keep exploring after the first failure; report bounded reproducible evidence.
          if (errors.length >= 3) break;
        }
      }
      console.log(`${original.id}: moves=${moves} seed=${seed} oracleObligations=${checked.size} ms=${Math.round(performance.now() - began)} coverage=${JSON.stringify(coverage)}`);
      expect(errors, errors.join('\n')).toEqual([]);
      expect(moves).toBe(count);
    }, 180_000);
  }
});
