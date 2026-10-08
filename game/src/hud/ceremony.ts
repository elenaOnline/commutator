// LEMMA WORKS v3 — the QED ceremony (adapted from shell/ceremony.ts): the dock seals, the floor holds a
// beat, ∎ stamps in, the specific statement retypesets as "Lemma n. For all …", and any earned machine
// card flies into the hotbar. Then: Next work order. Click or Esc skips to the end state.
import { reducedMotion } from '../ui/tokens';
import * as F from '../factory';
import type { Card, LevelManifest } from '../kernel/types';
import { LEVELS, LEVEL_BY_ID, REGISTRY, fH, h, isSolved, labels, nextLevel, safe, schemaNames, statementOf, tH, towerVars, type S, type Store } from './util';

const HOLD_MS = 650;
/** Names the content expects the player to save under (T01 cites "the lemma you saved"). */
const SUGGESTED: Record<string, string> = { S01: 'Double Flip' };

/** The order's claim with its hypotheses, for level-constant orders: "If ab = e, then b = a⁻¹." */
function conditionalHTML(lv: LevelManifest): string {
  const L = labels(lv);
  const allowed = new Set(lv.sockets.flatMap((k) => k.allowedGivens));
  const gs = lv.givens.filter((g) => allowed.has(g.id));
  const size = gs.find((g) => g.fact.k === 'size');
  const hyps = gs.filter((g) => g.fact.k !== 'size').map((g) => `<span class="math">${fH(g.fact, L)}</span>`);
  const goals = lv.sockets.map((k) => `<span class="math">${fH(k.target, L)}</span>`).join(' and ');
  const pre = size && size.fact.k === 'size' ? `In a group of order ${size.fact.n}, ` : '';
  if (!hyps.length) return `${pre}${goals}.`.replace(/^./, (c) => c.toUpperCase());
  return `${pre}${pre ? 'if' : 'If'} ${hyps.join(' and ')}, then ${goals}.`;
}
const hasCardGoal = (lv: LevelManifest) => lv.sockets.some((k) => k.target.k === 'law' || k.target.k === 'cond');
/** The ∀ / gate machine whose output the Lemma Book could take (the one feeding a dock first). */
function savableOf(s: S): { machine: string; card: Card } | null {
  const feeding = Object.values(s.compiled?.sockets ?? {}).map((x) => x.by).filter(Boolean) as string[];
  const ms = s.canvas.machines.filter((m) => m.kind === 'forall' || m.kind === 'gate').sort((a, b) => Number(feeding.includes(b.id)) - Number(feeding.includes(a.id)));
  for (const m of ms) {
    const r = safe(() => F.lemmaFrom(s.compiled, s.canvas, m.id, s.ctx), null);
    if (r?.ok) return { machine: m.id, card: r.card };
  }
  return null;
}

