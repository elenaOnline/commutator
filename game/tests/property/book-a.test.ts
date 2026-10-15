// Book phase A property test (kernel lead): seeded random play with MULTI-DESK Assume rooms mixed into the v4
// moves, plus OPEN DOCKS punched out of every accepted fact.
//
// Every accepted node must hold in every catalogue group under every assignment satisfying its dependencies
// (per-desk deps 'a:<room>/<i>' resolve to that desk's assumption). Every pallet a node produces is ground and
// every card binds every meta it contains (holes never ride belts). For open docks:
//   • completeness: a hole punched out of a fact (a subterm replaced by a hole, repeated where it repeats)
//     is filled by that fact;
//   • soundness: whatever fills a random open dock, target[holes := values] IS the fact (exact for pallets,
//     up to renaming / premise order / flip for cards), every hole value obeys sort, notMentioning, the
//     Tower ban and the binder rule — re-checked here independently of fillOpen — and the instance passes
//     the oracle under the fact's dependencies.
import { describe, expect, it } from 'vitest';
import * as K from '../../src/kernel';
import { Player, mkCtx } from '../../src/kernel/testkit';
import { oracleCheck } from '../../src/groups/oracle';
import type { Addr, Card, Fact, HoleDecl, NodeId, Offer, Pallet, PatFact, ProofNode, SocketDecl, Term } from '../../src/kernel/types';

function rng(seed: number) {
  return (n: number) => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % n; };
}
const long = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.LONG === '1';

/** Every subterm position of a term (whole term, inv args, contiguous runs of a word). */
function subterms(t: Term, out: Term[] = []): Term[] {
  out.push(t);
  if (t.k === 'inv') subterms(t.arg, out);
  if (t.k === 'pow') subterms(t.base, out);
  if (t.k === 'mul') {
    for (let i = 0; i < t.fs.length; i++) for (let j = i + 1; j <= t.fs.length; j++) {
      if (j - i === t.fs.length) continue;
      const run = j - i === 1 ? t.fs[i]! : { k: 'mul' as const, fs: t.fs.slice(i, j) };
      if (j - i === 1) subterms(run, out); else out.push(run);
    }
  }
  return out;
}
/** Replace every maximal occurrence of `s` (as a factor run or whole subterm) in t by meta h. */
function punch(t: Term, s: Term, h: string): Term {
  const sw = K.word(K.norm(s));
  const go = (u: Term): Term => {
    if (K.termEq(u, s)) return { k: 'meta', id: h };
    if (u.k === 'inv') return { k: 'inv', arg: go(u.arg) };
    if (u.k === 'pow') return { k: 'pow', base: go(u.base), exp: u.exp };
    if (u.k === 'mul') {
      const fs: Term[] = [];
      for (let i = 0; i < u.fs.length;) {
        if (sw.length > 1 && i + sw.length <= u.fs.length && sw.every((f, k) => K.termEq(f, u.fs[i + k]!))) { fs.push({ k: 'meta', id: h }); i += sw.length; continue; }
        fs.push(go(u.fs[i]!)); i++;
      }
      return fs.length === 1 ? fs[0]! : { k: 'mul', fs };
    }
    return u;
  };
  return K.norm(go(t));
}
const factTerms = (f: Fact): Term[] => (f.k === 'eq' || f.k === 'neq' || f.k === 'law' ? [f.l, f.r] : f.k === 'cond' ? [...f.premises, f.concl].flatMap((p) => [p.l, p.r]) : []);
const metasIn = (f: Fact) => new Set(factTerms(f).flatMap((t) => K.metasOf(t)));
function rigidIn(t: Term, out = new Set<string>()): Set<string> {
  if (t.k === 'atom') out.add(t.id);
  else if (t.k === 'inv') rigidIn(t.arg, out);
  else if (t.k === 'mul') t.fs.forEach((f) => rigidIn(f, out));
  else if (t.k === 'pow') { rigidIn(t.base, out); for (const m of t.exp) for (const x of m.monomial) if (x.ref.k === 'zvar') out.add(x.ref.id); }
  return out;
}
function mapFact(f: Fact, g: (t: Term) => Term): Pallet | Card {
  const pf = (p: PatFact): PatFact => ({ k: p.k, l: g(p.l), r: g(p.r) });
  if (f.k === 'eq' || f.k === 'neq') return { k: f.k, l: g(f.l), r: g(f.r) };
  if (f.k === 'law') return { k: 'law', metas: [...f.metas], l: g(f.l), r: g(f.r) };
  if (f.k === 'cond') return { k: 'cond', metas: [...f.metas], premises: f.premises.map(pf), concl: pf(f.concl) };
  throw new Error('no terms');
}

