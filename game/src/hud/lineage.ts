// COMMUTATOR — the lineage of a theorem (final playtest, the finale): which of the player's saved lemmas a proof
// rests on, the lemmas those rest on, down to the built-in theorems the player earned. Shown after the Book's last
// order, and from the Lemma Book for any saved lemma.
//
// Honesty: the graph is computed from the player's actual floors. A floor is recompiled under its own level, and
// only the kernel nodes that reach its docks (or the saved ∀ / gate) are followed. Every theorem those nodes cite is
// a node of the lineage, with an edge "used in". Nothing is inferred from the level design (`uses`, `par`).
import './lineage.css';
import * as F from '../factory';
import type { Canvas } from '../factory/types';
import type { KernelCtx } from '../kernel';
import type { Card, NodeId, ProofNode } from '../kernel/types';
import { BOOK_WORLDS } from '../levels/book';
import { CAMPAIGN_LEVELS, LEVEL_BY_ID, campaignOf, type Campaign } from '../levels/campaigns';
import { campSave, ctxFor, type CampaignSave, type FSave, type SavedLemma } from '../state/factoryStore';
import { familyName } from './merge';
import { schemaInfo } from './proof';
import { reducedMotion } from '../ui/tokens';
import { displayNo, esc, fH, h, isGivenName, isSolved, labels, nextLevel, type S, type Store } from './util';

// ───────────────────────────── the computation (no DOM) ─────────────────────────────

/** Whose lineage: a floor's proof (what reaches its docks), or a saved lemma (what reaches its ∀ / gate). */
export type LineageTarget = { k: 'floor'; levelId: string; canvas: Canvas } | { k: 'lemma'; id: string };

export interface LNode {
  /** 'target', 'lemma:<id>' (a saved lemma: its own id), 'schema:<id>' (a built-in or imported theorem), 'press'. */
  key: string;
  kind: 'target' | 'lemma' | 'theorem' | 'import';
  name: string;
  /** The statement (null for the target floor and for Lagrange's theorem: they are typeset from the level). */
  card: Card | null;
  /** Where it was proved (null: imported). */
  levelId: string | null;
  /** The keys of the nodes its proof uses directly. An edge runs from each of them to this node ("used in"). */
  uses: string[];
}
export interface Lineage {
  target: string;
  /** Every node, dependencies before the nodes that use them. */
  nodes: LNode[];
  /** Saved lemmas in the lineage (all depths), and how many the target uses directly. */
  lemmas: number;
  direct: number;
}

/** Standard names of order theorems that are not saved under a lemma name (the manifests name savable docks only). */
const THEOREM_NAMES: Record<string, string> = { 'P16.2': 'The Fundamental Homomorphism Theorem' };
/** The standard name of an order's theorem when it is a named theorem of the book (the finale), else null. */
export const standardTheoremName = (levelId: string): string | null => THEOREM_NAMES[levelId] ?? null;
/** The standard name of what an order proves, when it has one. */
export function theoremNameOf(levelId: string): string | null {
  const lv = LEVEL_BY_ID[levelId];
  return THEOREM_NAMES[levelId] ?? (lv?.lemmaNames?.length === 1 ? lv.lemmaNames[0]! : null);
}
/** The Book's closing order: its last main level. */
export function isFinale(levelId: string): boolean {
  const c = campaignOf(levelId);
  const mains = CAMPAIGN_LEVELS[c].filter((l) => !l.side);
  return c === 'book' && mains[mains.length - 1]?.id === levelId;
}

/** Every node a node's fact depends on (inputs, cited rule nodes, a room's assumptions for its exit). As the Paper. */
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

/**
 * The registry theorems a floor's proof cites, in proof order: the schema ids of every rewrite and Theorem
 * application among the kernel nodes that reach `from` (a machine's output) or, with no machine, the filled docks.
 * 'press' stands for the Lagrange press. Machines left on the floor that feed nothing are not counted.
 */
