// COMMUTATOR — pointer reachability (test-side introspection; read-only and pure; not used by the shipped HUD).
//
// A Book reference solution is built through the editor API, which bypasses the HUD. This module asks, for every
// machine and room on such a floor, whether a player with the real pointer could have configured it:
//   1. recipe offered: the machine's recipe / LibRef is a row of the HUD's own recipe picker (libraryFor), and the
//      row's toggle (mirror side, pair orientation) and struct chooser can reach the configured variant;
//   2. knobs typeable: every knob value the config sets has a knob the lens shows (term slot or integer knob) that
//      accepts it — terms through the slot parser (readSlot), integers through K.parseInteger;
//   3. room assumptions typeable through the room popover / room editor (terms, = / ≠ / ∈ toggles, subgroup pills);
//   4. Towers configurable through the Tower lens's options for that level.
//
// Which knobs the lens shows comes from hud/metas.ts, the module lens.ts itself uses, so the check cannot drift.
import * as K from '../kernel';
import type { Card, Fact, MetaId, Poly, Term } from '../kernel/types';
import type { LibRef, Machine, MachineConfig, MachineResult, Param, Room } from '../factory/types';
import { mapsInScope } from '../factory/catalog';
import { polyEq } from '../kernel/poly';
import { entryKeyOf } from './merge';
import { libCard, libraryFor, recipeKey, type AnyRecipe, type LibEntry } from './library';
import { readSlot, readVarName } from './slotparse';
import { freeMetas, theoremFree, zMetas } from './metas';
import { atomsAll, labelsAll, safe, subgroupsOf, towerVars, type S } from './util';
import { sortCtx } from '../ui/sorts';

export type ReachArea = 'recipe' | 'toggle' | 'knob' | 'struct' | 'target' | 'room' | 'tower';
export interface ReachIssue {
  machine: string;          // machine id, or the room id
  kind: string;             // machine kind, or 'room'
  area: ReachArea;
  detail: string;
  /** For callers that re-check by recompiling: 'no-knob' (meta = the value's meta), 'not-listed' (recipe not a row). */
  code?: 'no-knob' | 'not-listed' | 'no-toggle';
  meta?: string;
}

// ───────── what a player can type ─────────

const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const subs = (src: string) => src.replace(/_(\d+)/g, (_x, d: string) => [...d].map((ch) => SUBS[+ch]).join(''));
const hasMeta = (t: unknown): boolean => JSON.stringify(t).includes('"k":"meta"') || JSON.stringify(t).includes('"k":"submeta"');

/**
 * What a player types for `t` using the slot grammar's explicit forms (K.parseTerm): power nodes as `b^(exp)` (a bare
 * `b^5` is the five-factor WORD), inverses as `(t)^-1`, maps as `f(u, v)`.
 */
export function typedText(t: Term, L: Record<string, string>): string {
  const go = (u: Term): string => {
    switch (u.k) {
      case 'atom': return L[u.id] ?? u.id;
      case 'e': return u.s && u.s !== 'G' ? K.termText(u, L) : 'e';
      case 'inv': return `(${go(u.arg)})^-1`;
      case 'mul': return u.fs.map((x) => (x.k === 'mul' ? `(${go(x)})` : go(x))).join(' ');
      case 'pow': return `(${go(u.base)})^(${K.exponentText(u.exp, L)})`;
      case 'app': return `${L[u.fn] ?? u.fn}(${u.args.map(go).join(', ')})`;
      default: return K.termText(u, L);
    }
  };
  return go(t);
}

/**
 * Can a term slot (lens knob, room popover, room editor: all readSlot over atomsAll) produce exactly `t`? null = yes.
 * Tries the term as the HUD prints it, then the explicit typed form. `printed` reports when only the second works
 * (the slot's own printed text of the value reads back as a different term).
 */
