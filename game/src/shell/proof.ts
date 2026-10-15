// LEMMA WORKS — the live textbook proof: derived from belts/stations + kernel facts.
// Produces a structured transcript that renders to HTML and to compile-ready LaTeX.
import * as K from '../kernel';
import type { Fact, Family, NodeId, Pallet, ProofGraph, ProofNode, Room, ScopeId, Term } from '../kernel/types';
import { beltsOf, stationsOf, type Belt } from '../state/belts';
import type { State } from '../state/store';
import { fH, tH, tU, texName, factTex, labels, richHTML, richTex, safe, schemaLemmaNo, schemaNames, statementOf, termTex, texText, esc, nameHTML } from './util';

export interface EqLine {
  t: 'eq';
  lhs: Term | null;          // null = continuation ("= rhs")
  rel: '=' | '≠';
  rhs: Term;
  just: string;              // unicode justification (rendered rich)
  nodes: NodeId[];           // station nodes (hover/click target = last)
  family: Family;
  classical: boolean;
  ghost?: boolean;
  tag?: number;
  qed?: boolean;
  refs?: NodeId[];
  /** hover text (textbook name + instantiation) */
  title?: string;
  /** fuller justification for the LaTeX export */
  texJust?: string;
}
export interface ProseLine { t: 'prose'; parts: Prose[]; nodes: NodeId[]; family: Family; classical: boolean; qed?: boolean }
export type Prose = { text: string } | { fact: Fact } | { ref: NodeId } | { given: string };
export interface RoomBlock { t: 'room'; room: Room; items: Item[] }
export type Item = EqLine | ProseLine | RoomBlock;

export interface Transcript { items: Item[]; goals: Pallet[]; solved: boolean; tags: Map<NodeId, number> }

const same = (a: Term, b: Term) => JSON.stringify(a) === JSON.stringify(b);

function fallbackFamily(n: ProofNode): Family {
  switch (n.k) {
    case 'start': case 'merge': return 'equation';
    case 'product': return 'structure';
    case 'generalize': return 'lemma';
    case 'given': return 'given';
    case 'assume': case 'exit': return 'scope';
    case 'clash': return 'contradiction';
    case 'press': case 'apply': return 'lemma';
    case 'step': {
      const op = n.op;
      if (op.k === 'swap') return 'equation';
      if (op.k === 'lift' || op.k === 'invert') return 'structure';
      if (op.k === 'insertE') return 'identity';
      if (op.k === 'applyMap') return 'structure'; // Book phase C
      const r = op.rule;
      if (r.k === 'axiom') return r.id.startsWith('unit') ? 'identity' : 'inverse';
      return r.k === 'node' ? 'given' : 'lemma';
    }
  }
}

export function familyOfNode(n: ProofNode, g: ProofGraph): Family {
  return safe(() => K.familyOf(n, g), fallbackFamily(n));
}