export function citedTheorems(canvas: Canvas, ctx: KernelCtx, from?: string): string[] {
  const comp = F.compile(canvas, ctx);
  const g = comp.graph;
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  let starts: NodeId[];
  if (from) {
    const out = comp.machines[from]?.out;
    starts = out && out.k === 'card' && out.ref.k === 'node' ? [out.ref.id] : comp.machines[from]?.nodes.slice(-1) ?? [];
  } else starts = comp.check.sockets.filter((x) => x.ok && x.filledBy).map((x) => x.filledBy!);
  const seen = new Set<NodeId>();
  const out: string[] = [];
  const add = (id: string) => { if (!out.includes(id)) out.push(id); };
  const stack = [...starts];
  const order: ProofNode[] = [];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = byId.get(id);
    if (!n) continue;
    order.push(n);
    stack.push(...depsOf(n, g.nodes));
  }
  // proof order: the graph's own node order (earliest first)
  const rank = new Map(g.nodes.map((n, i) => [n.id, i] as const));
  order.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  for (const n of order) {
    if (n.k === 'step' && n.op.k === 'rewrite' && n.op.rule.k === 'schema') add(n.op.rule.id);
    else if (n.k === 'apply' && n.rule.k === 'schema') add(n.rule.id);
    else if (n.k === 'press') add('press');
  }
  return out;
}

/** The level that awards a built-in theorem in this campaign (its proof is that order). */
const earnedAt = (c: Campaign, id: string): string | null => CAMPAIGN_LEVELS[c].find((l) => l.unlocks.includes(id))?.id ?? null;

/**
 * The lineage of a floor or a saved lemma, from the campaign's save. Saved lemmas are followed into their own saved
 * floors, recursively; built-in theorems the player earned are roots (their proofs are orders, not saved floors);
 * imported theorems are roots marked as imported. Axioms, the group laws and the order's own hypotheses are not nodes.
 */
