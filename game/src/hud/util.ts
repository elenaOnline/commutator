// LEMMA WORKS v3 — HUD helpers: DOM, guarded calls, campaign progress, catalogue access, floor anchors.
// Owner: HUD builder. Typesetting is reused from the v2 shell (import only; v2 folders stay untouched).
import * as F from '../factory';
import { rectToScreen } from '../floor/project';
import type { DeskAssumption, Fact, Family, LevelManifest, Pallet, PatFact, StructBinder, SubRef, Subst, Term } from '../kernel/types';
import * as K from '../kernel';
import { campSave, progressOf, type CampaignSave, type FactoryStore, type FState } from '../state/factoryStore';
import { campaignOf } from '../levels/campaigns';
import { cardAliases, eAliases, eTag, isActionApp } from '../ui/sorts';
import { LEVELS, REGISTRY, MIRROR_NAMES, SIDE_PAIRS } from '../levels/levels';
import { LEVEL_BY_ID } from '../levels/campaigns';
import type { ItemValue, Machine, MachineKind, MachineSpec } from '../factory/types';
import { FAMILY } from '../ui/tokens';
import { fH as fH0Raw, tH as tH0, nameHTML } from '../shell/util';
const fH0 = (f: Fact | PatFact, L: Record<string, string>, mode: 'stmt' | 'proof') => fH0Raw(f as Parameters<typeof fH0Raw>[0], L, mode);

export { tU, schemaNames, schemaLemmaNo, nameHTML } from '../shell/util';
import { richHTML as richHTML0 } from '../shell/util';
/**
 * Prose with maths (jams, ideas, notes). Kernel and compiler text is cleaned for the player: a positional Lemma Book
 * binder prints by its name ($2:f → f), and a map is written with its label, never its id (pi(a) → π(a)) (#6).
 */
export const richHTML = (txt: string, level: LevelManifest): string => {
  let t = txt.replace(/\$\d+:/g, '');
  for (const m of level.maps ?? []) if (m.label !== m.id) t = t.replace(new RegExp(`\\b${m.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(`, 'g'), `${m.label}(`);
  return richHTML0(t, level);
};
import { labels as labels0 } from '../shell/util';
/** Level letters, plus (Book phase B) the level's subgroups by name, so `t ∈ H` prints H. */
// K.levelLabels first (KERNEL-EXT §5.13): the two-group mark (every e subscripted), action marks, and the labels the
// kernel registers so its own printing names maps by label (π, never pi); then the HUD's own
export const labels = (level: LevelManifest): Record<string, string> => ({ ...safe(() => K.levelLabels(level), {} as Record<string, string>), ...labels0(level), ...Object.fromEntries((level.subgroups ?? []).map((g) => [g.id, g.label])),
  ...Object.fromEntries((level.sorts ?? []).map((g) => [g.id, g.label])), ...Object.fromEntries((level.maps ?? []).map((g) => [g.id, g.label])),
  // kernel-printed text (jams, transcript, paper) writes an action applied as α(p), as the floor does: mark actions
  ...Object.fromEntries((level.maps ?? []).filter((m) => m.kind === 'action').map((m) => [K.actionMark(m.id), '1'])) });

/** The floor's Tower labels and their sorts (set by the app on every render): typeset maths marks them. */
export const varRegistry = { labels: new Map<string, 'G' | 'Z'>() };
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const digitsOf = (sub: string) => [...sub].map((c) => String(c.charCodeAt(0) - 0x2080)).join('');
const varTag = (label: string, sort: 'G' | 'Z' | undefined, tag: 'i' = 'i') => {
  const m = /^(.*?)([₀₁₂₃₄₅₆₇₈₉]*)$/.exec(label)!;
  return `<${tag} class="m-atom any ${sort === 'Z' ? 'z' : 'g'}" title="${sort === 'Z' ? 'an integer variable: it can be any integer' : 'a variable: it can be any element'}">${m[1]}${m[2] ? `<sub class="m-sub">${digitsOf(m[2])}</sub>` : ''}</${tag}>`;
};
/**
 * Latin Modern has no subscript glyphs: x₁ → x<sub>1</sub>. Tower variables (subscripted letters, or any label
 * in the registry such as a bare x) get a SOLID tinted chip by sort — never hatching (design review, 2026-10-09).
 */
export function fixVars(html: string): string {
  const reg = varRegistry.labels;
  return html
    .replace(/<i class="m-atom">([^<]*)<\/i>/g, (m0, label: string) => (reg.has(label) || /[₀₁₂₃₄₅₆₇₈₉]$/.test(label) ? varTag(label, reg.get(label)) : m0))
    // names inside exponents (ℤ Towers: (ab)^{5k₁}) and anywhere else in text, never inside a tag
    .replace(/(^|>)([^<]*)/g, (_m, gt: string, text: string) => gt + text.replace(/([A-Za-z])([₀₁₂₃₄₅₆₇₈₉]+)/g, (x, a: string, sub: string) => varTag(a + sub, reg.get(a + sub))))
    // bare one-letter integer variables inside exponents: (ab)^{5k}
    .replace(/<sup class="m-sup">([^<]*)<\/sup>/g, (m0, body: string) => {
      const zs = [...reg].filter(([l, so]) => so === 'Z' && /^[A-Za-z]$/.test(l)).map(([l]) => l);
      return zs.length ? `<sup class="m-sup">${body.replace(new RegExp(`[${zs.join('')}]`, 'g'), (c) => varTag(c, 'Z'))}</sup>` : m0;
    });
}
void SUBS;
/**
 * A term as typeset HTML. Book phase C: an identity carries its group as a subscript (e_K) once the floor has two
 * groups (NORMS › Sorts); map terms read f(ab), σ(g, p). Positional Lemma Book binders ($0:f) print by their name.
 */
