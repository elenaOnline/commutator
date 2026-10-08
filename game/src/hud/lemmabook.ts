// COMMUTATOR v4 — the Lemma Book drawer (L): the player's own theorems, each re-verified from its saved
// proof on load. Clicking one arms a Rewriter (a law) or a Theorem (a conditional) with it as the recipe.
import type { LibRef } from '../factory/types';
import { armPreset, presetKey } from './presets';
import { LEVEL_BY_ID, fH, h, type S, type Store } from './util';

export function mountLemmaBook(layer: HTMLElement, store: Store, opts: { top: () => number }) {
  const el = h('aside', { class: 'h3-drawer-side h3-book', hidden: true, 'aria-label': 'Lemma Book' });
  layer.append(el);
  let lastKey = '';
  let confirmId = '';
  const render = (s: S) => {
    const open = s.ui.screen === 'floor' && !!s.ui.lemmaBookOpen;
    if (el.hidden === open) el.hidden = !open;
    if (!open) return;
    el.style.top = `${opts.top()}px`;
    const key = JSON.stringify([s.save.lemmas.map((l) => [l.id, l.verified, l.reason]), confirmId, s.level.id]);
    if (key === lastKey) return;
    lastKey = key;
    el.innerHTML = '';
    const close = h('button', { class: 'h3-x', 'aria-label': 'Close the Lemma Book (L)' }, '×');
    close.addEventListener('click', () => store.toggleLemmaBook(false));
    el.append(h('header', { class: 'h3-drawer-head' }, h('span', { class: 'h3-label' }, 'Lemma Book'), h('span', { class: 'h3-dim' }, 'theorems you proved, usable in every order'), h('span', { class: 'h3-flex' }), close));
    const list = h('div', { class: 'h3-book-list' });
    if (!s.save.lemmas.length) {
      list.append(h('p', { class: 'h3-note' }, 'Empty for now. Build a fact about Tower variables, feed it to a ∀ machine, and when its output says “Ready to save”, name it: it lands here and becomes a recipe in every later order.'));
    }
    for (const l of [...s.save.lemmas].sort((a, b) => b.savedAt - a.savedAt)) {
      const ok = l.verified !== false;
      const lv = LEVEL_BY_ID[l.levelId];
      const isCond = l.card.k === 'cond';
      const use = h('button', { class: 'lw-key small', disabled: !ok, title: ok ? `Arm a ${isCond ? 'Theorem' : 'Rewriter'} with this lemma as its recipe` : 'disabled until it verifies again' }, isCond ? 'Use in a Theorem' : 'Use in a Rewriter');
      use.addEventListener('click', () => {
        const ref: LibRef = { k: 'schema', id: l.id };
        const kind = isCond ? 'theorem' : 'rewriter';
        const recipe = isCond ? { k: 'library' as const, ref } : { k: 'law' as const, ref };
        armPreset(store, { key: presetKey(kind, recipe), kind, recipe, label: l.name, earned: true });
      });
      const rm = h('button', { class: `h3-tag${confirmId === l.id ? ' danger' : ''}`, title: 'Remove from the Lemma Book' }, confirmId === l.id ? 'remove — sure?' : 'remove');
      rm.addEventListener('click', () => {
        if (confirmId !== l.id) { confirmId = l.id; lastKey = ''; render(store.get()); return; }
        confirmId = ''; store.removeLemma(l.id);
      });
      list.append(h('div', { class: `h3-lemma${ok ? '' : ' off'}` },
        h('div', { class: 'h3-lemma-top' }, h('b', {}, l.name), ok ? h('span', { class: 'h3-badge-ok' }, 'verified') : h('span', { class: 'h3-badge-off' }, 'disabled')),
        h('div', { class: 'h3-lemma-stmt math', html: fH(l.card, {}) }),
        h('div', { class: 'h3-dim' }, `proven on ${lv ? `${lv.index} · ${lv.title}` : l.levelId}`),
        !ok && l.reason ? h('p', { class: 'h3-reason jammed' }, l.reason) : null,
        h('div', { class: 'h3-lemma-act' }, use, rm)));
    }
    el.append(list);
  };
  return { render, el };
}