export function lineageOf(cs: CampaignSave, c: Campaign, target: LineageTarget): Lineage {
  const lemmas = cs.lemmas.filter((l) => l.verified !== false);
  const byId = new Map(lemmas.map((l) => [l.id, l] as const));
  const nodes = new Map<string, LNode>();
  const done: string[] = []; // post-order: dependencies first
  const ctxAt = (levelId: string, self?: string) => ctxFor(LEVEL_BY_ID[levelId]!, cs.earned, lemmas.filter((l) => l.id !== self));

  const visit = (key: string, make: () => LNode | null): string | null => {
    if (nodes.has(key)) return key;
    const n = make();
    if (!n) return null;
    nodes.set(key, n); // before recursing: a cycle (never in a verified book) cannot loop
    return key;
  };
  const usesOf = (ids: string[], ctx: KernelCtx): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      const k = id === 'press' ? nodeForPress() : id.startsWith('lemma:') ? nodeForLemma(byId.get(id)) : nodeForSchema(id, ctx);
      if (k && !out.includes(k)) out.push(k);
    }
    return out;
  };
  const nodeForPress = () => visit('press', () => {
    done.push('press');
    return { key: 'press', kind: 'import', name: 'Lagrange’s theorem', card: null, levelId: null, uses: [] };
  });
  const nodeForSchema = (id: string, ctx: KernelCtx): string | null => {
    const sc = F.schemaOf(ctx, id);
    if (!sc || sc.origin === 'axiom' || sc.origin === 'authored') return null;
    const imported = sc.origin === 'import' || id.startsWith('power.');
    const levelId = imported ? null : earnedAt(c, id);
    // a built-in the campaign never awards (a kind's own law) is part of the definition, not a theorem the player earned
    if (!imported && !levelId) return null;
    const key = `schema:${id}`;
    return visit(key, () => {
      done.push(key);
      const name = familyName(id, schemaInfo(id, false, ctx).name).replace(/\s*\(imported\)$/, '');
      return { key, kind: imported ? 'import' : 'theorem', name, card: sc.card, levelId, uses: [] };
    });
  };
  const nodeForLemma = (l: SavedLemma | undefined): string | null => {
    if (!l || !LEVEL_BY_ID[l.levelId]) return null;
    const key = l.id;
    if (nodes.has(key)) return key;
    const n: LNode = { key, kind: 'lemma', name: l.name, card: l.card, levelId: l.levelId, uses: [] };
    nodes.set(key, n);
    let ids: string[] = [];
    try { const ctx = ctxAt(l.levelId, l.id); ids = citedTheorems(l.canvas, ctx, l.machine); n.uses = usesOf(ids.filter((x) => x !== l.id), ctx); } catch { n.uses = []; }
    done.push(key);
    return key;
  };

  let targetKey: string;
  if (target.k === 'lemma') {
    const l = byId.get(target.id);
    targetKey = (l && nodeForLemma(l)) ?? 'target';
    const t = nodes.get(targetKey);
    if (t) t.kind = 'target';
    else { nodes.set('target', { key: 'target', kind: 'target', name: 'Lemma', card: null, levelId: null, uses: [] }); done.push('target'); }
  } else {
    const lv = LEVEL_BY_ID[target.levelId]!;
    let uses: string[] = [];
    try { const ctx = ctxAt(lv.id); uses = usesOf(citedTheorems(target.canvas, ctx), ctx); } catch { uses = []; }
    targetKey = 'target';
    nodes.set('target', { key: 'target', kind: 'target', name: theoremNameOf(lv.id) ?? lv.title, card: null, levelId: lv.id, uses });
    done.push('target');
  }
  const ordered = done.filter((k, i) => done.indexOf(k) === i).map((k) => nodes.get(k)!);
  const t = nodes.get(targetKey)!;
  return {
    target: targetKey,
    nodes: ordered,
    lemmas: ordered.filter((n) => n.kind === 'lemma').length,
    direct: t.uses.filter((k) => nodes.get(k)?.kind === 'lemma').length,
  };
}

/** Columns, roots on the left and the target alone on the right: by world (the book's chapters), then by depth inside a world. */
export interface LColumn { world: number | null; nodes: LNode[] }
export function lineageColumns(lin: Lineage): LColumn[] {
  const by = new Map(lin.nodes.map((n) => [n.key, n] as const));
  const worldOf = (n: LNode) => (n.levelId ? LEVEL_BY_ID[n.levelId]?.world ?? LEVEL_BY_ID[n.levelId]?.chapter ?? 0 : -1);
  const depth = new Map<string, number>(); // longest chain of same-world uses below a node
  for (const n of lin.nodes) {
    const w = worldOf(n);
    depth.set(n.key, Math.max(0, ...n.uses.map((u) => by.get(u)).filter((u): u is LNode => !!u && worldOf(u) === w).map((u) => (depth.get(u.key) ?? 0) + 1)));
  }
  const cols = new Map<string, LColumn & { w: number; d: number }>();
  for (const n of lin.nodes) {
    if (n.key === lin.target) continue;
    const w = worldOf(n), d = depth.get(n.key)!;
    const k = `${w}/${d}`;
    if (!cols.has(k)) cols.set(k, { world: w < 0 ? null : w, nodes: [], w, d });
    cols.get(k)!.nodes.push(n);
  }
  const idx = (n: LNode) => (n.levelId ? CAMPAIGN_LEVELS[campaignOf(n.levelId)].findIndex((l) => l.id === n.levelId) : -1);
  const out = [...cols.values()].sort((a, b) => a.w - b.w || a.d - b.d);
  const seq = new Map(lin.nodes.map((n, i) => [n.key, i] as const)); // same order: the save order (fibre ⟹ before ⟸)
  for (const col of out) col.nodes.sort((a, b) => idx(a) - idx(b) || seq.get(a.key)! - seq.get(b.key)!);
  const t = by.get(lin.target)!;
  return [...out.map(({ world, nodes }) => ({ world, nodes })), { world: t.levelId ? worldOf(t) : null, nodes: [t] }];
}