export const tH = (t: Term, L: Record<string, string>, mode?: 'stmt' | 'proof'): string => {
  const tags: string[] = [];
  const L2: Record<string, string> = { ...L };
  const walk = (x: Term): Term => {
    switch (x.k) {
      case 'e': { const tg = eTag(x); if (!tg) return x; const id = `¶e${tags.length}¶`; tags.push(tg); L2[id] = id; return { k: 'atom', id }; }
      case 'inv': return { ...x, arg: walk(x.arg) };
      case 'mul': return { ...x, fs: x.fs.map(walk) };
      case 'pow': return { ...x, base: walk(x.base) };
      case 'app': {
        // an action applied reads g(p) (Pinter): the group element, then the point in brackets
        if (isActionApp(x)) { const id = `¶a${acts.length}¶`; acts.push(x.args[0]!); L2[id] = id; return { k: 'app', fn: id, args: [walk(x.args[1]!)] }; }
        if (!(x.fn in L2) && x.fn.startsWith('$')) L2[x.fn] = posName(x.fn); return { ...x, args: x.args.map(walk) };
      }
      default: return x;
    }
  };
  const acts: Term[] = [];
  // a negative exponent shows its minus sign (x⁻ⁿ, not xⁿ: the ASCII hyphen vanished at superscript size, W4–9)
  const html = fixVars(tH0(walk(t), L2, mode)).replace(/(<sup class="m-sup">)([^<]*)/g, (_m, a: string, b: string) => a + b.replace(/(^|[^\w])-/g, '$1−'));
  const html2 = acts.length ? html.replace(/<i class="m-atom[^"]*">¶a(\d+)¶<\/i>/g, (_m, n: string) => { const g = acts[+n]!; const gh = tH(g, L, mode); return g.k === 'mul' || g.k === 'pow' ? `(${gh})` : gh; }) : html;
  return tags.length ? html2.replace(/<i class="m-atom[^"]*">¶e(\d+)¶<\/i>/g, (_m, n: string) => `<i class="m-e">e</i><sub class="m-sub m-esort">${nameHTML(tags[+n]!)}</sub>`) : html2;
};
/** Display names for a card's group and set parameters (the kernel's displayCard: G, K, L … never H; sets Ω, Γ). */
export function groupAliases(binds: StructBinder[] | undefined, _L?: Record<string, string>, metas: readonly string[] = []): Record<string, string> {
  return cardAliases(binds, metas);
}
/** Render with identity subscripts following the same aliases (e_T → e_K). */
export function withEAliases<T>(L: Record<string, string>, fn: () => T): T {
  const prev = eAliases.cur;
  eAliases.cur = { ...prev, ...L };
  try { return fn(); } finally { eAliases.cur = prev; }
}
/** A positional Lemma Book binder id ($0:f, $1:H) prints by its name. */
export const posName = (id: string): string => (/^\$\d+:(.+)$/.exec(id)?.[1] ?? id);

// ───────── open docks (Book phase A): the dock's shape with hole chips, filled with the answer on delivery ─────────
/**
 * A level as it should be SHOWN: every open dock's holes become placeholder atoms (`?`, `?₁` …; never an answer),
 * or — for a dock in `answers` (its delivered hole values) — the answer. Render any statement of `level` as usual,
 * then pass the HTML through `chips` to draw each hole as a chip: empty `?` before delivery, the answer after.
 * Witness docks (holes under ∀) work the same way: the bound letters stay letters, only the holes are chips.
 */
