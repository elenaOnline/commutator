// LEMMA WORKS — shared math typesetting to HTML (Latin Modern). Architect-owned.
// Independent of kernel bodies so every surface can use it immediately.
import type { Fact, Term } from '../kernel/types';

export type Labels = Record<string, string>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const sup = (s: string) => `<sup class="m-sup">${s}</sup>`;
const MINUS = '−';

function sameTerm(a: Term, b: Term): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** Word of a term (flat factors). */
const wordOf = (t: Term): Term[] => (t.k === 'mul' ? t.fs : [t]);

/** HTML for a term. Runs of ≥ minRun identical single factors compress to a power. */
export function termHTML(t: Term, L: Labels, opts: { minRun?: number } = {}): string {
  const minRun = opts.minRun ?? 3;
  const atomHTML = (t: Term): string => {
    switch (t.k) {
      case 'atom': return `<i class="m-atom">${esc(L[t.id] ?? t.id)}</i>`;
      case 'meta': return `<i class="m-meta">${esc(t.id)}</i>`;
      case 'e': return `<i class="m-e">e</i>`;
      case 'inv': {
        const a = t.arg;
        const simple = a.k === 'atom' || a.k === 'meta' || a.k === 'e';
        return simple ? `${atomHTML(a)}${sup(MINUS + '1')}` : `(${termHTML(a, L, opts)})${sup(MINUS + '1')}`;
      }
      case 'mul': return termHTML(t, L, opts);
    }
  };
  if (t.k !== 'mul') return atomHTML(t);
  const fs = wordOf(t);
  let out = '';
  for (let i = 0; i < fs.length;) {
    let j = i + 1;
    while (j < fs.length && sameTerm(fs[j]!, fs[i]!)) j++;
    const run = j - i;
    const f = fs[i]!;
    if (run >= minRun && (f.k === 'atom' || f.k === 'meta' || f.k === 'e')) { out += `${atomHTML(f)}${sup(String(run))}`; i = j; continue; }
    if (run >= minRun && f.k === 'inv' && (f.arg.k === 'atom' || f.arg.k === 'e')) { out += `${atomHTML(f.arg)}${sup(MINUS + run)}`; i = j; continue; }
    out += atomHTML(f); i++;
  }
  return out;
}

export function factHTML(f: Fact, L: Labels): string {
  switch (f.k) {
    case 'eq': return `${termHTML(f.l, L)} <span class="m-rel">=</span> ${termHTML(f.r, L)}`;
    case 'neq': return `${termHTML(f.l, L)} <span class="m-rel">≠</span> ${termHTML(f.r, L)}`;
    case 'bot': return `<span class="m-rel">⊥</span>`;
    case 'size': return `|<i>G</i>| <span class="m-rel">=</span> ${f.n}`;
    case 'law': return `${f.metas.length ? `∀${f.metas.map((m) => `<i>${m}</i>`).join(', ')}.&ensp;` : ''}${termHTML(f.l, L)} <span class="m-rel">=</span> ${termHTML(f.r, L)}`;
    case 'cond': {
      const prem = f.premises.map((p) => factHTML(p, L)).join(', ');
      return `${f.metas.length ? `∀${f.metas.map((m) => `<i>${m}</i>`).join(', ')}.&ensp;` : ''}${prem} <span class="m-rel">⇒</span> ${factHTML(f.concl, L)}`;
    }
  }
}

/** CSS to include once (any surface may inject it). */
export const MATH_CSS = `
.m-sup { font-size: .68em; vertical-align: .62em; line-height: 0; margin-left: .04em; font-style: normal; }
.m-atom, .m-meta, .m-e { font-style: italic; }
.m-rel { font-style: normal; margin: 0 .12em; }
`;