/** The plain sentence under the title: what the proof uses, said as it is (a short lineage is said to be short). */
export function lineageSummary(lin: Lineage, what = 'This proof'): string {
  const t = lin.nodes.find((n) => n.key === lin.target)!;
  const direct = t.uses.map((k) => lin.nodes.find((n) => n.key === k)).filter((n): n is LNode => !!n);
  const own = direct.filter((n) => n.kind === 'lemma').length;
  const builtIn = direct.length - own;
  const n = (k: number, one: string, many: string) => `${k === 1 ? 'one' : k} ${k === 1 ? one : many}`;
  if (!direct.length) return `${what} uses none of your saved lemmas and no built-in theorem. It rests on the group laws and its hypotheses alone.`;
  const parts: string[] = [];
  if (own) parts.push(n(own, 'of your saved lemmas', 'of your saved lemmas'));
  if (builtIn) parts.push(n(builtIn, 'built-in theorem', 'built-in theorems'));
  let s = `${what} uses ${parts.join(' and ')} directly.`;
  if (!own) s += ' It uses none of your saved lemmas.';
  else {
    const more = lin.lemmas - own;
    s += more > 0 ? ` ${own === 1 ? 'That lemma rests' : 'Those rest'} on ${n(more, 'more of your lemmas', 'more of your lemmas')}.` : ` ${own === 1 ? 'That lemma uses' : 'Those lemmas use'} no other saved lemma.`;
  }
  return s;
}

/** The quiet line of counts, in the map's terms: main orders of the total, side orders apart, the Lemma Book. */
export function lineageCounts(save: FSave, c: Campaign, lin: Lineage, what = 'this proof'): string {
  const ls = CAMPAIGN_LEVELS[c];
  const main = ls.filter((l) => !l.side), side = ls.filter((l) => l.side);
  const saved = campSave(save, c).lemmas.length;
  return `${main.filter((l) => isSolved(save, l.id)).length} of ${main.length} main orders proven, and ${side.filter((l) => isSolved(save, l.id)).length} of ${side.length} side orders. `
    + `You saved ${saved} lemma${saved === 1 ? '' : 's'} of your own; ${what} rests on ${lin.lemmas} of them.`;
}

// ───────────────────────────── the panel ─────────────────────────────

