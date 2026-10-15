// COMMUTATOR — concept cards (review 2026-10, design/review-2026-10/): a calm card stack over the floor at level
// open (never over the hotbar), pages, and figures: laid-out maths with braces, rendered floor scenes with
// numbered notes, the looping Spool "gif", ℤₙ clocks, group tables and element orders. Body text comes before
// the figures; a figure never widens the card. Reopened from the order chip's "?" or from a lens / jam.
import './cards.css';
import type { AtomSpec, ConceptCard, Figure } from '../levels/cards';
import { ALL_CARDS as CARDS } from '../levels/campaigns';
import { reducedMotion } from '../ui/tokens';
import { campaignOf, displayNo, h, safe, type S, type Store } from './util';
import { mdHTML } from './figures/tex';
import { lettersOf } from './figures/terms';
import { mathFigure } from './figures/math';
import { clockFigure, groupByName, ordersFigure, tableFigure } from './figures/groups';

export { texHTML, mdHTML, mdInline } from './figures/tex';

// The scene glue composes the floor renderer; it loads lazily (like the floor itself), so a floor module
// mid-edit can never take the cards down with it.
type SceneMod = typeof import('./figures/scene');
let sceneMod: SceneMod | null = null;
let sceneLoad: Promise<SceneMod> | null = null;
const loadScenes = () => (sceneLoad ??= import('./figures/scene').then((m) => (sceneMod = m)));

/** The letters a figure draws: its own illustrative atoms, else the level's. */
const atomsFor = (s: S, own?: AtomSpec[]): AtomSpec[] => own ?? s.level.atoms.map((a) => ({ id: a.id, label: a.label, hue: a.hue }));
const isReduced = (s: S) => reducedMotion() || !!s.save.settings.reducedMotion;

function figureEl(s: S, f: Figure): HTMLElement | null {
  switch (f.k) {
    case 'math': return mathFigure(f.rows, lettersOf(atomsFor(s, f.atoms)), f.caption);
    case 'clock': return clockFigure(f.n);
    case 'table': { const G = groupByName(f.group); return G ? tableFigure(G) : null; }
    case 'orders': { const G = groupByName(f.group); return G ? ordersFigure(G) : null; }
    case 'scene': case 'gif': {
      const lt = lettersOf(f.k === 'gif' ? [{ id: 'c', label: 'c', hue: 2 }] : atomsFor(s, f.atoms));
      const make = (m: SceneMod) => (f.k === 'gif' ? m.spoolGif(s.ctx, lt, isReduced(s)) : m.sceneFigure(f.spec, s.ctx, lt));
      if (sceneMod) return make(sceneMod);
      const slot = h('figure', { class: 'cc-fig cc-pending' });
      void loadScenes().then((m) => { const el = safe(() => make(m), null); if (el) slot.replaceWith(el); else slot.remove(); }).catch(() => slot.remove());
      return slot;
    }
  }
  return null;
}

export const cardsFor = (levelId: string): ConceptCard[] => CARDS[levelId] ?? [];

/** Open the current level's card that best explains a machine kind / word (jam and lens "?" links). */
export function openConceptFor(store: Store, kindOrWord: string, text?: string) {
  const cs = cardsFor(store.get().level.id);
  if (!cs.length) return;
  const w = kindOrWord.toLowerCase();
  let i = cs.findIndex((c) => c.machines?.some((m) => m === w || m.startsWith(`${w}:`)));
  if (i < 0) i = cs.findIndex((c) => `${c.title} ${c.body ?? ''}`.toLowerCase().includes(w));
  if (i < 0 && text) { const t = text.toLowerCase(); i = cs.findIndex((c) => c.title.toLowerCase().split(/\W+/).some((x) => x.length > 4 && t.includes(x))); }
  store.openCards(Math.max(0, i));
}