export function openView(lv: LevelManifest, answers: Record<string, Subst | null | undefined> = {}): { level: LevelManifest; chips: (html: string) => string; texChips: (tex: string) => string } {
  if (!lv.sockets.some((sk) => K.isOpen(sk))) return { level: lv, chips: (x) => x, texChips: (x) => x };
  const L0 = Object.fromEntries(lv.atoms.map((a) => [a.id, a.label]));
  const chip: string[] = [];
  const tex: string[] = [];
  const atoms = [...lv.atoms];
  const sockets = lv.sockets.map((sk, i) => {
    if (!K.isOpen(sk)) return sk;
    const d = safe(() => K.openDisplay(sk), null);
    if (!d) return sk;
    let json = JSON.stringify(d.fact);
    for (const hd of sk.holes ?? []) {
      const pid = `?${hd.id}`, nid = `?${i}.${hd.id}`, n = chip.length;
      json = json.split(`"id":${JSON.stringify(pid)}`).join(`"id":${JSON.stringify(nid)}`);
      const v = answers[sk.id]?.[hd.id];
      tex.push(v ? safe(() => termTex0(v, L0, 'stmt'), '?') : '\\boxed{\\vphantom{b}?}');
      chip.push(v
        ? `<span class="m-hole filled" title="found">${safe(() => tH(v, L0), '')}</span>${v.k === 'mul' || v.k === 'pow' ? '\u0000' : ''}`
        : `<span class="m-hole" title="to be found">${esc(d.labels[pid] ?? '?')}</span>`);
      atoms.push({ id: nid, label: `¤${n}¤`, hue: 0 });
    }
    return { ...sk, target: JSON.parse(json) as typeof sk.target, holes: [] };
  });
  // a compound answer under a power or an inverse keeps its parentheses inside the chip: ab = (ad)²
  const fill = (n: string, sup: boolean) => { const c = chip[+n] ?? '?'; return c.endsWith('\u0000') ? (sup ? c.slice(0, -1).replace('title="found">', 'title="found">(').replace(/<\/span>$/, ')</span>') : c.slice(0, -1)) : c; };
  const chips = (html: string) => html
    .replace(/<i class="m-atom[^"]*">¤(\d+)¤<\/i>(?=(<sup)?)/g, (_m, n: string, sup?: string) => fill(n, !!sup))
    .replace(/¤(\d+)¤/g, (_m, n: string) => fill(n, false));
  // in LaTeX the hole is a boxed ? (the dock's chip), the answer once delivered
  const texChips = (t: string) => t.replace(/¤(\d+)¤/g, (_m, n: string) => tex[+n] ?? '?');
  return { level: { ...lv, atoms, sockets }, chips, texChips };
}
/** Delivered answers of the current floor's open docks (only what the runtime has shipped). */
export function dockAnswers(s: FState): Record<string, Subst | null> {
  const out: Record<string, Subst | null> = {};
  for (const sk of s.level.sockets) if (K.isOpen(sk)) out[sk.id] = s.compiled && s.run ? safe(() => F.dockAnswer(s.compiled, s.run, sk.id)?.holes ?? null, null) : null;
  return out;
}
type AnyFact = Fact | PatFact;
/** A subgroup's name in maths: a level subgroup / Subgroup Tower by its label (H, N₁), a card's binder by its letter. */
export function subH(ref: SubRef, L: Record<string, string>): string {
  return `<i class="m-subg">${nameHTML(L[ref.id] ?? posName(ref.id))}</i>`;
}
/** The ∀ prefix of a card: structure binders first (∀H ≤ G, ∀N ⊴ G), then the element metas. */
export function quantH(metas: string[], binds: StructBinder[] | undefined, L: Record<string, string>): string {
  const nm = (id: string) => `<i>${nameHTML(L[id] ?? posName(id))}</i>`;
  const sr = (r: string | { k: 'sortmeta'; id: string } | undefined) => (r === undefined ? '<i>G</i>' : nm(typeof r === 'string' ? r : r.id));
  // Book phases B–C: ∀H ≤ G, ∀N ⊴ G, ∀G₁ (a group), ∀f : G₁ → H, ∀σ : G × Ω → Ω
  const bs = (binds ?? []).map((b) => {
    switch (b.k) {
      case 'sub': return `${subH({ k: 'submeta', id: b.id }, L)} <span class="m-rel">${b.normal ? '⊴' : '≤'}</span> ${sr(b.sort)}`;
      case 'hom': return `${nm(b.id)} : ${sr(b.dom)} <span class="m-rel">→</span> ${sr(b.cod)}`;
      case 'act': return `${nm(b.id)} : ${sr(b.grp)} × ${sr(b.on)} <span class="m-rel">→</span> ${sr(b.on)}`;
      default: return nm(b.id);
    }
  });
  const ms = metas.map((m) => `<i>${m}</i>`);
  return [...bs, ...(ms.length ? [ms.join(', ')] : [])].length ? `∀${[...bs, ...(ms.length ? [ms.join(', ')] : [])].join(', ')}.&ensp;` : '';
}
/**
 * Any fact or card statement as typeset HTML. NORMS: `⟹` for implication. Book phase B: memberships `t ∈ H`
 * (H in the subgroup ink), cards with subgroup binders (∀H ≤ G. …). Terms are typeset by the shared renderer.
 */