/** A statement that breaks only after ⟹ (or between binders), never inside an equation. */
const IMPLIES = ' <span class="m-rel">⟹</span> ';
const noBreak = (html: string): string => html.split(IMPLIES).map((p, i, all) => `<span class="lin-nb">${p}${i < all.length - 1 ? ' <span class="m-rel">⟹</span>' : ''}</span>`).join(' ');
const noBreakBinders = (html: string): string => html.split(', ').map((p) => `<span class="lin-nb">${p}</span>`).join(', ');
/** A card's statement in two parts: its binders (∀G, K, f : G → K, a, b.) and the body. */
function stmtParts(card: Card): { binders: string; body: string } {
  const html = fH(card, {});
  const i = html.startsWith('∀') ? html.indexOf('.&ensp;') : -1;
  return i < 0 ? { binders: '', body: noBreak(html) } : { binders: noBreakBinders(html.slice(0, i + 1)), body: noBreak(html.slice(i + '.&ensp;'.length)) };
}
/** Where it was proved, said with what it is: "Your lemma, proved in 10 · Idempotents". */
export function whereText(n: Pick<LNode, 'kind' | 'levelId'>, isTarget = false): string {
  if (!n.levelId) return 'Imported: not proved in this game';
  const lv = LEVEL_BY_ID[n.levelId];
  const at = lv ? `${displayNo(lv)}\u00a0·\u00a0${lv.title.replace(' ', '\u00a0')}` : ''; // "6 · Undoing" never splits
  if (isTarget) return `Proved in ${at}`;
  return n.kind === 'lemma' ? `Your lemma, proved in ${at}` : `Built-in theorem, proved in ${at}`;
}
/** A floor's statement for its node: the hypotheses by their names, then each dock's statement on its own line. */
function floorStatement(levelId: string): { hyps: string; lines: string[] } {
  const lv = LEVEL_BY_ID[levelId];
  if (!lv) return { hyps: '', lines: [] };
  const L = labels(lv);
  const allowed = new Set(lv.sockets.flatMap((k) => k.allowedGivens));
  // a named hypothesis reads as its name ("ker f ⊆ ker π"), letters set as maths; a bare label (h) reads as its fact
  const mathName = (n: string) => esc(n).replace(/(^|[\s(])([A-Za-zα-ω])(?=$|[\s)₀-₉])/g, '$1<i>$2</i>');
  const hyps = lv.givens.filter((g) => allowed.has(g.id) && g.fact.k !== 'size').map((g) => (isGivenName(g.name) ? fH(g.fact, L) : mathName(g.name)));
  return { hyps: hyps.length ? `If ${hyps.join(' and ')}, then` : '', lines: lv.sockets.map((k) => noBreak(fH(k.target, L))) };
}
// a world is named by its title (a number here would read like an order's number, "6 · Undoing From One Side")
const worldHead = (w: number | null): string => (w === null ? 'Imported' : BOOK_WORLDS[w]?.title ?? `World ${w}`);
const worldSub = (w: number | null): string => (w !== null && BOOK_WORLDS[w]?.chapters ? `Pinter ch. ${BOOK_WORLDS[w]!.chapters}` : '');
/** "The Fundamental Homomorphism Theorem" → "the lineage of the Fundamental …"; a saved lemma's name is quoted. */
export function lineageTitle(lin: Lineage): string {
  const t = lin.nodes.find((n) => n.key === lin.target)!;
  const std = t.levelId && t.key === 'target' ? theoremNameOf(t.levelId) : null;
  return std ? `The lineage of ${std.replace(/^The /, 'the ')}` : `The lineage of “${t.name}”`;
}

interface OpenOpts { from: 'finale' | 'book' }
let api: { open: (target: LineageTarget, opts?: OpenOpts) => void } | null = null;
/** Open the lineage panel (mounted by the ceremony). */
export function openLineage(target: LineageTarget, opts: OpenOpts = { from: 'book' }) { api?.open(target, opts); }

