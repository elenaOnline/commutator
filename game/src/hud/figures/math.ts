// Concept-card figure `math`: laid-out rows of terms and relations. Braces label what changes at a step;
// a struck row (each term crossed out, ✗ reason) is a tempting non-rule. Rows may carry a label in a 104px column.
import type { MathRow } from '../../levels/cards';
import { h } from '../util';
import { mdInline } from './tex';
import { RELS, parseDisplay } from './parse';
import { wordEl, type Letters } from './terms';

export function mathFigure(rows: MathRow[], lt: Letters, caption?: string, bd = 24): HTMLElement {
  const labelled = rows.some((r) => r.label);
  const fig = h('figure', { class: 'cc-fig cc-math' });
  for (const r of rows) {
    let over = false, under = false;
    const line = h('span', { class: `cc-line${r.strike ? ' struck' : ''}`, style: `--bd:${bd}px` });
    for (const x of r.seq) {
      if (typeof x === 'string' && (RELS.includes(x) || x === '⊥')) { line.append(h('span', { class: `cc-rel math${x === ',' ? ' comma' : ''}` }, x)); continue; }
      const src = typeof x === 'string' ? x : x.t;
      const fs = parseDisplay(src, lt.atoms);
      if (!fs) { line.append(h('span', { class: 'cc-fallback math' }, src)); continue; }
      const braces = (typeof x === 'string' ? [] : x.br).map(([from, to, label, side = 'under']) => {
        if (side === 'over') over = true; else under = true;
        return { from, to, side, label };
      });
      line.append(wordEl(fs, lt, bd, braces));
    }
    if (over) line.classList.add('has-over');
    if (under) line.classList.add('has-under');
    const body = h('div', { class: 'cc-rowbody' }, line);
    if (r.why) body.append(h('span', { class: `cc-why${r.strike ? ' no' : ''}`, html: `${r.strike ? '<b aria-hidden="true">✗</b> ' : ''}${mdInline(r.why)}` }));
    fig.append(labelled ? h('div', { class: 'cc-row labelled' }, h('span', { class: 'cc-rowlabel' }, r.label ?? ''), body) : h('div', { class: 'cc-row' }, body));
  }
  if (caption) fig.append(h('figcaption', { class: 'cc-cap', html: mdInline(caption) }));
  return fig;
}
