// COMMUTATOR v4 — the hotbar (bottom-centre, floating): Select, Belt, the verbs and sources, recipe presets,
// Room; the All-machines drawer, hover cards, room popover (Suppose / Classical / Assume).
// A slot is always a thing to place, never an instruction. Sorted by family, never by "legal right now".
import * as F from '../factory';
import * as K from '../kernel';
import type { Family, Term } from '../kernel/types';
import type { MachineKind } from '../factory/types';
import type { Tool } from '../state/factoryStore';
import { FAMILY } from '../ui/tokens';
import { glyphHTML } from '../ui/glyph';
import {
  FAMILY_ORDER, IO, KIND_WORD, atomsAll, towerLabelSet, drawerKinds, esc, fH, h, hotbarKinds, huesAll, labelsAll, richHTML, safe, spec, tH, varSortsOf,
  type S, type Store,
} from './util';
import { bareSlot, slotChips, type BareSlot } from './slot';
import { libCard } from './library';
import { hasDistinctMirror } from '../factory/catalog';
import { sideName } from './merge';
import { armPreset, earnedPresets, pending, pinned, presetKey, type Preset } from './presets';

export interface HotbarApi {
  render: (s: S) => void;
  /** Screen rect of the slot for a machine kind (hints, ceremony flight). */
  slotRect: (kind: MachineKind | 'earned' | 'room') => DOMRect | null;
  /** Close any popover/drawer; true if something was open. */
  closePopovers: () => boolean;
  /** Arm the room tool with an assumption (order chip preset). */
  armRoom: (kind: 'suppose' | 'classical' | 'assume', l: Term, r: Term, rel?: 'eq' | 'neq') => void;
  openRoomPopover: () => void;
}

type Entry = { key: string; tool: Tool; name: string; glyph: string; family: Family; blurb: string; hotkey?: string; earned?: boolean; kind?: MachineKind; schema?: string; mirror?: boolean; preset?: Preset };

const sameTool = (a: Tool, b: Tool) => {
  if (a.k !== b.k) return false;
  if (a.k === 'place' && b.k === 'place') return a.kind === b.kind;
  return true;
};

