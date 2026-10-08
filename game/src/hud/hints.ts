// LEMMA WORKS v3 — onboarding: three one-line floating hints for First Light, each near the thing it
// names. They advance on what the player actually built, never block the floor (pointer-events: none),
// and can be skipped.
import type { Canvas } from '../factory/types';
import type { MachineKind } from '../factory/types';
import { h, machineRect, type S, type Store } from './util';

interface Hint { text: (s: S) => string; anchor: 'slot' | 'spool' | 'socket'; done: (c: Canvas) => boolean }

const players = (c: Canvas, kind: MachineKind) => c.machines.filter((m) => m.kind === kind && !m.locked);
const fedBy = (c: Canvas, toKind: MachineKind, fromKind: MachineKind) => c.belts.some((b) => {
  const to = c.machines.find((m) => m.id === b.to.m), from = c.machines.find((m) => m.id === b.from.m);
  return to?.kind === toKind && from?.kind === fromKind;
});

const HINTS: Record<string, Hint[]> = {
  L01: [
    { anchor: 'slot', done: (c) => players(c, 'canceller').length > 0,
      text: (s) => (s.ui.tool.k === 'place' && s.ui.tool.kind === 'canceller' ? 'Click the floor between the spool and the dock' : 'Place a <b>Canceller</b> <kbd>2</kbd>') },
    { anchor: 'spool', done: (c) => fedBy(c, 'canceller', 'spool'), text: () => '<b>Drag</b> from the spool’s output to the Canceller' },
    { anchor: 'socket', done: (c) => fedBy(c, 'socket', 'canceller'), text: () => 'Connect the Canceller to the <b>dock</b>' },
  ],
};

export function mountHints(layer: HTMLElement, store: Store, hooks: { slotRect: (k: MachineKind) => DOMRect | null; avoid: () => HTMLElement[] }) {
  const el = h('div', { class: 'h3-hint', hidden: true, role: 'status', 'aria-live': 'polite' });
  const text = h('span', { class: 'h3-hint-text' });
  const skip = h('button', { class: 'h3-hint-skip', title: 'Hide the hints for this order' }, 'skip');
  const step = h('span', { class: 'h3-hint-step' });
  el.append(step, text, skip);
  layer.append(el);
  skip.addEventListener('click', () => store.setUI({ hint: null }));

  let lastText = '';
  const render = (s: S) => {
    const list = HINTS[s.level.id];
    const i = s.ui.hint;
    if (!list || i === null || s.ui.screen !== 'floor' || s.ui.ceremony) { el.hidden = true; return; }
    // advance on what is actually on the floor (forward only)
    let stage = 0;
    while (stage < list.length && list[stage]!.done(s.canvas)) stage++;
    if (stage > i) {
      queueMicrotask(() => {
        const st = store.get(), cur = st.ui.hint;
        if (cur === null || cur >= stage) return;
        // the first placement is done: hand back the Select tool so the next drag draws a belt, not another machine
        if (cur === 0 && st.ui.tool.k === 'place') store.setTool({ k: 'select' });
        if (stage >= list.length) store.setUI({ hint: null }); else store.setUI({ hint: stage });
      });
    }
    const hint = list[Math.min(i, list.length - 1)];
    if (!hint || i >= list.length) { el.hidden = true; return; }
    const t = hint.text(s);
    if (t !== lastText) { lastText = t; text.innerHTML = t; step.textContent = `${i + 1}/${list.length}`; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    el.hidden = false;
    el.dataset.anchor = hint.anchor;
    position(s, hint);
  };

  const position = (s: S, hint: Hint) => {
    const w = el.offsetWidth, hh = el.offsetHeight;
    let x: number, y: number, side: 'up' | 'down' | 'left' = 'down';
    if (hint.anchor === 'slot') {
      const r = hooks.slotRect('canceller');
      x = r ? r.left + r.width / 2 - w / 2 : innerWidth / 2 - w / 2;
      y = r ? r.top - hh - 16 : innerHeight - 140;
      side = 'down';
    } else {
      const m = s.canvas.machines.find((mm) => mm.kind === hint.anchor);
      const r = m ? machineRect(m.id, s) : null;
      if (r) { x = r.left + r.width / 2 - w / 2; y = r.top - hh - 18; side = 'down'; if (y < 120) { y = r.top + r.height + 18; side = 'up'; } }
      else { x = hint.anchor === 'spool' ? innerWidth * 0.22 : innerWidth * 0.62; y = innerHeight * 0.42; side = 'left'; }
    }
    const clampX = (v: number) => Math.max(12, Math.min(innerWidth - w - 12, v));
    const clampY = (v: number) => Math.max(70, Math.min(innerHeight - hh - 90, v));
    // never cover the player's open lens or drawers: flip to the other side of the anchor, else step back
    const blockers = hooks.avoid().filter((b) => !b.hidden).map((b) => b.getBoundingClientRect());
    const hits = (px: number, py: number) => blockers.some((r) => px < r.right && px + w > r.left && py < r.bottom && py + hh > r.top);
    let px = clampX(x), py = clampY(y);
    if (hits(px, py) && hint.anchor !== 'slot') {
      const m = s.canvas.machines.find((mm) => mm.kind === hint.anchor);
      const r = m ? machineRect(m.id, s) : null;
      if (r) { const alt = side === 'down' ? r.top + r.height + 18 : r.top - hh - 18; if (!hits(px, clampY(alt))) { py = clampY(alt); side = side === 'down' ? 'up' : 'down'; } }
    }
    el.style.visibility = hits(px, py) ? 'hidden' : '';
    el.dataset.point = side;
    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
  };
  return { render, reposition: () => { const s = store.get(); const list = HINTS[s.level.id]; const i = s.ui.hint; if (list && i !== null && list[i] && !el.hidden) position(s, list[i]!); } };
}