export function mountLineage(layer: HTMLElement, store: Store) {
  const el = h('div', { class: 'h3-lineage', hidden: true });
  layer.append(el);
  let open = false;
  let drawn: (() => void) | null = null;
  const ro = new ResizeObserver(() => drawn?.());

  const close = () => {
    if (!open) return;
    open = false; drawn = null; ro.disconnect();
    el.hidden = true; el.innerHTML = ''; el.classList.remove('on');
  };

  const show = (target: LineageTarget, opts: OpenOpts) => {
    const s = store.get();
    const c = target.k === 'floor' ? campaignOf(target.levelId) : campaignOf(s.level);
    const cs = campSave(s.save, c);
    const lin = lineageOf(cs, c, target);
    const what = target.k === 'floor' ? 'This proof' : 'Its proof';
    const cols = lineageColumns(lin);
    // one group per world (a world's depth columns side by side under one heading); the target joins its world's group
    const groups: { world: number | null; cols: LNode[][] }[] = [];
    for (const col of cols) {
      const last = groups[groups.length - 1];
      if (last && last.world === col.world) last.cols.push(col.nodes);
      else groups.push({ world: col.world, cols: [col.nodes] });
    }
    // order each column by where its uses sit in the columns before it (fewer crossings)
    const pos = new Map<string, number>();
    for (const g of groups) for (const col of g.cols) {
      const bary = (n: LNode) => { const ps = n.uses.map((u) => pos.get(u)).filter((p): p is number => p !== undefined); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Infinity; };
      const keep = new Map(col.map((n, i) => [n.key, i] as const));
      col.sort((a, b) => { const d = bary(a) - bary(b); return Number.isFinite(d) && d !== 0 ? d : keep.get(a.key)! - keep.get(b.key)!; });
      col.forEach((n, i) => pos.set(n.key, (i + 0.5) / col.length));
    }

    el.innerHTML = '';
    const nodeEls = new Map<string, HTMLElement>();
    const nodeEl = (n: LNode): HTMLElement => {
      const isT = n.key === lin.target;
      let stmt: HTMLElement;
      if (n.card) {
        const p = stmtParts(n.card);
        stmt = h('span', { class: 'lin-stmt math' }, p.binders ? h('span', { class: 'lin-binders', html: p.binders }) : null, h('span', { class: 'lin-body', html: p.body }));
      } else if (n.key === 'press') {
        stmt = h('span', { class: 'lin-stmt math' }, h('span', { class: 'lin-body', html: '<i>x</i><sup class="m-sup">|<i>G</i>|</sup> <span class="m-rel">=</span> <i>e</i>' }));
      } else {
        const fs = n.levelId ? floorStatement(n.levelId) : { hyps: '', lines: [] };
        stmt = h('span', { class: 'lin-stmt math' }, fs.hyps ? h('span', { class: 'lin-binders', html: fs.hyps }) : null, ...fs.lines.map((l) => h('span', { class: 'lin-body', html: l })));
      }
      const b = h('button', { class: `lin-node k-${isT ? 'target' : n.kind}`, 'data-key': n.key, type: 'button', 'aria-label': `${n.name}. ${whereText(n, isT)}.` },
        h('span', { class: 'lin-name' }, n.name),
        stmt,
        h('span', { class: 'lin-where' }, whereText(n, isT)));
      nodeEls.set(n.key, b);
      return b;
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'lin-edges');
    svg.setAttribute('aria-hidden', 'true');
    const field = h('div', { class: 'lin-field' });
    field.append(svg);
    for (const g of groups) {
      const sub = worldSub(g.world);
      field.append(h('div', { class: `lin-world${g.cols.some((col) => col.some((n) => n.key === lin.target)) ? ' has-target' : ''}` },
        h('div', { class: 'lin-whead' }, h('span', { class: 'lin-wname' }, worldHead(g.world)), sub ? h('span', { class: 'lin-wsub' }, sub) : null),
        h('div', { class: 'lin-wcols' }, ...g.cols.map((col) => h('div', { class: `lin-col${col.some((n) => n.key === lin.target) ? ' target' : ''}` }, ...col.map(nodeEl))))));
    }

    // actions: from the finale, onwards (the next order or the map); from the Lemma Book, back to it
    const actions = h('div', { class: 'lin-actions' });
    const nx = target.k === 'floor' ? nextLevel(s.save, target.levelId) : null;
    if (opts.from === 'finale') {
      const go = h('button', { class: 'lw-key primary wide', type: 'button' }, nx ? 'Next work order →' : 'See your theorem map →');
      go.addEventListener('click', () => { close(); if (nx) store.openLevel(nx.id); else store.openMap(); });
      actions.append(go);
    }
    const back = h('button', { class: 'lw-key', type: 'button' }, opts.from === 'finale' ? 'Back to the floor' : 'Close');
    back.addEventListener('click', close);
    actions.append(back);

    const titleId = 'lin-title';
    const panel = h('section', { class: 'lin-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: -1 },
      h('header', { class: 'lin-head' },
        h('h2', { class: 'lin-title', id: titleId }, lineageTitle(lin)),
        h('p', { class: 'lin-sum' }, `${lineageSummary(lin, what)} An arrow reads “used in”.`)),
      h('div', { class: 'lin-scroll' }, field),
      h('footer', { class: 'lin-foot' },
        h('p', { class: 'lin-counts' }, lineageCounts(s.save, c, lin, target.k === 'floor' ? 'this proof' : 'this lemma')),
        actions));
    el.append(panel);

    // the edges: dependency (right edge) → user (left edge), drawn once the columns are laid out
    // widths: every column shares what the panel has (a node never narrower than 148px; the theorem's column wider)
    const colEls = [...field.querySelectorAll<HTMLElement>('.lin-col')];
    const colOf = new Map<string, number>();
    colEls.forEach((col, i) => col.querySelectorAll<HTMLElement>('.lin-node').forEach((x) => colOf.set(x.dataset.key!, i)));
    const GAP = 28;
    const scroller = panel.querySelector<HTMLElement>('.lin-scroll')!;
    const fit = () => {
      const avail = scroller.clientWidth - 8, n = colEls.length;
      const tw = Math.round(Math.min(300, Math.max(220, avail * 0.22)));
      const cw = n > 1 ? Math.floor(Math.min(220, Math.max(148, (avail - GAP * (n - 1) - tw) / (n - 1)))) : 0;
      field.style.setProperty('--lin-colw', `${cw}px`);
      field.style.setProperty('--lin-tw', `${tw}px`);
      field.style.setProperty('--lin-gap', `${GAP}px`);
    };
    // the edges: dependency (right edge) → user (left edge). An edge that skips columns runs in a lane under the
    // columns it passes, never behind a node (where it would read as an edge of that node).
    const draw = () => {
      fit();
      // a statement wider than its node is set a little smaller, never broken inside an equation (as the map does)
      for (const st of field.querySelectorAll<HTMLElement>('.lin-stmt')) {
        st.style.removeProperty('font-size');
        const avail = st.clientWidth, widest = Math.max(0, ...[...st.querySelectorAll<HTMLElement>('.lin-body > .lin-nb')].map((x) => x.getBoundingClientRect().width));
        const base = parseFloat(getComputedStyle(st).fontSize);
        if (avail > 0 && widest > avail) st.style.fontSize = `${Math.max(11, Math.floor(base * (avail / widest) * 10) / 10)}px`;
      }
      const fr = field.getBoundingClientRect();
      const box = (k: string) => { const r = nodeEls.get(k)!.getBoundingClientRect(); return { l: r.left - fr.left, r: r.right - fr.left, t: r.top - fr.top, b: r.bottom - fr.top, m: r.top + r.height / 2 - fr.top }; };
      const lanes: number[] = [];
      const paths: string[] = [];
      const f = (v: number) => v.toFixed(1);
      for (const n of lin.nodes) for (const u of n.uses) {
        if (!nodeEls.has(u) || !nodeEls.has(n.key)) continue;
        const a = box(u), b = box(n.key);
        const x1 = a.r, y1 = a.m, x2 = b.l - 7, y2 = b.m;
        const c1 = colOf.get(u)!, c2 = colOf.get(n.key)!;
        let d: string;
        if (c2 - c1 <= 1) {
          const dx = Math.max(14, (x2 - x1) / 2);
          d = `M${f(x1)},${f(y1)} C${f(x1 + dx)},${f(y1)} ${f(x2 - dx)},${f(y2)} ${f(x2)},${f(y2)}`;
        } else {
          let low = 0;
          for (let i = c1 + 1; i < c2; i++) colEls[i]!.querySelectorAll<HTMLElement>('.lin-node').forEach((x) => { low = Math.max(low, box(x.dataset.key!).b); });
          let yl = low + 12;
          while (lanes.some((y) => Math.abs(y - yl) < 6)) yl += 7;
          lanes.push(yl);
          const g = GAP;
          d = `M${f(x1)},${f(y1)} C${f(x1 + g * 0.8)},${f(y1)} ${f(x1 + g * 0.2)},${f(yl)} ${f(x1 + g)},${f(yl)} L${f(x2 - g + 7)},${f(yl)} C${f(x2 - g * 0.2)},${f(yl)} ${f(x2 - g * 0.8)},${f(y2)} ${f(x2)},${f(y2)}`;
        }
        paths.push(`<path data-from="${esc(u)}" data-to="${esc(n.key)}" d="${d}" marker-end="url(#lin-arrow)"/>`);
      }
      svg.innerHTML = `<defs><marker id="lin-arrow" viewBox="0 0 8 8" refX="1" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>${paths.join('')}`;
    };
    drawn = () => requestAnimationFrame(draw);
    ro.observe(scroller);

    // a node, clicked or focused, shows its own lineage and what it is used in; everything else steps back
    const by = new Map(lin.nodes.map((n) => [n.key, n] as const));
    const users = new Map<string, string[]>();
    for (const n of lin.nodes) for (const u of n.uses) users.set(u, [...(users.get(u) ?? []), n.key]);
    const closure = (k: string, next: (k: string) => string[]) => { const out = new Set<string>([k]); const st = [k]; while (st.length) for (const x of next(st.pop()!)) if (!out.has(x)) { out.add(x); st.push(x); } return out; };
    let pinned: string | null = null;
    const focusOn = (k: string | null) => {
      field.classList.toggle('focused', !!k);
      const on = k ? new Set([...closure(k, (x) => by.get(x)?.uses ?? []), ...closure(k, (x) => users.get(x) ?? [])]) : null;
      for (const [key, e] of nodeEls) e.classList.toggle('lit', !!on?.has(key));
      svg.querySelectorAll('path[data-from]').forEach((p) => p.classList.toggle('lit', !!on && on.has(p.getAttribute('data-from')!) && on.has(p.getAttribute('data-to')!)));
    };
    for (const [key, e] of nodeEls) {
      e.addEventListener('mouseenter', () => { if (!pinned) focusOn(key); });
      e.addEventListener('mouseleave', () => { if (!pinned) focusOn(null); });
      e.addEventListener('focus', () => { if (!pinned) focusOn(key); });
      e.addEventListener('blur', () => { if (!pinned) focusOn(null); });
      e.addEventListener('click', () => { pinned = pinned === key ? null : key; focusOn(pinned); e.setAttribute('aria-pressed', String(pinned === key)); });
    }

    open = true;
    el.hidden = false;
    const still = reducedMotion() || store.get().save.settings.reducedMotion;
    el.classList.toggle('still', !!still);
    fit();
    requestAnimationFrame(() => { draw(); el.classList.add('on'); panel.focus({ preventScroll: true }); });
  };

  // While open the panel owns input: Esc closes, Tab stays inside, nothing reaches the floor or the HUD behind it.
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'Tab') {
      const bs = [...el.querySelectorAll<HTMLElement>('button')];
      const i = bs.indexOf(document.activeElement as HTMLElement);
      e.preventDefault(); e.stopImmediatePropagation();
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement | null)?.closest?.('.h3-lineage button')) { e.stopImmediatePropagation(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keyup', (e) => { if (open) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  const swallow = (e: Event) => { if (open && !el.contains(e.target as Node)) { e.preventDefault(); e.stopImmediatePropagation(); } };
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup']) window.addEventListener(type, swallow, true);
  window.addEventListener('wheel', (e) => { if (open && !(e.target as HTMLElement | null)?.closest?.('.lin-scroll')) { e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true, passive: false });
  store.on((e) => { if (e.type === 'level-opened') close(); });

  api = { open: (t, o) => { close(); show(t, o ?? { from: 'book' }); } };
  const render = (s: S) => { if (open && s.ui.screen !== 'floor') close(); };
  return { render, close, isOpen: () => open };
}