export function fH(f: AnyFact, L: Record<string, string>, mode: 'stmt' | 'proof' = 'stmt'): string {
  const rel = (r: string) => ` <span class="m-rel">${r}</span> `;
  switch (f.k) {
    case 'mem': return tH(f.t, L, mode) + rel('∈') + subH(f.sub, L);
    case 'law': case 'cond': {
      // a card's group parameters read G, K (the Book's names), never S / T or a positional $1:K (#3, #6)
      const L2 = { ...L, ...groupAliases(f.binds, L, f.metas) };
      return withEAliases(L2, () => f.k === 'law'
        ? quantH(f.metas, f.binds, L2) + tH(f.l, L2, mode) + rel('=') + tH(f.r, L2, mode)
        // no premises: the conclusion alone, never a stray ⟹ (#9)
        : quantH(f.metas, f.binds, L2) + (f.premises.length ? f.premises.map((p) => fH(p, L2, mode)).join(', ') + rel('⟹') : '') + fH(f.concl, L2, mode));
    }
    case 'eq': return tH(f.l, L, mode) + rel('=') + tH(f.r, L, mode);
    case 'neq': return tH(f.l, L, mode) + rel('≠') + tH(f.r, L, mode);
    // Book phase C: the order of a named group, |K| = 3
    case 'size': return f.s ? `|${subH({ k: 'sub', id: f.s }, L).replace('m-subg', 'm-sortname')}|${rel('=')}${f.n}` : fixVars(fH0(f, L, mode));
    default: return fixVars(fH0(f, L, mode));
  }
}
/** LaTeX for any fact or card statement: `\\implies` for implication, `t \\in H` for a membership. */
export function factTeX(f: AnyFact, L0: Record<string, string>, mode: 'stmt' | 'proof' = 'proof'): string {
  // Book phase C: e_{K} once two groups are in play; positional binders by name
  const L: Record<string, string> = { ...L0 };
  const tex = (n: string) => n.replace(/([A-Za-z])([₀₁₂₃₄₅₆₇₈₉]+)/g, (_m, a: string, d: string) => `${a}_{${[...d].map((c) => c.charCodeAt(0) - 0x2080).join('')}}`);
  const walkT = (x: Term): Term => {
    switch (x.k) {
      case 'e': { const tg = eTag(x); if (!tg) return x; const id = `¶E${tg}`; L[id] = `e_{${tex(tg)}}`; return { k: 'atom', id }; }
      case 'inv': return { ...x, arg: walkT(x.arg) };
      case 'mul': return { ...x, fs: x.fs.map(walkT) };
      case 'pow': return { ...x, base: walkT(x.base) };
      case 'app': { if (!(x.fn in L)) L[x.fn] = tex(posName(x.fn)); return { ...x, args: x.args.map(walkT) }; }
      default: return x;
    }
  };
  const termTex0 = (t: Term, L2: Record<string, string>, m: 'stmt' | 'proof') => termTexRaw(walkT(t), L2, m);
  const sub = (r: SubRef) => (L[r.id] ?? posName(r.id)).replace(/([A-Za-z])([₀₁₂₃₄₅₆₇₈₉]+)/g, (_m, a: string, d: string) => `${a}_{${[...d].map((c) => c.charCodeAt(0) - 0x2080).join('')}}`);
  const q = (metas: string[], binds?: StructBinder[]) => {
    const sr = (r: string | { k: 'sortmeta'; id: string } | undefined) => (r === undefined ? 'G' : tex(posName(typeof r === 'string' ? r : r.id)));
    const one = (b: StructBinder): string => {
      switch (b.k) {
        case 'sub': return `${sub({ k: 'submeta', id: b.id })} ${b.normal ? '\\trianglelefteq' : '\\leq'} ${sr(b.sort)}`;
        case 'hom': return `${tex(posName(b.id))} \\colon ${sr(b.dom)} \\to ${sr(b.cod)}`;
        case 'act': return `${tex(posName(b.id))} \\colon ${sr(b.grp)} \\times ${sr(b.on)} \\to ${sr(b.on)}`;
        default: return tex(posName(b.id));
      }
    };
    const parts = [...(binds ?? []).map(one), ...(metas.length ? [metas.join(', ')] : [])];
    return parts.length ? `\\forall ${parts.join(',\\ ')}.\\; ` : '';
  };
  switch (f.k) {
    case 'mem': return `${termTex0(f.t, L, mode)} \\in ${sub(f.sub)}`;
    case 'law': return `${q(f.metas, f.binds)}${termTex0(f.l, L, mode)} = ${termTex0(f.r, L, mode)}`;
    case 'cond': return `${q(f.metas, f.binds)}${f.premises.map((p) => factTeX(p, L, mode)).join(',\\ ')} \\implies ${factTeX(f.concl, L, mode)}`;
    case 'eq': return `${termTex0(f.l, L, mode)} = ${termTex0(f.r, L, mode)}`;
    case 'neq': return `${termTex0(f.l, L, mode)} \\neq ${termTex0(f.r, L, mode)}`;
    case 'bot': return '\\bot';
    case 'size': return `|G| = ${f.n}`;
  }
}
/** A given's label is a name (h, h₂, H, e′) rather than its statement restated; only names are printed as "h: …". */
export const isGivenName = (n: string) => /^[A-Za-z][′']?[₀-₉]*$/.test(n.trim());
/** "h: " before a given's statement, or nothing when the given has no short name (never "b ≠ e: b ≠ e"). */
export const givenPrefixHTML = (n: string) => (n === '|G|' || !isGivenName(n) ? '' : `<i>${nameHTML(n)}</i>:&thinsp;`);
/** An Assume desk's statement as a fact (eq, neq, or a membership). */
export function deskFact(a: DeskAssumption): Pallet {
  return a.rel === 'mem' ? { k: 'mem', t: a.t, sub: a.sub } : { k: a.rel, l: a.l, r: a.r };
}
/** The terms a statement speaks about: an (in)equation's two sides, a membership's one term. */
export const sidesOf = (p: AnyFact): Term[] => (p.k === 'eq' || p.k === 'neq' || p.k === 'law' ? [p.l, p.r] : p.k === 'mem' ? [p.t] : []);
export { LEVELS, LEVEL_BY_ID, REGISTRY, MIRROR_NAMES };

export type Store = FactoryStore;
export type S = FState;

// ───────── DOM ─────────
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string | number | boolean | undefined | null> = {}, ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'html') el.innerHTML = String(v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Call a function from a concurrently-built module; quiet fallback while it is still a stub. */
export function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch (err) {
    if (!(err instanceof Error) || !/not implemented/.test(err.message)) console.warn('[hud]', err);
    return fallback;
  }
}

