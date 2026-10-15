// COMMUTATOR v4 Phase B — bead rails that understand powers. The v2 renderer (bench/render.ts) has no
// 'pow' factor and would recurse; words without powers still go through it unchanged. A power x^n is drawn
// as one factor: a stack frame around its base's beads, with the exponent on a tag (as on the floor).
// Every factor and gap carries its exact kernel address (data-side / data-wpath / data-i / data-gap), so
// brackets and carets work INSIDE a power's base too (child 0 enters the base, like an inverse).
import * as K from '../kernel';
import type { Side, Term } from '../kernel/types';
import { renderRail, beadsInline, labelHTML, type Hues } from '../bench/render';
import { eTag, isActionApp, styleOfTerm } from '../ui/sorts';
import { esc } from './util';

type Labels = Record<string, string>;
interface O { side: Side; L: Labels; hues: Hues; gaps: boolean }
/** Needs the address-exact renderer: a power, a map frame (Book phase C) or a sorted identity (e_K), anywhere. */
export const hasPow = (t: Term): boolean =>
  t.k === 'pow' || t.k === 'app' || (t.k === 'e' && !!eTag(t)) || (t.k === 'inv' && hasPow(t.arg)) || (t.k === 'mul' && t.fs.some(hasPow));
const wordOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);
const key = (p: number[]) => p.join('.');

function gapEl(side: Side, wpath: number[], gap: number, end: boolean): HTMLElement {
  const g = document.createElement('span');
  g.className = `bn-gap${end ? ' bn-gap-end' : ''}`;
  g.dataset.side = side; g.dataset.wpath = key(wpath); g.dataset.gap = String(gap);
  return g;
}
const expHTML = (exp: Parameters<typeof K.exponentText>[0], L: Labels) =>
  esc(K.exponentText(exp, L)).replace(/([A-Za-z])([₀₁₂₃₄₅₆₇₈₉]+)/g, (_m, a: string, d: string) => `<i>${a}</i><sub>${[...d].map((c) => c.charCodeAt(0) - 0x2080).join('')}</sub>`);

