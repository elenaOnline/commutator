// COMMUTATOR v4 — concept cards: a calm card stack over the floor at level open (never over the hotbar),
// pages, figures (ℤₙ clock, a group's table, Cayley graph, bead strings), and the worked example /
// near-miss / gesture structure (Astra v4 §5). Reopened from the order chip's "?" or from a lens / jam.
import * as K from '../kernel';
import { CARDS, type ConceptCard, type Figure } from '../levels/cards';
import { catalogue, type FiniteGroup } from '../groups';
import { beads as beadsInline } from './beads';
import { esc, h, hues, labels, safe, type S, type Store } from './util';

// ───────── TeX-ish maths ($…$) → HTML ─────────
const SYM: Record<string, string> = {
  forall: '∀', Rightarrow: '⇒', neq: '≠', bot: '⊥', in: '∈', geq: '≥', leq: '≤', langle: '⟨', rangle: '⟩', dots: '…', ldots: '…', cdot: '·',
  ';': '&thinsp;', ',': '&thinsp;', quad: '&emsp;', qquad: '&emsp;&emsp;', mid: '|', to: '→', mapsto: '↦', exists: '∃', neg: '¬', times: '×',
};
export function texHTML(src: string): string {
  let i = 0;
  const group = (): string => {
    if (src[i] === '{') {
      i++; let depth = 1, start = i;
      while (i < src.length && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++; }
      return conv(src.slice(start, i - 1));
    }
    const c = src[i++] ?? '';
    return /[A-Za-z]/.test(c) ? `<i>${c}</i>` : esc(c);
  };
  const conv = (t: string): string => {
    const save = src, si = i;
    src = t; i = 0;
    let out = '';
    while (i < src.length) {
      const c = src[i]!;
      if (c === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
        const name = m?.[1] ?? '';
        i += 1 + name.length;
        if (name === 'mathbb') { const g = group().replace(/<\/?i>/g, ''); out += g === 'Z' ? 'ℤ' : g === 'N' ? 'ℕ' : g; continue; }
        out += SYM[name] !== undefined ? (/[⇒≠∈≥≤→↦×]/.test(SYM[name]!) ? ` <span class="m-rel">${SYM[name]}</span> ` : SYM[name]) : esc(name);
      } else if (c === '^') { i++; out += `<sup class="m-sup">${group()}</sup>`; }
      else if (c === '_') { i++; out += `<sub class="m-sub">${group()}</sub>`; }
      else if (c === '=' ) { i++; out += ' <span class="m-rel">=</span> '; }
      else if (/[A-Za-z]/.test(c)) { i++; out += `<i>${c}</i>`; }
      else if (c === '-' && src[i + 1] && /\d/.test(src[i + 1]!)) { i++; out += '−'; }
      else if (c === '{' || c === '}') { i++; }
      else { i++; out += esc(c); }
    }
    src = save; i = si;
    return out;
  };
  return `<span class="math">${conv(src)}</span>`;
}
/** Minimal markdown: **bold**, *italic*, $maths$, paragraphs. */
export function mdHTML(md: string): string {
  const parts = md.split(/(\$[^$]+\$)/g);
  const html = parts.map((p) => {
    if (p.startsWith('$') && p.endsWith('$') && p.length > 1) return texHTML(p.slice(1, -1));
    return esc(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }).join('');
  return html.split(/\n{2,}/).map((x) => `<p>${x}</p>`).join('');
}

// ───────── figures ─────────
const groupByName = (name: string): FiniteGroup | undefined => safe(() => catalogue(), [] as FiniteGroup[]).find((g) => g.name === name || g.name.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080)) === name);
function clockSVG(n: number): string {
  const R = 64, c = 84;
  let s = `<svg class="cf-clock" viewBox="0 0 168 168" width="168" height="168" aria-label="ℤ${n} as a clock"><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="#D5D8E0" stroke-width="1.5"/>`;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n, x = c + R * Math.cos(a), y = c + R * Math.sin(a);
    const a2 = -Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / n;
    s += `<path d="M${c + (R - 12) * Math.cos(a2 - 0.12)},${c + (R - 12) * Math.sin(a2 - 0.12)} L${c + (R - 6) * Math.cos(a2)},${c + (R - 6) * Math.sin(a2)} L${c + (R - 12) * Math.cos(a2 + 0.12)},${c + (R - 12) * Math.sin(a2 + 0.12)}" fill="none" stroke="#2F6BFF" stroke-width="1.5"/>`;
    s += `<circle cx="${x}" cy="${y}" r="13" fill="${k === 0 ? '#FFB81C' : '#1B2340'}"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Latin Modern, serif" font-size="15" fill="${k === 0 ? '#1B2340' : '#fff'}">${k}</text>`;
  }
  return s + `<text x="${c}" y="${c + 5}" text-anchor="middle" font-family="Latin Modern, serif" font-style="italic" font-size="13" fill="#545B73">+1 each step</text></svg>`;
}
function tableHTML(G: FiniteGroup): string {
  const n = G.order;
  let s = `<table class="cf-table"><caption>${esc(G.name)}: row combined with column</caption><tr><th class="op">·</th>${G.labels.map((l) => `<th>${esc(l)}</th>`).join('')}</tr>`;
  for (let i = 0; i < n; i++) s += `<tr><th>${esc(G.labels[i]!)}</th>${Array.from({ length: n }, (_, j) => { const k = G.mul(i, j); return `<td class="${k === 0 ? 'id' : ''}">${esc(G.labels[k]!)}</td>`; }).join('')}</tr>`;
  return s + '</table>';
}
function cayleySVG(G: FiniteGroup, gens: string[]): string {
  const n = G.order, R = 70, c = 92;
  const pos = (k: number) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / n; return [c + R * Math.cos(a), c + R * Math.sin(a)] as const; };
  const styles = ['stroke="#1B2340"', 'stroke="#1B2340" stroke-dasharray="4 3"', 'stroke="#8A90A3"'];
  let s = `<svg class="cf-cayley" viewBox="0 0 184 184" width="184" height="184"><defs><marker id="cfa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#1B2340"/></marker></defs>`;
  gens.forEach((gl, gi) => {
    const g = G.labels.indexOf(gl); if (g < 0) return;
    for (let k = 0; k < n; k++) { const t = G.mul(k, g); if (t === k) continue; const [x1, y1] = pos(k), [x2, y2] = pos(t); const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1; s += `<line x1="${x1 + dx / d * 12}" y1="${y1 + dy / d * 12}" x2="${x2 - dx / d * 13}" y2="${y2 - dy / d * 13}" ${styles[gi % 3]} stroke-width="1.4" marker-end="url(#cfa)"/>`; }
  });
  for (let k = 0; k < n; k++) { const [x, y] = pos(k); s += `<circle cx="${x}" cy="${y}" r="11" fill="${k === 0 ? '#FFB81C' : '#fff'}" stroke="#1B2340"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="Latin Modern, serif" font-size="11" fill="#1B2340">${esc(G.labels[k]!)}</text>`; }
  return s + `</svg><div class="cf-legend">${gens.map((g, i) => `<span><i class="cf-line s${i}"></i>· ${esc(g)}</span>`).join('')}</div>`;
}
function figureEl(s: S, f: Figure): HTMLElement | null {
  const box = h('figure', { class: `cf-figure ${f.k}` });
  if (f.k === 'clock') box.innerHTML = clockSVG(f.n) + `<figcaption>ℤ<sub>${f.n}</sub>: adding 1 goes round the clock</figcaption>`;
  else if (f.k === 'table') { const G = groupByName(f.group); if (!G) return null; box.innerHTML = tableHTML(G); }
  else if (f.k === 'cayley') { const G = groupByName(f.group); if (!G) return null; box.innerHTML = cayleySVG(G, f.gens) + `<figcaption>${esc(G.name)}: an arrow for each step “multiply by a generator”</figcaption>`; }
  else if (f.k === 'beads') {
    const L = labels(s.level), H = hues(s.level);
    for (const t of f.terms) {
      const r = safe(() => K.parseTerm(t, s.level.atoms), { ok: false as const, error: '' });
      if (r.ok) box.append(h('div', { class: 'cf-beads' }, beadsInline(r.term, L, H)));
    }
    if (!box.childElementCount) return null;
  }
  return box;
}

