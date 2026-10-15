// COMMUTATOR v4 — the inspector lens, anchored to the selected machine (docked at the right edge when the
// floor cannot say where it is). Review 2026-10: a fixed 440px card; the machine's function (recipe demo,
// stacked equation, generalize line, Out) is centred and comes first; Out always renders so the height never
// jumps while items travel; braces / carets pick targets; term slots take terms; mirror pairs and insert-pair
// orientations are one recipe with a toggle. Every change goes through store.configure; the kernel decides.
import * as F from '../factory';
import * as K from '../kernel';
import type { Addr, Card, Fact, Family, GapAddr, MetaId, Pallet, Term } from '../kernel/types';
import type { Anchor, GapTarget, ItemValue, LibRef, Machine, MachineConfig, MachineResult, Param, SpanTarget, TheoremRecipe } from '../factory/types';
import { beads as beadsInline, rail } from './beads';
import { FAMILY, SUBGROUP } from '../ui/tokens';
import { glyphHTML } from '../ui/glyph';
import {
  atomsAll, camp, deskFact, dockAnswers, subgroupsOf, openView, esc, fH, h, huesAll, itemHTML, labelsAll, machineName, machineRect, nameHTML, richHTML, safe, spec, tH,
  towerLabelSet, towerVars, varIdsOf, varSortsOf, type S, type Store,
} from './util';
import { GROUP_ORDER, entryFor, libCard, libraryFor, recipeKey, type AnyRecipe, type LibEntry } from './library';
import { armPreset, isPinned, pin, presetKey, unpin, withRecipe } from './presets';
import { openConceptFor } from './concept';
import { braceEl, markVarBeads, stripEl } from './strip';
import { isMirrored, withOrientation, withSide } from './merge';
import { nameSlot, termSlot } from './slot';
import { roomAssumptionsEditor } from './roomedit';
import { mapsInScope } from '../factory/catalog';
import { sortCtx } from '../ui/sorts';
import { eulerBlobHTML } from '../ui/euler';

const pathKey = (p: number[]) => p.join('.');
/** Tower variables are solid "any" terms everywhere (violet for elements, teal for integers). */
let sortsNow: () => Map<string, 'G' | 'Z'> = () => new Map();
const markVars = <T extends HTMLElement>(el: T): T => markVarBeads(el, sortsNow());
const wordOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);
const isGapAddr = (a: Addr | GapAddr): a is GapAddr => 'gap' in a;
const slice = (fs: Term[], s: number, e: number): Term => (e - s === 1 ? fs[s]! : { k: 'mul', fs: fs.slice(s, e) });
/** Families whose ink is light: navy text on them (mode pills, pinned tags, glyph chips). */
const LIGHT: Family[] = ['identity', 'equation', 'given', 'contradiction'];
const VERB_KINDS = new Set(['rewriter', 'operator', 'joiner', 'theorem', 'carddock']);
/** The review's "Out as terms" setting (unset = on). */
export const outAsTerms = (s: S) => s.save.settings.outAsTerms !== false;

// ───────── pins (prefer the compiler's helpers; full-context fallback is unique by construction) ─────────
type Pinner = (p: Pallet, a: Addr | GapAddr) => SpanTarget | GapTarget | null;
function compilerPinner(gap: boolean): Pinner | null {
  const f = F as unknown as Record<string, unknown>;
  const fn = f[gap ? 'pinFromGap' : 'pinFromAddr'];
  return typeof fn === 'function' ? (fn as Pinner) : null;
}
function descend(r: Term, path: number[]): { t: Term; ancestors: Anchor[] } {
  const ancestors: Anchor[] = [];
  let t = r;
  for (const i of path) {
    if (t.k === 'mul') { ancestors.push({ k: 'factor', left: t.fs.slice(0, i), right: t.fs.slice(i + 1), leftEdge: true, rightEdge: true }); t = t.fs[i]!; }
    else if (t.k === 'inv') { ancestors.push({ k: 'inv' }); t = t.arg; }
  }
  return { t, ancestors };
}
function fallbackPin(p: Pallet, a: Addr | GapAddr): SpanTarget | GapTarget | null {
  if (p.k !== 'eq' && p.k !== 'neq') return null;
  const r = a.side === 'l' ? p.l : p.r;
  const { t, ancestors } = descend(r, a.path);
  const word = wordOf(t);
  if (isGapAddr(a)) return { k: 'pin', side: a.side, neighbours: { left: word.slice(0, a.gap), right: word.slice(a.gap), leftEdge: true, rightEdge: true }, ancestors, last: a };
  const [s, e] = a.range ?? [0, word.length];
  const selected = a.range ? slice(word, s, e) : t;
  return { k: 'pin', side: a.side, selected, neighbours: { left: a.range ? word.slice(0, s) : [], right: a.range ? word.slice(e) : [], leftEdge: true, rightEdge: true }, ancestors, last: a };
}
function pinFor(p: Pallet, a: Addr | GapAddr): SpanTarget | GapTarget | null {
  const c = compilerPinner(isGapAddr(a));
  if (c) { const r = safe(() => c(p, a), null); if (r) return r; }
  return fallbackPin(p, a);
}

// ───────── status: the compiler's verdict, one word in a fixed slot (no sub-labels: f88d8e58) ─────────
export function statusHeadline(s: S, id: string, res: MachineResult | undefined): { label: string; cls: string; title?: string } {
  const live = s.run?.live?.[id];
  const m = s.canvas.machines.find((x) => x.id === id);
  if (!res) return { label: 'compiling', cls: 'idle', title: 'No result from the compiler yet' };
  if (res.status.k === 'jammed') return { label: 'jammed', cls: 'jam' };
  if (live === 'sealed' || (m?.kind === 'socket' && s.run?.delivered?.[(m.config as { socketId?: string }).socketId ?? ''] !== undefined)) return { label: 'delivered', cls: 'sealed' };
  // the Dock waits for its item: that is its normal state, not a starved machine
  if (m?.kind === 'socket') return { label: 'will accept', cls: 'ok' };
  if (res.status.k === 'starved') return { label: 'starved', cls: 'starved' };
  return { label: 'working', cls: 'ok' };
}
/** Tower and Given Inlet take and make nothing on a belt the player runs: they show no status. */
const hasStatus = (m: Machine) => m.kind !== 'tower' && m.kind !== 'given';

export interface LensApi { render: (s: S) => void; position: () => void; el: HTMLElement }