/** Build the transcript for the current level state. */
export function buildTranscript(s: State): Transcript {
  const g = s.graph, facts = s.check.nodes, level = s.level, L = labels(level);
  void L;
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const factOf = (id: NodeId): Fact | undefined => facts[id]?.fact;
  const topo = topoIndex(g);
  const belts = beltsOf(g).sort((a, b) => (topo.get(a.head.id) ?? 0) - (topo.get(b.head.id) ?? 0));
  const consumed = new Set<NodeId>();
  for (const n of g.nodes) {
    if (n.k === 'step') { if (n.op.k === 'rewrite' && n.op.rule.k === 'node') consumed.add(n.op.rule.id); }
    if (n.k === 'apply') { n.inputs.forEach((i) => consumed.add(i)); if (n.rule.k === 'node') consumed.add(n.rule.id); }
    if (n.k === 'merge' || n.k === 'clash') n.inputs.forEach((i) => consumed.add(i));
    if (n.k === 'exit' || n.k === 'press') consumed.add(n.input);
  }
  const tags = new Map<NodeId, number>();
  const refsWanted: NodeId[] = [];
  const ref = (id: NodeId) => { refsWanted.push(id); return id; };
  const givenOf = (id: NodeId) => { const n = byId.get(id); return n?.k === 'given' ? level.givens.find((x) => x.id === n.givenId) : undefined; };
  const classicalOf = (id: NodeId) => !!facts[id]?.classical;

  const schemaOf = (n: ProofNode): { id: string; mirror: boolean; subst: Record<string, Term> } | null => {
    if (n.k === 'apply' && n.rule.k === 'schema') return { id: n.rule.id, mirror: !!n.rule.mirror, subst: n.subst };
    if (n.k === 'step' && n.op.k === 'rewrite' && n.op.rule.k === 'schema') return { id: n.op.rule.id, mirror: !!n.op.rule.mirror, subst: n.op.subst };
    return null;
  };
  const instText = (sub: Record<string, Term>) => Object.entries(sub).map(([m, t]) => `${m} = ${tU(t, L)}`).join(', ');
  /** Short on-screen justification: machines cite as "Lemma n" (textbook name on hover). */
  const justify = (n: ProofNode): string => {
    const sc = schemaOf(n);
    if (sc) { const no = schemaLemmaNo(sc.id); return no ? `Lemma ${no}${sc.mirror ? 'ᵒᵖ' : ''}` : schemaNames(sc.id, sc.mirror).textbook; }
    if (n.k === 'press') return "Lagrange's theorem (imported)";
    // a rewrite by an earlier derived line is cited by its tag alone ("by (2)")
    if (n.k === 'step' && n.op.k === 'rewrite' && n.op.rule.k === 'node') {
      const r = byId.get(n.op.rule.id);
      if (r && r.k === 'assume') return 'the supposition';
      if (r && r.k !== 'given' && r.k !== 'press') return '';
    }
    return safe(() => K.justify(n, g, s.ctx), fallbackJust(n, s));
  };
  const justTitle = (n: ProofNode): string => {
    const sc = schemaOf(n);
    if (!sc) return '';
    const nm = schemaNames(sc.id, sc.mirror);
    return `${nm.name}: ${nm.textbook}${Object.keys(sc.subst).length ? ` with ${instText(sc.subst)}` : ''}`;
  };
  const justTex = (n: ProofNode): string => {
    const sc = schemaOf(n);
    if (!sc) return justify(n);
    const no = schemaLemmaNo(sc.id), nm = schemaNames(sc.id, sc.mirror);
    const inst = Object.keys(sc.subst).length ? `; ${instText(sc.subst)}` : '';
    return `${no ? `Lemma ${no}` : 'Lemma'} (${nm.textbook}${inst})`;
  };
  const extra = (ns: ProofNode[]) => {
    const title = joinJust(ns.map(justTitle)), tex = joinJust(ns.map(justTex));
    return { ...(title ? { title } : {}), texJust: tex };
  };
  /** References to derived (non-given) inputs, e.g. " on (2)". Resolved to tags later. */
  const inputRefs = (n: ProofNode): NodeId[] => {
    const ids: NodeId[] = [];
    if (n.k === 'apply') ids.push(...n.inputs, ...(n.rule.k === 'node' ? [n.rule.id] : []));
    if (n.k === 'merge') ids.push(...n.inputs);
    if (n.k === 'step' && n.op.k === 'rewrite' && n.op.rule.k === 'node') ids.push(n.op.rule.id);
    return ids.filter((id) => { const m = byId.get(id); return m && m.k !== 'given' && m.k !== 'press'; }).map(ref);
  };

  const beltItems = (b: Belt): Item[] => {
    const out: Item[] = [];
    const head = b.head;
    const hf = factOf(head.id);
    const fam = (n: ProofNode) => familyOfNode(n, g);
    // state: what the last displayed line established
    type Mode = 'start' | 'none' | 'chain';
    let mode: Mode = 'none';
    let startTerm: Term | null = null;

    switch (head.k) {
      case 'start':
        mode = 'start'; startTerm = head.term;
        if (!b.steps.length) out.push({ t: 'eq', lhs: head.term, rel: '=', rhs: head.term, just: 'new spool', nodes: [head.id], family: 'equation', classical: false, ghost: true });
        break;
      case 'given': {
        if (!b.steps.length) return [];
        if (hf && (hf.k === 'eq' || hf.k === 'neq')) {
          const gd = level.givens.find((x) => x.id === head.givenId);
          out.push({ t: 'eq', lhs: hf.l, rel: hf.k === 'eq' ? '=' : '≠', rhs: hf.r, just: `given ${gd?.name ?? ''}`.trim(), nodes: [head.id], family: 'given', classical: false });
          mode = 'chain';
        }
        break;
      }
      case 'assume': mode = 'none'; break; // stated in the room's prose
      case 'press': {
        out.push({ t: 'prose', parts: [{ text: "By Lagrange's theorem (imported, not proven here), " }, { fact: hf ?? { k: 'bot' } }, { text: '.' }], nodes: [head.id], family: 'lemma', classical: false });
        mode = 'none';
        break;
      }
      case 'clash': {
        const [, neqId] = head.inputs;
        const gd = givenOf(neqId);
        const parts: Prose[] = [{ text: 'This contradicts ' }];
        if (gd) parts.push({ given: gd.id }); else { parts.push({ fact: factOf(neqId) ?? { k: 'bot' } }); parts.push({ ref: ref(neqId) }); }
        parts.push({ text: '.' });
        out.push({ t: 'prose', parts, nodes: [head.id], family: 'contradiction', classical: classicalOf(head.id) });
        return out;
      }
      case 'exit': {
        const room = g.rooms.find((r) => r.id === head.room);
        const parts: Prose[] = [{ text: 'Hence ' }, { fact: hf ?? { k: 'bot' } }];
        parts.push({ text: room?.kind === 'classical' ? ' (classically: the assumption that they differ is untenable).' : '.' });
        out.push({ t: 'prose', parts, nodes: [head.id], family: 'scope', classical: room?.kind === 'classical' || classicalOf(head.id) });
        mode = 'none';
        break;
      }
      case 'apply': case 'merge': {
        if (hf && (hf.k === 'eq' || hf.k === 'neq')) {
          out.push({ t: 'eq', lhs: hf.l, rel: hf.k === 'eq' ? '=' : '≠', rhs: hf.r, just: justify(head), nodes: [head.id], family: fam(head), classical: classicalOf(head.id), ...refsField(inputRefs(head)), ...extra([head]) });
          mode = 'chain';
        } else if (hf) {
          out.push({ t: 'prose', parts: [{ text: 'By ' + justify(head) + ', ' }, { fact: hf }, { text: '.' }], nodes: [head.id], family: fam(head), classical: classicalOf(head.id) });
          mode = 'none';
        }
        break;
      }
    }

    const stations = stationsOf(b);
    let prevFact: Fact | undefined = hf;
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i]!;
      const last = st.nodes[st.nodes.length - 1]!;
      const after = factOf(last.id);
      const before = prevFact;
      if (!after || (after.k !== 'eq' && after.k !== 'neq') || !before || (before.k !== 'eq' && before.k !== 'neq')) { prevFact = after; continue; }
      const just = joinJust(st.nodes.map(justify));
      const refs = st.nodes.flatMap(inputRefs);
      const rel = after.k === 'eq' ? '=' : '≠';
      const ids = st.nodes.map((n) => n.id);
      const f = fam(st.nodes[0]!);
      const cls = classicalOf(last.id);
      const lCh = !same(before.l, after.l), rCh = !same(before.r, after.r);
      const isSwap = st.nodes.some((n) => n.k === 'step' && n.op.k === 'swap');
      if (!isSwap && !lCh && rCh && after.k === 'eq') {
        if (mode === 'chain') out.push({ t: 'eq', lhs: null, rel, rhs: after.r, just, nodes: ids, family: f, classical: cls, ...refsField(refs), ...extra(st.nodes) });
        else out.push({ t: 'eq', lhs: after.l, rel, rhs: after.r, just, nodes: ids, family: f, classical: cls, ...refsField(refs), ...extra(st.nodes) });
        mode = 'chain';
      } else if (!isSwap && lCh && !rCh && after.k === 'eq') {
        // a run of left-rail rewrites: read it backwards as a chain ending at the fixed right side
        const run = [st];
        while (i + 1 < stations.length) {
          const nx = stations[i + 1]!;
          const nb = factOf(run[run.length - 1]!.nodes[run[run.length - 1]!.nodes.length - 1]!.id);
          const na = factOf(nx.nodes[nx.nodes.length - 1]!.id);
          if (!nb || !na || nb.k !== 'eq' || na.k !== 'eq' || nx.nodes.some((n) => n.k === 'step' && n.op.k === 'swap')) break;
          if (same(nb.l, na.l) || !same(nb.r, na.r)) break;
          run.push(nx); i++;
        }
        const lefts: Term[] = [before.l, ...run.map((r) => (factOf(r.nodes[r.nodes.length - 1]!.id) as { l: Term }).l)];
        for (let k = run.length; k >= 1; k--) {
          const r = run[k - 1]!;
          out.push({
            t: 'eq', lhs: k === run.length ? lefts[k]! : null, rel: '=', rhs: lefts[k - 1]!,
            just: joinJust(r.nodes.map(justify)), nodes: r.nodes.map((n) => n.id), family: fam(r.nodes[0]!), classical: classicalOf(r.nodes[r.nodes.length - 1]!.id),
            ...refsField(r.nodes.flatMap(inputRefs)), ...extra(r.nodes),
          });
        }
        const lastRun = run[run.length - 1]!;
        const lastId = lastRun.nodes[lastRun.nodes.length - 1]!.id;
        if (!(mode === 'start' && startTerm && same(startTerm, before.r))) {
          const anchor = stations[i - run.length]?.nodes.slice(-1)[0]?.id ?? head.id;
          const first = i - run.length < 0;
          const why = first && head.k === 'assume' ? 'assumption' : first && head.k === 'given' ? `given ${givenOf(head.id)?.name ?? ''}` : '';
          out.push({ t: 'eq', lhs: null, rel: '=', rhs: before.r, just: why, nodes: [], family: first && head.k === 'given' ? 'given' : f, classical: classicalOf(lastId), ...refsField(why ? [] : [ref(anchor)]) });
        }
        prevFact = factOf(lastId);
        mode = 'chain';
        continue;
      } else {
        out.push({ t: 'eq', lhs: after.l, rel, rhs: after.r, just, nodes: ids, family: f, classical: cls, ...refsField(refs), ...extra(st.nodes) });
        mode = 'chain';
      }
      prevFact = after;
    }
    return out;
  };

  // Group belts by scope; rooms render where their assumption appears.
  const scopeItems = (scope: ScopeId): Item[] => {
    type Entry = { key: number; render: () => Item[] };
    const entries: Entry[] = [];
    for (const b of belts) if (b.scope === scope) entries.push({ key: (topo.get(b.head.id) ?? 0) - (b.head.k === 'press' ? 1e6 : 0), render: () => beltItems(b) });
    for (const r of g.rooms) if (r.parent === scope) {
      const assume = g.nodes.find((n) => n.k === 'assume' && n.room === r.id);
      entries.push({ key: (assume ? topo.get(assume.id) ?? 0 : 0) - 0.5, render: () => [{ t: 'room', room: r, items: scopeItems(r.id) }] });
    }
    entries.sort((a, b) => a.key - b.key);
    return entries.flatMap((e) => e.render());
  };
  const items = scopeItems(K.ROOT);

  // tags for referenced lines, numbered in reading order
  const lineOf = new Map<NodeId, EqLine>();
  const walk = (its: Item[], fn: (l: EqLine) => void) => its.forEach((it) => (it.t === 'room' ? walk(it.items, fn) : it.t === 'eq' ? fn(it) : undefined));
  walk(items, (l) => l.nodes.forEach((id) => { if (!lineOf.has(id)) lineOf.set(id, l); }));
  // a ref to a belt-end resolves to the line that ends the chain containing it
  const wanted = new Set(refsWanted);
  let next = 1;
  walk(items, (l) => {
    if (l.nodes.some((id) => wanted.has(id))) { l.tag = next++; l.nodes.forEach((id) => tags.set(id, l.tag!)); }
  });
  void consumed;

  // ∎ on the line that fills the socket
  const proseOf = new Map<NodeId, ProseLine>();
  const walkP = (its: Item[]) => its.forEach((it) => (it.t === 'room' ? walkP(it.items) : it.t === 'prose' ? it.nodes.forEach((id) => proseOf.set(id, it)) : undefined));
  walkP(items);
  for (const sk of s.check.sockets) if (sk.ok && sk.filledBy) { const l = lineOf.get(sk.filledBy) ?? proseOf.get(sk.filledBy); if (l) l.qed = true; }
  const goals = level.sockets.filter((d) => !s.check.sockets.find((x) => x.id === d.id)?.ok).map((d) => d.target)
    .filter((t): t is Pallet => t.k !== 'law' && t.k !== 'cond');
  return { items, goals, solved: s.check.solved, tags };

  function refsField(ids: NodeId[]): { refs?: NodeId[] } { return ids.length ? { refs: ids } as never : {}; }
}