// ───────── campaign progress (v5 save: one CampaignSave per campaign; rules in state/progress.ts) ─────────
export const MAIN = LEVELS.filter((l) => !l.side);
export { isSolved, isOpen, nextLevel, tally } from '../state/progress';
export { CAMPAIGN_LEVELS, CAMPAIGN_NAMES, campaignOf, displayNo, bookWorlds, type Campaign } from '../levels/campaigns';
/** The current level's campaign part of the save: its earned theorems, Lemma Book, progress. */
export const camp = (s: FState): CampaignSave => campSave(s.save, campaignOf(s.level));
export { progressOf };
export const CHAPTERS: Record<number, { roman: string; name: string }> = {
  1: { roman: 'I', name: 'The Works' },
  2: { roman: 'II', name: 'Suppose' },
  3: { roman: 'III', name: 'Clockwork' },
  4: { roman: 'IV', name: 'Powers' },
};

export const hues = (level: LevelManifest): Record<string, number> => Object.fromEntries(level.atoms.map((a) => [a.id, a.hue]));

// ───────── catalogue ─────────
export const FAMILY_ORDER: Family[] = ['equation', 'inverse', 'identity', 'given', 'structure', 'lemma', 'contradiction', 'scope'];

/** v4 catalogue as the HUD needs it (the editor's SPECS win when they cover the kind). */
const FALLBACK: Partial<Record<MachineKind, MachineSpec>> = {
  spool: { kind: 'spool', name: 'Spool', family: 'equation', glyph: 't=t', blurb: 'Makes t = t from any term.', hotkey: '1', placeable: true },
  rewriter: { kind: 'rewriter', name: 'Rewriter', family: 'equation', glyph: '⥲', blurb: 'Changes one spot of an equation, by a recipe.', hotkey: '2', placeable: true },
  operator: { kind: 'operator', name: 'Operator', family: 'structure', glyph: '✣', blurb: 'Changes the whole equation.', hotkey: '3', placeable: true },
  joiner: { kind: 'joiner', name: 'Joiner', family: 'equation', glyph: '⋈', blurb: 'Combines two facts.', hotkey: '4', placeable: true },
  theorem: { kind: 'theorem', name: 'Theorem', family: 'lemma', glyph: '⟹', blurb: 'Uses a theorem: premises in, conclusion out.', hotkey: '5', placeable: true },
  tower: { kind: 'tower', name: 'Tower', family: 'scope', glyph: '∈G', blurb: 'x can be anything. Prove it for x, and ∀ makes it true for all.', hotkey: '6', placeable: true },
  forall: { kind: 'forall', name: 'Generalizer', family: 'lemma', glyph: '∀', blurb: 'Makes a fact about x true for all x.', hotkey: '7', placeable: true },
  carddock: { kind: 'carddock', name: 'Card Dock', family: 'lemma', glyph: '∀=', blurb: 'Puts a theorem on a belt.', placeable: true },
  hopper: { kind: 'hopper', name: 'Hopper', family: 'structure', glyph: 't', blurb: 'Emits a term. No claim.', placeable: true },
  given: { kind: 'given', name: 'Given Inlet', family: 'given', glyph: '∵', blurb: 'A hypothesis of this order.', placeable: false },
  socket: { kind: 'socket', name: 'Receiving Dock', family: 'equation', glyph: '∎', blurb: 'Deliver the goal here.', placeable: false },
  desk: { kind: 'desk', name: 'Assumption Desk', family: 'scope', glyph: '⊢', blurb: 'Emits the room’s assumption.', placeable: false },
  gate: { kind: 'gate', name: 'Exit Gate', family: 'scope', glyph: '⊣', blurb: 'What leaves the room.', placeable: false },
};
/** v4 hotbar (DESIGN v4 §1): Spool 1 · Rewriter 2 · Operator 3 · Joiner 4 · Theorem 5 · Tower 6 · ∀ 7. */
export const HOTBAR_V4: MachineKind[] = ['spool', 'rewriter', 'operator', 'joiner', 'theorem', 'tower', 'forall'];
export const HOTKEY_V4: Record<string, string> = { spool: '1', rewriter: '2', operator: '3', joiner: '4', theorem: '5', tower: '6', forall: '7' };
export function spec(kind: MachineKind): MachineSpec {
  const ed = (F.SPECS as Partial<Record<string, MachineSpec>> | undefined)?.[kind];
  const fb = FALLBACK[kind];
  const s = ed ? { ...ed, blurb: fb?.blurb ?? ed.blurb } : fb; // the HUD's short copy (COPY.md) wins
  const out = s ?? { kind, name: kind[0]!.toUpperCase() + kind.slice(1), family: 'equation', glyph: '?', blurb: '', placeable: true };
  return HOTKEY_V4[kind] ? { ...out, hotkey: HOTKEY_V4[kind] } : out;
}
export const hotbarKinds = (): MachineKind[] => HOTBAR_V4;
export const drawerKinds = (): MachineKind[] => ['carddock', 'hopper'];
export const VERBS: MachineKind[] = ['rewriter', 'operator', 'joiner', 'theorem'];

