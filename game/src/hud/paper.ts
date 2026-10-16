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
import type { Fact, LevelManifest, NodeId, ProofNode, Room, Term } from '../kernel/types';
import { LEVEL_BY_ID, MIRROR_NAMES, REGISTRY } from '../levels/levels';
import { BOOK_LEVELS } from '../levels/book';
import { MAP_WORDS, buildTranscript, graphLabels, schemaInfo, type EqLine, type Item, type ProseLine, type State } from './proof';
import { adapt } from './transcript';
import { groupAliases, withEAliases, campaignOf, deskFact, displayNo, openView, progressOf, richHTML, esc, fH, h, labels as labels0, nameHTML, safe, statementOf, tH, type S, type Store } from './util';

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
  /** eq: factor ranges [from, to) of the right side's word to print in parentheses (a rule's instance, b(ba)(ba)a). */
  groups?: [number, number][];
  /** eq: the same for the left side (a Spool's term, showing the instance a rule then matches). */
  lhsGroups?: [number, number][];
  /** Plain-words reason, HTML ('' = none). Rendered in parentheses. */
  reason: string;
  nodes: NodeId[];
}
export interface Paper { lines: PaperLine[]; solved: boolean }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** A given's name is a label (h, h₂, H) rather than a restated statement. */
const shortName = (n: string) => /^[A-Za-z][′']?[₀-₉]*$/.test(n.trim());
const math = (html: string) => `<span class="math">${html}</span>`;
/** A given's name that is a name ("ker π ⊆ ker f", "section of f"), not its own statement restated ("a² = e", "a ∈ H"). */
const namedGiven = (n: string) => !shortName(n) && !/[=≠∈]|^\|/.test(n);

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

/** Labels for the page: the level's (maps by their names, π never "pi"; sorts; subgroups), then the floor's Towers. */
const paperLabels = (lv: LevelManifest, g: Parameters<typeof graphLabels>[1]): Record<string, string> => ({ ...labels0(lv), ...graphLabels(lv, g) });

/** The proof on paper, from the transcript of the current floor. */
export function buildPaper(st: State): Paper {
  const tr = buildTranscript(st);
  const g = st.graph;
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const L = paperLabels(st.level, g);
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
    | { depth: number; kind: 'eq'; lhs: Term | null; rel: '=' | '≠'; rhs: Term; nodes: NodeId[]; why: ProofNode[]; flip: boolean; line: EqLine & { refs?: NodeId[] };
      /** A stated intermediate fact: it follows from `input` (when the computation started from an equation) and lines from…to. */
      states?: { input?: NodeId; from: Row; to: Row } };
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
  function order(bs0: Block[]): Block[] {
    const bs = [...bs0];
    let prov = bs.map(provides), need = bs.map((b, i) => needs(b, prov[i]!));
    let placed: boolean[] = bs.map(() => false);
    const out: Block[] = [];
    const ready = (i: number) => bs.every((_, j) => j === i || placed[j] || ![...need[i]!].some((id) => prov[j]!.has(id)));
    while (out.length < bs.length) {
      let pick = bs.findIndex((_, i) => !placed[i] && ready(i));
      if (pick < 0 && splitOne()) continue;
      if (pick < 0) pick = placed.findIndex((p) => !p); // nothing left to split: keep the order
      placed[pick] = true; out.push(bs[pick]!);
    }
    return out;
    /**
     * Two chains that use each other's results (final playtest N2, P13.4: a branched floor printed "by line 19" on
     * line 14). A proof has no cycle, so some chain can be cut: print its first lines, up to where it needs the
     * other chain, and resume it after (restating its first term, so the resumed lines read as an equation).
     */
    function splitOne(): boolean {
      const have = new Set(bs.flatMap((_, j) => (placed[j] ? [...prov[j]!] : [])));
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i]!;
        if (placed[i] || b.k !== 'rows' || b.rows.length < 2) continue;
        const own = new Set<NodeId>();
        let p = 0;
        for (const r of b.rows) {
          const ext = [...needs({ k: 'rows', rows: [r] }, new Set([...own, ...r.nodes]))].filter((id) => !have.has(id));
          if (ext.some((id) => bs.some((x, j) => j !== i && !placed[j] && prov[j]!.has(id)))) break;
          r.nodes.forEach((id) => own.add(id)); p++;
        }
        if (p < 1 || p >= b.rows.length) continue;
        const head = b.rows[0]!, rest = b.rows.slice(p);
        const first = rest[0]!;
        const resumed: Row = first.kind === 'eq' && first.lhs === null && head.kind === 'eq' ? { ...first, lhs: head.lhs } : first;
        bs.splice(i, 1, { k: 'rows', rows: b.rows.slice(0, p) }, { k: 'rows', rows: [resumed, ...rest.slice(1)] });
        placed.splice(i + 1, 0, false);
        prov = bs.map(provides); need = bs.map((x, j) => needs(x, prov[j]!));
        return true;
      }
      return false;
    }
  }
  const flat = (bs: Block[]) => {
    for (const b of bs) {
      if (b.k === 'rows') { rows.push(...b.rows); continue; }
      const first = rows.length + 1;
      rows.push(b.head);
      flat(b.inner);
      const last = rows.length;
      for (const r of b.after) { if (r.kind === 'prose' && (r as Row & Partial<RoomMark>).roomSpan) { r.span = [first, last]; spanHead.set(r, b.head); } rows.push(r); }
    }
  };
  const spanHead = new Map<Row, Row>();
  flat(walk(tr.items, 0));
  joinChains();
  stateCited();
  // a room's conclusion cites the room's lines: from its opening line to the line before the conclusion
  for (const [r, head] of spanHead) if (r.kind === 'prose') r.span = [rows.indexOf(head) + 1, rows.indexOf(r)];

  /**
   * Cite the line that states the fact used (final playtest N2, P13.4: "by line 13" pointed at a line reading "= b³"
   * when the fact used was b³ = e). A chain that simplifies one side of an equation shows the new side on each line,
   * but each step's fact is the whole equation (b³ = e). When another line uses such a fact, state it on its own line
   * after the chain: "b³ = e (from line 9 and lines 10–13)".
   */
  function stateCited() {
    type EqRow = Extract<Row, { kind: 'eq' }>;
    const isEq = (r: Row | undefined): r is EqRow => !!r && r.kind === 'eq';
    const cited = (r: Row): NodeId[] => (r.kind !== 'eq' ? [] : r.why.flatMap((n) => {
      if (n.k === 'step' && n.op.k === 'rewrite' && n.op.rule.k === 'node') return [n.op.rule.id];
      if (n.k === 'apply') return [...n.inputs, ...(n.rule.k === 'node' ? [n.rule.id] : [])];
      if (n.k === 'merge' || n.k === 'product') return [...n.inputs];
      return [];
    }));
    const done = new Set<NodeId>();
    for (let x = 0; x < rows.length; x++) {
      for (const id of cited(rows[x]!)) {
        if (done.has(id)) continue;
        const k = rows.findIndex((r) => r.nodes.includes(id));
        const rk = rows[k], f = eqFact(id);
        if (!isEq(rk) || !f || rows.some((r) => isEq(r) && r.line.owns === id)) continue; // already stated
        let a = k;
        while (a > 0 && (rows[a] as EqRow).lhs === null && isEq(rows[a - 1])) a--;
        let e = k;
        while (isEq(rows[e + 1]) && (rows[e + 1] as EqRow).lhs === null) e++;
        if (x >= a && x <= e) continue;
        const L0 = (rows[a] as EqRow).lhs, R0 = rk.rhs;
        const rel = f.k === 'eq' ? '=' : '≠';
        if (L0 && rel === rk.rel && ((same(f.l, L0) && same(f.r, R0)) || (same(f.r, L0) && same(f.l, R0)))) continue;
        // where the computation started: the equation the chain's first step was applied to (if it is not the chain)
        const n0 = (rows[a] as EqRow).why[0];
        const inp = n0?.k === 'step' && !rows.slice(a, e + 1).some((r) => r.nodes.includes(n0.input)) ? n0.input : undefined;
        const line: EqLine = { t: 'eq', lhs: f.l, rel, rhs: f.r, just: '', nodes: [], family: 'equation', classical: false, owns: id };
        rows.splice(e + 1, 0, { depth: rk.depth, kind: 'eq', lhs: f.l, rel, rhs: f.r, nodes: [], why: [], flip: false, line, states: { ...(inp ? { input: inp } : {}), from: rows[a]!, to: rk } });
        done.add(id);
        if (x > e) x++;
      }
    }
  }

  /**
   * A Joiner's chain written as one chain (final playtest, P4.1): the two computations it joins, e′ = e′e and
   * e = e′e, read as e′ = e′e = e, instead of two lines, a "from lines 1 and 2" and a "(symmetry)". Done only when
   * nothing else cites the two computations, and the chain then states exactly the fact the Joiner (or the swap
   * after it) made.
   */
  function joinChains() {
    type EqRow = Extract<Row, { kind: 'eq' }>;
    type Step = { why: ProofNode[]; flip: boolean; nodes: NodeId[]; line: EqRow['line'] };
    type Chain = { terms: Term[]; steps: Step[]; rows: number[]; extra: NodeId[] };
    const isEq = (r: Row | undefined): r is EqRow => !!r && r.kind === 'eq';
    const continues = (k: number) => { const n = rows[k + 1]; return isEq(n) && n.lhs === null; };
    const reverse = (c: Chain): Chain => ({ ...c, terms: [...c.terms].reverse(), steps: [...c.steps].reverse().map((x) => ({ ...x, flip: !x.flip })) });
    const swapOf = (r: EqRow) => (r.why.length === 1 && r.why[0]!.k === 'step' && r.why[0]!.op.k === 'swap' ? r.why[0] as ProofNode & { k: 'step' } : null);
    const chainOf = (id: NodeId, depth: number): Chain | null => {
      const k = rows.findIndex((r) => r.nodes.includes(id));
      const end = rows[k];
      if (k < 0 || !isEq(end) || continues(k) || end.depth !== depth) return null;
      let a = k;
      while ((rows[a] as EqRow).lhs === null) { a--; const p = rows[a]; if (!isEq(p) || p.depth !== depth) return null; }
      const rs = rows.slice(a, k + 1) as EqRow[];
      if (rs.some((r) => r.rel !== '=' || !r.why.length)) return null;
      const sw = a === k ? swapOf(end) : null;
      if (sw) { const inner = chainOf(sw.input, depth); return inner ? { ...reverse(inner), rows: [...inner.rows, k], extra: [...inner.extra, ...end.nodes] } : null; }
      const terms = [rs[0]!.lhs!, ...rs.map((r) => r.rhs)];
      const f = eqFact(id);
      if (!f || f.k !== 'eq' || !((same(f.l, terms[0]) && same(f.r, terms[terms.length - 1])) || (same(f.r, terms[0]) && same(f.l, terms[terms.length - 1])))) return null;
      return { terms, steps: rs.map((r) => ({ why: r.why, flip: r.flip, nodes: r.nodes, line: r.line })), rows: rs.map((_, j) => a + j), extra: [] };
    };
    /** Which way a single rewrite reads from `from` to `to` (true: the rule read right to left). */
    const dirFlip = (x: Step, from: Term, to: Term): boolean => {
      const n = x.why.length === 1 ? x.why[0]! : null;
      if (n?.k !== 'step' || n.op.k !== 'rewrite') return x.flip;
      const side = (n.op.at as { side: 'l' | 'r' }).side;
      const I = eqFact(n.input), O = eqFact(n.id);
      if (!I || !O) return x.flip;
      if (same(from, I[side]) && same(to, O[side])) return false;
      if (same(from, O[side]) && same(to, I[side])) return true;
      return x.flip;
    };
    const refsOf = (r: Row): NodeId[] => [...r.nodes.flatMap((id) => { const n = byId.get(id); return n ? depsOf(n, g.nodes) : []; }), ...(r.kind === 'eq' ? [...(r.line.from ?? []), ...(r.line.refs ?? [])] : [])];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!isEq(r) || r.lhs === null || r.why.length !== 1 || r.why[0]!.k !== 'merge' || continues(i)) continue;
      const m = r.why[0] as ProofNode & { k: 'merge' };
      if (m.inputs.length !== 2) continue;
      const A = chainOf(m.inputs[0]!, r.depth), B = chainOf(m.inputs[1]!, r.depth);
      if (!A || !B || A.rows.some((x) => B.rows.includes(x))) continue;
      const drop = new Set([...A.rows, ...B.rows, i]);
      const extra = [...A.extra, ...B.extra, ...r.nodes];
      let target = eqFact(m.id);
      const nx = rows[i + 1];
      const sw = isEq(nx) && nx.lhs !== null && !continues(i + 1) ? swapOf(nx) : null;
      if (sw && sw.input === m.id) { target = eqFact(sw.id); drop.add(i + 1); extra.push(...nx!.nodes); }
      if (!target || target.k !== 'eq') continue;
      // nothing outside the joined rows may cite what they state (their lines disappear), and no dock takes it
      // (the Joiner's own fact, and the swap's, move to the chain's last line, so later lines may cite them)
      const own = new Set([...A.rows, ...B.rows].flatMap((x) => rows[x]!.nodes));
      const outsideUse = rows.some((o, x) => !drop.has(x) && refsOf(o).some((id) => own.has(id)))
        || st.check.sockets.some((k) => k.filledBy && own.has(k.filledBy));
      if (outsideUse) continue;
      let joined: Chain | null = null;
      for (const [X, Y] of [[A, B], [B, A]] as const) for (const x of [X, reverse(X)]) for (const y of [Y, reverse(Y)]) {
        if (joined || !same(x.terms[x.terms.length - 1], y.terms[0])) continue;
        const terms = [...x.terms, ...y.terms.slice(1)];
        if (same(terms[0], target.l) && same(terms[terms.length - 1], target.r)) joined = { terms, steps: [...x.steps, ...y.steps], rows: [], extra: [] };
      }
      if (!joined) continue;
      const J = joined;
      const made: Row[] = J.steps.map((x, j) => ({ depth: r.depth, kind: 'eq', lhs: j === 0 ? J.terms[0]! : null, rel: '=', rhs: J.terms[j + 1]!, nodes: [...x.nodes], why: x.why, flip: dirFlip(x, J.terms[j]!, J.terms[j + 1]!), line: x.line }));
      made[made.length - 1]!.nodes.push(...extra);
      const keep: Row[] = [];
      rows.forEach((o, x) => { if (x === i) keep.push(...made); else if (!drop.has(x)) keep.push(o); });
      rows.splice(0, rows.length, ...keep);
      i = -1; // rescan: indices moved
    }
  }
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
    if (!gd) return '';
    if (shortName(gd.name)) return math(`<i>${nameHTML(gd.name)}</i>`);
    // a hypothesis with a standard name is cited by it ("ker π ⊆ ker f"), never by its whole formula (finale playtest)
    return namedGiven(gd.name) ? richHTML(gd.name, st.level) : `the hypothesis ${math(fH(gd.fact, L, 'proof'))}`;
  };
  // an identity instantiation ("with x = x", "n = n": a Tower named like the law's own letter) says nothing
  const plain = (html: string) => html.replace(/<[^>]+>/g, '').trim();
  const withSubst = (sub: Record<string, Term>) => {
    const ks = Object.keys(sub).filter((m) => plain(tH(sub[m]!, L, 'proof')) !== m);
    return ks.length ? ` with ${ks.map((m) => math(`<i>${esc(m)}</i> = ${tH(sub[m]!, L, 'proof')}`)).join(', ')}` : '';
  };
  const schemaName = (id: string, mirror: boolean, structs?: Record<string, string>) => {
    // the map laws name the actual map: "φ is a homomorphism", "acting by a product"
    if (MAP_WORDS[id]) {
      const f = structs?.f ? L[structs.f] ?? structs.f : 'f';
      return id === 'hom.mul' ? `${math(`<i>${esc(f)}</i>`)} is a homomorphism` : esc(MAP_WORDS[id]!);
    }
    const sc = st.ctx.registry[id];
    // a reused lemma names where it was used: "fibre lemma ⟹ at π" (its homomorphism / subgroup / action binders)
    const at = (sc?.card.binds ?? []).filter((b) => b.k === 'hom' || b.k === 'sub' || b.k === 'act').map((b) => structs?.[b.id]).filter((x): x is string => !!x);
    const atHTML = at.length ? ` at ${at.map((x) => math(`<i>${esc(L[x] ?? x)}</i>`)).join(', ')}` : '';
    if (sc?.origin === 'authored') return `${esc(sc.name)}${atHTML}`;
    if (mirror && MIRROR_NAMES[id]) return esc(MIRROR_NAMES[id]!.textbook);
    if (REGISTRY[id]) return esc(REGISTRY[id]!.textbook);
    return esc(schemaInfo(id, mirror, st.ctx).textbook);
  };
  /** A lemma the player saved is named by its statement, so its use says where: "xy = e ⟹ yx = e with x = ab, y = c". */
  const savedSubst = (id: string, sub: Record<string, Term> | undefined) => (sub && st.ctx.registry[id]?.origin === 'authored' && !MAP_WORDS[id] ? withSubst(sub) : '');
  /** "the assumption"; in a room with several, the one meant: "the assumption xb⁻¹ ∈ H". */
  const assumptionName = (id: NodeId): string => {
    const n = byId.get(id);
    const many = n?.k === 'assume' && g.nodes.filter((m) => m.k === 'assume' && m.room === n.room).length > 1;
    const f = factOf(id);
    return many && f ? `the assumption ${math(fH(f, L, 'proof'))}` : 'the assumption';
  };
  /** A cited fact: a given by name, the room's assumption, Lagrange, or an earlier line. */
  const cite = (id: NodeId): string => {
    const n = byId.get(id);
    if (!n) return '';
    if (n.k === 'given') return givenName(id);
    if (n.k === 'assume') return assumptionName(id);
    if (n.k === 'press') {
      // with two groups, say which one: "Lagrange’s theorem in K"
      const sz = factOf(n.input);
      const grps = (st.level.sorts ?? []).filter((x) => x.kind === 'group');
      const sl = sz?.k === 'size' && sz.s && grps.length > 1 ? (st.level.sorts ?? []).find((x) => x.id === sz.s)?.label ?? L[sz.s] : null;
      return sl ? `Lagrange’s theorem in ${math(`<i>${nameHTML(sl)}</i>`)}` : 'Lagrange’s theorem';
    }
    return lineRef(id) ? `by ${lineRef(id)}` : '';
  };
  /** "line 11 and line 12" reads as "lines 11 and 12". */
  const linesOf = (xs: string[]) => {
    if (xs.length > 1 && xs.every((x) => /^line \d+$/.test(x))) return `lines ${xs.map((x) => x.slice(5)).join(' and ')}`;
    if (xs.length > 1 && xs.every((x) => x === 'the assumption')) return 'the assumptions';
    return xs.join(' and ');
  };
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
        if (r.k === 'schema') return `${schemaName(r.id, !!r.mirror, op.structs)}${savedSubst(r.id, op.subst)}${backwards(rev)}`;
        const c = cite(r.id);
        return c ? `${c}${withSubst(op.subst)}${backwards(rev)}` : '';
      }
      case 'apply': {
        const r = n.rule;
        const from = n.inputs.map(bare).filter(Boolean);
        const head = r.k === 'schema' ? `${schemaName(r.id, !!r.mirror, n.structs)}${savedSubst(r.id, n.subst)}` : r.k === 'node' ? `${cite(r.id)}${withSubst(n.subst)}` : 'identity';
        return from.length ? `${head}, from ${linesOf(from)}` : head;
      }
      case 'merge': { const xs = n.inputs.map(bare).filter(Boolean); return xs.length ? `from ${linesOf(xs)}` : 'transitivity'; }
      case 'product': { const xs = n.inputs.map(bare).filter(Boolean); return xs.length ? `multiply ${xs.join(' and ')}` : 'multiply the two equations'; }
      case 'given': { const gd = st.level.givens.find((x) => x.id === n.givenId); return gd && shortName(gd.name) ? `given ${math(`<i>${nameHTML(gd.name)}</i>`)}` : gd && namedGiven(gd.name) ? `given: ${richHTML(gd.name, st.level)}` : 'given'; }
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
  /** Prose names set as maths: "x₁" → x<sub>1</sub> (never raw ₁ glyphs). */
  const nameText = (t: string) => esc(t).replace(/([A-Za-z])([₀-₉]+)/g, (_m, a: string, d: string) => math(`<i>${a}</i><sub class="m-sub">${[...d].map((c) => c.charCodeAt(0) - 0x2080).join('')}</sub>`));
  /** The dock a node delivers to (directly, or through the dock's own auto-swap). */
  const dockOf = (id: NodeId): string | null => {
    for (const k of st.check.sockets) {
      if (!k.ok || !k.filledBy) continue;
      const f = byId.get(k.filledBy);
      if (k.filledBy === id || (f?.k === 'step' && f.op.k === 'swap' && f.input === id)) return k.id;
    }
    return null;
  };
  /**
   * ∀-introduction, written as a student writes it (final playtest, Paper nits): "Since G₁, K₁, f₁ and x₁ were
   * arbitrary, for all …". Every Tower the fact mentions is named (element variables, groups, maps), and a fact that
   * reaches a dock is stated exactly as the heading states that dock (same sides, same binders, same carriers).
   */
  const generalizeHTML = (n: ProofNode & { k: 'generalize' }): string | null => {
    const inF = factOf(n.input), outF = factOf(n.id);
    if (!inF || !outF) return null;
    const json = JSON.stringify(inF);
    const ss = g.structs ?? [];
    const homs = ss.filter((x) => x.k === 'hom' && json.includes(`"${x.id}"`));
    // a map's groups are bound with it (f₁ : G₁ → H₁ mentions G₁ and H₁ even where no e or sort tag does)
    const grpIds = new Set(homs.flatMap((x) => (x.k === 'hom' ? [x.dom, x.cod] : [])));
    const grps = ss.filter((x) => x.k === 'grp' && (grpIds.has(x.id) || json.includes(`"${x.id}"`)));
    const subs = ss.filter((x) => x.k === 'sub' && json.includes(`"id":"${x.id}"`));
    const vars = (g.vars ?? []).filter((v) => json.includes(`"id":"${v.id}"`));
    const bound = [...grps, ...homs, ...subs, ...vars].map((x) => x.label);
    const list = bound.length > 1 ? `${bound.slice(0, -1).join(', ')} and ${bound[bound.length - 1]}` : bound[0] ?? '';
    const lead = bound.length ? `Since ${nameText(list)} ${bound.length > 1 ? 'were' : 'was'} arbitrary, ` : 'Hence ';
    const sock = dockOf(n.id);
    const stmt = sock ? safe(() => dockStatementHTML(st, sock), null) : null;
    return `${lead}${stmt ?? factStatement(outF, L, sortLabelOf(st.level, L), false, {})}.`;
  };
  /**
   * Where a rule's instance sits in a printed word, so a compound instance shows its grouping (final playtest, P3.3:
   * "b(ba)(ba)a", not "bbabaa"). The word shown is the step's result (`flip` false) or its input (a chain read
   * backwards); the instance is the rule side that word contains. Only for a side of two or more factors with a
   * compound term at one of its letters, and never around the whole word.
   */
  const instanceGroups = (n: ProofNode, shown: Term, useInput: boolean): [number, number][] => {
    if (n.k !== 'step' || n.op.k !== 'rewrite' || shown.k !== 'mul') return [];
    const op = n.op;
    const at = op.at as { side: 'l' | 'r'; path: number[]; range?: [number, number]; gap?: number };
    if (at.path.length) return [];
    let rule: Fact | undefined;
    if (op.rule.k === 'node') rule = factOf(op.rule.id);
    else if (op.rule.k === 'schema') rule = st.ctx.registry[op.rule.id]?.card as Fact | undefined;
    if (!rule || (rule.k !== 'law' && rule.k !== 'eq')) return [];
    // the step's input word holds the rule's matched side, its result word the other side
    const pat = (op.dir !== 'rev') !== useInput ? rule.r : rule.l;
    const pf = pat.k === 'mul' ? pat.fs : [pat];
    if (pf.length < 2) return [];
    const src = useInput ? factOf(n.input) : factOf(n.id);
    if (!src || (src.k !== 'eq' && src.k !== 'neq') || !same(src[at.side], shown)) return [];
    const start = useInput ? at.range?.[0] : (at.range?.[0] ?? at.gap);
    if (start === undefined) return [];
    const sub = op.subst ?? {};
    const out: [number, number][] = [];
    let pos = start;
    for (const f of pf) {
      const v = f.k === 'meta' ? sub[f.id] : undefined;
      const len = v?.k === 'mul' ? v.fs.length : 1;
      if (v?.k === 'mul') {
        if (!same(shown.fs.slice(pos, pos + len), v.fs)) return [];
        out.push([pos, pos + len]);
      }
      pos += len;
    }
    if (pos > shown.fs.length) return [];
    return out.filter(([a, b]) => !(a === 0 && b === shown.fs.length));
  };
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
      let reason = joinReasons(ns.map((n) => nodeReason(n, false))) || esc(o.item.mem.just);
      // a Rewriter on a membership changes an earlier line's term: cite that line ("inverse, from line 2")
      const first = ns[0];
      if (first?.k === 'step' && !o.nodes.includes(first.input)) { const c = bare(first.input); if (c && !reason.includes(c)) reason = `${reason}, from ${c}`; }
      return { no, depth: o.depth, kind: 'prose', inline: true, html: math(fH(o.item.mem.fact, L, 'proof')), reason, nodes: o.nodes };
    }
    if (o.kind === 'prose' && byId.get(o.item.nodes[0] ?? '')?.k === 'generalize') return { no, depth: o.depth, kind: 'prose', html: generalizeHTML(byId.get(o.item.nodes[0]!) as ProofNode & { k: 'generalize' }) ?? proseHTML(o.item), reason: '', nodes: o.nodes };
    if (o.kind === 'prose') return { no, depth: o.depth, kind: 'prose', html: proseHTML(o.item).replace(/ \((discharging the assumption)\)\.$/, '.'), reason: o.span ? `lines ${o.span[0]}–${o.span[1]}` : '', nodes: o.nodes };
    const l = o.line;
    let reason: string;
    if (o.states) {
      const a = rows.indexOf(o.states.from) + 1, b = rows.indexOf(o.states.to) + 1;
      const span = a === b ? `line ${a}` : `lines ${a}–${b}`;
      const c = o.states.input ? bare(o.states.input) : '';
      reason = c ? `from ${c} and ${span}` : `by ${span}`;
    } else if (l.from?.length && !o.why.length) {
      // a concluding line: the two facts it combines (the equation, and the computation of its left side)
      const xs = l.from.map((id) => { const n = byId.get(id); if (n?.k === 'given') return givenName(id); if (n?.k === 'assume') return assumptionName(id); const k = id === l.owns ? rawLineOf.get(id) : lineOf.get(id); return k ? `line ${k}` : ''; }).filter(Boolean);
      reason = xs.length ? `from ${linesOf(xs)}` : '';
    } else if (!o.why.length) {
      // the closing line of a chain read backwards: its reason is where the right side came from
      reason = /^assumption/.test(l.just) ? 'the assumption' : /^given/.test(l.just) ? `given ${math(`<i>${nameHTML(l.just.replace(/^given\s*/, ''))}</i>`)}` : (l.refs ?? []).map(cite).filter(Boolean).join(', ');
    } else {
      reason = joinReasons(o.why.map((n) => nodeReason(n, o.flip)));
      const extraRefs = (l.refs ?? []).filter((id) => !l.nodes.some((x) => { const n = byId.get(x); return n && depsOf(n, g.nodes).includes(id); })).map(cite).filter(Boolean);
      if (extraRefs.length) reason = joinReasons([reason, ...extraRefs]);
    }
    const groups = o.why.length === 1 ? instanceGroups(o.why[0]!, o.rhs, o.flip) : [];
    const lhsGroups = o.why.length === 1 && o.lhs ? instanceGroups(o.why[0]!, o.lhs, !o.flip) : [];
    return { no, depth: o.depth, kind: 'eq', lhs: o.lhs, rel: o.rel, rhs: o.rhs, reason, nodes: o.nodes, ...(groups.length ? { groups } : {}), ...(lhsGroups.length ? { lhsGroups } : {}) };
  });
  return { lines, solved: tr.solved };
}

