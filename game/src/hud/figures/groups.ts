// Concept-card figures from the group catalogue: ℤₙ as a clock, a multiplication table, element orders.
import { catalogue, type FiniteGroup } from '../../groups';
import { esc, h, safe } from '../util';

export const groupByName = (name: string): FiniteGroup | undefined =>
  safe(() => catalogue(), [] as FiniteGroup[]).find((g) => g.name === name || g.name.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080)) === name);

/** The order of element k: the least n ≥ 1 with kⁿ = e. */
export function orderOf(G: FiniteGroup, k: number): number {
  let x = k, n = 1;
  while (x !== 0 && n <= G.order) { x = G.mul(x, k); n++; }
  return n;
}

export function clockFigure(n: number): HTMLElement {
  const R = 64, c = 84;
  let s = `<svg class="cc-clock" viewBox="0 0 168 168" width="168" height="168" aria-label="ℤ${n} as a clock"><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="#D5D8E0" stroke-width="1.5"/>`;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n, x = c + R * Math.cos(a), y = c + R * Math.sin(a);
    const a2 = -Math.PI / 2 + (2 * Math.PI * (k + 0.5)) / n;
    s += `<path d="M${c + (R - 12) * Math.cos(a2 - 0.12)},${c + (R - 12) * Math.sin(a2 - 0.12)} L${c + (R - 6) * Math.cos(a2)},${c + (R - 6) * Math.sin(a2)} L${c + (R - 12) * Math.cos(a2 + 0.12)},${c + (R - 12) * Math.sin(a2 + 0.12)}" fill="none" stroke="#2F6BFF" stroke-width="1.5"/>`;
    s += `<circle cx="${x}" cy="${y}" r="13" fill="${k === 0 ? '#FFB81C' : '#1B2340'}"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Latin Modern, serif" font-size="15" fill="${k === 0 ? '#1B2340' : '#fff'}">${k}</text>`;
  }
  s += `<text x="${c}" y="${c + 5}" text-anchor="middle" font-family="Latin Modern, serif" font-style="italic" font-size="13" fill="#545B73">+1 each step</text></svg>`;
  return h('figure', { class: 'cc-fig cc-box', html: `${s}<figcaption class="cc-cap">ℤ<sub>${n}</sub>: adding 1 moves one hour round the clock</figcaption>` });
}

export function tableFigure(G: FiniteGroup): HTMLElement {
  let s = `<table class="cc-table"><caption>${esc(G.name)}: row combined with column</caption><tr><th>·</th>${G.labels.map((l) => `<th>${esc(l)}</th>`).join('')}</tr>`;
  for (let i = 0; i < G.order; i++) {
    s += `<tr><th>${esc(G.labels[i]!)}</th>${G.labels.map((_, j) => { const k = G.mul(i, j); return `<td${k === 0 ? ' class="id"' : ''}>${esc(G.labels[k]!)}</td>`; }).join('')}</tr>`;
  }
  return h('figure', { class: 'cc-fig cc-box', html: `${s}</table>` });
}

/** Each element's order in two rows (Lagrange: every order divides |G|). */
export function ordersFigure(G: FiniteGroup): HTMLElement {
  const row = (k: string, cells: string[], cls = '') => `<tr><th>${k}</th>${cells.map((x) => `<td${cls}>${esc(x)}</td>`).join('')}</tr>`;
  return h('figure', {
    class: 'cc-fig cc-orders',
    html: `<table class="cc-otable">${row('element', G.labels)}${row('order', G.labels.map((_, i) => String(orderOf(G, i))), ' class="o"')}</table>` +
      `<figcaption class="cc-cap">In ${esc(G.name)}, |<i>G</i>| = ${G.order}. Every order divides ${G.order}.</figcaption>`,
  });
}
