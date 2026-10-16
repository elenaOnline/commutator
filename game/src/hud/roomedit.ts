// COMMUTATOR — edit an existing Assume room's assumptions from its desk or gate lens (Book phase A).
// One row per assumption P₁ … P₃: LHS and RHS are term slots (NORMS: anything that takes a term is a term slot),
// the relation is a toggle (= / ≠), and a row's × drops it with its desk. "+ Another assumption" adds a desk.
// Nothing changes on the floor until "Change assumptions": the edit is one undoable step.
import type { DeskAssumption, Fact, SubRef, Term, ZRef } from '../kernel/types';
import type { Room } from '../factory/types';
import * as K from '../kernel';
import { MULTI_GROUP, displayCard } from '../kernel/print';
import { bareSlot, slotChips, type BareSlot } from './slot';
import { atomsAll, deskFact, fH, h, huesAll, labelsAll, safe, subgroupsOf, towerLabelSet, varSortsOf, type S, type Store } from './util';

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

/** The ids of integer metas ({k:'zmeta'}) anywhere inside x. */
function zmetaIds(x: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(x)) x.forEach((v) => zmetaIds(v, out));
  else if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (o.k === 'zmeta' && typeof o.id === 'string') out.add(o.id);
    Object.values(o).forEach((v) => zmetaIds(v, out));
  }
  return out;
}

/** An "Assume …" preset: a dock's if-then premises, with the floor's Towers standing for its variables. */
export interface AssumePreset { html: string; assumes: DeskAssumption[] | null; missing: string[]; title: string; /** what to place, in words */ need: string }

/** Replace a card's metas and binders by the floor's variables, subgroups, Hom Towers (f ↦ f₁) and groups (T ↦ K₁). */
function instantiate<T>(x: T, metas: Record<string, Term>, subs: Record<string, SubRef>, zs: Record<string, ZRef> = {},
  fns: Record<string, string> = {}, sorts: Record<string, string> = {}): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    if (o.k === 'meta' && typeof o.id === 'string' && metas[o.id]) return metas[o.id];
    if (o.k === 'zmeta' && typeof o.id === 'string' && zs[o.id]) return zs[o.id];
    if (o.k === 'submeta' && typeof o.id === 'string' && subs[o.id]) return subs[o.id];
    if (o.k === 'sortmeta' && typeof o.id === 'string' && sorts[o.id]) return sorts[o.id];
    if (o.k === 'app' && typeof o.fn === 'string' && fns[o.fn]) return { ...o, fn: fns[o.fn], args: (o.args as unknown[]).map(walk) };
    if (o.k === 'e' && typeof o.s === 'string' && sorts[o.s]) return { k: 'e', s: sorts[o.s] };
    return Object.fromEntries(Object.entries(o).map(([k, w]) => [k, walk(w)]));
  };
  return walk(x) as T;
}

/**
 * The docks' if-then statements as Assume presets (playtest W10–14 #4): "Assume xy⁻¹ ∈ H₁". The floor's Towers play
 * the dock's variables: a Tower of the same name (x, x₁ …) first, then — final playtest W1–7 #14 — any unused Tower of
 * the right sort, in the order they were placed. A dock about every homomorphism (∀G, K, f : G → K) takes the floor's
 * Hom Tower for f and its groups for G and K (final playtest W8–14 N4: e_T became e_K₁, f became f₁); a dock about a
 * subgroup takes the subgroup of that letter (or the only one). A preset still missing a Tower says which to place,
 * and prints the dock's own names (never a binder's internal id such as T).
 */