let noteSink: ((text: string, reads: string) => void) | null = null;
export function termTypeable(s: S, t: Term, printed: ((text: string, reads: string) => void) | null = noteSink): string | null {
  if (hasMeta(t)) return `a card variable (meta) cannot be typed: ${JSON.stringify(t)}`;
  const L = labelsAll(s);
  const reads = (text: string): Term | null => { const r = readSlot(text, atomsAll(s)); return r.k === 'ok' ? r.term : null; };
  const shown = safe(() => K.termText(t, L), '');
  const a = shown ? reads(shown) : null;
  if (a && safe(() => K.termEq(a, t), false)) return null;
  const typed = safe(() => typedText(t, L), '');
  const b = typed ? reads(typed) : null;
  if (b && safe(() => K.termEq(b, t), false)) {
    printed?.(shown, a ? safe(() => K.termText(a, L), '?') : 'nothing');
    return null;
  }
  const r = readSlot(typed || shown, atomsAll(s));
  return `neither "${shown}" nor "${typed}" reads as the configured term in a term slot (${r.k === 'bad' ? r.error : r.k === 'ok' ? `reads as ${safe(() => K.termText(r.term, L), '?')}` : 'empty'})`;
}

/** Can the integer knob (K.parseInteger over atomsAll, ℤ Tower names) produce exactly `p`? null = yes. */
export function intTypeable(s: S, p: Poly): string | null {
  if (JSON.stringify(p).includes('"zmeta"')) return 'an exponent meta cannot be typed';
  const L = labelsAll(s);
  const text = safe(() => K.exponentText(p, L), '');
  const r = safe(() => K.parseInteger(subs(text), atomsAll(s)), { ok: false as const, error: 'threw' });
  if (!r.ok) return `"${text}" does not read in an integer knob (${r.error})`;
  if (r.term.k !== 'int' || !safe(() => polyEq(r.term.k === 'int' ? r.term.val : [], p), false)) return `"${text}" reads as a different integer`;
  return null;
}

const paramWhy = (s: S, p: Param | undefined, o: { int: boolean; portable: boolean }): string | null => {
  if (!p) return null;
  if (p.k === 'port') return o.int ? 'integer knobs have no port; the config routes it from a port' : o.portable ? null : 'this knob has no port option';
  if (!p.term) return null;
  const isInt = p.term.k === 'int';
  if (o.int && !isInt) return `the lens shows an INTEGER knob here, but the config sets a term (${safe(() => K.termText(p.term!, labelsAll(s)), '?')})`;
  if (!o.int && isInt) return 'the lens shows a TERM slot here, but the config sets an integer (exponent)';
  return isInt ? intTypeable(s, (p.term as { val: Poly }).val) : termTypeable(s, p.term);
};

// ───────── recipes ─────────

const refOf = (r: AnyRecipe | null | undefined): LibRef | undefined => (r as { ref?: LibRef } | null)?.ref;
const lit = (id: string) => /^power\.literal:(\d+)$/.exec(id)?.[1];

/** The picker row a configured recipe comes from, or why there is none. */
function pickRow(s: S, kind: string, recipe: AnyRecipe): { entry?: LibEntry; why?: string } {
  const all = libraryFor(s, kind as never);
  const ref = refOf(recipe);
  const key = entryKeyOf(recipeKey(recipe));
  // power.literal:r — the family row with its r knob (any r ≥ 1), or the exact listed literal
  if (ref?.k === 'schema' && lit(ref.id)) {
    const fam = s.level.tools.schemas.includes(K.POWER_LITERAL_FAMILY);
    const row = all.find((x) => x.key === `schema:${K.POWER_LITERAL_FAMILY}`);
    if (!row) return { why: `no literal-power row (${ref.id})` };
    if (fam) return { entry: row };
    if (refOf(row.recipe)?.k === 'schema' && (refOf(row.recipe) as { id: string }).id === ref.id) return { entry: row };
    return { why: `${ref.id} is not the listed literal and there is no r knob (the level does not list ${K.POWER_LITERAL_FAMILY})` };
  }
  let entry = all.find((x) => x.key === key);
  // a map law configured without its hom: the compiler settles it from the redex, any row of that law will do
  if (!entry && !key.includes('@')) entry = all.find((x) => x.key.split('@')[0] === key);
  if (!entry) {
    const near = all.filter((x) => x.key.split('@')[0] === key.split('@')[0]).map((x) => x.key);
    return { why: `"${key}" is not in the ${kind} picker${near.length ? ` (it offers ${near.join(', ')})` : ''}` };
  }
  // the key does not always carry the whole ref (an older recipeKey wrote every Lagrange as 'lagrange'): which group
  // a Lagrange row is for must match too (absent = the first group with an order given, as the compiler reads it)
  if (ref?.k === 'lagrange') {
    const first = s.level.givens.flatMap((g) => (g.fact.k === 'size' ? [g.fact.s ?? 'G'] : []))[0] ?? 'G';
    const sortOf = (r: LibRef | undefined) => (r?.k === 'lagrange' ? r.sort ?? first : '');
    const rows = all.filter((x) => refOf(x.recipe)?.k === 'lagrange');
    const hit = rows.find((x) => sortOf(refOf(x.recipe)) === sortOf(ref));
    if (!hit) return { why: `Lagrange in ${sortOf(ref)} is not in the ${kind} picker (its Lagrange rows: ${rows.map((x) => `in ${sortOf(refOf(x.recipe))}`).join(', ') || 'none'})` };
    return { entry: hit };
  }
  return { entry };
}

