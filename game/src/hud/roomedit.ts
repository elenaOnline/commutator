// COMMUTATOR — edit an existing Assume room's assumptions from its desk or gate lens (Book phase A).
// One row per assumption P₁ … P₃: LHS and RHS are term slots (NORMS: anything that takes a term is a term slot),
// the relation is a toggle (= / ≠), and a row's × drops it with its desk. "+ Another assumption" adds a desk.
// Nothing changes on the floor until "Change assumptions": the edit is one undoable step.
import type { DeskAssumption, Fact, SubRef, Term } from '../kernel/types';
import type { Room } from '../factory/types';
import * as K from '../kernel';
import { bareSlot, slotChips, type BareSlot } from './slot';
import { atomsAll, deskFact, fH, h, huesAll, labelsAll, safe, subgroupsOf, towerLabelSet, towerVars, varSortsOf, type S, type Store } from './util';

const MAX = 3;
const SUBN = '₀₁₂₃₄₅₆₇₈₉';

/** The room's assumptions in desk order (the single-desk shape reads as one). */
export function roomAssumptions(room: Room): DeskAssumption[] {
  if (room.assumes?.length) return room.assumes;
  return [{ rel: room.rel === 'neq' ? 'neq' : 'eq', l: room.l, r: room.r }];
}