/** Static "in → out" reading for hover cards (fallback when ports are not computable). */
export const IO: Partial<Record<MachineKind, [string, string]>> = {
  spool: ['term t (knob or port)', 'equation t = t'],
  rewriter: ['equation · [rule: an equation made here]', 'equation'],
  operator: ['equation · [term t]', 'equation'],
  joiner: ['two facts', 'equation or ⊥'],
  theorem: ['premises · [card: a theorem made here]', 'equation or inequation'],
  tower: ['—', 'broadcasts its symbol to the floor'],
  forall: ['a fact about Tower variables', 'law or theorem card'],
  carddock: ['—', 'card'],
  hopper: ['—', 'term'],
};
export const KIND_WORD: Record<string, string> = { term: 'term', eq: 'equation', neq: 'inequation', bot: '⊥', size: '|G| = n', law: 'law', cond: 'card' };

export function familyInk(f: Family) { return FAMILY[f]; }

/** Display name of a machine on the canvas (earned machines carry their theorem's name). */
export function machineName(m: Pick<Machine, 'kind' | 'config'>): string {
  const c = m.config as { kind: string; recipe?: { k: string; ref?: { k: string; id?: string; mirror?: boolean } } | null; label?: string };
  const ref = c.recipe && 'ref' in c.recipe ? c.recipe.ref : undefined;
  if (c.kind === 'theorem' && ref?.k === 'schema' && ref.id) {
    const sc = REGISTRY[ref.id];
    if (sc) return SIDE_PAIRS[ref.id] ? (ref.mirror ? SIDE_PAIRS[ref.id]!.op : SIDE_PAIRS[ref.id]!.plain) : ref.mirror ? (MIRROR_NAMES[ref.id]?.name ?? `${sc.name} (mirror)`) : sc.name;
  }
  if (c.kind === 'tower' && c.label) return `Tower ${c.label}`;
  return spec(m.kind).name;
}

// ───────── Tower variables ─────────
export interface TowerVar { id: string; label: string; machine: string; sort: 'G' | 'Z' }
/** Variables declared by Towers on this floor (compiled graph vars when present, else Tower configs). */
export function towerVars(s: S): TowerVar[] {
  const out: TowerVar[] = [];
  for (const m of s.canvas.machines) {
    const c = m.config as { kind: string; varId?: string; label?: string; sort?: 'G' | 'Z' };
    // a Subgroup Tower declares a subgroup, not an element: it is not a term letter (subgroupsOf lists it)
    if (c.kind === 'tower' && c.varId && !(c as { sub?: string }).sub && !(c as { group?: boolean }).group && !(c as { hom?: unknown }).hom) out.push({ id: c.varId, label: c.label || c.varId, machine: m.id, sort: c.sort === 'Z' ? 'Z' : 'G' });
  }
  return out;
}
/** Level atoms plus Tower variables, for term entry (parseTerm) and labels. */
export function atomsAll(s: S): import('../kernel/types').AtomDecl[] {
  // Tower variables always wear the variable look: one round bead in the variable tint, whatever the level (#16)
  const vs = towerVars(s).map((v) => ({ id: v.id, label: v.label, hue: 0, variable: true, sort: v.sort }));
  const g = (s.compiled?.graph?.vars ?? []).filter((v) => !vs.some((w) => w.id === v.id)).map((v) => ({ ...v, hue: 0 }));
  return [...s.level.atoms, ...vs, ...g];
}
export const labelsAll = (s: S): Record<string, string> => ({ ...labels(s.level), ...Object.fromEntries(atomsAll(s).map((a) => [a.id, a.label])), ...Object.fromEntries(subgroupsOf(s).map((g) => [g.id, g.label])),
  // Book phase C: group and Hom Towers name sorts and maps (G₁, f₁)
  ...Object.fromEntries(s.canvas?.machines.flatMap((m) => { const c = m.config as { kind: string; varId?: string; label?: string; group?: boolean; hom?: unknown }; return c.kind === 'tower' && c.varId && (c.group || c.hom) ? [[c.varId, c.label ?? c.varId]] : []; }) ?? []) });
/** Book phase B: the subgroups in play — the level's, then the floor's Subgroup Towers (H₁ ≤ G, N₁ ⊴ G). */
export function subgroupsOf(s: S): { id: string; label: string; normal: boolean; tower: boolean }[] {
  const out = (s.level.subgroups ?? []).map((g) => ({ id: g.id, label: g.label, normal: !!g.normal, tower: false }));
  for (const m of s.canvas?.machines ?? []) {
    const c = m.config as { kind: string; varId?: string; label?: string; sub?: 'sub' | 'normal' };
    if (c.kind === 'tower' && c.sub && c.varId && !out.some((x) => x.id === c.varId)) out.push({ id: c.varId, label: c.label || c.varId, normal: c.sub === 'normal', tower: true });
  }
  return out;
}
export const huesAll = (s: S): Record<string, number> => Object.fromEntries(atomsAll(s).map((a) => [a.id, a.hue]));
/** Tower variable id → sort. */
export const varSortsOf = (s: S): Map<string, 'G' | 'Z'> => new Map(atomsAll(s).filter((a) => (a as { variable?: boolean }).variable).map((a) => [a.id, (a as { sort?: 'G' | 'Z' }).sort === 'Z' ? 'Z' : 'G'] as [string, 'G' | 'Z']));
export const varIdsOf = (s: S): Set<string> => new Set(atomsAll(s).filter((a) => (a as { variable?: boolean }).variable).map((a) => a.id));
/** Does a term mention an atom id? */
export function mentions(t: Term, id: string): boolean {
  switch (t.k) {
    case 'atom': return t.id === id;
    case 'inv': return mentions(t.arg, id);
    case 'mul': return t.fs.some((f) => mentions(f, id));
    default: { const b = (t as { base?: Term }).base; return b ? mentions(b, id) : false; }
  }
}
export function atomsIn(t: Term, out = new Set<string>()): Set<string> {
  if (t.k === 'atom') out.add(t.id); else if (t.k === 'inv') atomsIn(t.arg, out); else if (t.k === 'mul') t.fs.forEach((f) => atomsIn(f, out));
  else { const b = (t as { base?: Term }).base; if (b) atomsIn(b, out); }
  return out;
}

