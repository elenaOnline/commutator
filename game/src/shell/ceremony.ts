// LEMMA WORKS — the QED ceremony as one continuous delivery event:
// the board finishes its last move (stamp ≈300 ms, or the room's clash collapse ≈900 ms),
// the socket seals, the finished factory holds ≈250 ms, THEN the theorem unfolds and any
// earned machine flies (as a disposable clone) to the toolbox's "earned" receipt, which pulses.
import type { State, Store, StoreEvent } from '../state/store';
import type { ProofNode } from '../kernel/types';
import { reducedMotion } from '../ui/tokens';
import { boardSettled } from '../board';
import { cardHTML, nextOrderButton } from './panels';
import { LEVEL_BY_ID, LEVELS, REGISTRY, h, isSolved, nextLevel, schemaNames, statementOf } from './util';

const STAMP_MS = 300, SETTLE_TIMEOUT_MS = 1200, HOLD_MS = 250;

export interface CeremonyHooks {
  /** The toolbox's earned-machines receipt (flight destination). */
  receipt: () => HTMLElement | null;
  /** Called when the ceremony is dismissed or skipped to its end (e.g. reveal the transcript's last line). */
  onDone?: () => void;
}

export function mountCeremony(el: HTMLElement, store: Store, hooks: CeremonyHooks): (s: State) => void {
  el.className = 'lw-ceremony';
  el.hidden = true;
  let playingFor: string | null = null;
  let timers: number[] = [];
  let finishNow: (() => void) | null = null;
  let playToken = 0;
  const safeSettled = () => { try { return boardSettled(); } catch { return Promise.resolve(); } };
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  // remember what the solving commit did on the board (events arrive in the same tick)
  let recent: { t: number; closedRoom: boolean } = { t: 0, closedRoom: false };
  store.on((e: StoreEvent) => {
    const now = performance.now();
    if (now - recent.t > 60) recent = { t: now, closedRoom: false };
    if (e.type === 'room-closed') recent.closedRoom = true;
    if (e.type === 'nodes-added') {
      const g = store.get().graph;
      if (e.ids.some((id) => (g.nodes.find((n) => n.id === id) as ProofNode | undefined)?.k === 'exit')) recent.closedRoom = true;
    }
  });

  const close = () => { playToken++; clear(); el.hidden = true; el.innerHTML = ''; el.classList.remove('waiting', 'done'); playingFor = null; finishNow = null; hooks.onDone?.(); };

  const play = (levelId: string, unlocked: string[]) => {
    clear();
    const lv = LEVEL_BY_ID[levelId]!;
    const st = statementOf(lv, { any: true });
    const reduced = reducedMotion() || store.get().save.settings.reducedMotion;
    el.innerHTML = '';
    el.classList.remove('done');
    const seal = h('div', { class: 'qed-seal', 'aria-hidden': 'true' });
    const specific = h('div', { class: 'qed-specific math', html: st.plainHTML });
    const lemma = h('div', { class: 'qed-lemma' }, h('span', { class: 'qed-lemma-no' }, `Lemma ${lv.index}.`), ' ', h('span', { class: 'qed-lemma-st', html: st.html }));
    const note = h('div', { class: 'qed-note' }, 'Since the letters were arbitrary, the proof holds for every choice: the statement is now a theorem.');
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
        h('span', { class: 'machine-stmt math', html: cardHTML(sc.card) }),
        h('span', { class: 'qed-m-mirror' }, sc.mirrorable ? 'with its mirror image ᵒᵖ · in your toolbox from the next work order' : 'in your toolbox from the next work order')));
    }
    const save = store.get().save;
    const mainLeft = LEVELS.filter((l) => !l.side && !isSolved(save, l.id)).length;
    const ending = !lv.side && mainLeft === 0
      ? h('div', { class: 'qed-ending' }, `That completes the campaign: ${LEVELS.filter((l) => isSolved(save, l.id)).length} theorems proven, every one checked down to the axioms.`)
      : null;
    const actions = h('div', { class: 'qed-actions' });
    const nx = nextLevel(save, levelId);
    const nextBtn = nextOrderButton(store);
    if (!nx) nextBtn.textContent = 'See your theorem map →';
    const mapBtn = h('button', { class: 'lw-key' }, 'Theorem map');
    mapBtn.addEventListener('click', () => { close(); store.openMap(); });
    const stay = h('button', { class: 'lw-key' }, 'Keep refining');
    stay.title = 'Stay on this level and chase par';
    stay.addEventListener('click', close);
    nextBtn.addEventListener('click', () => { clear(); el.hidden = true; el.innerHTML = ''; playingFor = null; finishNow = null; });
    actions.append(nextBtn, mapBtn, stay);
    const skip = h('div', { class: 'qed-skip' }, 'click or press Esc to skip');
    const card = h('div', { class: 'qed-card', role: 'dialog', 'aria-label': `Proven: Lemma ${lv.index}` }, seal, specific, lemma, note, machines, ending, actions);

    let flown = false;
    const fly = (instant: boolean) => {
      if (flown) return;
      flown = true;
      const dest = hooks.receipt();
      const ms = [...machines.querySelectorAll<HTMLElement>('.qed-machine')];
      if (!dest || !ms.length) return;
      const land = () => {
        dest.classList.remove('pulse'); void dest.offsetWidth; dest.classList.add('pulse');
        dest.dataset.pending = '0';
        dest.dispatchEvent(new CustomEvent('lw-receipt-land'));
      };
      if (instant) { land(); return; }
      const dr = dest.getBoundingClientRect();
      for (const m of ms) {
        const r = m.getBoundingClientRect();
        const clone = m.cloneNode(true) as HTMLElement;
        clone.classList.add('qed-clone');
        Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        document.body.append(clone);
        const dx = dr.left + dr.width / 2 - (r.left + r.width / 2), dy = dr.top + dr.height / 2 - (r.top + r.height / 2);
        const anim = clone.animate(
          [{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.18)`, opacity: 0.85 }],
          { duration: 620, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
        anim.onfinish = () => { clone.remove(); land(); };
        timers.push(window.setTimeout(() => clone.remove(), 1400));   // never let a clone linger
      }
      m0Stamp(ms);
    };
    const m0Stamp = (ms: HTMLElement[]) => ms.forEach((m) => m.classList.add('awarded'));

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
      requestAnimationFrame(() => nextBtn.focus({ preventScroll: true }));
    };
    finishNow = finish;
    el.onclick = (e) => { if (!el.classList.contains('done') && !(e.target as HTMLElement | null)?.closest?.('button')) finish(); };
    el.append(card, skip);
    if (unlocked.length) { const d = hooks.receipt(); if (d) d.dataset.pending = String(unlocked.length); }

    if (reduced) { finish(); return; }
    // 1. let the board finish (clash collapse, socket seal: the board's settle promise, with a
    //    timeout fallback and at least one station stamp), then hold the finished factory
    el.hidden = false;
    el.classList.add('waiting');   // transparent, click-through; Esc still skips
    const token = ++playToken;
    const settled = new Promise<void>((res) => {
      // the board registers its animations from the same commit's events: ask on the next task
      window.setTimeout(() => { safeSettled().then(res); }, 0);
      timers.push(window.setTimeout(res, SETTLE_TIMEOUT_MS));
    });
    const minStamp = new Promise<void>((res) => timers.push(window.setTimeout(res, recent.closedRoom ? 0 : STAMP_MS)));
    void Promise.all([settled, minStamp]).then(() => { if (token === playToken && finishNow === finish) later(HOLD_MS, unfold); });
    const unfold = () => {
      el.classList.remove('waiting');
      requestAnimationFrame(() => card.classList.add('s1'));   // seal stamps in
      later(650, () => card.classList.add('s2'));              // retypeset as a Lemma
      if (unlocked.length) {
        later(1250, () => card.classList.add('s3'));           // machine card appears
        later(1900, () => fly(false));                         // a clone flies to the receipt
        later(2650, finish);
      } else later(1500, finish);
    };
  };

  window.addEventListener('keydown', (e) => {
    if (el.hidden || e.key !== 'Escape') return;
    // Esc skips to the ceremony's end state; it never removes the way forward
    e.preventDefault(); e.stopImmediatePropagation();
    if (finishNow) finishNow();
  }, true);

  return (s: State) => {
    const c = s.ui.ceremony;
    if (s.ui.screen !== 'level') { if (!el.hidden) close(); return; }
    // a re-solve of the level whose ceremony is already on screen must not restart it (or drop its award)
    if (c && !el.hidden && playingFor && playingFor.split(':')[0] === c.levelId && !c.unlocked.length) { store.clearCeremony(); return; }
    if (c && playingFor !== c.levelId + ':' + c.unlocked.join(',')) {
      playingFor = c.levelId + ':' + c.unlocked.join(',');
      play(c.levelId, c.unlocked);
    }
    if (!el.hidden && !c && s.level.id !== (playingFor ?? '').split(':')[0]) close();
  };
}