export function assumePresets(s: S): AssumePreset[] {
  const out: AssumePreset[] = [];
  type Tw = { id: string; label: string; sort: 'G' | 'Z'; carrier?: string; group?: boolean; hom?: { dom: string; cod: string } };
  const towers: Tw[] = s.canvas.machines.flatMap((m) => {
    const c = m.config as { kind: string; varId?: string; label?: string; sort?: 'G' | 'Z'; sub?: string; group?: boolean; hom?: { dom: string; cod: string }; carrier?: string };
    return c.kind === 'tower' && c.varId && !c.sub ? [{ id: c.varId, label: c.label || c.varId, sort: c.sort === 'Z' ? 'Z' as const : 'G' as const, carrier: c.carrier, group: !!c.group, hom: c.hom }] : [];
  });
  const elems = towers.filter((t) => !t.group && !t.hom);
  const vars = elems.filter((v) => v.sort === 'G');
  const ints = elems.filter((v) => v.sort === 'Z');
  const homs = towers.filter((t) => t.hom), grps = towers.filter((t) => t.group);
  const groups = subgroupsOf(s);
  const L = labelsAll(s);
  const base = (x: string) => x.replace(/[₀-₉0-9]+$/, '');
  /** By name first, then the first unused of the pool (placement order). */
  const take = <W extends { id: string; label: string }>(pool: W[], name: string, used: Set<string>, ok: (w: W) => boolean = () => true): W | undefined =>
    pool.find((w) => !used.has(w.id) && ok(w) && (w.label === name || base(w.label) === name)) ?? pool.find((w) => !used.has(w.id) && ok(w));
  for (const sk of s.level.sockets) {
    const c = sk.target;
    if (c.k !== 'cond' || !c.premises.length) continue;
    if (!c.premises.every((p) => p.k === 'eq' || p.k === 'neq' || p.k === 'mem')) continue;
    if (c.premises.length > MAX) continue;
    const used = new Set<string>();
    const metas: Record<string, Term> = {};
    const zs: Record<string, ZRef> = {};
    const fns: Record<string, string> = {};
    const sorts: Record<string, string> = {};
    const missing: string[] = [];
    const shown = displayCard(c); // the dock's own names (G, K, f), for the label and the toast
    const shownName = (id: string) => {
      const i = (c.binds ?? []).findIndex((b) => b.id === id);
      const b = i >= 0 ? (shown.binds ?? [])[i] : undefined;
      return b ? b.id : id;
    };
    // a homomorphism binder f : S → T is played by a Hom Tower; its domain and codomain then play S and T
    for (const b of c.binds ?? []) {
      if (b.k !== 'hom') continue;
      const t = take(homs, b.id, used);
      if (!t) {
        const dn = typeof b.dom === 'string' ? b.dom : shownName(b.dom.id), cn = typeof b.cod === 'string' ? b.cod : shownName(b.cod.id);
        missing.push(`${b.id} : ${dn} → ${cn}`); continue;
      }
      used.add(t.id); fns[b.id] = t.id;
      if (typeof b.dom !== 'string') sorts[b.dom.id] = t.hom!.dom;
      if (typeof b.cod !== 'string') sorts[b.cod.id] = t.hom!.cod;
    }
    // a group binder not settled by a Hom Tower: a group Tower (by name, then in order), else the level's own group
    for (const b of c.binds ?? []) {
      if (b.k !== 'grp' || sorts[b.id]) continue;
      const t = take(grps, b.id, used);
      if (t) { used.add(t.id); sorts[b.id] = t.id; continue; }
      const own = (s.level.sorts ?? []).find((x) => x.kind === 'group' && !Object.values(sorts).includes(x.id))?.id ?? (Object.values(sorts).includes('G') ? undefined : 'G');
      if (own) sorts[b.id] = own; else missing.push(`a group ${shownName(b.id)}`);
    }
    // an integer meta (x^n) is played by an integer Tower n∈ℤ, a group meta by an element Tower of its group
    const zIds = zmetaIds([c.premises, c.concl]);
    const carrierOf = (m: string): string | undefined => {
      const r = c.metaSorts?.[m];
      if (r === undefined) return undefined;
      return typeof r === 'string' ? r : sorts[r.id];
    };
    const inCarrier = (m: string) => (w: Tw) => { const want = carrierOf(m); return want === undefined || (w.carrier ?? 'G') === want; };
    // names first for every meta (so an x₁ Tower is never taken for y), then the rest in order
    const pick: Record<string, Tw | undefined> = {};
    for (const m of c.metas) {
      const pool = zIds.has(m) ? ints : vars;
      const v = pool.find((w) => !used.has(w.id) && inCarrier(m)(w) && (w.label === m || base(w.label) === m));
      if (v) { used.add(v.id); pick[m] = v; }
    }
    for (const m of c.metas) {
      if (pick[m]) continue;
      const pool = zIds.has(m) ? ints : vars;
      const v = pool.find((w) => !used.has(w.id) && inCarrier(m)(w));
      if (v) { used.add(v.id); pick[m] = v; }
    }
    for (const m of c.metas) {
      const v = pick[m];
      if (!v) missing.push(m);
      else if (zIds.has(m)) zs[m] = { k: 'zvar', id: v.id };
      else metas[m] = { k: 'atom', id: v.id };
    }
    const subsMap: Record<string, SubRef> = {};
    for (const b of c.binds ?? []) {
      if (b.k !== 'sub') continue;
      const g = groups.find((x) => base(x.label) === b.id) ?? (groups.length === 1 ? groups[0] : undefined);
      if (g) subsMap[b.id] = { k: 'sub', id: g.id }; else missing.push(b.id);
    }
    const premises = instantiate(c.premises, metas, subsMap, zs, fns, sorts);
    const assumes: DeskAssumption[] = premises.map((p) => (p.k === 'mem' ? { rel: 'mem', t: p.t, sub: p.sub } as DeskAssumption : { rel: p.k as 'eq' | 'neq', l: (p as { l: Term }).l, r: (p as { r: Term }).r }));
    const LL = missing.length ? { ...L, ...Object.fromEntries(c.metas.map((m) => [m, m])) } : L;
    const facts = (missing.length ? shown.premises : premises) as Fact[];
    // more than one group in play: identities print with their group (e_K, e_K₁), as the docks print them
    const multi = new Set([...Object.values(sorts), ...(s.level.sorts ?? []).filter((x) => x.kind === 'group').map((x) => x.id)]).size >= 2 || (c.binds ?? []).filter((b) => b.k === 'grp').length >= 2;
    const LM = multi ? { ...LL, [MULTI_GROUP]: '1' } : LL;
    const html = `Assume <span class="math">${facts.map((p) => fH(p, LM)).join(', ')}</span>`;
    const elems = missing.filter((x) => !x.includes(':') && !x.startsWith('a group'));
    const need = [
      ...missing.filter((x) => x.includes(':')).map((x) => `a Hom Tower ${x}`),
      ...missing.filter((x) => x.startsWith('a group')).map((x) => x.replace('a group', 'a group Tower')),
      ...(elems.length ? [`a Tower for ${elems.join(', ')}`] : []),
    ].join(' and ');
    out.push({
      html, assumes: missing.length ? null : assumes, missing, need,
      title: missing.length ? `Place ${need} first (6), then this paints an Assume room for dock ${sk.id}.` : `An Assume room for dock ${sk.id}: its gate exports these ⟹ what you build inside.`,
    });
  }
  return out;
}

/** The preset as a pill: it arms the Room tool, or (Towers missing) says which to place. */
export function assumePresetButton(store: Store, p: AssumePreset, arm: (as: DeskAssumption[]) => void): HTMLElement {
  const b = h('button', { class: `h3-preset assume${p.assumes ? '' : ' waiting'}`, html: p.html, title: p.title });
  b.addEventListener('click', () => {
    if (p.assumes) arm(p.assumes);
    else store.setUI({ toast: { text: `Place ${p.need} first (6). Then this paints the room.`, kind: 'note', t: Date.now() } });
  });
  return b;
}