// ───────── items as maths ─────────
export function itemHTML(v: ItemValue | undefined, L: Record<string, string>): string {
  if (!v) return '';
  if (v.k === 'term') return tH(v.term, L);
  return fH(v.k === 'fact' ? v.fact : v.card, L, 'proof');
}
export const termOf = (v: ItemValue | undefined): Term | null => (v && v.k === 'term' ? v.term : null);

// ───────── floor anchors ─────────
// The lens and hints anchor to machines on the floor. Order: a helper exported by ../floor (if any);
// the floor's own projection (floor/project.ts: camera convention shared with the HUD) applied to the
// machine's grid rect; elements tagged data-machine="<id>"; else null (callers dock at the right edge).
type RectLike = { left: number; top: number; width: number; height: number };
const FLOOR_HELPERS = ['machineScreenRect', 'screenRectOf', 'machineRect', 'rectOfMachine', 'anchorOf'];
/** The floor module, once its dynamic import resolves (index.ts sets it). */
export const floorModule: { mod: Record<string, unknown> } = { mod: {} };
export function machineRect(id: string, s?: S): RectLike | null {
  const fl = floorModule.mod;
  for (const name of FLOOR_HELPERS) {
    const fn = fl[name];
    if (typeof fn !== 'function') continue;
    try {
      const r = (fn as (id: string) => unknown)(id) as Partial<RectLike & { x: number; y: number; w: number; h: number }> | null;
      if (r) {
        const left = r.left ?? r.x, top = r.top ?? r.y, width = r.width ?? r.w ?? 0, height = r.height ?? r.h ?? 0;
        if (typeof left === 'number' && typeof top === 'number') return { left, top, width, height };
      }
    } catch { /* not ready */ }
  }
  const root = document.getElementById('floor');
  if (!root || !root.querySelector('svg, canvas')) return null; // the floor has not drawn anything yet
  const q = CSS.escape(id);
  const tagged = root.querySelector(`[data-machine="${q}"], [data-machine-id="${q}"], [data-mid="${q}"]`);
  if (tagged) {
    const r = tagged.getBoundingClientRect();
    if (r.width || r.height) return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  if (!s) return null;
  const m = s.canvas.machines.find((x) => x.id === id);
  if (!m) return null;
  const g = safe(() => F.rectOf(m, s.ctx), null);
  const fr = root.getBoundingClientRect();
  if (!g || !fr.width) return null;
  const sr = rectToScreen(s.ui.camera, { w: fr.width, h: fr.height }, g.x, g.y, g.x + g.w, g.y + g.h, 0.3);
  return { left: fr.left + sr.x, top: fr.top + sr.y, width: sr.w, height: sr.h };
}

/** Last pointer position (toasts appear near it). */
export const pointer = typeof window !== 'undefined' ? { x: innerWidth / 2, y: innerHeight - 120 } : { x: 0, y: 0 };
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true, capture: true });

/** Copy text, with a textarea fallback. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', {}, text); document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove(); return ok;
  }
}

/** The level's own idea line (v4 content). */
export const ideaOf = (lv: LevelManifest): string => lv.idea;