/** The theorem statement for the head of the page: "If h₁ and h₂, then …" or "For all …". */
export function theoremHTML(st: State): string {
  // open docks: hole chips, filled with the kernel's answer once the statement is proved
  const ov = openView(st.level, Object.fromEntries(st.check.sockets.filter((x) => x.ok && x.holes).map((x) => [x.id, x.holes!])));
  return ov.chips(theoremHTML0({ ...st, level: ov.level }));
}
function theoremHTML0(st: State): string { return fullStatementHTML(st.level); }

/**
 * The exact theorem a level proves (playtest W4–9 #4, W10–14 #9): every hypothesis of every kind (equations, laws,
 * memberships, the group's order), then every dock. Each variable is bound in its own sort or set ("u, v ∈ K",
 * "x ∈ A"), subgroups and maps by their binders ("H ≤ G", "f : G → K"), in the dock's own binder order. A card with
 * no premises has no arrow; an empty binder list is never printed.
 */
export function fullStatementHTML(lv0: LevelManifest, opts: { any?: boolean } = {}): string {
  const lv = withDockSorts(lv0);
  const L = labels0(lv);
  const allowed = new Set(lv.sockets.flatMap((k) => k.allowedGivens));
  const gs = lv.givens.filter((g) => allowed.has(g.id));
  const groups = (lv.sorts ?? []).filter((x) => x.kind === 'group');
  const sortLabel = sortLabelOf(lv, L);
  const sizes = gs.filter((g) => g.fact.k === 'size');
  const hyps = gs.filter((g) => g.fact.k !== 'size').map((g) => factStatement(g.fact as Fact, L, sortLabel, true, opts));
  // binders every dock shares are said once: "For all x, y ∈ G, if A, then B, and if B, then A"
  const split = lv.sockets.map((k) => cardParts(k.target as Fact, L, sortLabel, opts));
  let common: string[] = [];
  if (split.length > 1 && split.every((x) => x.parts.length)) {
    const first = split[0]!.parts;
    let n = 0;
    while (n < first.length && split.every((x) => x.parts[n] === first[n])) n++;
    common = first.slice(0, n);
  }
  const docks = split.map((x) => {
    const rest = x.parts.slice(common.length);
    return rest.length ? `for all ${rest.map((y) => math(y)).join(' and ')}, ${x.body}` : x.body;
  });
  if (common.length) docks[0] = `for all ${common.map((y) => math(y)).join(' and ')}, ${docks[0]}`;
  const pre = sizes.map((g) => { const f = g.fact as { n: number; s?: string }; return groups.length > 1 ? `|${sortLabel(f.s)}| = ${f.n}` : `${f.n}`; });
  const lead = sizes.length ? (groups.length > 1 ? `If ${pre.map((x) => math(x)).join(' and ')}` : `In a group of order ${pre[0]}`) : '';
  const all = docks.join(', and ');
  if (!hyps.length) return lead ? `${lead}${groups.length > 1 ? ', then' : ','} ${all}.` : `${all}.`.replace(/^./, (c) => c.toUpperCase());
  if (lead && groups.length > 1) return `${lead} and ${hyps.join(' and ')}, then ${all}.`;
  return `${lead ? `${lead}, if` : 'If'} ${hyps.join(' and ')}, then ${all}.`;
}

