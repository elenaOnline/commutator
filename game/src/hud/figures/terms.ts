// Concept-card figures — terms drawn with the game's own term renderer (hud/beads → bench/render), one top-level
// factor at a time so braces can span factors, plus display-only brackets and labelled over/under braces.
import type { AtomDecl, Term } from '../../kernel/types';
import type { AtomSpec } from '../../levels/cards';
import { beads } from '../beads';
import { markVarBeads } from '../strip';
import { esc, h } from '../util';
import { mdInline } from './tex';
import { parseDisplay, parseDisplayFig, type DFactor, type DFig, type Subgroup } from './parse';
import { eulerBlobHTML } from '../../ui/euler';
import { letterSlot } from '../../ui/letters';

/** A subgroup on a card, drawn as on the floor: its Euler set (a second inner outline when normal). */
export function subgroupEl(sub: Subgroup, bd: number): HTMLElement {
  return h('span', { class: 'cc-sub', style: `--bd:${bd}px`, html: eulerBlobHTML(sub.label, Math.round(bd * 0.8), { normal: sub.normal, title: `the ${sub.normal ? 'normal ' : ''}subgroup ${sub.label}` }) });
}

/** Everything a figure needs to draw its letters. */
export interface Letters {
  atoms: AtomDecl[];
  L: Record<string, string>;
  H: Record<string, number>;
  vars: Map<string, 'G' | 'Z'>;
}
export function lettersOf(specs: AtomSpec[]): Letters {
  // a letter keeps its shape on cards and floor alike: the shape comes from the letter (ui/letters), never from
  // the card's own list; Tower variables (a sort) wear the variable look whatever their hue
  const hue = (a: AtomSpec) => (a.sort ? a.hue : letterSlot(a.label));
  const atoms: AtomDecl[] = specs.map((a) => ({ id: a.id, label: a.label, hue: hue(a), ...(a.sort ? { sort: a.sort } : {}) }));
  return {
    atoms,
    L: Object.fromEntries(specs.map((a) => [a.id, a.label])),
    H: Object.fromEntries(specs.map((a) => [a.id, hue(a)])),
    vars: new Map(specs.filter((a) => a.sort).map((a) => [a.id, a.sort!])),
  };
}

/** One kernel factor as terms, at term size bd. */
function kernelFactor(t: Term, lt: Letters, bd: number): HTMLElement {
  const r = markVarBeads(beads(t, lt.L, lt.H), lt.vars);
  r.classList.add('cc-f');
  r.style.setProperty('--bd', `${bd}px`);
  r.querySelectorAll<HTMLElement>('.h3-pow-exp').forEach((x) => { x.innerHTML = x.innerHTML.replace(/-/g, '−'); });
  return r;
}

/** A display factor: a kernel factor, or a bracketed group drawn with real (display-only) brackets. */
export function factorEl(f: DFactor, lt: Letters, bd: number): HTMLElement {
  if (f.k === 'term') return kernelFactor(f.t, lt, bd);
  const par = (c: string) => h('span', { class: 'cc-par', 'aria-hidden': 'true' }, c);
  return h('span', { class: 'cc-grp', style: `--bd:${bd}px` }, par('('), wordEl(f.fs, lt, bd), par(')'));
}

/** A brace (over or under) the width of its parent: rounded ends and a centre tip, like \overbrace. */
function braceEl(side: 'over' | 'under'): HTMLElement {
  const H = 7, M = 3.5, sw = 1.5;
  const end = (w: number, d: string) => `<svg width="${w}" height="${H}" aria-hidden="true"><path d="${d}"/></svg>`;
  return h('span', {
    class: `cc-brace ${side}`,
    html: end(6, `M${sw / 2},${H} Q${sw / 2},${M} 6,${M}`) + '<i></i>' + end(10, `M0,${M} Q5,${M} 5,0.6 Q5,${M} 10,${M}`) + '<i></i>' + end(6, `M0,${M} Q${6 - sw / 2},${M} ${6 - sw / 2},${H}`),
  });
}

/** A word (top-level display factors) with optional labelled braces over [from, to) factor ranges. */
export function wordEl(fs: DFactor[], lt: Letters, bd: number, braces: { from: number; to: number; side: 'over' | 'under'; label: string }[] = []): HTMLElement {
  const w = h('span', { class: 'cc-word' });
  for (let i = 0; i < fs.length;) {
    const b = braces.find((x) => x.from === i && x.to > i);
    if (!b) { w.append(factorEl(fs[i]!, lt, bd)); i++; continue; }
    const span = h('span', { class: `cc-span ${b.side}` }, ...fs.slice(b.from, Math.min(b.to, fs.length)).map((f) => factorEl(f, lt, bd)), braceEl(b.side));
    if (b.label) span.append(h('span', { class: 'cc-brlabel', html: mdInline(b.label) }));
    w.append(span);
    i = Math.max(b.to, i + 1);
  }
  return w;
}

/** A term string as terms (brackets kept), or the plain text in maths type when it does not parse. */
export function termEl(src: string, lt: Letters, bd: number): HTMLElement {
  const fs = parseDisplay(src, lt.atoms);
  return fs ? wordEl(fs, lt, bd) : h('span', { class: 'cc-fallback math' }, src);
}

/** A figure statement ([∀x.] l = r ⟹ …, or ⊥) as one strip of terms and relations. */
export function figStrip(src: string, lt: Letters, bd: number): HTMLElement {
  const e: DFig | null = parseDisplayFig(src, lt.atoms);
  const wrap = h('span', { class: 'cc-strip' });
  if (!e) { wrap.append(h('span', { class: 'cc-fallback math' }, src)); return wrap; }
  if (e.bot) { wrap.append(h('span', { class: 'cc-rel math' }, '⊥')); return wrap; }
  if (e.forall?.length) {
    wrap.append(h('span', { class: 'cc-q math', html: `∀${e.forall.map((v) => `<i class="cc-qvar ${lt.vars.get(v) === 'Z' ? 'z' : 'g'}">${esc(v)}</i>`).join(', ')}.` }));
  }
  e.parts.forEach((p, i) => {
    if (i) wrap.append(h('span', { class: 'cc-rel math' }, '⟹'));
    wrap.append(wordEl(p.l, lt, bd));
    if (p.sub) wrap.append(h('span', { class: 'cc-rel math' }, '∈'), subgroupEl(p.sub, bd));
    else if (p.r) wrap.append(h('span', { class: 'cc-rel math' }, p.rel ?? '='), wordEl(p.r, lt, bd));
  });
  return wrap;
}
