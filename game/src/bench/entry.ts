// LEMMA WORKS — inline term entry: bead chips, a typed field (kernel.parseTerm),
// and drag-a-span-from-the-rails (the bench calls supply()). Owner: bench builder.
import type { AtomDecl, Term } from '../kernel/types';
import { type Hues, beadsInline } from './render';
import { type Labels, plain } from './util';

export type Parse = (src: string) => { ok: true; term: Term } | { ok: false; error: string };

export interface EntryOpts {
  title: string;          // HTML
  metas: string[];        // one field per meta
  atoms: AtomDecl[];
  L: Labels;
  hues: Hues;
  parse: Parse;
  submitLabel: string;
  /** Live check of all values (e.g. kernel.fillOffer). Returns preview HTML or an error. */
  validate?: (vals: Record<string, Term>) => { ok: true; html: string } | { ok: false; error: string };
  quick?: Array<{ label: string; term: Term }>;
  onSubmit: (vals: Record<string, Term>) => string | null; // error message or null
  onCancel: () => void;
}

export interface Entry {
  el: HTMLElement;
  /** Fill the focused field with a term (span dragged from the rails or the goal). */
  supply: (t: Term) => void;
  focus: () => void;
  submit: () => void;
  destroy: () => void;
}

export function mountEntry(o: EntryOpts): Entry {
  const root = document.createElement('div');
  root.className = 'bn-entry';
  root.innerHTML = `<div class="bn-entry-head"><span class="bn-entry-title">${o.title}</span><button class="bn-x" title="Cancel (Esc)">×</button></div>`;
  const fields: Record<string, { input: HTMLInputElement; view: HTMLElement; term: Term | null; err: string | null }> = {};
  let focused = o.metas[0] ?? '';

  const rows = document.createElement('div');
  rows.className = 'bn-entry-rows';
  for (const m of o.metas) {
    const row = document.createElement('label');
    row.className = 'bn-entry-row';
    row.innerHTML = `<span class="bn-entry-meta"><i>${m}</i> :=</span>`;
    const input = document.createElement('input');
    input.className = 'bn-entry-input';
    input.spellcheck = false; input.autocomplete = 'off';
    input.placeholder = 'type ba, a^-1, (ab)^-1 — or drag beads';
    const view = document.createElement('span');
    view.className = 'bn-entry-view';
    row.append(input, view);
    rows.append(row);
    fields[m] = { input, view, term: null, err: null };
    input.addEventListener('focus', () => { focused = m; mark(); });
    input.addEventListener('input', () => update());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); o.onCancel(); }
      e.stopPropagation();
    });
  }
  root.append(rows);

  const chips = document.createElement('div');
  chips.className = 'bn-chips';
  const chipTerms: Term[] = [];
  for (const a of o.atoms) chipTerms.push({ k: 'atom', id: a.id });
  for (const a of o.atoms) chipTerms.push({ k: 'inv', arg: { k: 'atom', id: a.id } });
  chipTerms.push({ k: 'e' });
  for (const t of chipTerms) {
    const b = document.createElement('button');
    b.className = 'bn-chip';
    b.title = `append ${plain(t, o.L)}`;
    b.append(beadsInline(t, o.L, o.hues));
    b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep input focus
    b.addEventListener('click', () => append(plain(t, o.L)));
    chips.append(b);
  }
  const clr = document.createElement('button');
  clr.className = 'bn-chip bn-chip-text'; clr.textContent = '⌫'; clr.title = 'delete last';
  clr.addEventListener('pointerdown', (e) => e.preventDefault());
  clr.addEventListener('click', () => { const f = fields[focused]; if (f) { f.input.value = backspace(f.input.value); update(); } });
  chips.append(clr);
  for (const q of o.quick ?? []) {
    const b = document.createElement('button');
    b.className = 'bn-chip bn-chip-text';
    b.innerHTML = `${q.label}&ensp;`;
    b.append(beadsInline(q.term, o.L, o.hues));
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => supply(q.term));
    chips.append(b);
  }
  root.append(chips);

  // Start/Apply sits in the (last) input row so it can never be clipped below the chips
  const foot = document.createElement('div');
  foot.className = 'bn-entry-foot';
  const msg = document.createElement('span');
  msg.className = 'bn-entry-msg';
  const go = document.createElement('button');
  go.className = 'bn-go';
  go.textContent = o.submitLabel;
  rows.lastElementChild?.append(go);
  foot.append(msg);
  root.insertBefore(foot, chips);
  go.addEventListener('click', () => submit());
  root.querySelector('.bn-x')!.addEventListener('click', () => o.onCancel());

  function backspace(s: string): string {
    if (s.endsWith('⁻¹')) return s.slice(0, -2);
    return s.slice(0, -1);
  }
  function append(txt: string) {
    const f = fields[focused];
    if (!f) return;
    f.input.value += txt;
    update();
    f.input.focus();
  }
  function supply(t: Term) {
    const f = fields[focused];
    if (!f) return;
    f.input.value = plain(t, o.L);
    update();
    f.input.animate([{ background: '#EEF1F8' }, { background: 'transparent' }], { duration: 300 });
    // advance to the next empty field
    const next = o.metas.find((m) => !fields[m]!.term);
    if (next) { focused = next; fields[next]!.input.focus(); mark(); }
  }
  function mark() { for (const m of o.metas) fields[m]!.input.parentElement!.classList.toggle('is-focus', m === focused); }

  function values(): Record<string, Term> | null {
    const v: Record<string, Term> = {};
    for (const m of o.metas) { const t = fields[m]!.term; if (!t) return null; v[m] = t; }
    return v;
  }
  function update() {
    for (const m of o.metas) {
      const f = fields[m]!;
      const src = f.input.value.trim();
      f.view.textContent = '';
      f.term = null; f.err = null;
      if (!src) continue;
      let r: ReturnType<Parse>;
      try { r = o.parse(src); } catch (e) { r = { ok: false, error: String((e as Error).message ?? e) }; }
      if (r.ok) { f.term = r.term; f.view.append(beadsInline(r.term, o.L, o.hues)); }
      else f.err = r.error;
    }
    const errs = o.metas.map((m) => fields[m]!.err).filter(Boolean);
    const v = values();
    msg.classList.remove('is-err');
    go.disabled = !v;
    if (errs.length) { msg.textContent = errs[0]!; msg.classList.add('is-err'); go.disabled = true; return; }
    if (!v) { msg.innerHTML = '<span class="bn-hint">pick beads, type, or drag a span from the rails or the goal</span>'; return; }
    if (o.validate) {
      let r: ReturnType<NonNullable<EntryOpts['validate']>>;
      try { r = o.validate(v); } catch (e) { r = { ok: false, error: String((e as Error).message ?? e) }; }
      if (r.ok) msg.innerHTML = `<span class="bn-arrow">→</span> <span class="math">${r.html}</span>`;
      else { msg.textContent = r.error; msg.classList.add('is-err'); go.disabled = true; }
    } else msg.textContent = '';
  }
  function submit() {
    const v = values();
    if (!v) { root.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 200 }); return; }
    const err = o.onSubmit(v);
    if (err) { msg.textContent = err; msg.classList.add('is-err'); }
  }
  update(); mark();
  return {
    el: root, supply,
    focus: () => fields[focused]?.input.focus(),
    submit,
    destroy: () => root.remove(),
  };
}