export const cardsFor = (levelId: string): ConceptCard[] => (CARDS as Record<string, ConceptCard[] | undefined>)[levelId] ?? [];

/** Open the current level's card that best explains a machine kind / word (jam and lens "?" links). */
export function openConceptFor(store: Store, kindOrWord: string, text?: string) {
  const cs = cardsFor(store.get().level.id);
  if (!cs.length) return;
  const w = kindOrWord.toLowerCase();
  let i = cs.findIndex((c) => c.machines?.some((m) => m === w || m.startsWith(`${w}:`)));
  if (i < 0) i = cs.findIndex((c) => `${c.title} ${c.body}`.toLowerCase().includes(w));
  if (i < 0 && text) { const t = text.toLowerCase(); i = cs.findIndex((c) => c.title.toLowerCase().split(/\W+/).some((x) => x.length > 4 && t.includes(x))); }
  store.openCards(Math.max(0, i));
}

export function mountConcepts(layer: HTMLElement, store: Store) {
  const el = h('section', { class: 'h3-cards', hidden: true, role: 'dialog', 'aria-label': 'Concept cards' });
  layer.append(el);
  let lastKey = '';
  const render = (s: S) => {
    const cs = cardsFor(s.level.id);
    const open = s.ui.screen === 'floor' && !!s.ui.cards?.open && cs.length > 0 && !s.ui.ceremony;
    if (!open) { if (!el.hidden) { el.hidden = true; lastKey = ''; } return; }
    const page = Math.max(0, Math.min(cs.length - 1, s.ui.cards.page));
    const key = `${s.level.id}|${page}`;
    el.hidden = false;
    if (key === lastKey) return;
    lastKey = key;
    const c = cs[page]!;
    el.innerHTML = '';
    const close = h('button', { class: 'h3-x', 'aria-label': 'Close the cards (Esc)' }, '×');
    close.addEventListener('click', () => store.closeCards());
    el.append(h('header', { class: 'cf-head' }, h('span', { class: 'h3-label' }, `${s.level.index} · ${s.level.title}`), h('span', { class: 'h3-flex' }), h('span', { class: 'cf-count' }, `${page + 1} / ${cs.length}`), close));
    el.append(h('h2', { class: 'cf-title' }, c.title));
    const main = h('div', { class: 'cf-main' }, h('div', { class: 'cf-body', html: mdHTML(c.body) }));
    if (c.figure) { const f = figureEl(s, c.figure); if (f) main.append(f); }
    el.append(main);
    const parts: [string, string | undefined, string][] = [['Worked example', c.example, 'ex'], ['Near miss', c.nearMiss, 'nm'], ['On the floor', c.gesture, 'ge']];
    const extra = h('div', { class: 'cf-parts' });
    for (const [label, text, cls] of parts) if (text) extra.append(h('div', { class: `cf-part ${cls}` }, h('span', { class: 'cf-part-k' }, label), h('div', { html: mdHTML(text) })));
    if (extra.childElementCount) el.append(extra);
    const prev = h('button', { class: 'lw-key small', disabled: page === 0 }, '← Back');
    const next = h('button', { class: 'lw-key small primary' }, page < cs.length - 1 ? 'Next →' : 'Start building');
    prev.addEventListener('click', () => store.setCardPage(page - 1));
    next.addEventListener('click', () => (page < cs.length - 1 ? store.setCardPage(page + 1) : store.closeCards()));
    const dots = h('span', { class: 'cf-dots' });
    cs.forEach((_, i) => { const d = h('button', { class: `cf-dot${i === page ? ' on' : ''}`, 'aria-label': `card ${i + 1}` }); d.addEventListener('click', () => store.setCardPage(i)); dots.append(d); });
    el.append(h('footer', { class: 'cf-foot' }, prev, dots, h('span', { class: 'h3-flex' }), h('span', { class: 'h3-dim' }, 'Enter or Esc closes · ← → pages'), next));
  };
  // While open: Esc / Enter close, arrows page. Everything else (Q, hotkeys) passes to the floor.
  window.addEventListener('keydown', (e) => {
    if (el.hidden) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('input, textarea')) return;
    const s = store.get();
    const n = cardsFor(s.level.id).length;
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); store.closeCards(); }
    else if (e.key === 'ArrowRight' && s.ui.cards.page < n - 1) { e.preventDefault(); e.stopImmediatePropagation(); store.setCardPage(s.ui.cards.page + 1); }
    else if (e.key === 'ArrowLeft' && s.ui.cards.page > 0) { e.preventDefault(); e.stopImmediatePropagation(); store.setCardPage(s.ui.cards.page - 1); }
  }, true);
  return { render, el };
}
