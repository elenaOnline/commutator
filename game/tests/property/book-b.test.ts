// Book phase B property test (kernel lead): seeded random play with MEMBERSHIPS — subgroup axioms (products,
// inverses, conjugation at normal subgroups), the earned e ∈ S where granted, Leibniz rewrites and insert-e on the
// membership rail, membership desks in Assume rooms, Subgroup Towers and ∀ over them, plus the v4 equation moves.
//
// Every accepted node must hold in every model: a catalogue group, every (normal) subgroup for each subgroup symbol
// (plus ∅ where e ∈ S is not granted — P5.1's closed subsets), every element assignment satisfying its deps.
// Every pallet is ground, every card binds what it mentions, and every saved-eligible card is closed.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { Player, mkCtx } from '../../src/kernel/testkit';
import { oracleCheck } from '../../src/groups/oracle';
import type { Fact, NodeId, Offer, ProofNode, Term } from '../../src/kernel/types';

function rng(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
}
const long = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.LONG === '1';
const AX: K.AxiomId[] = ['unitL', 'unitR', 'invL', 'invR'];

describe('Book phase B: random play with memberships (finite-group soundness)', () => {
  const configs = [
    { name: 'with e ∈ S granted', seed: 0x5ab1, schemas: ['sub.e', 'sub.pow', 'socks'] },
    { name: 'closed subsets (P5.1: no e ∈ S)', seed: 0x9e37, schemas: [] as string[] },
    { name: 'two normal subgroups', seed: 0x2c1d, schemas: ['sub.e'], normal: true },
  ];
  for (const cf of configs) {
    it(cf.name, () => {
      const ctx = mkCtx({
        subgroups: [{ id: 'H', label: 'H', normal: !!cf.normal }, { id: 'N', label: 'N', normal: true }],
        givens: [
          { id: 'ga', name: 'ga', fact: { k: 'mem', t: K.atom('a'), sub: { k: 'sub', id: 'H' } } },
          { id: 'gb', name: 'gb', fact: { k: 'mem', t: K.atom('b'), sub: { k: 'sub', id: 'N' } } },
          { id: 'gc', name: 'gc', fact: { k: 'eq', l: K.mul([K.atom('c'), K.atom('c')]), r: K.E } },
        ],
        tools: { schemas: cf.schemas },
      } as never);
      const count = long ? 1500 : 180;
      const random = rng(cf.seed);
      const coverage: Record<string, number> = {};
      const bump = (k: string) => { coverage[k] = (coverage[k] ?? 0) + 1; };
      const errors: string[] = [];
      let p = new Player(ctx);
      const subsNow = () => K.withVars(ctx, p.graph).ctx.level.subgroups ?? [];
      const letters = () => K.withVars(ctx, p.graph).ctx.level.atoms.map((x) => x.id);
      const term = (): Term => {
        const ls = letters();
        return K.mul(Array.from({ length: 1 + random(3) }, () => {
          const t = random(6) === 0 ? K.E : K.atom(ls[random(ls.length)]!);
          return random(3) === 0 ? K.inv(t) : t;
        }));
      };
      const pick = <T>(xs: T[]): T | undefined => (xs.length ? xs[random(xs.length)] : undefined);
      const nodesWith = (pred: (f: Fact) => boolean) => p.graph.nodes.filter((n) => { const f = p.fact(n.id); return !!f && pred(f); });
      let uid = 0;
      const fresh = () => `q${uid++}`;
      const tryAdd = (kind: string, node: ProofNode) => { const r = p.tryNode(node); if (r.ok) bump(kind); return r.ok; };
      const checked = new Set<string>();

      function validate() {
        const res = K.check(p.graph, ctx);
        expect(res.ok).toBe(true);
        const vx = K.withVars(ctx, p.graph);
        const fresh: typeof res.nodes = {};
        for (const [id, r] of Object.entries(res.nodes)) {
          const f = r.fact;
          if (f && (f.k === 'eq' || f.k === 'neq')) expect(K.isGround(f.l) && K.isGround(f.r)).toBe(true);
          if (f && f.k === 'mem') { expect(K.isGround(f.t)).toBe(true); expect(f.sub.k).toBe('sub'); }
          if (f && (f.k === 'law' || f.k === 'cond')) {
            for (const t of K.factTerms(f)) for (const m of K.metasOf(t)) expect(f.metas.includes(m), `${id} binds ${m}`).toBe(true);
            for (const m of K.submetasOf(f)) expect((f.binds ?? []).some((b) => b.id === m), `${id} binds ${m}`).toBe(true);
          }
          const key = JSON.stringify([f, r.deps, r.deps.map((d) => { const x = K.depRoom(d); return x ? JSON.stringify(p.graph.rooms.find((y) => y.id === x.room)) + x.slot : ''; })]);
          if (!checked.has(key)) { fresh[id] = r; checked.add(key); }
        }
        expect(oracleCheck(ctx.level, fresh, p.graph.rooms, vx.vars, vx.structs)).toEqual([]);
      }

      const newEpisode = () => {
        p = new Player(ctx);
        p.declareVar('x₁'); if (random(2)) p.declareVar('y₁');
        if (random(4)) p.declareSub('H₁', random(3) === 0);
      };
      newEpisode();
      let moves = 0, attempts = 0;
      while (moves < count && attempts++ < count * 15) {
        if (moves % 18 === 0 || p.graph.nodes.length > 40) newEpisode();
        let detail: unknown;
        try {
          const action = random(100);
          const scopes = [K.ROOT, ...p.graph.rooms.map((r) => r.id)];
          const scope = scopes[random(scopes.length)]!;
          const mems = nodesWith((f) => f.k === 'mem');
          const subs = subsNow();
          let ok = false;
          if (action < 12) {
            const k = 1 + random(3);
            const as = Array.from({ length: k }, () => (random(2)
              ? ['mem', term(), pick(subs)!.id] as ['mem', Term, string]
              : [random(3) ? 'eq' : 'neq', term(), term()] as ['eq' | 'neq', Term, Term]));
            detail = ['desks', as];
            p.openDesks(as, scope); bump(`room:${k}`); ok = true;
          } else if (action < 30 && mems.length) {
            // a subgroup axiom / schema at a random subgroup, fed random memberships
            const id = pick(['sub.mul', 'sub.inv', 'sub.conj', 'sub.e', 'sub.pow'])!;
            const sg = pick(subs)!;
            const binder = id === 'sub.conj' ? 'N' : 'H';
            const card = K.SUB_SCHEMAS[id]!.card as K.Card & { k: 'cond' };
            const ins = card.premises.map(() => pick(mems)!);
            const subst: K.Subst = {};
            card.premises.forEach((pr, i) => { if (pr.k === 'mem' && pr.t.k === 'meta') { const f = p.fact(ins[i]!.id)!; if (f.k === 'mem') subst[pr.t.id] = f.t; } });
            for (const m of card.metas) if (!subst[m]) subst[m] = m === 'n' ? K.intVal(K.polyConst(random(7) - 3)) : term();
            detail = [id, sg.id, ins.map((n) => n.id), subst];
            ok = tryAdd(id, { id: fresh(), scope: pick(ins)?.scope ?? scope, k: 'apply', rule: { k: 'schema', id }, inputs: ins.map((n) => n.id), subst, structs: { [binder]: sg.id } });
          } else if (action < 42 && mems.length) {
            // Leibniz on the membership rail: an axiom at a random span (σ by matching), or insert e
            const n = pick(mems)!;
            const f = p.fact(n.id)! as K.Pallet & { k: 'mem' };
            const w = K.word(f.t);
            if (random(3) === 0) { ok = tryAdd('mem-insertE', { id: fresh(), scope: n.scope, k: 'step', input: n.id, op: { k: 'insertE', at: { side: 'l', path: [], gap: random(w.length + 1) } } }); }
            else {
              const s0 = random(w.length), e0 = s0 + 1 + random(w.length - s0);
              const redex = e0 - s0 === 1 ? w[s0]! : { k: 'mul' as const, fs: w.slice(s0, e0) };
              const ax = pick(AX)!;
              const card = K.axiomCard(ax);
              const dir = random(2) ? 'fwd' : 'rev';
              const σ = K.match(dir === 'fwd' ? card.l : card.r, redex)[0] ?? (dir === 'rev' ? { x: term() } : undefined);
              if (!σ) continue;
              ok = tryAdd('mem-rewrite', { id: fresh(), scope: n.scope, k: 'step', input: n.id, op: { k: 'rewrite', rule: { k: 'axiom', id: ax }, dir, at: { side: 'l', path: [], range: [s0, e0] }, subst: σ } });
            }
          } else if (action < 50) {
            p.start(term(), scope); bump('start'); ok = true;
          } else if (action < 62) {
            // mostly root facts mentioning a Subgroup Tower (exits of membership rooms), so ∀ binds it
            const towers = new Set((p.graph.structs ?? []).map((x) => x.id));
            const subby = nodesWith((f) => f.k !== 'bot' && f.k !== 'size' && [...K.factSubs(f)].some((x) => towers.has(x))).filter((x) => x.scope === K.ROOT);
            const n = (random(3) && subby.length ? pick(subby) : undefined) ?? pick(nodesWith((f) => f.k !== 'bot' && f.k !== 'size'));
            if (!n) continue;
            ok = tryAdd('generalize', { id: fresh(), scope: random(3) ? n.scope : scope, k: 'generalize', input: n.id });
            if (ok) {
              const g = p.graph.nodes[p.graph.nodes.length - 1]!;
              const f = p.fact(g.id);
              if (f && (f.k === 'law' || f.k === 'cond') && f.binds?.length) bump('generalize:sub');
            }
          } else if (action < 74 && p.graph.rooms.length) {
            const room = pick(p.graph.rooms)!;
            const n = pick(nodesWith((f) => f.k === 'eq' || f.k === 'neq' || f.k === 'mem').filter((x) => x.scope === room.id));
            if (!n) continue;
            ok = tryAdd('exit', { id: fresh(), scope: room.parent, k: 'exit', room: room.id, input: n.id });
          } else if (action < 80) {
            // apply a ∀ card with subgroup parameters made on this floor, at a random subgroup
            const c = pick(nodesWith((f) => (f.k === 'cond' || f.k === 'law') && !!f.binds?.length));
            if (!c) continue;
            const f = p.fact(c.id)! as K.Card;
            const prem = f.k === 'cond' ? f.premises : [];
            const ins = prem.map(() => pick(nodesWith((x) => x.k === 'mem' || x.k === 'eq' || x.k === 'neq'))!).filter(Boolean);
            if (ins.length !== prem.length) continue;
            const subst: K.Subst = {};
            for (const m of f.metas) subst[m] = term();
            const structs = Object.fromEntries((f.binds ?? []).map((b) => [b.id, pick(subs.filter((x) => !b.normal || x.normal))?.id ?? 'H']));
            ok = tryAdd('apply-card', { id: fresh(), scope: random(2) ? c.scope : scope, k: 'apply', rule: { k: 'node', id: c.id }, inputs: ins.map((n) => n.id), subst, structs });
          } else {
            const pallets = nodesWith((f) => f.k === 'eq' || f.k === 'neq');
            const n = pick(pallets);
            if (!n) continue;
            const offers = K.offersAt(p.graph, p.res, n.id, null, ctx).filter((o) => !o.needs.length);
            const o: Offer | undefined = pick(offers);
            if (!o) continue;
            p.commitOffer(o, n.id as NodeId);
            bump(o.kind.k === 'steps' ? o.kind.ops[0]!.k : o.kind.k);
            ok = true;
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
      console.log(`book-b ${cf.name}: moves=${moves} coverage=${JSON.stringify(coverage)}`);
      expect(errors, errors.join('\n')).toEqual([]);
      expect(moves).toBe(count);
      for (const k of ['sub.mul', 'sub.inv', 'mem-rewrite', 'generalize', 'generalize:sub', 'exit']) expect(coverage[k] ?? 0, `coverage of ${k}`).toBeGreaterThan(0);
      if (cf.normal) expect(coverage['sub.conj'] ?? 0).toBeGreaterThan(0);
    }, 300_000);
  }
});