export function roomAssumptionsEditor(s: S, store: Store, room: Room): HTMLElement {
  const L = labelsAll(s), H = huesAll(s), vars = varSortsOf(s), atoms = atomsAll(s);
  const sec = h('div', { class: 'h3-roomedit' });
  type Rel = 'eq' | 'neq' | 'mem';
  type Row = { l: BareSlot; r: BareSlot; rel: Rel; sub: SubRef | null; el: HTMLElement };
  // ∈ (Book phase B) is offered where there is a subgroup to belong to: a level subgroup or a Subgroup Tower
  const subs: { ref: SubRef; label: string }[] = [
    ...(s.level.subgroups ?? []).map((g) => ({ ref: { k: 'sub', id: g.id } as SubRef, label: g.label })),
    ...(s.compiled?.graph?.structs ?? []).map((g) => ({ ref: { k: 'sub', id: g.id } as SubRef, label: g.label })),
  ];
  const rels: Rel[] = subs.length ? ['eq', 'neq', 'mem'] : ['eq', 'neq'];
  const relGlyph = (r: Rel) => (r === 'eq' ? '=' : r === 'neq' ? '≠' : '∈');
  let rows: Row[] = [];
  let last: BareSlot | null = null;
  const list = h('div', { class: 'h3-roomedit-rows' });
  const add = h('button', { class: 'lw-key small ghost h3-addassume', title: 'Assume one more statement: it gets its own desk in the room' }, '+ Another assumption');
  const msg = h('div', { class: 'h3-roommsg' });
  const apply = h('button', { class: 'lw-key small primary' }, 'Change assumptions');
  // source text, never display text: a literal power a⁶ pre-fills as a^(6), which reads back as the same power
  const text = (t: Term) => safe(() => K.termSource(t, L), '');
  const mk = (value: string, label: string) => {
    const sl: BareSlot = bareSlot({
      name: label, atoms, L, H, vars, value, towerLabels: () => towerLabelSet(store.get()), onChange: () => update(),
      onFocus: () => { last = sl; }, onKey: (ev) => { if (ev.key === 'Enter') apply.click(); },
    });
    return sl;
  };
  const read = (sl: BareSlot): Term | null => { const r = sl.read(); return r.k === 'ok' ? r.term : null; };
  const current = roomAssumptions(room);
  const wanted = (): DeskAssumption[] | null => {
    const out: DeskAssumption[] = [];
    for (const r of rows) {
      const l = read(r.l);
      if (!l) return null;
      if (r.rel === 'mem') { if (!r.sub) return null; out.push({ rel: 'mem', t: l, sub: r.sub }); continue; }
      const rr = read(r.r); if (!rr) return null;
      out.push({ rel: r.rel, l, r: rr });
    }
    return out;
  };
  const layout = () => {
    rows.forEach((r, i) => {
      const lab = r.el.querySelector('.h3-plabel');
      if (lab) lab.innerHTML = `<i>P</i><sub class="m-sub">${i + 1}</sub>`; // Latin Modern has no ₁ glyph
      const x = r.el.querySelector<HTMLButtonElement>('.h3-x');
      if (x) x.hidden = rows.length < 2;
    });
    add.hidden = rows.length >= MAX;
  };
  const addRow = (a?: DeskAssumption) => {
    if (rows.length >= MAX) return;
    const i = rows.length;
    const lhs = a ? (a.rel === 'mem' ? a.t : a.l) : null;
    const row: Row = { l: mk(lhs ? text(lhs) : '', `LHS of assumption ${i + 1}`), r: mk(a && a.rel !== 'mem' ? text(a.r) : '', `RHS of assumption ${i + 1}`),
      rel: a?.rel ?? 'eq', sub: a?.rel === 'mem' ? a.sub : subs[0]?.ref ?? null, el: h('div', { class: 'h3-roomrow' }) };
    const rb = h('button', { class: 'h3-rel math live', title: subs.length ? 'Assume =, ≠ or ∈' : 'Assume = or ≠' }, relGlyph(row.rel));
    // for ∈ the right side is a subgroup, chosen from the level's subgroups (pills in the subgroup ink)
    const pick = h('span', { class: 'h3-subpick' });
    const drawRight = () => {
      row.r.el.hidden = row.rel === 'mem';
      pick.hidden = row.rel !== 'mem';
      pick.replaceChildren(...subs.map((g) => {
        const b = h('button', { class: `h3-subpill math${row.sub?.id === g.ref.id ? ' on' : ''}`, html: `<i>${g.label}</i>` });
        b.addEventListener('click', () => { row.sub = g.ref; drawRight(); update(); });
        return b;
      }));
    };
    rb.addEventListener('click', () => { row.rel = rels[(rels.indexOf(row.rel) + 1) % rels.length]!; rb.textContent = relGlyph(row.rel); drawRight(); update(); });
    const rm = h('button', { class: 'h3-x', 'aria-label': 'Remove this assumption', title: 'Remove this assumption and its desk' }, '×');
    rm.addEventListener('click', () => { rows = rows.filter((x) => x !== row); row.el.remove(); layout(); update(); });
    row.el.append(h('span', { class: 'h3-dim math h3-plabel' }), row.l.el, rb, row.r.el, pick, rm);
    drawRight();
    rows.push(row); list.append(row.el);
    layout();
  };
  const update = () => {
    const as = wanted();
    const same = !!as && JSON.stringify(as) === JSON.stringify(current);
    msg.innerHTML = as
      ? `exports <span class="math">${as.map((a) => fH(deskFact(a), L)).join(', ')} <span class="m-rel">⟹</span> <i>Q</i></span>`
      : '<span class="h3-dim">Fill every term.</span>';
    apply.disabled = !as || same;
  };
  add.addEventListener('click', () => { addRow(); update(); rows[rows.length - 1]?.l.input.focus({ preventScroll: true }); });
  apply.addEventListener('click', () => { const as = wanted(); if (as) store.setRoomAssumptions(room.id, as); });
  for (const a of current) addRow(a);
  const els = atoms; // level letters and the floor's Tower variables
  const chipTerms: Term[] = [...els.map((a) => ({ k: 'atom', id: a.id } as Term)), ...els.filter((a) => vars.get(a.id) !== 'Z').map((a) => ({ k: 'inv', arg: { k: 'atom', id: a.id } } as Term)), { k: 'e' }];
  sec.append(h('div', { class: 'h3-label' }, h('span', {}, 'Assumptions'), h('span', { class: 'h3-dim' }, 'one desk each')), list, add,
    slotChips(() => last ?? rows[0]!.l, chipTerms, L, H, vars), msg, h('div', { class: 'h3-roomfoot' }, roomDeleteButton(store, room), h('span', { class: 'h3-flex' }), apply));
  update();
  return sec;
}

/** Delete a room (desk and gate go, machines inside stay). Sits at the footer's far left, never beside a close. */
export function roomDeleteButton(store: Store, room: Room): HTMLElement {
  const b = h('button', { class: 'lw-key small ghost danger h3-roomdel', title: 'Delete this room: its desk and gate go, machines inside stay (⌘Z undoes). Shortcut: select the room, then ⌫.' }, 'Delete room');
  b.addEventListener('click', () => { store.remove([room.id]); store.select([]); store.openLens(null); });
  return b;
}

