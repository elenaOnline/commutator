// LEMMA WORKS v3 — the QED ceremony (adapted from shell/ceremony.ts): the dock seals, the floor holds a
// beat, ∎ stamps in, the specific statement retypesets as "Lemma n. For all …", and any earned machine
// card flies into the hotbar. Then: Next work order. Click or Esc skips to the end state.
import { reducedMotion } from '../ui/tokens';
import { LEVELS, LEVEL_BY_ID, REGISTRY, fH, h, isSolved, nextLevel, safe, schemaNames, statementOf, type S, type Store } from './util';

const HOLD_MS = 650;

export function mountCeremony(layer: HTMLElement, store: Store, hooks: { dest: () => DOMRect | null }) {
  const el = h('div', { class: 'lw-ceremony h3-ceremony', hidden: true });
  layer.append(el);
  let playingFor: string | null = null;
  let timers: number[] = [];
  let finishNow: (() => void) | null = null;
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  /** Ends the ceremony completely: no capture, no layer, no receipt, no flying clone left behind. */
  const close = () => {
    clear(); capturing = false;
    el.hidden = true; el.innerHTML = ''; el.onclick = null; el.classList.remove('waiting', 'done');
    document.querySelectorAll('.qed-clone').forEach((c) => c.remove());
    playingFor = null; finishNow = null;
    if (store.get().ui.ceremony) store.clearCeremony();
  };
  let capturing = false;

  const play = (levelId: string, unlocked: string[]) => {
    clear();
    capturing = true;
    const lv = LEVEL_BY_ID[levelId]!;
    const st = statementOf(lv, { any: true });
    const reduced = reducedMotion() || store.get().save.settings.reducedMotion;
    el.innerHTML = '';
    el.classList.remove('done');
    const seal = h('div', { class: 'qed-seal', 'aria-hidden': 'true' });
    const specific = h('div', { class: 'qed-specific math', html: st.plainHTML });
    const lemma = h('div', { class: 'qed-lemma' }, h('span', { class: 'qed-lemma-no' }, `Lemma ${lv.index}.`), ' ', h('span', { class: 'qed-lemma-st', html: st.html }));
    const note = h('div', { class: 'qed-note' }, 'Since the letters were arbitrary, the factory works for every choice: the statement is now a theorem.');
    const machines = h('div', { class: 'qed-machines' });
    for (const id of unlocked) {
      const sc = REGISTRY[id];
      if (!sc) continue;
      const nm = schemaNames(id);
      machines.append(h('div', { class: 'qed-machine', 'data-schema': id },
        h('span', { class: 'machine-band' }),
        h('span', { class: 'qed-m-kicker' }, 'New machine'),
        h('span', { class: 'machine-name' }, nm.name),
        h('span', { class: 'machine-tb' }, `Lemma ${lv.index} · ${nm.textbook}`),
        h('span', { class: 'machine-stmt math', html: fH(sc.card, {}).replace(/^∀[^.]*\.&ensp;/, '') }),
        h('span', { class: 'qed-m-mirror' }, sc.mirrorable ? 'with its mirror image ᵒᵖ · on your hotbar from the next work order' : 'on your hotbar from the next work order')));
    }
    const save = store.get().save;
    const mainLeft = LEVELS.filter((l) => !l.side && !isSolved(save, l.id)).length;
    const ending = !lv.side && mainLeft === 0
      ? h('div', { class: 'qed-ending' }, `That completes the campaign: ${LEVELS.filter((l) => isSolved(save, l.id)).length} theorems proven, every one checked down to the axioms.`)
      : null;
    // the factory as it stood when the dock sealed (not the best ever, not after later edits)
    const m = safe(() => store.metrics(), null) ?? store.get().save.levels[levelId]?.best ?? null;
    const receipt = m ? h('div', { class: 'h3-receipt' }, `${m.machines} machine${m.machines === 1 ? '' : 's'} · area ${m.area} · ${m.cycles ?? '—'} cycles`) : null;
    const actions = h('div', { class: 'qed-actions' });
    const nx = nextLevel(save, levelId);
    const nextBtn = h('button', { class: 'lw-key primary wide' }, nx ? 'Next work order →' : 'See your theorem map →');
    nextBtn.addEventListener('click', () => { close(); if (nx) store.openLevel(nx.id); else store.openMap(); });
    const proof = h('button', { class: 'lw-key' }, 'See the proof');
    proof.addEventListener('click', () => { close(); store.setUI({ transcriptOpen: true }); });
    const stay = h('button', { class: 'lw-key' }, 'Keep refining');
    stay.title = 'Stay on this floor and chase a smaller factory';
    stay.addEventListener('click', close);
    const follow = h('button', { class: 'lw-key' }, 'Follow it on the floor');
    follow.title = 'Quiet everything else and annotate each machine of the delivered proof';
    follow.addEventListener('click', () => { close(); store.setUI({ follow: lv.sockets[0]?.id ?? null, transcriptOpen: false }); });
    actions.append(nextBtn, follow, proof, stay);
    const skip = h('div', { class: 'qed-skip' }, 'click or press Esc to skip');
    const card = h('div', { class: 'qed-card', role: 'dialog', 'aria-modal': 'true', tabindex: -1, 'aria-label': `Proven: Lemma ${lv.index}` }, seal, specific, lemma, note, receipt, machines, ending, actions);

    let flown = false;
    const fly = (instant: boolean) => {
      if (flown) return;
      flown = true;
      const ms = [...machines.querySelectorAll<HTMLElement>('.qed-machine')];
      ms.forEach((x) => x.classList.add('awarded'));
      const dr = hooks.dest();
      if (!dr || !ms.length || instant) return;
      for (const mm of ms) {
        const r = mm.getBoundingClientRect();
        const clone = mm.cloneNode(true) as HTMLElement;
        clone.classList.add('qed-clone');
        Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        document.body.append(clone);
        const dx = dr.left + dr.width / 2 - (r.left + r.width / 2), dy = dr.top + dr.height / 2 - (r.top + r.height / 2);
        const anim = clone.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.16)`, opacity: 0.85 }], { duration: 640, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
        anim.onfinish = () => { clone.remove(); document.querySelector('.h3-hotbar')?.classList.add('h3-landed'); setTimeout(() => document.querySelector('.h3-hotbar')?.classList.remove('h3-landed'), 900); };
        timers.push(window.setTimeout(() => clone.remove(), 1500));
      }
    };
    const finish = () => {
      clear();
      el.classList.remove('waiting');
      el.hidden = false;
      el.classList.add('done');
      card.classList.add('s1', 's2', 's3');
      skip.remove();
      fly(true);
      if (store.get().ui.ceremony) store.clearCeremony();
      finishNow = null;
      armedAt = performance.now() + 450; // a click aimed at the floor must not land on a button that just appeared
      requestAnimationFrame(() => card.focus({ preventScroll: true }));
    };
    finishNow = finish;
    el.onclick = null;
    armedAt = Infinity;
    el.append(card, skip);
    if (reduced) { finish(); return; }
    // the floor finishes the delivery (transparent, click-through), then the theorem unfolds
    el.hidden = false;
    el.classList.add('waiting'); // transparent while the dock seals, but it still holds every input
    later(HOLD_MS, () => {
      el.classList.remove('waiting');
      requestAnimationFrame(() => card.classList.add('s1'));
      later(650, () => card.classList.add('s2'));
      if (unlocked.length) { later(1250, () => card.classList.add('s3')); later(1900, () => fly(false)); later(2650, finish); }
      else later(1500, finish);
    });
  };

  // While the ceremony is up it owns all input: nothing reaches the floor or the HUD behind it.
  let armedAt = Infinity;
  window.addEventListener('keydown', (e) => {
    if (!capturing || el.hidden) return;
    const onButton = (e.target as HTMLElement | null)?.closest?.('.qed-actions button');
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (finishNow) finishNow(); else if (el.classList.contains('done')) close(); return; } // 1st Esc: skip to the end · on the end state: Keep refining
    if (e.key === 'Tab' && el.classList.contains('done')) { // keep focus inside the card's actions
      const bs = [...el.querySelectorAll<HTMLButtonElement>('.qed-actions button')];
      const i = bs.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault(); e.stopImmediatePropagation();
      bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length]?.focus();
      return;
    }
    if (onButton && (e.key === 'Enter' || e.key === ' ') && el.classList.contains('done') && performance.now() >= armedAt) { e.stopImmediatePropagation(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keyup', (e) => { if (capturing && !el.hidden) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  const swallow = (e: Event) => {
    if (!capturing || el.hidden) return;
    const t = e.target as HTMLElement | null;
    const btn = t?.closest?.('.qed-actions button');
    const ok = !!btn && el.contains(btn) && el.classList.contains('done') && performance.now() >= armedAt;
    if (!ok) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup']) window.addEventListener(type, swallow, true);
  window.addEventListener('wheel', (e) => { if (capturing && !el.hidden) { e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true, passive: false });
  // a ceremony belongs to its level: navigating away ends it
  store.on((e) => { if (e.type === 'level-opened' && !el.hidden) close(); });

  return (s: S) => {
    let c = s.ui.ceremony;
    if (!capturing && !el.hidden) close(); // watchdog: a visible layer without a live ceremony never lingers
    if (s.ui.screen !== 'floor') { if (!el.hidden) close(); return; }
    if (c && c.levelId !== s.level.id) { queueMicrotask(() => store.clearCeremony()); c = null; } // never level X's ceremony on level Y
    const key = c ? `${c.levelId}:${c.unlocked.join(',')}` : null;
    if (c && key !== playingFor) { playingFor = key; play(c.levelId, c.unlocked); }
    if (!el.hidden && playingFor && s.level.id !== playingFor.split(':')[0]) close();
  };
}