export function mountConcepts(layer: HTMLElement, store: Store) {
  const el = h('section', { class: 'h3-cards cc', hidden: true, role: 'dialog', 'aria-label': 'Concept cards' });
  layer.append(el);
  void loadScenes().catch(() => undefined);
  let lastKey = '';
  const render = (s: S) => {
    const cs = cardsFor(s.level.id);
    const open = s.ui.screen === 'floor' && !!s.ui.cards?.open && cs.length > 0 && !s.ui.ceremony;
    if (!open) { if (!el.hidden) { el.hidden = true; el.replaceChildren(); lastKey = ''; } return; }
    const page = Math.max(0, Math.min(cs.length - 1, s.ui.cards.page));
    const key = `${s.level.id}|${page}|${isReduced(s) ? 'r' : ''}`;
    el.hidden = false;
    if (key === lastKey) return;
    lastKey = key;
    const c = cs[page]!;
    el.replaceChildren();
    el.scrollTop = 0;
    const close = h('button', { class: 'cc-x', 'aria-label': 'Close the cards (Esc)' }, '×');
    close.addEventListener('click', () => store.closeCards());
    el.append(h('header', { class: 'cc-head' }, h('span', { class: 'cc-label' }, `${campaignOf(s.level) === 'book' ? displayNo(s.level) : s.level.index} · ${s.level.title}`), h('span', { class: 'cc-flex' }), h('span', { class: 'cc-count' }, `${page + 1} / ${cs.length}`), close));
    el.append(h('h2', { class: 'cc-title' }, c.title));
    if (c.body) el.append(h('div', { class: `cc-body${c.long ? ' long' : ''}`, html: mdHTML(c.body) }));
    const figs = (c.figures ?? []).map((f) => safe(() => figureEl(s, f), null)).filter((x): x is HTMLElement => !!x);
    if (figs.length) el.append(h('div', { class: 'cc-figs' }, ...figs));
    const parts: [string, string | undefined, string][] = [['Worked example', c.example, 'ex'], ['Near miss', c.nearMiss, 'nm'], ['On the floor', c.gesture, 'ge']];
    const extra = h('div', { class: 'cc-parts' });
    for (const [label, text, cls] of parts) if (text) extra.append(h('div', { class: `cc-part ${cls}` }, h('span', { class: 'cc-part-k' }, label), h('div', { html: mdHTML(text) })));
    if (extra.childElementCount) el.append(extra);
    const prev = h('button', { class: 'cc-btn', disabled: page === 0 }, '← Back');
    const next = h('button', { class: 'cc-btn primary' }, page < cs.length - 1 ? 'Next →' : 'Start building');
    prev.addEventListener('click', () => store.setCardPage(page - 1));
    next.addEventListener('click', () => (page < cs.length - 1 ? store.setCardPage(page + 1) : store.closeCards()));
    const dots = h('span', { class: 'cc-dots' });
    cs.forEach((_, i) => { const d = h('button', { class: `cc-dot${i === page ? ' on' : ''}`, 'aria-label': `card ${i + 1}` }); d.addEventListener('click', () => store.setCardPage(i)); dots.append(d); });
    el.append(h('footer', { class: 'cc-foot' }, prev, dots, h('span', { class: 'cc-flex' }), h('span', { class: 'cc-hint' }, 'Enter or Esc closes · ← → pages'), next));
  };
  // While open: Esc / Enter close, arrows page. Everything else (Q, hotkeys) passes to the floor.
  window.addEventListener('keydown', (e) => {
    if (el.hidden) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea')) return;
    const s = store.get();
    const n = cardsFor(s.level.id).length;
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); store.closeCards(); }
    else if (e.key === 'ArrowRight' && s.ui.cards.page < n - 1) { e.preventDefault(); e.stopImmediatePropagation(); store.setCardPage(s.ui.cards.page + 1); }
    else if (e.key === 'ArrowLeft' && s.ui.cards.page > 0) { e.preventDefault(); e.stopImmediatePropagation(); store.setCardPage(s.ui.cards.page - 1); }
  }, true);
  return { render, el };
}