/** An "Assume …" preset: a dock's if-then premises, with the floor's Towers standing for its variables. */
export interface AssumePreset { html: string; assumes: DeskAssumption[] | null; missing: string[]; title: string }

/** Replace a card's metas (and subgroup binders) by the floor's variables and subgroups. */
function instantiate<T>(x: T, metas: Record<string, Term>, subs: Record<string, SubRef>): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    if (o.k === 'meta' && typeof o.id === 'string' && metas[o.id]) return metas[o.id];
    if (o.k === 'submeta' && typeof o.id === 'string' && subs[o.id]) return subs[o.id];
    return Object.fromEntries(Object.entries(o).map(([k, w]) => [k, walk(w)]));
  };
  return walk(x) as T;
}

/**
 * The docks' if-then statements as Assume presets (playtest W10–14 #4): "Assume xy⁻¹ ∈ H₁". A dock's variable x
 * is played by the floor's Tower named x (or x₁ …), its subgroup H by the subgroup of that letter (or the only one).
 * A preset whose variables have no Tower yet says which to place.
 */
export function assumePresets(s: S): AssumePreset[] {
  const out: AssumePreset[] = [];
  const vars = towerVars(s).filter((v) => v.sort === 'G');
  const groups = subgroupsOf(s);
  const L = labelsAll(s);
  const base = (x: string) => x.replace(/[₀-₉0-9]+$/, '');
  for (const sk of s.level.sockets) {
    const c = sk.target;
    if (c.k !== 'cond' || !c.premises.length) continue;
    if (!c.premises.every((p) => p.k === 'eq' || p.k === 'neq' || p.k === 'mem')) continue;
    if (c.premises.length > MAX) continue;
    const used = new Set<string>();
    const metas: Record<string, Term> = {};
    const missing: string[] = [];
    for (const m of c.metas) {
      const v = vars.find((w) => !used.has(w.id) && (w.label === m || base(w.label) === m));
      if (v) { used.add(v.id); metas[m] = { k: 'atom', id: v.id }; } else missing.push(m);
    }
    const subsMap: Record<string, SubRef> = {};
    for (const b of c.binds ?? []) {
      if (b.k !== 'sub') continue;
      const g = groups.find((x) => base(x.label) === b.id) ?? (groups.length === 1 ? groups[0] : undefined);
      if (g) subsMap[b.id] = { k: 'sub', id: g.id }; else missing.push(b.id);
    }
    const premises = instantiate(c.premises, metas, subsMap);
    const assumes: DeskAssumption[] = premises.map((p) => (p.k === 'mem' ? { rel: 'mem', t: p.t, sub: p.sub } as DeskAssumption : { rel: p.k as 'eq' | 'neq', l: (p as { l: Term }).l, r: (p as { r: Term }).r }));
    const shown = missing.length ? c.premises : premises;
    const LL = missing.length ? { ...L, ...Object.fromEntries(c.metas.map((m) => [m, m])) } : L;
    const html = `Assume <span class="math">${shown.map((p) => fH(p as Fact, LL)).join(', ')}</span>`;
    out.push({
      html, assumes: missing.length ? null : assumes, missing,
      title: missing.length ? `Place a Tower for ${missing.join(', ')} first (6), then this paints an Assume room for dock ${sk.id}.` : `An Assume room for dock ${sk.id}: its gate exports these ⟹ what you build inside.`,
    });
  }
  return out;
}

/** The preset as a pill: it arms the Room tool, or (Towers missing) says which to place. */
export function assumePresetButton(store: Store, p: AssumePreset, arm: (as: DeskAssumption[]) => void): HTMLElement {
  const b = h('button', { class: `h3-preset assume${p.assumes ? '' : ' waiting'}`, html: p.html, title: p.title });
  b.addEventListener('click', () => {
    if (p.assumes) arm(p.assumes);
    else store.setUI({ toast: { text: `Place a Tower for ${p.missing.join(', ')} first (6). Then this paints the room.`, kind: 'note', t: Date.now() } });
  });
  return b;
}