// ───────── statements: card targets (∀ goals) as textbook sentences ─────────
import { statementOf as statementOf0, termTex as termTex0, termTex as termTexRaw } from '../shell/util';
type St = ReturnType<typeof statementOf0>;
/** "Lemma n. For all …" for any order, including ∀ goals (law / conditional-card docks). */
export function statementOf(level: LevelManifest, opts: { any?: boolean } = {}): St {
  const cards = level.sockets.map((sk) => sk.target).filter((t) => t.k === 'law' || t.k === 'cond');
  if (!cards.length) {
    // an open dock's hole is not one of the elements the statement ranges over: drop it from "For all a, b ∈ G"
    const st = statementOf0(level, opts);
    const head = (x: string, at: string) => { const i = x.indexOf(at); return i < 0 ? x : x.slice(0, i).replace(/(, )?<i class="m-atom[^"]*">¤\d+¤<\/i>/g, '') + x.slice(i); };
    const headT = (x: string) => { const i = x.indexOf(' \\in G$'); return i < 0 ? x : x.slice(0, i).replace(/(, )?¤\d+¤/g, '') + x.slice(i); };
    return { ...st, html: head(st.html, '&thinsp;∈&thinsp;<i>G</i>'), tex: headT(st.tex) };
  }
  // the level's names for maps and sorts (π, K), and the cards' group parameters as G, K — never S / T (#3)
  const L: Record<string, string> = { ...labels(level), ...Object.assign({}, ...cards.map((c) => groupAliases((c as { binds?: StructBinder[] }).binds, labels(level)))) };
  const metas = [...new Set(cards.flatMap((c) => (c as { metas: string[] }).metas))];
  // integer variables are those inside exponents ((ab)^{5k}): they range over ℤ, not G
  const zs = new Set<string>();
  const walk = (t: Term) => {
    if (t.k === 'pow') { for (const term of t.exp) for (const x of term.monomial) if (x.ref.k === 'zmeta') zs.add(x.ref.id); walk(t.base); }
    else if (t.k === 'inv') walk(t.arg); else if (t.k === 'mul') t.fs.forEach(walk);
  };
  for (const c of cards) {
    if (c.k === 'law') { walk(c.l); walk(c.r); }
    else if (c.k === 'cond') { for (const p of c.premises) if (p.k === 'eq' || p.k === 'neq') { walk(p.l); walk(p.r); } if (c.concl.k === 'eq' || c.concl.k === 'neq') { walk(c.concl.l); walk(c.concl.r); } }
  }
  const gm = metas.filter((m) => !zs.has(m)), zm = metas.filter((m) => zs.has(m));
  const it = (ms: string[]) => ms.map((m) => `<i class="m-atom${opts.any ? ' any' : ''}">${esc(m)}</i>`).join(', ');
  // each element variable with its own group (x, y ∈ G and u, v ∈ K), from the cards' meta sorts (W4–9)
  const sortOfMeta = (m: string): string => {
    for (const c of cards) { const r = (c as { metaSorts?: Record<string, string | { id: string }> }).metaSorts?.[m]; if (r) { const id = typeof r === 'string' ? r : r.id; return L[id] ?? posName(id); } }
    return 'G';
  };
  const bySort = new Map<string, string[]>();
  for (const m of gm) { const k = sortOfMeta(m); bySort.set(k, [...(bySort.get(k) ?? []), m]); }
  const mvH = [...[...bySort].map(([sl, ms]) => `${it(ms)}&thinsp;∈&thinsp;<i>${esc(sl)}</i>`), zm.length ? `${it(zm)}&thinsp;∈&thinsp;ℤ` : ''].filter(Boolean).join('</span> and <span class="math">');
  const mvT = [...[...bySort].map(([sl, ms]) => `${ms.join(', ')} \\in ${sl}`), zm.length ? `${zm.join(', ')} \\in \\mathbb{Z}` : ''].filter(Boolean).join('$ and $');
  const clause = (t: (typeof cards)[number], html: boolean): string => {
    if (t.k === 'law') return html ? `<span class="math">${fH({ k: 'eq', l: t.l, r: t.r }, L)}</span>` : `$${factTeX({ k: 'eq', l: t.l, r: t.r }, L, 'stmt')}$`;
    if (t.k === 'cond') {
      const prem = t.premises.map((p) => (html ? `<span class="math">${fH(p, L)}</span>` : `$${factTeX(p, L, 'stmt')}$`)).join(' and ');
      const concl = html ? `<span class="math">${fH(t.concl, L)}</span>` : `$${factTeX(t.concl, L, 'stmt')}$`;
      return prem ? `if ${prem}, then ${concl}` : concl;
    }
    return '';
  };
  const fTex = (f: { k: string; l: Term; r: Term }) => `${tTex(f.l)} ${f.k === 'neq' ? '\\neq' : '='} ${tTex(f.r)}`;
  const tTex = (t: Term): string => safe(() => termTex0(t, L, 'stmt'), '');
  const html = `For all <span class="math">${mvH}</span>, ${cards.map((c) => clause(c, true)).join(', and ')}.`;
  const tex = `For all $${mvT}$, ${cards.map((c) => clause(c, false)).join(', and ')}.`;
  return { html, tex, plainHTML: level.sockets.map((sk) => `<span class="math">${fH(sk.target, L)}</span>`).join('<span class="qed-and">and</span>') };
}

// ───────── typed fields: x1 / x_1 → x₁ as you type (only when that names a Tower; bare x stays x) ─────────
const SUBDIG = '₀₁₂₃₄₅₆₇₈₉';
/** Attach live subscripting to an input. `labels()` = the Tower labels it may refer to; `any` subscripts every letter+digits. */
export function liveSubscripts(input: HTMLInputElement, labels: () => Set<string>, any = false) {
  input.addEventListener('input', () => {
    const v = input.value, caret = input.selectionStart ?? v.length;
    const known = labels();
    let removed = 0, before = 0;
    const out = v.replace(/([A-Za-z])_?(\d+)/g, (m, a: string, d: string, off: number) => {
      const lab = a + [...d].map((c) => SUBDIG[+c]).join('');
      if (!any && !known.has(lab)) return m;
      const drop = m.length - lab.length;
      if (off + m.length <= caret) before += drop;
      removed += drop;
      return lab;
    });
    let out2 = out, before2 = before;
    out2 = out2.replace(/\^-1/g, (m: string, off: number) => { if (off + m.length <= caret - before) before2 += m.length - 2; return '⁻¹'; });
    if (out2 !== v) { input.value = out2; const c = caret - before2; input.setSelectionRange(c, c); input.dispatchEvent(new Event('input')); }
    void removed;
  });
}
export const towerLabelSet = (s: S): Set<string> => new Set(towerVars(s).map((v) => v.label));