describe('Book phase A: multi-desk rooms and open docks under random play (finite-group soundness)', () => {
  for (const seedBase of [0x0b00c, 0x51ab, 0xd35c]) {
    it(`seed ${seedBase.toString(16)}`, () => {
      const ctx = mkCtx();
      const count = long ? 1500 : 220;
      const random = rng((seedBase * 2654435761) >>> 0 || 1);
      const coverage: Record<string, number> = {};
      const bump = (k: string) => { coverage[k] = (coverage[k] ?? 0) + 1; };
      const errors: string[] = [];
      let p = new Player(ctx);
      const letters = () => K.withVars(ctx, p.graph).ctx.level.atoms.map((a) => a.id);
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

      function holesOk(sd: SocketDecl, fact: Fact, fill: { holes: K.Subst; instance: Pallet | Card }, rigid: Set<string>) {
        // independent re-check of everything fillOpen promises
        const inst = K.plugHoles(sd.target, fill.holes);
        if (fact.k === 'eq' || fact.k === 'neq') {
          expect(inst.k).toBe(fact.k);
          const q = inst as Pallet & { l: Term; r: Term };
          expect(K.termEq(q.l, fact.l) && K.termEq(q.r, fact.r)).toBe(true);
        } else {
          const c = inst as Card;
          const flip = (x: Card): Card => (x.k === 'law' ? { ...x, l: x.r, r: x.l } : x.concl.k === 'eq' ? { ...x, concl: { k: 'eq', l: x.concl.r, r: x.concl.l } } : x);
          expect(K.sameCardUpToPermutation(fact as Card, c) || K.sameCardUpToPermutation(flip(fact as Card), c)).toBe(true);
        }
        const binders = new Set(sd.target.k === 'law' || sd.target.k === 'cond' ? [...metasIn(sd.target)].filter((m) => !(sd.holes ?? []).some((h) => h.id === m)) : []);
        for (const h of sd.holes ?? []) {
          const v = fill.holes[h.id]!;
          expect(v).toBeDefined();
          expect(v.k === 'int').toBe(h.sort === 'Z');
          for (const id of rigidIn(v)) { expect(rigid.has(id)).toBe(false); expect(h.notMentioning?.includes(id) ?? false).toBe(false); }
          for (const m of v.k === 'int' ? [] : K.metasOf(v)) expect(binders.has(m)).toBe(true);
        }
        // the instance is never an open statement: every meta it contains is bound
        if (inst.k === 'law' || inst.k === 'cond') for (const m of metasIn(inst)) expect(inst.metas.includes(m) || metasIn(inst).has(m)).toBe(true);
      }

      function validate() {
        const res = K.check(p.graph, ctx);
        expect(res.ok).toBe(true);
        const vars = K.withVars(ctx, p.graph).vars;
        const rigid = new Set(vars.map((v) => v.id));
        const fresh: typeof res.nodes = {};
        for (const [id, r] of Object.entries(res.nodes)) {
          const f = r.fact;
          // holes never ride belts: pallets are ground, cards bind what they contain
          if (f && (f.k === 'eq' || f.k === 'neq')) expect(K.isGround(f.l) && K.isGround(f.r)).toBe(true);
          if (f && (f.k === 'law' || f.k === 'cond')) for (const m of metasIn(f)) expect(f.metas.includes(m), `${id} binds ${m}`).toBe(true);
          const key = JSON.stringify([f, r.deps, r.deps.map((d) => K.depRoom(d)).map((x) => (x ? JSON.stringify(p.graph.rooms.find((y) => y.id === x.room)) + x.slot : ''))]);
          if (!checked.has(key)) { fresh[id] = r; checked.add(key); }
        }
        expect(oracleCheck(ctx.level, fresh, p.graph.rooms, vars)).toEqual([]);
        // open docks punched out of fresh root facts
        for (const [id, r] of Object.entries(fresh)) {
          const f = r.fact;
          if (!f || f.k === 'bot' || f.k === 'size') continue;
          if (p.graph.nodes.find((n) => n.id === id)?.scope !== K.ROOT) continue;
          const ts = factTerms(f);
          const all = ts.flatMap((t) => subterms(K.norm(t)));
          const s = pick(all);
          if (!s) continue;
          // a ∀ target: a hole may mention binders; a pallet target: a ground hole
          const isCard = f.k === 'law' || f.k === 'cond';
          const punched = mapFact(f, (t) => punch(t, s, 'hole'));
          if (!metasIn(punched).has('hole')) continue;
          const sd: SocketDecl = { id: 'p', target: punched, allowedGivens: [], holes: [{ id: 'hole' }] };
          if (K.holesProblem(sd)) continue;
          // completeness: the fact it came from fills it, unless the hole swallowed every occurrence of a binder
          // or a Tower (the fill rules forbid those values) — then nothing need fill it
          const swallowsBinder = isCard && [...metasIn(f)].some((m) => !metasIn(punched).has(m));
          const swallowsTower = [...rigidIn(s)].some((x) => rigid.has(x));
          const fill = K.fillOpen(sd, f, { rigid, sameCard: K.sameCardUpToPermutation });
          if (!swallowsBinder && !swallowsTower) {
            expect(fill, `punch ${K.termText(s, {})} out of ${JSON.stringify(f)}`).not.toBeNull();
            bump(isCard ? 'witness-fill' : 'open-fill');
          }
          if (fill) {
            holesOk(sd, f, fill, rigid);
            expect(oracleCheck(ctx.level, { inst: { fact: fill.instance, deps: r.deps, ok: true } }, p.graph.rooms, vars)).toEqual([]);
          }
          // soundness against random other facts with a constraint: anything that fills must really be an instance
          const banned = pick(ctx.level.atoms.map((a) => a.id))!;
          const sd2: SocketDecl = { ...sd, holes: [{ id: 'hole', notMentioning: [banned] } as HoleDecl] };
          for (const n of p.graph.nodes) {
            const g = p.fact(n.id);
            if (!g || n.scope !== K.ROOT || g.k === 'bot' || g.k === 'size') continue;
            const f2 = K.fillOpen(sd2, g, { rigid, allowFlip: random(2) === 0, sameCard: K.sameCardUpToPermutation });
            if (!f2) continue;
            bump('cross-fill');
            const g2 = f2.flipped && (g.k === 'eq' || g.k === 'neq') ? { k: g.k, l: g.r, r: g.l } : g;
            holesOk(sd2, g2, f2, rigid);
          }
        }
      }

      const newEpisode = () => {
        p = new Player(ctx);
        p.declareVar('x₁'); if (random(2)) p.declareVar('y₁');
      };
      newEpisode();
      let moves = 0, attempts = 0;
      while (moves < count && attempts++ < count * 12) {
        if (moves % 18 === 0 || p.graph.nodes.length > 40) newEpisode();
        let detail: unknown;
        try {
          const action = random(100);
          const scopes = [K.ROOT, ...p.graph.rooms.map((r) => r.id)];
          const scope = scopes[random(scopes.length)]!;
          const pallets = nodesWith((f) => f.k === 'eq' || f.k === 'neq');
          const eqs = nodesWith((f) => f.k === 'eq');
          let ok = false;
          if (action < 14) {
            const k = 1 + random(3);
            const as = Array.from({ length: k }, () => [random(3) ? 'eq' : 'neq', term(), term()] as ['eq' | 'neq', Term, Term]);
            detail = ['desks', as];
            p.openDesks(as, scope); bump(`room:${k}`); ok = true;
          } else if (action < 26 || !pallets.length) {
            p.start(term(), scope); bump('start'); ok = true;
          } else if (action < 34) {
            const x = pick(eqs), y = pick(eqs);
            if (!x || !y) continue;
            ok = tryAdd('product', { id: fresh(), scope: random(2) ? x.scope : y.scope, k: 'product', inputs: [x.id, y.id] });
          } else if (action < 40) {
            const x = pick(eqs), y = pick(eqs);
            if (!x || !y) continue;
            ok = tryAdd('merge', { id: fresh(), scope: random(2) ? x.scope : y.scope, k: 'merge', inputs: [x.id, y.id] });
          } else if (action < 52) {
            const n = pick(nodesWith((f) => f.k !== 'bot' && f.k !== 'size'));
            if (!n) continue;
            ok = tryAdd('generalize', { id: fresh(), scope: random(3) ? n.scope : scope, k: 'generalize', input: n.id });
          } else if (action < 64 && p.graph.rooms.length) {
            const room = pick(p.graph.rooms)!;
            const n = pick(nodesWith((f) => f.k === 'eq' || f.k === 'neq').filter((x) => x.scope === room.id));
            if (!n) continue;
            ok = tryAdd(`exit:${room.assumes?.length ?? 1}`, { id: fresh(), scope: room.parent, k: 'exit', room: room.id, input: n.id });
          } else {
            const n = pick(pallets)!;
            const f = p.fact(n.id)!;
            let sel: Addr | null = null;
            if (f.k === 'eq' && random(3)) {
              const side = random(2) ? 'l' : 'r';
              const w = K.word(f[side]).length;
              const s = random(w);
              sel = { side, path: [], range: [s, s + 1 + random(w - s)] };
            }
            const offers = K.offersAt(p.graph, p.res, n.id, sel, ctx).filter((o) => !o.needs.length);
            const o: Offer | undefined = pick(offers);
            if (!o) continue;
            detail = { at: n.id, offer: o.label };
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
      console.log(`book-a ${seedBase.toString(16)}: moves=${moves} coverage=${JSON.stringify(coverage)}`);
      expect(errors, errors.join('\n')).toEqual([]);
      expect(moves).toBe(count);
      for (const k of ['open-fill', 'witness-fill', 'generalize']) expect(coverage[k] ?? 0, `coverage of ${k}`).toBeGreaterThan(0);
      expect((coverage['exit:2'] ?? 0) + (coverage['exit:3'] ?? 0), 'multi-desk exits').toBeGreaterThan(0);
    }, 300_000);
  }
});