function joinJust(js: string[]): string {
  const seen: string[] = [];
  for (const j of js) if (j && !seen.includes(j)) seen.push(j);
  return seen.join(', ');
}

function fallbackJust(n: ProofNode, s: State): string {
  const L = labels(s.level);
  const tt = (t: Term) => safe(() => K.termText(t, L), '');
  switch (n.k) {
    case 'start': return 'reflexivity';
    case 'given': return `given ${s.level.givens.find((g) => g.id === n.givenId)?.name ?? ''}`;
    case 'assume': return 'assumption';
    case 'merge': return 'transitivity';
    case 'clash': return 'contradiction';
    case 'exit': return 'discharge';
    case 'press': return "Lagrange's theorem (imported)";
    case 'product': return 'multiply the two equations';
    case 'generalize': return 'generalize';
    case 'apply': return n.rule.k === 'node' ? (s.level.givens.find((g) => `g:${g.id}` === (n.rule as { id: string }).id)?.name ?? 'hypothesis') : 'lemma';
    case 'step': {
      const op = n.op;
      if (op.k === 'swap') return 'symmetry';
      if (op.k === 'insertE') return 'unit';
      if (op.k === 'lift') return `multiply on the ${op.side} by ${tt(op.term)}`;
      if (op.k === 'invert') return 'invert both sides';
      if (op.k === 'applyMap') return `apply ${op.fn} to both sides`; // Book phase C
      if (op.rule.k === 'axiom') return op.rule.id.startsWith('unit') ? 'unit' : 'inverse';
      if (op.rule.k === 'node') { const id = op.rule.id; return s.level.givens.find((g) => `g:${g.id}` === id)?.name ?? 'above'; }
      return 'lemma';
    }
  }
}