export function mountLens(layer: HTMLElement, store: Store, opts: { dockTop: () => number; keepClear?: () => HTMLElement[] }): LensApi {
  sortsNow = () => varSortsOf(store.get());
  const el = h('section', { class: 'h3-lens', hidden: true, 'aria-label': 'Machine inspector' });
  const notch = h('span', { class: 'h3-lens-notch', 'aria-hidden': 'true' });
  layer.append(el);

  let curId: string | null = null;
  let lastKey = '';
  let lastLive = '';
  let lastOT: boolean | null = null;
  const statusEl = () => el.querySelector<HTMLElement>('.h3-status');

  const render = (s: S) => {
    const id = s.ui.screen === 'floor' ? s.ui.lens : null;
    const m = id ? s.canvas.machines.find((x) => x.id === id) : undefined;
    if (!id || !m) { if (!el.hidden) { el.hidden = true; curId = null; lastKey = ''; } return; }
    const res = s.compiled?.machines?.[id];
    const key = `${id}|${s.level.id}`;
    const ot = outAsTerms(s);
    const store2 = el as unknown as { _c?: unknown; _v?: unknown };
    const structural = key !== lastKey || store2._c !== s.compiled || store2._v !== s.canvas || ot !== lastOT;
    if (structural) {
      // keep a focused slot alive while its own machine re-renders for an unrelated reason
      const focused = el.contains(document.activeElement) && (document.activeElement as HTMLElement).matches('input');
      if (focused && key === lastKey && store2._v === s.canvas && ot === lastOT) { /* only compiled moved */ }
      else {
        const slotKey = focused ? (document.activeElement as HTMLElement).closest<HTMLElement>('[data-slot]')?.dataset.slot : undefined;
        build(s, m, res);
        store2._c = s.compiled; store2._v = s.canvas; lastOT = ot;
        if (slotKey && key === lastKey) {
          const inp = el.querySelector<HTMLInputElement>(`[data-slot="${CSS.escape(slotKey)}"] input`);
          if (inp) queueMicrotask(() => inp.focus({ preventScroll: true }));
        }
      }
      const wasHidden = el.hidden;
      el.hidden = false;
      if (wasHidden || key !== lastKey) el.classList.remove('settled');
      lastKey = key; curId = id;
      position();
    }
    // the floor's "Ready to save" badge asks for the name field (ui.lensFocus = 'save')
    if (s.ui.lensFocus === 'save') {
      const f = el.querySelector<HTMLInputElement>('.h3-lname');
      queueMicrotask(() => { if (f) { f.focus({ preventScroll: true }); f.select(); } store.setUI({ lensFocus: null }); });
    }
    const live = s.run?.live?.[id] ?? '';
    if (live !== lastLive || structural) { lastLive = live; paintStatus(s, m, res); }
  };

  const paintStatus = (s: S, m: Machine, res: MachineResult | undefined) => {
    const st = statusEl();
    if (!st) return;
    const v = statusHeadline(s, m.id, res);
    st.className = `h3-status ${v.cls}`;
    st.title = v.title ?? v.label;
    st.innerHTML = `<i class="h3-pip"></i>${esc(v.label)}`;
  };

  // ───────── build ─────────
  /** Machines whose recipe picker is open even though a recipe is set ("change"). */
  const pickerOpen = new Set<string>();
  const recipeOf = (m: Machine): AnyRecipe | null => {
    const c = m.config as { kind: string; recipe?: AnyRecipe | null; ref?: LibRef | null };
    if (c.kind === 'carddock') return c.ref ? { k: 'ref', ref: c.ref } : null;
    return c.recipe ?? null;
  };
  const famOf = (m: Machine): Family => {
    const r = recipeOf(m) as { k: string; ref?: LibRef } | null;
    if (m.kind === 'theorem' || m.kind === 'forall' || m.kind === 'carddock') return 'lemma';
    if (m.kind === 'tower') return 'scope';
    if (m.kind === 'rewriter' && r) {
      if (r.k === 'cancel' || r.k === 'insertPair') return 'inverse';
      if (r.k === 'pop' || r.k === 'insertE') return 'identity';
      if (r.k === 'routed') return 'equation';
      if (r.ref?.k === 'given') return 'given';
      return 'lemma';
    }
    if (m.kind === 'joiner' && r?.k === 'clash') return 'contradiction';
    return spec(m.kind).family;
  };

  const build = (s: S, m: Machine, res: MachineResult | undefined) => {
    const sp = spec(m.kind);
    const L = labelsAll(s);
    const H = huesAll(s);
    const fam = famOf(m);
    el.innerHTML = '';
    el.style.setProperty('--ink', FAMILY[fam].ink);
    el.style.setProperty('--ink-text', FAMILY[fam].text);
    el.style.setProperty('--on-ink', LIGHT.includes(fam) ? 'var(--navy)' : '#fff');
    el.style.setProperty('--ink-edge', fam === 'identity' ? FAMILY[fam].text : FAMILY[fam].ink);
    el.dataset.kind = m.kind;
    el.dataset.family = fam;
    const cfg = m.config;
    const recipe = recipeOf(m);
    const isVerb = VERB_KINDS.has(m.kind);
    const picking = isVerb && (!recipe || pickerOpen.has(m.id));
    const entry = entryFor(s, m.kind === 'carddock' ? 'carddock' : m.kind, recipe);

    // head: glyph · name (sub) · status · ? ⌫ ↻ × (delete never next to close: 7a1c0746)
    const close = h('button', { class: 'h3-x', title: 'Close (Esc)', 'aria-label': 'Close inspector' }, '×');
    close.addEventListener('click', () => store.openLens(null));
    const help = h('button', { class: 'h3-icon h3-help', title: 'Explain this machine (concept cards)', 'aria-label': 'Explain' }, '?');
    help.addEventListener('click', () => openConceptFor(store, m.kind));
    const tcfg0 = cfg.kind === 'tower' ? cfg : null;
    const given0 = cfg.kind === 'given' ? s.level.givens.find((g) => g.id === cfg.givenId) : undefined;
    const tsub = tcfg0 ? (tcfg0 as { sub?: 'sub' | 'normal' }).sub : undefined;
    const tstr = tcfg0 as { group?: boolean; hom?: { dom: string; cod: string } } | null;
    const sub = tcfg0 ? (tstr?.group ? 'an arbitrary group' : tstr?.hom ? 'an arbitrary homomorphism' : tsub ? (tsub === 'normal' ? 'an arbitrary normal subgroup' : 'an arbitrary subgroup') : tcfg0.sort === 'Z' ? 'an arbitrary integer, for exponents' : 'an arbitrary element')
      : isVerb ? (picking ? sp.blurb : '') : sp.blurb;
    const title = tcfg0 ? machineName(m) : given0 ? given0.name : sp.name;
    const varHTML = (l: string) => { const mm = /^(.*?)([₀-₉]*)$/.exec(l)!; return `<i>${esc(mm[1]!)}</i>${mm[2] ? `<sub>${[...mm[2]].map((c) => c.charCodeAt(0) - 0x2080).join('')}</sub>` : ''}`; };
    const glyph = tcfg0 ? `<span class="h3-tglyph">${tcfg0.label ? varHTML(tcfg0.label) : ''}${tstr?.group ? '' : tstr?.hom ? ':' : tsub ? (tsub === 'normal' ? '⊴<i>G</i>' : '≤<i>G</i>') : tcfg0.sort === 'Z' ? '∈ℤ' : '∈<i>G</i>'}</span>` : glyphHTML(sp.glyph);
    const head = h('header', { class: 'h3-lens-head' },
      h('span', { class: `h3-glyph ${tsub ? 'fam-subg' : `fam-${fam}`}${fam === 'lemma' && !tsub ? ' earned' : ''}`, style: `--ink:${tsub ? SUBGROUP.ink : FAMILY[fam].ink}`, html: glyph }),
      h('span', { class: 'h3-lens-title' }, h('b', { html: given0 ? nameHTML(title) : esc(title) }), sub ? h('span', { class: 'h3-lens-sub' }, sub) : null),
      hasStatus(m) ? h('span', { class: 'h3-status' }) : null, help);
    if (!m.locked) {
      const del = h('button', { class: 'h3-icon', title: 'Remove (Delete)', 'aria-label': 'Remove machine' }, '⌫');
      del.addEventListener('click', () => { store.remove([m.id]); store.openLens(null); });
      const rot = h('button', { class: 'h3-icon', title: 'Rotate (R)', 'aria-label': 'Rotate' }, '↻');
      rot.addEventListener('click', () => store.rotate(m.id));
      head.append(del, rot);
    } else head.append(h('span', { class: 'h3-locked', title: 'Placed by the work order' }, 'fixed'));
    head.append(close);
    el.append(head);

    const body = h('div', { class: 'h3-lens-body' });
    el.append(body);
    const setCfg = (patch: Partial<MachineConfig>) => { store.configure(m.id, { ...cfg, ...patch } as MachineConfig); };
    const inputs = res?.inputs ?? {};

    // ── machines without a workpiece of their own
    if (cfg.kind === 'socket') { body.append(socketView(s, cfg.socketId, inputs['q'] ?? Object.values(inputs).find(Boolean), res, L, H)); return finish(s, m, res, body, L, H, false); }
    if (cfg.kind === 'given') { body.append(givenView(s, cfg.givenId, L, H)); return finish(s, m, res, body, L, H, false); }
    if (cfg.kind === 'tower') { body.append(towerView(s, m, cfg, setCfg)); return finish(s, m, res, body, L, H, false); }

    // ── the recipe: chosen inside the machine, from the library (rules, never results)
    if (isVerb) {
      if (picking) body.append(recipePicker(s, m, (r) => { pickerOpen.delete(m.id); store.configure(m.id, withRecipe(cfg, r)); }, !!recipe));
      else if (recipe) body.append(recipeSection(s, m, recipe, entry));
    }

    // ── the incoming workpiece: rewriter/operator 'q', theorem 'p0', ∀ its input; joiner shows both
    const workPort = m.kind === 'theorem' ? 'p0' : 'q';
    const work = inputs[workPort] ?? (m.kind === 'forall' ? Object.values(inputs).find(Boolean) : undefined);
    const workFact = work && work.k === 'fact' && (work.fact.k === 'eq' || work.fact.k === 'neq') ? work.fact : null;
    const workMem = work && work.k === 'fact' && work.fact.k === 'mem' ? work.fact : null;
    const targeting = m.kind === 'rewriter' && !!recipe;
    if (m.kind === 'joiner') {
      const sec = h('div', { class: 'h3-sec h3-others' });
      for (const p of ['a', 'b']) { const v = inputs[p]; if (v) sec.append(h('div', { class: 'h3-inrow' }, h('span', { class: 'h3-portname' }, p === 'a' ? 'first' : 'second'), h('span', { class: 'h3-inval' }, itemShow(s, v, L, H, 'small')))); }
      if (sec.childElementCount) body.append(sec);
    } else if ((workFact || workMem) && m.kind !== 'forall') {
      const sec = h('div', { class: 'h3-sec h3-work' });
      const rk = (recipe as { k?: string } | null)?.k;
      const gapMode = rk === 'insertE' || rk === 'insertPair' || !!res?.candidates?.some((c) => isGapAddr(c.addr));
      const tw = workFact ? twin(workFact, L, H, gapMode && targeting) : memTwin(workMem!, L, H, gapMode && targeting);
      const isThm = m.kind === 'theorem';
      const tcfg = cfg as { target?: SpanTarget; gap?: GapTarget; choice?: number };
      const cur: SpanTarget | GapTarget = gapMode ? (tcfg.gap ?? { k: 'first' }) : (tcfg.target ?? { k: 'first' });
      const applyPin = (t: SpanTarget | GapTarget) => setCfg((gapMode ? { gap: t } : { target: t }) as Partial<MachineConfig>);
      const nch = res?.choices?.length ?? 0;
      const nPrem = isThm ? Object.keys(inputs).filter((p) => /^p\d+$/.test(p)).length : 0;
      sec.append(h('div', { class: 'h3-label' }, h('span', {}, isThm ? (nPrem > 1 ? 'Premise 1' : 'Premise') : 'In'),
        targeting ? targetChip(cur, res, applyPin) : isThm && nch > 1 ? h('span', { class: 'h3-tchip' }, h('span', { class: 'h3-dim' }, 'pick a cut')) : null), tw.el);
      body.append(sec);
      if (targeting && res?.candidates?.length) requestAnimationFrame(() => drawTargets(tw, res, (workFact ?? workMem) as Pallet, applyPin, cur));
      // literal power: show the opened stack — the r copies it writes out — on its own "after" rails
      const rref = (recipe as { k?: string; ref?: LibRef } | null)?.ref;
      const litR = rref?.k === 'schema' && rref.id.startsWith('power.literal:') ? Number(rref.id.split(':')[1]) : 0;
      const outF = res?.out && res.out.k === 'fact' && (res.out.fact.k === 'eq' || res.out.fact.k === 'neq') ? res.out.fact : null;
      if (litR && outF && workFact) {
        const after = twin(outF, L, H, false);
        body.append(h('div', { class: 'h3-sec h3-after' }, h('div', { class: 'h3-label' }, h('span', {}, 'After'), h('span', { class: 'h3-tchip' }, h('span', { class: 'h3-dim' }, `the stack opens into ${litR} copies`))), after.el));
        const addr = res?.candidates?.[res.chosen ?? 0]?.addr;
        if (addr && !isGapAddr(addr)) requestAnimationFrame(() => {
          const t = safe(() => K.termAt(workFact, addr), null);
          const bl = t && t.k === 'pow' ? wordOf(t.base).length : 1;
          const span: Addr = addr.range ? { side: addr.side, path: addr.path, range: [addr.range[0], addr.range[0] + litR * bl] } : { side: addr.side, path: addr.path };
          factorsFor(after, span).forEach((f) => f.classList.add('h3-flash'));
        });
      }
      if (isThm && nch && workFact) {
        const preview = h('div', { class: 'h3-preview math' });
        sec.append(preview);
        const chosen = tcfg.choice ?? 0;
        requestAnimationFrame(() => drawHandles(tw, res!, workFact, chosen, (i) => setCfg({ choice: i } as Partial<MachineConfig>), (i) => {
          if (i === null || i === chosen) { preview.innerHTML = ''; return; }
          const c = conclusionOf(s, m, res!, workFact, i, L);
          preview.innerHTML = c ? `<span class="h3-cuthere">cut here:</span><span class="math">${c}</span>` : '';
        }));
      }
    } else if (work && m.kind !== 'forall') {
      body.append(h('div', { class: 'h3-sec h3-work' }, h('div', { class: 'h3-label' }, m.kind === 'theorem' ? 'Premise' : 'In'), itemView(work, L, H)));
    }

    // ── other routed inputs (rule/card ports, parameters)
    // every further premise of a Theorem looks exactly like the first: its own section, same label, same rails
    if (m.kind === 'theorem') {
      for (const [p, v] of Object.entries(inputs)) {
        if (p === workPort || !/^p\d+$/.test(p) || !v || v.k !== 'fact') continue;
        const f = v.fact;
        const view = f.k === 'eq' || f.k === 'neq' ? twin(f, L, H, false).el : f.k === 'mem' ? memTwin(f, L, H, false).el : itemView(v, L, H);
        body.append(h('div', { class: 'h3-sec h3-work' }, h('div', { class: 'h3-label' }, h('span', {}, `Premise ${Number(p.slice(1)) + 1}`)), view));
      }
    }
    if (m.kind !== 'joiner' && m.kind !== 'forall') {
      const others = Object.entries(inputs).filter(([p]) => p !== workPort && !(m.kind === 'theorem' && /^p\d+$/.test(p) && inputs[p]?.k === 'fact'));
      if (others.length) {
        const sec = h('div', { class: 'h3-sec h3-others' });
        for (const [p, v] of others) if (v) sec.append(h('div', { class: 'h3-inrow' }, h('span', { class: 'h3-portname' }, portLabel(p)), h('span', { class: 'h3-inval' }, itemShow(s, v, L, H, 'small'))));
        if (sec.childElementCount) body.append(sec);
      }
    }

    if (m.kind === 'forall' || m.kind === 'gate') body.append(generalizeView(s, m, res, work, L, H));
    // ── controls
    const ctl = controls(s, m, res, setCfg, L, H, workFact);
    if (ctl) body.append(ctl);
    const makesOut = m.kind === 'spool' || m.kind === 'hopper' || m.kind === 'desk' || (isVerb && !!recipe);
    finish(s, m, res, body, L, H, makesOut);
  };

  /** Out (always, — while empty: the height never jumps between items), then the reason with its "?". */
  const finish = (s: S, m: Machine, res: MachineResult | undefined, body: HTMLElement, L: Record<string, string>, H: Record<string, number>, makesOut: boolean) => {
    if (makesOut) {
      const o = res?.out;
      body.append(h('div', { class: 'h3-sec h3-out' }, h('div', { class: 'h3-label' }, 'Out'),
        h('div', { class: 'h3-outbox' }, o ? itemShow(s, o, L, H, 'out') : h('span', { class: 'h3-none' }, '—'))));
    }
    const stat = res?.status;
    // the picker already asks for a recipe: never say it twice; an empty reason is no box at all
    const asking = (!!el.querySelector('.h3-picker') || m.kind === 'socket') && stat?.k === 'starved';
    const said = el.querySelector('.h3-reason')?.textContent ?? '';
    if (stat && stat.k !== 'ok' && !asking && stat.reason?.trim() && !said.includes(stat.reason.trim())) {
      const p = h('p', { class: `h3-reason ${stat.k}`, html: richHTML(stat.reason, s.level) });
      const q = h('button', { class: 'h3-qlink', title: 'Open the concept card that explains this' }, '?');
      q.addEventListener('click', () => openConceptFor(store, m.kind, stat.reason));
      p.append(' ', q);
      body.append(p);
    }
    el.append(notch);
  };

  // ───────── items: as terms (the "Out as terms" setting) or as typeset text ─────────
  /** A fact / card / term drawn as terms: wraps and centres. Falls back to text for what terms cannot show. */
  const itemTerms = (s: S, v: ItemValue, L: Record<string, string>, H: Record<string, number>): HTMLElement | null => {
    const vars = varSortsOf(s);
    const strip = (l: Term, rel: '=' | '≠' | undefined, r: Term | undefined) => stripEl(r ? { l, rel: rel ?? '=', r } : { l }, L, H, { vars });
    const fact = (f: Fact): HTMLElement[] | null => {
      if (f.k === 'eq' || f.k === 'neq') return [strip(f.l, f.k === 'eq' ? '=' : '≠', f.r)];
      if (f.k === 'law') return [strip(f.l, '=', f.r)];
      if (f.k === 'bot') return [h('span', { class: 'h3-bot math' }, '⊥')];
      // Book phase B: t ∈ H — the term, ∈, the subgroup drawn as a set
      if (f.k === 'mem') return [strip(f.t, undefined, undefined), memEnd(f.sub, L, 15)];
      if (f.k === 'cond') {
        const ps = f.premises.map((p) => fact(p));
        const c = fact(f.concl);
        if (ps.some((p) => !p) || !c) return null;
        const out: HTMLElement[] = [];
        ps.forEach((p, i) => { if (i) out.push(h('span', { class: 'h3-strip-rel math' }, ',')); out.push(...p!); });
        if (ps.length) out.push(h('span', { class: 'h3-strip-rel math h3-implies' }, '⟹'));
        out.push(...c);
        return out;
      }
      return null;
    };
    const wrap = h('span', { class: 'h3-terms' });
    if (v.k === 'term') { wrap.append(markVars(beadsInline(v.term, L, H))); return wrap; }
    const f = v.k === 'fact' ? v.fact : v.card;
    const parts = fact(f);
    if (!parts) return null;
    const metas = (f as { metas?: string[] }).metas ?? [];
    if (metas.length) wrap.append(h('span', { class: 'h3-strip-q math', html: `∀${metas.map((x) => `<i class="m-atom any g">${esc(x)}</i>`).join(', ')}.` }));
    wrap.append(...parts);
    wrap.querySelectorAll<HTMLElement>('.bn-meta').forEach((x) => x.classList.add('h3-varbead', 'g'));
    return wrap;
  };
  /** Out / Expected / Generalize: terms when the setting is on, else typeset text. */
  const itemShow = (s: S, v: ItemValue, L: Record<string, string>, H: Record<string, number>, size: 'out' | 'small'): HTMLElement => {
    if (outAsTerms(s)) { const t = itemTerms(s, v, L, H); if (t) { t.classList.add(size); return t; } }
    return h('span', { class: `math h3-itemtext ${size}`, html: itemHTML(v, L) });
  };

  // ───────── recipe picker: the library, grouped, searchable; demos, never origin notes ─────────
  const NAME_W: Partial<Record<string, string>> = { joiner: '62px', operator: '118px' };
  const recipePicker = (s: S, m: Machine, pick: (r: AnyRecipe) => void, canCancel: boolean) => {
    const kind = m.kind === 'carddock' ? 'carddock' : m.kind;
    const all = libraryFor(s, kind);
    const wrap = h('div', { class: 'h3-sec h3-picker' });
    const search = h('input', { class: 'h3-search h3-psearch', placeholder: kind === 'operator' || kind === 'joiner' ? 'Filter operations' : 'Search recipes by name', 'aria-label': 'Search recipes', autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'h3-plist', role: 'listbox', style: `--namew:${NAME_W[kind] ?? '104px'}` });
    const top = h('div', { class: 'h3-label' }, h('span', {}, 'Choose a recipe'));
    if (canCancel) {
      const back = h('button', { class: 'h3-mode', title: 'Keep the current recipe' }, 'keep current');
      back.addEventListener('click', () => { pickerOpen.delete(m.id); lastKey = ''; render(store.get()); });
      top.append(back);
    }
    wrap.append(top, all.length > 6 ? search : '', list);
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = '';
      const shown = all.filter((e) => !q || `${e.name} ${e.group} ${e.note ?? ''}`.toLowerCase().includes(q) || h('i', { html: e.stmt }).textContent!.toLowerCase().includes(q));
      for (const g of GROUP_ORDER) {
        const items = shown.filter((e) => e.group === g);
        if (!items.length) continue;
        list.append(h('div', { class: 'h3-group' }, g));
        for (const e of items) {
          const row = h('button', { class: 'h3-prow', role: 'option', 'data-key': e.key, title: e.stmt ? h('i', { html: e.stmt }).textContent ?? '' : '' },
            h('span', { class: 'h3-prow-name', html: e.nameHTML }),
            e.demo ? h('span', { class: 'h3-prow-demo' }, safe(() => e.demo!(), h('span', {}))) : e.stmt ? h('span', { class: 'h3-prow-stmt math', html: e.stmt }) : null,
            e.note ? h('span', { class: 'h3-prow-note' }, e.note) : null);
          row.addEventListener('click', () => pick(e.recipe));
          list.append(row);
        }
      }
      if (!list.childElementCount) list.append(h('p', { class: 'h3-note' }, all.length ? 'No match. Try a shorter word.' : 'Nothing fits yet. Route a theorem into the card port.'));
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); list.querySelector<HTMLButtonElement>('.h3-prow')?.click(); }
      if (e.key === 'Escape') { e.preventDefault(); search.blur(); if (canCancel) { pickerOpen.delete(m.id); lastKey = ''; render(store.get()); } else store.openLens(null); }
    });
    draw();
    return wrap;
  };

  /** The chosen recipe: name, pin, change; its demo centred; the side / orientation toggle of a merged row. */
  const recipeSection = (s: S, m: Machine, recipe: AnyRecipe, entry: LibEntry | undefined) => {
    const key = presetKey(m.kind, recipe);
    const pinnedNow = isPinned(key);
    const change = h('button', { class: 'h3-mode', title: 'Choose another recipe' }, 'change');
    change.addEventListener('click', () => { pickerOpen.add(m.id); lastKey = ''; render(store.get()); });
    const r = recipe as { k: string; ref?: LibRef; inv?: boolean };
    const mirror = isMirrored(r);
    const sides = entry?.sides;
    const name = sides?.k === 'mirror' ? esc(mirror ? sides.op.name : sides.plain.name) : entry?.nameHTML ?? esc(recipeKey(recipe));
    const star = h('button', { class: `h3-tag h3-pin${pinnedNow ? ' on' : ''}`, title: pinnedNow ? 'Unpin from the hotbar' : 'Pin this machine and recipe to the hotbar' }, pinnedNow ? '★ pinned' : '☆ pin');
    star.addEventListener('click', () => {
      if (isPinned(key)) unpin(key); else pin({ key, kind: m.kind, recipe, label: h('i', { html: name }).textContent ?? 'recipe' });
      lastKey = ''; store.setUI({});
    });
    const alt = sides?.k === 'mirror' ? mirror : sides?.k === 'orient' ? !!r.inv : false;
    const demo = entry?.demoFor ? safe(() => entry.demoFor!(alt), null) : entry?.demo ? safe(() => entry.demo!(), null) : null;
    const sec = h('div', { class: 'h3-sec h3-recipe' },
      h('div', { class: 'h3-recipe-head' }, h('span', { class: 'h3-label' }, 'Recipe'), h('span', { class: 'h3-recipe-name', html: name }), h('span', { class: 'h3-flex' }), star, change),
      demo ? h('div', { class: 'h3-recipe-demo' }, demo) : entry?.stmt ? h('div', { class: 'h3-recipe-demo math', html: entry.stmt }) : null);
    // merged recipes: the toggle sets only what already existed (insertPair.inv / LibRef.mirror)
    if (sides) {
      const opts: [boolean, string, string][] = sides.k === 'orient'
        ? [[true, '<i>x</i><sup class="m-sup">−1</sup><i>x</i>', 'x⁻¹x'], [false, '<i>x</i><i>x</i><sup class="m-sup">−1</sup>', 'xx⁻¹']]
        : [[false, sides.plain.label, sides.plain.name], [true, sides.op.label, sides.op.name]];
      const g = h('span', { class: 'h3-segs h3-sidetoggle', role: 'group', 'aria-label': sides.k === 'orient' ? 'Orientation of the inserted pair' : 'Which side the theorem works on' });
      for (const [v, html, tip] of opts) {
        const b = h('button', { class: `h3-seg math${v === alt ? ' on' : ''}`, 'aria-pressed': String(v === alt), title: tip, 'data-side': v ? 'alt' : 'main', html });
        b.addEventListener('click', () => {
          if (v === alt) return;
          if (sides.k === 'orient' && r.k === 'insertPair') store.configure(m.id, withRecipe(m.config, withOrientation(r as never, v)));
          else store.configure(m.id, withRecipe(m.config, withSide(r as never, v)));
        });
        g.append(b);
      }
      sec.append(h('div', { class: 'h3-recipe-toggle' }, g));
    }
    // say it once: the first time, the longer note; after that, the short one
    if (r.k === 'routed' && !safe(() => localStorage.getItem('commutator/seen-routed'), null)) {
      sec.append(h('p', { class: 'h3-note h3-first' }, m.kind === 'theorem' ? 'Theorems made here travel by belt. Route one into the card port.' : 'Equations made here travel by belt. Route one into the rule port.'));
      safe(() => localStorage.setItem('commutator/seen-routed', '1'), undefined);
    } else if (entry?.note) sec.append(h('div', { class: 'h3-recipe-note' }, entry.note));
    // Books phases B–C, reuse: which subgroup / homomorphism / action plays each parameter of the card (H in
    // "∀H ≤ G …", f in "∀f : G → K …"). Subgroups are drawn as their Euler sets, maps by name and signature.
    const plays = s.compiled?.machines?.[m.id]?.structs ?? [];
    const subIds = new Set(subgroupsOf(s).map((x) => x.id));
    const maps = safe(() => mapsInScope(s.ctx, s.canvas as never), []);
    const L = labelsAll(s);
    const sig = (id: string) => { const mp = maps.find((x) => x.id === id); return mp ? ` : ${mp.args.map((a) => esc(L[a] ?? a)).join(' × ')} → ${esc(L[mp.res] ?? mp.res)}` : ''; };
    for (const st of plays) {
      const isSub = st.options.length ? st.options.every((o) => subIds.has(o.id)) : /^\$?\d*:?[HKNL]/.test(st.binder);
      const bname = esc(st.binder.replace(/^\$\d+:/, ''));
      // NORMS: plain words, normal case — "H is" this subgroup or that one; "f is" this homomorphism or that one
      const row = h('div', { class: 'h3-plays' }, h('span', { class: 'h3-plays-k math', html: `<i class="${isSub ? 'm-subg' : ''}">${bname}</i> <span class="h3-plays-w">is</span>` }));
      if (!st.options.length) row.append(h('span', { class: 'h3-dim' }, isSub ? (st.normal ? 'no normal subgroup here' : 'no subgroup here') : 'no homomorphism here with the right groups'));
      for (const o of st.options) {
        const on = st.chosen === o.id;
        const b = isSub
          ? h('button', { class: `h3-subchip${on ? ' on' : ''}`, 'aria-pressed': String(on), title: `${o.label} plays ${bname}`, html: eulerBlobHTML(o.label, 15, { normal: st.normal }) })
          : h('button', { class: `h3-mapchip math${on ? ' on' : ''}`, 'aria-pressed': String(on), title: `${o.label} plays ${bname}`, html: `<i>${esc(o.label)}</i>${sig(o.id)}` });
        b.addEventListener('click', () => {
          const c = m.config as MachineConfig & { structs?: Record<string, string> };
          if (c.kind === 'theorem') store.configure(m.id, { ...c, structs: { ...(c.structs ?? {}), [st.binder]: o.id } } as MachineConfig);
          else if (c.kind === 'rewriter' && c.recipe?.k === 'law' && c.recipe.ref.k === 'schema') {
            const ref = c.recipe.ref;
            store.configure(m.id, { ...c, recipe: { k: 'law', ref: { ...ref, structs: { ...(ref.structs ?? {}), [st.binder]: o.id } } } } as MachineConfig);
          }
        });
        row.append(b);
      }
      sec.append(row);
    }
    // a refusal says why, in words (e.g. "f₁ goes from G₁ to H₁; this card needs a map from a group to itself")
    const stt = s.compiled?.machines?.[m.id]?.status;
    if (plays.length && stt && stt.k !== 'ok' && /group|hom|plays|subgroup/i.test(stt.reason)) sec.append(h('p', { class: 'h3-reason jammed', html: richHTML(stt.reason, s.level) }));
    return sec;
  };

  // ───────── given: start a belt vs cite in a machine ─────────
  const givenView = (s: S, givenId: string, L: Record<string, string>, H: Record<string, number>) => {
    const g = s.level.givens.find((x) => x.id === givenId);
    const sec = h('div', { class: 'h3-sec h3-givenview' }, h('div', { class: 'h3-label' }, 'Given here'));
    if (!g) return sec;
    if (g.fact.k === 'eq' || g.fact.k === 'neq') sec.append(twin(g.fact, L, H, false).el);
    else sec.append(h('div', { class: 'h3-bigmath math', html: fH(g.fact, L) }));
    const two = h('div', { class: 'h3-twoways' });
    const canStart = g.fact.k === 'eq' || g.fact.k === 'neq' || g.fact.k === 'size';
    if (canStart) two.append(h('div', { class: 'h3-way' }, h('b', {}, 'Start a belt'), h('span', {}, 'Drag from its output.')));
    const citeKind = g.fact.k === 'cond' ? 'theorem' : g.fact.k === 'eq' || g.fact.k === 'law' ? 'rewriter' : null;
    if (citeKind) {
      const b = h('button', { class: 'lw-key small' }, citeKind === 'theorem' ? 'Cite in a Theorem' : 'Cite in a Rewriter');
      const recipe: AnyRecipe = citeKind === 'theorem' ? { k: 'library', ref: { k: 'given', givenId } } : { k: 'law', ref: { k: 'given', givenId } };
      b.addEventListener('click', () => { store.openLens(null); armPreset(store, { key: presetKey(citeKind, recipe), kind: citeKind, recipe, label: g.name }); });
      two.append(h('div', { class: 'h3-way' }, h('b', {}, 'Or cite it'), h('span', {}, 'No belt needed. It stays a dependency.'), b));
    }
    sec.append(two);
    return sec;
  };

  // ───────── Tower: its name is a slot drawn as the variable itself; sort; where it is used ─────────
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const subOf = (n: number) => String(n).split('').map((d) => SUB[+d]).join('');
  const towerView = (s: S, m: Machine, cfg: { kind: 'tower'; varId: string; label: string; sort: 'G' | 'Z' }, setCfg: (p: Partial<MachineConfig>) => void) => {
    const sec = h('div', { class: 'h3-sec h3-tower' });
    const others = towerVars(s).filter((v) => v.id !== cfg.varId).map((v) => v.label);
    const unique = (raw: string, sortNow: 'G' | 'Z' = cfg.sort) => {
      const typed = raw.trim().replace(/_(\d+)/g, (_x, d: string) => subOf(+d));
      const base = typed.replace(/[₀-₉]+$/, '') || (sortNow === 'Z' ? 'n' : 'x');
      if (!others.includes(typed)) return typed || base;
      for (let i = 1; i < 100; i++) if (!others.includes(base + subOf(i))) return base + subOf(i);
      return base;
    };
    const isZ = cfg.sort === 'Z';
    const hue = huesAll(s)[cfg.varId] ?? 2;
    const ns = nameSlot({ label: cfg.label, varId: cfg.varId, sort: cfg.sort, sub: (cfg as { sub?: 'sub' | 'normal' }).sub, hue, key: `${m.id}:name`, commit: (l) => { const v = unique(l); if (v !== cfg.label) setCfg({ label: v } as Partial<MachineConfig>); } });
    const sortG = h('button', { class: `h3-seg math${!isZ ? ' on' : ''}`, 'aria-pressed': String(!isZ), title: 'an arbitrary group element', html: '∈ <i>G</i>' });
    const sortZ = h('button', { class: `h3-seg math${isZ ? ' on' : ''}`, 'aria-pressed': String(isZ), title: 'an arbitrary integer, used in exponents', html: '∈ ℤ' });
    const setSort = (sort: 'G' | 'Z') => {
      if (sort === cfg.sort) return;
      const base = cfg.label.replace(/[₀-₉]+$/, '');
      const keep = base && base !== 'x' && base !== 'n'; // a name the player chose survives the change of sort
      setCfg({ sort, sub: undefined, label: unique(keep ? base : sort === 'Z' ? 'n' : 'x', sort) } as Partial<MachineConfig>);
    };
    sortG.addEventListener('click', () => setSort('G'));
    sortZ.addEventListener('click', () => setSort('Z'));
    // Book phase B: a Subgroup Tower declares H₁ ≤ G (any subgroup) or N₁ ⊴ G (any normal subgroup)
    const sub = (cfg as { sub?: 'sub' | 'normal' }).sub;
    // ℤ Towers exist once integer exponents do (the Book: chapter 10 on); NORMS: define a symbol where it first appears (#19)
    const zOk = isZ || s.level.campaign !== 'book' || s.level.chapter >= 10;
    const subOk = !!sub || (s.level.campaign === 'book' && (s.level.subgroups !== undefined || s.level.chapter >= 12));
    const sortH = h('button', { class: `h3-seg math${sub === 'sub' ? ' on' : ''}`, 'aria-pressed': String(sub === 'sub'), title: 'an arbitrary subgroup of G', html: '≤ <i>G</i>' });
    const sortN = h('button', { class: `h3-seg math${sub === 'normal' ? ' on' : ''}`, 'aria-pressed': String(sub === 'normal'), title: 'an arbitrary normal subgroup of G', html: '⊴ <i>G</i>' });
    const setSub = (k: 'sub' | 'normal' | undefined) => {
      if (k === sub) return;
      const base = k ? (k === 'normal' ? 'N' : 'H') : 'x';
      setCfg({ sub: k, sort: 'G', label: unique(base, 'G') } as Partial<MachineConfig>);
    };
    sortH.addEventListener('click', () => setSub('sub'));
    // Book phase C: structures as Towers — a group G₁ ("let G₁ be any group"), a homomorphism f₁ : G₁ → H₁ ("let f₁ be
    // any homomorphism"), and an element Tower's carrier (x₁ in G, in K, or in a set Ω) in a many-sorted level
    const tc = cfg as { group?: boolean; hom?: { dom: string; cod: string }; carrier?: string };
    const grpT = !!tc.group, homT = tc.hom;
    const L0 = labelsAll(s);
    const many = !!(s.level.sorts?.length || s.level.maps?.length) || (s.level.campaign === 'book' && s.level.chapter >= 9);
    const groupsInScope = (): { id: string; label: string }[] => {
      const env = sortCtx.cur.env;
      const out = env ? [...env.sorts.values()].filter((x) => x.kind === 'group').map((x) => ({ id: x.id, label: x.label })) : [{ id: 'G', label: 'G' }];
      for (const mm of s.canvas.machines) { const c = mm.config as { kind: string; group?: boolean; varId?: string; label?: string }; if (c.kind === 'tower' && c.group && c.varId && c.varId !== cfg.varId && !out.some((x) => x.id === c.varId)) out.push({ id: c.varId, label: c.label ?? c.varId }); }
      return out;
    };
    const setStruct = (patch: Record<string, unknown>, base: string) => setCfg({ sub: undefined, group: undefined, hom: undefined, carrier: undefined, sort: 'G', label: unique(base, 'G'), ...patch } as Partial<MachineConfig>);
    const structRows = (): HTMLElement[] => {
      if (!many) return [];
      const rows: HTMLElement[] = [];
      const kinds = h('div', { class: 'h3-ctl' }, h('span', { class: 'h3-ctl-k' }, 'or let'));
      const sg = h('span', { class: 'h3-segs' });
      const kb = (on: boolean, html: string, title: string, act: () => void) => { const b = h('button', { class: `h3-seg math${on ? ' on' : ''}`, 'aria-pressed': String(on), title, html }); b.addEventListener('click', () => { if (!on) act(); }); sg.append(b); };
      const gs = groupsInScope();
      kb(grpT, `<i>G</i>₁ a group`, 'any group', () => setStruct({ group: true }, 'G'));
      kb(!!homT, `<i>f</i> : <i>G</i> → <i>H</i>`, 'any homomorphism', () => setStruct({ hom: { dom: gs[0]?.id ?? 'G', cod: gs[1]?.id ?? gs[0]?.id ?? 'G' } }, 'f'));
      kinds.append(sg);
      rows.push(kinds);
      if (homT) {
        const pick = (which: 'dom' | 'cod') => seg(which === 'dom' ? 'from' : 'to', gs.map((g) => [g.id, `<i>${esc(g.label)}</i>`] as [string, string]), homT[which], (id) => setCfg({ hom: { ...homT, [which]: id } } as Partial<MachineConfig>));
        rows.push(pick('dom'), pick('cod'));
      }
      // an element Tower lives in a group or a set: which one (only when there is a choice)
      if (!grpT && !homT && !sub && !isZ) {
        const env = sortCtx.cur.env;
        const carriers = env ? [...env.sorts.values()] : [];
        if (carriers.length > 1) rows.push(seg('in', carriers.map((c) => [c.id, `<i>${esc(c.label)}</i>`] as [string, string]), tc.carrier ?? 'G', (id) => setCfg({ carrier: id === 'G' ? undefined : id } as Partial<MachineConfig>)));
      }
      return rows;
    };
    sortN.addEventListener('click', () => setSub('normal'));
    if (sub) { sortG.classList.remove('on'); sortZ.classList.remove('on'); }
    sortG.addEventListener('click', () => { if (sub) setSub(undefined); });
    const v = cfg.label || (isZ ? 'n' : 'x');
    sec.append(
      h('div', { class: 'h3-label' }, 'Declares'),
      h('div', { class: 'h3-let' }, h('span', { class: 'math h3-let-k' }, 'Let'), ns.slot, h('span', { class: 'h3-segs h3-sortsegs' }, sortG, ...(zOk ? [sortZ] : []), ...(subOk ? [sortH, sortN] : []))),
      ns.chips,
      ...structRows(),
      h('p', { class: 'h3-note h3-lead' }, grpT ? `${v} can be any group. Prove it for ${v}, and ∀ makes it true for every group.` : homT ? `${v} can be any homomorphism from ${esc(L0[homT.dom] ?? homT.dom)} to ${esc(L0[homT.cod] ?? homT.cod)}. Prove it for ${v}, and ∀ makes it true for every homomorphism.` : sub ? `${v} can be any ${sub === 'normal' ? 'normal ' : ''}subgroup of G. Prove it for ${v}, and ∀ makes it true for every ${sub === 'normal' ? 'normal ' : ''}subgroup.` : isZ ? `${v} can be any integer. Prove it for ${v}, and ∀ makes it true for all.` : `${v} can be anything. Prove it for ${v}, and ∀ makes it true for all.`));
    // where it is used: machines whose inputs or output mention the symbol
    const users: { id: string; name: string }[] = [];
    for (const mm of s.canvas.machines) {
      const r = s.compiled?.machines?.[mm.id];
      if (!r || mm.id === m.id) continue;
      const vals = [...Object.values(r.inputs ?? {}), r.out].filter(Boolean) as ItemValue[];
      const cfgTerms = JSON.stringify(mm.config).includes(`"${cfg.varId}"`);
      const hit = cfgTerms || vals.some((x) => JSON.stringify(x).includes(`"id":"${cfg.varId}"`));
      if (hit) users.push({ id: mm.id, name: machineName(mm) });
    }
    const list = h('div', { class: 'h3-uses' }, h('span', { class: 'h3-ctl-k' }, 'used by'));
    if (!users.length) list.append(h('span', { class: 'h3-dim' }, 'none yet'));
    for (const u of users) {
      const b = h('button', { class: 'h3-tag' }, u.name);
      b.addEventListener('pointerenter', () => store.setHover({ k: 'machine', id: u.id }));
      b.addEventListener('pointerleave', () => store.setHover(null));
      b.addEventListener('click', () => { store.select([u.id]); store.openLens(u.id); });
      list.append(b);
    }
    sec.append(list);
    return sec;
  };

  // ───────── ∀ machine / gate: input ⟹ card, eligibility, Save to the Lemma Book ─────────
  const generalizeView = (s: S, m: Machine, res: MachineResult | undefined, work: ItemValue | undefined, L: Record<string, string>, H: Record<string, number>) => {
    const sec = h('div', { class: 'h3-sec h3-gen' });
    const out = res?.out;
    const vars = varIdsOf(s);
    if (m.kind === 'forall') {
      sec.append(h('div', { class: 'h3-label' }, 'Generalize'));
      const inEl = work ? itemShow(s, work, L, H, 'small') : h('span', { class: 'h3-dim' }, 'a fact about Tower variables');
      const outEl = out ? itemShow(s, out, L, H, 'small') : h('span', { class: 'h3-dim math h3-etc' }, '∀ …');
      // the machine's own step is NOT an implication: input above, a plain divider that says "becomes", output below (#21)
      sec.append(h('div', { class: 'h3-genline h3-genstack' }, h('span', { class: 'h3-gin' }, inEl), h('span', { class: 'h3-becomes' }, 'becomes'), h('span', { class: 'h3-gout' }, outEl)));
    } else {
      const room = s.canvas.rooms.find((r) => r.id === (m.config as { room?: string }).room);
      if (room) {
        const P = `${tH(room.l, L)} <span class="m-rel">${(room.kind === 'suppose' || (room.kind === 'assume' && room.rel !== 'neq')) ? '=' : '≠'}</span> ${tH(room.r, L)}`;
        const what = room.kind === 'assume' ? `<i>Q</i> leaves as <span class="math">${P} <span class="m-rel">⟹</span> <i>Q</i></span>`
          : `⊥ leaves as <span class="math">${tH(room.l, L)} <span class="m-rel">${room.kind === 'suppose' ? '≠' : '='}</span> ${tH(room.r, L)}</span>${room.kind === 'classical' ? ' <span class="t-classical">classical</span>' : ''}`;
        sec.append(h('div', { class: 'h3-label' }, `${room.kind === 'assume' ? 'Assume' : room.kind === 'suppose' ? 'Suppose' : 'Classical'} room`), h('p', { class: 'h3-roominfo', html: what }));
        sec.append(h('div', { class: 'h3-sec h3-out' }, h('div', { class: 'h3-label' }, 'Out'), h('div', { class: 'h3-outbox' }, out ? itemShow(s, out, L, H, 'out') : h('span', { class: 'h3-none' }, '—'))));
      }
    }
    // why it cannot generalize / save — named, with the dependency path lit on the floor
    const depsOf = (): string[] => {
      const nodes = res?.nodes ?? [];
      const last = nodes[nodes.length - 1];
      return last ? s.compiled?.check?.nodes?.[last]?.deps ?? [] : [];
    };
    const culpritOf = (dep: string): string | null => {
      if (dep.startsWith('g:')) return s.canvas.machines.find((x) => x.config.kind === 'given' && x.config.givenId === dep.slice(2))?.id ?? null;
      const rd = K.depRoom(dep); // a multi-desk room's assumption i is desk slot i
      if (rd) return s.canvas.machines.find((x) => x.config.kind === 'desk' && x.config.room === rd.room && ((x.config as { slot?: number }).slot ?? 0) === rd.slot)?.id ?? null;
      return null;
    };
    const lit = (el2: HTMLElement, ids: string[]) => {
      el2.addEventListener('pointerenter', () => { if (ids[0]) store.setHover({ k: 'machine', id: ids[0] }); });
      el2.addEventListener('pointerleave', () => store.setHover(null));
    };
    const why: { text: string; culprits: string[] }[] = [];
    // every symbol the input mentions: element atoms and Tower variables in its sides, a card's premises and
    // conclusion, and the ℤ Towers inside exponents (k₁ in (ab)^(5k₁))
    const symbols = new Set<string>();
    const walkT = (t: Term) => {
      if (t.k === 'atom') symbols.add(t.id);
      else if (t.k === 'inv') walkT(t.arg);
      else if (t.k === 'mul') t.fs.forEach(walkT);
      else if (t.k === 'pow') { walkT(t.base); for (const term of t.exp) for (const x of term.monomial) if (x.ref.k === 'zvar') symbols.add(x.ref.id); }
    };
    const walkF = (f: Fact) => {
      if (f.k === 'eq' || f.k === 'neq' || f.k === 'law') { walkT(f.l); walkT(f.r); }
      else if (f.k === 'cond') { for (const p of f.premises) if (p.k === 'eq' || p.k === 'neq') { walkT(p.l); walkT(p.r); } if (f.concl.k === 'eq' || f.concl.k === 'neq') { walkT(f.concl.l); walkT(f.concl.r); } }
    };
    if (work && work.k === 'fact') walkF(work.fact); else if (work && work.k === 'card') walkF(work.card);
    const boundVars = [...symbols].filter((a) => vars.has(a));
    const consts = [...symbols].filter((a) => !vars.has(a) && s.level.atoms.some((x) => x.id === a));
    const inMetas = work && work.k === 'card' ? work.card.metas.length : 0;
    const bindsNothing = m.kind === 'forall' && work && (out && out.k === 'card' ? out.card.metas.length <= inMetas : !boundVars.length);
    if (bindsNothing) {
      why.push({ text: consts.length
        ? `${consts.map((a) => L[a] ?? a).join(' and ')} ${consts.length > 1 ? 'are fixed letters' : 'is a fixed letter'}, not ${consts.length > 1 ? 'variables' : 'a variable'}. Declare a variable with a Tower.`
        : 'No variable here. Declare one with a Tower.', culprits: [] });
    } else if (m.kind === 'forall' && out && out.k === 'card' && boundVars.length) {
      sec.append(h('p', { class: 'h3-okline', html: `Generalized <span class="math">${boundVars.map((v) => tH({ k: 'atom', id: v }, L)).join(', ')}</span>.` }));
    }
    const stat = res?.status;
    const deps = depsOf();
    const rooms = deps.filter((d) => d.startsWith('a:'));
    if (m.kind === 'forall' && stat?.k === 'jammed' && rooms.length) {
      const rd = K.depRoom(rooms[0]!);
      const r = s.canvas.rooms.find((x) => x.id === rd?.room);
      const a = r && (r.assumes?.length ?? 0) > 1 ? r.assumes![rd!.slot] : r ? { rel: (r.rel === 'neq' || r.kind === 'classical' ? 'neq' : 'eq') as 'eq' | 'neq', l: r.l, r: r.r } : null;
      const aText = !a ? 'of a room' : a.rel === 'mem' ? `${safe(() => K.termText(a.t, L), '')} ∈ ${L[a.sub.id] ?? a.sub.id}` : `${safe(() => K.termText(a.l, L), '')} ${a.rel === 'neq' ? '≠' : '='} ${safe(() => K.termText(a.r, L), '')}`;
      why.push({ text: `It uses the assumption ${aText}. Pass it through the room’s gate first.`, culprits: rooms.map(culpritOf).filter(Boolean) as string[] });
    }
    // eligibility for the Lemma Book
    if (out && out.k === 'card') {
      const r = safe(() => F.lemmaFrom(s.compiled, s.canvas, m.id, s.ctx), null);
      const given = deps.filter((d) => d.startsWith('g:'));
      if (r?.ok) {
        const name = h('input', { class: 'h3-term h3-lname', placeholder: 'Name it', 'aria-label': 'lemma name', autocomplete: 'off', spellcheck: 'false' });
        const save = h('button', { class: 'lw-key small primary' }, 'Save to Lemma Book');
        const doSave = () => { const res2 = store.saveLemma(m.id, name.value.trim() || 'Lemma'); if (res2.ok) { save.textContent = 'Saved ✓'; save.disabled = true; } };
        save.addEventListener('click', doSave);
        name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSave(); if (e.key === 'Escape') { e.preventDefault(); name.blur(); store.openLens(null); } });
        const already = camp(s).lemmas.some((l) => JSON.stringify(l.card) === JSON.stringify(out.card));
        sec.append(h('div', { class: 'h3-save' }, h('span', { class: 'h3-badge-ok' }, already ? 'In the Lemma Book' : 'Ready to save'), already ? null : name, already ? null : save));
        if (!already) sec.append(h('p', { class: 'h3-note' }, 'Saved, it is a recipe in every later order.'));
      } else {
        const t = given.length
          ? `Can’t save: it uses ${given.map((g) => { const gd = s.level.givens.find((x) => `g:${x.id}` === g); return gd ? `${gd.name}: ${safe(() => K.factText(gd.fact as never, L), '')}` : g.slice(2); }).join(', ')}.`
          : rooms.length ? 'Can’t save: it uses a room’s assumption. Pass it through the gate first.'
          : r && !r.ok ? r.reason : '';
        if (t) why.push({ text: t, culprits: [...given, ...rooms].map(culpritOf).filter(Boolean) as string[] });
      }
    }
    for (const w of why) {
      const p = h('p', { class: 'h3-reason h3-why', html: richHTML(w.text, s.level) });
      if (w.culprits.length) { p.classList.add('traced'); p.title = 'hover: light the dependency on the floor'; lit(p, w.culprits); }
      sec.append(p);
    }
    return sec;
  };

  const portLabel = (p: string) => (p === 'rule' ? 'rule' : p === 'card' ? 'card' : p.startsWith('meta:') ? p.slice(5) : /^p\d+$/.test(p) ? `premise ${+p.slice(1) + 1}` : p);

  // ───────── the stacked equation ("twin"): LHS on row 1; = right-aligned on row 2, then RHS ─────────
  interface Twin { el: HTMLElement; box: HTMLElement; overlay: HTMLElement; rails: Record<'l' | 'r', HTMLElement> }
  const twin = (p: { k: 'eq' | 'neq'; l: Term; r: Term }, L: Record<string, string>, H: Record<string, number>, gaps: boolean): Twin => {
    const rl = markVars(rail(p.l, { side: 'l', L, hues: H, gaps }));
    const rr = markVars(rail(p.r, { side: 'r', L, hues: H, gaps }));
    const overlay = h('div', { class: 'h3-brackets' });
    const box = h('div', { class: `h3-twin${p.k === 'neq' ? ' neq' : ''}` },
      h('div', { class: 'h3-railrow l' }, rl),
      h('span', { class: 'h3-rung math' }, p.k === 'eq' ? '=' : '≠'),
      h('div', { class: 'h3-railrow r' }, rr), overlay);
    return { el: h('div', { class: 'h3-twinwrap' }, box), box, overlay, rails: { l: rl, r: rr } };
  };

  /** "∈ H" with H drawn as an Euler set: the fixed right end of a membership. */
  const memEnd = (sub: { id: string }, L: Record<string, string>, em = 20) => {
    const label = L[sub.id] ?? sub.id;
    const normal = (store.get().level.subgroups ?? []).find((g) => g.id === sub.id)?.normal;
    return h('span', { class: 'h3-memend', title: `in the subgroup ${label}` }, h('span', { class: 'h3-rung math' }, '∈'), h('span', { class: 'h3-blob', html: eulerBlobHTML(label, em, { normal }) }));
  };
  /**
   * Book phase B: a membership t ∈ H in the lens. ONE rail — its term, addressed as the LHS, so a Rewriter's spans and
   * carets work on it exactly as on an equation — and "∈ H" as the rail's fixed right end. No second rail, no rung.
   */
  const memTwin = (p: { k: 'mem'; t: Term; sub: { id: string } }, L: Record<string, string>, H: Record<string, number>, gaps: boolean): Twin => {
    const rl = markVars(rail(p.t, { side: 'l', L, hues: H, gaps }));
    const overlay = h('div', { class: 'h3-brackets' });
    const box = h('div', { class: 'h3-twin h3-memtwin' }, h('div', { class: 'h3-railrow l' }, rl, memEnd(p.sub, L)), overlay);
    return { el: h('div', { class: 'h3-twinwrap' }, box), box, overlay, rails: { l: rl, r: h('div', {}) } };
  };
  const factorsFor = (tw: Twin, a: Addr): HTMLElement[] => {
    const r = tw.rails[a.side];
    const all = [...r.querySelectorAll<HTMLElement>('.bn-f[data-wpath]')];
    if (a.range) return all.filter((f) => f.dataset.wpath === pathKey(a.path) && +f.dataset.i! >= a.range![0] && +f.dataset.i! < a.range![1]);
    const whole = all.filter((f) => f.dataset.wpath === pathKey(a.path));
    if (whole.length) return whole;
    const parent = a.path.slice(0, -1), i = a.path[a.path.length - 1];
    return all.filter((f) => f.dataset.wpath === pathKey(parent) && +f.dataset.i! === i);
  };
  const gapFor = (tw: Twin, a: GapAddr) => tw.rails[a.side].querySelector<HTMLElement>(`.bn-gap[data-wpath="${pathKey(a.path)}"][data-gap="${a.gap}"]`);
  const span = (tw: Twin, a: Addr, br: DOMRect) => {
    const fs = factorsFor(tw, a); if (!fs.length) return null;
    const rs = fs.map((f) => (f.querySelector('.bn-disc') ?? f).getBoundingClientRect());
    return { x0: Math.min(...rs.map((r) => r.left)) - br.left + 1, x1: Math.max(...rs.map((r) => r.right)) - br.left - 1 };
  };
  const caretSVG = (up: boolean) => `<svg width="12" height="7" viewBox="0 0 12 7" aria-hidden="true" style="display:block;overflow:visible"><path d="${up ? 'M1,6 L6,0.5 L11,6' : 'M1,1 L6,6.5 L11,1'}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  /**
   * Targets: spans are braces (over the LHS, under the RHS, stacked 12px apart when they overlap); insertion
   * points are carets (∨ above the LHS, ∧ below the RHS). Selectable = solid #BFC3CF, chosen = family ink.
   */
  const drawTargets = (tw: Twin, res: MachineResult, p: Pallet, apply: (t: SpanTarget | GapTarget) => void, target: SpanTarget | GapTarget) => {
    const box = tw.box;
    let br = box.getBoundingClientRect();
    tw.overlay.innerHTML = '';
    const levels: Record<'l' | 'r', [number, number][][]> = { l: [], r: [] };
    const placed: { i: number; a: Addr | GapAddr; x0: number; x1: number; k: number; chosen: boolean; label: string }[] = [];
    res.candidates!.forEach((c, i) => {
      const a = c.addr;
      let x0: number, x1: number;
      if (isGapAddr(a)) {
        const g = gapFor(tw, a); if (!g) return;
        const r = g.getBoundingClientRect();
        const cx = r.left - br.left + r.width / 2; x0 = cx - 6; x1 = cx + 6;
      } else { const sp = span(tw, a, br); if (!sp) return; ({ x0, x1 } = sp); }
      const lv = levels[a.side];
      let k = 0;
      while (lv[k]?.some(([a0, a1]) => !(x1 < a0 - 2 || x0 > a1 + 2))) k++;
      (lv[k] ??= []).push([x0, x1]);
      placed.push({ i, a, x0, x1, k, chosen: res.chosen === i, label: c.label });
    });
    // room for the levels, then measure the rails where they now sit
    box.style.paddingTop = `${levels.l.length ? 10 + levels.l.length * 12 : 6}px`;
    box.style.paddingBottom = `${levels.r.length ? 10 + levels.r.length * 12 : 6}px`;
    br = box.getBoundingClientRect();
    const rl = tw.rails.l.getBoundingClientRect(), rr = tw.rails.r.getBoundingClientRect();
    for (const t of placed) {
      const side = t.a.side, gap = isGapAddr(t.a), top = side === 'l';
      const y = top ? rl.top - br.top - 12 - t.k * 12 : rr.bottom - br.top + 5 + t.k * 12;
      const b = h('button', {
        class: `h3-br ${side}${t.chosen ? ' chosen' : ''}${gap ? ' gap' : ''}`, title: `${t.chosen ? 'Acting here' : 'Act here instead'}: ${t.label}`,
        'aria-label': `${t.chosen ? 'Chosen target' : 'Pin target'} ${t.label} on the ${top ? 'LHS' : 'RHS'}`, 'aria-pressed': String(t.chosen), 'data-i': t.i,
        'data-side': side, 'data-path': pathKey(t.a.path), ...(gap ? { 'data-gap': (t.a as GapAddr).gap } : { 'data-range': (t.a as Addr).range ? (t.a as Addr).range!.join('-') : '' }),
        style: `left:${t.x0}px;top:${y - 3}px;width:${t.x1 - t.x0}px`,
      });
      if (gap) b.innerHTML = caretSVG(!top);
      else b.append(braceEl(top ? 'over' : 'under', { sw: t.chosen ? 2.2 : 1.5 }));
      const a = t.a;
      b.addEventListener('pointerenter', () => { if (!isGapAddr(a)) factorsFor(tw, a).forEach((f) => f.classList.add('is-lit')); });
      b.addEventListener('pointerleave', () => tw.rails[side].querySelectorAll('.is-lit').forEach((f) => f.classList.remove('is-lit')));
      b.addEventListener('click', () => {
        if (t.chosen && target.k === 'pin') return;
        const pinned = pinFor(p, a);
        if (pinned) apply(pinned);
      });
      tw.overlay.append(b);
    }
    position();
  };

  /** A binding's spans as labelled braces on the premise (u | v, a prefix u on both rails …). */
  const drawCutsFor = (tw: Twin, bindings: { meta: MetaId; addr: Addr }[], cls: string) => {
    const br = tw.box.getBoundingClientRect();
    tw.overlay.querySelectorAll(`.h3-cut.${cls}`).forEach((x) => x.remove());
    for (const b of bindings) {
      const sp = span(tw, b.addr, br); if (!sp) continue;
      const rr = tw.rails[b.addr.side].getBoundingClientRect();
      const top = b.addr.side === 'l';
      const y = top ? rr.top - br.top - 12 : rr.bottom - br.top + 5;
      tw.overlay.append(h('span', { class: `h3-cut ${b.addr.side} ${cls}`, style: `left:${sp.x0}px;top:${y}px;width:${sp.x1 - sp.x0}px` },
        braceEl(top ? 'over' : 'under', { sw: 2 }), h('i', { class: 'math' }, b.meta)));
    }
  };

  /** Interior word boundaries a binding introduces: where the theorem cuts the premise. */
  const cutsOf = (fact: Pallet, bindings: { meta: MetaId; addr: Addr }[]) => {
    const out: { side: 'l' | 'r'; path: number[]; b: number; len: number }[] = [];
    const seen = new Set<string>();
    for (const bd of bindings) {
      if (!bd.addr.range || (fact.k !== 'eq' && fact.k !== 'neq')) continue;
      const len = wordOf(descend(bd.addr.side === 'l' ? fact.l : fact.r, bd.addr.path).t).length;
      for (const b of bd.addr.range) {
        const k = `${bd.addr.side}/${pathKey(bd.addr.path)}/${b}`;
        if (b > 0 && b < len && !seen.has(k)) { seen.add(k); out.push({ side: bd.addr.side, path: bd.addr.path, b, len }); }
      }
    }
    return out.sort((x, y) => (x.side === y.side ? x.b - y.b : x.side === 'l' ? -1 : 1));
  };

  /** Theorem machines: split handles between factors of the premise. Hover previews ONE result; click cuts there. */
  const drawHandles = (tw: Twin, res: MachineResult, fact: Pallet, chosen: number, pick: (i: number) => void, hover: (i: number | null) => void) => {
    const box = tw.box;
    box.style.paddingTop = '34px'; box.style.paddingBottom = '22px';
    const br = box.getBoundingClientRect();
    const chs = res.choices ?? [];
    const xAt = (side: 'l' | 'r', path: number[], b: number, len: number) => {
      const left = b > 0 ? factorsFor(tw, { side, path, range: [b - 1, b] })[0] : null;
      const right = b < len ? factorsFor(tw, { side, path, range: [b, b + 1] })[0] : null;
      const lr = left?.getBoundingClientRect(), rr = right?.getBoundingClientRect();
      if (lr && rr) return (lr.right + rr.left) / 2 - br.left;
      if (lr) return lr.right - br.left + 6;
      if (rr) return rr.left - br.left - 6;
      return null;
    };
    const used = new Map<string, number>();
    const show = (i: number | null) => {
      drawCutsFor(tw, [], 'hov');
      if (i !== null && i !== chosen) {
        drawCutsFor(tw, chs[i]!.bindings, 'hov');
        tw.overlay.querySelectorAll('.h3-cut.sel').forEach((x) => x.classList.add('dim'));
      } else tw.overlay.querySelectorAll('.h3-cut.sel').forEach((x) => x.classList.remove('dim'));
      tw.overlay.querySelectorAll<HTMLElement>('.h3-handle').forEach((x) => x.classList.toggle('hot', +x.dataset.i! === i));
      hover(i);
    };
    chs.forEach((c, i) => {
      const cuts = cutsOf(fact, c.bindings);
      const prim = cuts[0];
      let x: number | null = null, side: 'l' | 'r' = 'l';
      if (prim) { x = xAt(prim.side, prim.path, prim.b, prim.len); side = prim.side; }
      if (x === null) { // the binding cuts nowhere inside a word (a whole side): a handle at the rail's end
        const b0 = c.bindings[0]; if (!b0) return;
        side = b0.addr.side;
        const fs = [...tw.rails[side].querySelectorAll<HTMLElement>('.bn-f')];
        const last = fs[fs.length - 1]?.getBoundingClientRect();
        if (!last) return;
        x = last.right - br.left + 10;
      }
      const key = `${side}/${Math.round(x)}`;
      const n = used.get(key) ?? 0; used.set(key, n + 1);
      const rr = tw.rails[side].getBoundingClientRect();
      const hd = h('button', {
        class: `h3-handle ${side}${i === chosen ? ' chosen' : ''}`, 'data-i': i,
        title: i === chosen ? 'The theorem cuts the premise here' : 'Cut here instead',
        'aria-label': `${i === chosen ? 'Chosen cut' : 'Cut'} ${c.bindings.map((b) => b.meta).join(' | ')} (${i + 1} of ${chs.length})`, 'aria-pressed': String(i === chosen),
        style: `left:${x - 8 + n * 6}px;top:${rr.top - br.top - 6}px;height:${rr.height + 12}px`,
      });
      hd.addEventListener('pointerenter', () => show(i));
      hd.addEventListener('focus', () => show(i));
      hd.addEventListener('pointerleave', () => show(null));
      hd.addEventListener('blur', () => show(null));
      hd.addEventListener('click', () => { if (i !== chosen) pick(i); });
      tw.overlay.append(hd);
      // a handle on one rail mirrors as a passive tick wherever else the same cut lands (a shared prefix)
      for (const cu of cuts.slice(1)) {
        const xx = xAt(cu.side, cu.path, cu.b, cu.len); if (xx === null) continue;
        const r2 = tw.rails[cu.side].getBoundingClientRect();
        tw.overlay.append(h('span', { class: `h3-tickmark${i === chosen ? ' chosen' : ''}`, 'data-i': i, style: `left:${xx - 1}px;top:${r2.top - br.top - 3}px;height:${r2.height + 6}px` }));
      }
    });
    tw.overlay.querySelectorAll<HTMLElement>('.h3-tickmark:not(.chosen)').forEach((t) => { t.style.display = 'none'; });
    tw.overlay.addEventListener('pointerover', (e) => {
      const i = (e.target as HTMLElement).closest<HTMLElement>('.h3-handle')?.dataset.i;
      tw.overlay.querySelectorAll<HTMLElement>('.h3-tickmark:not(.chosen)').forEach((t) => { t.style.display = t.dataset.i === i ? '' : 'none'; });
    });
    const sel = chs[chosen];
    if (sel) drawCutsFor(tw, sel.bindings, 'sel');
    position();
  };

  /** The conclusion one binding would produce (for the hovered handle only; never a list). */
  const conclusionOf = (s: S, m: Machine, res: MachineResult, fact: Pallet, i: number, L: Record<string, string>): string => {
    const ch = res.choices?.[i];
    if (!ch) return '';
    const c = m.config as { kind: string; recipe?: TheoremRecipe | null; values?: Record<MetaId, Param> };
    const ref = c.recipe && c.recipe.k === 'library' ? c.recipe.ref : null;
    const lc = ref ? libCard(s, ref) : null;
    const routed = Object.values(res.inputs).find((v) => v?.k === 'card');
    const card = (lc && (lc.k === 'cond' || lc.k === 'law') ? lc : routed && routed.k === 'card' ? routed.card : null) as Card | null;
    const sub: Record<string, Term> = {};
    for (const b of ch.bindings) { const t = safe(() => K.termAt(fact, b.addr), null); if (t) sub[b.meta] = t; }
    for (const [mm, pv] of Object.entries(c.values ?? {})) if (pv.k === 'knob' && pv.term && !sub[mm]) sub[mm] = pv.term;
    if (card) {
      const concl = card.k === 'cond' ? card.concl : { k: 'eq' as const, l: card.l, r: card.r };
      if (concl.k === 'mem') { // Book phase B: t ∈ H
        const t = safe(() => K.instantiate(concl.t, sub), null);
        if (t && K.isGround(t) && concl.sub.k === 'sub') return fH({ k: 'mem', t, sub: concl.sub }, L);
      } else {
        const done = safe(() => ({ k: concl.k, l: K.instantiate(concl.l, sub), r: K.instantiate(concl.r, sub) }), null);
        if (done && K.isGround(done.l) && K.isGround(done.r)) return fH(done as Pallet, L);
      }
    }
    return esc(ch.label.split('  (')[0] ?? '');
  };

  const targetChip = (cur: SpanTarget | GapTarget, res: MachineResult | undefined, apply: (t: SpanTarget | GapTarget) => void) => {
    const wrap = h('span', { class: 'h3-tchip' });
    const n = res?.candidates?.length ?? 0;
    if (cur.k === 'first') wrap.append(h('span', { class: 'h3-dim' }, n > 1 ? `${n} places · click one` : ''), h('span', { class: 'h3-tag on', title: 'Default: RHS first, then LHS; shortest span at each start' }, 'first match'));
    else {
      const reset = h('button', { class: 'h3-tag', title: 'Go back to the first match' }, 'use first match');
      reset.addEventListener('click', () => apply({ k: 'first' }));
      wrap.append(h('span', { class: 'h3-tag on pinned' }, 'pinned'), reset);
    }
    return wrap;
  };

  // ───────── kind-specific controls ─────────
  const seg = <T extends string>(label: string, opts: [T, string][], cur: T, on: (v: T) => void) => {
    const row = h('div', { class: 'h3-ctl' }, h('span', { class: 'h3-ctl-k' }, label));
    const g = h('span', { class: 'h3-segs' });
    for (const [v, txt] of opts) {
      const b = h('button', { class: `h3-seg${v === cur ? ' on' : ''}`, 'aria-pressed': String(v === cur), 'data-v': v, html: txt });
      b.addEventListener('click', () => { if (v !== cur) on(v); });
      g.append(b);
    }
    row.append(g);
    return row;
  };
  const toggle = (label: string, on: boolean, hint: string, set: (v: boolean) => void) => {
    const b = h('button', { class: `h3-toggle${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on), title: hint }, h('i', {}), label);
    b.addEventListener('click', () => set(!on));
    return h('div', { class: 'h3-ctl' }, b, h('span', { class: 'h3-dim' }, hint));
  };
  /** A rule's two directions, written as the rule itself (a1f938ba): `ab ⟶ e` / `e ⟶ ab`. */
  const dirLabels = (rule: Fact | null | undefined, L: Record<string, string>): [string, string] => {
    if (rule && (rule.k === 'eq' || rule.k === 'law')) {
      const l = tH(rule.l, L), r = tH(rule.r, L);
      return [`<span class="math">${l} <span class="m-rel">⟶</span> ${r}</span>`, `<span class="math">${r} <span class="m-rel">⟶</span> ${l}</span>`];
    }
    return ['LHS → RHS', 'RHS → LHS'];
  };

  const controls = (s: S, m: Machine, res: MachineResult | undefined, setCfg: (p: Partial<MachineConfig>) => void, L: Record<string, string>, H: Record<string, number>, workFact: { l: Term; r: Term } | null): HTMLElement | null => {
    const c = m.config;
    const sec = h('div', { class: 'h3-sec h3-ctls' });
    const quick = workFact ? [{ label: 'LHS' as const, term: workFact.l }, { label: 'RHS' as const, term: workFact.r }] : [];
    const knob = (name: string, p: Param, set: (p: Param) => void, o: { portable?: boolean; quick?: boolean; layout?: 'single' | 'pair'; inv?: boolean } = {}) =>
      sec.append(paramKnob(s, m, name, p, set, L, H, { portable: o.portable ?? true, quick: o.quick === false ? [] : quick, layout: o.layout ?? 'single', inv: o.inv }));
    switch (c.kind) {
      case 'spool': knob('t', c.t, (t) => setCfg({ t }), { quick: false }); break;
      case 'hopper': sec.append(paramKnob(s, m, 't', { k: 'knob', term: c.t }, (p) => setCfg({ t: p.k === 'knob' ? p.term : null }), L, H, { portable: false, quick: [], layout: 'single' })); break;
      case 'rewriter': {
        const r = c.recipe;
        if (!r) return null;
        if (r.k === 'insertPair') knob('x', r.x, (x) => setCfg({ recipe: { ...r, x } }), { layout: 'pair', inv: r.inv });
        if (r.k === 'law' || r.k === 'routed') {
          const card = r.k === 'law' ? libCard(s, r.ref) : (res?.inputs['rule'] ? (res.inputs['rule'].k === 'card' ? res.inputs['rule'].card : res.inputs['rule'].k === 'fact' ? res.inputs['rule'].fact : null) : null);
          const [fwd, rev] = dirLabels(card, L);
          sec.append(seg('direction', [['fwd', fwd], ['rev', rev]], c.dir, (dir) => setCfg({ dir })));
          const zs = zMetas(card);
          for (const meta of freeMetas(card, c.dir, c.values)) {
            const set = (p: Param) => setCfg({ values: { ...c.values, [meta]: p } });
            if (zs.has(meta)) sec.append(intKnob(s, meta, c.values[meta] ?? { k: 'knob', term: null }, set, L));
            else knob(meta, c.values[meta] ?? { k: 'knob', term: null }, set);
          }
          // the literal-power family: choose r (x^r = r copies of x)
          if (r.k === 'law' && r.ref.k === 'schema' && r.ref.id.startsWith(`${K.POWER_LITERAL_FAMILY}:`) && s.level.tools.schemas.includes(K.POWER_LITERAL_FAMILY)) {
            const rv = r.ref.id.split(':')[1] ?? '2';
            const inp = h('input', { class: 'h3-term h3-rnum', value: rv, inputmode: 'numeric', 'aria-label': 'r, a positive whole number', autocomplete: 'off' });
            const go = () => { const v = Math.trunc(Number(inp.value)); if (v >= 1 && String(v) !== rv) setCfg({ recipe: { k: 'law', ref: { k: 'schema', id: `${K.POWER_LITERAL_FAMILY}:${v}` } } }); else inp.value = rv; };
            inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
            inp.addEventListener('blur', go);
            sec.append(h('div', { class: 'h3-ctl' }, h('span', { class: 'h3-ctl-k math', html: '<i>r</i> =' }), inp, h('span', { class: 'h3-dim' }, 'copies')));
          }
        }
        // "tidy" only where a rewrite can leave an e: cancelling always does; a law only if the side it writes has an e (#22)
        const writesE = (() => {
          if (r.k === 'cancel') return true;
          if (r.k !== 'law' && r.k !== 'routed') return false;
          const rule = r.k === 'law' ? libCard(s, r.ref) : (() => { const v = res?.inputs['rule']; return v?.k === 'card' ? v.card : v?.k === 'fact' ? v.fact : null; })();
          if (!rule || !('l' in rule)) return r.k === 'routed';
          const dst = c.dir === 'rev' ? rule.l : rule.r;
          return JSON.stringify(dst).includes('"k":"e"');
        })();
        if (writesE) sec.append(toggle('tidy', c.tidy, 'drop the e it leaves', (tidy) => setCfg({ tidy })));
        break;
      }
      case 'operator': {
        const r = c.recipe;
        if (r?.k === 'multiply') {
          const t = '<i class="math">t</i>';
          sec.append(seg('side', [['left', `${t}·LHS = ${t}·RHS`], ['right', `LHS·${t} = RHS·${t}`]], r.side, (side) => setCfg({ recipe: { ...r, side } })));
          knob('t', r.t, (tt) => setCfg({ recipe: { ...r, t: tt } }));
        }
        // Book phase C: apply f to both sides — for a two-argument map (σ(g, p)) which argument the equation fills,
        // and the other argument(s) as term knobs (or ports)
        if (r?.k === 'apply') {
          const mp = safe(() => mapsInScope(s.ctx, s.canvas as never), []).find((x) => x.id === r.fn);
          const nm = `<i>${esc(mp?.label ?? r.fn)}</i>`;
          if (mp && mp.args.length > 1) {
            const slot = r.slot ?? 0;
            const sl = (x: string) => esc(L[x] ?? x);
            sec.append(seg('the equation fills', mp.args.map((a, i) => [String(i), `${nm}(${mp.args.map((_, j) => (j === i ? '<i>u</i>' : '·')).join(', ')}) <span class="h3-dim">in ${sl(a)}</span>`] as [string, string]), String(slot), (v) => setCfg({ recipe: { ...r, slot: Number(v), others: [] } })));
            let j = 0;
            mp.args.forEach((a, i) => {
              if (i === slot) return;
              const jj = j++;
              knob(`argument ${i + 1}`, r.others?.[jj] ?? { k: 'knob', term: null }, (p) => { const o = [...(r.others ?? [])]; o[jj] = p; setCfg({ recipe: { ...r, others: o } }); }, { quick: false });
            });
          }
        }
        break;
      }
      case 'theorem': {
        const r = c.recipe;
        if (!r) return null;
        const card = (r.k === 'library' ? libCard(s, r.ref) : Object.values(res?.inputs ?? {}).find((v) => v?.k === 'card') && (Object.values(res!.inputs).find((v) => v?.k === 'card') as { card: Card }).card) as Card | null;
        if (card && (card.k === 'cond' || card.k === 'law')) {
          // a meta the premises bind is read off the arriving facts: no knob (memberships bind through their term)
          const inPrem = new Set(card.k === 'cond' ? card.premises.flatMap((p) => (p.k === 'eq' || p.k === 'neq' ? [...K.metasOf(p.l), ...K.metasOf(p.r)] : p.k === 'mem' ? [...K.metasOf(p.t)] : [])) : []);
          const free = [...new Set([...card.metas.filter((x) => !inPrem.has(x)), ...Object.keys(c.values)])].sort();
          const zs = zMetas(card);
          for (const meta of free) {
            const set = (p: Param) => setCfg({ values: { ...c.values, [meta]: p } });
            if (zs.has(meta)) sec.append(intKnob(s, meta, c.values[meta] ?? { k: 'knob', term: null }, set, L));
            else knob(meta, c.values[meta] ?? { k: 'knob', term: null }, set);
          }
        }
        break;
      }
      case 'desk': {
        const room = s.canvas.rooms.find((r) => r.id === c.room);
        if (room && (room.assumes?.length ?? 0) > 1) {
          // Book phase A: desk i of a multi-desk room emits assumption Pᵢ
          const i = (c as { slot?: number }).slot ?? 0, a = room.assumes![i];
          if (a) sec.append(h('div', { class: 'h3-roominfo', html: `Emits <span class="math"><i>P</i><sub class="m-sub">${i + 1}</sub>: ${fH(deskFact(a), L)}</span>, assumption ${i + 1} of ${room.assumes!.length}. Valid only inside the room.` }));
        } else if (room) {
          const eq = room.kind === 'suppose' || (room.kind === 'assume' && room.rel !== 'neq');
          sec.append(h('div', { class: 'h3-roominfo', html: `Emits <span class="math">${tH(room.l, L)} <span class="m-rel">${eq ? '=' : '≠'}</span> ${tH(room.r, L)}</span>. Valid only inside the room.` }));
        }
        if (room?.kind === 'assume') sec.append(roomAssumptionsEditor(s, store, room));
        break;
      }
      case 'gate': {
        const room = s.canvas.rooms.find((r) => r.id === c.room);
        if (room?.kind === 'assume') sec.append(roomAssumptionsEditor(s, store, room));
        break;
      }
      default: return null;
    }
    return sec.childElementCount ? sec : null;
  };

  /** Metas of a rule that the matched side does not bind: the player supplies them. */
  const freeMetas = (rule: Fact | null | undefined, dir: 'fwd' | 'rev', values: Record<MetaId, Param>): MetaId[] => {
    const out = new Set(Object.keys(values));
    if (rule && rule.k === 'law') {
      const src = dir === 'fwd' ? rule.l : rule.r;
      const bound = new Set(safe(() => K.metasOf(src), [] as MetaId[]));
      // an exponent like m·n on the matched side does not determine m and n separately: ask for them
      const walk = (t: Term) => {
        if (t.k === 'pow') {
          for (const term of t.exp) if (term.monomial.length > 1 || term.monomial.some((x) => x.degree > 1)) for (const x of term.monomial) if (x.ref.k === 'zmeta') bound.delete(x.ref.id);
          walk(t.base);
        } else if (t.k === 'inv') walk(t.arg); else if (t.k === 'mul') t.fs.forEach(walk);
      };
      walk(src);
      for (const mm of rule.metas) if (!bound.has(mm)) out.add(mm);
    }
    return [...out].sort();
  };

  /** ℤ-sorted metas of a card: those occurring inside exponents. */
  const zMetas = (f: Fact | null | undefined): Set<string> => {
    const out = new Set<string>();
    const walk = (t: Term) => {
      if (t.k === 'pow') { for (const term of t.exp) for (const mm of term.monomial) if (mm.ref.k === 'zmeta') out.add(mm.ref.id); walk(t.base); }
      else if (t.k === 'inv') walk(t.arg); else if (t.k === 'mul') t.fs.forEach(walk);
    };
    if (f && (f.k === 'law' || f.k === 'eq' || f.k === 'neq')) { walk(f.l); walk(f.r); }
    if (f && f.k === 'cond') { for (const p of f.premises) if (p.k === 'eq' || p.k === 'neq') { walk(p.l); walk(p.r); } if (f.concl.k === 'eq' || f.concl.k === 'neq') { walk(f.concl.l); walk(f.concl.r); } }
    return out;
  };
  const subs = (src: string) => src.replace(/_(\d+)/g, (_x, d: string) => [...d].map((ch) => '₀₁₂₃₄₅₆₇₈₉'[+ch]).join(''));
  /** An integer knob (a ℤ meta: an exponent): integer polynomials in ℤ Towers, validated by the kernel. Not a term. */
  const intKnob = (s: S, name: string, p: Param, set: (p: Param) => void, L: Record<string, string>) => {
    const row = h('div', { class: 'h3-knob h3-intknob' });
    const label = h('span', { class: 'h3-knob-k math', html: `<i>${esc(name)}</i> :=` });
    const cur = p.k === 'knob' && p.term && p.term.k === 'int' ? safe(() => K.exponentText(p.term!.k === 'int' ? p.term!.val : [], L), '') : '';
    const input = h('input', { class: 'h3-term', value: cur, placeholder: '5, −1, 5k, n + 1', 'aria-label': `integer ${name}`, autocomplete: 'off', spellcheck: 'false' });
    const view = h('span', { class: 'h3-knob-view math' });
    const msg = h('span', { class: 'h3-knob-msg' });
    let parsed: Term | null = p.k === 'knob' ? p.term : null;
    const update = () => {
      const src = input.value.trim();
      view.innerHTML = ''; msg.textContent = ''; input.classList.remove('bad');
      if (!src) { parsed = null; return; }
      const r = safe(() => K.parseInteger(subs(src), atomsAll(s)), { ok: false as const, error: 'That doesn’t read as an integer.' });
      if (r.ok) { parsed = r.term; view.innerHTML = r.term.k === 'int' ? `<span class="h3-zval">${esc(K.exponentText(r.term.val, L))}</span>` : ''; }
      else { parsed = null; msg.textContent = r.error; input.classList.add('bad'); }
    };
    const commit = () => { update(); if (JSON.stringify(parsed) !== JSON.stringify(p.k === 'knob' ? p.term : null) && (parsed || !input.value.trim())) set({ k: 'knob', term: parsed }); };
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { e.preventDefault(); input.value = cur; update(); input.blur(); } });
    input.addEventListener('blur', () => { if (input.value.trim() !== cur) commit(); });
    const chips = h('div', { class: 'h3-chips' });
    const zs = towerVars(s).filter((v) => v.sort === 'Z');
    for (const t of [...zs.map((v) => v.label), '1', '2', '-1', '+', '·']) {
      const b = h('button', { class: `bn-chip h3-chip txt${zs.some((v) => v.label === t) ? ' h3-var' : ''}`, title: `append ${t}` }, t);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => { input.value += t === '·' ? '' : t === '+' ? ' + ' : t; update(); if (t !== '+' && t !== '·') commit(); });
      chips.append(b);
    }
    if (!zs.length) chips.append(h('span', { class: 'h3-dim' }, 'a ℤ Tower gives you n'));
    update();
    row.append(h('div', { class: 'h3-knob-top' }, label, input, view), msg, chips);
    if (!parsed) row.classList.add('unset');
    return row;
  };

  // ───────── term knob: term slots, or "use a port" ─────────
  const paramKnob = (s: S, m: Machine, name: string, p: Param, set: (p: Param) => void, L: Record<string, string>, H: Record<string, number>,
    o: { portable: boolean; quick: { label: 'LHS' | 'RHS'; term: Term }[]; layout: 'single' | 'pair'; inv?: boolean }) => {
    if (p.k === 'port') {
      const row = h('div', { class: 'h3-knob port' });
      const back = h('button', { class: 'h3-tag' }, 'type it instead');
      back.addEventListener('click', () => set({ k: 'knob', term: null }));
      row.append(h('span', { class: 'h3-knob-k math', html: `<i>${esc(name)}</i> :=` }), h('span', { class: 'h3-dim' }, `from a term belt into port ${name}`), back);
      return row;
    }
    const atoms = atomsAll(s);
    const els = atoms.filter((a) => (a as { sort?: string }).sort !== 'Z'); // ℤ Towers live in exponents, not as terms
    const level = els.filter((a) => !(a as { variable?: boolean }).variable);
    const chipAtoms = level.length ? level : els;
    const chips: Term[] = [...chipAtoms.map((a) => ({ k: 'atom', id: a.id } as Term)), ...chipAtoms.map((a) => ({ k: 'inv', arg: { k: 'atom', id: a.id } } as Term)), { k: 'e' }];
    // Tower variables are terms too: chips after the level's letters
    for (const v of els.filter((a) => (a as { variable?: boolean }).variable && level.length)) chips.push({ k: 'atom', id: v.id });
    return termSlot({
      name, value: p.term, layout: o.layout, inv: o.inv, label: o.layout === 'single', atoms, L, H, vars: varSortsOf(s), chips,
      quick: o.quick, onPort: o.portable ? () => set({ k: 'port' }) : undefined, towerLabels: () => towerLabelSet(store.get()),
      commit: (t) => set({ k: 'knob', term: t }), key: `${m.id}:${name}`,
    });
  };

  // ───────── item views ─────────
  const itemView = (v: ItemValue, L: Record<string, string>, H: Record<string, number>) => {
    if (v.k === 'term') { const w = h('div', { class: 'h3-termview' }); w.append(markVars(beadsInline(v.term, L, H))); return w; }
    if (v.k === 'fact' && (v.fact.k === 'eq' || v.fact.k === 'neq')) return twin(v.fact, L, H, false).el;
    if (v.k === 'fact' && v.fact.k === 'mem') return memTwin(v.fact, L, H, false).el;
    return h('div', { class: 'h3-bigmath math', html: itemHTML(v, L) });
  };

  const socketView = (s: S, socketId: string, arriving: ItemValue | undefined, res: MachineResult | undefined, L: Record<string, string>, H: Record<string, number>) => {
    const sk = s.level.sockets.find((x) => x.id === socketId);
    const info = s.compiled?.sockets?.[socketId];
    const delivered = s.run?.delivered?.[socketId];
    const sec = h('div', { class: 'h3-sec h3-socket' });
    sec.append(h('div', { class: 'h3-label' }, h('span', {}, 'Expected'), delivered !== undefined ? h('span', { class: 'h3-tag on sealed', html: '<span class="tomb"></span>delivered' }) : null));
    if (sk && sk.holes?.length) {
      // an open dock: its shape with hole chips (d = ?), the chip filled once the dock has accepted an answer
      const ov = openView(s.level, dockAnswers(s));
      const t = ov.level.sockets.find((x) => x.id === socketId)!.target;
      sec.append(h('div', { class: 'h3-expected math h3-open-dock', html: ov.chips(fH(t, { ...L, ...Object.fromEntries(ov.level.atoms.map((a) => [a.id, a.label])) })) }));
    } else if (sk) sec.append(h('div', { class: 'h3-expected' }, itemShow(s, { k: 'fact', fact: sk.target } as ItemValue, L, H, 'out')));
    sec.append(h('div', { class: 'h3-label' }, 'Arriving'));
    if (arriving) sec.append(itemView(arriving, L, H)); else sec.append(h('p', { class: 'h3-note h3-center' }, 'Nothing arriving yet. Either orientation is accepted.'));
    // the compiler's jam names the same thing: say it once
    if (info && !info.ok && info.reason && res?.status.k !== 'jammed') sec.append(h('p', { class: 'h3-reason jammed', html: richHTML(info.reason, s.level) }));
    if (info?.ok && arriving) {
      const f = h('button', { class: 'lw-key small primary', title: 'Quiet everything else and annotate each step of this proof' }, 'Follow this proof');
      f.addEventListener('click', () => { store.openLens(null); store.setUI({ follow: socketId }); });
      sec.append(f);
    }
    return sec;
  };

  // ───────── positioning ─────────
  /** The selected machine's port hit areas on the floor (the floor tags them .fl-p-hit[data-p="m|port"]). */
  const portRects = (id: string): { r: DOMRect; out: boolean }[] => {
    const out: { r: DOMRect; out: boolean }[] = [];
    document.getElementById('floor')?.querySelectorAll<SVGElement>(`.fl-p-hit[data-p^="${CSS.escape(id)}|"]`).forEach((p) => {
      const r = p.getBoundingClientRect();
      if (r.width || r.height) out.push({ r, out: (p.getAttribute('data-p') ?? '').endsWith('|out') });
    });
    return out;
  };
  let guard: DOMRect[] = []; // port areas (+24 px) the lens could not avoid: pointer passes through there

  /**
   * Place the lens beside the machine, never over its footprint or its ports (24 px clearance), preferring
   * the side away from its output; the order chip and run cluster stay readable. If nothing fits, the lens
   * goes where it overlaps least and lets the pointer through over the ports it still covers.
   */
  const stick: { id: string | null; side: 'above' | 'below' | 'left' | 'right' | null; top: number; cx: number; cy: number } = { id: null, side: null, top: 0, cx: 0, cy: 0 };
  const position = () => {
    if (el.hidden || !curId) return;
    const s = store.get();
    const r = machineRect(curId, s);
    const w = el.offsetWidth, hh = el.offsetHeight;
    const top0 = 64, bottom0 = innerHeight - 92, left0 = 12, right0 = innerWidth - 12;
    guard = [];
    if (!r) {
      el.classList.add('docked'); el.classList.remove('above', 'below', 'left', 'right');
      el.style.left = `${innerWidth - w - 16}px`;
      el.style.top = `${Math.max(top0, opts.dockTop())}px`;
      return;
    }
    el.classList.remove('docked');
    const ports = portRects(curId);
    const pad = 24;
    // the zone to keep clear: the machine and every port hit area, inflated by the clearance
    let zx0 = r.left, zy0 = r.top, zx1 = r.left + r.width, zy1 = r.top + r.height;
    for (const p of ports) { zx0 = Math.min(zx0, p.r.left); zy0 = Math.min(zy0, p.r.top); zx1 = Math.max(zx1, p.r.right); zy1 = Math.max(zy1, p.r.bottom); }
    zx0 -= pad; zy0 -= pad; zx1 += pad; zy1 += pad;
    const cx = (zx0 + zx1) / 2, cy = (zy0 + zy1) / 2;
    const outP = ports.find((p) => p.out)?.r;
    const ox = outP ? outP.left + outP.width / 2 - cx : 1, oy = outP ? outP.top + outP.height / 2 - cy : 0;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    type Cand = { side: 'above' | 'below' | 'left' | 'right'; left: number; top: number };
    const cands: Cand[] = [
      { side: 'above', left: clamp(cx - w / 2, left0, right0 - w), top: zy0 - hh },
      { side: 'below', left: clamp(cx - w / 2, left0, right0 - w), top: zy1 },
      { side: 'left', left: zx0 - w, top: clamp(cy - hh / 2, top0, bottom0 - hh) },
      { side: 'right', left: zx1, top: clamp(cy - hh / 2, top0, bottom0 - hh) },
    ];
    // away from the output first: if it points right, try left; if down, above; …
    const away = (c: Cand) => (c.side === 'left' ? ox : c.side === 'right' ? -ox : c.side === 'above' ? oy : -oy);
    cands.sort((a, b) => away(b) - away(a));
    const clear = (opts.keepClear?.() ?? []).map((x) => x.getBoundingClientRect()).filter((q) => q.width);
    const overlap = (l: number, t: number, q: { left: number; top: number; right: number; bottom: number }) =>
      Math.max(0, Math.min(l + w, q.right) - Math.max(l, q.left)) * Math.max(0, Math.min(t + hh, q.bottom) - Math.max(t, q.top));
    const zone = { left: zx0, top: zy0, right: zx1, bottom: zy1 };
    const score = (c: Cand) => {
      const off = Math.max(0, left0 - c.left) + Math.max(0, c.left + w - right0) + Math.max(0, top0 - c.top) + Math.max(0, c.top + hh - bottom0);
      return overlap(c.left, c.top, zone) * 4 + clear.reduce((n, q) => n + overlap(c.left, c.top, q), 0) + off * 400;
    };
    let best = cands[0]!, bestScore = Infinity;
    for (const c of cands) { const sc = score(c); if (sc < bestScore - 1) { best = c; bestScore = sc; } if (sc === 0) break; }
    // NORMS, still panels: once open on a machine the lens keeps its side (and its top, beside the machine) while its
    // content changes height — a chip click must never flip it and swallow the next click. It moves only when the
    // kept side would cover the machine or leave the screen, or the camera moves the machine.
    if (stick.id === curId && stick.side && Math.abs(stick.cx - cx) < 2 && Math.abs(stick.cy - cy) < 2) {
      const keep = cands.find((c) => c.side === stick.side)!;
      const kept: Cand = keep.side === 'left' || keep.side === 'right' ? { ...keep, top: clamp(stick.top, top0, bottom0 - hh) } : keep;
      const off = Math.max(0, left0 - kept.left) + Math.max(0, kept.left + w - right0) + Math.max(0, top0 - kept.top) + Math.max(0, kept.top + hh - bottom0);
      if (!off && !overlap(kept.left, kept.top, zone)) best = kept;
    }
    const left = clamp(best.left, left0, right0 - w), top = clamp(best.top, top0, bottom0 - hh);
    stick.id = curId; stick.side = best.side; stick.top = top; stick.cx = cx; stick.cy = cy;
    // still covering a port? let the pointer through there
    guard = ports.map((p) => new DOMRect(p.r.left - pad, p.r.top - pad, p.r.width + 2 * pad, p.r.height + 2 * pad))
      .filter((q) => overlap(left, top, q) > 0);
    for (const c of ['above', 'below', 'left', 'right']) el.classList.toggle(c, best.side === c);
    el.style.left = `${left}px`; el.style.top = `${top}px`;
    const mcx = r.left + r.width / 2, mcy = r.top + r.height / 2;
    if (best.side === 'above' || best.side === 'below') { notch.style.left = `${Math.max(16, Math.min(w - 16, mcx - left))}px`; notch.style.top = ''; }
    else { notch.style.top = `${Math.max(16, Math.min(hh - 16, mcy - top))}px`; notch.style.left = ''; }
  };
  // pointer-transparent over the ports the lens could not avoid: the drag from a port reaches the floor
  addEventListener('pointermove', (e) => {
    if (el.hidden || !guard.length) { if (el.style.pointerEvents) el.style.pointerEvents = ''; return; }
    const over = guard.some((q) => e.clientX >= q.left && e.clientX <= q.right && e.clientY >= q.top && e.clientY <= q.bottom);
    el.style.pointerEvents = over ? 'none' : '';
  }, { capture: true, passive: true });

  return { render, position, el };
}
