// COMMUTATOR — term slots (review 2026-10: 3b103ba9, 1a080950). A value that is a term is never a plain text
// field: it is drawn as terms in a 42–44px slot, fed by ONE hidden full-size <input> with a shared blinking
// caret, plus chips for quick entry (a b a⁻¹ b⁻¹ e ⌫, and = LHS / = RHS when an equation arrives).
// An empty slot has a dashed outline in the family accent and a grey placeholder letter; text that does not
// read shows in red with "That doesn't read as a term." Parsing lives in slotparse.ts (shared with the tests).
import { eulerBlobHTML } from '../ui/euler';
import { parseExtra, slotFlags } from './slotparse';
import { sortCtx } from '../ui/sorts';
import * as K from '../kernel';
import type { AtomDecl, Term } from '../kernel/types';
import { beads } from './beads';
import { markVarBeads } from './strip';
import { BAD_TERM, readSlot, readVarName, slotAppend, slotBackspace, withLetter, withSubscript, type SlotRead } from './slotparse';
import { esc, h, liveSubscripts, safe } from './util';

type Labels = Record<string, string>;
type Hues = Record<string, number>;

export interface TermSlotOpts {
  /** The knob's name: the placeholder letter and the `t :=` label. */
  name: string;
  value: Term | null;
  /** 'single' (t :=, Spool, metas) or 'pair' (insert pair: x and (x)⁻¹ share one caret). */
  layout: 'single' | 'pair';
  /** Pair order: true puts (x)⁻¹ first (x⁻¹x). */
  inv?: boolean;
  /** Show the `name :=` label in front (single slots). */
  label?: boolean;
  /** Offer the power chip ^( ) (default: where integer exponents exist on this floor). */
  ints?: boolean;
  atoms: AtomDecl[];
  L: Labels;
  H: Hues;
  vars: Map<string, 'G' | 'Z'>;
  /** Chip terms in order (level atoms, their inverses, e). */
  chips: Term[];
  /** `= LHS` / `= RHS`: copy a side of the incoming equation (only where one arrives). */
  quick?: { label: 'LHS' | 'RHS'; term: Term }[];
  /** "use a port" (route a term belt instead). */
  onPort?: () => void;
  /** Labels that subscripts may complete to (x1 → x₁ when x₁ is a Tower). */
  towerLabels: () => Set<string>;
  commit: (t: Term | null) => void;
  /** Stable id for keeping focus across lens rebuilds. */
  key: string;
}

// source text (K.termSource), never display text: `a^6` displays a literal power but reads back as the word aaaaaa
const textOf = (t: Term | null, L: Labels) => (t ? safe(() => K.termSource(t, L), '') : '');