export function topoIndex(g: ProofGraph): Map<NodeId, number> {
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const deps = (n: ProofNode): NodeId[] => {
    switch (n.k) {
      case 'step': return [n.input, ...(n.op.k === 'rewrite' && n.op.rule.k === 'node' ? [n.op.rule.id] : [])];
      case 'apply': return [...n.inputs, ...(n.rule.k === 'node' ? [n.rule.id] : [])];
      case 'merge': case 'clash': return [...n.inputs];
      case 'exit': case 'press': return [n.input];
      default: return [];
    }
  };
  const out = new Map<NodeId, number>(); const seen = new Set<NodeId>();
  const visit = (id: NodeId) => {
    if (seen.has(id)) return; seen.add(id);
    const n = byId.get(id); if (!n) return;
    deps(n).forEach(visit);
    out.set(id, out.size);
  };
  g.nodes.forEach((n) => visit(n.id));
  return out;
}

// ───────────────────────────── rendering: HTML ─────────────────────────────

export function transcriptHTML(tr: Transcript, s: State): string {
  const L = labels(s.level);
  const prose = (p: ProseLine) => p.parts.map((x) => {
    if ('text' in x) return esc(x.text);
    if ('fact' in x) return `<span class="math">${fH(x.fact, L, 'proof')}</span>`;
    if ('given' in x) { const g = s.level.givens.find((y) => y.id === x.given)!; return `<span class="math"><i>${nameHTML(g.name)}</i>:&thinsp;${fH(g.fact, L, 'proof')}</span>`; }
    const t = tr.tags.get(x.ref); return t ? ` (${t})` : '';
  }).join('');
  const refsText = (l: EqLine & { refs?: NodeId[] }) => {
    const ts = [...new Set((l.refs ?? []).map((id) => tr.tags.get(id)).filter((t): t is number => !!t))];
    return ts.length ? `${l.just ? ' on' : 'by'} ${ts.map((t) => `(${t})`).join(', ')}` : '';
  };
  const render = (its: Item[], depth: number): string => {
    let html = '';
    let grid: string[] = [];
    const flush = () => { if (grid.length) { html += `<div class="t-grid">${grid.join('')}</div>`; grid = []; } };
    for (const it of its) {
      if (it.t === 'room') {
        flush();
        const r = it.room;
        const assume: Fact = r.kind === 'suppose' ? { k: 'eq', l: r.l, r: r.r } : { k: 'neq', l: r.l, r: r.r };
        const assumeNode = s.graph.nodes.find((n) => n.k === 'assume' && n.room === r.id);
        const intro = r.kind === 'suppose' ? 'Suppose, for contradiction, that ' : 'Suppose, towards a contradiction, that ';
        html += `<section class="t-room${r.kind === 'classical' ? ' classical' : ''}" data-room="${r.id}">
          <div class="t-room-tag">${r.kind === 'suppose' ? 'Suppose' : 'Suppose (classical)'}</div>
          <p class="t-prose" data-nodes="${assumeNode?.id ?? ''}">${intro}<span class="math">${fH(assume, L, 'proof')}</span>.${r.kind === 'classical' ? ' <span class="t-classical" title="This step uses excluded middle">classical</span>' : ''}</p>
          ${render(it.items, depth + 1)}
        </section>`;
        continue;
      }
      if (it.t === 'prose') {
        flush();
        html += `<p class="t-prose fam-${it.family}" data-nodes="${it.nodes.join(' ')}"><span class="t-wire" style="--w:var(--fam-${it.family})"></span>${prose(it)}${it.classical ? ' <span class="t-classical">classical</span>' : ''}${it.qed ? '<span class="t-qed" title="Q.E.D."><span class="tomb"></span></span>' : ''}</p>`;
        continue;
      }
      const l = it as EqLine & { refs?: NodeId[] };
      const just = richHTML(l.just, s.level) + esc(refsText(l));
      grid.push(`<div class="t-line fam-${l.family}${l.ghost ? ' ghost' : ''}${l.lhs ? ' head' : ''}" data-nodes="${l.nodes.join(' ')}">
        <span class="t-wire" style="--w:var(--fam-${l.family})"></span>
        <span class="t-lhs math">${l.lhs ? tH(l.lhs, L, 'proof') : ''}</span>
        <span class="t-rel math">${l.rel}</span>
        <span class="t-rhs math">${tH(l.rhs, L, 'proof')}${l.qed ? '<span class="t-qed" title="Q.E.D."><span class="tomb"></span></span>' : ''}</span>
        <span class="t-just" style="color:var(--fam-${l.family}-text)"${l.title ? ` title="${esc(l.title)}"` : ''}>${just}${l.classical ? ' <span class="t-classical">classical</span>' : ''}${l.tag ? `<span class="t-tag">(${l.tag})</span>` : ''}</span>
      </div>`);
    }
    flush();
    return html;
  };
  let html = render(tr.items, 0);
  if (!tr.items.length) html = `<p class="t-empty">The proof writes itself here as you build. Every station on the board becomes a line of a textbook derivation.</p>`;
  for (const goal of tr.goals) {
    if (goal.k !== 'eq' && goal.k !== 'neq') continue;
    html += `<div class="t-grid"><div class="t-line goal-ghost"><span class="t-wire ghost"></span>
      <span class="t-lhs math">${tH(goal.l, L, 'proof')}</span>
      <span class="t-rel math">${goal.k === 'neq' ? '≠' : '='}</span>
      <span class="t-rhs math">${tH(goal.r, L, 'proof')}</span>
      <span class="t-just">goal</span></div></div>`;
  }
  return html;
}

