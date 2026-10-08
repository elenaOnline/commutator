// COMMUTATOR v4 — the inspector lens, anchored to the selected machine (docked at the right edge when the
// floor cannot say where it is). The recipe is chosen INSIDE the machine from the library (rules, never
// results); then the incoming beads show every candidate bracket; Towers, ∀ and gates explain themselves.
// Every change goes through store.configure; the kernel decides what it means.
import * as F from '../factory';
import * as K from '../kernel';
import type { Addr, Card, Fact, Family, GapAddr, MetaId, Pallet, Term } from '../kernel/types';
import type { Anchor, GapTarget, ItemValue, LibRef, Machine, MachineConfig, MachineResult, Param, SpanTarget, TheoremRecipe } from '../factory/types';
import { beads as beadsInline, rail } from './beads';
import { FAMILY } from '../ui/tokens';
import {
  KIND_WORD, atomsAll, atomsIn, esc, fH, h, huesAll, itemHTML, labelsAll, machineName, machineRect, nameHTML, richHTML, safe, spec, tH,
  towerVars, varIdsOf, type S, type Store,
} from './util';
import { GROUP_ORDER, libCard, libraryFor, recipeKey, type AnyRecipe, type LibEntry } from './library';
import { armPreset, isPinned, pin, presetKey, unpin, withRecipe } from './presets';
import { openConceptFor } from './concept';
import { hasDistinctMirror } from '../factory/catalog';

const pathKey = (p: number[]) => p.join('.');
/** Tower variables are striped "any" beads everywhere. */
function markVars<T extends HTMLElement>(el: T, vars: Set<string>): T {
  if (vars.size) el.querySelectorAll<HTMLElement>('.bn-f[data-leaf], .bn-f').forEach((f) => {
    const leaf = f.dataset.leaf ?? '';
    const id = leaf.startsWith('a:') ? leaf.slice(2) : leaf.startsWith('i:') ? (/"id":"([^"]+)"/.exec(leaf)?.[1] ?? '') : '';
    if (id && vars.has(id)) f.classList.add('h3-varbead');
  });
  return el;
}
const wordOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);
const isGapAddr = (a: Addr | GapAddr): a is GapAddr => 'gap' in a;
const slice = (fs: Term[], s: number, e: number): Term => (e - s === 1 ? fs[s]! : { k: 'mul', fs: fs.slice(s, e) });

