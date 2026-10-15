// Book phase C property test (kernel lead): seeded random play in a MANY-SORTED level — two groups G and H, a
// homomorphism f : G → H, a plain map s : H → G with the section given f(s(y)) = y, element Towers in both groups,
// a group Tower and a Hom Tower — mixing applyMap, the hom law (rewrites at random spans), one-group axioms used in H
// (sort polymorphism), insert e (the word's own identity), lifts, inversions, products, rooms and ∀.
//
// Every accepted node must hold in every many-sorted model of its dependencies (groups/models.ts: catalogue groups,
// every hom, the section SOLVED from its given); every pallet is well-sorted; random ill-sorted proposals are refused.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { Player, mkCtx } from '../../src/kernel/testkit';
import { oracleCheck, modelLog } from '../../src/groups/oracle';
import type { Fact, ProofNode, Term } from '../../src/kernel/types';

function rng(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
}
const long = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.LONG === '1';
const AX: K.AxiomId[] = ['unitL', 'unitR', 'invL', 'invR'];
const app = (fn: string, ...args: Term[]): Term => ({ k: 'app', fn, args });

describe('Book phase C: random play with sorts and maps (many-sorted finite-model soundness)', () => {
  for (const seed of [0x7c1, 0xa5e]) {
    it(`seed ${seed.toString(16)}`, () => {
      const ctx = mkCtx({
        sorts: [{ id: 'G', kind: 'group', label: 'G' }, { id: 'H', kind: 'group', label: 'H' }],
        maps: [{ id: 'f', label: 'f', args: ['G'], res: 'H', kind: 'hom' }, { id: 's', label: 's', args: ['H'], res: 'G' }],
        atoms: [{ id: 'a', label: 'a', hue: 0 }, { id: 'b', label: 'b', hue: 1 }, { id: 'h', label: 'h', hue: 2, carrier: 'H' }],
        givens: [{ id: 'sec', name: 'sec', fact: { k: 'law', metas: ['y'], metaSorts: { y: 'H' }, l: app('f', app('s', { k: 'meta', id: 'y' })), r: { k: 'meta', id: 'y' } } }],
      } as never);
      const count = long ? 600 : 120;
      const random = rng(seed * 2654435761 >>> 0 || 7);
      const coverage: Record<string, number> = {};
      const bump = (k: string) => { coverage[k] = (coverage[k] ?? 0) + 1; };
      const errors: string[] = [];
      let p = new Player(ctx);
      const pick = <T>(xs: T[]): T | undefined => (xs.length ? xs[random(xs.length)] : undefined);
      const atomsOf = (s: string) => K.withVars(ctx, p.graph).ctx.level.atoms.filter((x) => (x.carrier ?? 'G') === s && x.sort !== 'Z').map((x) => x.id);
      const termIn = (s: string, depth = 0): Term => {
        const as = atomsOf(s);
        return K.mul(Array.from({ length: 1 + random(2) }, () => {
          let t: Term;
          const r = random(6);
          if (r === 0) t = s === 'G' ? K.E : { k: 'e', s };
          else if (s === 'H' && (r === 1 || r === 2) && depth < 1) t = app(random(3) ? 'f' : (p.graph.structs?.some((x) => x.k === 'hom') ? 'k1' : 'f'), termIn('G', depth + 1));
          else if (s === 'G' && r === 1 && depth < 1) t = app('s', termIn('H', depth + 1));
          else t = K.atom(pick(as) ?? 'a');
          if (t.k === 'app' && t.fn === 'k1') t = app('k1', termIn('G', depth + 1));
          return random(3) === 0 ? K.inv(t) : t;
        }));
      };
      const nodesWith = (pred: (f: Fact) => boolean) => p.graph.nodes.filter((n) => { const f = p.fact(n.id); return !!f && pred(f); });
      let uid = 0;
      const fresh = () => `q${uid++}`;
      const tryAdd = (kind: string, node: ProofNode) => { const r = p.tryNode(node); if (r.ok) bump(kind); else { bump(`${kind}:refused`);  } return r.ok; };
      const checked = new Set<string>();
      function validate() {
        const res = K.check(p.graph, ctx);
        expect(res.ok).toBe(true);
        const vx = K.withVars(ctx, p.graph);
        const env = K.sortEnv(vx.ctx.level);
        const fresh2: typeof res.nodes = {};
        for (const [id, r] of Object.entries(res.nodes)) {
          const f = r.fact;
          if (f && (f.k === 'eq' || f.k === 'neq')) expect(() => K.checkEqSorts(f.l, f.r, env)).not.toThrow();
          const key = JSON.stringify([f, r.deps]);
          if (!checked.has(key)) { fresh2[id] = r; checked.add(key); }
        }
        expect(oracleCheck(vx.ctx.level, fresh2, p.graph.rooms, vx.vars, vx.structs)).toEqual([]);
      }
      const newEpisode = () => {
        p = new Player(ctx);
        p.graph = { ...p.graph, vars: [{ id: 'x1', label: 'x₁', hue: 0, variable: true }, { id: 'u1', label: 'u₁', hue: 1, variable: true, carrier: 'H' }],
          ...(random(2) ? { structs: [{ k: 'hom' as const, id: 'k1', label: 'k₁', dom: 'G', cod: 'H' }] } : {}) };
        p.res = K.check(p.graph, ctx);
      };
      newEpisode();
      let moves = 0, attempts = 0;
      while (moves < count && attempts++ < count * 20) {
        if (moves % 14 === 0 || p.graph.nodes.length > 30) newEpisode();
        let detail: unknown;
        try {
          const action = random(100);
          const eqs = nodesWith((f) => f.k === 'eq');
          const pals = nodesWith((f) => f.k === 'eq' || f.k === 'neq');
          let ok = false;
          if (action < 18 || !pals.length) {
            const t = termIn(random(2) ? 'G' : 'H');
            detail = ['start', t];
            ok = tryAdd('start', { id: fresh(), scope: K.ROOT, k: 'start', term: t });
          } else if (action < 30) {
            const n = pick(eqs); if (!n) continue;
            const fn = random(3) || !p.graph.structs?.length ? (random(2) ? 'f' : 's') : 'k1';
            ok = tryAdd('applyMap', { id: fresh(), scope: n.scope, k: 'step', input: n.id, op: { k: 'applyMap', fn } });
          } else if (action < 62) {
            // a rewrite at a random span: an axiom (sort-polymorphic), the hom law at f / k₁, or the section given
            const n = pick(eqs); if (!n) continue;
            const f = p.fact(n.id) as K.Pallet & { k: 'eq' };
            const side = random(2) ? 'l' : 'r';
            const rail = f[side];
            // find a random word inside the rail (root or inside a map argument)
            const words: { path: number[]; w: Term[] }[] = [];
            const visit = (t: Term, path: number[]) => {
              words.push({ path, w: K.word(t) });
              K.word(t).forEach((x, i) => { const pp = t.k === 'mul' ? [...path, i] : path; if (x.k === 'app') x.args.forEach((a, j) => visit(a, [...pp, j])); if (x.k === 'inv') visit(x.arg, [...pp, 0]); });
            };
            visit(rail, []);
            const wd = pick(words)!;
            const s0 = random(wd.w.length), e0 = s0 + 1 + random(wd.w.length - s0);
            const redex = e0 - s0 === 1 ? wd.w[s0]! : { k: 'mul' as const, fs: wd.w.slice(s0, e0) };
            const which = [0, 1, 1, 2][random(4)]!; // the hom law twice as often: it rarely fits
            const dir: 'fwd' | 'rev' = random(2) ? 'fwd' : 'rev';
            let rule: K.RuleRef, card: K.Card, structs: Record<string, string> | undefined;
            if (which === 0) { const ax = pick(AX)!; rule = { k: 'axiom', id: ax }; card = K.axiomCard(ax); }
            else if (which === 1) { rule = { k: 'schema', id: 'hom.mul' }; structs = { f: random(2) || !p.graph.structs?.length ? 'f' : 'k1' }; card = K.MAP_SCHEMAS['hom.mul']!.card; }
            else { rule = { k: 'node', id: 'g:sec' }; card = ctx.level.givens[0]!.fact as K.Card; }
            let src = card.k === 'law' ? (dir === 'fwd' ? card.l : card.r) : K.E;
            if (structs) src = K.mapsOf(src).length ? JSON.parse(JSON.stringify(src).replaceAll('"fn":"f"', `"fn":"${structs.f}"`)) : src;
            if (which === 0) { try { src = K.retagE(src, K.sortOf(K.norm(redex), K.sortEnv(K.withVars(ctx, p.graph).ctx.level))); } catch { continue; } }
            let at = { path: wd.path, range: [s0, e0] as [number, number] };
            let node = n, sideU: 'l' | 'r' = side;
            let σ = K.match(src, redex)[0] ?? (dir === 'rev' && which === 0 ? { x: termIn(random(2) ? 'G' : 'H') } : undefined);
            if (!σ || (which === 0 && random(2))) {
              // the hom law / the section rarely fit a random span: look for every span they fit on the floor, pick one
              const fits: { node: typeof n; side: 'l' | 'r'; path: number[]; range: [number, number]; σ: K.Subst }[] = [];
              for (const nn of eqs) for (const sd of ['l', 'r'] as const) {
                const ws: { path: number[]; w: Term[] }[] = [];
                const vis = (t: Term, path: number[]) => {
                  ws.push({ path, w: K.word(t) });
                  K.word(t).forEach((x, i) => { const pp = t.k === 'mul' ? [...path, i] : path; if (x.k === 'app') x.args.forEach((a, j) => vis(a, [...pp, j])); if (x.k === 'inv') vis(x.arg, [...pp, 0]); });
                };
                vis((p.fact(nn.id) as K.Pallet & { k: 'eq' })[sd], []);
                for (const w2 of ws) for (let i = 0; i < w2.w.length; i++) for (let j = i + 1; j <= w2.w.length; j++) {
                  const rx = j - i === 1 ? w2.w[i]! : { k: 'mul' as const, fs: w2.w.slice(i, j) };
                  let src2 = src;
                  if (which === 0) { try { src2 = K.norm(K.retagE(card.k === 'law' ? (dir === 'fwd' ? card.l : card.r) : K.E, K.sortOf(K.norm(rx), K.sortEnv(K.withVars(ctx, p.graph).ctx.level)))); } catch { continue; } }
                  const m0 = K.match(src2, rx)[0];
                  if (m0) fits.push({ node: nn, side: sd, path: w2.path, range: [i, j], σ: m0 });
                }
              }
              const pickd = pick(fits);
              if (pickd) { at = { path: pickd.path, range: pickd.range }; σ = pickd.σ; node = pickd.node; sideU = pickd.side; }
            }
            if (!σ) continue;
            detail = ['rewrite', rule, dir, side, at, σ, structs];
            ok = tryAdd(`rewrite:${rule.k === 'axiom' ? 'axiom' : rule.k === 'schema' ? 'hom' : 'section'}`,
              { id: fresh(), scope: node.scope, k: 'step', input: node.id, op: { k: 'rewrite', rule, dir, at: { side: sideU, path: at.path, range: at.range }, subst: σ, ...(structs ? { structs } : {}) } });
          } else if (action < 70) {
            const n = pick(eqs); if (!n) continue;
            const f = p.fact(n.id) as K.Pallet & { k: 'eq' };
            const w = K.word(f.l);
            ok = tryAdd('insertE', { id: fresh(), scope: n.scope, k: 'step', input: n.id, op: { k: 'insertE', at: { side: 'l', path: [], gap: random(w.length + 1) } } });
          } else if (action < 76) {
            const n = pick(eqs); if (!n) continue;
            ok = tryAdd('lift', { id: fresh(), scope: n.scope, k: 'step', input: n.id, op: { k: 'lift', side: random(2) ? 'left' : 'right', term: termIn(random(2) ? 'G' : 'H') } });
          } else if (action < 82) {
            const n = pick(pals); if (!n) continue;
            ok = tryAdd(random(2) ? 'invert' : 'swap', { id: fresh(), scope: n.scope, k: 'step', input: n.id, op: { k: random(2) ? 'invert' : 'swap' } });
          } else if (action < 86) {
            const x = pick(eqs), y = pick(eqs); if (!x || !y) continue;
            ok = tryAdd('product', { id: fresh(), scope: K.ROOT, k: 'product', inputs: [x.id, y.id] });
          } else if (action < 92) {
            const s = random(2) ? 'G' : 'H';
            detail = ['room'];
            p.openDesks([['eq', termIn(s), termIn(s)]]); bump('room'); ok = true;
          } else if (action < 96 && p.graph.rooms.length) {
            const room = pick(p.graph.rooms)!;
            const n = pick(pals.filter((x) => x.scope === room.id)); if (!n) continue;
            ok = tryAdd('exit', { id: fresh(), scope: room.parent, k: 'exit', room: room.id, input: n.id });
          } else {
            const n = pick(nodesWith((f) => f.k !== 'bot' && f.k !== 'size')); if (!n) continue;
            ok = tryAdd('generalize', { id: fresh(), scope: n.scope, k: 'generalize', input: n.id });
          }
          if (!ok) continue;
          moves++;
          validate();
        } catch (e) {
          errors.push(`attempt=${attempts}: ${String(e)} repro=${JSON.stringify(detail)}`.slice(0, 2000));
          newEpisode();
          if (errors.length >= 3) break;
        }
      }
      console.log(`book-c ${seed.toString(16)}: moves=${moves} coverage=${JSON.stringify(coverage)} bounded=${JSON.stringify(modelLog)}`);
      expect(errors, errors.join('\n')).toEqual([]);
      expect(moves).toBe(count);
      for (const k of ['applyMap', 'rewrite:hom', 'rewrite:axiom', 'insertE', 'generalize']) expect(coverage[k] ?? 0, `coverage of ${k}`).toBeGreaterThan(0);
    }, 600_000);
  }
});
