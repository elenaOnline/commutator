// LEMMA WORKS — bead rendering for the bench (front-facing rails, crates, gaps).
// Owner: bench builder.
import type { Side, Term } from '../kernel/types';
import { type DiffItem, type Labels, factorPath, pathKey, sig, wordOf } from './util';
import { beadSVG } from './shapes';

/** AtomId → palette slot (AtomDecl.hue), which picks the bead shape. */
export type Hues = Record<string, number>;

export interface RailOpts {
  side: Side;
  L: Labels;
  /** Atom → shape slot. */
  hues?: Hues;
  /** Inverse crates are padlocked until the Sock Drawer is available. */
  sealed: boolean;
  /** Where the beads live: the active pallet, the goal ghost, or a chip/preview. */
  src: 'pallet' | 'ghost' | 'chip' | 'result';
  /** Render insertion gaps (pallet only). */
  gaps: boolean;
  /** Top-level morph preview (keep/del/ins). Display only. */
  diff?: DiffItem[];
  /** Ink of the previewed offer's family (for inserted beads). */
  ink?: string;
}

const LOCK_SVG = '<svg class="bn-lock" viewBox="0 0 12 14" aria-hidden="true"><path d="M3 6V4.2a3 3 0 0 1 6 0V6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1.2" y="6" width="9.6" height="7" rx="1.6" fill="currentColor"/></svg>';
export const SEALED_TIP = 'Sealed — you haven’t proven what’s inside yet';

function esc(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }

function leafSig(t: Term): string {
  switch (t.k) {
    case 'atom': return `a:${t.id}`;
    case 'e': return 'e';
    case 'meta': return `m:${t.id}`;
    case 'inv': return `i:${sig(t.arg)}`;
    case 'mul': return 'mul';
    case 'pow': return `p:${sig(t.base)}^${JSON.stringify(t.exp)}`;
    case 'int': return `z:${JSON.stringify(t.val)}`;
    case 'app': return `f:${t.fn}(${t.args.map(sig).join(',')})`; // Book phase C (legacy bench: compile-only fallback)
  }
}

function el(tag: string, cls: string, html = ''): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  if (html) n.innerHTML = html;
  return n;
}

function gapEl(side: Side, wpath: number[], gap: number, end: boolean): HTMLElement {
  const g = el('span', `bn-gap${end ? ' bn-gap-end' : ''}`);
  g.dataset.side = side; g.dataset.wpath = pathKey(wpath); g.dataset.gap = String(gap);
  g.title = 'Insert something equal to e here (double-click: insert e)';
  return g;
}

/**
 * A term label as HTML, with a Tower's subscript drawn as a real subscript: 'x₁₂' (or 'x12') → x<sub>12</sub>.
 * Latin Modern has no subscript digits, so the Unicode form would fall back to another font.
 */
export function labelHTML(label: string): string {
  const m = /^(.*?[^\d₀-₉])([0-9₀-₉]+)$/.exec(label);
  if (!m) return esc(label);
  const digits = [...m[2]!].map((c) => (c >= '₀' && c <= '₉' ? String(c.charCodeAt(0) - 0x2080) : c)).join('');
  return `${esc(m[1]!)}<sub class="bn-sub">${digits}</sub>`;
}

/** A single factor (bead, hollow bead, e chip, or crate). */
function factorEl(f: Term, o: RailOpts, wpath: number[] | null, i: number, fpath: number[] | null): HTMLElement {
  const tag = (n: HTMLElement) => {
    if (wpath) { n.dataset.side = o.side; n.dataset.wpath = pathKey(wpath); n.dataset.i = String(i); }
    return n;
  };
  const hue = (a: Term) => (a.k === 'atom' ? o.hues?.[a.id] ?? 0 : 0);
  const lab = (a: Term) => labelHTML(a.k === 'atom' ? (o.L[a.id] ?? a.id) : a.k === 'meta' ? a.id : '');
  if (f.k === 'atom' || f.k === 'meta') {
    const n = el('span', `bn-f bn-atom${f.k === 'meta' ? ' bn-meta' : ''}`, `<span class="bn-disc">${beadSVG(hue(f), false)}<i>${lab(f)}</i></span>`);
    n.dataset.leaf = leafSig(f);
    return tag(n);
  }
  if (f.k === 'e') {
    const n = el('span', 'bn-f bn-e', '<span class="bn-disc"><i>e</i></span>');
    n.dataset.leaf = 'e';
    return tag(n);
  }
  if (f.k === 'inv' && (f.arg.k === 'atom' || f.arg.k === 'meta')) {
    const a = f.arg;
    const n = el('span', 'bn-f bn-inv', `<span class="bn-disc">${beadSVG(hue(a), true)}<i>${lab(a)}</i></span><span class="bn-sup">\u22121</span>`);
    n.dataset.leaf = leafSig(f);
    return tag(n);
  }
  if (f.k === 'inv') {
    // the crate: a blue field around its beads, a ⁻¹ cap, and a padlock while sealed
    const n = el('span', `bn-f bn-crate${o.sealed ? ' is-sealed' : ''}`);
    n.dataset.crate = `c:${sig(f)}`;
    const inner = el('span', 'bn-word');
    const argPath = fpath ? [...fpath, 0] : null;
    renderWordInto(inner, f.arg, argPath, o);
    n.append(el('span', 'bn-paren bn-paren-l', '('), inner, el('span', 'bn-paren bn-paren-r', ')'));
    const cap = el('span', 'bn-cap', `<span class="bn-cap-m">−1</span>${o.sealed ? LOCK_SVG : ''}`);
    cap.title = o.sealed ? SEALED_TIP : 'Inverse crate';
    n.append(cap);
    if (o.sealed) n.title = SEALED_TIP;
    return tag(n);
  }
  // a bare mul as a factor cannot occur in a normalized word; render its word inline
  const n = el('span', 'bn-word');
  renderWordInto(n, f, fpath, o);
  return n;
}

function renderWordInto(container: HTMLElement, wt: Term, wpath: number[] | null, o: RailOpts) {
  const fs = wordOf(wt);
  const gaps = o.gaps && wpath !== null;
  fs.forEach((f, i) => {
    if (gaps) container.append(gapEl(o.side, wpath!, i, i === 0));
    container.append(factorEl(f, o, wpath, i, wpath ? factorPath(wt, wpath, i) : null));
  });
  if (gaps) container.append(gapEl(o.side, wpath!, fs.length, true));
}

/** Render one rail. With o.diff it renders the merged morph preview (display only). */
export function renderRail(t: Term, o: RailOpts): HTMLElement {
  const rail = el('div', `bn-rail bn-src-${o.src}`);
  rail.dataset.side = o.side;
  const word = el('span', 'bn-word bn-word-root');
  if (o.diff) {
    for (const d of o.diff) {
      const f = factorEl(d.t, { ...o, gaps: false }, null, 0, null);
      if (d.op !== 'keep') f.classList.add(d.op === 'del' ? 'is-del' : 'is-ins');
      if (d.op === 'ins' && o.ink) f.style.setProperty('--ins-ink', o.ink);
      word.append(f);
    }
  } else {
    renderWordInto(word, t, o.src === 'chip' || o.src === 'result' ? null : [], o);
  }
  rail.append(word);
  return rail;
}

/** Small inline bead string (chips, entry previews). */
export function beadsInline(t: Term, L: Labels, hues: Hues = {}, sealed = false): HTMLElement {
  const r = renderRail(t, { side: 'l', L, hues, sealed, src: 'chip', gaps: false });
  r.classList.add('bn-mini');
  return r;
}