/** Mirror side / pair orientation: can the row's toggle reach the configured variant? */
function toggleWhy(entry: LibEntry, recipe: AnyRecipe): string | null {
  const ref = refOf(recipe);
  if (ref?.k === 'schema' && ref.mirror && entry.sides?.k !== 'mirror') return `the row "${entry.name}" has no side toggle, so the mirror (${ref.id} ᵒᵖ) cannot be chosen`;
  if ((recipe as { k: string }).k === 'insertPair' && entry.sides?.k !== 'orient') return 'insert pair has no orientation toggle';
  return null;
}

/** Struct binders (which subgroup / hom plays H, f): offered by the picker row itself or by the lens's "at" chips. */
function structWhy(s: S, m: Machine, res: MachineResult | undefined, entry: LibEntry | undefined, binders: Record<string, string>, via: 'ref' | 'cfg'): string[] {
  const out: string[] = [];
  const plays = res?.structs ?? [];
  const rowStructs = (entry?.ref as { structs?: Record<string, string> } | undefined)?.structs ?? {};
  // chips only act on Theorems and Rewriter laws (lens.ts › recipeSection); elsewhere they are drawn but inert
  const chipsAct = m.kind === 'theorem' || (m.kind === 'rewriter' && (m.config as { recipe?: { k?: string } }).recipe?.k === 'law');
  for (const [binder, id] of Object.entries(binders)) {
    if (via === 'ref' && rowStructs[binder] === id) continue;
    const st = plays.find((p) => p.binder === binder || p.binder.replace(/^\$\d+:/, '') === binder);
    if (!st) { out.push(`${binder} := ${id}: no chooser for ${binder} (the picker row does not fix it and the lens shows no "at" row)`); continue; }
    if (!st.options.some((o) => o.id === id)) { out.push(`${binder} := ${id}: the "at" chooser offers only ${st.options.map((o) => o.id).join(', ') || 'nothing'}`); continue; }
    if (!chipsAct) out.push(`${binder} := ${id}: the "at" chips are drawn for a ${m.kind} but clicking them does nothing`);
  }
  return out;
}

// ───────── per machine ─────────