export function mountHotbar(layer: HTMLElement, store: Store): HotbarApi {
  const bar = h('nav', { class: 'h3-hotbar', 'aria-label': 'Machines' });
  const card = h('div', { class: 'h3-hovercard', role: 'tooltip', hidden: true });
  const drawer = h('div', { class: 'h3-drawer', hidden: true, role: 'dialog', 'aria-label': 'All machines' });
  const roomPop = h('div', { class: 'h3-roompop', hidden: true, role: 'dialog', 'aria-label': 'Room' });
  layer.append(card, drawer, roomPop, bar);

  const tools: Entry[] = [
    { key: 'select', tool: { k: 'select' }, name: 'Select', glyph: '↖', family: 'equation', blurb: 'Pick, move, inspect. Drag from a port for a belt.', hotkey: 'Esc' },
    { key: 'belt', tool: { k: 'belt' }, name: 'Belt', glyph: '═', family: 'equation', blurb: 'Drag from an output to an input.', hotkey: 'B' },
  ];
  const machineEntry = (kind: MachineKind): Entry => {
    const sp = spec(kind);
    return { key: kind, tool: { k: 'place', kind }, name: sp.name, glyph: sp.glyph, family: sp.family, blurb: sp.blurb, hotkey: sp.hotkey, kind };
  };
  /** Presets: earned theorems / Lemma Book entries (automatic) and pinned recipes. `both` adds the mirrored sides (drawer). */
  const presetEntries = (s: S, both = false): Entry[] => {
    const ps: Preset[] = [...earnedPresets(s)];
    for (const p of pinned()) if (!ps.some((q) => q.key === p.key)) ps.push(p);
    if (both) for (const p of earnedPresets(s)) {
      const ref = (p.recipe as { ref?: { k: string; id?: string } }).ref;
      const sc = ref?.k === 'schema' && ref.id ? s.ctx.registry[ref.id] : undefined;
      if (p.kind === 'theorem' && sc?.mirrorable && safe(() => hasDistinctMirror(sc.card), true)) {
        const r = { k: 'library' as const, ref: { k: 'schema' as const, id: ref!.id!, mirror: true } };
        ps.push({ key: presetKey('theorem', r), kind: 'theorem', recipe: r, label: sideName(ref!.id!, true, `${p.label} (mirror)`), earned: true });
      }
    }
    return ps.map((p) => {
      const sp = spec(p.kind);
      const ref = (p.recipe as { ref?: import('../factory/types').LibRef }).ref;
      const card = ref ? libCard(s, ref) : null;
      return { key: p.key, tool: { k: 'place', kind: p.kind } as Tool, name: p.label, glyph: sp.glyph, family: p.earned ? 'lemma' : sp.family,
        blurb: card ? `${sp.name} with ${p.label}` : `${sp.name} · ${p.label}`, earned: p.earned, kind: p.kind, preset: p };
    });
  };
  const roomEntry: Entry = { key: 'room', tool: { k: 'room', kind: 'suppose' }, name: 'Room', glyph: '∃', family: 'scope', blurb: 'A region with an assumption inside.', hotkey: 'G' };

  // ───────── slots ─────────
  const slotEls = new Map<string, HTMLButtonElement>();
  const glyph = (e: Entry) => h('span', { class: `h3-glyph fam-${e.family}${e.earned ? ' earned' : ''}`, style: `--ink:${FAMILY[e.family].ink}`, html: glyphHTML(e.glyph) });
  const slot = (e: Entry, onClick?: () => void) => {
    const b = h('button', { class: `h3-slot${e.earned ? ' earned' : ''}${e.preset ? ' preset' : ''}`, 'data-key': e.key, 'aria-label': `${e.name}${e.hotkey ? ` (${e.hotkey})` : ''}` },
      e.hotkey && e.hotkey.length === 1 ? h('span', { class: 'h3-hk' }, e.hotkey) : null,
      e.earned ? h('span', { class: 'h3-band' }) : null,
      glyph(e), h('span', { class: 'h3-name' }, e.name));
    b.addEventListener('click', () => {
      if (onClick) { onClick(); return; }
      if (e.preset) armPreset(store, e.preset); else { pending.preset = null; store.setTool(e.tool); }
      closePopovers();
    });
    b.addEventListener('pointerenter', () => showCard(e, b));
    b.addEventListener('pointerleave', hideCard);
    b.addEventListener('focus', () => showCard(e, b));
    b.addEventListener('blur', hideCard);
    slotEls.set(e.key, b);
    return b;
  };
  const sep = () => h('span', { class: 'h3-sep', 'aria-hidden': 'true' });

  let lastEarnedKey = '';
  const build = (s: S) => {
    bar.innerHTML = ''; slotEls.clear();
    const strip = h('span', { class: 'h3-strip' });
    const pinned = h('span', { class: 'h3-pinned' });
    bar.append(strip, pinned);
    const put = (...xs: Node[]) => strip.append(...xs);
    put(slot(tools[0]!), slot(tools[1]!), sep());
    let lastFam: Family | null = null;
    for (const k of hotbarKinds()) {
      const e = machineEntry(k);
      if (lastFam && lastFam !== e.family) put(h('span', { class: 'h3-tick', 'aria-hidden': 'true' }));
      lastFam = e.family;
      put(slot(e));
    }
    const earned = presetEntries(s, false);
    const earnedWrap = h('span', { class: 'h3-earned', 'data-count': earned.length });
    if (earned.length) { put(sep()); for (const e of earned) earnedWrap.append(slot(e)); }
    put(earnedWrap);
    pinned.append(sep(), slot(roomEntry, () => toggleRoomPopover()));
    const all = h('button', { class: 'h3-slot h3-all', 'aria-label': 'All machines (search)', 'aria-expanded': 'false' },
      h('span', { class: 'h3-glyph h3-allglyph' }, '⋯'), h('span', { class: 'h3-name' }, 'All'));
    all.addEventListener('click', () => toggleDrawer());
    slotEls.set('all', all);
    pinned.append(all);
    lastActive = '';
  };

  // ───────── hover card ─────────
  let cardFor = '';
  const showCard = (e: Entry, anchor: HTMLElement) => {
    if (!drawer.hidden || !roomPop.hidden) return;
    const s = store.get();
    cardFor = e.key;
    const L = labelsAll(s);
    let ports = '';
    let fp = '';
    if (e.kind) {
      const lay = safe(() => F.layoutOf(F.defaultConfig(e.kind!, s.ctx, {}), s.ctx), null);
      if (lay) {
        const ins = lay.ports.filter((p) => p.dir === 'in');
        const outs = lay.ports.filter((p) => p.dir === 'out');
        const word = (p: (typeof lay.ports)[number]) => `${p.label === 'in' || p.label === 'out' ? '' : `<span class="h3-port ${p.role}">${esc(p.label)}</span> `}<span class="h3-dim">${p.accepts.map((a) => KIND_WORD[a] ?? a).join(' / ')}</span>`;
        ports = `<div class="h3-io"><span class="h3-io-k">in</span>${ins.length ? ins.map(word).join('<br>') : '<span class="h3-dim">—</span>'}</div>
          <div class="h3-io"><span class="h3-io-k">out</span>${outs.length ? outs.map(word).join('<br>') : '<span class="h3-dim">—</span>'}</div>`;
        fp = footprintSVG(lay);
      } else if (IO[e.kind]) {
        const [i, o] = IO[e.kind]!;
        ports = `<div class="h3-io"><span class="h3-io-k">in</span>${esc(i)}</div><div class="h3-io"><span class="h3-io-k">out</span>${esc(o)}</div>`;
      }
    }
    const pref = (e.preset?.recipe as { ref?: import('../factory/types').LibRef } | undefined)?.ref;
    const pc = pref ? libCard(s, pref) : null;
    const stmt = pc ? `<div class="h3-card-stmt math">${fH(pc, L)}</div>` : '';
    card.innerHTML = `<div class="h3-card-top"><span class="h3-card-name">${esc(e.name)}</span><span class="h3-card-fam" style="color:${FAMILY[e.family].text}">${e.earned ? 'Earned theorem' : FAMILY[e.family].label}</span>${e.hotkey ? `<kbd>${esc(e.hotkey)}</kbd>` : ''}</div>
      ${stmt}<p class="h3-card-blurb">${richHTML(e.blurb, s.level)}</p>
      ${ports || fp ? `<div class="h3-card-grid"><div>${ports}</div>${fp ? `<div class="h3-fp" title="footprint">${fp}</div>` : ''}</div>` : ''}`;
    card.hidden = false;
    const r = anchor.getBoundingClientRect();
    const cw = card.offsetWidth;
    card.style.left = `${Math.max(8, Math.min(innerWidth - cw - 8, r.left + r.width / 2 - cw / 2))}px`;
    card.style.bottom = `${innerHeight - r.top + 10}px`;
  };
  const hideCard = () => { card.hidden = true; cardFor = ''; };
  void cardFor;

  // ───────── drawer ─────────
  const search = h('input', { class: 'h3-search', placeholder: 'Search', 'aria-label': 'Search machines', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'h3-drawer-list' });
  drawer.append(h('div', { class: 'h3-drawer-head' }, h('span', { class: 'h3-label' }, 'All machines'), h('span', { class: 'h3-dim' }, 'by family')), search, list);
  const allEntries = (s: S): Entry[] => {
    const kinds = [...hotbarKinds(), ...drawerKinds()];
    return [...tools, ...kinds.map(machineEntry), ...presetEntries(s, true), roomEntry];
  };
  const renderDrawer = () => {
    const s = store.get();
    const q = search.value.trim().toLowerCase();
    const es = allEntries(s).filter((e) => !q || `${e.name} ${e.glyph} ${e.blurb} ${FAMILY[e.family].label}`.toLowerCase().includes(q));
    list.innerHTML = '';
    const groups: [string, Entry[]][] = [['Tools', es.filter((e) => e.key === 'select' || e.key === 'belt')]];
    for (const f of FAMILY_ORDER) groups.push([f === 'lemma' ? 'Earned & imported' : FAMILY[f].label, es.filter((e) => e.family === f && e.key !== 'select' && e.key !== 'belt')]);
    for (const [name, items] of groups) {
      if (!items.length) continue;
      const fam = items[0]!.family;
      list.append(h('div', { class: 'h3-group', style: name === 'Tools' ? '' : `color:${FAMILY[fam].text}` }, name));
      for (const e of items) {
        const row = h('button', { class: `h3-row${e.earned ? ' earned' : ''}`, 'data-key': e.key }, glyph(e),
          h('span', { class: 'h3-row-body' }, h('span', { class: 'h3-row-name' }, e.name), h('span', { class: 'h3-row-blurb', html: richHTML(e.blurb, s.level) })),
          e.hotkey ? h('kbd', {}, e.hotkey) : null);
        row.addEventListener('click', () => pick(e));
        list.append(row);
      }
    }
    if (!list.childElementCount) list.append(h('p', { class: 'h3-dim h3-empty' }, 'No match. Try a shorter word.'));
  };
  const pick = (e: Entry) => { closePopovers(); if (e.key === 'room') openRoomPopover(); else store.setTool(e.tool); };
  search.addEventListener('input', renderDrawer);
  search.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { closePopovers(); return; }
    if (ev.key === 'Enter') { const first = list.querySelector<HTMLButtonElement>('.h3-row'); first?.click(); }
  });
  const toggleDrawer = (open?: boolean) => {
    const on = open ?? drawer.hidden;
    if (on) { roomPop.hidden = true; hideCard(); search.value = ''; renderDrawer(); drawer.hidden = false; placeAbove(drawer, slotEls.get('all')!); search.focus({ preventScroll: true }); }
    else drawer.hidden = true;
    slotEls.get('all')?.setAttribute('aria-expanded', String(on));
  };

  // ───────── room popover: Suppose / Classical / Assume ─────────
  type RK = 'suppose' | 'classical' | 'assume';
  let roomKind: RK = 'suppose';
  let assumeRel: 'eq' | 'neq' = 'eq';
  // the assumption's LHS and RHS are term slots (review 2026-10: every input that takes a term), one chip row
  let slotL: BareSlot | null = null, slotR: BareSlot | null = null, lastSlot: 'l' | 'r' = 'l';
  const roomRow = h('div', { class: 'h3-roomrow' });
  const roomChips = h('div', { class: 'h3-roomchips' });
  const rel = h('button', { class: 'h3-rel math', title: 'For an Assume room: assume = or ≠' }, '=');
  const kSup = h('button', { class: 'h3-seg on', title: 'A clash proves the opposite.' }, 'Suppose');
  const kCls = h('button', { class: 'h3-seg', title: 'A clash proves P (classical).' }, 'Classical');
  const kAsm = h('button', { class: 'h3-seg', title: 'Exports P ⇒ Q.' }, 'Assume');
  const roomMsg = h('div', { class: 'h3-roommsg' });
  const arm = h('button', { class: 'lw-key primary small' }, 'Paint the room');
  const presetRow = h('div', { class: 'h3-presets' });
  roomPop.append(
    h('div', { class: 'h3-drawer-head' }, h('span', { class: 'h3-label', style: 'color:var(--scope)' }, 'Room'), h('span', { class: 'h3-dim' }, 'an assumption, a desk, a gate')),
    h('div', { class: 'h3-segs' }, kSup, kCls, kAsm),
    roomRow, roomChips,
    roomMsg, presetRow, h('div', { class: 'h3-roomfoot' }, arm, h('span', { class: 'h3-dim' }, 'then drag a rectangle')));
  const termOf = (sl: BareSlot | null): Term | null => { const r = sl?.read(); return r && r.k === 'ok' ? r.term : null; };
  const buildSlots = (lv: string, rv: string) => {
    const s = store.get();
    const atoms = atomsAll(s), L = labelsAll(s), H = huesAll(s), vars = varSortsOf(s);
    const mk = (name: 'LHS' | 'RHS', side: 'l' | 'r', value: string) => bareSlot({
      name: side, atoms, L, H, vars, value, towerLabels: () => towerLabelSet(store.get()), onChange: () => updateRoom(),
      onFocus: () => { lastSlot = side; }, onKey: (ev) => { if (ev.key === 'Enter') arm.click(); if (ev.key === 'Escape') closePopovers(); },
    });
    slotL = mk('LHS', 'l', lv); slotR = mk('RHS', 'r', rv);
    slotL.input.setAttribute('aria-label', 'LHS of the assumption'); slotR.input.setAttribute('aria-label', 'RHS of the assumption');
    roomRow.replaceChildren(h('span', { class: 'h3-dim' }, 'assume'), slotL.el, rel, slotR.el);
    const els = s.level.atoms;
    const chips: Term[] = [...els.map((a) => ({ k: 'atom', id: a.id } as Term)), ...els.map((a) => ({ k: 'inv', arg: { k: 'atom', id: a.id } } as Term)), { k: 'e' }];
    roomChips.replaceChildren(slotChips(() => (lastSlot === 'l' ? slotL! : slotR!), chips, L, H, vars));
  };
  const assumedRel = () => (roomKind === 'suppose' ? 'eq' : roomKind === 'classical' ? 'neq' : assumeRel);
  const updateRoom = () => {
    rel.textContent = assumedRel() === 'eq' ? '=' : '≠';
    rel.classList.toggle('live', roomKind === 'assume');
    kSup.classList.toggle('on', roomKind === 'suppose'); kCls.classList.toggle('on', roomKind === 'classical'); kAsm.classList.toggle('on', roomKind === 'assume');
    const l = termOf(slotL), r = termOf(slotR);
    const L = labelsAll(store.get());
    if (l && r) {
      const P = `${tH(l, L)} <span class="m-rel">${assumedRel() === 'eq' ? '=' : '≠'}</span> ${tH(r, L)}`;
      roomMsg.innerHTML = roomKind === 'assume'
        ? `exports <span class="math">${P} <span class="m-rel">⇒</span> <i>Q</i></span>`
        : `a clash exports <span class="math">${tH(l, L)} <span class="m-rel">${roomKind === 'suppose' ? '≠' : '='}</span> ${tH(r, L)}</span>${roomKind === 'classical' ? ' <span class="t-classical">classical</span>' : ''}`;
    } else roomMsg.innerHTML = '';
    arm.disabled = !(l && r);
  };
  kSup.addEventListener('click', () => { roomKind = 'suppose'; updateRoom(); });
  kCls.addEventListener('click', () => { roomKind = 'classical'; updateRoom(); });
  kAsm.addEventListener('click', () => { roomKind = 'assume'; updateRoom(); });
  rel.addEventListener('click', () => { if (roomKind === 'assume') { assumeRel = assumeRel === 'eq' ? 'neq' : 'eq'; updateRoom(); } });
  arm.addEventListener('click', () => {
    const l = termOf(slotL), r = termOf(slotR);
    if (!l || !r) return;
    armRoom(roomKind, l, r, roomKind === 'assume' ? assumeRel : undefined);
  });
  const armRoom = (kind: RK, l: Term, r: Term, relv?: 'eq' | 'neq') => {
    roomPop.hidden = true;
    store.setTool({ k: 'room', kind, l, r, ...(relv ? { rel: relv } : {}) });
    const st = store as unknown as { setRoomSpec?: (x: { l: Term; r: Term; rel?: 'eq' | 'neq' } | null) => void };
    st.setRoomSpec?.({ l, r, ...(relv ? { rel: relv } : {}) });
  };
  const openRoomPopover = () => {
    const s = store.get();
    drawer.hidden = true; hideCard();
    const L = labelsAll(s);
    const t = s.ui.tool;
    const keep = t.k === 'room' && t.l && t.r;
    if (keep) roomKind = t.kind;
    buildSlots(keep ? safe(() => K.termText(t.l!, L), '') : slotL?.input.value ?? '', keep ? safe(() => K.termText(t.r!, L), '') : slotR?.input.value ?? '');
    presetRow.innerHTML = '';
    for (const sk of s.level.sockets) {
      const g = sk.target;
      if (g.k !== 'eq' && g.k !== 'neq') continue;
      const kind = g.k === 'neq' ? 'suppose' : 'classical';
      const b = h('button', { class: `h3-preset${kind === 'classical' ? ' classical' : ''}`, html: `Suppose <span class="math">${tH(g.l, L)} <span class="m-rel">${g.k === 'neq' ? '=' : '≠'}</span> ${tH(g.r, L)}</span>` });
      b.title = kind === 'suppose' ? 'Assume the opposite. A clash proves the goal.' : 'Assume the goal fails. A clash proves it.';
      b.addEventListener('click', () => armRoom(kind, g.l, g.r));
      presetRow.append(b);
    }
    roomPop.hidden = false;
    placeAbove(roomPop, slotEls.get('room')!);
    updateRoom();
    lastSlot = 'l';
    slotL?.input.focus({ preventScroll: true });
  };
  const toggleRoomPopover = () => { if (roomPop.hidden) openRoomPopover(); else roomPop.hidden = true; };

  const placeAbove = (el: HTMLElement, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    el.style.bottom = `${innerHeight - r.top + 10}px`;
  };
  const closePopovers = () => {
    const was = !drawer.hidden || !roomPop.hidden;
    drawer.hidden = true; roomPop.hidden = true; hideCard();
    slotEls.get('all')?.setAttribute('aria-expanded', 'false');
    return was;
  };
  document.addEventListener('pointerdown', (ev) => {
    const t = ev.target as HTMLElement;
    if (!drawer.hidden && !drawer.contains(t) && !slotEls.get('all')?.contains(t)) toggleDrawer(false);
    if (!roomPop.hidden && !roomPop.contains(t) && !slotEls.get('room')?.contains(t)) roomPop.hidden = true;
  }, true);

  // ───────── render ─────────
  let lastActive = '';
  const render = (s: S) => {
    const ek = JSON.stringify(s.ctx.level.tools.schemas) + s.level.id + JSON.stringify(pinned().map((p) => p.key));
    if (ek !== lastEarnedKey) { lastEarnedKey = ek; build(s); }
    const t = s.ui.tool;
    const key = JSON.stringify(t) + s.ui.rot + (pending.preset?.key ?? '');
    if (key === lastActive) return;
    bar.querySelectorAll('.h3-rotb').forEach((x) => x.remove());
    lastActive = key;
    for (const [k, b] of slotEls) {
      let on = false;
      if (k === 'room') on = t.k === 'room';
      else if (k === 'select') on = t.k === 'select' || t.k === 'erase';
      else if (k === 'belt') on = t.k === 'belt';
      else if (k !== 'all') {
        const pre = presetEntries(s, false).find((x) => x.key === k);
        if (pre) on = t.k === 'place' && pending.preset?.key === pre.key && t.kind === pre.kind;
        else {
          const e = [...tools, roomEntry].find((x) => x.key === k) ?? machineEntry(k as MachineKind);
          on = sameTool(e.tool, t) && !(t.k === 'place' && pending.preset);
        }
      }
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      // the armed machine shows its placement rotation (R) whenever it is not the default
      if (on && t.k === 'place' && s.ui.rot) b.append(h('span', { class: 'h3-rotb', title: 'Placement rotation (R turns it)' }, `↻${s.ui.rot * 90}°`));
    }
  };

  const slotRect = (kind: MachineKind | 'earned' | 'room') => {
    if (kind === 'earned') {
      const w = bar.querySelector<HTMLElement>('.h3-earned');
      const last = w?.lastElementChild as HTMLElement | null;
      return (last ?? slotEls.get('room') ?? bar).getBoundingClientRect();
    }
    return slotEls.get(kind)?.getBoundingClientRect() ?? null;
  };
  return { render, slotRect, closePopovers, armRoom, openRoomPopover };
}