// ───────── pins (prefer the compiler's helpers; full-context fallback is unique by construction) ─────────
type Pinner = (p: Pallet, a: Addr | GapAddr) => SpanTarget | GapTarget | null;
function compilerPinner(gap: boolean): Pinner | null {
  const f = F as unknown as Record<string, unknown>;
  const fn = f[gap ? 'pinFromGap' : 'pinFromAddr'];
  return typeof fn === 'function' ? (fn as Pinner) : null;
}
function descend(rail: Term, path: number[]): { t: Term; ancestors: Anchor[] } {
  const ancestors: Anchor[] = [];
  let t = rail;
  for (const i of path) {
    if (t.k === 'mul') { ancestors.push({ k: 'factor', left: t.fs.slice(0, i), right: t.fs.slice(i + 1), leftEdge: true, rightEdge: true }); t = t.fs[i]!; }
    else if (t.k === 'inv') { ancestors.push({ k: 'inv' }); t = t.arg; }
  }
  return { t, ancestors };
}
function fallbackPin(p: Pallet, a: Addr | GapAddr): SpanTarget | GapTarget | null {
  if (p.k !== 'eq' && p.k !== 'neq') return null;
  const rail = a.side === 'l' ? p.l : p.r;
  const { t, ancestors } = descend(rail, a.path);
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

// ───────── status: the compiler's verdict is the headline; runtime activity is secondary ─────────
export function statusHeadline(s: S, id: string, res: MachineResult | undefined): { label: string; cls: string; sub?: string } {
  const live = s.run?.live?.[id];
  const m = s.canvas.machines.find((x) => x.id === id);
  if (!res) return { label: 'waiting for the compiler', cls: 'idle' };
  if (res.status.k === 'jammed') return { label: 'jammed', cls: 'jam' };
  if (res.status.k === 'starved') return { label: 'starved', cls: 'starved' };
  if (live === 'sealed') return { label: 'delivered', cls: 'sealed' };
  if (m?.kind === 'socket') return { label: 'will accept', cls: 'ok', sub: 'awaiting the first item' };
  return { label: 'working', cls: 'ok', sub: live === 'working' ? 'busy' : live === 'blocked' ? 'output blocked' : 'between items' };
}

export interface LensApi { render: (s: S) => void; position: () => void; el: HTMLElement }

export function mountLens(layer: HTMLElement, store: Store, opts: { dockTop: () => number; keepClear?: () => HTMLElement[] }): LensApi {
  const el = h('section', { class: 'h3-lens', hidden: true, 'aria-label': 'Machine inspector' });
  const notch = h('span', { class: 'h3-lens-notch', 'aria-hidden': 'true' });
  layer.append(el);

  let curId: string | null = null;
  let lastKey = '';
  let lastLive = '';
  const statusEl = () => el.querySelector<HTMLElement>('.h3-status');

  const render = (s: S) => {
    const id = s.ui.screen === 'floor' ? s.ui.lens : null;
    const m = id ? s.canvas.machines.find((x) => x.id === id) : undefined;
    if (!id || !m) { if (!el.hidden) { el.hidden = true; curId = null; lastKey = ''; } return; }
    const res = s.compiled?.machines?.[id];
    const key = `${id}|${s.level.id}`;
    const structural = key !== lastKey || (el as unknown as { _c?: unknown })._c !== s.compiled || (el as unknown as { _v?: unknown })._v !== s.canvas;
    if (structural) {
      // keep a focused term field alive while its own machine re-renders for an unrelated reason
      const focused = el.contains(document.activeElement) && (document.activeElement as HTMLElement).matches('input');
      if (focused && key === lastKey && (el as unknown as { _v?: unknown })._v === s.canvas) { /* only compiled moved */ }
      else {
        build(s, m, res);
        (el as unknown as { _c?: unknown })._c = s.compiled;
        (el as unknown as { _v?: unknown })._v = s.canvas;
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
    st.className = 'h3-status';
    const v = statusHeadline(s, m.id, res);
    st.className = `h3-status ${v.cls}`;
    st.innerHTML = `<i class="h3-pip"></i>${esc(v.label)}${v.sub ? `<span class="h3-sub">${esc(v.sub)}</span>` : ''}`;
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
      if (r.k === 'routed') return 'given';
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
    el.dataset.kind = m.kind;
    el.dataset.family = fam;
    const cfg = m.config;
    const recipe = recipeOf(m);
    const entry = recipe ? libraryFor(s, m.kind === 'carddock' ? 'carddock' : m.kind).find((x) => x.key === recipeKey(recipe)) : undefined;

    // head
    const close = h('button', { class: 'h3-x', title: 'Close (Esc)', 'aria-label': 'Close inspector' }, '×');
    close.addEventListener('click', () => store.openLens(null));
    const help = h('button', { class: 'h3-icon h3-help', title: 'Explain this machine (concept cards)', 'aria-label': 'Explain' }, '?');
    help.addEventListener('click', () => openConceptFor(store, m.kind));
    const tcfg0 = cfg.kind === 'tower' ? cfg : null;
    const sub = tcfg0 ? `<span class="math">Let ${tH({ k: 'atom', id: tcfg0.varId }, L)} ∈ ${tcfg0.sort === 'Z' ? 'ℤ' : '<i>G</i>'}</span> · ${tcfg0.sort === 'Z' ? 'an arbitrary integer, for exponents' : 'an arbitrary element'}`
      : entry ? `${entry.nameHTML}` : richHTML(sp.blurb, s.level);
    const head = h('header', { class: 'h3-lens-head' },
      h('span', { class: `h3-glyph fam-${fam}${fam === 'lemma' ? ' earned' : ''}`, style: `--ink:${FAMILY[fam].ink}`, html: tcfg0 ? `${tH({ k: 'atom', id: tcfg0.varId }, L)}${tcfg0.sort === 'Z' ? '∈ℤ' : '∈<i>G</i>'}` : esc(sp.glyph) }),
      h('span', { class: 'h3-lens-title' }, h('b', {}, machineName(m)), h('span', { class: 'h3-lens-sub', html: sub })),
      h('span', { class: 'h3-status' }), help);
    if (!m.locked) {
      const rot = h('button', { class: 'h3-icon', title: 'Rotate (R)', 'aria-label': 'Rotate' }, '↻');
      rot.addEventListener('click', () => store.rotate(m.id));
      const del = h('button', { class: 'h3-icon', title: 'Remove (Delete)', 'aria-label': 'Remove machine' }, '⌫');
      del.addEventListener('click', () => { store.remove([m.id]); store.openLens(null); });
      head.append(rot, del);
    } else head.append(h('span', { class: 'h3-locked', title: 'Placed by the work order' }, 'fixed'));
    head.append(close);
    el.append(head);

    const body = h('div', { class: 'h3-lens-body' });
    el.append(body);
    const setCfg = (patch: Partial<MachineConfig>) => { store.configure(m.id, { ...cfg, ...patch } as MachineConfig); };
    const inputs = res?.inputs ?? {};

    // ── machines without a workpiece of their own
    if (cfg.kind === 'socket') { body.append(socketView(s, cfg.socketId, inputs['q'], L, H)); return finish(s, m, res, body, L); }
    if (cfg.kind === 'given') { body.append(givenView(s, cfg.givenId, L, H)); return finish(s, m, res, body, L); }
    if (cfg.kind === 'tower') { body.append(towerView(s, m, cfg, setCfg)); return finish(s, m, res, body, L); }

    // ── the recipe: chosen inside the machine, from the library (rules, never results)
    const isVerb = m.kind === 'rewriter' || m.kind === 'operator' || m.kind === 'joiner' || m.kind === 'theorem' || m.kind === 'carddock';
    if (isVerb) {
      if (!recipe || pickerOpen.has(m.id)) body.append(recipePicker(s, m, (r) => { pickerOpen.delete(m.id); store.configure(m.id, withRecipe(cfg, r)); }, !!recipe));
      else body.append(recipeChip(s, m, recipe, entry));
    }

    // ── the incoming workpiece: rewriter/operator 'q', theorem 'p0', ∀ its input; joiner shows both
    const workPort = m.kind === 'theorem' ? 'p0' : 'q';
    const work = inputs[workPort] ?? (m.kind === 'forall' ? Object.values(inputs).find(Boolean) : undefined);
    const workFact = work && work.k === 'fact' && (work.fact.k === 'eq' || work.fact.k === 'neq') ? work.fact : null;
    const targeting = m.kind === 'rewriter' && !!recipe;
    if (m.kind === 'joiner') {
      const sec = h('div', { class: 'h3-sec h3-others' });
      for (const p of ['a', 'b']) { const v = inputs[p]; sec.append(h('div', { class: 'h3-inrow' }, h('span', { class: 'h3-portname' }, p === 'a' ? 'first' : 'second'), v ? h('span', { class: 'math h3-inval', html: itemHTML(v, L) }) : h('span', { class: 'h3-dim' }, 'nothing routed yet'))); }
      body.append(sec);
    } else if (workFact && m.kind !== 'forall') {
      const sec = h('div', { class: 'h3-sec' });
      const rk = (recipe as { k?: string } | null)?.k;
      const gapMode = rk === 'insertE' || rk === 'insertPair' || !!res?.candidates?.some((c) => isGapAddr(c.addr));
      const tw = twin(workFact, L, H, gapMode && targeting);
      const isThm = m.kind === 'theorem';
      const tcfg = cfg as { target?: SpanTarget; gap?: GapTarget; choice?: number };
      const cur: SpanTarget | GapTarget = gapMode ? (tcfg.gap ?? { k: 'first' }) : (tcfg.target ?? { k: 'first' });
      const applyPin = (t: SpanTarget | GapTarget) => setCfg((gapMode ? { gap: t } : { target: t }) as Partial<MachineConfig>);
      sec.append(h('div', { class: 'h3-label' }, h('span', {}, `${isThm ? 'premise' : 'in'} · ${KIND_WORD[workFact.k]}`),
        targeting ? targetChip(cur, gapMode, res, applyPin) : isThm && res?.choices?.length ? h('span', { class: 'h3-tchip h3-dim' }, res.choices.length > 1 ? 'hover a handle to preview · click to cut there' : 'the only way this premise fits') : null), tw.el);
      body.append(sec);
      if (targeting && res?.candidates?.length) {
        requestAnimationFrame(() => drawBrackets(tw, res, workFact, applyPin, cur));
        if (res.candidates.length > 1 && !gapMode) sec.append(candidateChips(tw, res, workFact, L, H, applyPin));
      }
      // Literal Power: show the opened stack — the r copies it writes out — on its own "after" rails
      const rref = (recipe as { k?: string; ref?: LibRef } | null)?.ref;
      const litR = rref?.k === 'schema' && rref.id.startsWith('power.literal:') ? Number(rref.id.split(':')[1]) : 0;
      const outF = res?.out && res.out.k === 'fact' && (res.out.fact.k === 'eq' || res.out.fact.k === 'neq') ? res.out.fact : null;
      if (litR && outF) {
        const after = twin(outF, L, H, false);
        body.append(h('div', { class: 'h3-sec h3-after' }, h('div', { class: 'h3-label' }, h('span', {}, `after · the stack opened into ${litR} copies`)), after.el));
        const addr = res?.candidates?.[res.chosen ?? 0]?.addr;
        if (addr && !isGapAddr(addr)) requestAnimationFrame(() => {
          const t = safe(() => K.termAt(workFact, addr), null);
          const bl = t && t.k === 'pow' ? wordOf(t.base).length : 1;
          const span: Addr = addr.range ? { side: addr.side, path: addr.path, range: [addr.range[0], addr.range[0] + litR * bl] } : { side: addr.side, path: addr.path };
          factorsFor(after, span).forEach((f) => f.classList.add('h3-flash'));
        });
      }
      if (isThm && res?.choices?.length) {
        const preview = h('div', { class: 'h3-preview math' });
        sec.append(preview);
        const chosen = tcfg.choice ?? 0;
        requestAnimationFrame(() => drawHandles(tw, res, workFact, chosen, (i) => setCfg({ choice: i } as Partial<MachineConfig>), (i) => {
          if (i === null || i === chosen) { preview.innerHTML = ''; return; }
          const c = conclusionOf(s, m, res, workFact, i, L);
          preview.innerHTML = c ? `<span class="h3-arrow">cut here →</span> ${c}` : '';
        }));
      }
    } else if (work && m.kind !== 'forall') {
      body.append(h('div', { class: 'h3-sec' }, h('div', { class: 'h3-label' }, `in · ${KIND_WORD[work.k === 'fact' ? work.fact.k : work.k === 'card' ? work.card.k : 'term'] ?? ''}`), itemView(work, L, H)));
    } else if (isVerb && recipe && m.kind !== 'carddock') {
      body.append(h('div', { class: 'h3-sec h3-empty' }, h('p', { class: 'h3-note' }, m.kind === 'theorem' ? 'Route the premise into this machine: drag from a fact’s output to its premise port.' : 'Nothing arrives yet. Drag a belt from an output port into this machine’s input.')));
    }

    // ── other routed inputs (rule/card ports, parameters)
    if (m.kind !== 'joiner' && m.kind !== 'forall') {
      const others = Object.entries(inputs).filter(([p]) => p !== workPort);
      if (others.length) {
        const sec = h('div', { class: 'h3-sec h3-others' });
        for (const [p, v] of others) sec.append(h('div', { class: 'h3-inrow' }, h('span', { class: 'h3-portname' }, portLabel(p)), v ? h('span', { class: 'math h3-inval', html: itemHTML(v, L) }) : h('span', { class: 'h3-dim' }, 'nothing routed')));
        body.append(sec);
      }
    }

    if (m.kind === 'forall' || m.kind === 'gate') body.append(generalizeView(s, m, res, work, L));
    // ── controls
    const ctl = controls(s, m, res, setCfg, L, H, workFact);
    if (ctl) body.append(ctl);
    finish(s, m, res, body, L);
  };

  /** Output, then the reason (with a "?" to the relevant concept card). */
  const finish = (s: S, m: Machine, res: MachineResult | undefined, body: HTMLElement, L: Record<string, string>) => {
    if (res?.out && m.kind !== 'socket' && m.kind !== 'forall' && m.kind !== 'gate') {
      const o = res.out;
      body.append(h('div', { class: 'h3-sec h3-out' }, h('div', { class: 'h3-label' }, `out · ${KIND_WORD[o.k === 'fact' ? o.fact.k : o.k === 'card' ? o.card.k : 'term'] ?? ''}`), h('div', { class: 'h3-outmath math', html: `<span class="h3-arrow">→</span> ${itemHTML(o, L)}` })));
    }
    const stat = res?.status;
    if (stat && stat.k !== 'ok') {
      const p = h('p', { class: `h3-reason ${stat.k}`, html: richHTML(stat.reason, s.level) });
      const q = h('button', { class: 'h3-qlink', title: 'Open the concept card that explains this' }, '?');
      q.addEventListener('click', () => openConceptFor(store, m.kind, stat.reason));
      p.append(' ', q);
      body.append(p);
    } else if (!res) body.append(h('p', { class: 'h3-reason starved' }, 'The compiler has not reported on this machine yet.'));
    el.append(notch);
  };

  // ───────── recipe picker: the library, grouped, searchable; statements typeset ─────────
  const GROUP_LABEL: Record<string, string> = {
    Operations: 'Operations', Axioms: 'Axioms', 'Given here': 'Given here', 'Proven theorem': 'Proven theorem · earned · Lemma Book', Imported: 'Imported', 'Fact made here': 'Fact made here',
  };
  const recipePicker = (s: S, m: Machine, pick: (r: AnyRecipe) => void, canCancel: boolean) => {
    const kind = m.kind === 'carddock' ? 'carddock' : m.kind;
    const all = libraryFor(s, kind);
    const wrap = h('div', { class: 'h3-sec h3-picker' });
    const search = h('input', { class: 'h3-search h3-psearch', placeholder: kind === 'operator' || kind === 'joiner' ? 'Filter operations' : 'Search rules by name or statement', 'aria-label': 'Search recipes', autocomplete: 'off', spellcheck: 'false' });
    const list = h('div', { class: 'h3-plist', role: 'listbox' });
    const top = h('div', { class: 'h3-label' }, h('span', {}, 'Recipe · choose the rule this machine uses'));
    if (canCancel) {
      const back = h('button', { class: 'h3-tag' }, 'keep current');
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
        list.append(h('div', { class: 'h3-group' }, GROUP_LABEL[g] ?? g));
        for (const e of items) {
          const row = h('button', { class: 'h3-prow', role: 'option', 'data-key': e.key },
            h('span', { class: 'h3-prow-name', html: e.nameHTML }),
            e.stmt ? h('span', { class: 'h3-prow-stmt math', html: e.stmt }) : null,
            e.note ? h('span', { class: 'h3-prow-note' }, e.note) : null);
          row.addEventListener('click', () => pick(e.recipe));
          list.append(row);
        }
      }
      if (!list.childElementCount) list.append(h('p', { class: 'h3-note' }, all.length ? 'No rule matches. Every rule this order allows is listed here; try a shorter word.' : 'Nothing in the library fits this machine yet: route a card into its card port, or earn a theorem.'));
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

  const recipeChip = (s: S, m: Machine, recipe: AnyRecipe, entry: LibEntry | undefined) => {
    const key = presetKey(m.kind, recipe);
    const pinnedNow = isPinned(key);
    const change = h('button', { class: 'h3-tag', title: 'Choose another rule' }, 'change');
    change.addEventListener('click', () => { pickerOpen.add(m.id); lastKey = ''; render(store.get()); });
    const star = h('button', { class: `h3-tag h3-pin${pinnedNow ? ' on' : ''}`, title: pinnedNow ? 'Unpin from the hotbar' : 'Pin this machine + recipe to the hotbar' }, pinnedNow ? '★ pinned' : '☆ pin');
    star.addEventListener('click', () => {
      if (isPinned(key)) unpin(key); else pin({ key, kind: m.kind, recipe, label: entry ? h('i', { html: entry.nameHTML }).textContent ?? 'recipe' : 'recipe' });
      lastKey = ''; store.setUI({});
    });
    const sec = h('div', { class: 'h3-sec h3-recipe' },
      h('div', { class: 'h3-label' }, h('span', {}, 'Recipe'), h('span', { class: 'h3-tchip' }, star, change)),
      h('div', { class: 'h3-recipe-row' }, h('span', { class: 'h3-recipe-name', html: entry?.nameHTML ?? esc(recipeKey(recipe)) }), entry?.stmt ? h('span', { class: 'h3-recipe-stmt math', html: entry.stmt }) : null),
      entry?.note ? h('div', { class: 'h3-prow-note' }, entry.note) : null);
    if ((recipe as { k: string }).k === 'routed' && !safe(() => localStorage.getItem('commutator/seen-routed'), null)) {
      sec.append(h('p', { class: 'h3-note h3-first' }, 'A fact made on this floor is a product: it reaches a machine only by belt. Route it into this machine’s rule port; its provenance and scope travel with it.'));
      safe(() => localStorage.setItem('commutator/seen-routed', '1'), undefined);
    }
    return sec;
  };

  // ───────── given: start a belt vs cite in a machine ─────────
  const givenView = (s: S, givenId: string, L: Record<string, string>, H: Record<string, number>) => {
    const g = s.level.givens.find((x) => x.id === givenId);
    const sec = h('div', { class: 'h3-sec' }, h('div', { class: 'h3-label' }, 'Given here'),
      h('div', { class: 'h3-bigmath math', html: g ? `<i>${nameHTML(g.name)}</i>:&ensp;${fH(g.fact, L)}` : '—' }));
    if (g && (g.fact.k === 'eq' || g.fact.k === 'neq')) sec.append(twin(g.fact, L, H, false).el);
    if (!g) return sec;
    const two = h('div', { class: 'h3-twoways' });
    const canStart = g.fact.k === 'eq' || g.fact.k === 'neq' || g.fact.k === 'size';
    if (canStart) two.append(h('div', { class: 'h3-way' }, h('b', {}, 'Start a belt'), h('span', {}, 'drag from this inlet’s output to make it the workpiece of a machine')));
    const citeKind = g.fact.k === 'cond' ? 'theorem' : g.fact.k === 'eq' || g.fact.k === 'law' ? 'rewriter' : null;
    if (citeKind) {
      const b = h('button', { class: 'lw-key small' }, citeKind === 'theorem' ? 'Cite in a Theorem' : 'Cite in a Rewriter');
      const recipe: AnyRecipe = citeKind === 'theorem' ? { k: 'library', ref: { k: 'given', givenId } } : { k: 'law', ref: { k: 'given', givenId } };
      b.addEventListener('click', () => { store.openLens(null); armPreset(store, { key: presetKey(citeKind, recipe), kind: citeKind, recipe, label: g.name }); });
      two.append(h('div', { class: 'h3-way' }, h('b', {}, citeKind === 'theorem' ? 'Cite it as a theorem' : 'Cite it as a rule'), h('span', {}, 'no belt needed: choose it as the recipe inside a machine (the dependency on it is kept)'), b));
    }
    sec.append(two);
    return sec;
  };

  // ───────── Tower: name, sort, where its symbol is used ─────────
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const subOf = (n: number) => String(n).split('').map((d) => SUB[+d]).join('');
  const towerView = (s: S, m: Machine, cfg: { kind: 'tower'; varId: string; label: string; sort: 'G' | 'Z' }, setCfg: (p: Partial<MachineConfig>) => void) => {
    const sec = h('div', { class: 'h3-sec h3-tower' });
    const others = towerVars(s).filter((v) => v.id !== cfg.varId).map((v) => v.label);
    const unique = (raw: string, sortNow: 'G' | 'Z' = cfg.sort) => {
      const typed = raw.trim().replace(/_(\d+)/g, (_x, d: string) => subOf(+d));
      const base = typed.replace(/[₀-₉]+$/, '') || (sortNow === 'Z' ? 'n' : 'x');
      if (/[₀-₉]$/.test(typed) && !others.includes(typed)) return typed;
      for (let i = 1; i < 100; i++) if (!others.includes(base + subOf(i))) return base + subOf(i);
      return base;
    };
    const input = h('input', { class: 'h3-term h3-tname', value: cfg.label, 'aria-label': 'variable name', autocomplete: 'off', spellcheck: 'false' });
    const commit = () => { const v = unique(input.value); input.value = v; if (v !== cfg.label) setCfg({ label: v } as Partial<MachineConfig>); };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); } if (e.key === 'Escape') { input.value = cfg.label; input.blur(); } });
    input.addEventListener('blur', commit);
    const isZ = cfg.sort === 'Z';
    const sortG = h('button', { class: `h3-seg${!isZ ? ' on' : ''}`, 'aria-pressed': String(!isZ), title: 'an arbitrary group element' }, h('span', { class: 'math', html: '∈ <i>G</i>' }));
    const sortZ = h('button', { class: `h3-seg${isZ ? ' on' : ''}`, 'aria-pressed': String(isZ), title: 'an arbitrary integer, used in exponents' }, h('span', { class: 'math', html: '∈ ℤ' }));
    const setSort = (sort: 'G' | 'Z') => {
      if (sort === cfg.sort) return;
      const base = cfg.label.replace(/[₀-₉]+$/, '');
      const keep = base && base !== 'x' && base !== 'n'; // a name the player chose survives the change of sort
      setCfg({ sort, label: unique(keep ? base : sort === 'Z' ? 'n' : 'x', sort) } as Partial<MachineConfig>);
    };
    sortG.addEventListener('click', () => setSort('G'));
    sortZ.addEventListener('click', () => setSort('Z'));
    sec.append(
      h('div', { class: 'h3-label' }, h('span', {}, 'Declares'), h('span', { class: 'h3-tchip h3-dim' }, 'broadcast to the whole floor')),
      h('div', { class: 'h3-ctl' }, h('span', { class: 'math h3-let' }, 'Let'), input, h('span', { class: 'h3-segs' }, sortG, sortZ)),
      h('p', { class: 'h3-note' }, isZ
        ? 'An arbitrary integer: it may appear only in exponents, as in a^(5k₁). Whatever you prove about it holds for every integer, and a ∀ machine can say so. Different Towers name independently arbitrary values — not necessarily distinct ones.'
        : 'An arbitrary element: no given mentions it, so whatever you prove about it holds for every element, and a ∀ machine can say so. Different Towers name independently arbitrary elements — not necessarily distinct ones.'));
    // where it is used: machines whose inputs or output mention the symbol
    const users: { id: string; name: string }[] = [];
    for (const mm of s.canvas.machines) {
      const r = s.compiled?.machines?.[mm.id];
      if (!r || mm.id === m.id) continue;
      const vals = [...Object.values(r.inputs ?? {}), r.out].filter(Boolean) as ItemValue[];
      const cfgTerms = JSON.stringify(mm.config).includes(`"${cfg.varId}"`);
      const hit = cfgTerms || vals.some((v) => JSON.stringify(v).includes(`"id":"${cfg.varId}"`));
      if (hit) users.push({ id: mm.id, name: machineName(mm) });
    }
    const list = h('div', { class: 'h3-uses' }, h('span', { class: 'h3-ctl-k' }, 'used by'));
    if (!users.length) list.append(h('span', { class: 'h3-dim' }, 'no machine yet: type its name in a Spool, a knob or a room’s assumption'));
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

  // ───────── ∀ machine / gate: input → card, eligibility, Save to the Lemma Book ─────────
  const generalizeView = (s: S, m: Machine, res: MachineResult | undefined, work: ItemValue | undefined, L: Record<string, string>) => {
    const sec = h('div', { class: 'h3-sec h3-gen' });
    const out = res?.out;
    const vars = varIdsOf(s);
    if (m.kind === 'forall') {
      sec.append(h('div', { class: 'h3-label' }, 'Generalize'));
      const inHTML = work ? itemHTML(work, L) : '<span class="h3-dim">a fact about Tower variables</span>';
      sec.append(h('div', { class: 'h3-genline math', html: `<span class="h3-gin">${inHTML}</span><span class="h3-arrow">⟹</span><span class="h3-gout">${out ? itemHTML(out, L) : '<span class="h3-dim">∀ …</span>'}</span>` }));
    } else {
      const room = s.canvas.rooms.find((r) => r.id === (m.config as { room?: string }).room);
      if (room) {
        const P = `${tH(room.l, L)} <span class="m-rel">${(room.kind === 'suppose' || (room.kind === 'assume' && room.rel !== 'neq')) ? '=' : '≠'}</span> ${tH(room.r, L)}`;
        const what = room.kind === 'assume' ? `any fact <i>Q</i> made inside leaves as <span class="math">${P} <span class="m-rel">⇒</span> <i>Q</i></span>`
          : `⊥ arriving here leaves the room as <span class="math">${tH(room.l, L)} <span class="m-rel">${room.kind === 'suppose' ? '≠' : '='}</span> ${tH(room.r, L)}</span>${room.kind === 'classical' ? ' <span class="t-classical">classical</span>' : ''}`;
        sec.append(h('div', { class: 'h3-label' }, `${room.kind === 'assume' ? 'Assume' : room.kind === 'suppose' ? 'Suppose' : 'Classical'} room · gate`), h('p', { class: 'h3-roominfo', html: what }));
        if (out) sec.append(h('div', { class: 'h3-outmath math', html: `<span class="h3-arrow">→</span> ${itemHTML(out, L)}` }));
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
      if (dep.startsWith('a:')) return s.canvas.machines.find((x) => x.config.kind === 'desk' && x.config.room === dep.slice(2))?.id ?? null;
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
        ? `Nothing to generalize: this statement mentions only level constant${consts.length > 1 ? 's' : ''} ${consts.map((a) => L[a] ?? a).join(', ')}. ∀ does not turn a constant into an arbitrary element; build with a Tower.`
        : 'Nothing to generalize: no Tower variable occurs here. Declare one with a Tower and build with it.', culprits: [] });
    } else if (m.kind === 'forall' && out && out.k === 'card' && boundVars.length) {
      sec.append(h('p', { class: 'h3-okline', html: `Generalized <span class="math">${boundVars.map((v) => tH({ k: 'atom', id: v }, L)).join(', ')}</span>: ${boundVars.length > 1 ? 'they were' : 'it was'} arbitrary, so the statement holds for every choice.` }));
    }
    const stat = res?.status;
    const deps = depsOf();
    const rooms = deps.filter((d) => d.startsWith('a:'));
    if (m.kind === 'forall' && stat?.k === 'jammed' && rooms.length) {
      const r = s.canvas.rooms.find((x) => `a:${x.id}` === rooms[0]);
      why.push({ text: `This result rests on the assumption ${r ? `${safe(() => K.termText(r.l, L), '')} ${r.rel === 'neq' || r.kind === 'classical' ? '≠' : '='} ${safe(() => K.termText(r.r, L), '')}` : 'of a room'}. Feed it through that room’s Assume gate first to obtain a conditional theorem, then generalize.`, culprits: rooms.map(culpritOf).filter(Boolean) as string[] });
    }
    // eligibility for the Lemma Book
    if (out && out.k === 'card') {
      const r = safe(() => F.lemmaFrom(s.compiled, s.canvas, m.id, s.ctx), null);
      const given = deps.filter((d) => d.startsWith('g:'));
      if (r?.ok) {
        const name = h('input', { class: 'h3-term h3-lname', placeholder: 'name it, e.g. Double Flip', 'aria-label': 'lemma name', autocomplete: 'off', spellcheck: 'false' });
        const save = h('button', { class: 'lw-key small primary' }, 'Save to Lemma Book');
        const doSave = () => { const res2 = store.saveLemma(m.id, name.value.trim() || 'Lemma'); if (res2.ok) { save.textContent = 'Saved ✓'; save.disabled = true; } };
        save.addEventListener('click', doSave);
        name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSave(); if (e.key === 'Escape') { e.preventDefault(); name.blur(); store.openLens(null); } });
        const already = s.save.lemmas.some((l) => JSON.stringify(l.card) === JSON.stringify(out.card));
        sec.append(h('div', { class: 'h3-save' }, h('span', { class: 'h3-badge-ok' }, already ? 'In the Lemma Book' : 'Ready to save'), already ? null : name, already ? null : save),
          h('p', { class: 'h3-note' }, 'A theorem of group theory: it rests on no given and no assumption. Saved, it becomes a recipe in every later order.'));
      } else {
        const t = given.length
          ? `Can’t save globally: it uses given ${given.map((g) => { const gd = s.level.givens.find((x) => `g:${x.id}` === g); return gd ? `${gd.name}: ${safe(() => K.factText(gd.fact as never, L), '')}` : g.slice(2); }).join(', ')}. Global lemmas rest on no level givens.`
          : rooms.length ? 'Valid here, but it still depends on a room’s assumption: export it through the room’s gate first.'
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

  const hasWorkPort = (m: Machine, s: S) => safe(() => F.portsOf(m, s.ctx).some((p) => p.id === 'q'), m.kind !== 'spool' && m.kind !== 'hopper' && m.kind !== 'given' && m.kind !== 'carddock');
  const portLabel = (p: string) => (p === 'rule' ? 'rule' : p.startsWith('meta:') ? p.slice(5) : /^p\d+$/.test(p) ? `premise ${+p.slice(1) + 1}` : p);

  // ───────── twin rails ─────────
  interface Twin { el: HTMLElement; overlay: HTMLElement; rails: Record<'l' | 'r', HTMLElement> }
  const twin = (p: { k: 'eq' | 'neq'; l: Term; r: Term }, L: Record<string, string>, H: Record<string, number>, gaps: boolean): Twin => {
    const vs = varIdsOf(store.get());
    const rl = markVars(rail(p.l, { side: 'l', L, hues: H, gaps }), vs);
    const rr = markVars(rail(p.r, { side: 'r', L, hues: H, gaps }), vs);
    const overlay = h('div', { class: 'h3-brackets' });
    const box = h('div', { class: `h3-twin${p.k === 'neq' ? ' neq' : ''}` },
      h('span', { class: 'h3-rung math' }, p.k === 'eq' ? '=' : '≠'),
      h('div', { class: 'h3-railrow l' }, rl), h('div', { class: 'h3-railrow r' }, rr), overlay);
    return { el: h('div', { class: 'h3-twinwrap' }, box), overlay, rails: { l: rl, r: rr } };
  };

  const factorsFor = (tw: Twin, a: Addr): HTMLElement[] => {
    const rail = tw.rails[a.side];
    const all = [...rail.querySelectorAll<HTMLElement>('.bn-f[data-wpath]')];
    if (a.range) return all.filter((f) => f.dataset.wpath === pathKey(a.path) && +f.dataset.i! >= a.range![0] && +f.dataset.i! < a.range![1]);
    const whole = all.filter((f) => f.dataset.wpath === pathKey(a.path));
    if (whole.length) return whole;
    const parent = a.path.slice(0, -1), i = a.path[a.path.length - 1];
    return all.filter((f) => f.dataset.wpath === pathKey(parent) && +f.dataset.i! === i);
  };
  const gapFor = (tw: Twin, a: GapAddr) => tw.rails[a.side].querySelector<HTMLElement>(`.bn-gap[data-wpath="${pathKey(a.path)}"][data-gap="${a.gap}"]`);

  const drawBrackets = (tw: Twin, res: MachineResult, p: Pallet, apply: (t: SpanTarget | GapTarget) => void, target: SpanTarget | GapTarget) => {
    const box = tw.overlay.parentElement!;
    const br = box.getBoundingClientRect();
    tw.overlay.innerHTML = '';
    const levels: Record<'l' | 'r', [number, number][][]> = { l: [], r: [] };
    res.candidates!.forEach((c, i) => {
      const a = c.addr;
      let x0: number, x1: number, y: number;
      const chosen = res.chosen === i;
      const side = a.side;
      if (isGapAddr(a)) {
        const g = gapFor(tw, a); if (!g) return;
        const r = g.getBoundingClientRect();
        x0 = r.left - br.left + r.width / 2 - 7; x1 = x0 + 14;
      } else {
        const fs = factorsFor(tw, a); if (!fs.length) return;
        const rs = fs.map((f) => (f.querySelector('.bn-disc') ?? f).getBoundingClientRect());
        x0 = Math.min(...rs.map((r) => r.left)) - br.left - 3; x1 = Math.max(...rs.map((r) => r.right)) - br.left + 3;
      }
      // stack overlapping brackets on their rail's outer side (left rail above, right rail below)
      const lv = levels[side];
      let k = 0;
      while (lv[k]?.some(([a0, a1]) => !(x1 < a0 - 2 || x0 > a1 + 2))) k++;
      (lv[k] ??= []).push([x0, x1]);
      const rr = tw.rails[side].getBoundingClientRect();
      y = side === 'l' ? rr.top - br.top - 7 - k * 11 : rr.bottom - br.top + 3 + k * 11;
      const b = h('button', {
        class: `h3-br ${side}${chosen ? ' chosen' : ''}${isGapAddr(a) ? ' gap' : ''}`, title: `${chosen ? 'Acting here' : 'Act here instead'}: ${c.label}`,
        'aria-label': `${chosen ? 'Chosen target' : 'Pin target'} ${c.label} on the ${side === 'l' ? 'left' : 'right'} rail`, 'aria-pressed': String(chosen), 'data-i': i,
        'data-side': side, 'data-path': pathKey(a.path), ...(isGapAddr(a) ? { 'data-gap': a.gap } : { 'data-range': a.range ? a.range.join('-') : '' }),
        style: `left:${x0}px;top:${y}px;width:${x1 - x0}px`,
      });
      b.addEventListener('pointerenter', () => { if (!isGapAddr(a)) factorsFor(tw, a).forEach((f) => f.classList.add('is-lit')); });
      b.addEventListener('pointerleave', () => tw.rails[side].querySelectorAll('.is-lit').forEach((f) => f.classList.remove('is-lit')));
      b.addEventListener('click', () => {
        if (chosen && target.k === 'pin') return;
        const pin = pinFor(p, a);
        if (pin) apply(pin);
      });
      tw.overlay.append(b);
    });
    const need = Math.max(levels.l.length, levels.r.length);
    box.style.setProperty('--br-levels', String(Math.max(1, need * 1.4)));
    position();
  };

  /** Draw a binding's spans on the beads, each labelled with its variable (u | v, a prefix u on both rails …). */
  const drawCutsFor = (tw: Twin, bindings: { meta: MetaId; addr: Addr }[], cls: string) => {
    const box = tw.overlay.parentElement!;
    const br = box.getBoundingClientRect();
    tw.overlay.querySelectorAll(`.h3-cut.${cls}`).forEach((x) => x.remove());
    for (const b of bindings) {
      const fs = factorsFor(tw, b.addr); if (!fs.length) continue;
      const rs = fs.map((f) => (f.querySelector('.bn-disc') ?? f).getBoundingClientRect());
      const x0 = Math.min(...rs.map((r) => r.left)) - br.left - 2, x1 = Math.max(...rs.map((r) => r.right)) - br.left + 2;
      const rr = tw.rails[b.addr.side].getBoundingClientRect();
      const y = b.addr.side === 'l' ? rr.top - br.top - 9 : rr.bottom - br.top + 2;
      tw.overlay.append(h('span', { class: `h3-cut ${b.addr.side} ${cls}`, style: `left:${x0}px;top:${y}px;width:${x1 - x0}px` }, h('i', { class: 'math' }, b.meta)));
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
    const box = tw.overlay.parentElement!;
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
      tw.overlay.querySelectorAll('.h3-tick').forEach((x) => x.remove());
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
      // a handle on one rail mirrors as a passive tick wherever else the same cut lands (the Lathe's prefix)
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
    const need = 1.6;
    box.style.setProperty('--br-levels', String(need));
    position();
  };

  /** One readable chip per candidate span (the factor span as beads): disambiguates overlapping brackets. */
  const candidateChips = (tw: Twin, res: MachineResult, p: Pallet, L: Record<string, string>, H: Record<string, number>, apply: (t: SpanTarget | GapTarget) => void) => {
    const row = h('div', { class: 'h3-cands' }, h('span', { class: 'h3-ctl-k' }, 'act at'));
    res.candidates!.forEach((c, i) => {
      if (isGapAddr(c.addr)) return;
      const t = safe(() => K.termAt(p, c.addr as Addr), null);
      const b = h('button', { class: `h3-cand${res.chosen === i ? ' on' : ''}`, 'aria-pressed': String(res.chosen === i), title: c.label },
        h('span', { class: 'h3-cand-side' }, c.addr.side === 'l' ? 'L' : 'R'));
      if (t) b.append(beadsInline(t, L, H)); else b.append(c.label);
      const a = c.addr as Addr;
      b.addEventListener('pointerenter', () => { tw.overlay.querySelector(`.h3-br[data-i="${i}"]`)?.classList.add('hot'); factorsFor(tw, a).forEach((f) => f.classList.add('is-lit')); });
      b.addEventListener('pointerleave', () => { tw.overlay.querySelectorAll('.h3-br.hot').forEach((x) => x.classList.remove('hot')); tw.el.querySelectorAll('.is-lit').forEach((f) => f.classList.remove('is-lit')); });
      b.addEventListener('click', () => { if (res.chosen === i) return; const pin = pinFor(p, a); if (pin) apply(pin); });
      row.append(b);
    });
    return row;
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
      const done = safe(() => ({ k: concl.k, l: K.instantiate(concl.l, sub), r: K.instantiate(concl.r, sub) }), null);
      if (done && K.isGround(done.l) && K.isGround(done.r)) return fH(done as Pallet, L);
    }
    return esc(ch.label.split('  (')[0] ?? '');
  };

  const targetChip = (cur: SpanTarget | GapTarget, gap: boolean, res: MachineResult | undefined, apply: (t: SpanTarget | GapTarget) => void) => {
    const wrap = h('span', { class: 'h3-tchip' });
    const n = res?.candidates?.length ?? 0;
    if (cur.k === 'first') wrap.append(h('span', { class: 'h3-tag on', title: 'Default: right rail first, then left; shortest span at each start' }, 'first match'), h('span', { class: 'h3-dim' }, n ? `· ${n} ${gap ? 'gap' : 'candidate'}${n === 1 ? '' : 's'} · click ${gap ? 'a caret' : 'a bracket'} to pin` : ''));
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
      const b = h('button', { class: `h3-seg${v === cur ? ' on' : ''}`, 'aria-pressed': String(v === cur), html: txt });
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

  const controls = (s: S, m: Machine, res: MachineResult | undefined, setCfg: (p: Partial<MachineConfig>) => void, L: Record<string, string>, H: Record<string, number>, workFact: { l: Term; r: Term } | null): HTMLElement | null => {
    const c = m.config;
    const sec = h('div', { class: 'h3-sec h3-ctls' });
    const quick: [string, Term][] = workFact ? [['L', workFact.l], ['R', workFact.r]] : [];
    const knob = (name: string, p: Param, set: (p: Param) => void, portable = true) => sec.append(paramKnob(s, name, p, set, L, H, quick, portable));
    switch (c.kind) {
      case 'spool': knob('t', c.t, (t) => setCfg({ t })); break;
      case 'hopper': sec.append(paramKnob(s, 't', { k: 'knob', term: c.t }, (p) => setCfg({ t: p.k === 'knob' ? p.term : null }), L, H, quick, false)); break;
      case 'rewriter': {
        const r = c.recipe;
        if (!r) return null;
        if (r.k === 'insertPair') knob('x', r.x, (x) => setCfg({ recipe: { ...r, x } }));
        if (r.k === 'law' || r.k === 'routed') {
          sec.append(seg('direction', [['fwd', 'L → R'], ['rev', 'R → L']], c.dir, (dir) => setCfg({ dir })));
          const card = r.k === 'law' ? libCard(s, r.ref) : (res?.inputs['rule'] ? (res.inputs['rule'].k === 'card' ? res.inputs['rule'].card : res.inputs['rule'].k === 'fact' ? res.inputs['rule'].fact : null) : null);
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
            sec.append(h('div', { class: 'h3-ctl' }, h('span', { class: 'h3-ctl-k math', html: '<i>r</i> =' }), inp, h('span', { class: 'h3-dim' }, 'a positive whole number: x^r becomes r copies of x')));
          }
        }
        if (r.k === 'cancel' || r.k === 'law' || r.k === 'routed') sec.append(toggle('tidy', c.tidy, 'pop any e the rewrite leaves', (tidy) => setCfg({ tidy })));
        break;
      }
      case 'operator': {
        const r = c.recipe;
        if (r?.k === 'multiply') {
          sec.append(seg('side', [['left', '<i class="math">t</i>·L = <i class="math">t</i>·R'], ['right', 'L·<i class="math">t</i> = R·<i class="math">t</i>']], r.side, (side) => setCfg({ recipe: { ...r, side } })));
          knob('t', r.t, (t) => setCfg({ recipe: { ...r, t } }));
        }
        break;
      }
      case 'theorem': {
        const r = c.recipe;
        if (!r) return null;
        if (r.k === 'library' && r.ref.k === 'schema') {
          const sc = s.ctx.registry[r.ref.id];
          if (sc?.mirrorable && safe(() => hasDistinctMirror(sc.card), true)) sec.append(seg('hand', [['plain', esc(sc.name)], ['op', `${esc(sc.name)} ᵒᵖ`]], r.ref.mirror ? 'op' : 'plain', (v) => setCfg({ recipe: { k: 'library', ref: { ...r.ref as { k: 'schema'; id: string }, mirror: v === 'op' } }, choice: 0 })));
        }
        const card = (r.k === 'library' ? libCard(s, r.ref) : Object.values(res?.inputs ?? {}).find((v) => v?.k === 'card') && (Object.values(res!.inputs).find((v) => v?.k === 'card') as { card: Card }).card) as Card | null;
        if (card && (card.k === 'cond' || card.k === 'law')) {
          const inPrem = new Set(card.k === 'cond' ? card.premises.flatMap((p) => (p.k === 'eq' || p.k === 'neq' ? [...K.metasOf(p.l), ...K.metasOf(p.r)] : [])) : []);
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
        if (room) {
          const eq = room.kind === 'suppose' || (room.kind === 'assume' && room.rel !== 'neq');
          sec.append(h('div', { class: 'h3-roominfo', html: `Emits the room’s assumption <span class="math">${tH(room.l, L)} <span class="m-rel">${eq ? '=' : '≠'}</span> ${tH(room.r, L)}</span> to machines inside it. It is evidence only inside this room.` }));
        }
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
      if (t.k === 'pow') { for (const term of t.exp) for (const m of term.monomial) if (m.ref.k === 'zmeta') out.add(m.ref.id); walk(t.base); }
      else if (t.k === 'inv') walk(t.arg); else if (t.k === 'mul') t.fs.forEach(walk);
    };
    if (f && (f.k === 'law' || f.k === 'eq' || f.k === 'neq')) { walk(f.l); walk(f.r); }
    if (f && f.k === 'cond') { for (const p of f.premises) if (p.k === 'eq' || p.k === 'neq') { walk(p.l); walk(p.r); } if (f.concl.k === 'eq' || f.concl.k === 'neq') { walk(f.concl.l); walk(f.concl.r); } }
    return out;
  };
  const subs = (src: string) => src.replace(/_(\d+)/g, (_x, d: string) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''));
  /** An integer knob (a ℤ meta: an exponent): integer polynomials in ℤ Towers, validated by the kernel. */
  const intKnob = (s: S, name: string, p: Param, set: (p: Param) => void, L: Record<string, string>) => {
    const row = h('div', { class: 'h3-knob h3-intknob' });
    const label = h('span', { class: 'h3-knob-k math', html: `<i>${esc(name)}</i> :=` });
    const cur = p.k === 'knob' && p.term && p.term.k === 'int' ? safe(() => K.exponentText(p.term!.k === 'int' ? p.term!.val : [], L), '') : '';
    const input = h('input', { class: 'h3-term', value: cur, placeholder: 'an integer: 5, -1, 5k₁, n₁ + 1', 'aria-label': `integer ${name}`, autocomplete: 'off', spellcheck: 'false' });
    const view = h('span', { class: 'h3-knob-view math' });
    const msg = h('span', { class: 'h3-knob-msg' });
    let parsed: Term | null = p.k === 'knob' ? p.term : null;
    const update = () => {
      const src = input.value.trim();
      view.innerHTML = ''; msg.textContent = ''; input.classList.remove('bad');
      if (!src) { parsed = null; return; }
      const r = safe(() => K.parseInteger(subs(src), atomsAll(s)), { ok: false as const, error: 'integer entry is not ready' });
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
    if (!zs.length) chips.append(h('span', { class: 'h3-dim' }, 'a ℤ Tower (Let n₁ ∈ ℤ) makes an arbitrary integer'));
    update();
    row.append(h('div', { class: 'h3-knob-top' }, label, input, view), msg, chips);
    if (!parsed) row.classList.add('unset');
    return row;
  };

  // ───────── term knob: beads + typed parse, or "use a port" ─────────
  const paramKnob = (s: S, name: string, p: Param, set: (p: Param) => void, L: Record<string, string>, H: Record<string, number>, quick: [string, Term][], portable: boolean) => {
    const row = h('div', { class: `h3-knob${p.k === 'port' ? ' port' : ''}` });
    const label = h('span', { class: 'h3-knob-k math', html: `<i>${esc(name)}</i> :=` });
    if (p.k === 'port') {
      const back = h('button', { class: 'h3-tag' }, 'type it instead');
      back.addEventListener('click', () => set({ k: 'knob', term: null }));
      row.append(label, h('span', { class: 'h3-dim' }, `from a term belt into port ${name}`), back);
      return row;
    }
    const plainOf = (t: Term | null) => (t ? safe(() => K.termText(t, L), '') : '');
    const input = h('input', { class: 'h3-term', value: plainOf(p.term), placeholder: 'type ba, a^-1 … or tap beads', 'aria-label': `value of ${name}`, autocomplete: 'off', spellcheck: 'false' });
    const view = h('span', { class: 'h3-knob-view' });
    const msg = h('span', { class: 'h3-knob-msg' });
    let parsed: Term | null = p.term;
    const update = () => {
      const src = input.value.trim();
      view.innerHTML = ''; msg.textContent = ''; input.classList.remove('bad');
      if (!src) { parsed = null; return; }
      const src2 = src.replace(/_(\d+)/g, (_x, d: string) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''));
      const r = safe(() => K.parseTerm(src2, atomsAll(s)), { ok: false as const, error: 'term entry is not ready' });
      if (r.ok) { parsed = r.term; view.append(markVars(beadsInline(r.term, L, H), varIdsOf(s))); }
      else { parsed = null; msg.textContent = r.error; input.classList.add('bad'); }
    };
    const commit = () => {
      update();
      const same = JSON.stringify(parsed) === JSON.stringify(p.term);
      if (!same && (parsed || !input.value.trim())) set({ k: 'knob', term: parsed });
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); input.value = plainOf(p.term); update(); input.blur(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim() !== plainOf(p.term)) commit(); });
    const chips = h('div', { class: 'h3-chips' });
    const allA = atomsAll(s).filter((a) => (a as { sort?: string }).sort !== 'Z'); // ℤ Towers live in exponents, not as beads
    const chipTerms: Term[] = [...allA.map((a) => ({ k: 'atom', id: a.id } as Term)), ...allA.map((a) => ({ k: 'inv', arg: { k: 'atom', id: a.id } } as Term)), { k: 'e' }];
    const vset = varIdsOf(s);
    for (const t of chipTerms) {
      const isVar = (t.k === 'atom' && vset.has(t.id)) || (t.k === 'inv' && t.arg.k === 'atom' && vset.has(t.arg.id));
      const b = h('button', { class: `bn-chip h3-chip${isVar ? ' h3-var' : ''}`, title: `append ${plainOf(t)}${isVar ? ' (a Tower variable)' : ''}` });
      b.append(markVars(beadsInline(t, L, H), vset));
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => { input.value += plainOf(t); update(); commit(); });
      chips.append(b);
    }
    const bk = h('button', { class: 'bn-chip h3-chip txt', title: 'delete last' }, '⌫');
    bk.addEventListener('pointerdown', (e) => e.preventDefault());
    bk.addEventListener('click', () => { const v = input.value; input.value = v.endsWith('⁻¹') ? v.slice(0, -2) : v.slice(0, -1); update(); commit(); });
    chips.append(bk);
    for (const [q, t] of quick) {
      const b = h('button', { class: 'bn-chip h3-chip txt', title: `copy the incoming ${q === 'L' ? 'left' : 'right'} side (syntax only)` }, `= ${q}`);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', () => { input.value = plainOf(t); update(); commit(); });
      chips.append(b);
    }
    if (portable) {
      const port = h('button', { class: 'h3-tag', title: 'Add a term port and route a term belt into it' }, 'use a port');
      port.addEventListener('click', () => set({ k: 'port' }));
      chips.append(port);
    }
    update();
    row.append(h('div', { class: 'h3-knob-top' }, label, input, view), msg, chips);
    if (!p.term) row.classList.add('unset');
    return row;
  };

  // ───────── item views ─────────
  const itemView = (v: ItemValue, L: Record<string, string>, H: Record<string, number>) => {
    if (v.k === 'term') { const w = h('div', { class: 'h3-termview' }); w.append(markVars(beadsInline(v.term, L, H), varIdsOf(store.get()))); return w; }
    if (v.k === 'fact' && (v.fact.k === 'eq' || v.fact.k === 'neq')) return twin(v.fact, L, H, false).el;
    return h('div', { class: 'h3-bigmath math', html: itemHTML(v, L) });
  };

  const socketView = (s: S, socketId: string, arriving: ItemValue | undefined, L: Record<string, string>, H: Record<string, number>) => {
    const sk = s.level.sockets.find((x) => x.id === socketId);
    const info = s.compiled?.sockets?.[socketId];
    const delivered = s.run?.delivered?.[socketId];
    const sec = h('div', { class: 'h3-sec' });
    sec.append(h('div', { class: 'h3-label' }, h('span', {}, 'expected'), delivered !== undefined ? h('span', { class: 'h3-tag on sealed', html: '<span class="tomb"></span> delivered' }) : null));
    if (sk) sec.append(h('div', { class: 'h3-bigmath math', html: fH(sk.target, L) }));
    sec.append(h('div', { class: 'h3-label' }, 'arriving'));
    if (arriving) sec.append(itemView(arriving, L, H)); else sec.append(h('p', { class: 'h3-note' }, 'Nothing is routed here yet. Either orientation is accepted (the swap is recorded as symmetry).'));
    if (info && !info.ok && info.reason) sec.append(h('p', { class: 'h3-reason jammed', html: richHTML(info.reason, s.level) }));
    if (info?.ok && arriving) {
      const f = h('button', { class: 'lw-key small primary', title: 'Quiet everything else and annotate each step of this certificate' }, 'Follow this proof');
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
    let left = clamp(best.left, left0, right0 - w), top = clamp(best.top, top0, bottom0 - hh);
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