/** A term knob drawn as slots. Returns the knob element (class h3-knob). */
export function termSlot(o: TermSlotOpts): HTMLElement {
  const row = h('div', { class: 'h3-knob h3-slotknob', 'data-slot': o.key });
  const input = h('input', { class: 'h3-slot-in', value: textOf(o.value, o.L), 'aria-label': `value of ${o.name}`, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
  const boxes = h('span', { class: 'h3-slotboxes' });
  const slots = h('span', { class: 'h3-slots' }, boxes, input); // the input stays put: redrawing never blurs it
  const msg = h('span', { class: 'h3-knob-msg', role: 'status' });
  let read: SlotRead = readSlot(input.value, o.atoms);

  const box = () => {
    const b = h('span', { class: `h3-slotbox ${read.k}` });
    if (read.k === 'ok') b.append(markVarBeads(beads(read.term, o.L, o.H), o.vars));
    else if (read.k === 'bad') b.append(h('i', { class: 'h3-slot-raw math' }, read.text));
    else b.append(h('i', { class: 'h3-slot-ph math' }, o.name));
    b.append(h('span', { class: 'h3-caret', 'aria-hidden': 'true' }));
    return b;
  };
  const draw = () => {
    read = readSlot(input.value, o.atoms);
    boxes.innerHTML = '';
    if (o.layout === 'single') boxes.append(box());
    else {
      const invBox = h('span', { class: 'h3-slot-inv' }, h('span', { class: 'h3-slot-par math' }, '('), box(), h('span', { class: 'h3-slot-par math' }, ')'), h('span', { class: 'h3-slot-sup math' }, '−1'));
      if (o.inv) boxes.append(invBox, box()); else boxes.append(box(), invBox);
    }
    // x^2 is the word xx, x^(2) a power: say which one this is while typing (W4–9)
    const caret = /\^(\d+)(?!\))/.exec(input.value);
    msg.textContent = read.k === 'bad' ? BAD_TERM : caret && (o.ints ?? slotFlags.ints) ? `^${caret[1]} writes the letters out; for a power use ^(${caret[1]}).` : '';
    msg.title = read.k === 'bad' ? read.error : '';
    row.classList.toggle('unset', read.k !== 'ok');
    row.classList.toggle('bad', read.k === 'bad');
  };
  const same = (t: Term | null) => JSON.stringify(t) === JSON.stringify(o.value);
  const commit = () => {
    draw();
    if (read.k === 'ok' && !same(read.term)) o.commit(read.term);
    else if (read.k === 'empty' && o.value) o.commit(null);
  };
  liveSubscripts(input, o.towerLabels);
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim() === textOf(o.value, o.L)) commit(); input.blur(); } // blur commits
    if (e.key === 'Escape') { e.preventDefault(); input.value = textOf(o.value, o.L); draw(); input.blur(); }
  });
  input.addEventListener('focus', () => { row.classList.add('focus'); const n = input.value.length; input.setSelectionRange(n, n); });
  input.addEventListener('blur', () => { row.classList.remove('focus'); if (input.value.trim() !== textOf(o.value, o.L)) commit(); });

  const chips = h('div', { class: 'h3-chips' });
  const chip = (title: string, kid: Node | string, cls: string, act: () => void) => {
    const b = h('button', { class: `bn-chip h3-chip ${cls}`, title, type: 'button' }, kid);
    b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the caret in the slot
    b.addEventListener('click', () => { act(); draw(); commit(); });
    chips.append(b);
  };
  for (const t of o.chips) {
    const isVar = (t.k === 'atom' && o.vars.has(t.id)) || (t.k === 'inv' && t.arg.k === 'atom' && o.vars.has(t.arg.id));
    chip(`append ${textOf(t, o.L)}`, markVarBeads(beads(t, o.L, o.H), o.vars), isVar ? 'h3-var' : '', () => { input.value = slotAppend(input.value, textOf(t, o.L)); });
  }
  // Book phase C: a map's chip opens its frame f( … ); identities of the other groups (e_K)
  const maps = (parseExtra.cur?.maps ?? []).filter((m) => m.kind !== 'action');
  for (const m of maps) chip(`apply ${m.label}: type its argument inside`, h('span', { class: 'math h3-fnchip', html: `<i>${esc(m.label)}</i>(&thinsp;)` }), 'txt', () => { input.value = `${input.value}${m.label}(`; });
  for (const g of actionChips(o.chips, o.L)) chip(`apply ${g} to a point: type the point inside`, h('span', { class: 'math h3-fnchip', html: `<i>${esc(g)}</i>(&thinsp;)` }), 'txt', () => { input.value = `${input.value}${g}(`; });
  // a power is its own chip: ^( ) raises the term before it to an integer power (x^(2) is x², x^2 would read xx) (W4–9)
  if (o.ints ?? slotFlags.ints) chip('raise to a power: type the integer inside', h('span', { class: 'math h3-fnchip', html: '□<sup>( )</sup>' }), 'txt', () => { input.value = `${input.value}^(`; });
  if (maps.length) chip('close the bracket', h('span', { class: 'math' }, ')'), 'txt', () => { input.value = `${input.value})`; });
  // the plain e chip already gives the base group's identity (and settles to the term's group): no duplicate (#13)
  const groups = (parseExtra.cur?.sorts ?? []).filter((x) => x.kind === 'group' && x.id !== sortCtx.cur.base);
  if (groups.length) for (const g of groups) chip(`append e of ${g.label}`, h('span', { class: 'math', html: `<i>e</i><sub>${esc(g.label)}</sub>` }), 'txt', () => { input.value = slotAppend(input.value, `e_${g.label}`); });
  chip('delete last', '⌫', 'txt', () => { input.value = slotBackspace(input.value); });
  for (const q of o.quick ?? []) chip(`copy the incoming ${q.label} (syntax only)`, `= ${q.label}`, 'txt', () => { input.value = textOf(q.term, o.L); });
  if (o.onPort) {
    const port = h('button', { class: 'h3-tag', title: 'Add a term port and route a term belt into it', type: 'button' }, 'use a port');
    port.addEventListener('click', () => o.onPort!());
    chips.append(port);
  }
  draw();
  const top = h('div', { class: 'h3-knob-top' });
  if (o.label) top.append(h('span', { class: 'h3-knob-k math', html: `<i>${esc(o.name)}</i> :=` }));
  top.append(h('span', { class: 'h3-slotwrap' }, slots));
  row.append(top, msg, chips);
  return row;
}

