// LEMMA WORKS kernel — bench offers. Pure.
//
// Every offer is built from kernel primitives and pre-evaluated with the same
// code check() runs (stepCore / applyCore), so an offer never contains a move
// the kernel would reject. Offers with `needs` are completed by fillOffer.
import type { Sort } from './types';
import type {
  Addr, Card, CheckResult, Fact, Family, GapAddr, MetaId, NodeId, Offer, OfferKind, Pallet, PatFact, ProofGraph,
  ProofNode, Room, RuleRef, ScopeId, StepOp, Subst, Term,
} from './types';
import type { KernelCtx } from './index';
import {
  E, KErr, beads, instantiate, instantiatePartial, locate, locateGap, match, matchOpen, metasOf, norm, same,
  substKey, termKey, type Loc,
} from './terms';
import {
  AXIOM_IDS, withVars, applyCore, schemaInfo, checkInt, resolveLaw, axiomCard, checkGround, resolveCond, schemaCard, scopeWithin, stepCore,
  sameCardUpToRenaming, type CondCard,
} from './logic';
import { factTex, factText, labelsOf, substText, termTex, termText, type Labels } from './print';
import { ruleFamily, schemaTitle } from './describe';
import { MIRROR_NAMES } from '../levels/levels';
import { powerAllowed } from './powers';
import { POLY_LIMITS, polyLiteral } from './poly';
const K_word = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);

// ───────────── environment ─────────────

interface Cand { id: NodeId; node: ProofNode; fact: Fact; name: string; nameTex: string }

interface Env {
  g: ProofGraph;
  res: CheckResult;
  ctx: KernelCtx;
  L: Labels;
  node: ProofNode;
  fact: Pallet & { k: 'eq' | 'neq' };
  /** Rule/premise/clash candidates: visible givens, suppositions, presses and other belts' ends. */
  cands: Cand[];
  byId: Map<NodeId, ProofNode>;
}

