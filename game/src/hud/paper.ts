// COMMUTATOR — the Paper view (The Book, SYNTHESIS §4): the proof the factory built, written out the way a
// student writes it in a homework: numbered lines, one equation each, a reason in plain words.
//
//    1.  b = be        (identity)
//    2.    = bac       (h₂, read right to left)
//
// Built from the live transcript (proof.ts): its lines, stations and references, re-voiced. Only the work
// that reaches a dock is written down once the order is solved (scrap belts stay on the floor). Reasons use
// the standard names (identity, inverse, left cancellation, symmetry …); a step that uses a rule backwards
// says "read right to left"; a cited line is "line k". Maths is typeset by the shared renderer; no arrows.
import type { Fact, NodeId, ProofNode, Room, Term } from '../kernel/types';
import { MIRROR_NAMES, REGISTRY } from '../levels/levels';
import { MAP_WORDS, buildTranscript, schemaInfo, type EqLine, type Item, type ProseLine, type State } from './proof';
import { adapt } from './transcript';
import { campaignOf, deskFact, displayNo, openView, progressOf, richHTML, esc, fH, h, labels as labels0, nameHTML, safe, statementOf, tH, type S, type Store } from './util';

export interface PaperLine {
  no: number;
  /** Room nesting (0 = the main argument). */
  depth: number;
  kind: 'eq' | 'prose';
  /** eq: null lhs = a continuation ("= rhs" under the previous line's "="). */
  lhs?: Term | null;
  rel?: '=' | '≠';
  rhs?: Term;
  /** prose: typeset HTML. */
  html?: string;
  /** A short statement line (a membership) that sits in the equations' columns, reason aligned with theirs. */
  inline?: boolean;
  /** Plain-words reason, HTML ('' = none). Rendered in parentheses. */
  reason: string;
  nodes: NodeId[];
}
export interface Paper { lines: PaperLine[]; solved: boolean }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** A given's name is a label (h, h₂, H) rather than a restated statement. */
const shortName = (n: string) => /^[A-Za-z][′']?[₀-₉]*$/.test(n.trim());
const math = (html: string) => `<span class="math">${html}</span>`;

/** Every node a node's fact depends on (inputs, cited rules, a room's contents for its exit). */
function depsOf(n: ProofNode, nodes: ProofNode[]): NodeId[] {
  switch (n.k) {
    case 'step': return [n.input, ...(n.op.k === 'rewrite' && n.op.rule.k === 'node' ? [n.op.rule.id] : [])];
    case 'apply': return [...n.inputs, ...(n.rule.k === 'node' ? [n.rule.id] : [])];
    case 'merge': case 'clash': case 'product': return [...n.inputs];
    case 'exit': return [n.input, ...nodes.filter((m) => m.k === 'assume' && m.room === n.room).map((m) => m.id)];
    case 'press': case 'generalize': return [n.input];
    default: return [];
  }
}

/** The proof on paper, from the transcript of the current floor. */
export function buildPaper(st: State): Paper {
  const tr = buildTranscript(st);
  const g = st.graph;
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const L = { ...labels0(st.level), ...Object.fromEntries((g.vars ?? []).map((v) => [v.id, v.label])) };
  const factOf = (id: NodeId): Fact | undefined => st.check.nodes[id]?.fact;

  // what the delivered statements actually use (all of it while the order is unsolved)
  let needed: Set<NodeId> | null = null;
  const fills = st.check.sockets.filter((x) => x.ok && x.filledBy).map((x) => x.filledBy!);
  if (tr.solved && fills.length) {
    needed = new Set();
    const stack = [...fills];
    while (stack.length) {
      const id = stack.pop()!;
      if (needed.has(id)) continue;
      needed.add(id);
      const n = byId.get(id);
      if (n) stack.push(...depsOf(n, g.nodes));
    }
  }
  const keepNodes = (ids: NodeId[]) => !needed || ids.some((id) => needed!.has(id));

  // pass 1: decide which items stay, and split each machine's line into one line per rule (b = be, = bac)
  type Row =
    | { depth: number; kind: 'assume'; room: Room; nodes: NodeId[] }
    | { depth: number; kind: 'prose'; item: ProseLine; nodes: NodeId[]; span?: [number, number] }
    | { depth: number; kind: 'eq'; lhs: Term | null; rel: '=' | '≠'; rhs: Term; nodes: NodeId[]; why: ProofNode[]; flip: boolean; line: EqLine & { refs?: NodeId[] } };
  const rows: Row[] = [];
  const eqFact = (id: NodeId) => { const f = factOf(id); return f && (f.k === 'eq' || f.k === 'neq') ? f : undefined; };
  /** One row per step of a station, when the station rewrites one side only (else the transcript's line as is). */
  const expand = (l: EqLine & { refs?: NodeId[] }, depth: number): Row[] => {
    const ns = l.nodes.map((id) => byId.get(id)).filter((n): n is ProofNode => !!n);
    const fs = ns.map((n) => eqFact(n.id));
    const last = fs[fs.length - 1];
    // a chain read backwards (left-side rewrites shown ending at the fixed right side) uses each rule the other way
    const flip = !!last && !same(l.rhs, last.r) && ns.length > 0 && ns.every((n) => n.k === 'step');
    const one: Row = { depth, kind: 'eq', lhs: l.lhs, rel: l.rel, rhs: l.rhs, nodes: l.nodes, why: ns, flip, line: l };
    if (l.side === 'l') {
      // the left side simplified forwards: one row per rule, each the left side after it (X = X₁ = X₂ …)
      one.flip = false;
      if (ns.length < 2 || !fs.every((f) => f && f.k === 'eq')) return [one];
      const out: Row[] = [];
      ns.forEach((n, j) => {
        const prev = out[out.length - 1];
        if (prev && prev.kind === 'eq' && same(prev.rhs, fs[j]!.l)) { prev.why.push(n); prev.nodes.push(n.id); return; }
        out.push({ depth, kind: 'eq', lhs: j === 0 ? l.lhs : null, rel: '=', rhs: fs[j]!.l, nodes: [n.id], why: [n], flip: false, line: l });
      });
      return out;
    }
    if (ns.length < 2 || !last || !ns.every((n) => n.k === 'step') || !fs.every((f) => f && f.k === last.k)) return [one];
    const out: Row[] = [];
    const push = (lhs: Term | null, rhs: Term, n: ProofNode) => {
      const prev = out[out.length - 1];
      if (prev && prev.kind === 'eq' && same(prev.rhs, rhs)) { prev.why.push(n); prev.nodes.push(n.id); return; } // a step that changed nothing visible
      out.push({ depth, kind: 'eq', lhs, rel: l.rel, rhs, nodes: [n.id], why: [n], flip, line: l });
    };
    if (!flip && fs.every((f) => same(f!.l, last.l)) && same(l.rhs, last.r)) {
      ns.forEach((n, j) => push(j === 0 ? l.lhs : null, fs[j]!.r, n));
      return out;
    }
    if (flip && fs.every((f) => same(f!.r, last.r)) && (!l.lhs || same(l.lhs, last.l))) {
      const lefts = [l.rhs, ...fs.map((f) => f!.l)];
      for (let j = ns.length - 1; j >= 0; j--) push(j === ns.length - 1 ? l.lhs : null, lefts[j]!, ns[j]!);
      return out;
    }
    return [one];
  };
  const exitRoom = (it: Item): string | null => {
    if (it.t !== 'prose') return null;
    const n = byId.get(it.nodes[0] ?? '');
    return n?.k === 'exit' ? n.room : null;
  };
  // The proof as blocks: a chain of lines (one equation and its "= …" continuations), or a room (its opening
  // line, its argument, and the conclusion that follows it). Blocks are then put in dependency order, so a line
  // never cites a later one (a fact built outside a room comes before the room that uses it).
  type RoomMark = { roomSpan: true };
  type Block = { k: 'rows'; rows: Row[] } | { k: 'room'; head: Row; inner: Block[]; after: Row[] };
  const addRows = (rs: Row[], into: Block[]) => {
    for (const r of rs) {
      const last = into[into.length - 1];
      if (r.kind === 'eq' && r.lhs === null && last?.k === 'rows' && last.rows[last.rows.length - 1]?.kind === 'eq') last.rows.push(r);
      else into.push({ k: 'rows', rows: [r] });
    }
  };
  const walk = (its: Item[], depth: number): Block[] => {
    const out: Block[] = [];
    // a room's conclusion ("Hence ab ≠ a", and the work on it) follows its room at once, as on paper
    const here = new Set(its.filter((x) => x.t === 'room').map((x) => (x as { room: Room }).room.id));
    const after = new Map<string, Item[]>();
    const rest: Item[] = [];
    for (let i = 0; i < its.length; i++) {
      const r = exitRoom(its[i]!);
      if (r && here.has(r)) {
        const run = [its[i]!];
        while (i + 1 < its.length && its[i + 1]!.t === 'eq') run.push(its[++i]!);
        after.set(r, [...(after.get(r) ?? []), ...run]);
      } else rest.push(its[i]!);
    }
    let prevKept = false;
    const one = (it: Item, into: Block[], mark?: boolean) => {
      if (it.t === 'eq' && it.ghost) return;
      const ns = (it as { nodes: NodeId[] }).nodes;
      const keep: boolean = ns.length ? keepNodes(ns) : prevKept; // a closing "= R" line follows its chain
      prevKept = keep;
      if (!keep) return;
      if (it.t === 'prose') addRows([{ depth, kind: 'prose', item: it, nodes: it.nodes, ...(mark ? { span: [0, 0] as [number, number], roomSpan: true } : {}) } as Row], into);
      else if (it.t === 'eq') addRows(expand(it, depth), into);
    };
    for (const it of rest) {
      if (it.t === 'room') {
        const assume = g.nodes.filter((n) => n.k === 'assume' && n.room === it.room.id).map((n) => n.id);
        const head: Row = { depth, kind: 'assume', room: it.room, nodes: assume };
        const inner = walk(it.items, depth + 1);
        const kept = !(inner.length === 0 && !keepNodes(assume)); // an unused room leaves no trace
        prevKept = false;
        const tail: Block[] = [];
        (after.get(it.room.id) ?? []).forEach((x, i) => one(x, tail, i === 0 && kept));
        if (kept) out.push({ k: 'room', head, inner, after: tail.flatMap((b) => (b.k === 'rows' ? b.rows : [])) });
        else out.push(...tail);
        continue;
      }
      one(it, out);
    }
    return order(out);
  };
  /** Node ids a block states, and the ones it uses from elsewhere. */
  const rowsOf = (b: Block): Row[] => (b.k === 'rows' ? b.rows : [b.head, ...b.inner.flatMap(rowsOf), ...b.after]);
  const provides = (b: Block) => new Set(rowsOf(b).flatMap((r) => r.nodes)); // (a concluding line's fact is computed by the rows it cites)
  const needs = (b: Block, own: Set<NodeId>) => {
    const out = new Set<NodeId>();
    for (const r of rowsOf(b)) {
      const ids = [...r.nodes.flatMap((id) => { const n = byId.get(id); return n ? depsOf(n, g.nodes) : []; }), ...(r.kind === 'eq' ? [...(r.line.from ?? []), ...(r.line.refs ?? [])] : [])];
      for (const id of ids) if (!own.has(id)) out.add(id);
    }
    return out;
  };
  /** Stable topological order: each block as early as the transcript put it, but after every block it uses. */
  function order(bs: Block[]): Block[] {
    const prov = bs.map(provides), need = bs.map((b, i) => needs(b, prov[i]!));
    const placed: boolean[] = bs.map(() => false), out: Block[] = [];
    const ready = (i: number) => bs.every((_, j) => j === i || placed[j] || ![...need[i]!].some((id) => prov[j]!.has(id)));
    while (out.length < bs.length) {
      let pick = bs.findIndex((_, i) => !placed[i] && ready(i));
      if (pick < 0) pick = placed.findIndex((p) => !p); // a cycle cannot happen in a proof; keep the order if it does
      placed[pick] = true; out.push(bs[pick]!);
    }
    return out;
  }
  const flat = (bs: Block[]) => {
    for (const b of bs) {
      if (b.k === 'rows') { rows.push(...b.rows); continue; }
      const first = rows.length + 1;
      rows.push(b.head);
      flat(b.inner);
      const last = rows.length;
      for (const r of b.after) { if (r.kind === 'prose' && (r as Row & Partial<RoomMark>).roomSpan) r.span = [first, last]; rows.push(r); }
    }
  };
  flat(walk(tr.items, 0));
  // where each fact is written: the first line that shows it, except that a concluding line ("X′ = Y, from …")
  // is where its fact is STATED, so later lines cite that line (rawLineOf still finds the computation)
  const rawLineOf = new Map<NodeId, number>();
  rows.forEach((o, i) => o.nodes.forEach((id) => { if (!rawLineOf.has(id)) rawLineOf.set(id, i + 1); }));
  const lineOf = new Map(rawLineOf);
  rows.forEach((o, i) => { if (o.kind === 'eq' && o.line.owns) lineOf.set(o.line.owns, i + 1); });
  const lineRef = (id: NodeId): string => { const k = lineOf.get(id); return k ? `line ${k}` : ''; };

  // ── reasons, in plain words ──
  const givenName = (id: NodeId) => {
    const n = byId.get(id);
    const gd = n?.k === 'given' ? st.level.givens.find((x) => x.id === n.givenId) : undefined;
    return gd ? (shortName(gd.name) ? math(`<i>${nameHTML(gd.name)}</i>`) : `the hypothesis ${math(fH(gd.fact, L, 'proof'))}`) : '';
  };
  const withSubst = (sub: Record<string, Term>) => {
    const ks = Object.keys(sub);
    return ks.length ? ` with ${ks.map((m) => math(`<i>${esc(m)}</i> = ${tH(sub[m]!, L, 'proof')}`)).join(', ')}` : '';
  };
  const schemaName = (id: string, mirror: boolean, structs?: Record<string, string>) => {
    // the map laws name the actual map: "φ is a homomorphism", "acting by a product"
    if (MAP_WORDS[id]) {
      const f = structs?.f ? L[structs.f] ?? structs.f : 'f';
      return id === 'hom.mul' ? `${math(`<i>${esc(f)}</i>`)} is a homomorphism` : esc(MAP_WORDS[id]!);
    }
    const sc = st.ctx.registry[id];
    if (sc?.origin === 'authored') return esc(sc.name);
    if (mirror && MIRROR_NAMES[id]) return esc(MIRROR_NAMES[id]!.textbook);
    if (REGISTRY[id]) return esc(REGISTRY[id]!.textbook);
    return esc(schemaInfo(id, mirror, st.ctx).textbook);
  };
  /** A cited fact: a given by name, the room's assumption, Lagrange, or an earlier line. */
  const cite = (id: NodeId): string => {
    const n = byId.get(id);
    if (!n) return '';
    if (n.k === 'given') return givenName(id);
    if (n.k === 'assume') return 'the assumption';
    if (n.k === 'press') return 'Lagrange’s theorem';
    return lineRef(id) ? `by ${lineRef(id)}` : '';
  };
  /** "line 11 and line 12" reads as "lines 11 and 12". */
  const linesOf = (xs: string[]) => (xs.length > 1 && xs.every((x) => /^line \d+$/.test(x)) ? `lines ${xs.map((x) => x.slice(5)).join(' and ')}` : xs.join(' and '));
  /** A citation without its "by" (after "from" / "multiply"). */
  const bare = (id: NodeId) => cite(id).replace(/^by /, '');
  const backwards = (rev: boolean) => (rev ? ', read right to left' : '');
  const nodeReason = (n: ProofNode, flip: boolean): string => {
    switch (n.k) {
      case 'step': {
        const op = n.op;
        if (op.k === 'insertE') return 'identity';
        if (op.k === 'swap') return 'symmetry';
        if (op.k === 'invert') return 'invert both sides';
        if (op.k === 'lift') return `multiply on the ${op.side} by ${math(tH(op.term, L, 'proof'))}`;
        if (op.k === 'applyMap') return `apply ${math(`<i>${esc(L[op.fn] ?? op.fn)}</i>`)} to both sides`;
        const r = op.rule, rev = (op.dir === 'rev') !== flip;
        if (r.k === 'axiom') return r.id === 'unitL' || r.id === 'unitR' ? 'identity' : 'inverse';
        if (r.k === 'schema') return `${schemaName(r.id, !!r.mirror, op.structs)}${backwards(rev)}`;
        const c = cite(r.id);
        return c ? `${c}${withSubst(op.subst)}${backwards(rev)}` : '';
      }
      case 'apply': {
        const r = n.rule;
        const from = n.inputs.map(bare).filter(Boolean);
        const head = r.k === 'schema' ? schemaName(r.id, !!r.mirror, n.structs) : r.k === 'node' ? `${cite(r.id)}${withSubst(n.subst)}` : 'identity';
        return from.length ? `${head}, from ${linesOf(from)}` : head;
      }
      case 'merge': { const xs = n.inputs.map(bare).filter(Boolean); return xs.length ? `from ${linesOf(xs)}` : 'transitivity'; }
      case 'product': { const xs = n.inputs.map(bare).filter(Boolean); return xs.length ? `multiply ${xs.join(' and ')}` : 'multiply the two equations'; }
      case 'given': { const gd = st.level.givens.find((x) => x.id === n.givenId); return gd && shortName(gd.name) ? `given ${math(`<i>${nameHTML(gd.name)}</i>`)}` : 'given'; }
      case 'start': return '';
      default: return '';
    }
  };
  const joinReasons = (rs: string[]) => { const seen: string[] = []; for (const r of rs) if (r && !seen.includes(r)) seen.push(r); return seen.join('; '); };

  // ── pass 2: write the lines ──
  const proseHTML = (p: ProseLine): string => p.parts.map((x) => {
    // prose names Tower variables ("Since x₁ was arbitrary"): set them as maths, x<sub>1</sub>, never raw ₁ glyphs
    if ('text' in x) return esc(x.text).replace(/([A-Za-z])([₀-₉]+)/g, (_m, a: string, d: string) => math(`<i>${a}</i><sub class="m-sub">${[...d].map((c) => c.charCodeAt(0) - 0x2080).join('')}</sub>`));
    if ('fact' in x) return math(fH(x.fact, L, 'proof'));
    // a hypothesis is cited by its statement, then its name in brackets when it has a short one (h₁), never twice
    if ('given' in x) { const gd = st.level.givens.find((y) => y.id === x.given); return gd ? `${math(fH(gd.fact, L, 'proof'))}${shortName(gd.name) ? ` (given ${math(`<i>${nameHTML(gd.name)}</i>`)})` : ' (given)'}` : ''; }
    const k = lineOf.get(x.ref); return k ? ` (line ${k})` : '';
  }).join('');
  const lines: PaperLine[] = rows.map((o, i) => {
    const no = i + 1;
    if (o.kind === 'assume') {
      const r = o.room;
      const as = r.assumes;
      const facts: Fact[] = as?.length
        ? as.map(deskFact)
        : [r.kind === 'suppose' || (r.kind === 'assume' && r.rel !== 'neq') ? { k: 'eq', l: r.l, r: r.r } : { k: 'neq', l: r.l, r: r.r }];
      const list = facts.map((f) => math(fH(f, L, 'proof'))).join(' and ');
      const intro = r.kind === 'assume' ? 'Assume' : r.kind === 'suppose' ? 'Suppose, for contradiction, that' : 'Suppose, towards a contradiction, that';
      return { no, depth: o.depth, kind: 'prose', html: `${intro} ${list}.`, reason: '', nodes: o.nodes };
    }
    // a room's conclusion cites the argument it closes: (lines 1–4)
    // Book phase B: a membership line is a statement with its reason, like an equation: 1. a⁻¹ ∈ H  (closed under inverses, from g)
    if (o.kind === 'prose' && o.item.mem) {
      const ns = o.item.nodes.map((id) => byId.get(id)).filter((n): n is ProofNode => !!n);
      return { no, depth: o.depth, kind: 'prose', inline: true, html: math(fH(o.item.mem.fact, L, 'proof')), reason: joinReasons(ns.map((n) => nodeReason(n, false))) || esc(o.item.mem.just), nodes: o.nodes };
    }
    if (o.kind === 'prose') return { no, depth: o.depth, kind: 'prose', html: proseHTML(o.item).replace(/ \((discharging the assumption)\)\.$/, '.'), reason: o.span ? `lines ${o.span[0]}–${o.span[1]}` : '', nodes: o.nodes };
    const l = o.line;
    let reason: string;
    if (l.from?.length && !o.why.length) {
      // a concluding line: the two facts it combines (the equation, and the computation of its left side)
      const xs = l.from.map((id) => { const n = byId.get(id); if (n?.k === 'given') return givenName(id); if (n?.k === 'assume') return 'the assumption'; const k = id === l.owns ? rawLineOf.get(id) : lineOf.get(id); return k ? `line ${k}` : ''; }).filter(Boolean);
      reason = xs.length ? `from ${linesOf(xs)}` : '';
    } else if (!o.why.length) {
      // the closing line of a chain read backwards: its reason is where the right side came from
      reason = /^assumption/.test(l.just) ? 'the assumption' : /^given/.test(l.just) ? `given ${math(`<i>${nameHTML(l.just.replace(/^given\s*/, ''))}</i>`)}` : (l.refs ?? []).map(cite).filter(Boolean).join(', ');
    } else {
      reason = joinReasons(o.why.map((n) => nodeReason(n, o.flip)));
      const extraRefs = (l.refs ?? []).filter((id) => !l.nodes.some((x) => { const n = byId.get(x); return n && depsOf(n, g.nodes).includes(id); })).map(cite).filter(Boolean);
      if (extraRefs.length) reason = joinReasons([reason, ...extraRefs]);
    }
    return { no, depth: o.depth, kind: 'eq', lhs: o.lhs, rel: o.rel, rhs: o.rhs, reason, nodes: o.nodes };
  });
  return { lines, solved: tr.solved };
}

/** The theorem statement for the head of the page: "If h₁ and h₂, then …" or "For all …". */
export function theoremHTML(st: State): string {
  // open docks: hole chips, filled with the kernel's answer once the statement is proved
  const ov = openView(st.level, Object.fromEntries(st.check.sockets.filter((x) => x.ok && x.holes).map((x) => [x.id, x.holes!])));
  return ov.chips(theoremHTML0({ ...st, level: ov.level }));
}
function theoremHTML0(st: State): string {
  const lv = st.level;
  if (lv.sockets.some((k) => k.target.k === 'law' || k.target.k === 'cond')) return statementOf(lv).html;
  const L = labels0(lv);
  const allowed = new Set(lv.sockets.flatMap((k) => k.allowedGivens));
  const gs = lv.givens.filter((g) => allowed.has(g.id));
  const size = gs.find((g) => g.fact.k === 'size');
  const hyps = gs.filter((g) => g.fact.k !== 'size').map((g) => math(fH(g.fact, L)));
  const goals = lv.sockets.map((k) => math(fH(k.target, L))).join(' and ');
  const pre = size && size.fact.k === 'size' ? `In a group of order ${size.fact.n}, ` : '';
  if (!hyps.length) return `${pre}${goals}.`.replace(/^./, (c) => c.toUpperCase());
  return `${pre}${pre ? 'if' : 'If'} ${hyps.join(' and ')}, then ${goals}.`;
}

/** The page: Lemma n (Title). Statement. [Method · …] Proof. numbered lines. ∎ */
/**
 * opts.head: the "Lemma n (Title). statement" line (off inside the ceremony, which states it already).
 * opts.insight: the Book's specific insight as the page's subtitle. Only after ∎ (it would spoil the level), so
 * it also needs the proof on the page to be complete.
 */
export function paperHTML(p: Paper, st: State, opts: { head?: boolean; insight?: boolean } = {}): string {
  const lv = st.level;
  const L = { ...labels0(lv), ...Object.fromEntries((st.graph.vars ?? []).map((v) => [v.id, v.label])) };
  const book = campaignOf(lv) === 'book';
  const no = book ? displayNo(lv) : String(lv.index);
  let html = opts.head === false ? '' : `<p class="pp-thm"><b>Lemma ${esc(no)}</b> <span class="pp-title">(${esc(lv.title)})</span>. ${safe(() => theoremHTML(st), '')}</p>`;
  if (book && lv.method) html += `<p class="pp-method"><span class="pp-k">Method</span> · ${richHTML(lv.method, lv)}</p>`;
  if (book && opts.insight && p.solved && lv.insight) html += `<p class="pp-insight">${richHTML(lv.insight, lv)}</p>`;
  html += '<p class="pp-proof"><i>Proof.</i></p>';
  if (!p.lines.length) return `${html}<p class="pp-empty">Nothing is written yet. Each machine you build adds a line.</p>`;
  let grid: string[] = [];
  let gridDepth = 0;
  const flush = () => { if (grid.length) { html += `<div class="pp-grid" style="--d:${gridDepth}">${grid.join('')}</div>`; grid = []; } };
  for (const l of p.lines) {
    if (l.depth !== gridDepth) { flush(); gridDepth = l.depth; }
    const why = l.reason ? `<span class="pp-why">(${l.reason})</span>` : '<span class="pp-why"></span>';
    const nodes = `data-nodes="${l.nodes.join(' ')}"`;
    if (l.kind === 'prose' && l.inline) {
      grid.push(`<div class="pp-row prose" ${nodes}><span class="pp-no">${l.no}.</span><span class="pp-text">${l.html}</span>${why}</div>`);
      continue;
    }
    if (l.kind === 'prose') {
      // a sentence gets its own row block, so it never widens the columns of the equations around it
      flush();
      html += `<div class="pp-grid pp-prose" style="--d:${gridDepth}"><div class="pp-row prose" ${nodes}><span class="pp-no">${l.no}.</span><span class="pp-text">${l.html}</span>${why}</div></div>`;
      continue;
    }
    grid.push(`<div class="pp-row" ${nodes}><span class="pp-no">${l.no}.</span>`
      + `<span class="pp-lhs math">${l.lhs ? tH(l.lhs, L, 'proof') : ''}</span>`
      + `<span class="pp-rel math">${l.rel === '≠' ? '≠' : '='}</span>`
      + `<span class="pp-rhs math">${tH(l.rhs!, L, 'proof')}</span>${why}</div>`);
  }
  flush();
  html += p.solved ? '<p class="pp-end"><span class="tomb" title="Q.E.D."></span></p>'
    : '<p class="pp-open">Not finished: a dock is still waiting for its statement.</p>';
  return html;
}

/** The current floor's proof on paper (HTML). */
export function paperOf(s: S, opts: { head?: boolean } = {}): string {
  const { st } = adapt(s);
  const insight = !!progressOf(s.save, s.level.id)?.solvedAt; // after ∎ only
  return safe(() => paperHTML(buildPaper(st), st, { ...opts, insight }), '<p class="pp-empty">The proof could not be written out.</p>');
}

/** The Paper sheet: a calm page over the floor, opened from the proof panel (T) in any order. */
export function mountPaper(layer: HTMLElement, store: Store) {
  const el = h('section', { class: 'h3-paper', hidden: true, role: 'dialog', 'aria-label': 'The proof on paper' });
  const close = h('button', { class: 'h3-x', 'aria-label': 'Close (Esc)' }, '×');
  close.addEventListener('click', () => store.setUI({ paperOpen: false }));
  const body = h('div', { class: 'pp-page' });
  el.append(h('header', { class: 'h3-drawer-head' }, h('span', { class: 'h3-label' }, 'On paper'), h('span', { class: 'h3-flex' }), close), body);
  layer.append(el);
  window.addEventListener('keydown', (e) => {
    if (el.hidden || e.key !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation();
    store.setUI({ paperOpen: false });
  }, true);
  let lastComp: unknown = null, lastLevel = '';
  const render = (s: S) => {
    const open = s.ui.screen === 'floor' && !!s.ui.paperOpen && !s.ui.ceremony;
    if (el.hidden === open) el.hidden = !open;
    if (!open) { lastComp = null; return; }
    if (s.compiled === lastComp && s.level.id === lastLevel) return;
    lastComp = s.compiled; lastLevel = s.level.id;
    body.innerHTML = paperOf(s);
  };
  return { render, el };
}