/** Where an unsorted variable lives: the level's first group (G), or a named sort by its label (A, K, Ω). */
function sortLabelOf(lv: LevelManifest, L: Record<string, string>): (r: unknown) => string {
  const groups = (lv.sorts ?? []).filter((x) => x.kind === 'group');
  return (r: unknown): string => {
    if (r === undefined || r === null) return groups[0]?.label ?? 'G';
    if (typeof r === 'string') return (lv.sorts ?? []).find((x) => x.id === r)?.label ?? L[r] ?? r;
    const o = r as { k?: string; id?: string };
    return o.id ?? 'G';
  };
}
/**
 * An open dock's display copy (openView → kernel openDisplay) drops the card's metaSorts, so "for all z ∈ C" read
 * "for all z ∈ G" (final playtest, P6.3). Put each dock's carriers back from the authored level.
 */
function withDockSorts(lv: LevelManifest): LevelManifest {
  const orig = BOOK_LEVELS.find((x) => x.id === lv.id) ?? LEVEL_BY_ID[lv.id];
  if (!orig || orig === lv) return lv;
  let changed = false;
  const sockets = lv.sockets.map((k) => {
    const t = k.target, o = orig.sockets.find((x) => x.id === k.id)?.target;
    if ((t.k !== 'law' && t.k !== 'cond') || t.metaSorts || !o || (o.k !== 'law' && o.k !== 'cond') || !o.metaSorts) return k;
    changed = true;
    return { ...k, target: { ...t, metaSorts: o.metaSorts } };
  });
  return changed ? { ...lv, sockets } : lv;
}
/** A dock's statement exactly as the page's heading prints it: "for all x ∈ G, (x⁻¹)⁻¹ = x" (open docks filled). */
function dockStatementHTML(st: State, sockId: string): string | null {
  const ov = openView(st.level, Object.fromEntries(st.check.sockets.filter((x) => x.ok && x.holes).map((x) => [x.id, x.holes!])));
  const lv = withDockSorts({ ...ov.level, id: st.level.id });
  const k = lv.sockets.find((x) => x.id === sockId);
  if (!k) return null;
  const L = labels0(lv);
  return ov.chips(factStatement(k.target as Fact, L, sortLabelOf(lv, L), false, {}));
}