function machineIssues(s: S, m: Machine): ReachIssue[] {
  const out: ReachIssue[] = [];
  const add = (area: ReachArea, detail: string, extra: Partial<ReachIssue> = {}) => out.push({ machine: m.id, kind: m.kind, area, detail, ...extra });
  const c = m.config;
  const res = s.compiled?.machines?.[m.id];
  const L = labelsAll(s);
  const valueKnobs = (card: Fact | null, shown: MetaId[], values: Record<MetaId, Param>) => {
    const zs = zMetas(card);
    for (const [meta, p] of Object.entries(values)) {
      if (p.k === 'knob' && !p.term) continue;
      if (!shown.includes(meta)) { add('knob', `${meta}: the lens shows no knob for ${meta} (knobs: ${shown.join(', ') || 'none'})`, { code: 'no-knob', meta }); continue; }
      const why = paramWhy(s, p, { int: zs.has(meta), portable: true });
      if (why) add('knob', `${meta}: ${why}`);
    }
  };
  const recipeCheck = (recipe: AnyRecipe | null): LibEntry | undefined => {
    if (!recipe) return undefined;
    const { entry, why } = pickRow(s, m.kind, recipe);
    if (why) { add('recipe', why, { code: 'not-listed' }); return undefined; }
    const tw = toggleWhy(entry!, recipe);
    if (tw) add('toggle', tw, { code: 'no-toggle' });
    return entry;
  };
  switch (c.kind) {
    case 'spool': { const w = paramWhy(s, c.t, { int: false, portable: true }); if (w) add('knob', `t: ${w}`); break; }
    case 'hopper': { if (c.t) { const w = termTypeable(s, c.t); if (w) add('knob', `t: ${w}`); } break; }
    case 'joiner': recipeCheck(c.recipe); break;
    case 'operator': {
      const r = c.recipe;
      recipeCheck(r);
      if (r?.k === 'multiply') { const w = paramWhy(s, r.t, { int: false, portable: true }); if (w) add('knob', `t: ${w}`); }
      if (r?.k === 'apply') {
        const mp = safe(() => mapsInScope(s.ctx, s.canvas as never), []).find((x) => x.id === r.fn);
        const n = mp?.args.length ?? 1;
        if ((r.slot ?? 0) >= n) add('knob', `apply ${r.fn}: argument slot ${r.slot} does not exist`);
        if (n === 1 && r.others?.length) add('knob', `apply ${r.fn}: a one-argument map shows no other-argument knobs`);
        (r.others ?? []).forEach((p, i) => { const w = paramWhy(s, p, { int: false, portable: true }); if (w) add('knob', `apply ${r.fn} argument ${i}: ${w}`); });
      }
      break;
    }
    case 'rewriter': {
      const r = c.recipe;
      const entry = recipeCheck(r);
      if (!r) break;
      if (r.k === 'insertPair') { const w = paramWhy(s, r.x, { int: false, portable: true }); if (w) add('knob', `x: ${w}`); }
      const card = r.k === 'law' ? libCard(s, r.ref) : r.k === 'routed' ? (() => { const v = res?.inputs['rule']; return v?.k === 'card' ? v.card : v?.k === 'fact' ? v.fact : null; })() : null;
      if (r.k === 'law' || r.k === 'routed') valueKnobs(card, freeMetas(card, c.dir, {}), c.values);
      else {
        if (Object.values(c.values).some((p) => !(p.k === 'knob' && !p.term))) add('knob', `values set on a ${r.k} recipe, which shows no knobs`);
        if (c.dir !== 'fwd') add('knob', `direction ${c.dir} on a ${r.k} recipe, which shows no direction control`);
      }
      // "tidy" is shown only where a rewrite can leave an e (lens.ts › writesE)
      if (!c.tidy) {
        const writesE = r.k === 'cancel' || ((r.k === 'law' || r.k === 'routed') && (!card || !('l' in card) ? r.k === 'routed' : JSON.stringify(c.dir === 'rev' ? card.l : card.r).includes('"k":"e"')));
        if (!writesE) add('knob', 'tidy is off, but this recipe shows no tidy toggle');
      }
      if (r.k === 'law' && r.ref.k === 'schema' && r.ref.structs && !/^(hom|act)\./.test(r.ref.id)) for (const w of structWhy(s, m, res, entry, r.ref.structs, 'ref')) add('struct', w);
      // pinned targets are picked on the incoming equation's braces / carets (drawTargets over res.candidates)
      const pinned = r.k === 'insertE' || r.k === 'insertPair' ? c.gap.k === 'pin' : c.target.k === 'pin' || c.gap.k === 'pin';
      if (pinned) {
        const work = res?.inputs['q'];
        const drawn = work?.k === 'fact' && (work.fact.k === 'eq' || work.fact.k === 'neq' || work.fact.k === 'mem');
        if (!drawn) add('target', 'a pinned target, but the lens draws no equation to pick it on');
        else if (!res?.candidates?.length || res.chosen === undefined) add('target', 'the pinned target is not one of the drawn candidates');
      }
      break;
    }
    case 'theorem': {
      const r = c.recipe;
      const entry = recipeCheck(r);
      if (!r) break;
      const card = (r.k === 'library' ? libCard(s, r.ref) : (Object.values(res?.inputs ?? {}).find((v) => v?.k === 'card') as { card: Card } | undefined)?.card) as Card | null;
      if (card && (card.k === 'cond' || card.k === 'law')) valueKnobs(card, theoremFree(card, {}), c.values);
      else if (Object.values(c.values).some((p) => !(p.k === 'knob' && !p.term))) add('knob', 'values set, but the lens has no card to show knobs for');
      if (c.choice) {
        const w = res?.inputs['p0'];
        const eqWork = w?.k === 'fact' && (w.fact.k === 'eq' || w.fact.k === 'neq');
        if (!eqWork) add('knob', `choice ${c.choice}: cut handles are drawn only on an equation premise`);
        else if ((res?.choices?.length ?? 0) <= c.choice) add('knob', `choice ${c.choice}: the lens offers ${res?.choices?.length ?? 0} cuts`);
      }
      const refStructs = r.k === 'library' && r.ref.k === 'schema' ? r.ref.structs : undefined;
      if (refStructs) for (const w of structWhy(s, m, res, entry, refStructs, 'ref')) add('struct', w);
      if (c.structs) for (const w of structWhy(s, m, res, entry, c.structs, 'cfg')) add('struct', w);
      break;
    }
    case 'carddock': {
      if (!c.ref) break;
      const entry = recipeCheck({ k: 'ref', ref: c.ref });
      if (c.ref.k === 'schema' && c.ref.structs) for (const w of structWhy(s, m, res, entry, c.ref.structs, 'ref')) add('struct', w);
      break;
    }
    case 'tower': for (const w of towerWhy(s, m)) add('tower', w); break;
    default: break; // given, socket, desk, gate: placed by the work order; ∀ has no settings
  }
  void L;
  return out;
}