// ───────────────────────────── rendering: LaTeX ─────────────────────────────

/** A compile-ready LaTeX fragment (needs amsmath + amsthm). */
export function transcriptTeX(tr: Transcript, s: State): string {
  const level = s.level, L = labels(level);
  const st = statementOf(level);
  const refsText = (l: EqLine & { refs?: NodeId[] }) => {
    const ts = [...new Set((l.refs ?? []).map((id) => tr.tags.get(id)).filter((t): t is number => !!t))];
    return ts.length ? `${l.just ? ' on' : 'by'} ${ts.map((t) => `(${t})`).join(', ')}` : '';
  };
  const prose = (p: ProseLine) => p.parts.map((x) => {
    if ('text' in x) return texText(x.text);
    if ('fact' in x) return `$${factTex(x.fact, L)}$`;
    if ('given' in x) { const g = level.givens.find((y) => y.id === x.given)!; return `$${texName(g.name)}\\colon ${factTex(g.fact, L)}$`; }
    const t = tr.tags.get(x.ref); return t ? ` (${t})` : '';
  }).join('');
  const blocks: string[] = [];
  const emit = (its: Item[]) => {
    let rows: string[] = [];
    const flush = () => {
      if (!rows.length) return;
      blocks.push(`\\begin{align*}\n${rows.join(' \\\\\n')}\n\\end{align*}`);
      rows = [];
    };
    for (const it of its) {
      if (it.t === 'room') {
        flush();
        const r = it.room;
        const f: Fact = r.kind === 'suppose' ? { k: 'eq', l: r.l, r: r.r } : { k: 'neq', l: r.l, r: r.r };
        blocks.push(r.kind === 'suppose'
          ? `Suppose, for contradiction, that $${factTex(f, L)}$. Then`
          : `Suppose, towards a contradiction, that $${factTex(f, L)}$ (a classical argument). Then`);
        emit(it.items);
        continue;
      }
      if (it.t === 'prose') { flush(); blocks.push(prose(it)); continue; }
      const l = it as EqLine & { refs?: NodeId[] };
      if (l.ghost) continue;
      const rel = l.rel === '=' ? '&=' : '&\\neq';
      const lhs = l.lhs ? termTex(l.lhs, L) : '';
      const just = `${richTex(l.texJust ?? l.just, level)}${texText(refsText(l))}${l.classical ? ' (classical)' : ''}`;
      rows.push(`  ${lhs} ${rel} ${termTex(l.rhs, L)} && \\text{${just}}${l.tag ? ` \\tag{${l.tag}}` : ''}`);
    }
    flush();
  };
  emit(tr.items);
  // \qedhere on a closing display
  const lastIdx = blocks.length - 1;
  if (tr.solved && lastIdx >= 0 && blocks[lastIdx]!.startsWith('\\begin{align*}')) {
    blocks[lastIdx] = blocks[lastIdx]!.replace(/\n\\end\{align\*\}$/, ' \\qedhere\n\\end{align*}');
  }
  const head = `% Lemma Works: ${level.id} ${level.title}. Requires \\usepackage{amsmath,amsthm}.`;
  const lemma = `\\noindent\\textbf{Lemma ${level.index}} (${texText(level.title)})\\textbf{.} \\emph{${st.tex}}`;
  const status = tr.solved ? '' : '% (proof in progress: the goal is not delivered yet)\n';
  return `${head}\n${status}${lemma}\n\\begin{proof}\n${blocks.join('\n') || '% (empty)'}\n\\end{proof}\n`;
}

export function standaloneTeX(fragment: string): string {
  return `\\documentclass[11pt]{article}\n\\usepackage{amsmath,amsthm}\n\\usepackage{lmodern}\n\\begin{document}\n\n${fragment}\n\\end{document}\n`;
}