/** Tiny top-down footprint: w×h cells, in-ports as notches pointing in, the out-port pointing out. */
function footprintSVG(lay: { w: number; h: number; ports: { x: number; y: number; face: string; dir: string; role: string }[] }): string {
  const c = 14, pad = 9;
  const W = lay.w * c + pad * 2, H = lay.h * c + pad * 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
  for (let x = 0; x < lay.w; x++) for (let y = 0; y < lay.h; y++) s += `<rect x="${pad + x * c + .5}" y="${pad + y * c + .5}" width="${c - 1}" height="${c - 1}" rx="2" fill="#F1F2F6" stroke="#B8BCCB"/>`;
  const D: Record<string, [number, number]> = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
  for (const p of lay.ports) {
    const [dx, dy] = D[p.face] ?? [1, 0];
    const cx = pad + p.x * c + c / 2 + dx * (c / 2 + 3.5), cy = pad + p.y * c + c / 2 + dy * (c / 2 + 3.5);
    const out = p.dir === 'out';
    const sgn = out ? 1 : -1;
    const tip = [cx + dx * 3 * sgn, cy + dy * 3 * sgn], b1 = [cx - dx * 3 * sgn - dy * 3, cy - dy * 3 * sgn - dx * 3], b2 = [cx - dx * 3 * sgn + dy * 3, cy - dy * 3 * sgn + dx * 3];
    const fill = out ? FAMILY.lemma.ink : p.role === 'rule' ? FAMILY.equation.text : p.role === 'param' ? FAMILY.structure.text : '#545B73';
    s += `<path d="M${tip[0]},${tip[1]}L${b1[0]},${b1[1]}L${b2[0]},${b2[1]}Z" fill="${fill}"/>`;
  }
  return s + '</svg>';
}