const texName = (s: string) => (/^[A-Za-z]'*$/.test(s) ? s : `\\text{${s.replace(/[{}\\]/g, '')}}`);

function envOf(g: ProofGraph, res: CheckResult, nodeId: NodeId, ctx0: KernelCtx): Env | null {
  const ctx = withVars(ctx0, g).ctx;
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const node = byId.get(nodeId);
  if (!node) return null;
  const r = res.nodes[nodeId];
  if (!r?.ok || !r.fact || (r.fact.k !== 'eq' && r.fact.k !== 'neq')) return null;
  const fact = { k: r.fact.k, l: norm(r.fact.l), r: norm(r.fact.r) };
  const L = labelsOf(ctx.level.atoms);
  const rooms = new Map<ScopeId, Room>(g.rooms.map((rm) => [rm.id, rm] as const));

  // belt structure
  const nextStep = new Map<NodeId, ProofNode>();
  const hasStep = new Set<NodeId>();
  const users = new Map<NodeId, NodeId[]>();
  const addUser = (from: NodeId, to: NodeId) => { const a = users.get(from); if (a) a.push(to); else users.set(from, [to]); };
  for (const n of g.nodes) {
    if (n.k === 'step') {
      hasStep.add(n.input);
      if (!nextStep.has(n.input)) nextStep.set(n.input, n);
      addUser(n.input, n.id);
      if (n.op.k === 'rewrite' && n.op.rule.k === 'node') addUser(n.op.rule.id, n.id);
    } else if (n.k === 'apply') {
      for (const i of n.inputs) addUser(i, n.id);
      if (n.rule.k === 'node') addUser(n.rule.id, n.id);
    } else if (n.k === 'merge' || n.k === 'clash' || n.k === 'product') for (const i of n.inputs) addUser(i, n.id);
    else if (n.k === 'exit' || n.k === 'press' || n.k === 'generalize') addUser(n.input, n.id);
  }
  // own belt
  let head: ProofNode = node;
  for (let guard = 0; head.k === 'step' && guard < 100000; guard++) {
    const p = byId.get(head.input);
    if (!p) break;
    head = p;
  }
  const own = new Set<NodeId>();
  for (let cur: ProofNode | undefined = head; cur && !own.has(cur.id); cur = nextStep.get(cur.id)) own.add(cur.id);
  // nodes the store would truncate when committing from a mid-belt node
  const doomed = new Set<NodeId>();
  const after = nextStep.get(nodeId);
  if (after) {
    const stack = [after.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (doomed.has(id)) continue;
      doomed.add(id);
      stack.push(...(users.get(id) ?? []));
    }
  }

  const cands: Cand[] = [];
  for (const n of g.nodes) {
    if (own.has(n.id) || doomed.has(n.id)) continue;
    const nr = res.nodes[n.id];
    if (!nr?.ok || !nr.fact) continue;
    if (!scopeWithin(node.scope, n.scope, rooms)) continue;
    if (!(n.k === 'given' || n.k === 'assume' || n.k === 'press' || !hasStep.has(n.id))) continue;
    let name: string, nameTex: string;
    if (n.k === 'given') {
      name = ctx.level.givens.find((x) => x.id === n.givenId)?.name ?? n.givenId;
      nameTex = texName(name);
    } else if (n.k === 'assume') {
      name = rooms.get(n.room)?.kind === 'classical' ? 'the assumption' : 'the supposition';
      nameTex = `\\text{${name}}`;
    } else if (n.k === 'press') { name = 'Lagrange'; nameTex = '\\text{Lagrange}'; }
    else { name = factText(nr.fact, L); nameTex = factTex(nr.fact, L); }
    cands.push({ id: n.id, node: n, fact: nr.fact, name, nameTex });
  }
  return { g, res, ctx, L, node, fact, cands, byId };
}

const factKey = (f: Fact): string => {
  switch (f.k) {
    case 'eq': case 'neq': return `${f.k}:${termKey(norm(f.l))}|${termKey(norm(f.r))}`;
    case 'bot': return 'bot';
    case 'size': return `size:${f.n}`;
    case 'law': return `law:${termKey(norm(f.l))}|${termKey(norm(f.r))}`;
    case 'cond': return `cond:${f.premises.map((p) => factKey(p)).join(';')}=>${factKey(f.concl)}`;
    case 'mem': return `mem:${termKey(norm(f.t))}|${f.sub.k}:${f.sub.id}`;
  }
};

// ───────────── rewrite rules in scope ─────────────

interface RuleE {
  ref: RuleRef;
  l: Term; r: Term; metas: MetaId[];
  ruleFact?: Fact;
  kind: 'axiom' | 'schema' | 'node';
  axiom?: string;
  family: Family;
  name: string; nameTex: string;
}

function rulesOf(env: Env): RuleE[] {
  const out: RuleE[] = [];
  for (const id of AXIOM_IDS) {
    const c = axiomCard(id);
    const unit = id === 'unitL' || id === 'unitR';
    out.push({
      ref: { k: 'axiom', id }, l: c.l, r: c.r, metas: ['x'], kind: 'axiom', axiom: id,
      family: unit ? 'identity' : 'inverse', name: unit ? 'identity' : 'inverse', nameTex: unit ? '\\text{identity}' : '\\text{inverse}',
    });
  }
  for (const id of env.ctx.level.tools.schemas) {
    for (const mirror of [false, true]) {
      let c;
      try { c = schemaCard(id, mirror, env.ctx); } catch { continue; }
      if (c.k !== 'law') continue;
      if (mirror && sameCardUpToRenaming(c, schemaCard(id, false, env.ctx))) continue;
      const sc = schemaInfo(id, env.ctx)!;
      const name = mirror ? (MIRROR_NAMES[id]?.name ?? `${sc.name} ᵒᵖ`) : sc.name;
      out.push({
        ref: mirror ? { k: 'schema', id, mirror: true } : { k: 'schema', id }, l: norm(c.l), r: norm(c.r),
        metas: [...new Set([...metasOf(c.l), ...metasOf(c.r)])], kind: 'schema', family: 'lemma', name, nameTex: `\\text{${name}}`,
      });
    }
  }
  const seen = new Set<string>();
  for (const c of env.cands) {
    if (c.fact.k !== 'eq' && c.fact.k !== 'law') continue;
    const k = factKey(c.fact);
    if (seen.has(k)) continue;
    seen.add(k);
    const l = norm(c.fact.l), r = norm(c.fact.r);
    out.push({
      ref: { k: 'node', id: c.id }, l, r, metas: [...new Set([...metasOf(l), ...metasOf(r)])], ruleFact: c.fact,
      kind: 'node', family: ruleFamily({ k: 'node', id: c.id }, c.node.k), name: c.name, nameTex: c.nameTex,
    });
  }
  return out;
}

// ───────────── evaluation helpers ─────────────

function ruleFactOf(env: Env, rule: RuleRef): Fact | undefined {
  return rule.k === 'node' ? env.res.nodes[rule.id]?.fact : undefined;
}

/** Run ops on the active fact exactly as check() would. Throws KErr on failure. */
function runOps(env: Env, ops: StepOp[]): Pallet {
  let p: Pallet = env.fact;
  for (const op of ops) p = stepCore(p, op, env.ctx, op.k === 'rewrite' ? ruleFactOf(env, op.rule) : undefined);
  return p;
}

const addrKey = (a: Addr) => `${a.side}/${a.path.join('.')}/${a.range ? `${a.range[0]}-${a.range[1]}` : '*'}`;
const gapKey = (a: GapAddr) => `${a.side}/${a.path.join('.')}/^${a.gap}`;
const refKey = (r: RuleRef) => (r.k === 'axiom' ? `ax:${r.id}` : r.k === 'schema' ? `sc:${r.id}${r.mirror ? ':op' : ''}` : `nd:${r.id}`);

/** The unit rewrite that absorbs a lone e at word position `pos` (unitL with the right neighbour, else unitR). */
function tidyAt(side: 'l' | 'r', wordPath: number[], w: Term[], pos: number): StepOp | null {
  if (w.length < 2 || w[pos]?.k !== 'e') return null;
  if (pos + 1 < w.length) {
    return { k: 'rewrite', rule: { k: 'axiom', id: 'unitL' }, dir: 'fwd', at: { side, path: [...wordPath], range: [pos, pos + 2] }, subst: { x: w[pos + 1]! } };
  }
  return { k: 'rewrite', rule: { k: 'axiom', id: 'unitR' }, dir: 'fwd', at: { side, path: [...wordPath], range: [pos - 1, pos + 1] }, subst: { x: w[pos - 1]! } };
}

/** Auto-tidy for a rewrite at loc whose destination instance is exactly e. */
function tidyFor(loc: Loc, dstInst: Term): StepOp | null {
  if (dstInst.k !== 'e') return null;
  const w = [...loc.word.slice(0, loc.s), E, ...loc.word.slice(loc.e)];
  return tidyAt(loc.side, loc.wordPath, w, loc.s);
}

const palletBeads = (p: Pallet | undefined) => (p && (p.k === 'eq' || p.k === 'neq') ? beads(p.l) + beads(p.r) : 0);

// ───────────── describing step offers ─────────────

interface Desc { label: string; why: string; family: Family }

function ruleInfo(env: Env, ref: RuleRef): { name: string; nameTex: string; family: Family; law?: { l: Term; r: Term } } {
  if (ref.k === 'axiom') {
    const unit = ref.id === 'unitL' || ref.id === 'unitR';
    const c = axiomCard(ref.id);
    return { name: unit ? 'identity' : 'inverse', nameTex: unit ? '\\text{identity}' : '\\text{inverse}', family: unit ? 'identity' : 'inverse', law: c };
  }
  if (ref.k === 'schema') {
    const sc = schemaInfo(ref.id, env.ctx);
    const name = ref.mirror ? (MIRROR_NAMES[ref.id]?.name ?? `${sc?.name ?? ref.id} ᵒᵖ`) : (sc?.name ?? ref.id);
    let law: { l: Term; r: Term } | undefined;
    try { const c = schemaCard(ref.id, ref.mirror, env.ctx); if (c.k === 'law') law = c; } catch { /* unavailable */ }
    return { name, nameTex: `\\text{${name}}`, family: 'lemma', law };
  }
  const cand = env.cands.find((c) => c.id === ref.id);
  const f = env.res.nodes[ref.id]?.fact;
  const node = env.byId.get(ref.id);
  const name = cand?.name ?? (f ? factText(f, env.L) : 'an earlier fact');
  const nameTex = cand?.nameTex ?? (f ? factTex(f, env.L) : '\\text{an earlier fact}');
  const law = f && (f.k === 'eq' || f.k === 'law') ? { l: f.l, r: f.r } : undefined;
  return { name, nameTex, family: ruleFamily(ref, node?.k), law };
}

function describeSteps(env: Env, ops: StepOp[]): Desc {
  const L = env.L;
  const op0 = ops[0]!;
  const T = (t: Term) => termText(t, L);
  const atText = (s: Subst, metas: MetaId[]) => {
    const shown: Subst = {};
    for (const m of metas) if (s[m]) shown[m] = s[m]!;
    return Object.keys(shown).length ? ` at ${substText(shown, L)}` : '';
  };
  if (op0.k === 'swap') return { label: 'swap sides', why: '\\text{symmetry}', family: 'equation' };
  if (op0.k === 'lift') {
    const t = T(op0.term);
    return { label: `multiply both sides on the ${op0.side} by ${t}`, why: `\\text{multiply on the ${op0.side} by } ${termTex(op0.term, L)}`, family: 'structure' };
  }
  if (op0.k === 'insertE') {
    const op1 = ops[1];
    if (!op1 || op1.k !== 'rewrite') return { label: 'insert e', why: '\\text{identity}', family: 'identity' };
    const info = ruleInfo(env, op1.rule);
    const law = info.law;
    const dst = law ? instantiatePartial(op1.dir === 'fwd' ? law.r : law.l, op1.subst) : E;
    if (op1.rule.k === 'axiom') return { label: `insert ${T(dst)}`, why: '\\text{inverse}', family: 'inverse' };
    const metas = law ? metasOf(op1.dir === 'fwd' ? law.r : law.l) : [];
    const by = op1.rule.k === 'schema' ? info.name : info.family === 'lemma' && info.name === 'Lagrange' ? 'Lagrange' : `by ${info.name}`;
    return { label: `insert ${T(dst)} (${by}${atText(op1.subst, metas)})`, why: info.nameTex.startsWith('\\text{') ? info.nameTex : `\\text{by } ${info.nameTex}`, family: info.family };
  }
  if (op0.k === 'invert') return { label: 'invert both sides', why: '\\text{invert both sides}', family: 'structure' };
  if (op0.k === 'applyMap') return { label: `apply ${env.L[op0.fn] ?? op0.fn} to both sides`, why: '\\text{apply a map to both sides}', family: 'structure' };
  // rewrite
  const info = ruleInfo(env, op0.rule);
  const loc = locate(env.fact, op0.at);
  const redex = loc ? loc.redex : E;
  const law = info.law;
  if (op0.rule.k === 'axiom') {
    const id = op0.rule.id;
    if ((id === 'invL' || id === 'invR') && op0.dir === 'fwd') return { label: `cancel ${T(redex)}`, why: '\\text{inverse}', family: 'inverse' };
    if ((id === 'unitL' || id === 'unitR') && op0.dir === 'fwd') return { label: 'remove e', why: '\\text{identity}', family: 'identity' };
    const dst = law ? instantiatePartial(op0.dir === 'fwd' ? law.r : law.l, op0.subst) : redex;
    if (id === 'invL' || id === 'invR') return { label: `expand e as ${T(dst)}`, why: '\\text{inverse}', family: 'inverse' };
    return { label: `rewrite ${T(redex)} as ${T(dst)}`, why: '\\text{identity}', family: 'identity' };
  }
  const src = law ? (op0.dir === 'fwd' ? law.l : law.r) : redex;
  const dstPat = law ? (op0.dir === 'fwd' ? law.r : law.l) : redex;
  const dst = instantiatePartial(dstPat, op0.subst);
  const metas = [...new Set([...metasOf(src), ...metasOf(dstPat)])];
  const by = op0.rule.k === 'schema' ? info.name : info.name === 'Lagrange' ? 'Lagrange' : `by ${info.name}`;
  return {
    label: `${T(redex)} → ${T(dst)} (${by}${atText(op0.subst, metas)})`,
    why: info.nameTex.startsWith('\\text{') ? info.nameTex : `\\text{by } ${info.nameTex}`,
    family: info.family,
  };
}

interface Ranked { offer: Offer; rank: number; size: number; order: number }

function stepsOffer(env: Env, key: string, ops: StepOp[], needs: MetaId[]): Offer | null {
  let preview: Pallet | undefined;
  if (!needs.length) {
    try { preview = runOps(env, ops); } catch { return null; }
  }
  const d = describeSteps(env, ops);
  const kind: OfferKind = { k: 'steps', ops };
  const needSorts = needs.length ? stepNeedSorts(env, ops, needs) : undefined;
  return { key, family: d.family, label: d.label, why: d.why, needs, ...(preview ? { preview } : {}), kind, ...(needSorts ? { needSorts } : {}) };
}

/** Sorts of an offer's needed metas: ℤ if the rule uses the meta inside an exponent, else G. */
function stepNeedSorts(env: Env, ops: StepOp[], needs: MetaId[]): Record<MetaId, Sort> {
  const z = new Set<MetaId>();
  for (const op of ops) {
    if (op.k !== 'rewrite') continue;
    try { for (const m of resolveLaw(op.rule, env.ctx, ruleFactOf(env, op.rule), env.L).zmetas) z.add(m); } catch { /* unresolvable: G */ }
  }
  return Object.fromEntries(needs.map((m) => [m, z.has(m) ? 'Z' : 'G'])) as Record<MetaId, Sort>;
}

// ───────────── span offers ─────────────

function spanOffers(env: Env, sel: Addr): Offer[] {
  if (env.fact.k !== 'eq') return [];
  const loc = locate(env.fact, sel);
  if (!loc) return [];
  const at: Addr = { side: loc.side, path: [...loc.wordPath], range: [loc.s, loc.e] };
  const redex = norm(loc.redex);
  const out: Ranked[] = [];
  const seen = new Set<string>();
  let order = 0;
  const push = (o: Offer | null, rank: number) => {
    if (!o || seen.has(o.key)) return;
    seen.add(o.key);
    out.push({ offer: o, rank: o.needs.length ? 3 : rank, size: palletBeads(o.preview), order: order++ });
  };

  // a lone e beside a neighbour: offer to absorb it
  if (redex.k === 'e' && loc.e - loc.s === 1) {
    const t = tidyAt(loc.side, loc.wordPath, loc.word, loc.s);
    if (t) push(stepsOffer(env, `pop|${addrKey(at)}`, [t], []), 0);
  }

  // power.literal family: unfold x^r (literal r > 0) into its word; fold k ≥ 2 repeats of a block
  if (powerAllowed('power.literal:1', env.ctx.level.tools.schemas)) {
    const lit = (r: number, dir: 'fwd' | 'rev', x: Term) => {
      if (r < 1 || r > POLY_LIMITS.literalPower) return;
      const ref: RuleRef = { k: 'schema', id: `power.literal:${r}` };
      const op: StepOp = { k: 'rewrite', rule: ref, dir, at, subst: { x } };
      push(stepsOffer(env, `rw|${refKey(ref)}|${dir}|${addrKey(at)}|${substKey({ x })}`, [op], []), 1);
    };
    if (redex.k === 'pow') {
      const v = polyLiteral(redex.exp);
      if (v !== null && v >= 1n && v <= BigInt(POLY_LIMITS.literalPower)) lit(Number(v), 'fwd', redex.base);
    }
    const w = K_word(redex);
    for (let p = 1; p <= w.length / 2; p++) {
      if (w.length % p) continue;
      let ok = true;
      for (let q = p; q < w.length && ok; q++) if (!same(w[q]!, w[q - p]!)) ok = false;
      if (ok) lit(w.length / p, 'rev', p === 1 ? w[0]! : { k: 'mul', fs: w.slice(0, p) });
    }
  }

  for (const rule of rulesOf(env)) {
    for (const dir of ['fwd', 'rev'] as const) {
      if (rule.kind === 'axiom' && (rule.axiom === 'unitL' || rule.axiom === 'unitR') && dir === 'rev') continue;
      // x → x¹ matches every span (like x → ex): not offered; the kernel still accepts it
      if (rule.kind === 'schema' && rule.ref.k === 'schema' && rule.ref.id === 'power.one' && dir === 'rev') continue;
      const [src, dst] = dir === 'fwd' ? [rule.l, rule.r] : [rule.r, rule.l];
      for (const s of matchOpen(src, redex)) {
        const needs = rule.metas.filter((m) => !s[m]);
        const op: StepOp = { k: 'rewrite', rule: rule.ref, dir, at, subst: s };
        const ops: StepOp[] = [op];
        if (!needs.length) {
          const tidy = tidyFor(loc, instantiate(dst, s));
          if (tidy) ops.push(tidy);
        }
        const key = `rw|${refKey(rule.ref)}|${dir}|${addrKey(at)}|${substKey(s)}`;
        const rank = rule.kind === 'schema' ? (dir === 'fwd' ? 1 : 2) : dir === 'fwd' ? 0 : 2;
        push(stepsOffer(env, key, ops, needs), rank);
      }
    }
  }
  return sortRanked(out);
}

function sortRanked(xs: Ranked[]): Offer[] {
  return xs.sort((a, b) => a.rank - b.rank || a.size - b.size || a.order - b.order).map((x) => x.offer);
}

// ───────────── gap offers ─────────────

function gapOffers(env: Env, sel: GapAddr): Offer[] {
  if (env.fact.k !== 'eq') return [];
  const gl = locateGap(env.fact, sel);
  if (!gl) return [];
  const gap: GapAddr = { side: gl.side, path: [...gl.wordPath], gap: gl.gap };
  const eAt: Addr = { side: gl.side, path: [...gl.wordPath], range: [gl.gap, gl.gap + 1] };
  const ins: StepOp = { k: 'insertE', at: gap };
  const out: Ranked[] = [];
  const seen = new Set<string>();
  let order = 0;
  const push = (o: Offer | null, rank: number) => {
    if (!o || seen.has(o.key)) return;
    seen.add(o.key);
    out.push({ offer: o, rank, size: 0, order: order++ });
  };
  push(stepsOffer(env, `ins|${gapKey(gap)}`, [ins], []), 0);
  for (const rule of rulesOf(env)) {
    const sides: ('fwd' | 'rev')[] = [];
    if (rule.l.k === 'e' && rule.r.k === 'e') continue;
    if (rule.l.k === 'e') sides.push('fwd');
    if (rule.r.k === 'e') sides.push('rev');
    for (const dir of sides) {
      const dst = dir === 'fwd' ? rule.r : rule.l;
      const needs = rule.metas.filter((m) => metasOf(dst).includes(m));
      const ops: StepOp[] = [ins, { k: 'rewrite', rule: rule.ref, dir, at: eAt, subst: {} }];
      const rank = rule.kind === 'axiom' ? 1 : rule.kind === 'node' ? (needs.length ? 3 : 2) : 4;
      push(stepsOffer(env, `ins|${gapKey(gap)}|${refKey(rule.ref)}|${dir}`, ops, needs), rank);
    }
  }
  return sortRanked(out);
}

// ───────────── whole-pallet offers ─────────────

interface CardE { ref: RuleRef; card: CondCard; name: string; nameTex: string; family: Family }

function condCards(env: Env): CardE[] {
  const out: CardE[] = [];
  for (const id of env.ctx.level.tools.schemas) {
    for (const mirror of [false, true]) {
      let c;
      try { c = schemaCard(id, mirror, env.ctx); } catch { continue; }
      if (c.k !== 'cond' || !benchCard(c)) continue;
      if (mirror && sameCardUpToRenaming(c, schemaCard(id, false, env.ctx))) continue;
      const ref: RuleRef = mirror ? { k: 'schema', id, mirror: true } : { k: 'schema', id };
      const sc = schemaInfo(id, env.ctx)!;
      const name = mirror ? (MIRROR_NAMES[id]?.name ?? `${sc.name} ᵒᵖ`) : sc.name;
      out.push({ ref, card: resolveCond(ref, env.ctx, undefined, env.L), name, nameTex: `\\text{${name}}`, family: 'lemma' });
    }
  }
  const seen = new Set<string>();
  for (const c of env.cands) {
    if (c.fact.k !== 'cond' || !benchCard(c.fact)) continue;
    const k = factKey(c.fact);
    if (seen.has(k)) continue;
    seen.add(k);
    const ref: RuleRef = { k: 'node', id: c.id };
    out.push({ ref, card: resolveCond(ref, env.ctx, c.fact, env.L), name: c.name, nameTex: c.nameTex, family: c.node.k === 'given' ? 'given' : 'lemma' });
  }
  return out;
}

/** The bench (v2/v3 API) works on (in)equations only: Book phase B memberships live on the factory floor. */
const benchCard = (c: Card): boolean => !c.binds?.length && [...(c.k === 'cond' ? [...c.premises, c.concl] : [])].every((p) => p.k !== 'mem');

function matchFact(p: PatFact, f: Fact, s0: Subst): Subst[] {
  if (f.k !== p.k || p.k === 'mem' || (f.k !== 'eq' && f.k !== 'neq')) return [];
  const out: Subst[] = [];
  for (const s1 of match(p.l, f.l, s0)) out.push(...match(p.r, f.r, s1));
  return out;
}

const MAX_APPLY_PER_CARD = 48;

function applyLabel(env: Env, ce: CardE, s: Subst, preview: Pallet | undefined): Desc {
  const c0 = ce.card.concl;
  const concl: Fact = preview ?? (c0.k === 'mem' ? { k: 'mem', t: instantiatePartial(c0.t, s), sub: c0.sub } : { k: c0.k, l: instantiatePartial(c0.l, s), r: instantiatePartial(c0.r, s) });
  const isNode = ce.ref.k === 'node';
  const shown: Subst = {};
  if (isNode) for (const m of ce.card.metas) if (s[m]) shown[m] = s[m]!;
  const at = Object.keys(shown).length ? ` at ${substText(shown, env.L)}` : '';
  return {
    label: isNode ? `use ${ce.name}${at}: ${factText(concl, env.L)}` : `${ce.name}: ${factText(concl, env.L)}`,
    why: isNode ? `\\text{by } ${ce.nameTex}` : ce.nameTex,
    family: ce.family,
  };
}

function applyOffers(env: Env): Ranked[] {
  const out: Ranked[] = [];
  const seen = new Set<string>();
  const nodeId = env.node.id;
  const f0 = env.fact;
  const swapped = { k: f0.k, l: f0.r, r: f0.l } as Pallet & { k: 'eq' | 'neq' };
  const others = env.cands.filter((c) => c.fact.k === 'eq' || c.fact.k === 'neq');
  let order = 0;
  for (const ce of condCards(env)) {
    const prem = ce.card.premises;
    let count = 0;
    /** previews already offered without a swap (a preSwap twin with the same result is redundant) */
    const plainResults = new Set<string>();
    for (let i = 0; i < prem.length && count < MAX_APPLY_PER_CARD; i++) {
      if (prem[i]!.k !== f0.k) continue;
      // as-is first; only if the premise does not match as-is, try the sides exchanged (preSwap)
      let preSwap = false;
      let act: Pallet & { k: 'eq' | 'neq' } = f0;
      let firsts = matchFact(prem[i]!, f0, {});
      if (!firsts.length) {
        firsts = matchFact(prem[i]!, swapped, {});
        preSwap = true;
        act = swapped;
      }
      // the store feeds the (swapped) active node to every premise slot it fills
      const premCands: Cand[] = [{ id: nodeId, node: env.node, fact: act, name: '', nameTex: '' }, ...others];
      for (const s0 of firsts) {
        // fill the other premises from visible facts
        const fills: { s: Subst; inputs: NodeId[] }[] = [];
        const rec = (j: number, s: Subst, inputs: NodeId[]) => {
          if (fills.length >= MAX_APPLY_PER_CARD) return;
          if (j === prem.length) { fills.push({ s, inputs: [...inputs] }); return; }
          if (j === i) { inputs[j] = nodeId; rec(j + 1, s, inputs); return; }
          for (const c of premCands) for (const s2 of matchFact(prem[j]!, c.fact, s)) { inputs[j] = c.id; rec(j + 1, s2, inputs); }
        };
        rec(0, s0, new Array(prem.length).fill(''));
        for (const { s, inputs } of fills) {
          const key = `ap|${refKey(ce.ref)}|${i}|${inputs.join(',')}|${substKey(s)}${preSwap ? '|sw' : ''}`;
          if (seen.has(key)) continue;
          const needs = ce.card.metas.filter((m) => !s[m]);
          let preview: Pallet | undefined;
          if (!needs.length) {
            try {
              const facts = inputs.map((id) => (id === nodeId ? act : env.res.nodes[id]!.fact!));
              preview = applyCore(ce.card, facts, s, env.ctx);
            } catch { continue; }
          }
          const resKey = preview ? factKey(preview) : `needs|${substKey(s)}`;
          if (preSwap && plainResults.has(resKey)) continue;
          if (!preSwap) plainResults.add(resKey);
          seen.add(key);
          count++;
          const d = applyLabel(env, ce, s, preview);
          const bindings = bindingsFor(act, prem[i]! as { l: Term; r: Term }, s)
            .map((bd) => (preSwap ? { meta: bd.meta, addr: { ...bd.addr, side: bd.addr.side === 'l' ? 'r' as const : 'l' as const } } : bd));
          out.push({
            offer: {
              key, family: d.family, label: d.label, why: d.why, needs, ...(preview ? { preview } : {}),
              kind: { k: 'apply', rule: ce.ref, inputs, subst: s, ...(preSwap ? { preSwap: true } : {}) },
              ...(needs.length ? { needSorts: Object.fromEntries(needs.map((m) => [m, ce.card.zmetas.has(m) ? 'Z' : 'G'])) as Record<MetaId, Sort> } : {}),
              group: groupOf(ce.ref), bindings,
            },
            rank: needs.length ? 5 : 1, size: palletBeads(preview), order: order++,
          });
        }
      }
    }
  }
  return out;
}

function wholeOffers(env: Env): Offer[] {
  const out: Ranked[] = [];
  const f = env.fact;
  let order = 1000;
  // contradiction (the store closes the room on a clash; an assume room exports only = / ≠, never ⊥,
  // and a ⊥ sitting directly in an assume room can go nowhere — so no clash is offered there)
  const seenClash = new Set<string>();
  const inAssume = env.g.rooms.some((r) => r.id === env.node.scope && r.kind === 'assume');
  for (const c of inAssume ? [] : env.cands) {
    const other = c.fact;
    if (other.k !== (f.k === 'eq' ? 'neq' : 'eq')) continue;
    const hit = (same(norm(other.l), f.l) && same(norm(other.r), f.r)) || (same(norm(other.l), f.r) && same(norm(other.r), f.l));
    if (!hit) continue;
    const k = factKey(other);
    if (seenClash.has(k)) continue;
    seenClash.add(k);
    const label = c.node.k === 'given' ? `contradiction with ${c.name}: ${factText(other, env.L)}` : `contradiction with ${factText(other, env.L)}`;
    out.push({ offer: { key: `clash|${c.id}`, family: 'contradiction', label, why: '\\text{contradiction}', needs: [], preview: { k: 'bot' }, kind: { k: 'clash', neq: c.id }, group: 'clash' }, rank: 0, size: 0, order: order++ });
  }
  // merge (store builds merge [other, active] ⟹ other.l = active.l)
  if (env.ctx.level.tools.merge && f.k === 'eq') {
    const seenM = new Set<string>();
    for (const c of env.cands) {
      if (c.fact.k !== 'eq' || !same(norm(c.fact.r), f.r)) continue;
      const preview: Pallet = { k: 'eq', l: norm(c.fact.l), r: f.l };
      const k = factKey(preview);
      if (seenM.has(k)) continue;
      seenM.add(k);
      out.push({ offer: { key: `merge|${c.id}`, family: 'equation', label: `transitivity with ${factText(c.fact, env.L)}: ${factText(preview, env.L)}`, why: '\\text{transitivity}', needs: [], preview, kind: { k: 'merge', other: c.id }, group: 'merge' }, rank: 2, size: 0, order: order++ });
    }
  }
  out.push(...applyOffers(env));
  const iv = stepsOffer(env, 'invert', [{ k: 'invert' }], []);
  if (iv) out.push({ offer: { ...iv, group: 'invert' }, rank: 3, size: 0, order: order++ });
  const sw = stepsOffer(env, 'swap', [{ k: 'swap' }], []);
  if (sw) out.push({ offer: { ...sw, group: 'swap' }, rank: 3, size: 0, order: order++ });
  if (env.ctx.level.tools.lift && f.k === 'eq') {
    for (const side of ['left', 'right'] as const) {
      const o = stepsOffer(env, `lift|${side}`, [{ k: 'lift', side, term: { k: 'meta', id: 't' } }], ['t']);
      if (o) out.push({ offer: { ...o, group: 'lift' }, rank: 4, size: 0, order: order++ });
    }
  }
  return out.sort((a, b) => a.rank - b.rank || a.order - b.order).map((x) => x.offer);
}

// ───────────── grouping, bindings, pruning ─────────────

/** Machine grouping key: alternatives of one machine share it. */
function groupOf(ref: RuleRef): string {
  if (ref.k === 'schema') return `schema:${ref.id}${ref.mirror ? ':op' : ''}`;
  if (ref.k === 'node') return `node:${ref.id}`;
  return `axiom:${ref.id}`;
}

/** Canonical form of an address (the same one locate/termAt resolve). */
function canonAddr(p: Pallet, a: Addr): Addr | null {
  const loc = locate(p, a);
  return loc ? { side: loc.side, path: [...loc.wordPath], range: [loc.s, loc.e] } : null;
}

/**
 * Where each meta of a premise pattern sits on the active pallet under σ.
 * Repeated metas yield one entry per occurrence (e.g. Cancel Lathe's u on both rails).
 */
function bindingsFor(fact: Pallet & { k: 'eq' | 'neq' }, prem: { l: Term; r: Term }, s: Subst): { meta: MetaId; addr: Addr }[] {
  const out: { meta: MetaId; addr: Addr }[] = [];
  const push = (meta: MetaId, a: Addr) => { const c = canonAddr(fact, a); if (c) out.push({ meta, addr: c }); };
  // pattern P matched against the term at `path` on `side` (whole term)
  const walk = (side: 'l' | 'r', P: Term, T: Term, path: number[]) => {
    switch (P.k) {
      case 'meta': push(P.id, { side, path }); return;
      case 'inv': if (T.k === 'inv') walk(side, P.arg, T.arg, [...path, 0]); return;
      case 'mul': {
        if (T.k !== 'mul') return;
        let j = 0;
        for (const f of P.fs) {
          if (f.k === 'meta') {
            const v = s[f.id];
            if (!v) return;
            const len = v.k === 'mul' ? v.fs.length : 1;
            push(f.id, { side, path, range: [j, j + len] });
            j += len;
          } else {
            const t = T.fs[j];
            if (!t) return;
            walk(side, f, t, [...path, j]);
            j += 1;
          }
        }
        return;
      }
      default: return;
    }
  };
  walk('l', norm(prem.l), fact.l, []);
  walk('r', norm(prem.r), fact.r, []);
  return out;
}

const palletSame = (x: Pallet, y: Pallet): boolean => {
  if (x.k !== y.k) return false;
  if ((x.k === 'eq' || x.k === 'neq') && (y.k === 'eq' || y.k === 'neq')) return same(norm(x.l), norm(y.l)) && same(norm(x.r), norm(y.r));
  if (x.k === 'size' && y.k === 'size') return x.n === y.n;
  return true;
};

/** A ready offer that changes nothing, or yields a reflexive X = X that is not itself a goal. */
function useless(env: Env, o: Offer): boolean {
  const p = o.preview;
  if (!p || o.needs.length) return false;
  if (env.ctx.level.sockets.some((sk) => sk.target.k !== 'law' && sk.target.k !== 'cond' && palletSame(sk.target, p))) return false;
  if (palletSame(p, env.fact)) return true;
  return p.k === 'eq' && same(norm(p.l), norm(p.r));
}

// ───────────── public ─────────────

export function offersAt(g: ProofGraph, res: CheckResult, nodeId: NodeId, sel: Addr | GapAddr | null, ctx: KernelCtx): Offer[] {
  const env = envOf(g, res, nodeId, ctx);
  if (!env) return [];
  const all = sel === null || sel === undefined ? wholeOffers(env) : 'gap' in sel ? gapOffers(env, sel) : spanOffers(env, sel);
  return all.filter((o) => !useless(env, o));
}

export function fillOffer(o: Offer, values: Subst, g: ProofGraph, res: CheckResult, nodeId: NodeId, ctx0: KernelCtx):
  { ok: true; offer: Offer } | { ok: false; error: string } {
  const env = envOf(g, res, nodeId, ctx0);
  if (!env) return { ok: false, error: 'There is no equation here to work on.' };
  const ctx = env.ctx;
  try {
    const vals: Subst = {};
    for (const m of o.needs) {
      const v = values?.[m];
      if (!v) continue;
      vals[m] = v.k === 'int' ? checkInt(v, ctx, `the value for ${m}`) : checkGround(v, ctx, `the value for ${m}`);
    }
    // bounded inference (§4.2): once some knobs are given, remaining ℤ needs of a rewrite may follow
    // from the selected redex, e.g. e² → (e^m)^n with m = 2 gives n = 1
    const kind0 = o.kind;
    const missing = o.needs.filter((m) => !vals[m]);
    if (missing.length && kind0.k === 'steps') {
      const op = kind0.ops.find((x) => x.k === 'rewrite');
      if (op && op.k === 'rewrite') {
        const info = ruleInfo(env, op.rule);
        const loc = locate(env.fact, op.at);
        if (info.law && loc) {
          const src = op.dir === 'fwd' ? info.law.l : info.law.r;
          const [s1] = match(src, loc.redex, { ...op.subst, ...vals });
          if (s1) for (const m of missing) if (s1[m]) vals[m] = s1[m]!;
        }
      }
    }
    for (const m of o.needs) if (!vals[m]) throw new KErr(o.needSorts?.[m] === 'Z' ? `Choose an integer for ${m}.` : `Choose an element for ${m}.`);
    const suffix = o.needs.length ? `|${substKey(vals)}` : '';
    const kind = o.kind;
    if (kind.k === 'steps') {
      let ops: StepOp[] = kind.ops.map((op): StepOp => {
        if (op.k === 'rewrite') {
          const add: Subst = {};
          for (const m of o.needs) if (!op.subst[m] && vals[m]) add[m] = vals[m]!;
          return { ...op, subst: { ...op.subst, ...add } };
        }
        if (op.k === 'lift' && op.term.k === 'meta') {
          const v = vals[op.term.id];
          if (!v) throw new KErr('Choose an element to multiply by.');
          return { ...op, term: v };
        }
        return op;
      });
      // a filled single rewrite whose result is a lone e beside a neighbour gets its auto-tidy
      if (ops.length === 1 && ops[0]!.k === 'rewrite' && o.needs.length) {
        const op = ops[0]!;
        const loc = locate(env.fact, op.at);
        const info = ruleInfo(env, op.rule);
        if (loc && info.law) {
          const dst = instantiate(op.dir === 'fwd' ? info.law.r : info.law.l, op.subst);
          const t = tidyFor(loc, dst);
          if (t) ops = [...ops, t];
        }
      }
      const preview = runOps(env, ops);
      const d = describeSteps(env, ops);
      const { needSorts: _ns, ...rest } = o; void _ns;
      return { ok: true, offer: { ...rest, key: o.key + suffix, needs: [], preview, kind: { k: 'steps', ops }, label: d.label, why: d.why, family: d.family } };
    }
    if (kind.k === 'apply') {
      const s = { ...kind.subst, ...vals };
      const card = resolveCond(kind.rule, ctx, kind.rule.k === 'node' ? res.nodes[kind.rule.id]?.fact : undefined, env.L);
      const facts = kind.inputs.map((id) => {
        if (id === nodeId) return kind.preSwap ? { k: env.fact.k, l: env.fact.r, r: env.fact.l } : env.fact;
        const f = res.nodes[id];
        if (!f?.ok || !f.fact) throw new KErr('A premise is gone. Pick it again.');
        return f.fact;
      });
      const preview = applyCore(card, facts, s, ctx);
      const info = ruleInfo(env, kind.rule);
      const ce: CardE = { ref: kind.rule, card, name: info.name, nameTex: info.nameTex, family: o.family };
      const d = applyLabel(env, ce, s, preview);
      const { needSorts: _ns, ...rest } = o; void _ns;
      return { ok: true, offer: { ...rest, key: o.key + suffix, needs: [], preview, kind: { ...kind, subst: s }, label: d.label, why: d.why } };
    }
    return { ok: true, offer: o };
  } catch (e) {
    return { ok: false, error: e instanceof KErr ? e.message : `That doesn't work (${(e as Error)?.message ?? 'unknown'}).` };
  }
}

// keep schemaTitle referenced for consumers that want it via this module
export { schemaTitle };