/** The Tower lens (lens.ts › towerView): which sorts and structures the level offers, and a name the slot accepts. */
function towerWhy(s: S, m: Machine): string[] {
  const out: string[] = [];
  const cfg = m.config as Extract<MachineConfig, { kind: 'tower' }>;
  const lv = s.level as { campaign?: string; chapter: number; subgroups?: unknown; sorts?: unknown[]; maps?: unknown[] };
  const isZ = cfg.sort === 'Z';
  const zOk = lv.campaign !== 'book' || lv.chapter >= 10;
  const subOk = lv.campaign === 'book' && (lv.subgroups !== undefined || lv.chapter >= 12);
  const many = !!(lv.sorts?.length || lv.maps?.length) || (lv.campaign === 'book' && lv.chapter >= 9);
  if (isZ && !cfg.sub && !zOk) out.push(`${cfg.label} ∈ ℤ: the ∈ ℤ toggle appears from chapter 10 (this is chapter ${lv.chapter})`);
  if (cfg.sub && !subOk) out.push(`${cfg.label} ${cfg.sub === 'normal' ? '⊴' : '≤'} G: the subgroup toggles need level subgroups or chapter ≥ 12 (chapter ${lv.chapter})`);
  if ((cfg.group || cfg.hom) && !many) out.push(`${cfg.label}: the "or let" group / homomorphism row needs sorts, maps or chapter ≥ 9 (chapter ${lv.chapter})`);
  const env = sortCtx.cur.env;
  const groups = env ? [...env.sorts.values()].filter((x) => x.kind === 'group').map((x) => x.id) : ['G'];
  for (const mm of s.canvas.machines) { const c2 = mm.config as { kind: string; group?: boolean; varId?: string }; if (c2.kind === 'tower' && c2.group && c2.varId && c2.varId !== cfg.varId) groups.push(c2.varId); }
  if (cfg.hom) for (const w of ['dom', 'cod'] as const) if (!groups.includes(cfg.hom[w])) out.push(`${cfg.label}: the "${w === 'dom' ? 'from' : 'to'}" chooser offers ${groups.join(', ')}, not ${cfg.hom[w]}`);
  if (cfg.carrier && cfg.carrier !== 'G') {
    const carriers = env ? [...env.sorts.values()].map((x) => x.id) : [];
    if (cfg.group || cfg.hom || cfg.sub || isZ) out.push(`${cfg.label}: a carrier on a ${cfg.group ? 'group' : cfg.hom ? 'Hom' : cfg.sub ? 'Subgroup' : 'ℤ'} Tower has no chooser`);
    else if (carriers.length < 2 || !carriers.includes(cfg.carrier)) out.push(`${cfg.label}: the "in" chooser offers ${carriers.join(', ') || 'nothing'}, not ${cfg.carrier}`);
  }
  const nm = readVarName(cfg.label);
  if (nm.k !== 'ok') out.push(`the name "${cfg.label}" does not read in the Tower's name slot`);
  else if (nm.label !== cfg.label) out.push(`the name slot turns "${cfg.label}" into "${nm.label}"`);
  const clash = towerVars(s).filter((v) => v.id !== cfg.varId && v.label === cfg.label);
  if (clash.length) out.push(`the name ${cfg.label} is taken by another Tower (the slot renames it)`);
  return out;
}