/** A bare slot (no knob frame, no chips of its own): the room popover's l and r. Reports every edit. */
export interface BareSlot { el: HTMLElement; input: HTMLInputElement; read: () => SlotRead; set: (text: string) => void }
export function bareSlot(o: {
  name: string; atoms: AtomDecl[]; L: Labels; H: Hues; vars: Map<string, 'G' | 'Z'>; value?: string;
  towerLabels: () => Set<string>; onChange: (r: SlotRead) => void; onKey?: (e: KeyboardEvent) => void; onFocus?: () => void;
}): BareSlot {
  const input = h('input', { class: 'h3-slot-in', value: o.value ?? '', 'aria-label': o.name, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
  const boxes = h('span', { class: 'h3-slotboxes' });
  const wrap = h('span', { class: 'h3-slotwrap h3-bareslot' }, h('span', { class: 'h3-slots' }, boxes, input));
  let read: SlotRead = { k: 'empty' };
  const draw = () => {
    read = readSlot(input.value, o.atoms);
    const b = h('span', { class: `h3-slotbox ${read.k}` });
    if (read.k === 'ok') b.append(markVarBeads(beads(read.term, o.L, o.H), o.vars));
    else if (read.k === 'bad') b.append(h('i', { class: 'h3-slot-raw math' }, read.text));
    else b.append(h('i', { class: 'h3-slot-ph math' }, o.name));
    b.append(h('span', { class: 'h3-caret', 'aria-hidden': 'true' }));
    boxes.replaceChildren(b);
    wrap.title = read.k === 'bad' ? BAD_TERM : '';
    o.onChange(read);
  };
  liveSubscripts(input, o.towerLabels);
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => { e.stopPropagation(); o.onKey?.(e); });
  input.addEventListener('focus', () => { wrap.classList.add('focus'); o.onFocus?.(); const n = input.value.length; input.setSelectionRange(n, n); });
  input.addEventListener('blur', () => wrap.classList.remove('focus'));
  draw();
  return { el: wrap, input, read: () => read, set: (text) => { input.value = text; draw(); } };
}

/** The group elements an action can be applied with (α, β … of the acting group), when the floor has an action. */
function actionChips(terms: Term[], L: Labels): string[] {
  const acts = (parseExtra.cur?.maps ?? []).filter((m) => m.kind === 'action');
  if (!acts.length) return [];
  const groups = new Set(acts.map((a) => a.args[0]));
  const env = sortCtx.cur.env;
  return terms.filter((t) => t.k === 'atom' && groups.has(env?.atomSort.get(t.id) ?? 'G')).map((t) => L[(t as { id: string }).id] ?? (t as { id: string }).id);
}
/** Chips (a b a⁻¹ b⁻¹ e ⌫) that edit whichever slot `target()` names. */
export function slotChips(target: () => BareSlot, terms: Term[], L: Labels, H: Hues, vars: Map<string, 'G' | 'Z'>): HTMLElement {
  const chips = h('div', { class: 'h3-chips' });
  const chip = (title: string, kid: Node | string, cls: string, act: (sl: BareSlot) => void) => {
    const b = h('button', { class: `bn-chip h3-chip ${cls}`, title, type: 'button' }, kid);
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => { const sl = target(); act(sl); sl.input.focus({ preventScroll: true }); });
    chips.append(b);
  };
  for (const t of terms) chip(`append ${textOf(t, L)}`, markVarBeads(beads(t, L, H), vars), '', (sl) => sl.set(slotAppend(sl.input.value, textOf(t, L))));
  // Book phase C: a map's chip opens its frame, f( … ) — type the argument, then ")" (or the ) chip) closes it
  const maps = (parseExtra.cur?.maps ?? []).filter((m) => m.kind !== 'action');
  for (const m of maps) chip(`apply ${m.label}: type its argument inside`, h('span', { class: 'math h3-fnchip', html: `<i>${esc(m.label)}</i>(&thinsp;)` }), 'txt', (sl) => sl.set(`${sl.input.value}${m.label}(`));
  // an action is entered as Pinter writes it: α( ), then the point (W4–9)
  for (const g of actionChips(terms, L)) chip(`apply ${g} to a point: type the point inside`, h('span', { class: 'math h3-fnchip', html: `<i>${esc(g)}</i>(&thinsp;)` }), 'txt', (sl) => sl.set(`${sl.input.value}${g}(`));
  if (maps.length) chip('close the bracket', h('span', { class: 'math' }, ')'), 'txt', (sl) => sl.set(`${sl.input.value})`));
  // identities of the other groups (e_K)
  // the plain e chip already gives the base group's identity (and settles to the term's group): no duplicate (#13)
  const groups = (parseExtra.cur?.sorts ?? []).filter((x) => x.kind === 'group' && x.id !== sortCtx.cur.base);
  if (groups.length) for (const g of groups) chip(`append e of ${g.label}`, h('span', { class: 'math', html: `<i>e</i><sub>${esc(g.label)}</sub>` }), 'txt', (sl) => sl.set(slotAppend(sl.input.value, `e_${g.label}`)));
  chip('delete last', '⌫', 'txt', (sl) => sl.set(slotBackspace(sl.input.value)));
  return chips;
}