/** One statement: a pallet as maths; a card as "for all <binders>, if <premises>, then <conclusion>" (maths when `inline`). */
function factStatement(f: Fact, L: Record<string, string>, sortLabel: (r: unknown) => string, inline: boolean, opts: { any?: boolean }): string {
  const { parts, body } = cardParts(f, L, sortLabel, opts, inline);
  if (!parts.length) return body;
  return inline ? `${math(`∀${parts.join(', ')}.`)} ${body}` : `for all ${parts.map((x) => math(x)).join(' and ')}, ${body}`;
}
/** A statement's binders (groups, subgroups, maps, then element variables by sort, in the card's order) and its body. */
function cardParts(f: Fact, L: Record<string, string>, sortLabel: (r: unknown) => string, opts: { any?: boolean }, inline = false): { parts: string[]; body: string } {
  if (f.k !== 'law' && f.k !== 'cond') return { parts: [], body: math(fH(f as never, L)) };
  // a card's group parameters read G, K, L … (never S / T, never H): the shared aliases, for binders, sorts and e's subscripts
  const al = groupAliases(f.binds, L, f.metas);
  return withEAliases({ ...L, ...al }, () => cardParts0(f, { ...L, ...al }, (r) => { const o = r as { k?: string; id?: string } | string | undefined; if (typeof o === 'string') return al[o] ?? sortLabel(o); return o && o.k === 'sortmeta' && o.id ? al[o.id] ?? o.id : sortLabel(r); }, opts, inline, al));
}
function cardParts0(f: Fact & { k: 'law' | 'cond' }, L: Record<string, string>, sortLabel: (r: unknown) => string, opts: { any?: boolean }, inline: boolean, al: Record<string, string>): { parts: string[]; body: string } {
  const metaL = { ...L, ...Object.fromEntries(f.metas.map((m) => [m, m])) };
  const zs = new Set<string>();
  const walkZ = (t: unknown): void => {
    if (!t || typeof t !== 'object') return;
    const o = t as Record<string, unknown>;
    if (o.k === 'zmeta' && typeof o.id === 'string') zs.add(o.id);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walkZ(v);
  };
  walkZ(f);
  const mv = (m: string) => `<i class="m-atom${opts.any ? ' any' : ''}">${esc(m)}</i>`;
  const parts: string[] = [];
  const grps = (f.binds ?? []).filter((b) => b.k === 'grp').map((b) => al[b.id] ?? b.id);
  if (grps.length) parts.push(`${grps.length > 1 ? 'groups' : 'a group'} ${grps.map(mv).join(', ')}`);
  for (const b of f.binds ?? []) {
    if (b.k === 'sub') parts.push(`${mv(b.id)} <span class="m-rel">${b.normal ? '⊴' : '≤'}</span> <i>${esc(sortLabel(b.sort))}</i>`);
    else if (b.k === 'hom') parts.push(`${mv(b.id)} : <i>${esc(sortLabel(b.dom))}</i> → <i>${esc(sortLabel(b.cod))}</i>`);
    else if (b.k === 'act') parts.push(`${mv(b.id)} : <i>${esc(sortLabel(b.grp))}</i> × <i>${esc(sortLabel(b.on))}</i> → <i>${esc(sortLabel(b.on))}</i>`);
  }
  // element variables, in the card's own order, grouped by where they live (consecutive runs of one sort)
  let run: string[] = [], runSort = '';
  const flush = () => { if (run.length) parts.push(`${run.map(mv).join(', ')} <span class="m-rel">∈</span> ${runSort === 'ℤ' ? 'ℤ' : `<i>${esc(runSort)}</i>`}`); run = []; };
  for (const m of f.metas) {
    const srt = zs.has(m) ? 'ℤ' : sortLabel(f.metaSorts?.[m]);
    if (srt !== runSort) { flush(); runSort = srt; }
    run.push(m);
  }
  flush();
  const body = f.k === 'law'
    ? math(fH({ k: 'eq', l: f.l, r: f.r } as never, metaL))
    : f.premises.length
      ? (inline ? `${f.premises.map((p) => math(fH(p as never, metaL))).join(', ')} ${math('<span class="m-rel">⟹</span>')} ${math(fH(f.concl as never, metaL))}`
        : `if ${f.premises.map((p) => math(fH(p as never, metaL))).join(' and ')}, then ${math(fH(f.concl as never, metaL))}`)
      : math(fH(f.concl as never, metaL));
  return { parts, body };
}