/** The room popover (hotbar.ts) and the room editor (roomedit.ts): kind, up to 3 assumptions, = / ≠ / ∈, term slots. */
function roomIssues(s: S, room: Room): ReachIssue[] {
  const out: ReachIssue[] = [];
  const add = (detail: string) => out.push({ machine: room.id, kind: 'room', area: 'room', detail });
  const subsOffered = subgroupsOf(s).map((g) => g.id);
  const as = room.assumes?.length ? room.assumes : [{ rel: room.rel === 'neq' ? 'neq' as const : 'eq' as const, l: room.l, r: room.r }];
  if (as.length > 3) add(`${as.length} assumptions; the popover takes at most 3`);
  if (room.kind !== 'assume' && room.assumes?.length) add(`a ${room.kind} room with listed assumptions: only Assume rooms take more than one or ∈`);
  as.forEach((a, i) => {
    const P = `P${i + 1}`;
    if (a.rel === 'mem') {
      if (room.kind !== 'assume') add(`${P}: ∈ only in Assume rooms`);
      if (!subsOffered.length) add(`${P}: ∈ is not offered (no level subgroup and no Subgroup Tower on the floor)`);
      else if (!subsOffered.includes(a.sub.id)) add(`${P}: the ∈ pills offer ${subsOffered.join(', ')}, not ${a.sub.id}`);
      const w = termTypeable(s, a.t); if (w) add(`${P} term: ${w}`);
    } else {
      const wl = termTypeable(s, a.l); if (wl) add(`${P} LHS: ${wl}`);
      const wr = termTypeable(s, a.r); if (wr) add(`${P} RHS: ${wr}`);
    }
  });
  return out;
}

/**
 * Every pointer-reachability issue on the floor of `s` (level, ctx, canvas, compiled). Call with the HUD's sort
 * context set for this floor (setSortCtx + parseExtra, as hud/index.ts › render does), or slots will not read maps.
 */
export function pointerIssues(s: S): ReachIssue[] { return pointerReport(s).issues; }

/** The issues, and notes that are not failures: values typeable only in the explicit form, not as the HUD prints them. */
export function pointerReport(s: S): { issues: ReachIssue[]; notes: string[] } {
  const issues: ReachIssue[] = [], notes: string[] = [];
  let where = '';
  noteSink = (text, reads) => notes.push(`${where}: the HUD prints the value as "${text}", which a slot reads back as ${reads}; only the explicit form (b^(n)) types it`);
  try {
    for (const m of s.canvas.machines) { where = `${m.id} (${m.kind})`; issues.push(...machineIssues(s, m)); }
    for (const r of s.canvas.rooms) { where = `${r.id} (room)`; issues.push(...roomIssues(s, r)); }
  } finally { noteSink = null; }
  return { issues, notes: [...new Set(notes)] };
}