export interface NameSlotOpts {
  label: string;
  varId: string;
  sort: 'G' | 'Z';
  /** Book phase B: a Subgroup Tower's name (H₁, N₁), drawn as its Euler set. */
  sub?: 'sub' | 'normal';
  /** The letters offered as chips (groups G, K; homomorphisms f, g; …); default by sort. */
  letters?: string[];
  hue: number;
  /** Commit a new label (the lens makes it unique on the floor). */
  commit: (label: string) => void;
  key: string;
}

/** The Tower's name: a slot drawn as the variable itself (violet ∈G, teal ∈ℤ), with letter and subscript chips. */
export function nameSlot(o: NameSlotOpts): { slot: HTMLElement; chips: HTMLElement } {
  const letters = o.letters ?? (o.sub ? (o.sub === 'normal' ? ['N', 'M'] : ['H', 'K', 'L']) : o.sort === 'Z' ? ['n', 'm', 'k'] : ['x', 'y', 'z', 'u']);
  const input = h('input', { class: 'h3-slot-in', value: o.label, 'aria-label': 'variable name', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
  const boxes = h('span', { class: 'h3-slotboxes' });
  const slots = h('span', { class: 'h3-slots', 'data-slot': o.key }, boxes, input);
  const wrap = h('span', { class: `h3-slotwrap h3-nameslot ${o.sort === 'Z' ? 'z' : 'g'}` }, slots);
  const draw = () => {
    const r = readVarName(input.value);
    boxes.innerHTML = '';
    const b = h('span', { class: `h3-slotbox ${r.k}` });
    if (r.k === 'ok' && o.sub) b.append(h('span', { class: 'h3-blob', html: eulerBlobHTML(r.label, 20, { normal: o.sub === 'normal' }) }));
    else if (r.k === 'ok') {
      const id = o.varId;
      b.append(markVarBeads(beads({ k: 'atom', id }, { [id]: r.label }, { [id]: o.hue }), new Map([[id, o.sort]])));
    } else if (r.k === 'bad') b.append(h('i', { class: 'h3-slot-raw math' }, r.text));
    else b.append(h('i', { class: 'h3-slot-ph math' }, letters[0]!));
    b.append(h('span', { class: 'h3-caret', 'aria-hidden': 'true' }));
    boxes.append(b);
    wrap.classList.toggle('bad', r.k === 'bad');
  };
  const commit = () => { const r = readVarName(input.value); if (r.k === 'ok' && r.label !== o.label) o.commit(r.label); else if (r.k !== 'ok') { input.value = o.label; draw(); } };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); } // blur commits
    if (e.key === 'Escape') { e.preventDefault(); input.value = o.label; draw(); input.blur(); }
  });
  input.addEventListener('focus', () => { wrap.classList.add('focus'); const n = input.value.length; input.setSelectionRange(n, n); });
  input.addEventListener('blur', () => { wrap.classList.remove('focus'); if (input.value.trim() !== o.label) commit(); });
  const chips = h('div', { class: 'h3-chips h3-namechips' });
  const chip = (title: string, kid: Node | string, cls: string, act: () => void, live = false) => {
    const b = h('button', { class: `bn-chip h3-chip ${cls}`, title, type: 'button' }, kid);
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => { act(); draw(); if (!live) commit(); });
    chips.append(b);
  };
  for (const l of letters) chip(`name it ${l}`, h('i', { class: 'math' }, l), 'txt h3-letter', () => { input.value = withLetter(input.value, l); });
  // subscripts read as the names they make (x₁, x₂), never as empty boxes (#19)
  for (const d of [1, 2]) chip(`name it with subscript ${'₀₁₂'[d]}`, h('span', { class: 'math', html: `<i>${esc((input.value.replace(/[₀-₉]+$/, '') || letters[0]!))}</i><sub>${d}</sub>` }), 'txt', () => { input.value = withSubscript(input.value, d, letters[0]!); });
  // ⌫ edits the slot; the name commits on Enter / blur (an empty name is never committed)
  chip('delete last', '⌫', 'txt', () => { input.value = [...input.value].slice(0, -1).join(''); input.focus(); }, true);
  draw();
  return { slot: wrap, chips };
}