/**
 * A proof line's term. Words are written out letter by letter (final playtest, P5.5 mixed aabb, a⁴ and aab⁴): a
 * superscript on the page is always a real power, never a run the printer folded. `groups` puts a rule's compound
 * instance in parentheses.
 */
function wordH(t: Term, L: Record<string, string>, groups: [number, number][] = []): string {
  if (t.k !== 'mul') return tH(t, L, 'proof');
  let out = '';
  for (let i = 0; i < t.fs.length;) {
    const g = groups.find(([a, b]) => a === i && b > a);
    if (g) { out += `(${t.fs.slice(g[0], g[1]).map((f) => tH(f, L, 'proof')).join('')})`; i = g[1]; continue; }
    out += tH(t.fs[i]!, L, 'proof'); i++;
  }
  return out;
}

/** The page: Lemma n (Title). Statement. [Method · …] Proof. numbered lines. ∎ */
/**
 * opts.head: the "Lemma n (Title). statement" line (off inside the ceremony, which states it already).
 * opts.insight: the Book's specific insight as the page's subtitle. Only after ∎ (it would spoil the level), so
 * it also needs the proof on the page to be complete.
 */
export function paperHTML(p: Paper, st: State, opts: { head?: boolean; insight?: boolean } = {}): string {
  const lv = st.level;
  const L = paperLabels(lv, st.graph);
  const book = campaignOf(lv) === 'book';
  const no = book ? displayNo(lv) : String(lv.index);
  let html = opts.head === false ? '' : `<p class="pp-thm"><b>Lemma ${esc(no)}</b> <span class="pp-title">(${esc(lv.title)})</span>. ${safe(() => theoremHTML(st), '')}</p>`;
  if (book && lv.method) html += `<p class="pp-method"><span class="pp-k">Method</span> · ${richHTML(lv.method, lv)}</p>`;
  if (book && opts.insight && p.solved && lv.insight) html += `<p class="pp-insight">${richHTML(displayTitles(lv.insight), lv)}</p>`;
  html += '<p class="pp-proof"><i>Proof.</i></p>';
  if (!p.lines.length) return `${html}<p class="pp-empty">Nothing is written yet. Each machine you build adds a line.</p>`;
  let grid: string[] = [];
  let gridDepth = 0;
  const flush = () => { if (grid.length) { html += `<div class="pp-grid" style="--d:${gridDepth}">${grid.join('')}</div>`; grid = []; } };
  for (const l of p.lines) {
    if (l.depth !== gridDepth) { flush(); gridDepth = l.depth; }
    // ∎ closes the last line itself (at its end, as in print), never a mark floating below the proof
    const qed = p.solved && l === p.lines[p.lines.length - 1] ? '<span class="tomb pp-qed" title="Q.E.D."></span>' : '';
    const why = l.reason ? `<span class="pp-why">(${l.reason})${qed}</span>` : `<span class="pp-why">${qed}</span>`;
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
      + `<span class="pp-lhs math">${l.lhs ? wordH(l.lhs, L, l.lhsGroups) : ''}</span>`
      + `<span class="pp-rel math">${l.rel === '≠' ? '≠' : '='}</span>`
      + `<span class="pp-rhs math">${wordH(l.rhs!, L, l.groups)}</span>${why}</div>`);
  }
  flush();
  if (!p.solved) html += '<p class="pp-open">Not finished: a dock is still waiting for its statement.</p>';
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

/** Players know an order as "41 · Same Coset", never by its id: "The relation of P12.1" → "The relation of 41 · Same Coset". */
export function displayTitles(text: string): string {
  return text.replace(/\bP\d+\.(?:s?\d+)\b/g, (id) => { const l = BOOK_LEVELS.find((x) => x.id === id); return l ? `${displayNo(l)} · ${l.title}` : id; });
}