/** One factor at address fpath (its word is at wpath, index i). */
function factorEl(f: Term, fpath: number[], o: O): HTMLElement {
  // Book phase C: e with its group (e_K) once two groups are in play
  if (f.k === 'e' && eTag(f)) {
    const n = document.createElement('span');
    n.className = 'bn-f bn-e';
    n.dataset.leaf = 'e';
    // the tag inside the letter: it takes the letter's ink (white on a dark bead, navy on a pale one)
    n.innerHTML = `<span class="bn-disc"><i>e<sub class="bn-sub">${esc(eTag(f)!)}</sub></i></span>`;
    return n;
  }
  // Book phase C: a map frame f(…) — the name, then a frame around the argument(s); argument i is child i
  if (f.k === 'app') {
    const n = document.createElement('span');
    n.className = 'bn-f h3-app';
    const st = styleOfTerm(f);
    if (st) n.style.setProperty('--app-ground', st.fill);
    n.dataset.leaf = `f:${JSON.stringify(f)}`;
    const act = isActionApp(f);
    const fn = document.createElement(act ? 'span' : 'i');
    fn.className = 'h3-app-fn math';
    if (act) {
      // an action applied reads g(p): the group element (its own beads, child 0) names the frame around the point
      const g = f.args[0]!;
      fn.classList.add('h3-app-g');
      const gw = document.createElement('span');
      gw.className = 'bn-word';
      wordInto(gw, g, [...fpath, 0], o);
      if (g.k === 'mul') fn.append('(', gw, ')'); else fn.append(gw);
    } else fn.innerHTML = labelHTML(o.L[f.fn] ?? f.fn.replace(/^\$\d+:/, ''));
    const frame = document.createElement('span');
    frame.className = 'h3-app-frame';
    f.args.forEach((a, i) => {
      if (act && i === 0) return;
      if (i && !act) frame.append(Object.assign(document.createElement('span'), { className: 'h3-app-comma math', textContent: ',' }));
      const w = document.createElement('span');
      w.className = 'bn-word';
      wordInto(w, a, [...fpath, i], o);
      frame.append(w);
    });
    n.title = `${o.L[f.fn] ?? f.fn} applied`;
    n.append(fn, frame);
    return n;
  }
  if (f.k === 'pow') {
    const n = document.createElement('span');
    n.className = 'bn-f h3-pow';
    n.dataset.leaf = `p:${JSON.stringify(f.base)}^${JSON.stringify(f.exp)}`;
    const base = document.createElement('span');
    base.className = 'h3-pow-base bn-word';
    wordInto(base, f.base, [...fpath, 0], o);
    const exp = document.createElement('span');
    exp.className = 'h3-pow-exp math';
    exp.innerHTML = expHTML(f.exp, o.L);
    n.title = `a power stack: ${K.termText(f.base, o.L)} to the ${K.exponentText(f.exp, o.L)}`;
    n.append(base, exp);
    return n;
  }
  if (f.k === 'inv' && hasPow(f.arg)) {
    const n = document.createElement('span');
    n.className = 'bn-f bn-crate';
    const inner = document.createElement('span');
    inner.className = 'bn-word';
    wordInto(inner, f.arg, [...fpath, 0], o);
    const cap = document.createElement('span');
    cap.className = 'bn-cap';
    cap.innerHTML = '<span class="bn-cap-m">−1</span>';
    n.append(inner, cap);
    return n;
  }
  // power-free: v2 draws it; its inner addresses are relative to the factor, so re-root them at fpath
  const one = renderRail(f, { side: o.side, L: o.L, hues: o.hues, sealed: false, src: 'pallet', gaps: o.gaps });
  const el = (one.querySelector('.bn-word-root > .bn-f') as HTMLElement | null) ?? one;
  el.querySelectorAll<HTMLElement>('[data-wpath]').forEach((x) => {
    const rel = x.dataset.wpath ? x.dataset.wpath.split('.').map(Number) : [];
    x.dataset.wpath = key([...fpath, ...rel]);
  });
  return el;
}

/** The word of t at address wpath into container: factors (+ gaps) with exact addresses. */
function wordInto(container: HTMLElement, t: Term, wpath: number[], o: O) {
  const fs = wordOf(t);
  const isMul = t.k === 'mul';
  fs.forEach((f, i) => {
    if (o.gaps) container.append(gapEl(o.side, wpath, i, i === 0));
    const fpath = isMul ? [...wpath, i] : wpath;
    const el = factorEl(f, fpath, o);
    el.dataset.side = o.side; el.dataset.wpath = key(wpath); el.dataset.i = String(isMul ? i : 0);
    container.append(el);
  });
  if (o.gaps) container.append(gapEl(o.side, wpath, fs.length, true));
}

/** A rail (twin-rail row) for any term: v2 rendering when power-free, else the address-exact renderer. */
export function rail(t: Term, o: O): HTMLElement {
  if (!hasPow(t)) return renderRail(t, { side: o.side, L: o.L, hues: o.hues, sealed: false, src: 'pallet', gaps: o.gaps });
  const railEl = document.createElement('div');
  railEl.className = 'bn-rail bn-src-pallet';
  railEl.dataset.side = o.side;
  const word = document.createElement('span');
  word.className = 'bn-word bn-word-root';
  wordInto(word, t, [], o);
  railEl.append(word);
  return railEl;
}

/** Small inline terms (chips, previews, figures), powers included. */
export function beads(t: Term, L: Labels, H: Hues): HTMLElement {
  if (!hasPow(t)) return beadsInline(t, L, H);
  const r = rail(t, { side: 'l', L, hues: H, gaps: false });
  r.classList.add('bn-mini');
  return r;
}