export function mountCeremony(layer: HTMLElement, store: Store, hooks: { dest: () => DOMRect | null }) {
  const el = h('div', { class: 'lw-ceremony h3-ceremony', hidden: true });
  layer.append(el);
  let playingFor: string | null = null;
  let timers: number[] = [];
  let finishNow: (() => void) | null = null;
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  /** The saved theorem's plate travels to the Lemma Book (Astra's delight: "I manufactured my own tool"). */
  const flyPlate = (plate: HTMLElement) => {
    const dest = (document.querySelector('.h3-run .h3-tog[data-count]') as HTMLElement | null)?.getBoundingClientRect() ?? hooks.dest();
    if (!dest || reducedMotion()) return;
    const r = plate.getBoundingClientRect();
    const clone = plate.cloneNode(true) as HTMLElement;
    clone.classList.add('qed-clone');
    Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    document.body.append(clone);
    const dx = dest.left + dest.width / 2 - (r.left + r.width / 2), dy = dest.top + dest.height / 2 - (r.top + r.height / 2);
    const a = clone.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.14)`, opacity: 0.8 }], { duration: 700, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
    a.onfinish = () => { clone.remove(); const b = document.querySelector('.h3-run .h3-tog[data-count]'); b?.classList.add('h3-landed'); setTimeout(() => b?.classList.remove('h3-landed'), 900); };
    setTimeout(() => clone.remove(), 1600);
  };
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
    const cardGoal = hasCardGoal(lv);
    const cond = conditionalHTML(lv);
    const specific = h('div', { class: 'qed-specific', html: cardGoal ? `<span class="math">${st.plainHTML}</span>` : cond });
    const lemma = h('div', { class: 'qed-lemma' }, h('span', { class: 'qed-lemma-no' }, `Lemma ${lv.index}.`), ' ', h('span', { class: 'qed-lemma-st', html: cardGoal ? st.html : cond }));
    // "arbitrary" is said only of Tower variables; level constants a, b are particular elements
    const s0 = store.get();
    const tv = towerVars(s0).map((v) => tH({ k: 'atom', id: v.id }, Object.fromEntries(towerVars(s0).map((w) => [w.id, w.label]))));
    const note = h('div', { class: 'qed-note', html: cardGoal
      ? (tv.length ? `Since <span class="math">${tv.join(', ')}</span> ${tv.length > 1 ? 'were' : 'was'} arbitrary, the law holds for every choice: it is now a theorem.` : 'It holds in every group: it is now a theorem.')
      : 'Proven for these particular elements, from these hypotheses. To make it a law for every element, build it with Towers and a ∀ machine.' });
    // the Lemma Book, right here: a savable card on the floor is offered with a name
    const sv = savableOf(s0);
    let saveRow: HTMLElement | null = null;
    if (sv) {
      const already = s0.save.lemmas.some((l) => JSON.stringify(l.card) === JSON.stringify(sv.card));
      const suggested = SUGGESTED[lv.id] ?? (lv.unlocks.map((u) => REGISTRY[u]?.name).find(Boolean)) ?? lv.title;
      const plate = h('div', { class: 'qed-plate' }, h('span', { class: 'machine-band' }), h('span', { class: 'qed-m-kicker' }, already ? 'In your Lemma Book' : 'Your own theorem'), h('span', { class: 'machine-stmt math', html: fH(sv.card, {}) }));
      if (already) saveRow = h('div', { class: 'qed-save' }, plate);
      else {
        const name = h('input', { class: 'h3-term qed-name', value: suggested, 'aria-label': 'name for the Lemma Book', autocomplete: 'off', spellcheck: 'false' });
        const btn = h('button', { class: 'lw-key primary' }, 'Save to Lemma Book');
        const doSave = () => {
          const r = store.saveLemma(sv.machine, name.value.trim() || suggested);
          if (!r.ok) return;
          btn.textContent = 'Saved ✓'; btn.disabled = true; name.disabled = true;
          plate.querySelector('.qed-m-kicker')!.textContent = `${name.value.trim() || suggested} · in your Lemma Book`;
          flyPlate(plate);
        };
        btn.addEventListener('click', doSave);
        name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
        saveRow = h('div', { class: 'qed-save' }, plate, h('div', { class: 'qed-save-form' }, name, btn), h('div', { class: 'qed-save-note' }, 'Saved, it becomes a recipe in every later order.'));
      }
    }
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
    const card = h('div', { class: 'qed-card', role: 'dialog', 'aria-modal': 'true', tabindex: -1, 'aria-label': `Proven: Lemma ${lv.index}` }, seal, specific, lemma, note, receipt, machines, saveRow, ending, actions);

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
    if ((e.target as HTMLElement | null)?.closest?.('.qed-save input') && e.key !== 'Escape' && e.key !== 'Tab') return; // typing a name
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (finishNow) finishNow(); else if (el.classList.contains('done')) close(); return; } // 1st Esc: skip to the end · on the end state: Keep refining
    if (e.key === 'Tab' && el.classList.contains('done')) { // keep focus inside the card's actions
      const bs = [...el.querySelectorAll<HTMLElement>('.qed-save input:not(:disabled), .qed-save button:not(:disabled), .qed-actions button')];
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
    const btn = t?.closest?.('.qed-actions button, .qed-save button, .qed-save input');
    const ok = !!btn && el.contains(btn) && el.classList.contains('done') && performance.now() >= armedAt;
    if (!ok) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup']) window.addEventListener(type, swallow, true);
  window.addEventListener('wheel', (e) => { if (capturing && !el.hidden) { e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true, passive: false });
  // a ceremony belongs to its level: navigating away ends it
  store.on((e) => { if (e.type === 'level-opened' && !el.hidden) close(); });

  let deferred = false;
  const render = (s: S) => {
    let c = s.ui.ceremony;
    if (!capturing && !el.hidden) close(); // watchdog: a visible layer without a live ceremony never lingers
    // ui.ceremony is the single source of truth: cleared by ANY path → the layer and its capture go at once
    if (!c && (capturing || !el.hidden)) { close(); return; }
    if (s.ui.screen !== 'floor') { if (!el.hidden) close(); return; }
    if (c && c.levelId !== s.level.id) { queueMicrotask(() => store.clearCeremony()); c = null; } // never level X's ceremony on level Y
    const key = c ? `${c.levelId}:${c.unlocked.join(',')}` : null;
    if (c && key !== playingFor) {
      // never steal an in-progress save: wait while the lens's lemma-name field has the keyboard
      const typing = document.activeElement as HTMLElement | null;
      if (typing?.matches?.('.h3-lname')) {
        if (!deferred) {
          deferred = true;
          typing.addEventListener('focusout', () => setTimeout(() => { deferred = false; render(store.get()); }, 350), { once: true });
        }
        return;
      }
      playingFor = key; play(c.levelId, c.unlocked);
    }
    if (!el.hidden && playingFor && s.level.id !== playingFor.split(':')[0]) close();
  };
  return render;
}
